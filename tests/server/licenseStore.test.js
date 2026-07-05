const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createLicenseStore,
  hashLicenseCode,
  normalizeLicenseCode
} = require('../../server/licenseStore');

function tempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-license-'));
  return path.join(dir, 'licenses.sqlite');
}

test('normalizeLicenseCode trims, uppercases, and removes separators', () => {
  assert.equal(normalizeLicenseCode(' dcat-abcd 1234 '), 'DCATABCD1234');
});

test('license store creates schema and activates an unused license for a device', () => {
  const store = createLicenseStore({ dbPath: tempDbPath(), now: () => 1000 });
  const license = store.createLicense({ code: 'DCAT-AAAA-BBBB-CCCC' });

  const result = store.activateLicense({
    code: ' dcat-aaaa-bbbb-cccc ',
    deviceId: 'device-1',
    deviceLabel: 'Office PC',
    platform: 'win32',
    appVersion: '0.3.8',
    ip: '127.0.0.1'
  });

  assert.equal(license.codePrefix, 'DCAT');
  assert.equal(result.status, 'active');
  assert.equal(result.deviceId, 'device-1');
  assert.equal(result.licenseId, license.id);
  assert.equal(store.listLicenseDevices()[0].deviceId, 'device-1');
  store.close();
});

test('license activation is idempotent for the same device and blocked for another device', () => {
  const store = createLicenseStore({ dbPath: tempDbPath(), now: () => 2000 });
  store.createLicense({ code: 'DCAT-DDDD-EEEE-FFFF' });

  assert.equal(store.activateLicense({
    code: 'DCAT-DDDD-EEEE-FFFF',
    deviceId: 'device-1',
    ip: '10.0.0.1'
  }).status, 'active');

  assert.equal(store.activateLicense({
    code: 'DCAT-DDDD-EEEE-FFFF',
    deviceId: 'device-1',
    ip: '10.0.0.2'
  }).status, 'active');

  assert.equal(store.activateLicense({
    code: 'DCAT-DDDD-EEEE-FFFF',
    deviceId: 'device-2',
    ip: '10.0.0.3'
  }).status, 'device_limit_reached');
  store.close();
});

test('license checks return revoked and expired states and record check rows', () => {
  const store = createLicenseStore({ dbPath: tempDbPath(), now: () => 3000 });
  store.createLicense({ code: 'DCAT-REVO-KED0-0001', status: 'revoked' });
  store.createLicense({ code: 'DCAT-EXPI-RED0-0001', expiresAt: 2500 });

  assert.equal(store.checkLicense({
    code: 'DCAT-REVO-KED0-0001',
    deviceId: 'device-1',
    ip: '127.0.0.1'
  }).status, 'revoked');

  assert.equal(store.checkLicense({
    code: 'DCAT-EXPI-RED0-0001',
    deviceId: 'device-1',
    ip: '127.0.0.1'
  }).status, 'expired');

  assert.equal(store.listLicenseChecks().length, 2);
  store.close();
});

test('hashLicenseCode does not expose plaintext license codes', () => {
  const hash = hashLicenseCode('DCAT-AAAA-BBBB-CCCC');

  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(hash, /DCAT/);
});
