require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const { findKontejner, formatStatus, loadSheetFresh, WATCHABLE_FIELDS } = require('./sheets');
const { getContainerFiles } = require('./drive');
const wa = require('./whatsapp');
const db = require('./db');
const { renderAdminPage, renderLoginPage } = require('./adminPage');
const { extractContainerNumber, getEnv, normalizeContainerKey } = require('./env');

const app = express();
app.use((req, res, next) => {
  if (req.path === '/webhook' || req.path === '/health') {
    console.log('http request', {
      method: req.method,
      path: req.path,
      queryKeys: Object.keys(req.query || {}),
      contentType: req.get('content-type') || null,
      userAgent: req.get('user-agent') || null,
      ip: req.get('x-forwarded-for') || req.ip,
    });
  }
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const userState = new Map();
const ADMIN_COOKIE_NAME = 'arm_admin_session';
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// ─── Авторизация для раздела «Документы» ────────────────────────────────────

const ALLOWED = new Set(
  getEnv('ALLOWED_PHONES')
    .split(',')
    .map(normalizeContainerKey)
    .filter(Boolean)
);

async function isAllowed(phone) {
  return ALLOWED.has(normalizeContainerKey(phone)) || await db.isDocAllowed(phone);
}

function compactCommand(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function getInteractiveReply(msg) {
  const button = msg.interactive?.button_reply;
  const list = msg.interactive?.list_reply;
  return {
    id: button?.id || list?.id || '',
    title: button?.title || list?.title || '',
  };
}

function logWebhookMessage(msg, state) {
  const reply = getInteractiveReply(msg);
  console.log('webhook message', {
    from: msg.from,
    type: msg.type,
    state,
    text: msg.text?.body,
    interactiveId: reply.id || undefined,
    interactiveTitle: reply.title || undefined,
  });
}

function getIncomingMessageBody(msg) {
  if (msg.type === 'text') return msg.text?.body || '';
  if (msg.type === 'interactive') {
    const reply = getInteractiveReply(msg);
    return reply.title || reply.id || '[interactive]';
  }
  if (msg.type === 'document') return msg.document?.filename || '[document]';
  if (msg.type === 'image') return msg.image?.caption || '[image]';
  return `[${msg.type}]`;
}

function getAdminPassword() {
  return getEnv('WEB_ADMIN_PASSWORD') || getEnv('ADMIN_PASSWORD') || getEnv('WEBHOOK_VERIFY_TOKEN');
}

function getAdminUser() {
  return getEnv('WEB_ADMIN_USER') || getEnv('ADMIN_USER') || 'admin';
}

function getAdminSessionSecret() {
  return getEnv('WEB_ADMIN_SESSION_SECRET') || getAdminPassword();
}

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function signAdminPayload(payload) {
  const secret = getAdminSessionSecret();
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function createAdminSessionToken(user) {
  const payload = Buffer.from(JSON.stringify({
    user,
    exp: Date.now() + ADMIN_SESSION_TTL_MS,
  })).toString('base64url');
  return `${payload}.${signAdminPayload(payload)}`;
}

function readCookie(req, name) {
  const header = String(req.headers.cookie || '');
  for (const part of header.split(';')) {
    const item = part.trim();
    const sep = item.indexOf('=');
    if (sep === -1) continue;
    if (item.slice(0, sep) !== name) continue;
    try {
      return decodeURIComponent(item.slice(sep + 1));
    } catch {
      return item.slice(sep + 1);
    }
  }
  return '';
}

function getAdminSessionUser(req) {
  const token = readCookie(req, ADMIN_COOKIE_NAME);
  const secret = getAdminSessionSecret();
  if (!token || !secret) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  if (!timingSafeStringEqual(signature, signAdminPayload(payload))) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return null;
    if (!timingSafeStringEqual(data.user, getAdminUser())) return null;
    return data.user;
  } catch {
    return null;
  }
}

function isHttpsRequest(req) {
  return req.secure || String(req.get('x-forwarded-proto') || '').split(',')[0] === 'https';
}

function setAdminSessionCookie(req, res, user) {
  res.cookie(ADMIN_COOKIE_NAME, createAdminSessionToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(req),
    maxAge: ADMIN_SESSION_TTL_MS,
    path: '/admin',
  });
}

function clearAdminSessionCookie(req, res) {
  res.clearCookie(ADMIN_COOKIE_NAME, {
    sameSite: 'lax',
    secure: isHttpsRequest(req),
    path: '/admin',
  });
}

function sanitizeAdminNext(value) {
  const next = String(value || '');
  if (!next.startsWith('/admin') || next.startsWith('//') || next.startsWith('/admin/login')) {
    return '/admin';
  }
  return next;
}

function isBasicAdmin(req) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;

  try {
    const [user, pass] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
    return timingSafeStringEqual(user, getAdminUser()) && timingSafeStringEqual(pass, getAdminPassword());
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const password = getAdminPassword();
  if (!password) {
    return res.status(503).send('Set WEB_ADMIN_PASSWORD to enable admin panel.');
  }

  if (getAdminSessionUser(req) || isBasicAdmin(req)) {
    return next();
  }

  if (req.originalUrl.startsWith('/admin/api')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect(`/admin/login?next=${encodeURIComponent(sanitizeAdminNext(req.originalUrl))}`);
}

function accessFromEnv() {
  return Array.from(ALLOWED).map(phone => ({
    phone,
    source: 'env',
    created_at: null,
  }));
}

app.get('/admin/login', (req, res) => {
  if (getAdminSessionUser(req)) {
    return res.redirect(sanitizeAdminNext(req.query.next));
  }
  res.type('html').send(renderLoginPage({
    next: sanitizeAdminNext(req.query.next),
    error: '',
  }));
});

app.post('/admin/login', (req, res) => {
  const password = getAdminPassword();
  if (!password) {
    return res.status(503).send('Set WEB_ADMIN_PASSWORD to enable admin panel.');
  }

  const user = String(req.body?.user || '');
  const pass = String(req.body?.password || '');
  const next = sanitizeAdminNext(req.body?.next);

  if (timingSafeStringEqual(user, getAdminUser()) && timingSafeStringEqual(pass, password)) {
    setAdminSessionCookie(req, res, getAdminUser());
    return res.redirect(next);
  }

  return res.status(401).type('html').send(renderLoginPage({
    next,
    error: 'Неверный логин или пароль',
  }));
});

app.use('/admin', requireAdmin);

app.post('/admin/logout', (req, res) => {
  clearAdminSessionCookie(req, res);
  res.redirect('/admin/login');
});

app.get('/admin', (req, res) => {
  res.type('html').send(renderAdminPage({ user: getAdminSessionUser(req) || getAdminUser() }));
});

app.get('/admin/api/chats', async (req, res) => {
  try {
    const chats = await db.listChats();
    res.json({
      chats: chats.map(chat => ({
        ...chat,
        docs_access: chat.docs_access || ALLOWED.has(normalizeContainerKey(chat.phone)),
      })),
    });
  } catch (err) {
    console.error('admin list chats error:', err.message);
    res.status(500).json({ error: 'Failed to load chats' });
  }
});

app.get('/admin/api/chats/:phone/messages', async (req, res) => {
  try {
    const messages = await db.listMessages(req.params.phone);
    res.json({ messages });
  } catch (err) {
    console.error('admin list messages error:', err.message);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

app.post('/admin/api/chats/:phone/messages', async (req, res) => {
  const phone = db.normalizePhone(req.params.phone);
  const text = String(req.body?.text || '').trim();
  if (!phone || !text) return res.status(400).json({ error: 'Phone and text are required' });

  try {
    const result = await wa.sendText(phone, text);
    const messageId = result.data?.messages?.[0]?.id || null;
    await db.savePhone(phone);
    await db.saveMessage(phone, 'out', text, messageId);
    res.json({ ok: true, message_id: messageId });
  } catch (err) {
    console.error('admin send message error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to send WhatsApp message' });
  }
});

app.get('/admin/api/access', async (req, res) => {
  try {
    const dbAccess = (await db.listDocAccess()).map(item => ({ ...item, source: 'db' }));
    const seen = new Set(dbAccess.map(item => item.phone));
    const envAccess = accessFromEnv().filter(item => !seen.has(item.phone));
    res.json({ access: [...dbAccess, ...envAccess] });
  } catch (err) {
    console.error('admin list access error:', err.message);
    res.status(500).json({ error: 'Failed to load access list' });
  }
});

app.post('/admin/api/access', async (req, res) => {
  const phone = db.normalizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  try {
    const item = await db.grantDocAccess(phone);
    res.json({ ok: true, access: item });
  } catch (err) {
    console.error('admin grant access error:', err.message);
    res.status(500).json({ error: 'Failed to grant access' });
  }
});

app.delete('/admin/api/access/:phone', async (req, res) => {
  const phone = db.normalizePhone(req.params.phone);
  if (ALLOWED.has(normalizeContainerKey(phone))) {
    return res.status(400).json({ error: 'This phone is configured in ALLOWED_PHONES env' });
  }

  try {
    await db.revokeDocAccess(phone);
    res.json({ ok: true });
  } catch (err) {
    console.error('admin revoke access error:', err.message);
    res.status(500).json({ error: 'Failed to revoke access' });
  }
});

// ─── Проверка обновлений (каждый час) ────────────────────────────────────────

async function checkForUpdates() {
  try {
    const subs = await db.getVseSubscriptions();
    if (subs.length === 0) return;
    console.log(`checkForUpdates: checking ${subs.length} container(s)...`);
    const rows = await loadSheetFresh();
    for (const sub of subs) {
      const key = extractContainerNumber(sub.container) || normalizeContainerKey(sub.container);
      const newRow = rows.find(r => extractContainerNumber(r[0]) === key);
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
      await db.obnovitSnapshot(sub.container, newRow, lastUpdatedAt);

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

setInterval(checkForUpdates, 5 * 60 * 1000);

// ─── Отправка документов ─────────────────────────────────────────────────────

async function sendDocs(phone, containerNomer) {
  const key = extractContainerNumber(containerNomer) || containerNomer.trim();
  try {
    const files = await getContainerFiles(containerNomer);

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
        await wa.sendText(phone, `📋 *${file.path || file.name}*\n🔗 ${file.viewUrl}`);
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
  const tokenMatches = token === getEnv('WEBHOOK_VERIFY_TOKEN');

  console.log('webhook verify request', {
    mode,
    tokenMatches,
    hasChallenge: Boolean(challenge),
  });

  if (mode === 'subscribe' && tokenMatches) {
    console.log('webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    console.log('webhook post received', {
      object: req.body?.object,
      entryCount: Array.isArray(req.body?.entry) ? req.body.entry.length : 0,
      field: req.body?.entry?.[0]?.changes?.[0]?.field,
      hasMessages: !!req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.length,
      hasStatuses: !!req.body?.entry?.[0]?.changes?.[0]?.value?.statuses?.length,
      userAgent: req.get('user-agent'),
    });

    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg) {
      if (value?.statuses?.length) {
        console.log('webhook status', value.statuses.map(s => ({
          id: s.id,
          status: s.status,
          recipient_id: s.recipient_id,
        })));
      }
      return;
    }

    const from = msg.from;
    const state = userState.get(from) || 'idle';
    const contact = (value?.contacts || []).find(item => item.wa_id === from) || value?.contacts?.[0];
    const contactName = contact?.profile?.name || null;
    logWebhookMessage(msg, state);

    wa.markRead(msg.id).catch(() => {});
    db.savePhone(from, contactName).catch(() => {});
    db.saveMessage(from, 'in', getIncomingMessageBody(msg), msg.id).catch(() => {});

    // ── Интерактивные кнопки ──────────────────────────────────────────────────
    if (msg.type === 'interactive') {
      const reply = getInteractiveReply(msg);
      const btnId = reply.id;
      const btnCommand = compactCommand(reply.title);

      if (btnId === 'btn_status' || btnCommand === 'статус') {
        userState.set(from, 'wait_nomer');
        await wa.sendText(from, '📦 Введите номер контейнера:');
        return;
      }

      if (btnId === 'btn_docs' || btnCommand === 'документы') {
        if (!(await isAllowed(from))) {
          await wa.sendText(from, '🚫 У вас нет доступа к этому разделу.');
          return;
        }
        userState.set(from, 'wait_docs_nomer');
        await wa.sendText(from, '📄 Введите номер контейнера для получения документов:');
        return;
      }

      console.warn('webhook unknown interactive', {
        from,
        interactiveType: msg.interactive?.type,
        btnId,
        btnTitle: reply.title,
      });
      return;
    }

    if (msg.type !== 'text') return;

    const tekst = (msg.text?.body || '').trim();
    const command = compactCommand(tekst);

    // ── Приветствие / меню ────────────────────────────────────────────────────
    if (/^(\/?start|привет|здравствуйте|меню|menu|hi|hello|салам|башта)$/i.test(tekst) ||
        ['start', 'привет', 'здравствуйте', 'меню', 'menu', 'hi', 'hello', 'салам', 'башта'].includes(command)) {
      userState.set(from, 'idle');
      await wa.sendWelcome(from, await isAllowed(from));
      return;
    }

    // ── Текстовый запрос статуса ──────────────────────────────────────────────
    if (/^статус$/i.test(tekst) || command === 'статус') {
      userState.set(from, 'wait_nomer');
      await wa.sendText(from, '📦 Введите номер контейнера:');
      return;
    }

    if (command === 'документы') {
      if (!(await isAllowed(from))) {
        await wa.sendText(from, '🚫 У вас нет доступа к этому разделу.');
        return;
      }
      userState.set(from, 'wait_docs_nomer');
      await wa.sendText(from, '📄 Введите номер контейнера для получения документов:');
      return;
    }

    // ── Отписка ───────────────────────────────────────────────────────────────
    if (/^отписаться$/i.test(tekst) || command === 'отписаться') {
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
    const looksLikeKontejner = !!extractContainerNumber(tekst);
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
        const sub = await db.getSubscription(tekst);
        await wa.sendText(from, formatStatus(row, sub?.last_updated_at));
        await db.podpisat(from, extractContainerNumber(tekst) || tekst, row);
      } catch (err) {
        console.error('sheet error:', err.message);
        await wa.sendText(from, '⚠️ Не удалось получить данные. Попробуйте позже.');
      }
      return;
    }

    await wa.sendWelcome(from, await isAllowed(from));

  } catch (err) {
    console.error('webhook error:', err.message);
  }
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'armbot',
    time: new Date().toISOString(),
    commit: process.env.RAILWAY_GIT_COMMIT_SHA || null,
  });
});

app.get('/', (req, res) => res.send('ARM SHORING Bot ✅'));

const PORT = process.env.PORT || 3000;

db.initDB().then(() => {
  app.listen(PORT, () => console.log(`сервер на порту ${PORT}`));
}).catch(err => {
  console.error('DB init error:', err.message);
  process.exit(1);
});
