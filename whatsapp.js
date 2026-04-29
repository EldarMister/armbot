const axios = require('axios');
const { getEnv } = require('./env');

const API = 'https://graph.facebook.com/v20.0';

const headers = () => ({
  Authorization: `Bearer ${getEnv('WHATSAPP_TOKEN')}`,
  'Content-Type': 'application/json',
});

const url = () => `${API}/${getEnv('PHONE_NUMBER_ID')}/messages`;

async function post(payload) {
  try {
    return await axios.post(url(), payload, { headers: headers() });
  } catch (err) {
    console.error('META API ERROR:', JSON.stringify(err.response?.data || err.message, null, 2));
    throw err;
  }
}

async function sendText(to, text) {
  const response = await post({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text, preview_url: false },
  });
  response.adminBody = text;
  return response;
}

async function sendTextWithHome(to, text) {
  const response = await post({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'btn_home', title: '🏠 На главную' } },
        ],
      },
    },
  });
  response.adminBody = text;
  return response;
}

/**
 * @param {string} to  - номер телефона
 * @param {boolean} withDocs - показывать ли кнопку «Документы» (только для авторизованных)
 */
async function sendWelcome(to, withDocs = false) {
  const body =
    '👋 *Добро пожаловать в ARM SHORING*\n\n' +
    'Мы обеспечиваем надёжную доставку автомобилей из Южной Кореи в страны Центральной Азии.\n\n' +
    '🚢 Корея → Кыргызстан / Казахстан\n\n' +
    'С помощью этого бота вы можете:\n' +
    '• Узнать актуальный статус контейнера\n' +
    (withDocs ? '• Получить документы по контейнеру\n' : '') +
    '\nПожалуйста, выберите действие ниже 👇';

  const buttons = [
    { type: 'reply', reply: { id: 'btn_status', title: '📦 Статус' } },
  ];

  if (withDocs) {
    buttons.push({ type: 'reply', reply: { id: 'btn_docs', title: '📄 Документы' } });
  }

  const response = await post({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: { buttons },
    },
  });
  response.adminBody = body;
  return response;
}

/**
 * Отправляет PDF-файл как документ WhatsApp.
 * link должен быть публично доступным URL.
 */
async function sendDocument(to, link, filename) {
  const response = await post({
    messaging_product: 'whatsapp',
    to,
    type: 'document',
    document: { link, filename },
  });
  response.adminBody = `[document] ${filename || link || ''}`.trim();
  return response;
}

// markRead не кидает ошибку — просто игнорируем если упало
async function markRead(messageId) {
  try {
    await axios.post(url(), {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }, { headers: headers() });
  } catch (_) {}
}

module.exports = { sendText, sendTextWithHome, sendWelcome, sendDocument, markRead };
