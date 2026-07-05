const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createDeviceIdentity } = require('../../src/main/deviceIdentity');

test('device identity generates and reuses a persistent device id', () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-device-'));
  let counter = 0;
  const first = createDeviceIdentity({
    userDataPath,
    randomUUID: () => `device-${++counter}`,
    hostname: () => 'Workstation',
    platform: 'win32',
    appVersion: '0.3.8'
  });
  const second = createDeviceIdentity({
    userDataPath,
    randomUUID: () => `device-${++counter}`,
    hostname: () => 'Workstation',
    platform: 'win32',
    appVersion: '0.3.8'
  });

  assert.equal(first.deviceId, 'device-1');
  assert.equal(second.deviceId, 'device-1');
  assert.equal(first.deviceLabel, 'Workstation');
  assert.equal(first.platform, 'win32');
  assert.equal(first.appVersion, '0.3.8');
});
