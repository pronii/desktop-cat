#!/usr/bin/env node
const path = require('node:path');

const { createLicenseCode, createLicenseStore } = require('../server/licenseStore');

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function createCode() {
  return createLicenseCode();
}

function main() {
  const count = Number.parseInt(readArg('--count', '1'), 10);
  const maxDevices = Number.parseInt(readArg('--max-devices', '1'), 10);
  const dbPath = readArg(
    '--db',
    process.env.DESKTOP_CAT_LICENSE_DB_PATH || path.join(process.cwd(), 'data', 'desktop-cat.sqlite')
  );
  const expiresAtArg = readArg('--expires-at', null);

  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new Error('--count must be between 1 and 1000');
  }
  if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 100) {
    throw new Error('--max-devices must be between 1 and 100');
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

module.exports = {
  createCode,
  readArg
};
