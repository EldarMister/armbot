function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[ch]));
}

function renderLoginPage({ next = '/admin', error = '' } = {}) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Вход в ARM WhatsApp Admin</title>
  <style>
    :root {
      --bg: #f4f6f8;
      --panel: #ffffff;
      --line: #d9dee7;
      --text: #17212f;
      --muted: #657083;
      --brand: #0f766e;
      --brand-dark: #115e59;
      --danger: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      background: var(--bg);
      color: var(--text);
      font-family: Arial, sans-serif;
    }
    .login {
      width: min(100%, 420px);
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 28px;
      box-shadow: 0 20px 40px rgba(23, 33, 47, 0.08);
    }
    h1 {
      margin: 0 0 6px;
      font-size: 22px;
      line-height: 1.2;
    }
    .hint {
      margin: 0 0 22px;
      color: var(--muted);
      font-size: 14px;
    }
    label {
      display: block;
      margin: 14px 0 6px;
      font-size: 13px;
      font-weight: 700;
    }
    input, button {
      width: 100%;
      font: inherit;
      border-radius: 6px;
    }
    input {
      border: 1px solid var(--line);
      padding: 11px 12px;
      outline: none;
      background: #fff;
    }
    input:focus {
      border-color: var(--brand);
      box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.14);
    }
    button {
      margin-top: 20px;
      border: 0;
      padding: 12px;
      background: var(--brand);
      color: #fff;
      cursor: pointer;
      font-weight: 700;
    }
    button:hover { background: var(--brand-dark); }
    .error {
      margin: 0 0 16px;
      padding: 10px 12px;
      border: 1px solid #f1b5ae;
      border-radius: 6px;
      color: var(--danger);
      background: #fff4f2;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <form class="login" method="post" action="/admin/login" autocomplete="on">
    <h1>ARM WhatsApp Admin</h1>
    <p class="hint">Войдите, чтобы управлять чатами и доступом к документам.</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    <input type="hidden" name="next" value="${escapeHtml(next)}">
    <label for="user">Логин</label>
    <input id="user" name="user" autocomplete="username" required autofocus>
    <label for="password">Пароль</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Войти</button>
  </form>
</body>
</html>`;
}

function renderAdminPage({ user = 'admin' } = {}) {
  const safeUser = escapeHtml(user);
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ARM WhatsApp Admin</title>
  <style>
    :root {
      --bg: #f5f6f8;
      --panel: #ffffff;
      --line: #d9dee7;
      --text: #17212f;
      --muted: #657083;
      --brand: #0f766e;
      --brand-dark: #115e59;
      --danger: #b42318;
      --soft: #edf7f6;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      font-size: 14px;
      background: var(--bg);
      color: var(--text);
    }
    header {
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
    }
    main {
      display: grid;
      grid-template-columns: 320px 1fr 300px;
      gap: 16px;
      padding: 16px;
      height: calc(100vh - 56px);
      min-height: 620px;
    }
    section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .section-head {
      padding: 14px;
      border-bottom: 1px solid var(--line);
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
    }
    input, textarea, button {
      font: inherit;
    }
    input, textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px 10px;
      outline: none;
      background: #fff;
    }
    input:focus, textarea:focus {
      border-color: var(--brand);
    }
    button {
      border: 0;
      border-radius: 6px;
      padding: 8px 10px;
      background: var(--brand);
      color: #fff;
      cursor: pointer;
      font-weight: 700;
      white-space: nowrap;
    }
    button:hover { background: var(--brand-dark); }
    button.secondary {
      background: #e8edf3;
      color: var(--text);
    }
    button.danger {
      background: var(--danger);
    }
    .list {
      overflow: auto;
      min-height: 0;
    }
    .chat-row, .access-row {
      padding: 9px 12px;
      border-bottom: 1px solid var(--line);
      cursor: pointer;
    }
    .chat-row:hover, .chat-row.active {
      background: var(--soft);
    }
    .phone {
      font-weight: 700;
      font-size: 14px;
    }
    .name, .meta, .preview {
      color: var(--muted);
      font-size: 12px;
      margin-top: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .badge {
      display: inline-block;
      color: var(--brand-dark);
      background: var(--soft);
      border: 1px solid #c8e7e3;
      border-radius: 999px;
      padding: 2px 8px;
      margin-top: 6px;
      font-size: 12px;
      font-weight: 700;
    }
    .messages {
      flex: 1;
      overflow: auto;
      padding: 12px 14px;
      background: #fafbfc;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }
    .empty {
      color: var(--muted);
      padding: 16px;
    }
    .msg {
      width: fit-content;
      max-width: min(560px, 76%);
      margin: 0;
      padding: 7px 9px;
      border-radius: 7px;
      border: 1px solid var(--line);
      background: #fff;
      font-size: 14px;
      line-height: 1.35;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .msg.out {
      align-self: flex-end;
      background: #e8f5f3;
      border-color: #c8e7e3;
    }
    .msg-time {
      margin-top: 4px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.2;
    }
    .composer {
      border-top: 1px solid var(--line);
      padding: 10px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
    }
    .composer textarea {
      min-height: 54px;
      max-height: 120px;
      resize: vertical;
    }
    .side-form {
      padding: 14px;
      display: grid;
      gap: 8px;
      border-bottom: 1px solid var(--line);
    }
    .access-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
      cursor: default;
    }
    .source {
      color: var(--muted);
      font-size: 12px;
    }
    .status {
      color: var(--muted);
      font-size: 12px;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .admin-user {
      max-width: 180px;
      color: var(--muted);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .logout-form {
      margin: 0;
    }
    @media (max-width: 980px) {
      main {
        grid-template-columns: 1fr;
        height: auto;
      }
      section {
        min-height: 420px;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>ARM WhatsApp Admin</h1>
    <div class="header-actions">
      <div class="admin-user">${safeUser}</div>
      <div class="status" id="status">Загрузка...</div>
      <form class="logout-form" method="post" action="/admin/logout">
        <button class="secondary" type="submit">Выйти</button>
      </form>
    </div>
  </header>
  <main>
    <section>
      <div class="section-head">
        <div class="section-title">Чаты</div>
        <button class="secondary" onclick="loadAll()">Обновить</button>
      </div>
      <div class="side-form">
        <input id="chatSearch" placeholder="Поиск по номеру или имени" oninput="renderChats()">
      </div>
      <div class="list" id="chats"></div>
    </section>

    <section>
      <div class="section-head">
        <div>
          <div class="section-title" id="chatTitle">Выберите чат</div>
          <div class="meta" id="chatMeta"></div>
        </div>
        <button class="secondary" id="grantSelected" onclick="grantSelected()" disabled>Дать доступ</button>
      </div>
      <div class="messages" id="messages">
        <div class="empty">Сообщения появятся после выбора чата.</div>
      </div>
      <div class="composer">
        <textarea id="replyText" rows="2" placeholder="Сообщение клиенту"></textarea>
        <button id="sendBtn" onclick="sendMessage()" disabled>Отправить</button>
      </div>
    </section>

    <section>
      <div class="section-head">
        <div class="section-title">Доступ к документам</div>
      </div>
      <div class="side-form">
        <input id="accessPhone" placeholder="996XXXXXXXXX">
        <button onclick="grantAccessFromInput()">Добавить доступ</button>
      </div>
      <div class="list" id="access"></div>
    </section>
  </main>

  <script>
    let chats = [];
    let access = [];
    let selectedPhone = null;

    const api = async (url, options = {}) => {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
      });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/admin/login';
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      return res.json();
    };

    function cleanPhone(value) {
      return String(value || '').replace(/\\D/g, '');
    }

    function fmtDate(value) {
      if (!value) return '';
      return new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    function esc(value) {
      return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      }[ch]));
    }

    function setStatus(text) {
      document.getElementById('status').textContent = text;
    }

    async function loadAll() {
      try {
        setStatus('Загрузка...');
        const [chatData, accessData] = await Promise.all([
          api('/admin/api/chats'),
          api('/admin/api/access'),
        ]);
        chats = chatData.chats || [];
        access = accessData.access || [];
        renderChats();
        renderAccess();
        setStatus('Готово');
      } catch (err) {
        setStatus(err.message);
      }
    }

    function renderChats() {
      const q = document.getElementById('chatSearch').value.toLowerCase().trim();
      const root = document.getElementById('chats');
      const rows = chats.filter(chat => {
        const haystack = [chat.phone, chat.name, chat.last_message].filter(Boolean).join(' ').toLowerCase();
        return !q || haystack.includes(q);
      });
      root.innerHTML = rows.length ? rows.map(chat => \`
        <div class="chat-row \${selectedPhone === chat.phone ? 'active' : ''}" onclick="selectChat('\${chat.phone}')">
          <div class="phone">\${esc(chat.phone)}</div>
          <div class="name">\${esc(chat.name || 'Без имени')}</div>
          <div class="preview">\${esc(chat.last_message || '')}</div>
          <div class="meta">\${esc(fmtDate(chat.last_message_at || chat.added_at))}</div>
          \${chat.docs_access ? '<span class="badge">Документы</span>' : ''}
        </div>
      \`).join('') : '<div class="empty">Чатов пока нет.</div>';
    }

    function renderAccess() {
      const root = document.getElementById('access');
      root.innerHTML = access.length ? access.map(item => \`
        <div class="access-row">
          <div>
            <div class="phone">\${esc(item.phone)}</div>
            <div class="source">\${item.source === 'env' ? 'ENV' : 'Панель'} · \${esc(fmtDate(item.created_at))}</div>
          </div>
          \${item.source === 'env'
            ? '<button class="secondary" disabled>ENV</button>'
            : '<button class="danger" onclick="revokeAccess(\\'\${item.phone}\\')">Убрать</button>'}
        </div>
      \`).join('') : '<div class="empty">Список пуст.</div>';
    }

    async function selectChat(phone) {
      selectedPhone = phone;
      renderChats();
      const chat = chats.find(item => item.phone === phone) || {};
      document.getElementById('chatTitle').textContent = phone;
      document.getElementById('chatMeta').textContent = chat.name || '';
      document.getElementById('sendBtn').disabled = false;
      document.getElementById('grantSelected').disabled = false;
      document.getElementById('messages').innerHTML = '<div class="empty">Загрузка...</div>';
      try {
        const data = await api('/admin/api/chats/' + encodeURIComponent(phone) + '/messages');
        renderMessages(data.messages || []);
      } catch (err) {
        document.getElementById('messages').innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
      }
    }

    function renderMessages(messages) {
      const root = document.getElementById('messages');
      root.innerHTML = messages.length ? messages.map(msg => \`
        <div class="msg \${msg.direction === 'out' ? 'out' : 'in'}">
          <div>\${esc(msg.body || '')}</div>
          <div class="msg-time">\${msg.direction === 'out' ? 'Вы' : esc(msg.phone)} · \${esc(fmtDate(msg.created_at))}</div>
        </div>
      \`).join('') : '<div class="empty">История пуста.</div>';
      root.scrollTop = root.scrollHeight;
    }

    async function sendMessage() {
      if (!selectedPhone) return;
      const input = document.getElementById('replyText');
      const text = input.value.trim();
      if (!text) return;
      document.getElementById('sendBtn').disabled = true;
      try {
        await api('/admin/api/chats/' + encodeURIComponent(selectedPhone) + '/messages', {
          method: 'POST',
          body: JSON.stringify({ text }),
        });
        input.value = '';
        await selectChat(selectedPhone);
        await loadAll();
      } catch (err) {
        setStatus(err.message);
      } finally {
        document.getElementById('sendBtn').disabled = false;
      }
    }

    async function grantAccess(phone) {
      const cleaned = cleanPhone(phone);
      if (!cleaned) return;
      await api('/admin/api/access', {
        method: 'POST',
        body: JSON.stringify({ phone: cleaned }),
      });
      await loadAll();
      if (selectedPhone) renderChats();
    }

    async function grantSelected() {
      if (selectedPhone) await grantAccess(selectedPhone);
    }

    async function grantAccessFromInput() {
      const input = document.getElementById('accessPhone');
      await grantAccess(input.value);
      input.value = '';
    }

    async function revokeAccess(phone) {
      await api('/admin/api/access/' + encodeURIComponent(phone), { method: 'DELETE' });
      await loadAll();
    }

    loadAll();
  </script>
</body>
</html>`;
}

module.exports = { renderAdminPage, renderLoginPage };
