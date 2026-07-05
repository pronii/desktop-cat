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

function normalizeTimestamp(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function createLicenseStore({ dbPath, now = Date.now } = {}) {
  const resolvedDbPath = dbPath || path.join(process.cwd(), 'data', 'desktop-cat.sqlite');
  fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });

  const db = new Database(resolvedDbPath);
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
      normalizeTimestamp(expiresAt),
      timestamp,
      timestamp
    );

    return {
      id: result.lastInsertRowid,
      codePrefix: normalized.slice(0, 4),
      code
    };
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

  function activateLicense({
    code,
    deviceId,
    deviceLabel = '',
    platform = '',
    appVersion = '',
    ip = ''
  } = {}) {
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
      SELECT l.id AS licenseId, l.code_prefix AS codePrefix, l.status, l.max_devices AS maxDevices,
             l.expires_at AS expiresAt, l.created_at AS createdAt, l.updated_at AS updatedAt,
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
