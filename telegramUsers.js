const db = require('./telegramDb');

const ROLI = {
  ADMIN: 'admin',
  STAFF: 'staff',
  USER:  'user',
};

const ROL_LABELS = {
  admin: '👑 Админ',
  staff: '👔 Сотрудник',
  user:  '👤 Пользователь',
};

async function getRol(chatId)          { return db.getUserRole(chatId); }
async function getInfo(chatId)         { return db.getUser(chatId); }
async function setRol(chatId, rol, imya) { return db.setUser(chatId, rol, imya); }
async function udalitPolzovatelya(chatId) { return db.deleteUser(chatId); }
async function spisokPolzovateley()    { return db.getAllUsers(); }
async function isAdmin(chatId)         { return (await getRol(chatId)) === ROLI.ADMIN; }
async function canSeeDocs(chatId) {
  const r = await getRol(chatId);
  return r === ROLI.ADMIN || r === ROLI.STAFF;
}

module.exports = {
  ROLI, ROL_LABELS,
  getRol, getInfo, setRol,
  udalitPolzovatelya, spisokPolzovateley,
  isAdmin, canSeeDocs,
};
