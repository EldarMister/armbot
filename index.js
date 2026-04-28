require('dotenv').config();
const express = require('express');
const { findKontejner, formatStatus, loadSheetFresh, WATCHABLE_FIELDS } = require('./sheets');
const { getContainerFiles } = require('./drive');
const wa = require('./whatsapp');
const db = require('./db');

const app = express();
app.use(express.json());

const userState = new Map();

// ─── Авторизация для раздела «Документы» ────────────────────────────────────

const ALLOWED = new Set(
  (process.env.ALLOWED_PHONES || '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
);

function isAllowed(phone) {
  return ALLOWED.has(phone);
}

// ─── Проверка обновлений (каждый час) ────────────────────────────────────────

async function checkForUpdates() {
  try {
    const subs = await db.getVseSubscriptions();
    if (subs.length === 0) return;
    console.log(`checkForUpdates: checking ${subs.length} container(s)...`);
    const rows = await loadSheetFresh();
    for (const sub of subs) {
      const key = sub.container;
      const newRow = rows.find(r => String(r[0]).toUpperCase().trim() === key);
      if (!newRow) continue;

      const oldSnap = Array.isArray(sub.snapshot) ? sub.snapshot : [];
      const changes = [];
      for (const { idx, label } of WATCHABLE_FIELDS) {
        const oldVal = oldSnap[idx] != null ? String(oldSnap[idx]).trim() : '';
        const newVal = newRow[idx] != null ? String(newRow[idx]).trim() : '';
        if (oldVal !== newVal) changes.push(`${label}: ${oldVal || '—'} → ${newVal || '—'}`);
      }
      if (changes.length === 0) continue;

      const lastUpdatedAt = new Date().toISOString();
      await db.obnovitSnapshot(key, newRow, lastUpdatedAt);

      const notification =
        `🔔 Обновление по контейнеру *${key}*\n\n` +
        `Изменения:\n${changes.join('\n')}\n\n` +
        `Актуальный статус:\n${formatStatus(newRow, lastUpdatedAt)}`;

      for (const phone of sub.phones) {
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
      await wa.sendDocument(phone, file.url, file.name).catch(async () => {
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
    db.savePhone(from).catch(() => {});

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
      const count = await db.otpisat(from);
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
          await wa.sendText(from,
            'Здравствуйте! 😊\n\n📦 Трекинг контейнера появляется через 5 дней после погрузки.\n\n🔎 Пожалуйста, проверьте правильность номера контейнера.'
          );
          return;
        }
        const sub = await db.getSubscription(tekst.toUpperCase());
        await wa.sendText(from, formatStatus(row, sub?.last_updated_at));
        await db.podpisat(from, tekst, row);
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

db.initDB().then(() => {
  app.listen(PORT, () => console.log(`сервер на порту ${PORT}`));
}).catch(err => {
  console.error('DB init error:', err.message);
  process.exit(1);
});
