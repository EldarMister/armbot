const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_subscriptions (
      container       TEXT PRIMARY KEY,
      phones          TEXT[]      NOT NULL DEFAULT '{}',
      snapshot        JSONB       NOT NULL DEFAULT '[]',
      last_updated_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS wa_users (
      phone    TEXT PRIMARY KEY,
      added_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('wa: БД готова');
}

async function savePhone(phone) {
  await pool.query(
    `INSERT INTO wa_users (phone) VALUES ($1) ON CONFLICT (phone) DO NOTHING`,
    [String(phone)]
  );
}

async function podpisat(phone, container, snapshot) {
  const key = container.toUpperCase();
  await pool.query(`
    INSERT INTO wa_subscriptions (container, phones, snapshot)
    VALUES ($1, ARRAY[$2::text], $3::jsonb)
    ON CONFLICT (container) DO UPDATE SET
      phones   = array_append(array_remove(wa_subscriptions.phones, $2::text), $2::text),
      snapshot = $3::jsonb
  `, [key, phone, JSON.stringify(snapshot)]);
}

async function otpisat(phone) {
  await pool.query(
    `UPDATE wa_subscriptions SET phones = array_remove(phones, $1)`,
    [phone]
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
  await pool.query(`
    UPDATE wa_subscriptions SET snapshot = $2::jsonb, last_updated_at = $3 WHERE container = $1
  `, [container.toUpperCase(), JSON.stringify(snapshot), lastUpdatedAt]);
}

async function getSubscription(container) {
  const res = await pool.query(
    'SELECT * FROM wa_subscriptions WHERE container = $1',
    [container.toUpperCase()]
  );
  return res.rows[0] || null;
}

module.exports = { initDB, savePhone, podpisat, otpisat, getVseSubscriptions, obnovitSnapshot, getSubscription };
