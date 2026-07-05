# Usage License Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a server admin dashboard for live usage, device metadata, and one-device license-code activation.

**Architecture:** Keep online usage in memory and store durable license state in SQLite via `better-sqlite3`. The room server exposes license HTTP routes, admin JSON routes, and an admin HTML page; the Electron main process owns device identity, sends device metadata with room joins, and caches license checks for seven days.

**Tech Stack:** Node.js CommonJS, Node built-in `http` test utilities, `node:test`, `better-sqlite3`, Electron main/preload IPC, HTML/CSS renderer, Docker Compose.

---

## File Structure

- Create `server/licenseStore.js`: SQLite schema, license hashing, activation, checks, listing, and check logging.
- Create `tests/server/licenseStore.test.js`: server-side license store behavior with temp SQLite files.
- Create `server/usageTracker.js`: in-memory live WebSocket connection telemetry.
- Create `tests/server/usageTracker.test.js`: online connection counting and device metadata behavior.
- Create `server/adminPage.js`: compact admin HTML renderer.
- Modify `server/roomServer.js`: wire usage tracker, license store, admin auth, license routes, admin JSON, and room metadata.
- Modify `tests/server/roomServer.test.js`: route and WebSocket integration tests.
- Create `scripts/create-license-codes.js`: CLI to insert license codes and print plaintext codes once.
- Create `tests/scripts/create-license-codes.test.js`: CLI behavior against a temp SQLite database.
- Modify `package.json` and `package-lock.json`: add `better-sqlite3` and a `license:create` script.
- Create `src/main/deviceIdentity.js`: persistent local `deviceId` and device metadata helper.
- Create `tests/main/deviceIdentity.test.js`: stable generated device id and metadata normalization.
- Modify `src/main/roomClient.js`: accept `deviceInfo` and include it in `room:join`.
- Modify `tests/main/roomClient.test.js`: assert room join includes device metadata.
- Create `src/main/licenseClient.js`: license endpoint resolution, activation/check calls, and seven-day cache.
- Create `tests/main/licenseClient.test.js`: cache, activation, check, and revoked/expired behavior.
- Modify `src/main/main.js`: initialize device identity and license client, pass device info to room client, expose IPC.
- Modify `src/main/preload.js`: expose `desktopCat.license`.
- Create `src/renderer/licensePanel.js`: settings-panel license activation UI.
- Create `tests/renderer/license-panel.test.js`: renderer behavior with fake `desktopCat.license`.
- Modify `src/renderer/index.html`: add license controls inside the settings panel and load `licensePanel.js`.
- Modify `src/renderer/styles.css`: compact settings-panel license styles.
- Modify `Dockerfile`: install production dependencies and use a glibc-based Node image for native SQLite.
- Modify `docker-compose.yml`: mount `./data:/app/data` and document `DESKTOP_CAT_ADMIN_TOKEN`.
- Modify `README.md`: admin dashboard, license issuing, activation, and Docker data volume notes.

## Task 1: SQLite License Store Core

**Files:**
- Create: `server/licenseStore.js`
- Create: `tests/server/licenseStore.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write the failing license store tests**

Create `tests/server/licenseStore.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server/licenseStore.test.js`

Expected: FAIL with `Cannot find module '../../server/licenseStore'`.

- [ ] **Step 3: Install SQLite dependency**

Run: `npm install better-sqlite3 --save`

Expected: `package.json` has `better-sqlite3` in `dependencies`, and `package-lock.json` is updated.

- [ ] **Step 4: Write the minimal license store implementation**

Create `server/licenseStore.js`:

```js
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DEFAULT_STATUS = 'active';
const VALID_STATUSES = new Set(['active', 'revoked', 'expired']);

function normalizeLicenseCode(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashLicenseCode(code) {
  return crypto
    .createHash('sha256')
    .update(normalizeLicenseCode(code))
    .digest('hex');
}

function normalizeText(value, maxLength) {
  const text = String(value || '').trim();
  return text.slice(0, maxLength);
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function createLicenseStore({ dbPath, now = Date.now } = {}) {
  if (!dbPath) {
    dbPath = path.join(process.cwd(), 'data', 'desktop-cat.sqlite');
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code_hash TEXT NOT NULL UNIQUE,
      code_prefix TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      max_devices INTEGER NOT NULL DEFAULT 1,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS license_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id INTEGER NOT NULL,
      device_id TEXT NOT NULL,
      device_label TEXT,
      platform TEXT,
      app_version TEXT,
      first_ip TEXT,
      last_ip TEXT,
      activated_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      UNIQUE(license_id, device_id),
      FOREIGN KEY (license_id) REFERENCES licenses(id)
    );
    CREATE TABLE IF NOT EXISTS license_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id INTEGER,
      device_id TEXT,
      result TEXT NOT NULL,
      ip TEXT,
      checked_at INTEGER NOT NULL,
      FOREIGN KEY (license_id) REFERENCES licenses(id)
    );
  `);

  function createLicense({ code, status = DEFAULT_STATUS, maxDevices = 1, expiresAt = null } = {}) {
    const normalized = normalizeLicenseCode(code);
    if (!/^[A-Z0-9]{8,64}$/.test(normalized)) {
      throw new Error('License code must contain 8 to 64 letters or digits');
    }
    if (!VALID_STATUSES.has(status)) {
      throw new Error('License status is invalid');
    }
    const timestamp = now();
    const result = db.prepare(`
      INSERT INTO licenses (code_hash, code_prefix, status, max_devices, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      hashLicenseCode(normalized),
      normalized.slice(0, 4),
      status,
      normalizePositiveInteger(maxDevices, 1),
      expiresAt == null ? null : Number(expiresAt),
      timestamp,
      timestamp
    );
    return { id: result.lastInsertRowid, codePrefix: normalized.slice(0, 4), code };
  }

  function findLicense(code) {
    const normalized = normalizeLicenseCode(code);
    if (!normalized) return null;
    return db.prepare('SELECT * FROM licenses WHERE code_hash = ?').get(hashLicenseCode(normalized)) || null;
  }

  function evaluateLicense(license) {
    if (!license) return 'not_found';
    if (license.status === 'revoked') return 'revoked';
    if (license.status === 'expired') return 'expired';
    if (license.expires_at != null && Number(license.expires_at) <= now()) return 'expired';
    return 'active';
  }

  function listDevicesForLicense(licenseId) {
    return db.prepare('SELECT * FROM license_devices WHERE license_id = ? ORDER BY activated_at ASC').all(licenseId);
  }

  function writeCheck({ licenseId = null, deviceId, result, ip }) {
    db.prepare(`
      INSERT INTO license_checks (license_id, device_id, result, ip, checked_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      licenseId,
      normalizeText(deviceId, 128),
      result,
      normalizeText(ip, 128),
      now()
    );
  }

  function activateLicense({ code, deviceId, deviceLabel = '', platform = '', appVersion = '', ip = '' } = {}) {
    const normalizedDeviceId = normalizeText(deviceId, 128);
    if (!normalizedDeviceId) return { status: 'invalid_request' };
    const license = findLicense(code);
    const status = evaluateLicense(license);
    if (status !== 'active') {
      writeCheck({ licenseId: license?.id || null, deviceId: normalizedDeviceId, result: status, ip });
      return { status };
    }

    const devices = listDevicesForLicense(license.id);
    const existing = devices.find((device) => device.device_id === normalizedDeviceId);
    const timestamp = now();
    if (existing) {
      db.prepare(`
        UPDATE license_devices
        SET device_label = ?, platform = ?, app_version = ?, last_ip = ?, last_seen_at = ?
        WHERE id = ?
      `).run(
        normalizeText(deviceLabel, 128),
        normalizeText(platform, 32),
        normalizeText(appVersion, 32),
        normalizeText(ip, 128),
        timestamp,
        existing.id
      );
      writeCheck({ licenseId: license.id, deviceId: normalizedDeviceId, result: 'active', ip });
      return { status: 'active', licenseId: license.id, deviceId: normalizedDeviceId, expiresAt: license.expires_at };
    }

    if (devices.length >= license.max_devices) {
      writeCheck({ licenseId: license.id, deviceId: normalizedDeviceId, result: 'device_limit_reached', ip });
      return { status: 'device_limit_reached' };
    }

    db.prepare(`
      INSERT INTO license_devices
        (license_id, device_id, device_label, platform, app_version, first_ip, last_ip, activated_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      license.id,
      normalizedDeviceId,
      normalizeText(deviceLabel, 128),
      normalizeText(platform, 32),
      normalizeText(appVersion, 32),
      normalizeText(ip, 128),
      normalizeText(ip, 128),
      timestamp,
      timestamp
    );
    writeCheck({ licenseId: license.id, deviceId: normalizedDeviceId, result: 'active', ip });
    return { status: 'active', licenseId: license.id, deviceId: normalizedDeviceId, expiresAt: license.expires_at };
  }

  function checkLicense({ code, deviceId, ip = '' } = {}) {
    const normalizedDeviceId = normalizeText(deviceId, 128);
    if (!normalizedDeviceId) return { status: 'invalid_request' };
    const license = findLicense(code);
    const status = evaluateLicense(license);
    if (status !== 'active') {
      writeCheck({ licenseId: license?.id || null, deviceId: normalizedDeviceId, result: status, ip });
      return { status };
    }
    const devices = listDevicesForLicense(license.id);
    const existing = devices.find((device) => device.device_id === normalizedDeviceId);
    const result = existing ? 'active' : 'device_limit_reached';
    if (existing) {
      db.prepare('UPDATE license_devices SET last_ip = ?, last_seen_at = ? WHERE id = ?')
        .run(normalizeText(ip, 128), now(), existing.id);
    }
    writeCheck({ licenseId: license.id, deviceId: normalizedDeviceId, result, ip });
    return { status: result, licenseId: license.id, deviceId: normalizedDeviceId, expiresAt: license.expires_at };
  }

  function listLicenseDevices() {
    return db.prepare(`
      SELECT l.id AS licenseId, l.code_prefix AS codePrefix, l.status, l.expires_at AS expiresAt,
             d.device_id AS deviceId, d.device_label AS deviceLabel, d.platform, d.app_version AS appVersion,
             d.first_ip AS firstIp, d.last_ip AS lastIp, d.activated_at AS activatedAt, d.last_seen_at AS lastSeenAt
      FROM licenses l
      LEFT JOIN license_devices d ON d.license_id = l.id
      ORDER BY l.id ASC, d.activated_at ASC
    `).all();
  }

  function listLicenseChecks() {
    return db.prepare('SELECT * FROM license_checks ORDER BY checked_at ASC').all();
  }

  return {
    createLicense,
    activateLicense,
    checkLicense,
    listLicenseDevices,
    listLicenseChecks,
    close: () => db.close()
  };
}

module.exports = {
  createLicenseStore,
  hashLicenseCode,
  normalizeLicenseCode
};
```

- [ ] **Step 5: Run license store tests to verify they pass**

Run: `node --test tests/server/licenseStore.test.js`

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/licenseStore.js tests/server/licenseStore.test.js
git commit -m "feat: add sqlite license store"
```

## Task 2: License Code Issuing Script

**Files:**
- Create: `scripts/create-license-codes.js`
- Create: `tests/scripts/create-license-codes.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing CLI test**

Create `tests/scripts/create-license-codes.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
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

  assert.equal(result.status, 0);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/scripts/create-license-codes.test.js`

Expected: FAIL because `scripts/create-license-codes.js` does not exist.

- [ ] **Step 3: Implement the license issuing script**

Create `scripts/create-license-codes.js`:

```js
#!/usr/bin/env node
const crypto = require('node:crypto');
const path = require('node:path');

const { createLicenseStore } = require('../server/licenseStore');

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function createCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let body = '';
  for (let index = 0; index < 12; index += 1) {
    body += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return `DCAT-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

function main() {
  const count = Number.parseInt(readArg('--count', '1'), 10);
  const dbPath = readArg('--db', process.env.DESKTOP_CAT_LICENSE_DB_PATH || path.join(process.cwd(), 'data', 'desktop-cat.sqlite'));
  const expiresAtArg = readArg('--expires-at', null);
  const maxDevices = Number.parseInt(readArg('--max-devices', '1'), 10);

  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new Error('--count must be between 1 and 1000');
  }

  const store = createLicenseStore({ dbPath });
  try {
    for (let index = 0; index < count; index += 1) {
      const code = createCode();
      store.createLicense({
        code,
        maxDevices,
        expiresAt: expiresAtArg == null ? null : Number(expiresAtArg)
      });
      process.stdout.write(`${code}\n`);
    }
  } finally {
    store.close();
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Add the package script**

Modify `package.json` scripts:

```json
"license:create": "node scripts/create-license-codes.js"
```

- [ ] **Step 5: Run CLI tests**

Run: `node --test tests/scripts/create-license-codes.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/create-license-codes.js tests/scripts/create-license-codes.test.js
git commit -m "feat: add license code issuing script"
```

## Task 3: Usage Tracker Core

**Files:**
- Create: `server/usageTracker.js`
- Create: `tests/server/usageTracker.test.js`

- [ ] **Step 1: Write the failing usage tracker test**

Create `tests/server/usageTracker.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');

const { createUsageTracker } = require('../../server/usageTracker');

test('usage tracker counts connections and unique devices', () => {
  const tracker = createUsageTracker({ now: () => 1000 });

  const first = tracker.registerConnection({
    path: '/room',
    ip: '127.0.0.1',
    userAgent: 'DesktopCat/0.3.8'
  });
  const second = tracker.registerConnection({
    path: '/room',
    ip: '127.0.0.2',
    userAgent: 'DesktopCat/0.3.8'
  });

  tracker.updateConnection(first.connectionId, {
    roomCode: '123456',
    userId: 'alice',
    nickname: 'Alice',
    deviceId: 'device-1',
    deviceLabel: 'Office PC',
    appVersion: '0.3.8',
    platform: 'win32'
  });
  tracker.updateConnection(second.connectionId, {
    roomCode: '654321',
    userId: 'alice-copy',
    nickname: 'Alice',
    deviceId: 'device-1',
    appVersion: '0.3.8',
    platform: 'win32'
  });

  const snapshot = tracker.snapshot({
    getLicenseStatusForDevice: (deviceId) => deviceId === 'device-1' ? 'active' : 'unlicensed'
  });

  assert.equal(snapshot.metrics.onlineConnections, 2);
  assert.equal(snapshot.metrics.onlineDevices, 1);
  assert.equal(snapshot.metrics.authorizedOnlineDevices, 1);
  assert.equal(snapshot.metrics.unauthorizedOnlineDevices, 0);
  assert.equal(snapshot.connections[0].licenseStatus, 'active');
});

test('usage tracker removes connections and updates lastSeenAt', () => {
  let timestamp = 1000;
  const tracker = createUsageTracker({ now: () => timestamp });
  const { connectionId } = tracker.registerConnection({ path: '/room', ip: '127.0.0.1' });

  timestamp = 2000;
  tracker.markSeen(connectionId);
  assert.equal(tracker.snapshot().connections[0].lastSeenAt, 2000);

  tracker.removeConnection(connectionId);
  assert.equal(tracker.snapshot().metrics.onlineConnections, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server/usageTracker.test.js`

Expected: FAIL with `Cannot find module '../../server/usageTracker'`.

- [ ] **Step 3: Implement usage tracker**

Create `server/usageTracker.js`:

```js
const crypto = require('node:crypto');

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function createUsageTracker({ now = Date.now, makeId = () => crypto.randomUUID() } = {}) {
  const connections = new Map();

  function registerConnection({ path = '', ip = '', userAgent = '' } = {}) {
    const connectionId = makeId();
    const timestamp = now();
    connections.set(connectionId, {
      connectionId,
      path: normalizeText(path, 128),
      ip: normalizeText(ip, 128),
      userAgent: normalizeText(userAgent, 512),
      connectedAt: timestamp,
      lastSeenAt: timestamp,
      roomCode: null,
      userId: null,
      nickname: null,
      deviceId: null,
      deviceLabel: null,
      appVersion: null,
      platform: null
    });
    return { connectionId };
  }

  function updateConnection(connectionId, patch = {}) {
    const connection = connections.get(connectionId);
    if (!connection) return false;
    Object.assign(connection, {
      roomCode: patch.roomCode ? normalizeText(patch.roomCode, 16) : connection.roomCode,
      userId: patch.userId ? normalizeText(patch.userId, 64) : connection.userId,
      nickname: patch.nickname ? normalizeText(patch.nickname, 32) : connection.nickname,
      deviceId: patch.deviceId ? normalizeText(patch.deviceId, 128) : connection.deviceId,
      deviceLabel: patch.deviceLabel ? normalizeText(patch.deviceLabel, 128) : connection.deviceLabel,
      appVersion: patch.appVersion ? normalizeText(patch.appVersion, 32) : connection.appVersion,
      platform: patch.platform ? normalizeText(patch.platform, 32) : connection.platform,
      lastSeenAt: now()
    });
    return true;
  }

  function markSeen(connectionId) {
    const connection = connections.get(connectionId);
    if (!connection) return false;
    connection.lastSeenAt = now();
    return true;
  }

  function removeConnection(connectionId) {
    connections.delete(connectionId);
  }

  function snapshot({ getLicenseStatusForDevice = () => 'unlicensed' } = {}) {
    const rows = Array.from(connections.values()).map((connection) => ({
      ...connection,
      licenseStatus: connection.deviceId
        ? getLicenseStatusForDevice(connection.deviceId)
        : 'unknown'
    }));
    const deviceIds = new Set(rows.map((row) => row.deviceId).filter(Boolean));
    const authorizedDeviceIds = new Set(
      rows
        .filter((row) => row.deviceId && row.licenseStatus === 'active')
        .map((row) => row.deviceId)
    );
    return {
      metrics: {
        onlineConnections: rows.length,
        onlineDevices: deviceIds.size,
        authorizedOnlineDevices: authorizedDeviceIds.size,
        unauthorizedOnlineDevices: Math.max(0, deviceIds.size - authorizedDeviceIds.size)
      },
      connections: rows
    };
  }

  return {
    registerConnection,
    updateConnection,
    markSeen,
    removeConnection,
    snapshot
  };
}

module.exports = {
  createUsageTracker
};
```

- [ ] **Step 4: Run usage tracker tests**

Run: `node --test tests/server/usageTracker.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/usageTracker.js tests/server/usageTracker.test.js
git commit -m "feat: track live server usage"
```

## Task 4: Room Server License Routes And Admin JSON

**Files:**
- Modify: `server/roomServer.js`
- Modify: `tests/server/roomServer.test.js`

- [ ] **Step 1: Write failing room server integration tests**

Append these tests to `tests/server/roomServer.test.js`:

```js
test('room server protects admin usage json with the admin token', async () => {
  const roomServer = createRoomServer({ port: 0, adminToken: 'admin-secret' });
  await roomServer.listen();

  try {
    const port = roomServer.address().port;
    const unauthorized = await httpGetJson(`http://127.0.0.1:${port}/admin/usage.json`);
    const authorized = await httpGetJson(`http://127.0.0.1:${port}/admin/usage.json?token=admin-secret`);

    assert.equal(unauthorized.statusCode, 401);
    assert.equal(authorized.statusCode, 200);
    assert.equal(authorized.body.metrics.onlineConnections, 0);
  } finally {
    await roomServer.close();
  }
});

test('room server records device metadata from room joins in admin usage', async () => {
  const roomServer = createRoomServer({ port: 0, adminToken: 'admin-secret' });
  await roomServer.listen();
  const port = roomServer.address().port;
  const alice = await connectWebSocket(port);

  try {
    alice.sendJson({
      type: 'room:join',
      roomCode: '123456',
      userId: 'alice',
      nickname: 'Alice',
      deviceId: 'device-1',
      deviceLabel: 'Office PC',
      appVersion: '0.3.8',
      platform: 'win32'
    });
    assert.equal((await alice.nextJson()).type, 'room:joined');

    const usage = await httpGetJson(`http://127.0.0.1:${port}/admin/usage.json?token=admin-secret`);

    assert.equal(usage.statusCode, 200);
    assert.equal(usage.body.metrics.onlineConnections, 1);
    assert.equal(usage.body.metrics.onlineDevices, 1);
    assert.equal(usage.body.connections[0].deviceId, 'device-1');
    assert.equal(usage.body.connections[0].roomCode, '123456');
  } finally {
    alice.close();
    await roomServer.close();
  }
});

test('room server activates and checks a license against a device', async () => {
  const store = createLicenseStore({ dbPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-license-route-')), 'db.sqlite') });
  store.createLicense({ code: 'DCAT-1111-2222-3333' });
  const roomServer = createRoomServer({
    port: 0,
    licenseStore: store
  });
  await roomServer.listen();

  try {
    const port = roomServer.address().port;
    const activate = await httpPostJson(`http://127.0.0.1:${port}/license/activate`, {
      licenseKey: 'DCAT-1111-2222-3333',
      deviceId: 'device-1',
      deviceLabel: 'Office PC',
      platform: 'win32',
      appVersion: '0.3.8'
    });
    const check = await httpPostJson(`http://127.0.0.1:${port}/license/check`, {
      licenseKey: 'DCAT-1111-2222-3333',
      deviceId: 'device-1'
    });

    assert.equal(activate.statusCode, 200);
    assert.equal(activate.body.status, 'active');
    assert.equal(check.statusCode, 200);
    assert.equal(check.body.status, 'active');
  } finally {
    await roomServer.close();
    store.close();
  }
});
```

Also add this import near the top of `tests/server/roomServer.test.js`:

```js
const { createLicenseStore } = require('../../server/licenseStore');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server/roomServer.test.js`

Expected: FAIL because admin and license routes do not exist yet.

- [ ] **Step 3: Wire usage tracker, license store, admin auth, and license routes**

Modify `server/roomServer.js`:

```js
const { createLicenseStore } = require('./licenseStore');
const { createUsageTracker } = require('./usageTracker');
```

Inside `createRoomServer(options = {})`, add:

```js
const usageTracker = options.usageTracker || createUsageTracker();
const licenseStore = options.licenseStore || createLicenseStore({
  dbPath: options.licenseDbPath || process.env.DESKTOP_CAT_LICENSE_DB_PATH
});
const ownsLicenseStore = !options.licenseStore;
const adminToken = options.adminToken || process.env.DESKTOP_CAT_ADMIN_TOKEN;
```

Add helpers:

```js
function getRequestIp(request, socket) {
  return socket?.remoteAddress || request.socket?.remoteAddress || '';
}

function isAdminAuthorized(requestUrl, request) {
  if (!adminToken) return false;
  if (request.headers.authorization === `Bearer ${adminToken}`) return true;
  return requestUrl.searchParams.get('token') === adminToken;
}

function sendAdminUnauthorized(response) {
  sendJsonResponse(response, 401, { error: 'unauthorized' });
}

function normalizeDeviceMetadata(data) {
  return {
    deviceId: normalizeBoundedString(data.deviceId, '', 128, 'Device id'),
    deviceLabel: normalizeBoundedString(data.deviceLabel, '', 128, 'Device label'),
    appVersion: normalizeBoundedString(data.appVersion, '', 32, 'App version'),
    platform: normalizeBoundedString(data.platform, '', 32, 'Platform')
  };
}
```

In the HTTP server callback, add route handlers before the final `404`:

```js
if (request.method === 'GET' && requestUrl.pathname === '/admin/usage.json') {
  if (!isAdminAuthorized(requestUrl, request)) {
    sendAdminUnauthorized(response);
    return;
  }
  const licensedDevices = new Map();
  for (const row of licenseStore.listLicenseDevices()) {
    if (row.deviceId) licensedDevices.set(row.deviceId, row.status);
  }
  sendJsonResponse(response, 200, usageTracker.snapshot({
    getLicenseStatusForDevice: (deviceId) => licensedDevices.get(deviceId) || 'unlicensed'
  }));
  return;
}

if (request.method === 'GET' && requestUrl.pathname === '/admin/licenses.json') {
  if (!isAdminAuthorized(requestUrl, request)) {
    sendAdminUnauthorized(response);
    return;
  }
  sendJsonResponse(response, 200, { licenses: licenseStore.listLicenseDevices() });
  return;
}

if (request.method === 'POST' && requestUrl.pathname === '/license/activate') {
  try {
    const body = await readJsonBody(request);
    const result = licenseStore.activateLicense({
      code: body.licenseKey,
      deviceId: body.deviceId,
      deviceLabel: body.deviceLabel,
      platform: body.platform,
      appVersion: body.appVersion,
      ip: getRequestIp(request)
    });
    sendJsonResponse(response, result.status === 'active' ? 200 : 403, result);
  } catch (error) {
    sendJsonResponse(response, 400, { status: 'invalid_request', message: error.message });
  }
  return;
}

if (request.method === 'POST' && requestUrl.pathname === '/license/check') {
  try {
    const body = await readJsonBody(request);
    const result = licenseStore.checkLicense({
      code: body.licenseKey,
      deviceId: body.deviceId,
      ip: getRequestIp(request)
    });
    sendJsonResponse(response, result.status === 'active' ? 200 : 403, result);
  } catch (error) {
    sendJsonResponse(response, 400, { status: 'invalid_request', message: error.message });
  }
  return;
}
```

In `/room` upgrade handling after `sockets.add(socket);`, register usage:

```js
const usageConnection = usageTracker.registerConnection({
  path,
  ip: getRequestIp(request, socket),
  userAgent: request.headers['user-agent'] || ''
});
```

In `handleClientMessage` for `room:join`, after normalizing `client.id`, add:

```js
const device = normalizeDeviceMetadata(data);
usageTracker.updateConnection(client.usageConnectionId, {
  roomCode,
  userId: client.id,
  nickname: normalizeNickname(data.nickname, client.id),
  ...device
});
```

When creating the `client`, include:

```js
usageConnectionId: usageConnection.connectionId,
```

On each valid text frame before `handleClientMessage`, add:

```js
usageTracker.markSeen(usageConnection.connectionId);
```

In socket `close` and `error`, add:

```js
usageTracker.removeConnection(usageConnection.connectionId);
```

In `close()`, after `server.close`, close owned store:

```js
if (ownsLicenseStore && licenseStore.close) {
  licenseStore.close();
}
```

- [ ] **Step 4: Run room server integration tests**

Run: `node --test tests/server/roomServer.test.js`

Expected: PASS.

- [ ] **Step 5: Run server test suite**

Run: `node --test tests/server/*.test.js tests/scripts/*.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/roomServer.js tests/server/roomServer.test.js
git commit -m "feat: expose license and usage server routes"
```

## Task 5: Admin HTML Dashboard

**Files:**
- Create: `server/adminPage.js`
- Modify: `server/roomServer.js`
- Modify: `tests/server/roomServer.test.js`

- [ ] **Step 1: Write failing admin HTML test**

Append to `tests/server/roomServer.test.js`:

```js
function httpGetText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({ statusCode: response.statusCode, body });
      });
    }).on('error', reject);
  });
}

test('room server serves a token-protected admin dashboard page', async () => {
  const roomServer = createRoomServer({ port: 0, adminToken: 'admin-secret' });
  await roomServer.listen();

  try {
    const port = roomServer.address().port;
    const response = await httpGetText(`http://127.0.0.1:${port}/admin?token=admin-secret`);

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /desktop-cat Admin/);
    assert.match(response.body, /admin\/usage\.json/);
    assert.match(response.body, /Online connections/);
  } finally {
    await roomServer.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server/roomServer.test.js`

Expected: FAIL because `/admin` returns JSON `not_found`.

- [ ] **Step 3: Implement `server/adminPage.js`**

Create `server/adminPage.js`:

```js
function createAdminPage({ token = '' } = {}) {
  const escapedToken = String(token).replace(/[<>&"']/g, '');
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
    .status-revoked, .status-expired, .status-unlicensed { color: #a2382f; font-weight: 700; }
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
    const token = ${JSON.stringify(escapedToken)};
    const auth = token ? { Authorization: 'Bearer ' + token } : {};
    const text = (value) => value == null || value === '' ? '-' : String(value);
    const time = (value) => value ? new Date(Number(value)).toLocaleString() : '-';
    function statusClass(value) { return 'status-' + text(value).toLowerCase(); }
    function row(cells) { return '<tr>' + cells.map((cell) => '<td>' + cell + '</td>').join('') + '</tr>'; }
    async function refresh() {
      const usage = await fetch('/admin/usage.json', { headers: auth }).then((response) => response.json());
      const licenses = await fetch('/admin/licenses.json', { headers: auth }).then((response) => response.json());
      for (const [key, value] of Object.entries(usage.metrics || {})) {
        const node = document.getElementById(key);
        if (node) node.textContent = value;
      }
      document.getElementById('onlineRows').innerHTML = (usage.connections || []).map((item) => row([
        text(item.ip), text(item.deviceId || item.deviceLabel), text(item.nickname || item.userId),
        text(item.roomCode), text(item.appVersion), text(item.platform),
        '<span class="' + statusClass(item.licenseStatus) + '">' + text(item.licenseStatus) + '</span>',
        time(item.lastSeenAt)
      ])).join('');
      document.getElementById('licenseRows').innerHTML = (licenses.licenses || []).map((item) => row([
        text(item.licenseId), text(item.codePrefix),
        '<span class="' + statusClass(item.status) + '">' + text(item.status) + '</span>',
        text(item.deviceId), text(item.deviceLabel), text(item.appVersion), text(item.lastIp),
        time(item.activatedAt), time(item.expiresAt)
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
```

- [ ] **Step 4: Wire `/admin` in room server**

In `server/roomServer.js`, import:

```js
const { createAdminPage } = require('./adminPage');
```

Add a route before JSON admin routes:

```js
if (request.method === 'GET' && requestUrl.pathname === '/admin') {
  if (!isAdminAuthorized(requestUrl, request)) {
    response.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('unauthorized');
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(createAdminPage({ token: requestUrl.searchParams.get('token') || '' }));
  return;
}
```

- [ ] **Step 5: Run admin route tests**

Run: `node --test tests/server/roomServer.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/adminPage.js server/roomServer.js tests/server/roomServer.test.js
git commit -m "feat: add usage admin dashboard"
```

## Task 6: Client Device Identity And Room Metadata

**Files:**
- Create: `src/main/deviceIdentity.js`
- Create: `tests/main/deviceIdentity.test.js`
- Modify: `src/main/roomClient.js`
- Modify: `tests/main/roomClient.test.js`
- Modify: `src/main/main.js`

- [ ] **Step 1: Write failing device identity tests**

Create `tests/main/deviceIdentity.test.js`:

```js
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
```

- [ ] **Step 2: Write failing room client metadata test**

Modify `tests/main/roomClient.test.js` `createClient()` to pass device info:

```js
deviceInfo: {
  deviceId: 'device-1',
  deviceLabel: 'Office PC',
  appVersion: '0.3.8',
  platform: 'win32'
}
```

Update the first join assertion to expect:

```js
assert.deepEqual(socket.sent, [{
  type: 'room:join',
  roomCode: '123456',
  userId: 'local-user',
  nickname: 'Alice',
  deviceId: 'device-1',
  deviceLabel: 'Office PC',
  appVersion: '0.3.8',
  platform: 'win32'
}]);
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/main/deviceIdentity.test.js tests/main/roomClient.test.js`

Expected: FAIL because `deviceIdentity.js` does not exist and `roomClient` ignores `deviceInfo`.

- [ ] **Step 4: Implement device identity**

Create `src/main/deviceIdentity.js`:

```js
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function createDeviceIdentity({
  userDataPath,
  randomUUID = crypto.randomUUID,
  hostname = os.hostname,
  platform = process.platform,
  appVersion = '0.0.0'
} = {}) {
  if (!userDataPath) {
    throw new Error('userDataPath is required');
  }
  fs.mkdirSync(userDataPath, { recursive: true });
  const filePath = path.join(userDataPath, 'device-identity.json');
  let deviceId = '';
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    deviceId = normalizeText(parsed.deviceId, 128);
  } catch (_error) {
    deviceId = '';
  }
  if (!deviceId) {
    deviceId = randomUUID();
    fs.writeFileSync(filePath, JSON.stringify({ deviceId }, null, 2), 'utf8');
  }
  return {
    deviceId,
    deviceLabel: normalizeText(hostname(), 128) || 'desktop-cat device',
    platform: normalizeText(platform, 32),
    appVersion: normalizeText(appVersion, 32)
  };
}

module.exports = {
  createDeviceIdentity
};
```

- [ ] **Step 5: Include device metadata in room joins**

Modify `src/main/roomClient.js`:

```js
function normalizeDeviceInfo(deviceInfo = {}) {
  return {
    deviceId: String(deviceInfo.deviceId || '').trim(),
    deviceLabel: String(deviceInfo.deviceLabel || '').trim(),
    appVersion: String(deviceInfo.appVersion || '').trim(),
    platform: String(deviceInfo.platform || '').trim()
  };
}
```

In `createRoomClient` parameters, add `deviceInfo = {}`. In the `open` listener, include:

```js
const normalizedDeviceInfo = normalizeDeviceInfo(deviceInfo);
sendJson({
  type: 'room:join',
  roomCode: normalizedRoomCode,
  userId,
  nickname: state.nickname,
  ...normalizedDeviceInfo
});
```

- [ ] **Step 6: Wire device identity into main**

Modify `src/main/main.js` imports:

```js
const { createDeviceIdentity } = require('./deviceIdentity');
```

Add a module variable:

```js
let deviceIdentity = null;
```

In `app.whenReady().then(() => { ... })`, before `setupRoomClient();`, add:

```js
deviceIdentity = createDeviceIdentity({
  userDataPath: app.getPath('userData'),
  appVersion: app.getVersion()
});
```

In `setupRoomClient()`, pass:

```js
deviceInfo: deviceIdentity
```

- [ ] **Step 7: Run client metadata tests**

Run: `node --test tests/main/deviceIdentity.test.js tests/main/roomClient.test.js`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main/deviceIdentity.js tests/main/deviceIdentity.test.js src/main/roomClient.js tests/main/roomClient.test.js src/main/main.js
git commit -m "feat: report client device identity"
```

## Task 7: License Client, Local Cache, And IPC

**Files:**
- Create: `src/main/licenseClient.js`
- Create: `tests/main/licenseClient.test.js`
- Modify: `src/main/main.js`
- Modify: `src/main/preload.js`

- [ ] **Step 1: Write failing license client tests**

Create `tests/main/licenseClient.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/main/licenseClient.test.js`

Expected: FAIL because `licenseClient.js` does not exist.

- [ ] **Step 3: Implement license client**

Create `src/main/licenseClient.js`:

```js
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

function createLicenseClient({ endpoint, userDataPath, deviceInfo = {}, fetch = globalThis.fetch, now = Date.now } = {}) {
  if (!endpoint) throw new Error('license endpoint is required');
  if (!userDataPath) throw new Error('userDataPath is required');
  fs.mkdirSync(userDataPath, { recursive: true });
  const filePath = path.join(userDataPath, 'license-state.json');
  let state = readState();

  function readState() {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_error) {
      return { status: 'none', licenseKey: '', checkedAt: null, cacheExpiresAt: null };
    }
  }

  function saveState(next) {
    state = {
      status: 'none',
      licenseKey: '',
      checkedAt: null,
      cacheExpiresAt: null,
      ...next
    };
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
    return getState();
  }

  function getState() {
    return { ...state };
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

  function storeResult(licenseKey, result) {
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
  createLicenseClient,
  resolveLicenseEndpoint
};
```

- [ ] **Step 4: Wire main IPC**

Modify `src/main/main.js` imports:

```js
const {
  createLicenseClient,
  resolveLicenseEndpoint
} = require('./licenseClient');
```

Add a module variable:

```js
let licenseClient = null;
```

Add setup function after `setupRoomClient()`:

```js
function setupLicenseClient() {
  if (licenseClient) return;
  licenseClient = createLicenseClient({
    endpoint: resolveLicenseEndpoint(process.env, resolveRoomEndpoint()),
    userDataPath: app.getPath('userData'),
    deviceInfo: deviceIdentity,
    fetch: globalThis.fetch
  });
}
```

In `app.whenReady`, after `deviceIdentity = ...`, call:

```js
setupLicenseClient();
```

Add IPC handlers near room IPC:

```js
ipcMain.handle('license:get-state', () => {
  setupLicenseClient();
  return licenseClient.getState();
});

ipcMain.handle('license:activate', async (_event, licenseKey) => {
  setupLicenseClient();
  return licenseClient.activate(licenseKey);
});

ipcMain.handle('license:check', async () => {
  setupLicenseClient();
  return licenseClient.check();
});
```

- [ ] **Step 5: Expose preload API**

Modify `src/main/preload.js` inside `desktopCat`:

```js
license: {
  getState: () => ipcRenderer.invoke('license:get-state'),
  activate: (licenseKey) => ipcRenderer.invoke('license:activate', licenseKey),
  check: () => ipcRenderer.invoke('license:check')
},
```

- [ ] **Step 6: Run license client tests**

Run: `node --test tests/main/licenseClient.test.js`

Expected: PASS.

- [ ] **Step 7: Run main test suite**

Run: `node --test tests/main/*.test.js`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main/licenseClient.js tests/main/licenseClient.test.js src/main/main.js src/main/preload.js
git commit -m "feat: add client license cache"
```

## Task 8: License Activation UI In Settings

**Files:**
- Create: `src/renderer/licensePanel.js`
- Create: `tests/renderer/license-panel.test.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles.css`

**Important:** `src/renderer/roomPanel.js` and `tests/renderer/room-panel-memory.test.js` already had uncommitted user changes when this plan was written. Do not revert them. This task should not require editing those files.

- [ ] **Step 1: Write failing renderer test**

Create `tests/renderer/license-panel.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function readSource(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf8');
}

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.disabled = false;
    this.listeners = new Map();
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) {
      listener({ preventDefault() {}, ...event, target: this });
    }
  }
}

async function flushAsync() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

function createHarness({ activateResult = { status: 'active' }, initialState = { status: 'none' } } = {}) {
  const ids = ['licenseKeyInput', 'licenseActivateBtn', 'licenseStatusText'];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  const activateCalls = [];
  vm.runInNewContext(readSource('src', 'renderer', 'licensePanel.js'), {
    window: {
      desktopCat: {
        license: {
          getState: async () => initialState,
          activate: async (licenseKey) => {
            activateCalls.push(licenseKey);
            return activateResult;
          }
        }
      }
    },
    document: {
      getElementById: (id) => elements.get(id) || null
    },
    console
  });
  return { elements, activateCalls };
}

test('license panel activates a typed license key and renders active state', async () => {
  const harness = createHarness();
  const input = harness.elements.get('licenseKeyInput');
  const button = harness.elements.get('licenseActivateBtn');
  const status = harness.elements.get('licenseStatusText');

  input.value = ' DCAT-1111-2222-3333 ';
  button.dispatch('click');
  await flushAsync();

  assert.deepEqual(harness.activateCalls, ['DCAT-1111-2222-3333']);
  assert.match(status.textContent, /active/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/renderer/license-panel.test.js`

Expected: FAIL because `src/renderer/licensePanel.js` does not exist.

- [ ] **Step 3: Add settings panel HTML**

Modify `src/renderer/index.html` inside `.settings-panel-body`, after the first settings section:

```html
<div class="settings-section license-settings-section">
  <div class="settings-section-title">License</div>
  <div class="license-status" id="licenseStatusText">Not activated</div>
  <div class="license-form">
    <input id="licenseKeyInput" type="text" autocomplete="off" placeholder="DCAT-XXXX-XXXX-XXXX">
    <button class="sketch-action-btn" id="licenseActivateBtn" type="button">Activate</button>
  </div>
</div>
```

Add the script before `renderer.js` or after it:

```html
<script src="./licensePanel.js"></script>
```

- [ ] **Step 4: Implement `licensePanel.js`**

Create `src/renderer/licensePanel.js`:

```js
(() => {
  const input = document.getElementById('licenseKeyInput');
  const activateBtn = document.getElementById('licenseActivateBtn');
  const statusText = document.getElementById('licenseStatusText');
  const api = window.desktopCat?.license;

  function normalizeLicenseKey(value) {
    return String(value || '').trim().toUpperCase();
  }

  function renderStatus(state = {}) {
    const status = state.status || 'none';
    if (status === 'active') {
      statusText.textContent = 'License active';
      return;
    }
    if (status === 'revoked') {
      statusText.textContent = 'License revoked';
      return;
    }
    if (status === 'expired') {
      statusText.textContent = 'License expired';
      return;
    }
    if (status === 'device_limit_reached') {
      statusText.textContent = 'License is bound to another device';
      return;
    }
    statusText.textContent = 'Not activated';
  }

  async function refresh() {
    if (!api?.getState) return;
    try {
      renderStatus(await api.getState());
    } catch (_error) {
      statusText.textContent = 'License state unavailable';
    }
  }

  activateBtn?.addEventListener('click', async () => {
    if (!api?.activate) return;
    const licenseKey = normalizeLicenseKey(input.value);
    if (!licenseKey) {
      statusText.textContent = 'Enter a license key';
      return;
    }
    activateBtn.disabled = true;
    try {
      renderStatus(await api.activate(licenseKey));
    } catch (_error) {
      statusText.textContent = 'Activation failed';
    } finally {
      activateBtn.disabled = false;
    }
  });

  refresh();
})();
```

- [ ] **Step 5: Add compact CSS**

Modify `src/renderer/styles.css`:

```css
.license-settings-section {
  gap: 8px;
}

.license-status {
  color: #4b5563;
  font-size: 12px;
  line-height: 1.4;
}

.license-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.license-form input {
  min-width: 0;
  min-height: 32px;
  border: 1px solid var(--sketch-border);
  border-radius: 6px;
  padding: 0 8px;
  font: inherit;
}
```

- [ ] **Step 6: Run renderer license test**

Run: `node --test tests/renderer/license-panel.test.js`

Expected: PASS.

- [ ] **Step 7: Run renderer tests**

Run: `node --test tests/renderer/*.test.js`

Expected: PASS. If the existing uncommitted room-panel test fails, inspect it before changing any renderer file and preserve the user's work.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/licensePanel.js tests/renderer/license-panel.test.js src/renderer/index.html src/renderer/styles.css
git commit -m "feat: add license activation UI"
```

## Task 9: Deployment And Documentation

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Write failing metadata test for scripts and Docker volume**

Modify `tests/release-metadata.test.js` by adding:

```js
test('package and docker metadata expose license administration support', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const dockerCompose = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');

  assert.equal(packageJson.scripts['license:create'], 'node scripts/create-license-codes.js');
  assert.match(dockerCompose, /DESKTOP_CAT_ADMIN_TOKEN/);
  assert.match(dockerCompose, /\.\/data:\/app\/data/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/release-metadata.test.js`

Expected: FAIL until Docker Compose and package metadata are updated.

- [ ] **Step 3: Update Dockerfile**

Modify `Dockerfile`:

```dockerfile
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV DESKTOP_CAT_LICENSE_DB_PATH=/app/data/desktop-cat.sqlite

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY scripts ./scripts

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "run", "room:server"]
```

- [ ] **Step 4: Update docker-compose**

Modify `docker-compose.yml`:

```yaml
services:
  room-server:
    build: .
    container_name: desktop-cat-room
    restart: unless-stopped
    environment:
      PORT: "3001"
      DESKTOP_CAT_ADMIN_TOKEN: "change-me"
      DESKTOP_CAT_LICENSE_DB_PATH: "/app/data/desktop-cat.sqlite"
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
```

- [ ] **Step 5: Update README**

Add a short admin and license section:

```markdown
### Admin usage and device licenses

The room server can expose a browser admin page for live usage and device license state.

```powershell
$env:DESKTOP_CAT_ADMIN_TOKEN = "change-me"
$env:DESKTOP_CAT_LICENSE_DB_PATH = ".\data\desktop-cat.sqlite"
npm run room:server
```

Open `http://127.0.0.1:3001/admin?token=change-me`.

Create license codes:

```powershell
npm run license:create -- --count 5 --db ".\data\desktop-cat.sqlite"
```

The server stores license hashes, not plaintext license codes. Keep the printed codes so they can be sent to users.
```

- [ ] **Step 6: Run metadata test**

Run: `node --test tests/release-metadata.test.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add Dockerfile docker-compose.yml README.md package.json tests/release-metadata.test.js
git commit -m "docs: document license admin deployment"
```

## Task 10: Full Verification

**Files:**
- No source edits unless verification exposes a defect.

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run a local server smoke check**

Run:

```powershell
$env:DESKTOP_CAT_ADMIN_TOKEN='test-token'
$env:DESKTOP_CAT_LICENSE_DB_PATH="$PWD\data\test-admin.sqlite"
$process = Start-Process -FilePath "node" -ArgumentList "server/roomServer.js" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2
Invoke-RestMethod "http://127.0.0.1:3001/health"
Invoke-RestMethod "http://127.0.0.1:3001/admin/usage.json?token=test-token"
Stop-Process -Id $process.Id
```

Expected: `/health` returns `{ ok: true }`, and `/admin/usage.json` returns metrics with zero or more connections.

- [ ] **Step 3: Check git status**

Run: `git status --short`

Expected: only known user pre-existing changes remain, or an empty status if those changes were handled separately.

- [ ] **Step 4: Final commit if verification fixes were needed**

If Step 1 or Step 2 required code edits, commit them:

```bash
git add <changed-files>
git commit -m "fix: stabilize usage license admin"
```

If no edits were needed, skip this commit.

## Self-Review Notes

- Spec coverage: online usage, IP, client device reporting, SQLite license store, license issuing, one-device activation, local cache, admin page, token protection, Docker persistence, and tests are covered.
- Scope: payment webhooks, accounts, multi-device plans, admin write actions, and historical analytics remain out of scope.
- Type consistency: `deviceId`, `deviceLabel`, `appVersion`, `platform`, `licenseKey`, `status`, `expiresAt`, `cacheExpiresAt`, and `licenseStatus` are used consistently across tasks.
