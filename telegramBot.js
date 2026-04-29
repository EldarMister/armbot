require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { findKontejner, formatStatus, loadSheetFresh, WATCHABLE_FIELDS } = require('./sheets');
const { getContainerFiles, downloadFile } = require('./drive');
const {
  ROLI, ROL_LABELS,
  getRol, getInfo, setRol,
  udalitPolzovatelya, spisokPolzovateley,
  isAdmin, canSeeDocs,
} = require('./telegramUsers');
const db = require('./telegramDb');
const { extractContainerNumber, getEnv, normalizeContainerKey } = require('./env');

const bot = new TelegramBot(getEnv('TELEGRAM_BOT_TOKEN'), { polling: true });

const userState = new Map();
const ozhidaemyeImena = new Map();

// ─── Постоянная клавиатура (панель снизу) ────────────────────────────────────

async function getKlavish(chatId) {
  const [hasDocsAccess, adminAccess] = await Promise.all([
    canSeeDocs(chatId),
    isAdmin(chatId),
  ]);
  const ryad1 = [{ text: '📦 Статус' }];
  if (hasDocsAccess) ryad1.push({ text: '📄 Документы' });

  const keys = [ryad1];
  if (adminAccess) keys.push([{ text: '👥 Пользователи' }]);
  keys.push([{ text: '❌ Отписаться' }]);

  return { keyboard: keys, resize_keyboard: true, is_persistent: true };
}

async function sendWelcome(chatId) {
  const [hasDocsAccess, adminAccess] = await Promise.all([
    canSeeDocs(chatId),
    isAdmin(chatId),
  ]);
  let text =
    '👋 *Добро пожаловать в ARM SHORING*\n\n' +
    'Мы обеспечиваем надёжную доставку автомобилей из Южной Кореи в страны Центральной Азии.\n\n' +
    '🚢 Корея → Кыргызстан / Казахстан\n\n' +
    'Доступные действия:\n' +
    '• 📦 *Статус* — узнать местонахождение контейнера\n';
  if (hasDocsAccess) text += '• 📄 *Документы* — получить файлы по контейнеру\n';
  if (adminAccess) text += '• 👥 *Пользователи* — управление доступом\n';

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: await getKlavish(chatId),
  });
}

// ─── Документы из Google Drive ───────────────────────────────────────────────

async function sendDocs(chatId, containerNomer) {
  const key = extractContainerNumber(containerNomer) || containerNomer.trim();
  try {
    const files = await getContainerFiles(containerNomer);
    if (files === null) {
      await bot.sendMessage(chatId,
        `📁 Папка для контейнера \`${key}\` не найдена.\n\nВозможно, документы ещё не загружены.`,
        { parse_mode: 'Markdown' });
      return;
    }
    if (files.length === 0) {
      await bot.sendMessage(chatId,
        `📂 Папка контейнера \`${key}\` пуста — документы ещё не загружены.`,
        { parse_mode: 'Markdown' });
      return;
    }
    await bot.sendMessage(chatId,
      `📄 Документы по контейнеру \`${key}\` — ${files.length} файл(ов):`,
      { parse_mode: 'Markdown' });
    for (const file of files) {
      try {
        const stream = await downloadFile(file.id);
        await bot.sendDocument(chatId, stream, {}, {
          filename: file.name,
          contentType: file.mimeType || 'application/octet-stream',
        });
      } catch (err) {
        console.error(`sendDocument (${file.name}):`, err.message);
        await bot.sendMessage(chatId, `⚠️ Не удалось отправить: ${file.path || file.name}`);
      }
    }
  } catch (err) {
    console.error('sendDocs error:', err.message);
    await bot.sendMessage(chatId, '⚠️ Не удалось получить документы. Попробуйте позже.');
  }
}

// ─── Проверка обновлений каждые 5 минут ─────────────────────────────────────

async function checkForUpdates() {
  const summary = {
    subscriptions: 0,
    changed: 0,
    sent: 0,
    failed: 0,
    missing: 0,
  };

  try {
    const subs = await db.getVseSubscriptions();
    summary.subscriptions = subs.length;
    if (subs.length === 0) return summary;
    const rows = await loadSheetFresh();
    for (const sub of subs) {
      const key = extractContainerNumber(sub.container) || normalizeContainerKey(sub.container);
      const newRow = rows.find(r => extractContainerNumber(r[0]) === key);
      if (!newRow) {
        summary.missing += 1;
        continue;
      }

      const oldSnap = Array.isArray(sub.snapshot) ? sub.snapshot : [];
      const izmeneniya = [];
      for (const { idx, label } of WATCHABLE_FIELDS) {
        const oldVal = oldSnap[idx] != null ? String(oldSnap[idx]).trim() : '';
        const newVal = newRow[idx] != null ? String(newRow[idx]).trim() : '';
        if (oldVal !== newVal) izmeneniya.push(`${label}: ${oldVal || '—'} → ${newVal || '—'}`);
      }
      if (izmeneniya.length === 0) continue;
      summary.changed += 1;

      const lastUpdatedAt = new Date().toISOString();

      const text =
        `🔔 *Обновление по контейнеру* \`${key}\`\n\n` +
        `*Изменения:*\n${izmeneniya.join('\n')}\n\n` +
        `*Актуальный статус:*\n${formatStatus(newRow, lastUpdatedAt)}`;

      let sentCount = 0;
      for (const cid of sub.chat_ids) {
        try {
          await bot.sendMessage(cid, text, { parse_mode: 'Markdown' });
          sentCount += 1;
          summary.sent += 1;
        } catch (err) {
          summary.failed += 1;
          console.error(`notify ${cid}:`, err.message);
        }
      }

      if (sentCount > 0) {
        await db.obnovitSnapshot(sub.container, newRow, lastUpdatedAt);
      }
    }
  } catch (err) {
    summary.failed += 1;
    console.error('checkForUpdates error:', err.message);
  }

  return summary;
}

setInterval(checkForUpdates, 5 * 60 * 1000);

// ─── Админ: панель управления пользователями (inline) ────────────────────────

async function pokazatAdminMenu(chatId) {
  await bot.sendMessage(chatId, '👥 *Управление пользователями*\n\nВыберите действие:', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📋 Список пользователей', callback_data: 'admin_list' }],
        [{ text: '➕ Добавить пользователя', callback_data: 'admin_add'  }],
      ],
    },
  });
}

async function pokazatSpisok(chatId) {
  const spisok = await spisokPolzovateley();
  if (spisok.length === 0) {
    await bot.sendMessage(chatId, 'Список пуст. Нажмите «➕ Добавить пользователя».');
    return;
  }
  let text = '📋 *Список пользователей*\n\n';
  const buttons = [];
  for (const u of spisok) {
    const display = u.username ? `@${u.username}` : u.chat_id;
    const imya = u.name ? ` — ${u.name}` : '';
    text += `${ROL_LABELS[u.role]}  \`${display}\`${imya}\n`;
    buttons.push([
      { text: `✏️ ${display}`, callback_data: `u_edit:${u.chat_id}` },
      { text: `🗑️ ${display}`, callback_data: `u_del:${u.chat_id}`  },
    ]);
  }
  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons },
  });
}

function knopkiRolej(targetId) {
  return {
    inline_keyboard: [
      [
        { text: '👤 User',  callback_data: `u_setrole:${targetId}:user`  },
        { text: '👔 Staff', callback_data: `u_setrole:${targetId}:staff` },
        { text: '👑 Admin', callback_data: `u_setrole:${targetId}:admin` },
      ],
      [{ text: '❌ Отмена', callback_data: 'noop' }],
    ],
  };
}

// ─── Команды ─────────────────────────────────────────────────────────────────

bot.onText(/^\/start$/, async (msg) => {
  const username = msg.from?.username || null;
  const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || null;
  db.updateUserInfo(msg.chat.id, username, name).catch(() => {});
  userState.set(msg.chat.id, 'idle');
  await sendWelcome(msg.chat.id);
});

bot.onText(/^\/myid$/, async (msg) => {
  const rol = await getRol(msg.chat.id);
  await bot.sendMessage(msg.chat.id,
    `Ваш Telegram ID: \`${msg.chat.id}\`\nРоль: ${ROL_LABELS[rol] || rol}`,
    { parse_mode: 'Markdown' });
});

bot.onText(/^\/debug (.+)$/, async (msg, match) => {
  if (!await isAdmin(msg.chat.id)) return;
  const nomer = match[1].trim();
  try {
    const rows = await loadSheetFresh();
    const target = extractContainerNumber(nomer) || normalizeContainerKey(nomer);
    const row = rows.find(r => {
      const rowContainer = extractContainerNumber(r[0]);
      return rowContainer ? rowContainer === target : normalizeContainerKey(r[0]) === target;
    });
    if (!row) { await bot.sendMessage(msg.chat.id, `❌ Контейнер ${nomer} не найден`); return; }
    let text = `🔍 Колонки для *${nomer}*:\n\n`;
    row.forEach((val, i) => { text += `\`[${i}]\`: ${val || '_(пусто)_'}\n`; });
    await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
  } catch (err) {
    await bot.sendMessage(msg.chat.id, `Ошибка: ${err.message}`);
  }
});

bot.onText(/^\/unsubscribe$/, async (msg) => {
  const count = await db.otpisatVsex(msg.chat.id);
  await bot.sendMessage(msg.chat.id,
    count > 0
      ? `✅ Вы отписались от обновлений по ${count} контейнер(ам).`
      : `ℹ️ У вас нет активных подписок.`
  );
});

// ─── Inline callback (только для админ-панели) ────────────────────────────────

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data || '';
  await bot.answerCallbackQuery(query.id).catch(() => {});

  if (data === 'noop') return;

  if (!await isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Недоступно.');
    return;
  }

  if (data === 'admin_list') { await pokazatSpisok(chatId); return; }

  if (data === 'admin_add') {
    userState.set(chatId, 'wait_new_user_id');
    await bot.sendMessage(chatId,
      '➕ *Добавление пользователя*\n\n' +
      'Отправьте Telegram ID нового пользователя (только цифры),\n' +
      'или перешлите сюда любое его сообщение — имя подхватится автоматически.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (data.startsWith('u_edit:')) {
    const targetId = data.split(':')[1];
    const info = await getInfo(targetId);
    const imya = info?.name ? ` (${info.name})` : '';
    await bot.sendMessage(chatId,
      `✏️ Новая роль для \`${targetId}\`${imya}:`,
      { parse_mode: 'Markdown', reply_markup: knopkiRolej(targetId) }
    );
    return;
  }

  if (data.startsWith('u_del:')) {
    const targetId = data.split(':')[1];
    if (String(targetId) === String(getEnv('INITIAL_ADMIN_ID'))) {
      await bot.sendMessage(chatId, '🚫 Главного админа удалить нельзя.');
      return;
    }
    const info = await getInfo(targetId);
    const imya = info?.name ? ` (${info.name})` : '';
    await bot.sendMessage(chatId,
      `🗑️ Удалить \`${targetId}\`${imya}?`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[
          { text: '✅ Да, удалить', callback_data: `u_delyes:${targetId}` },
          { text: '❌ Отмена',      callback_data: 'noop' },
        ]]},
      }
    );
    return;
  }

  if (data.startsWith('u_delyes:')) {
    const targetId = data.split(':')[1];
    const ok = await udalitPolzovatelya(targetId);
    await bot.sendMessage(chatId,
      ok ? `✅ Пользователь \`${targetId}\` удалён.` : `⚠️ Не удалось удалить.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (data.startsWith('u_setrole:')) {
    const [, targetId, rol] = data.split(':');
    if (![ROLI.ADMIN, ROLI.STAFF, ROLI.USER].includes(rol)) return;
    const pending = ozhidaemyeImena.get(targetId);
    await setRol(targetId, rol, pending?.name);
    ozhidaemyeImena.delete(targetId);
    const info = await getInfo(targetId);
    const imya = info?.name ? ` — ${info.name}` : '';
    await bot.sendMessage(chatId,
      `✅ Готово!\n\`${targetId}\`${imya}\nНовая роль: ${ROL_LABELS[rol]}`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
});

// ─── Текстовые сообщения и кнопки панели ─────────────────────────────────────

bot.on('message', async (msg) => {
  if (!msg.text) return;
  if (msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const tekst = msg.text.trim();

  // Авто-сохраняем username и имя при каждом сообщении
  const username = msg.from?.username || null;
  const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || null;
  db.updateUserInfo(chatId, username, name).catch(() => {});
  const state = userState.get(chatId) || 'idle';

  if (tekst === '📦 Статус') {
    userState.set(chatId, 'wait_nomer');
    await bot.sendMessage(chatId, '📦 Введите номер контейнера:');
    return;
  }

  if (tekst === '📄 Документы') {
    if (!await canSeeDocs(chatId)) { await bot.sendMessage(chatId, '🚫 Нет доступа.'); return; }
    userState.set(chatId, 'wait_docs_nomer');
    await bot.sendMessage(chatId, '📄 Введите номер контейнера:');
    return;
  }

  if (tekst === '👥 Пользователи') {
    if (!await isAdmin(chatId)) { await bot.sendMessage(chatId, '🚫 Нет доступа.'); return; }
    await pokazatAdminMenu(chatId);
    return;
  }

  if (tekst === '❌ Отписаться') {
    const count = await db.otpisatVsex(chatId);
    await bot.sendMessage(chatId,
      count > 0
        ? `✅ Вы отписались от обновлений по ${count} контейнер(ам).`
        : `ℹ️ У вас нет активных подписок.`
    );
    return;
  }

  if (/^(привет|здравствуйте|меню|menu|hi|hello|салам|башта)$/i.test(tekst)) {
    userState.set(chatId, 'idle');
    await sendWelcome(chatId);
    return;
  }

  if (state === 'wait_new_user_id' && await isAdmin(chatId)) {
    let newId = null;
    let newName = '';

    if (msg.forward_from) {
      newId = String(msg.forward_from.id);
      newName = [msg.forward_from.first_name, msg.forward_from.last_name].filter(Boolean).join(' ');
    } else if (/^\d+$/.test(tekst)) {
      newId = tekst;
    }

    if (!newId) {
      await bot.sendMessage(chatId, '❌ Не похоже на Telegram ID. Введите только цифры или перешлите сообщение пользователя.');
      return;
    }

    userState.set(chatId, 'idle');
    if (newName) ozhidaemyeImena.set(newId, { name: newName });

    await bot.sendMessage(chatId,
      `Выберите роль для \`${newId}\`${newName ? ' (' + newName + ')' : ''}:`,
      { parse_mode: 'Markdown', reply_markup: knopkiRolej(newId) }
    );
    return;
  }

  if (state === 'wait_docs_nomer') {
    userState.set(chatId, 'idle');
    await sendDocs(chatId, tekst);
    return;
  }

  const looksLikeKontejner = !!extractContainerNumber(tekst);
  if (state === 'wait_nomer' || looksLikeKontejner) {
    userState.set(chatId, 'idle');
    try {
      const row = await findKontejner(tekst);
      if (!row) {
        await bot.sendMessage(chatId,
          'Здравствуйте! 😊\n\n📦 Трекинг контейнера появляется через 5 дней после погрузки.\n\n🔎 Пожалуйста, проверьте правильность номера контейнера.');
        return;
      }
      const sub = await db.getSubscription(tekst);
      await bot.sendMessage(chatId, formatStatus(row, sub?.last_updated_at), { parse_mode: 'Markdown' });
      await db.podpisat(chatId, extractContainerNumber(tekst) || tekst, row);
    } catch (err) {
      console.error('sheet error:', err.message);
      await bot.sendMessage(chatId, '⚠️ Не удалось получить данные. Попробуйте позже.');
    }
    return;
  }

  await sendWelcome(chatId);
});

bot.on('polling_error', (err) => { console.error('polling error:', err.message); });

const ready = db.initDB().then(() => {
  console.log('🤖 ARM SHORING Telegram бот запущен');
}).catch(err => {
  console.error('DB init error:', err.message);
  process.exit(1);
});

module.exports = {
  checkForUpdates,
  ready,
};
