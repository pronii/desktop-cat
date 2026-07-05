const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createLicenseStore } = require('../../server/licenseStore');

test('create-license-codes inserts codes and prints plaintext once', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-license-cli-'));
  const dbPath = path.join(tempDir, 'licenses.sqlite');

  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', '..', 'scripts', 'create-license-codes.js'),
    '--db', dbPath,
    '--count', '2',
    '--expires-at', '1893456000000'
  ], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  const codes = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.equal(codes.length, 2);
  assert.match(codes[0], /^DCAT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const store = createLicenseStore({ dbPath });
  const rows = store.listLicenseDevices();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].deviceId, null);
  assert.equal(rows[0].expiresAt, 1893456000000);
  store.close();
});
