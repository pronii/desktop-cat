const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_INITIAL_CHECK_MS = 30 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

function parseVersion(version) {
  return String(version || '')
    .trim()
    .split(/[.-]/)
    .map((part) => {
      const value = Number.parseInt(part, 10);
      return Number.isFinite(value) ? value : 0;
    });
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] || 0;
    const rightValue = rightParts[index] || 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
}

function validateManifest(rawManifest) {
  if (!rawManifest || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
    throw new Error('Update manifest must be an object');
  }

  const version = String(rawManifest.version || '').trim();
  if (!version) {
    throw new Error('Update manifest requires a version');
  }

  const url = String(rawManifest.url || '').trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (_error) {
    throw new Error('Update manifest requires a valid download url');
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error('Update download url must use http or https');
  }

  const sha256 = String(rawManifest.sha256 || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error('Update manifest requires a sha256 hash');
  }

  return {
    ...rawManifest,
    version,
    url,
    sha256,
    mandatory: rawManifest.mandatory === true,
    notes: String(rawManifest.notes || '').trim()
  };
}

function bufferFromArrayBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return Buffer.from(value);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function quotePowerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function safeVersionName(version) {
  return String(version).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function createInstallScript({ scriptPath, downloadPath, executablePath, processId }) {
  const script = [
    '$ErrorActionPreference = "Stop"',
    `$source = ${quotePowerShellLiteral(downloadPath)}`,
    `$target = ${quotePowerShellLiteral(executablePath)}`,
    `Wait-Process -Id ${Number(processId)} -ErrorAction SilentlyContinue`,
    'Start-Sleep -Milliseconds 500',
    'Copy-Item -LiteralPath $source -Destination $target -Force',
    'Start-Process -FilePath $target'
  ].join('\r\n');

  fs.writeFileSync(scriptPath, script, 'utf8');
}

function resolveStreamManifestUrl(streamUrl, manifestUrl) {
  if (!manifestUrl) return null;
  try {
    return new URL(manifestUrl).toString();
  } catch (_error) {
    const base = new URL(streamUrl);
    base.protocol = base.protocol === 'wss:' ? 'https:' : 'http:';
    return new URL(manifestUrl, base).toString();
  }
}

function createUpdateManager(options = {}) {
  const app = options.app || {};
  const dialog = options.dialog || {};
  const fetchImpl = options.fetch || globalThis.fetch;
  const WebSocketImpl = options.WebSocket;
  const spawn = options.spawn || childProcess.spawn;
  const logger = options.logger || console;
  const promptForUpdate = options.promptForUpdate;
  const promptForRestart = options.promptForRestart;
  const currentVersion = options.currentVersion || app.getVersion?.() || '0.0.0';
  const executablePath = options.executablePath || process.execPath;
  const userDataPath = options.userDataPath || app.getPath?.('userData');
  let manifestUrl = options.manifestUrl || null;
  const streamUrl = options.streamUrl || null;
  const initialCheckMs = options.initialCheckMs ?? DEFAULT_INITIAL_CHECK_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  let checkTimer = null;
  let pollTimer = null;
  let streamSocket = null;
  let checking = false;

  function isConfigured() {
    return Boolean(manifestUrl && fetchImpl && userDataPath);
  }

  async function showMessageBox(messageOptions) {
    if (!dialog.showMessageBox) {
      return { response: 0 };
    }
    return dialog.showMessageBox({
      type: 'info',
      ...messageOptions
    });
  }

  async function confirmUpdateDownload(manifest, { userInitiated }) {
    if (!manifest.mandatory && typeof promptForUpdate === 'function') {
      return Boolean(await promptForUpdate(manifest, { userInitiated }));
    }

    const prompt = await showMessageBox({
      title: '发现新版本',
      message: `发现 desktop-cat ${manifest.version}，是否下载更新？`,
      detail: manifest.notes,
      buttons: manifest.mandatory ? ['下载更新', '退出'] : ['下载更新', '稍后'],
      cancelId: manifest.mandatory ? 1 : 1,
      defaultId: 0
    });
    return prompt.response === 0;
  }

  async function confirmUpdateRestart(manifest, prepared) {
    if (!manifest.mandatory && typeof promptForRestart === 'function') {
      return Boolean(await promptForRestart(manifest, prepared));
    }

    const restartPrompt = await showMessageBox({
      title: '更新已准备好',
      message: `desktop-cat ${manifest.version} 已下载完成，是否现在重启完成更新？`,
      buttons: ['立即重启', '稍后'],
      cancelId: 1,
      defaultId: 0
    });
    return restartPrompt.response === 0;
  }

  async function fetchManifest() {
    const response = await fetchImpl(manifestUrl, {
      headers: {
        Accept: 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error(`Update manifest request failed with HTTP ${response.status}`);
    }
    return validateManifest(await response.json());
  }

  async function downloadUpdate(manifest) {
    const response = await fetchImpl(manifest.url);
    if (!response.ok) {
      throw new Error(`Update download failed with HTTP ${response.status}`);
    }

    const body = bufferFromArrayBuffer(await response.arrayBuffer());
    const actualSha256 = sha256(body);
    if (actualSha256 !== manifest.sha256) {
      throw new Error('Downloaded update sha256 does not match the manifest');
    }

    const updateDir = path.join(userDataPath, 'updates');
    fs.mkdirSync(updateDir, { recursive: true });

    const versionName = safeVersionName(manifest.version);
    const downloadPath = path.join(updateDir, `desktop-cat-${versionName}.exe`);
    const scriptPath = path.join(updateDir, `install-desktop-cat-${versionName}.ps1`);
    fs.writeFileSync(downloadPath, body);
    createInstallScript({
      scriptPath,
      downloadPath,
      executablePath,
      processId: process.pid
    });

    return {
      downloadPath,
      scriptPath
    };
  }

  function installPreparedUpdate(scriptPath) {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }
    );
    if (typeof child.unref === 'function') {
      child.unref();
    }
    if (typeof app.quit === 'function') {
      app.quit();
    }
  }

  async function checkNow({ userInitiated = false } = {}) {
    if (checking) {
      return { status: 'busy' };
    }

    if (!isConfigured()) {
      if (userInitiated) {
        await showMessageBox({
          title: '检查更新',
          message: '更新地址还没有配置。',
          buttons: ['知道了']
        });
      }
      return { status: 'disabled' };
    }

    checking = true;
    try {
      const manifest = await fetchManifest();
      if (compareVersions(manifest.version, currentVersion) <= 0) {
        if (userInitiated) {
          await showMessageBox({
            title: '检查更新',
            message: `当前已是最新版本 ${currentVersion}。`,
            buttons: ['知道了']
          });
        }
        return { status: 'up-to-date', manifest };
      }

      const shouldDownload = await confirmUpdateDownload(manifest, { userInitiated });

      if (!shouldDownload) {
        if (manifest.mandatory && typeof app.quit === 'function') {
          app.quit();
        }
        return { status: 'declined', manifest };
      }

      const prepared = await downloadUpdate(manifest);
      const shouldRestart = await confirmUpdateRestart(manifest, prepared);

      const result = {
        status: 'ready',
        manifest,
        ...prepared
      };

      if (shouldRestart) {
        installPreparedUpdate(prepared.scriptPath);
        return {
          ...result,
          status: 'installing'
        };
      }

      return result;
    } catch (error) {
      if (userInitiated) {
        await showMessageBox({
          type: 'error',
          title: '更新失败',
          message: error.message,
          buttons: ['知道了']
        });
      }
      throw error;
    } finally {
      checking = false;
    }
  }

  function connectStream() {
    if (!streamUrl || !WebSocketImpl || streamSocket) {
      return;
    }

    try {
      const socket = new WebSocketImpl(streamUrl);
      streamSocket = socket;
      socket.addEventListener('message', (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch (_error) {
          return;
        }
        if (message.type !== 'update:available') return;
        if (message.manifestUrl) {
          manifestUrl = resolveStreamManifestUrl(streamUrl, message.manifestUrl);
        }
        if (compareVersions(message.version, currentVersion) > 0) {
          checkNow({ userInitiated: false }).catch((error) => {
            logger.warn?.(`Update push check failed: ${error.message}`);
          });
        }
      });
      socket.addEventListener('close', () => {
        streamSocket = null;
      });
      socket.addEventListener('error', (event) => {
        logger.warn?.(`Update stream failed: ${event.message || event.error?.message || 'unknown error'}`);
      });
    } catch (error) {
      logger.warn?.(`Update stream could not start: ${error.message}`);
    }
  }

  function start() {
    if (!isConfigured()) {
      connectStream();
      return;
    }
    checkTimer = setTimeout(() => {
      checkNow({ userInitiated: false }).catch((error) => {
        logger.warn?.(`Automatic update check failed: ${error.message}`);
      });
    }, initialCheckMs);
    pollTimer = setInterval(() => {
      checkNow({ userInitiated: false }).catch((error) => {
        logger.warn?.(`Automatic update check failed: ${error.message}`);
      });
    }, pollIntervalMs);

    if (typeof checkTimer.unref === 'function') checkTimer.unref();
    if (typeof pollTimer.unref === 'function') pollTimer.unref();
    connectStream();
  }

  function stop() {
    if (checkTimer) {
      clearTimeout(checkTimer);
      checkTimer = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (streamSocket && typeof streamSocket.close === 'function') {
      streamSocket.close();
    }
    streamSocket = null;
  }

  return {
    checkNow,
    start,
    stop,
    installPreparedUpdate
  };
}

function resolveUpdateConfig(env = process.env) {
  return {
    manifestUrl: env.DESKTOP_CAT_UPDATE_MANIFEST_URL || null,
    streamUrl: env.DESKTOP_CAT_UPDATE_STREAM_URL || null
  };
}

module.exports = {
  compareVersions,
  createUpdateManager,
  resolveUpdateConfig,
  validateManifest
};
