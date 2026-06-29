const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  createPetWindowOptions,
  getAlwaysOnTopPolicy
} = require('../src/main/windowOptions');

test('createPetWindowOptions configures a transparent frameless desktop pet window', () => {
  const preloadPath = path.join('app', 'preload.js');
  const options = createPetWindowOptions({ preloadPath });

  assert.equal(options.width, 240);
  assert.equal(options.height, 240);
  assert.equal(options.frame, false);
  assert.equal(options.transparent, true);
  assert.equal(options.alwaysOnTop, true);
  assert.equal(options.skipTaskbar, true);
  assert.equal(options.acceptFirstMouse, true);
  assert.equal(options.webPreferences.preload, preloadPath);
  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(options.webPreferences.nodeIntegration, false);
});

test('getAlwaysOnTopPolicy uses a strong desktop-pet topmost level', () => {
  assert.deepEqual(getAlwaysOnTopPolicy(), {
    flag: true,
    level: 'screen-saver',
    relativeLevel: 1
  });
});
