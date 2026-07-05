const fs = require('node:fs');
const path = require('node:path');

const CACHE_MS = 7 * 24 * 60 * 60 * 1000;

function resolveLicenseEndpoint(env = process.env, roomEndpoint = '') {
  const configured = String(env.DESKTOP_CAT_LICENSE_ENDPOINT || '').trim();
  if (configured) return configured.replace(/\/+$/, '');

  const url = new URL(roomEndpoint);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

function createLicenseClient({
  endpoint,
  userDataPath,
  deviceInfo = {},
  fetch = globalThis.fetch,
  now = Date.now
} = {}) {
  if (!endpoint) throw new Error('license endpoint is required');
  if (!userDataPath) throw new Error('userDataPath is required');
  if (typeof fetch !== 'function') throw new Error('fetch function is required');

  fs.mkdirSync(userDataPath, { recursive: true });
  const filePath = path.join(userDataPath, 'license-state.json');
  let state = readState();

  function readState() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        status: parsed.status || 'none',
        licenseKey: parsed.licenseKey || '',
        checkedAt: parsed.checkedAt ?? null,
        cacheExpiresAt: parsed.cacheExpiresAt ?? null,
        expiresAt: parsed.expiresAt ?? null
      };
    } catch (_error) {
      return { status: 'none', licenseKey: '', checkedAt: null, cacheExpiresAt: null, expiresAt: null };
    }
  }

  function getState() {
    return { ...state };
  }

  function saveState(next) {
    state = {
      status: 'none',
      licenseKey: '',
      checkedAt: null,
      cacheExpiresAt: null,
      expiresAt: null,
      ...next
    };
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
    return getState();
  }

  async function post(route, licenseKey) {
    const response = await fetch(`${endpoint}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey,
        deviceId: deviceInfo.deviceId,
        deviceLabel: deviceInfo.deviceLabel,
        platform: deviceInfo.platform,
        appVersion: deviceInfo.appVersion
      })
    });
    return response.json();
  }

  function storeResult(licenseKey, result = {}) {
    const timestamp = now();
    if (result.status === 'active') {
      return saveState({
        status: 'active',
        licenseKey,
        checkedAt: timestamp,
        cacheExpiresAt: timestamp + CACHE_MS,
        expiresAt: result.expiresAt ?? null
      });
    }

    return saveState({
      status: result.status || 'error',
      licenseKey,
      checkedAt: timestamp,
      cacheExpiresAt: null,
      expiresAt: result.expiresAt ?? null
    });
  }

  async function activate(licenseKey) {
    const result = await post('/license/activate', licenseKey);
    storeResult(licenseKey, result);
    return result;
  }

  async function check(licenseKey = state.licenseKey) {
    const result = await post('/license/check', licenseKey);
    storeResult(licenseKey, result);
    return result;
  }

  function hasValidCache() {
    return state.status === 'active' && Number(state.cacheExpiresAt || 0) > now();
  }

  return {
    activate,
    check,
    getState,
    hasValidCache
  };
}

module.exports = {
  CACHE_MS,
  createLicenseClient,
  resolveLicenseEndpoint
};
