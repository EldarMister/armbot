require('dotenv').config();
const express = require('express');
const { findKontejner, formatStatus } = require('./sheets');
const wa = require('./whatsapp');

const app = express();
app.use(express.json());

const userState = new Map();

// проверка вебхука при подключении в Meta Dashboard
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

    // клик по кнопке "Статус"
    if (msg.type === 'interactive' && msg.interactive?.button_reply?.id === 'btn_status') {
      userState.set(from, 'wait_nomer');
      await wa.sendText(from, '📦 Введите номер контейнера:');
      return;
    }

    if (msg.type !== 'text') return;

    const tekst = (msg.text?.body || '').trim();

    if (/^(\/?start|привет|здравствуйте|меню|menu|hi|hello|салам|башта)$/i.test(tekst)) {
      userState.set(from, 'idle');
      await wa.sendWelcome(from);
      return;
    }

    if (/^статус$/i.test(tekst)) {
      userState.set(from, 'wait_nomer');
      await wa.sendText(from, '📦 Введите номер контейнера:');
      return;
    }

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
        await wa.sendText(from, `🔔 Вы подписались на обновления контейнера *${tekst.toUpperCase()}*`);
      } catch (err) {
        console.error('sheet error:', err.message);
        await wa.sendText(from, '⚠️ Не удалось получить данные. Попробуйте позже.');
      }
      return;
    }

    await wa.sendWelcome(from);

  } catch (err) {
    console.error('webhook error:', err.message);
  }
});

app.get('/', (req, res) => res.send('ARM SHORING Bot ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`сервер на порту ${PORT}`));
