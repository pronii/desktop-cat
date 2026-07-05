const assert = require('node:assert/strict');
const test = require('node:test');

const { createOnlineClient } = require('../../src/main/onlineClient');

test('online client reports device metadata to the software heartbeat route', async () => {
  const calls = [];
  const client = createOnlineClient({
    endpoint: 'http://example.test',
    deviceInfo: {
      deviceId: 'device-1',
      deviceLabel: 'Office PC',
      appVersion: '0.3.8',
      platform: 'win32'
    },
    fetch: async (url, options) => {
      calls.push({
        url,
        method: options.method,
        headers: options.headers,
        body: JSON.parse(options.body)
      });
      return {
        ok: true,
        json: async () => ({ ok: true, nextHeartbeatMs: 30000 })
      };
    }
  });

  const result = await client.reportNow();

  assert.deepEqual(result, { ok: true, nextHeartbeatMs: 30000 });
  assert.deepEqual(calls, [{
    url: 'http://example.test/client/online',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      deviceId: 'device-1',
      deviceLabel: 'Office PC',
      appVersion: '0.3.8',
      platform: 'win32'
    }
  }]);
});

test('online client start sends an immediate heartbeat and schedules follow-up checks', async () => {
  const calls = [];
  const intervals = [];
  const client = createOnlineClient({
    endpoint: 'http://example.test/',
    deviceInfo: { deviceId: 'device-1' },
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        json: async () => ({ ok: true })
      };
    },
    setInterval: (callback, intervalMs) => {
      intervals.push({ callback, intervalMs });
      return { id: intervals.length };
    },
    clearInterval: () => {}
  });

  await client.start();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://example.test/client/online');
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].intervalMs, 30000);
});
