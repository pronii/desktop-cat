const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createAutoLaunchController } = require('../../src/main/autoLaunch');

function createTempUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-auto-launch-'));
}

function createFakeApp({ openAtLogin = false } = {}) {
  const calls = [];
  let enabled = openAtLogin;
  return {
    calls,
    getLoginItemSettings() {
      return { openAtLogin: enabled };
    },
    setLoginItemSettings(settings) {
      calls.push(settings);
      enabled = settings.openAtLogin === true;
    }
  };
}

test('auto launch controller enables login item on first run and saves the default', () => {
  const userDataPath = createTempUserData();
  const app = createFakeApp({ openAtLogin: false });
  const controller = createAutoLaunchController({ app, userDataPath });

  const state = controller.ensureDefaultEnabled();
  const stored = JSON.parse(fs.readFileSync(path.join(userDataPath, 'auto-launch.json'), 'utf8'));

  assert.deepEqual(state, { enabled: true });
  assert.deepEqual(stored, { enabled: true });
  assert.deepEqual(app.calls, [{ openAtLogin: true, openAsHidden: false }]);
});

test('auto launch controller respects a saved disabled preference on startup', () => {
  const userDataPath = createTempUserData();
  fs.writeFileSync(
    path.join(userDataPath, 'auto-launch.json'),
    JSON.stringify({ enabled: false }),
    'utf8'
  );
  const app = createFakeApp({ openAtLogin: true });
  const controller = createAutoLaunchController({ app, userDataPath });

  const state = controller.ensureDefaultEnabled();

  assert.deepEqual(state, { enabled: false });
  assert.deepEqual(app.calls, [{ openAtLogin: false, openAsHidden: false }]);
});

test('auto launch controller persists user changes and returns current state', () => {
  const userDataPath = createTempUserData();
  const app = createFakeApp({ openAtLogin: true });
  const controller = createAutoLaunchController({ app, userDataPath });

  const disabled = controller.setEnabled(false);
  const enabled = controller.setEnabled(true);
  const stored = JSON.parse(fs.readFileSync(path.join(userDataPath, 'auto-launch.json'), 'utf8'));

  assert.deepEqual(disabled, { enabled: false });
  assert.deepEqual(enabled, { enabled: true });
  assert.deepEqual(stored, { enabled: true });
  assert.deepEqual(app.calls, [
    { openAtLogin: false, openAsHidden: false },
    { openAtLogin: true, openAsHidden: false }
  ]);
});
