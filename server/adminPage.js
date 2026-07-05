function jsonForScript(value) {
  return JSON.stringify(String(value || '')).replace(/</g, '\\u003c');
}

function createAdminPage({ token = '' } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>desktop-cat Admin</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f6f7f9; color: #20242a; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 24px; margin: 0 0 18px; }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
    .metric { background: #fff; border: 1px solid #d9dee7; border-radius: 8px; padding: 14px; }
    .metric span { display: block; color: #5d6878; font-size: 12px; }
    .metric strong { display: block; font-size: 26px; margin-top: 4px; }
    section { background: #fff; border: 1px solid #d9dee7; border-radius: 8px; margin-top: 14px; overflow: auto; }
    h2 { font-size: 16px; margin: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-top: 1px solid #e5e8ee; padding: 8px 10px; text-align: left; white-space: nowrap; }
    th { background: #f0f3f8; color: #435064; }
    .status-active { color: #147a3b; font-weight: 700; }
    .status-revoked, .status-expired, .status-unlicensed, .status-device-limit-reached { color: #a2382f; font-weight: 700; }
    @media (max-width: 760px) { .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } main { padding: 14px; } }
  </style>
</head>
<body>
  <main>
    <h1>desktop-cat Admin</h1>
    <div class="metrics">
      <div class="metric"><span>Online connections</span><strong id="onlineConnections">0</strong></div>
      <div class="metric"><span>Online devices</span><strong id="onlineDevices">0</strong></div>
      <div class="metric"><span>Authorized devices</span><strong id="authorizedOnlineDevices">0</strong></div>
      <div class="metric"><span>Unauthorized devices</span><strong id="unauthorizedOnlineDevices">0</strong></div>
    </div>
    <section>
      <h2>Online</h2>
      <table>
        <thead><tr><th>IP</th><th>Device</th><th>User</th><th>Room</th><th>Version</th><th>Platform</th><th>License</th><th>Last seen</th></tr></thead>
        <tbody id="onlineRows"></tbody>
      </table>
    </section>
    <section>
      <h2>Licenses</h2>
      <table>
        <thead><tr><th>ID</th><th>Prefix</th><th>Status</th><th>Device</th><th>Label</th><th>Version</th><th>Last IP</th><th>Activated</th><th>Expires</th></tr></thead>
        <tbody id="licenseRows"></tbody>
      </table>
    </section>
  </main>
  <script>
    const token = ${jsonForScript(token)};
    const auth = token ? { Authorization: 'Bearer ' + token } : {};
    const text = (value) => value == null || value === '' ? '-' : String(value);
    const time = (value) => value ? new Date(Number(value)).toLocaleString() : '-';
    const escapeHtml = (value) => text(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
    const statusClass = (value) => 'status-' + text(value).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const status = (value) => '<span class="' + statusClass(value) + '">' + escapeHtml(value) + '</span>';
    const row = (cells) => '<tr>' + cells.map((cell) => '<td>' + cell + '</td>').join('') + '</tr>';
    async function refresh() {
      const usage = await fetch('/admin/usage.json', { headers: auth }).then((response) => response.json());
      const licenses = await fetch('/admin/licenses.json', { headers: auth }).then((response) => response.json());
      for (const [key, value] of Object.entries(usage.metrics || {})) {
        const node = document.getElementById(key);
        if (node) node.textContent = value;
      }
      document.getElementById('onlineRows').innerHTML = (usage.connections || []).map((item) => row([
        escapeHtml(item.ip),
        escapeHtml(item.deviceId || item.deviceLabel),
        escapeHtml(item.nickname || item.userId),
        escapeHtml(item.roomCode),
        escapeHtml(item.appVersion),
        escapeHtml(item.platform),
        status(item.licenseStatus),
        escapeHtml(time(item.lastSeenAt))
      ])).join('');
      document.getElementById('licenseRows').innerHTML = (licenses.licenses || []).map((item) => row([
        escapeHtml(item.licenseId),
        escapeHtml(item.codePrefix),
        status(item.status),
        escapeHtml(item.deviceId),
        escapeHtml(item.deviceLabel),
        escapeHtml(item.appVersion),
        escapeHtml(item.lastIp),
        escapeHtml(time(item.activatedAt)),
        escapeHtml(time(item.expiresAt))
      ])).join('');
    }
    refresh().catch(console.error);
    setInterval(() => refresh().catch(console.error), 5000);
  </script>
</body>
</html>`;
}

module.exports = {
  createAdminPage
};
