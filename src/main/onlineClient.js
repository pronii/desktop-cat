const DEFAULT_HEARTBEAT_INTERVAL_MS = 30 * 1000;

function normalizeEndpoint(endpoint) {
  return String(endpoint || '').trim().replace(/\/+$/, '');
}

function normalizeDeviceInfo(deviceInfo = {}) {
  return {
    deviceId: String(deviceInfo.deviceId || '').trim(),
    deviceLabel: String(deviceInfo.deviceLabel || '').trim(),
    appVersion: String(deviceInfo.appVersion || '').trim(),
    platform: String(deviceInfo.platform || '').trim()
  };
}

function createOnlineClient({
  endpoint,
  deviceInfo = {},
  fetch = globalThis.fetch,
  setInterval = globalThis.setInterval,
  clearInterval = globalThis.clearInterval,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS
} = {}) {
  const baseEndpoint = normalizeEndpoint(endpoint);
  if (!baseEndpoint) throw new Error('online endpoint is required');
  if (typeof fetch !== 'function') throw new Error('fetch function is required');

  let timer = null;

  async function reportNow() {
    try {
      const response = await fetch(`${baseEndpoint}/client/online`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizeDeviceInfo(deviceInfo))
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          ...result
        };
      }
      return result && typeof result === 'object' ? result : { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || 'online report failed'
      };
    }
  }

  function schedule() {
    if (timer) return;
    timer = setInterval(() => {
      reportNow().catch(() => {});
    }, heartbeatIntervalMs);
    if (typeof timer?.unref === 'function') {
      timer.unref();
    }
  }

  async function start() {
    const result = await reportNow();
    schedule();
    return result;
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return {
    reportNow,
    start,
    stop
  };
}

module.exports = {
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  createOnlineClient
};
