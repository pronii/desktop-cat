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
    deviceId = normalizeText(randomUUID(), 128);
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
