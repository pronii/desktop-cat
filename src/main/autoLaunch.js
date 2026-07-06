const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_AUTO_LAUNCH_FILE = 'auto-launch.json';

function readPreference(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (typeof parsed.enabled === 'boolean') {
      return { enabled: parsed.enabled };
    }
  } catch (_error) {
    // Missing or invalid preference means this is the first configurable run.
  }
  return null;
}

function writePreference(filePath, preference) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(preference, null, 2), 'utf8');
}

function createAutoLaunchController({
  app,
  userDataPath,
  fileName = DEFAULT_AUTO_LAUNCH_FILE,
  openAsHidden = false
} = {}) {
  if (!app) throw new Error('app is required');
  if (!userDataPath) throw new Error('userDataPath is required');
  if (typeof app.getLoginItemSettings !== 'function') {
    throw new Error('app.getLoginItemSettings is required');
  }
  if (typeof app.setLoginItemSettings !== 'function') {
    throw new Error('app.setLoginItemSettings is required');
  }

  const filePath = path.join(userDataPath, fileName);

  function getState() {
    const settings = app.getLoginItemSettings();
    return {
      enabled: settings?.openAtLogin === true
    };
  }

  function applyEnabled(enabled) {
    app.setLoginItemSettings({
      openAtLogin: enabled === true,
      openAsHidden: openAsHidden === true
    });
    return getState();
  }

  function setEnabled(enabled) {
    const next = { enabled: enabled === true };
    applyEnabled(next.enabled);
    writePreference(filePath, next);
    return getState();
  }

  function ensureDefaultEnabled() {
    const preference = readPreference(filePath) || { enabled: true };
    applyEnabled(preference.enabled);
    if (!readPreference(filePath)) {
      writePreference(filePath, preference);
    }
    return getState();
  }

  return {
    ensureDefaultEnabled,
    getState,
    setEnabled
  };
}

module.exports = {
  createAutoLaunchController
};
