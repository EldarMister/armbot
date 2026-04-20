const axios = require('axios');

const API = 'https://graph.facebook.com/v20.0';

const headers = () => ({
  Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  'Content-Type': 'application/json',
});

const url = () => `${API}/${process.env.PHONE_NUMBER_ID}/messages`;

async function sendText(to, text) {
  return axios.post(url(), {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text, preview_url: false },
  }, { headers: headers() });
}

async function sendWelcome(to) {
  const body =
    '👋 *Добро пожаловать в ARM SHORING*\n\n' +
    'Мы обеспечиваем надёжную доставку автомобилей из Южной Кореи в страны Центральной Азии.\n\n' +
    '🚢 Корея → Кыргызстан / Казахстан\n\n' +
    'С помощью этого бота вы можете:\n' +
    '• Узнать актуальный статус контейнера\n\n' +
    'Пожалуйста, выберите действие ниже 👇';

  return axios.post(url(), {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'btn_status', title: '📦 Статус' } },
        ],
      },
    },
  }, { headers: headers() });
}

async function markRead(messageId) {
  return axios.post(url(), {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  }, { headers: headers() });
}

module.exports = { sendText, sendWelcome, markRead };
