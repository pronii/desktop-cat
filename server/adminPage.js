const BASE_STYLES = `
    :root {
      color-scheme: light;
      --bg: #f5f7fa;
      --surface: #ffffff;
      --surface-muted: #f0f4f8;
      --border: #d8e0ea;
      --text: #18202c;
      --muted: #5c6878;
      --primary: #1f6feb;
      --primary-hover: #1757ba;
      --success: #147a3b;
      --danger: #b42318;
      --warning: #9a5b00;
      --code-bg: #eef6ff;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 24px; line-height: 1.25; margin: 0 0 18px; }
    h2 { font-size: 16px; line-height: 1.35; margin: 0; padding: 14px; border-bottom: 1px solid var(--border); }
    section { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-top: 14px; overflow: hidden; }
    label { display: grid; gap: 6px; color: var(--muted); font-size: 13px; line-height: 1.35; }
    input { width: 100%; min-height: 44px; border: 1px solid var(--border); border-radius: 6px; padding: 9px 10px; color: var(--text); background: #fff; font: inherit; }
    input:focus { outline: 3px solid rgba(31, 111, 235, 0.18); border-color: var(--primary); }
    button { min-height: 44px; border: 0; border-radius: 6px; padding: 0 16px; background: var(--primary); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    button:hover { background: var(--primary-hover); }
    button:disabled { cursor: not-allowed; opacity: 0.58; }
    .notice { min-height: 22px; margin-top: 12px; font-size: 13px; color: var(--muted); }
    .notice.success { color: var(--success); }
    .notice.error { color: var(--danger); }
`;

function createAdminLoginPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>后台登录</title>
  <style>
${BASE_STYLES}
    body { min-height: 100vh; display: grid; place-items: center; padding: 16px; }
    main { width: min(420px, 100%); padding: 0; }
    .login-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 22px; }
    .login-panel p { margin: -8px 0 18px; color: var(--muted); font-size: 13px; line-height: 1.6; }
    .login-form { display: grid; gap: 14px; }
  </style>
</head>
<body>
  <main>
    <section class="login-panel">
      <h1>后台登录</h1>
      <p>请输入后台登录密码。服务端密钥不会出现在浏览器地址栏或页面脚本中。</p>
      <form id="loginForm" class="login-form">
        <label for="adminPassword">登录密码
          <input id="adminPassword" name="password" type="password" autocomplete="current-password" required autofocus>
        </label>
        <button id="loginButton" type="submit">登录</button>
      </form>
      <div id="loginMessage" class="notice" role="alert" aria-live="polite"></div>
    </section>
  </main>
  <script>
    const form = document.getElementById('loginForm');
    const button = document.getElementById('loginButton');
    const message = document.getElementById('loginMessage');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      button.disabled = true;
      button.textContent = '登录中...';
      message.className = 'notice';
      message.textContent = '';
      try {
        const response = await fetch('/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: document.getElementById('adminPassword').value })
        });
        if (!response.ok) {
          message.className = 'notice error';
          message.textContent = '登录密码不正确';
          return;
        }
        window.location.href = '/admin';
      } catch (_error) {
        message.className = 'notice error';
        message.textContent = '登录失败，请稍后重试';
      } finally {
        button.disabled = false;
        button.textContent = '登录';
      }
    });
  </script>
</body>
</html>`;
}

function createAdminPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>桌面猫服务后台</title>
  <style>
${BASE_STYLES}
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
    .topbar h1 { margin: 0; }
    .secondary { background: #eef2f7; color: #253449; }
    .secondary:hover { background: #dde6f0; }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
    .metric { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px; min-width: 0; }
    .metric span { display: block; color: var(--muted); font-size: 12px; line-height: 1.4; }
    .metric strong { display: block; font-size: 26px; line-height: 1.1; margin-top: 4px; font-variant-numeric: tabular-nums; }
    .panel-body { padding: 14px; }
    .form-grid { display: grid; grid-template-columns: repeat(4, minmax(140px, 1fr)); gap: 12px; align-items: end; }
    .created-codes { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; margin-top: 10px; }
    code { display: block; border: 1px solid #b9d7ff; border-radius: 6px; padding: 8px 10px; background: var(--code-bg); color: #123b68; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 13px; overflow-wrap: anywhere; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-top: 1px solid #e5eaf1; padding: 8px 10px; text-align: left; white-space: nowrap; }
    th { background: var(--surface-muted); color: #39485c; font-weight: 700; }
    td.empty { color: var(--muted); text-align: center; padding: 20px 10px; }
    .status-active { color: var(--success); font-weight: 700; }
    .status-revoked, .status-expired, .status-unlicensed, .status-device-limit-reached { color: var(--danger); font-weight: 700; }
    .status-unknown { color: var(--warning); font-weight: 700; }
    @media (max-width: 900px) {
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 560px) {
      main { padding: 14px; }
      .topbar { align-items: flex-start; flex-direction: column; }
      .metrics, .form-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <div class="topbar">
      <h1>桌面猫服务后台</h1>
      <button id="logoutButton" class="secondary" type="button">退出登录</button>
    </div>
    <div class="metrics">
      <div class="metric"><span>在线客户端数</span><strong id="onlineConnections">0</strong></div>
      <div class="metric"><span>在线设备数</span><strong id="onlineDevices">0</strong></div>
      <div class="metric"><span>已授权设备</span><strong id="authorizedOnlineDevices">0</strong></div>
      <div class="metric"><span>未授权设备</span><strong id="unauthorizedOnlineDevices">0</strong></div>
    </div>
    <section aria-labelledby="createLicenseTitle">
      <h2 id="createLicenseTitle">生成授权码</h2>
      <div class="panel-body">
        <form id="licenseForm" class="form-grid">
          <label for="licenseCount">生成数量
            <input id="licenseCount" name="count" type="number" min="1" max="100" value="1" required>
          </label>
          <label for="licenseMaxDevices">每码设备数
            <input id="licenseMaxDevices" name="maxDevices" type="number" min="1" max="100" value="1" required>
          </label>
          <label for="licenseExpiresAt">过期时间（可选）
            <input id="licenseExpiresAt" name="expiresAt" type="datetime-local">
          </label>
          <button id="createLicenseButton" type="submit">生成授权码</button>
        </form>
        <div id="licenseMessage" class="notice" role="status" aria-live="polite"></div>
        <div id="createdLicenses" class="created-codes"></div>
      </div>
    </section>
    <section>
      <h2>在线客户端</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>IP 地址</th><th>设备</th><th>用户</th><th>房间</th><th>版本</th><th>平台</th><th>授权状态</th><th>最后在线</th></tr></thead>
          <tbody id="onlineRows"></tbody>
        </table>
      </div>
    </section>
    <section>
      <h2>授权码列表</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>授权ID</th><th>前缀</th><th>状态</th><th>设备数</th><th>设备</th><th>设备名</th><th>版本</th><th>最后 IP</th><th>激活时间</th><th>过期时间</th></tr></thead>
          <tbody id="licenseRows"></tbody>
        </table>
      </div>
    </section>
  </main>
  <script>
    const STATUS_LABELS = {
      active: '有效',
      revoked: '已作废',
      expired: '已过期',
      unlicensed: '未授权',
      unknown: '未知',
      device_limit_reached: '设备数已满',
      'device-limit-reached': '设备数已满',
      invalid_request: '请求无效',
      not_found: '未找到'
    };
    const text = (value) => value == null || value === '' ? '-' : String(value);
    const time = (value) => value ? new Date(Number(value)).toLocaleString() : '-';
    const escapeHtml = (value) => text(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
    const statusText = (value) => STATUS_LABELS[text(value)] || text(value);
    const statusClass = (value) => 'status-' + text(value).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const status = (value) => '<span class="' + statusClass(value) + '">' + escapeHtml(statusText(value)) + '</span>';
    const row = (cells) => '<tr>' + cells.map((cell) => '<td>' + cell + '</td>').join('') + '</tr>';
    const emptyRow = (colspan, message) => '<tr><td class="empty" colspan="' + colspan + '">' + escapeHtml(message) + '</td></tr>';
    const setMessage = (message, type = '') => {
      const node = document.getElementById('licenseMessage');
      node.className = 'notice' + (type ? ' ' + type : '');
      node.textContent = message;
    };
    const renderCreatedLicenses = (licenses) => {
      document.getElementById('createdLicenses').innerHTML = (licenses || [])
        .map((item) => '<code>' + escapeHtml(item.code) + '</code>')
        .join('');
    };
    async function fetchJson(url, options = {}) {
      const response = await fetch(url, options);
      if (response.status === 401) {
        window.location.href = '/admin';
        throw new Error('登录已失效');
      }
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || '请求失败');
      }
      return data;
    }
    async function refresh() {
      const usage = await fetchJson('/admin/usage.json');
      const licenses = await fetchJson('/admin/licenses.json');
      for (const [key, value] of Object.entries(usage.metrics || {})) {
        const node = document.getElementById(key);
        if (node) node.textContent = value;
      }
      const onlineRows = (usage.connections || []).map((item) => row([
        escapeHtml(item.ip),
        escapeHtml(item.deviceLabel || item.deviceId),
        escapeHtml(item.nickname || item.userId),
        escapeHtml(item.roomCode),
        escapeHtml(item.appVersion),
        escapeHtml(item.platform),
        status(item.licenseStatus),
        escapeHtml(time(item.lastSeenAt))
      ]));
      document.getElementById('onlineRows').innerHTML = onlineRows.length
        ? onlineRows.join('')
        : emptyRow(8, '暂无在线客户端');
      const licenseRows = (licenses.licenses || []).map((item) => row([
        escapeHtml(item.licenseId),
        escapeHtml(item.codePrefix),
        status(item.status),
        escapeHtml(item.maxDevices),
        escapeHtml(item.deviceId),
        escapeHtml(item.deviceLabel),
        escapeHtml(item.appVersion),
        escapeHtml(item.lastIp),
        escapeHtml(time(item.activatedAt)),
        escapeHtml(time(item.expiresAt))
      ]));
      document.getElementById('licenseRows').innerHTML = licenseRows.length
        ? licenseRows.join('')
        : emptyRow(10, '暂无授权码');
    }
    document.getElementById('licenseForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = document.getElementById('createLicenseButton');
      const expiresAtValue = document.getElementById('licenseExpiresAt').value;
      const expiresAt = expiresAtValue ? new Date(expiresAtValue).getTime() : null;
      if (expiresAtValue && !Number.isFinite(expiresAt)) {
        setMessage('过期时间无效', 'error');
        return;
      }
      button.disabled = true;
      button.textContent = '生成中...';
      setMessage('');
      renderCreatedLicenses([]);
      try {
        const result = await fetchJson('/admin/licenses/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            count: document.getElementById('licenseCount').value,
            maxDevices: document.getElementById('licenseMaxDevices').value,
            expiresAt
          })
        });
        renderCreatedLicenses(result.licenses || []);
        setMessage('已生成 ' + (result.licenses || []).length + ' 个授权码', 'success');
        await refresh();
      } catch (error) {
        setMessage(error.message || '生成失败', 'error');
      } finally {
        button.disabled = false;
        button.textContent = '生成授权码';
      }
    });
    document.getElementById('logoutButton').addEventListener('click', async () => {
      await fetch('/admin/logout', { method: 'POST' }).catch(() => {});
      window.location.href = '/admin';
    });
    refresh().catch((error) => setMessage(error.message || '刷新失败', 'error'));
    setInterval(() => refresh().catch(console.error), 5000);
  </script>
</body>
</html>`;
}

module.exports = {
  createAdminLoginPage,
  createAdminPage
};
