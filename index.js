require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { findKontejner, formatStatus, loadSheetFresh, WATCHABLE_FIELDS } = require('./sheets');
const { getContainerFiles } = require('./drive');
const wa = require('./whatsapp');

const app = express();
app.use(express.json());

const userState = new Map();

// ─── Авторизация для раздела «Документы» ────────────────────────────────────
// В .env: ALLOWED_PHONES=79001234567,996700123456  (через запятую, без пробелов)
const ALLOWED = new Set(
  (process.env.ALLOWED_PHONES || '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
);

function isAllowed(phone) {
  return ALLOWED.has(phone);
}

// ─── Подписки ────────────────────────────────────────────────────────────────

const subscriptions = new Map();
const userSubscriptions = new Map();

const SUBS_FILE = path.join(__dirname, 'subscriptions.json');

function saveSubs() {
  const data = {};
  for (const [key, sub] of subscriptions.entries()) {
    data[key] = { users: [...sub.users], snapshot: sub.snapshot };
  }
  try {
    fs.writeFileSync(SUBS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('saveSubs error:', err.message);
  }
}

function loadSubs() {
  try {
    if (!fs.existsSync(SUBS_FILE)) return;
    const data = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
    for (const [key, val] of Object.entries(data)) {
      subscriptions.set(key, {
        users: new Set(val.users),
        snapshot: val.snapshot,
      });
      for (const phone of val.users) {
        if (!userSubscriptions.has(phone)) userSubscriptions.set(phone, new Set());
        userSubscriptions.get(phone).add(key);
      }
    }
    console.log(`loaded ${subscriptions.size} subscription(s) from disk`);
  } catch (err) {
    console.error('loadSubs error:', err.message);
  }
}

loadSubs();

function subscribe(phone, nomer, row) {
  const key = nomer.toUpperCase();
  if (!subscriptions.has(key)) {
    subscriptions.set(key, { users: new Set(), snapshot: [...row] });
  } else {
    subscriptions.get(key).snapshot = [...row];
  }
  subscriptions.get(key).users.add(phone);
  if (!userSubscriptions.has(phone)) userSubscriptions.set(phone, new Set());
  userSubscriptions.get(phone).add(key);
  saveSubs();
}

function unsubscribeAll(phone) {
  const containers = userSubscriptions.get(phone);
  if (!containers || containers.size === 0) return 0;
  const count = containers.size;
  for (const key of containers) {
    const sub = subscriptions.get(key);
    if (sub) {
      sub.users.delete(phone);
      if (sub.users.size === 0) subscriptions.delete(key);
    }
  }
  userSubscriptions.delete(phone);
  saveSubs();
  return count;
}

// ─── Проверка обновлений (каждый час) ────────────────────────────────────────

async function checkForUpdates() {
  if (subscriptions.size === 0) return;
  console.log(`checkForUpdates: checking ${subscriptions.size} container(s)...`);
  try {
    const rows = await loadSheetFresh();
    for (const [key, sub] of subscriptions.entries()) {
      const newRow = rows.find(r => String(r[0]).toUpperCase().trim() === key);
      if (!newRow) continue;

      const changes = [];
      for (const { idx, label } of WATCHABLE_FIELDS) {
        const oldVal = sub.snapshot[idx] != null ? String(sub.snapshot[idx]).trim() : '';
        const newVal = newRow[idx] != null ? String(newRow[idx]).trim() : '';
        if (oldVal !== newVal) changes.push(`${label}: ${oldVal || '—'} → ${newVal || '—'}`);
      }

      if (changes.length === 0) continue;

      sub.snapshot = [...newRow];
      saveSubs();

      const notification =
        `🔔 Обновление по контейнеру *${key}*\n\n` +
        `Изменения:\n${changes.join('\n')}\n\n` +
        `Актуальный статус:\n${formatStatus(newRow)}`;

      for (const phone of sub.users) {
        await wa.sendText(phone, notification).catch(err =>
          console.error(`notify ${phone}:`, err.message)
        );
      }
    }
  } catch (err) {
    console.error('checkForUpdates error:', err.message);
  }
}

setInterval(checkForUpdates, 60 * 60 * 1000);

// ─── Отправка документов ─────────────────────────────────────────────────────

async function sendDocs(phone, containerNomer) {
  const key = containerNomer.toUpperCase();
  try {
    const files = await getContainerFiles(key);

    if (files === null) {
      await wa.sendText(phone,
        `📁 Папка для контейнера *${key}* не найдена.\n\nВозможно, документы ещё не загружены.`
      );
      return;
    }

    if (files.length === 0) {
      await wa.sendText(phone,
        `📂 Папка контейнера *${key}* пуста — документы ещё не загружены.`
      );
      return;
    }

    await wa.sendText(phone, `📄 Документы по контейнеру *${key}* — ${files.length} файл(ов):`);

    for (const file of files) {
      // Пробуем отправить как документ WhatsApp
      await wa.sendDocument(phone, file.url, file.name).catch(async () => {
        // Если не получилось — шлём ссылку текстом
        await wa.sendText(phone, `📋 *${file.name}*\n🔗 ${file.viewUrl}`);
      });
    }
  } catch (err) {
    console.error('sendDocs error:', err.message);
    await wa.sendText(phone, '⚠️ Не удалось получить документы. Попробуйте позже.');
  }
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg) return;

    const from = msg.from;
    const state = userState.get(from) || 'idle';

    wa.markRead(msg.id).catch(() => {});

    // ── Интерактивные кнопки ──────────────────────────────────────────────────
    if (msg.type === 'interactive') {
      const btnId = msg.interactive?.button_reply?.id;

      if (btnId === 'btn_status') {
        userState.set(from, 'wait_nomer');
        await wa.sendText(from, '📦 Введите номер контейнера:');
        return;
      }

      if (btnId === 'btn_docs') {
        if (!isAllowed(from)) {
          await wa.sendText(from, '🚫 У вас нет доступа к этому разделу.');
          return;
        }
        userState.set(from, 'wait_docs_nomer');
        await wa.sendText(from, '📄 Введите номер контейнера для получения документов:');
        return;
      }

      return;
    }

    if (msg.type !== 'text') return;

    const tekst = (msg.text?.body || '').trim();

    // ── Приветствие / меню ────────────────────────────────────────────────────
    if (/^(\/?start|привет|здравствуйте|меню|menu|hi|hello|салам|башта)$/i.test(tekst)) {
      userState.set(from, 'idle');
      await wa.sendWelcome(from, isAllowed(from));
      return;
    }

    // ── Текстовый запрос статуса ──────────────────────────────────────────────
    if (/^статус$/i.test(tekst)) {
      userState.set(from, 'wait_nomer');
      await wa.sendText(from, '📦 Введите номер контейнера:');
      return;
    }

    // ── Отписка ───────────────────────────────────────────────────────────────
    if (/^отписаться$/i.test(tekst)) {
      const count = unsubscribeAll(from);
      await wa.sendText(
        from,
        count > 0
          ? `✅ Вы отписались от обновлений по ${count} контейнер(ам).`
          : `ℹ️ У вас нет активных подписок.`
      );
      return;
    }

    // ── Ожидаем номер для документов ─────────────────────────────────────────
    if (state === 'wait_docs_nomer') {
      userState.set(from, 'idle');
      await sendDocs(from, tekst);
      return;
    }

    // ── Ожидаем номер для статуса (или авто-распознавание) ───────────────────
    const looksLikeKontejner = /^[A-Za-z]{4}\d{6,8}$/.test(tekst);
    if (state === 'wait_nomer' || looksLikeKontejner) {
      userState.set(from, 'idle');
      try {
        const row = await findKontejner(tekst);
        if (!row) {
          await wa.sendText(
            from,
            `❌ Контейнер *${tekst.toUpperCase()}* не найден.\n\nПроверьте номер и попробуйте ещё раз.`
          );
          return;
        }
        await wa.sendText(from, formatStatus(row));
        subscribe(from, tekst, row);
        await wa.sendText(from, `🔔 Вы подписались на обновления контейнера *${tekst.toUpperCase()}*`);
      } catch (err) {
        console.error('sheet error:', err.message);
        await wa.sendText(from, '⚠️ Не удалось получить данные. Попробуйте позже.');
      }
      return;
    }

    await wa.sendWelcome(from, isAllowed(from));

  } catch (err) {
    console.error('webhook error:', err.message);
  }
});

app.get('/', (req, res) => res.send('ARM SHORING Bot ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`сервер на порту ${PORT}`));
