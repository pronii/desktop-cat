const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createLicenseClient,
  resolveLicenseEndpoint
} = require('../../src/main/licenseClient');

test('resolveLicenseEndpoint derives http endpoint from room websocket endpoint', () => {
  assert.equal(
    resolveLicenseEndpoint({}, 'ws://127.0.0.1:3001/room'),
    'http://127.0.0.1:3001'
  );
  assert.equal(
    resolveLicenseEndpoint({ DESKTOP_CAT_LICENSE_ENDPOINT: ' https://license.example.test ' }, 'ws://unused/room'),
    'https://license.example.test'
  );
});

test('license client activates, stores cache, and reuses valid local state', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-license-client-'));
  const calls = [];
  const client = createLicenseClient({
    endpoint: 'https://license.example.test',
    userDataPath,
    deviceInfo: { deviceId: 'device-1', deviceLabel: 'Office PC', platform: 'win32', appVersion: '0.3.8' },
    now: () => 1000,
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'active', expiresAt: null })
      };
    }
  });

  const result = await client.activate('DCAT-1111-2222-3333');
  const state = client.getState();

  assert.equal(result.status, 'active');
  assert.equal(state.status, 'active');
  assert.equal(state.cacheExpiresAt, 1000 + 7 * 24 * 60 * 60 * 1000);
  assert.equal(client.hasValidCache(), true);
  assert.equal(calls[0].url, 'https://license.example.test/license/activate');
  assert.equal(calls[0].body.deviceId, 'device-1');
});

test('license client clears active cache when server reports revoked', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-license-client-'));
  const client = createLicenseClient({
    endpoint: 'https://license.example.test',
    userDataPath,
    deviceInfo: { deviceId: 'device-1' },
    now: () => 2000,
    fetch: async () => ({
      ok: false,
      status: 403,
      json: async () => ({ status: 'revoked' })
    })
  });

  const result = await client.check('DCAT-1111-2222-3333');

  assert.equal(result.status, 'revoked');
  assert.equal(client.getState().status, 'revoked');
  assert.equal(client.getState().cacheExpiresAt, null);
});
