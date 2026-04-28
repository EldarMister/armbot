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

function normalizePhone(phone) {
  return String(phone ?? '').replace(/\D/g, '');
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_subscriptions (
      container       TEXT PRIMARY KEY,
      phones          TEXT[]      NOT NULL DEFAULT '{}',
      snapshot        JSONB       NOT NULL DEFAULT '[]',
      last_updated_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS wa_users (
      phone           TEXT PRIMARY KEY,
      name            TEXT,
      last_message    TEXT,
      last_message_at TIMESTAMPTZ,
      added_at        TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wa_doc_access (
      phone      TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wa_messages (
      id         BIGSERIAL PRIMARY KEY,
      phone      TEXT NOT NULL,
      direction  TEXT NOT NULL CHECK (direction IN ('in', 'out')),
      body       TEXT NOT NULL DEFAULT '',
      message_id TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS last_message TEXT;
    ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
  `);
  console.log('wa: DB ready');
}

async function savePhone(phone, name = null) {
  const key = normalizePhone(phone);
  if (!key) return;
  await pool.query(`
    INSERT INTO wa_users (phone, name)
    VALUES ($1, $2)
    ON CONFLICT (phone) DO UPDATE SET
      name = COALESCE($2, wa_users.name)
  `, [key, name || null]);
}

async function saveMessage(phone, direction, body, messageId = null) {
  const key = normalizePhone(phone);
  if (!key) return;
  const text = String(body || '').trim();
  await savePhone(key);
  await pool.query(`
    INSERT INTO wa_messages (phone, direction, body, message_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (message_id) DO NOTHING
  `, [key, direction, text, messageId || null]);
  await pool.query(`
    UPDATE wa_users
    SET last_message = $2, last_message_at = NOW()
    WHERE phone = $1
  `, [key, text]);
}

async function podpisat(phone, container, snapshot) {
  const key = dbContainerKey(container);
  const normalizedPhone = normalizePhone(phone);
  await pool.query(`
    INSERT INTO wa_subscriptions (container, phones, snapshot)
    VALUES ($1, ARRAY[$2::text], $3::jsonb)
    ON CONFLICT (container) DO UPDATE SET
      phones   = array_append(array_remove(wa_subscriptions.phones, $2::text), $2::text),
      snapshot = $3::jsonb
  `, [key, normalizedPhone, JSON.stringify(snapshot)]);
}

async function otpisat(phone) {
  const normalizedPhone = normalizePhone(phone);
  await pool.query(
    `UPDATE wa_subscriptions SET phones = array_remove(phones, $1)`,
    [normalizedPhone]
  );
  const res = await pool.query(`
    DELETE FROM wa_subscriptions WHERE cardinality(phones) = 0 RETURNING container
  `);
  return res.rowCount;
}

async function getVseSubscriptions() {
  const res = await pool.query('SELECT * FROM wa_subscriptions');
  return res.rows;
}

async function obnovitSnapshot(container, snapshot, lastUpdatedAt) {
  const key = dbContainerKey(container);
  const legacyKey = legacyContainerKey(container);
  await pool.query(`
    UPDATE wa_subscriptions
    SET snapshot = $2::jsonb, last_updated_at = $3
    WHERE container = $1 OR container = $4
  `, [key, JSON.stringify(snapshot), lastUpdatedAt, legacyKey]);
}

async function getSubscription(container) {
  const key = dbContainerKey(container);
  const legacyKey = legacyContainerKey(container);
  const res = await pool.query(
    'SELECT * FROM wa_subscriptions WHERE container = $1 OR container = $2 LIMIT 1',
    [key, legacyKey]
  );
  return res.rows[0] || null;
}

async function grantDocAccess(phone) {
  const key = normalizePhone(phone);
  if (!key) return null;
  await savePhone(key);
  const res = await pool.query(`
    INSERT INTO wa_doc_access (phone)
    VALUES ($1)
    ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
    RETURNING phone, created_at
  `, [key]);
  return res.rows[0] || null;
}

async function revokeDocAccess(phone) {
  const key = normalizePhone(phone);
  const res = await pool.query('DELETE FROM wa_doc_access WHERE phone = $1', [key]);
  return res.rowCount > 0;
}

async function isDocAllowed(phone) {
  const key = normalizePhone(phone);
  if (!key) return false;
  const res = await pool.query('SELECT 1 FROM wa_doc_access WHERE phone = $1', [key]);
  return res.rowCount > 0;
}

async function listDocAccess() {
  const res = await pool.query(`
    SELECT phone, created_at
    FROM wa_doc_access
    ORDER BY created_at DESC
  `);
  return res.rows;
}

async function listChats() {
  const res = await pool.query(`
    SELECT
      u.phone,
      u.name,
      u.added_at,
      u.last_message,
      u.last_message_at,
      EXISTS(SELECT 1 FROM wa_doc_access a WHERE a.phone = u.phone) AS docs_access
    FROM wa_users u
    ORDER BY COALESCE(u.last_message_at, u.added_at) DESC
  `);
  return res.rows;
}

async function listMessages(phone, limit = 100) {
  const key = normalizePhone(phone);
  const res = await pool.query(`
    SELECT id, phone, direction, body, message_id, created_at
    FROM wa_messages
    WHERE phone = $1
    ORDER BY created_at DESC, id DESC
    LIMIT $2
  `, [key, limit]);
  return res.rows.reverse();
}

module.exports = {
  initDB,
  savePhone,
  saveMessage,
  podpisat,
  otpisat,
  getVseSubscriptions,
  obnovitSnapshot,
  getSubscription,
  grantDocAccess,
  revokeDocAccess,
  isDocAllowed,
  listDocAccess,
  listChats,
  listMessages,
  normalizePhone,
};
