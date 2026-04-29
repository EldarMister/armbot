const { Pool } = require('pg');
const { extractContainerNumber, getEnv, normalizeContainerKey } = require('./env');

const pool = new Pool({
  connectionString: getEnv('DATABASE_URL'),
  ssl: { rejectUnauthorized: false },
});

function dbContainerKey(container) {
  return extractContainerNumber(container) || normalizeContainerKey(container);
}

function legacyContainerKey(container) {
  return String(container ?? '').toUpperCase().trim();
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tg_users (
      chat_id  TEXT PRIMARY KEY,
      role     TEXT NOT NULL DEFAULT 'user',
      name     TEXT,
      username TEXT,
      added_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS tg_subscriptions (
      container       TEXT PRIMARY KEY,
      chat_ids        TEXT[]      NOT NULL DEFAULT '{}',
      snapshot        JSONB       NOT NULL DEFAULT '[]',
      last_updated_at TIMESTAMPTZ
    );
  `);
  // Добавляем username если таблица уже существовала без этой колонки
  await pool.query(`
    ALTER TABLE tg_users ADD COLUMN IF NOT EXISTS username TEXT;
  `);

  const initialAdmin = getEnv('INITIAL_ADMIN_ID');
  if (initialAdmin) {
    await pool.query(`
      INSERT INTO tg_users (chat_id, role, name)
      VALUES ($1, 'admin', 'Главный админ')
      ON CONFLICT (chat_id) DO NOTHING
    `, [String(initialAdmin)]);
  }

  console.log('tg: БД готова');
}

// ── Пользователи ─────────────────────────────────────────────────────────────

async function getUser(chatId) {
  const res = await pool.query('SELECT * FROM tg_users WHERE chat_id = $1', [String(chatId)]);
  return res.rows[0] || null;
}

async function setUser(chatId, role, name, username) {
  await pool.query(`
    INSERT INTO tg_users (chat_id, role, name, username)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (chat_id) DO UPDATE SET
      role     = $2,
      name     = COALESCE($3, tg_users.name),
      username = COALESCE($4, tg_users.username)
  `, [String(chatId), role, name || null, username || null]);
}

async function updateUserInfo(chatId, username, name) {
  await pool.query(`
    INSERT INTO tg_users (chat_id, username, name)
    VALUES ($1, $2, $3)
    ON CONFLICT (chat_id) DO UPDATE SET
      username = COALESCE($2, tg_users.username),
      name     = COALESCE($3, tg_users.name)
  `, [String(chatId), username || null, name || null]);
}

async function deleteUser(chatId) {
  const initialAdmin = getEnv('INITIAL_ADMIN_ID');
  if (initialAdmin && String(chatId) === String(initialAdmin)) return false;
  const res = await pool.query(
    'DELETE FROM tg_users WHERE chat_id = $1 RETURNING chat_id',
    [String(chatId)]
  );
  return res.rowCount > 0;
}

async function getAllUsers() {
  const res = await pool.query(`
    SELECT * FROM tg_users
    ORDER BY
      CASE role WHEN 'admin' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END,
      added_at
  `);
  return res.rows;
}

async function getUserRole(chatId) {
  const user = await getUser(chatId);
  return user ? user.role : 'user';
}

// ── Подписки ─────────────────────────────────────────────────────────────────

async function podpisat(chatId, container, snapshot) {
  const key = dbContainerKey(container);
  const cid = String(chatId);
  await pool.query(`
    INSERT INTO tg_subscriptions (container, chat_ids, snapshot)
    VALUES ($1, ARRAY[$2::text], $3::jsonb)
    ON CONFLICT (container) DO UPDATE SET
      chat_ids = array_append(array_remove(tg_subscriptions.chat_ids, $2::text), $2::text),
      snapshot = $3::jsonb
  `, [key, cid, JSON.stringify(snapshot)]);
}

async function otpisatVsex(chatId) {
  const cid = String(chatId);
  await pool.query(
    `UPDATE tg_subscriptions SET chat_ids = array_remove(chat_ids, $1)`,
    [cid]
  );
  const res = await pool.query(`
    DELETE FROM tg_subscriptions WHERE cardinality(chat_ids) = 0 RETURNING container
  `);
  return res.rowCount;
}

async function getVseSubscriptions() {
  const res = await pool.query('SELECT * FROM tg_subscriptions');
  return res.rows;
}

async function obnovitSnapshot(container, snapshot, lastUpdatedAt) {
  const key = dbContainerKey(container);
  const legacyKey = legacyContainerKey(container);
  await pool.query(`
    UPDATE tg_subscriptions
    SET snapshot = $2::jsonb, last_updated_at = $3
    WHERE container = $1 OR container = $4
  `, [key, JSON.stringify(snapshot), lastUpdatedAt, legacyKey]);
}

async function getSubscription(container) {
  const key = dbContainerKey(container);
  const legacyKey = legacyContainerKey(container);
  const res = await pool.query(
    'SELECT * FROM tg_subscriptions WHERE container = $1 OR container = $2 LIMIT 1',
    [key, legacyKey]
  );
  return res.rows[0] || null;
}

module.exports = {
  initDB,
  getUser, setUser, updateUserInfo, deleteUser, getAllUsers, getUserRole,
  podpisat, otpisatVsex, getVseSubscriptions, obnovitSnapshot, getSubscription,
};
