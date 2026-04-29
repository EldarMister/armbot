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
  <title>Вход в ARM Admin</title>
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
    h1 { margin: 0 0 6px; font-size: 22px; line-height: 1.2; }
    .hint { margin: 0 0 22px; color: var(--muted); font-size: 14px; }
    label { display: block; margin: 14px 0 6px; font-size: 13px; font-weight: 700; }
    input, button { width: 100%; font: inherit; border-radius: 6px; }
    input {
      border: 1px solid var(--line);
      padding: 11px 12px;
      outline: none;
      background: #fff;
    }
    input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.14); }
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
    <h1>ARM Admin</h1>
    <p class="hint">Единая панель для WhatsApp, ARM Telegram и Encar Fresh.</p>
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
  <title>ARM Unified Admin</title>
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
      --soft-blue: #eef4ff;
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
      min-height: 62px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 20px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    h1 { margin: 0; font-size: 19px; font-weight: 700; }
    h2 { margin: 0; font-size: 16px; }
    h3 { margin: 0; font-size: 14px; }
    input, textarea, select, button { font: inherit; }
    input, textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px 10px;
      outline: none;
      background: #fff;
    }
    textarea { resize: vertical; }
    input:focus, textarea:focus, select:focus { border-color: var(--brand); }
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
    button.secondary { background: #e8edf3; color: var(--text); }
    button.danger { background: var(--danger); }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .header-actions, .tabs, .toolbar, .row-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .admin-user, .status, .meta, .muted {
      color: var(--muted);
      font-size: 12px;
    }
    .logout-form { margin: 0; }
    .tabs {
      padding: 12px 20px 0;
      background: var(--bg);
      overflow-x: auto;
    }
    .tab {
      background: #e8edf3;
      color: var(--text);
      border: 1px solid var(--line);
    }
    .tab.active {
      background: var(--brand);
      border-color: var(--brand);
      color: #fff;
    }
    .tab-panel {
      display: none;
      padding: 16px;
      height: calc(100vh - 112px);
      min-height: 620px;
    }
    .tab-panel.active { display: block; }
    section, .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .section-head {
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
    }
    .section-title { font-size: 14px; font-weight: 700; }
    .side-form {
      padding: 12px 14px;
      display: grid;
      gap: 8px;
      border-bottom: 1px solid var(--line);
    }
    .list {
      overflow: auto;
      min-height: 0;
    }
    .empty {
      color: var(--muted);
      padding: 16px;
    }
    .badge, .pill {
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
    .whatsapp-grid {
      display: grid;
      grid-template-columns: 320px 1fr 320px;
      gap: 16px;
      height: 100%;
      min-height: 0;
    }
    .chat-row, .access-row, .subscription-row, .item-row {
      padding: 9px 12px;
      border-bottom: 1px solid var(--line);
    }
    .chat-row { cursor: pointer; }
    .chat-row:hover, .chat-row.active { background: var(--soft); }
    .phone, .strong { font-weight: 700; font-size: 14px; }
    .name, .preview {
      color: var(--muted);
      font-size: 12px;
      margin-top: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .messages {
      flex: 1;
      overflow: auto;
      padding: 12px 14px;
      background: #fafbfc;
    }
    .msg {
      display: block;
      width: fit-content;
      max-width: min(720px, 86%);
      margin: 0 0 8px;
      padding: 7px 9px;
      border-radius: 7px;
      border: 1px solid var(--line);
      background: #fff;
      font-size: 14px;
      line-height: 1.35;
      overflow: visible;
    }
    .msg.in { margin-right: auto; }
    .msg.out {
      margin-left: auto;
      background: #e8f5f3;
      border-color: #c8e7e3;
    }
    .msg-body {
      display: block;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
      line-height: 1.35;
    }
    .msg-time {
      margin-top: 4px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.2;
      white-space: nowrap;
    }
    .composer {
      border-top: 1px solid var(--line);
      padding: 10px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
    }
    .composer textarea { min-height: 50px; max-height: 140px; }
    .access-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
    }
    .section-subhead {
      padding: 12px 14px;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .admin-grid {
      display: grid;
      grid-template-columns: minmax(360px, 1fr) minmax(360px, 1fr);
      gap: 16px;
      height: 100%;
      min-height: 0;
    }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(120px, 1fr));
      gap: 10px;
      padding: 12px;
      border-bottom: 1px solid var(--line);
    }
    .stat-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: #fff;
    }
    .stat-value { margin-top: 4px; font-size: 20px; font-weight: 700; }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 140px auto;
      gap: 8px;
      padding: 12px;
      border-bottom: 1px solid var(--line);
    }
    .wide-panel {
      display: grid;
      grid-template-rows: auto 1fr;
      min-height: 0;
    }
    .log-box {
      margin: 12px;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #0f172a;
      color: #e5e7eb;
      font-family: Consolas, monospace;
      font-size: 12px;
      overflow: auto;
      white-space: pre-wrap;
      min-height: 180px;
    }
    .action-block {
      padding: 12px;
      display: grid;
      gap: 10px;
      border-bottom: 1px solid var(--line);
    }
    @media (max-width: 1100px) {
      .whatsapp-grid, .admin-grid {
        grid-template-columns: 1fr;
        height: auto;
      }
      .tab-panel { height: auto; }
      section, .panel { min-height: 360px; }
      .form-grid { grid-template-columns: 1fr; }
      .card-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <h1>ARM Unified Admin</h1>
    <div class="header-actions">
      <div class="admin-user">${safeUser}</div>
      <div class="status" id="status">Загрузка...</div>
      <form class="logout-form" method="post" action="/admin/logout">
        <button class="secondary" type="submit">Выйти</button>
      </form>
    </div>
  </header>

  <nav class="tabs">
    <button class="tab active" data-tab="whatsapp" type="button">WhatsApp ARM</button>
    <button class="tab" data-tab="telegram" type="button">Telegram ARM</button>
    <button class="tab" data-tab="encar" type="button">Encar Fresh</button>
  </nav>

  <main>
    <div class="tab-panel active" id="tab-whatsapp">
      <div class="whatsapp-grid">
        <section>
          <div class="section-head">
            <div class="section-title">Чаты</div>
            <button class="secondary" onclick="loadWhatsapp()">Обновить</button>
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
          <div class="section-subhead">
            <div class="section-title">Подписки WhatsApp</div>
            <button class="secondary" onclick="runSubscriptionCheck()">Проверить</button>
          </div>
          <div class="list" id="subscriptions"></div>
        </section>
      </div>
    </div>

    <div class="tab-panel" id="tab-telegram">
      <div class="admin-grid">
        <section>
          <div class="section-head">
            <div class="section-title">Пользователи Telegram ARM</div>
            <button class="secondary" onclick="loadTelegram()">Обновить</button>
          </div>
          <div class="form-grid">
            <input id="tgChatId" placeholder="Telegram ID">
            <input id="tgName" placeholder="Имя">
            <select id="tgRole">
              <option value="user">user</option>
              <option value="staff">staff</option>
              <option value="admin">admin</option>
            </select>
            <button onclick="saveTelegramUserFromForm()">Сохранить</button>
          </div>
          <div class="list" id="telegramUsers"></div>
        </section>

        <section>
          <div class="section-head">
            <div class="section-title">Подписки Telegram ARM</div>
            <button class="secondary" onclick="runTelegramCheck()">Проверить</button>
          </div>
          <div class="list" id="telegramSubscriptions"></div>
        </section>
      </div>
    </div>

    <div class="tab-panel" id="tab-encar">
      <div class="admin-grid">
        <section class="wide-panel">
          <div>
            <div class="section-head">
              <div class="section-title">Encar Fresh Bot</div>
              <button class="secondary" onclick="loadEncar()">Обновить</button>
            </div>
            <div class="card-grid" id="encarStats"></div>
          </div>
          <div class="list" id="encarUsers"></div>
        </section>

        <section class="wide-panel">
          <div>
            <div class="section-head">
              <div class="section-title">Действия и логи</div>
              <button class="secondary" onclick="loadEncarLogs()">Логи</button>
            </div>
            <div class="action-block">
              <textarea id="encarBroadcastText" rows="3" placeholder="Сообщение всем пользователям Encar Fresh"></textarea>
              <div class="toolbar">
                <button onclick="sendEncarBroadcast()">Рассылка</button>
                <button class="secondary" onclick="encarStopAll()">Остановить всех</button>
                <button class="danger" onclick="encarClearSeen()">Очистить seen</button>
              </div>
            </div>
          </div>
          <div class="log-box" id="encarLogs">Логи появятся здесь.</div>
        </section>
      </div>
    </div>
  </main>

  <script>
    var activeTab = 'whatsapp';
    var chats = [];
    var access = [];
    var subscriptions = [];
    var selectedPhone = null;
    var telegramUsers = [];
    var telegramSubscriptions = [];
    var encarConfigured = false;

    async function api(url, options) {
      options = options || {};
      var res = await fetch(url, {
        headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
        method: options.method || 'GET',
        body: options.body,
      });
      if (!res.ok) {
        if (res.status === 401) window.location.href = '/admin/login';
        var data = await res.json().catch(function(){ return {}; });
        throw new Error(data.error || res.statusText);
      }
      return res.json();
    }

    function esc(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[ch];
      });
    }

    function cleanPhone(value) {
      return String(value || '').replace(/\\D/g, '');
    }

    function fmtDate(value) {
      if (!value) return '';
      var d = new Date(value);
      if (!Number.isFinite(d.getTime())) return '';
      return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    function setStatus(text) {
      document.getElementById('status').textContent = text;
    }

    function formatMessageBody(value) {
      return esc(String(value == null ? '' : value).trim())
        .replace(/\\*([^*\\n]{1,160})\\*/g, '<strong>$1</strong>')
        .replace(/_([^_\\n]{1,160})_/g, '<em>$1</em>');
    }

    function summaryText(summary) {
      summary = summary || {};
      return 'Проверено: ' + (summary.subscriptions || 0) +
        ', изменений: ' + (summary.changed || 0) +
        ', отправлено: ' + (summary.sent || 0) +
        ', ошибок: ' + (summary.failed || 0);
    }

    document.querySelectorAll('.tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        activeTab = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab').forEach(function(item) { item.classList.toggle('active', item === btn); });
        document.querySelectorAll('.tab-panel').forEach(function(panel) {
          panel.classList.toggle('active', panel.id === 'tab-' + activeTab);
        });
        if (activeTab === 'whatsapp') loadWhatsapp();
        if (activeTab === 'telegram') loadTelegram();
        if (activeTab === 'encar') loadEncar();
      });
    });

    async function loadWhatsapp() {
      try {
        setStatus('Загрузка WhatsApp...');
        var data = await Promise.all([
          api('/admin/api/chats'),
          api('/admin/api/access'),
          api('/admin/api/subscriptions'),
        ]);
        chats = data[0].chats || [];
        access = data[1].access || [];
        subscriptions = data[2].subscriptions || [];
        renderChats();
        renderAccess();
        renderSubscriptions();
        setStatus('Готово');
      } catch (err) {
        setStatus(err.message);
      }
    }

    function renderChats() {
      var q = document.getElementById('chatSearch').value.toLowerCase().trim();
      var root = document.getElementById('chats');
      var rows = chats.filter(function(chat) {
        var haystack = [chat.phone, chat.name, chat.last_message].filter(Boolean).join(' ').toLowerCase();
        return !q || haystack.indexOf(q) >= 0;
      });
      root.innerHTML = rows.length ? rows.map(function(chat) {
        return '<div class="chat-row ' + (selectedPhone === chat.phone ? 'active' : '') + '" onclick="selectChat(\\'' + esc(chat.phone) + '\\')">' +
          '<div class="phone">' + esc(chat.phone) + '</div>' +
          '<div class="name">' + esc(chat.name || 'Без имени') + '</div>' +
          '<div class="preview">' + esc(chat.last_message || '') + '</div>' +
          '<div class="meta">' + esc(fmtDate(chat.last_message_at || chat.added_at)) + '</div>' +
          (chat.docs_access ? '<span class="badge">Документы</span>' : '') +
          '</div>';
      }).join('') : '<div class="empty">Чатов пока нет.</div>';
    }

    function renderAccess() {
      var root = document.getElementById('access');
      root.innerHTML = access.length ? access.map(function(item) {
        return '<div class="access-row"><div>' +
          '<div class="phone">' + esc(item.phone) + '</div>' +
          '<div class="meta">' + (item.source === 'env' ? 'ENV' : 'Панель') + ' · ' + esc(fmtDate(item.created_at)) + '</div>' +
          '</div>' +
          (item.source === 'env'
            ? '<button class="secondary" disabled>ENV</button>'
            : '<button class="danger" onclick="revokeAccess(\\'' + esc(item.phone) + '\\')">Убрать</button>') +
          '</div>';
      }).join('') : '<div class="empty">Список пуст.</div>';
    }

    function renderSubscriptions() {
      var root = document.getElementById('subscriptions');
      root.innerHTML = subscriptions.length ? subscriptions.map(function(item) {
        return '<div class="subscription-row">' +
          '<div class="phone">' + esc(item.container) + '</div>' +
          '<div class="meta">' + esc((item.phones || []).join(', ')) + '</div>' +
          '<div class="meta">' + esc(item.phone_count || 0) + ' номер(ов) · обновлено ' + esc(fmtDate(item.last_updated_at) || '—') + '</div>' +
          '</div>';
      }).join('') : '<div class="empty">Нет подписок WhatsApp.</div>';
    }

    async function selectChat(phone) {
      selectedPhone = phone;
      renderChats();
      var chat = chats.find(function(item) { return item.phone === phone; }) || {};
      document.getElementById('chatTitle').textContent = phone;
      document.getElementById('chatMeta').textContent = chat.name || '';
      document.getElementById('sendBtn').disabled = false;
      document.getElementById('grantSelected').disabled = false;
      document.getElementById('messages').innerHTML = '<div class="empty">Загрузка...</div>';
      try {
        var data = await api('/admin/api/chats/' + encodeURIComponent(phone) + '/messages?limit=5000');
        renderMessages(data.messages || []);
      } catch (err) {
        document.getElementById('messages').innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
      }
    }

    function renderMessages(messages) {
      var root = document.getElementById('messages');
      root.innerHTML = messages.length ? messages.map(function(msg) {
        return '<div class="msg ' + (msg.direction === 'out' ? 'out' : 'in') + '">' +
          '<div class="msg-body">' + formatMessageBody(msg.body) + '</div>' +
          '<div class="msg-time">' + (msg.direction === 'out' ? 'Вы' : esc(msg.phone)) + ' · ' + esc(fmtDate(msg.created_at)) + '</div>' +
          '</div>';
      }).join('') : '<div class="empty">История пуста.</div>';
      root.scrollTop = root.scrollHeight;
    }

    async function sendMessage() {
      if (!selectedPhone) return;
      var input = document.getElementById('replyText');
      var text = input.value.trim();
      if (!text) return;
      document.getElementById('sendBtn').disabled = true;
      try {
        await api('/admin/api/chats/' + encodeURIComponent(selectedPhone) + '/messages', {
          method: 'POST',
          body: JSON.stringify({ text: text }),
        });
        input.value = '';
        await selectChat(selectedPhone);
        await loadWhatsapp();
      } catch (err) {
        setStatus(err.message);
      } finally {
        document.getElementById('sendBtn').disabled = false;
      }
    }

    async function grantAccess(phone) {
      var cleaned = cleanPhone(phone);
      if (!cleaned) return;
      await api('/admin/api/access', { method: 'POST', body: JSON.stringify({ phone: cleaned }) });
      await loadWhatsapp();
      if (selectedPhone) renderChats();
    }

    async function grantSelected() {
      if (selectedPhone) await grantAccess(selectedPhone);
    }

    async function grantAccessFromInput() {
      var input = document.getElementById('accessPhone');
      await grantAccess(input.value);
      input.value = '';
    }

    async function revokeAccess(phone) {
      await api('/admin/api/access/' + encodeURIComponent(phone), { method: 'DELETE' });
      await loadWhatsapp();
    }

    async function runSubscriptionCheck() {
      try {
        setStatus('Проверка WhatsApp подписок...');
        var data = await api('/admin/api/subscriptions/check', { method: 'POST' });
        await loadWhatsapp();
        if (selectedPhone) await selectChat(selectedPhone);
        setStatus(summaryText(data.summary));
      } catch (err) {
        setStatus(err.message);
      }
    }

    async function loadTelegram() {
      try {
        setStatus('Загрузка Telegram ARM...');
        var data = await Promise.all([
          api('/admin/api/telegram/users'),
          api('/admin/api/telegram/subscriptions'),
        ]);
        telegramUsers = data[0].users || [];
        telegramSubscriptions = data[1].subscriptions || [];
        renderTelegramUsers();
        renderTelegramSubscriptions();
        setStatus('Готово');
      } catch (err) {
        setStatus(err.message);
      }
    }

    function roleButtons(user) {
      var roles = ['user', 'staff', 'admin'];
      return roles.map(function(role) {
        return '<button class="' + (user.role === role ? '' : 'secondary') + '" onclick="setTelegramRole(\\'' + esc(user.chat_id) + '\\',\\'' + role + '\\')">' + role + '</button>';
      }).join('');
    }

    function renderTelegramUsers() {
      var root = document.getElementById('telegramUsers');
      root.innerHTML = telegramUsers.length ? telegramUsers.map(function(user) {
        var label = user.username ? '@' + user.username : (user.name || 'Без имени');
        return '<div class="item-row">' +
          '<div class="toolbar" style="justify-content:space-between;align-items:flex-start">' +
          '<div><div class="strong">' + esc(user.chat_id) + '</div><div class="meta">' + esc(label) + ' · ' + esc(user.role) + '</div></div>' +
          '<div class="row-actions">' + roleButtons(user) + '<button class="danger" onclick="deleteTelegramUser(\\'' + esc(user.chat_id) + '\\')">Удалить</button></div>' +
          '</div></div>';
      }).join('') : '<div class="empty">Пользователей пока нет.</div>';
    }

    function renderTelegramSubscriptions() {
      var root = document.getElementById('telegramSubscriptions');
      root.innerHTML = telegramSubscriptions.length ? telegramSubscriptions.map(function(item) {
        return '<div class="subscription-row">' +
          '<div class="phone">' + esc(item.container) + '</div>' +
          '<div class="meta">' + esc((item.chat_ids || []).join(', ')) + '</div>' +
          '<div class="meta">' + esc(item.chat_count || 0) + ' chat_id · обновлено ' + esc(fmtDate(item.last_updated_at) || '—') + '</div>' +
          '</div>';
      }).join('') : '<div class="empty">Нет подписок Telegram ARM.</div>';
    }

    async function saveTelegramUserFromForm() {
      var chatId = document.getElementById('tgChatId').value.trim();
      var name = document.getElementById('tgName').value.trim();
      var role = document.getElementById('tgRole').value;
      if (!chatId) return;
      await api('/admin/api/telegram/users', {
        method: 'POST',
        body: JSON.stringify({ chat_id: chatId, name: name, role: role }),
      });
      document.getElementById('tgChatId').value = '';
      document.getElementById('tgName').value = '';
      await loadTelegram();
    }

    async function setTelegramRole(chatId, role) {
      var current = telegramUsers.find(function(user) { return String(user.chat_id) === String(chatId); }) || {};
      await api('/admin/api/telegram/users', {
        method: 'POST',
        body: JSON.stringify({ chat_id: chatId, name: current.name || '', username: current.username || '', role: role }),
      });
      await loadTelegram();
    }

    async function deleteTelegramUser(chatId) {
      if (!confirm('Удалить Telegram пользователя ' + chatId + '?')) return;
      await api('/admin/api/telegram/users/' + encodeURIComponent(chatId), { method: 'DELETE' });
      await loadTelegram();
    }

    async function runTelegramCheck() {
      try {
        setStatus('Проверка Telegram ARM подписок...');
        var data = await api('/admin/api/telegram/subscriptions/check', { method: 'POST' });
        await loadTelegram();
        setStatus(summaryText(data.summary));
      } catch (err) {
        setStatus(err.message);
      }
    }

    async function loadEncar() {
      try {
        setStatus('Загрузка Encar...');
        var status = await api('/admin/api/encar/status');
        encarConfigured = Boolean(status.configured);
        if (!encarConfigured) {
          document.getElementById('encarStats').innerHTML = '<div class="empty">Укажите ENCAR_ADMIN_URL и ENCAR_ADMIN_TOKEN в Railway env основного arm проекта.</div>';
          document.getElementById('encarUsers').innerHTML = '';
          document.getElementById('encarLogs').textContent = 'Encar admin не подключен.';
          setStatus('Encar не подключен');
          return;
        }
        var data = await Promise.all([
          api('/admin/api/encar/stats'),
          api('/admin/api/encar/users'),
          api('/admin/api/encar/logs?limit=120'),
        ]);
        renderEncarStats(data[0]);
        renderEncarUsers(data[1].users || []);
        renderEncarLogs(data[2].items || []);
        setStatus('Готово');
      } catch (err) {
        setStatus(err.message);
      }
    }

    function renderEncarStats(data) {
      data = data || {};
      var users = data.users || {};
      var seen = data.seen || {};
      var cards = [
        ['Пользователи', users.total || 0, 'активных ' + (users.active || 0)],
        ['Фильтры', users.totalFilters || 0, 'в работе'],
        ['Seen', seen.listings || seen.total || 0, 'объявлений'],
        ['Аптайм', data.uptime || '—', 'бот'],
      ];
      document.getElementById('encarStats').innerHTML = cards.map(function(card) {
        return '<div class="stat-card"><div class="meta">' + esc(card[0]) + '</div><div class="stat-value">' + esc(card[1]) + '</div><div class="meta">' + esc(card[2]) + '</div></div>';
      }).join('');
    }

    function renderEncarUsers(users) {
      var root = document.getElementById('encarUsers');
      root.innerHTML = users.length ? users.map(function(user) {
        var name = [user.firstName, user.lastName].filter(Boolean).join(' ') || (user.username ? '@' + user.username : 'Без имени');
        var filters = (user.filters || []).map(function(filter) { return filter.label; }).join(', ') || 'без фильтров';
        return '<div class="item-row">' +
          '<div class="toolbar" style="justify-content:space-between;align-items:flex-start">' +
          '<div><div class="strong">' + esc(user.chatId) + '</div><div class="meta">' + esc(name) + ' · ' + (user.isActive ? 'активен' : 'остановлен') + '</div><div class="meta">' + esc(filters) + '</div></div>' +
          '<div class="row-actions">' +
          (user.isActive
            ? '<button class="danger" onclick="encarUserAction(\\'' + esc(user.chatId) + '\\',\\'stop\\')">Остановить</button>'
            : '<button onclick="encarUserAction(\\'' + esc(user.chatId) + '\\',\\'start\\')">Запустить</button>') +
          '</div></div></div>';
      }).join('') : '<div class="empty">Пользователей Encar пока нет.</div>';
    }

    function renderEncarLogs(items) {
      var root = document.getElementById('encarLogs');
      root.textContent = items.length ? items.map(function(item) {
        return '[' + (item.level || 'info') + '] ' + (item.ts || item.time || '') + ' ' + (item.text || item.message || '');
      }).join('\\n') : 'Логов пока нет.';
    }

    async function loadEncarLogs() {
      try {
        var data = await api('/admin/api/encar/logs?limit=300');
        renderEncarLogs(data.items || []);
      } catch (err) {
        setStatus(err.message);
      }
    }

    async function encarUserAction(chatId, action) {
      await api('/admin/api/encar/user/' + encodeURIComponent(chatId) + '/' + action, { method: 'POST' });
      await loadEncar();
    }

    async function encarStopAll() {
      if (!confirm('Остановить парсинг у всех пользователей Encar?')) return;
      var data = await api('/admin/api/encar/stop-all', { method: 'POST' });
      setStatus('Остановлено: ' + (data.stopped || 0));
      await loadEncar();
    }

    async function encarClearSeen() {
      if (!confirm('Очистить seen историю Encar? Новые объявления могут отправиться повторно.')) return;
      var data = await api('/admin/api/encar/clear-seen', { method: 'POST' });
      setStatus('Очищено: ' + (data.listings || 0) + ' listings, ' + (data.vins || 0) + ' vins');
      await loadEncar();
    }

    async function sendEncarBroadcast() {
      var input = document.getElementById('encarBroadcastText');
      var text = input.value.trim();
      if (!text) return;
      var data = await api('/admin/api/encar/broadcast', {
        method: 'POST',
        body: JSON.stringify({ text: text }),
      });
      setStatus('Рассылка: отправлено ' + (data.sent || 0) + ', ошибок ' + (data.failed || 0));
      input.value = '';
      await loadEncarLogs();
    }

    loadWhatsapp();
  </script>
</body>
</html>`;
}

module.exports = { renderAdminPage, renderLoginPage };
