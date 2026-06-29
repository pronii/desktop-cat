const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clearTemporaryHide,
  createTemporaryHideState,
  enforceTemporaryHide,
  isTemporaryHideActive,
  revealTemporaryHiddenWindow,
  startTemporaryHide
} = require('../src/main/windowVisibility');

test('temporary hide state stays active until the configured time expires', () => {
  const state = createTemporaryHideState();

  startTemporaryHide(state, 300000, 1000);

  assert.equal(state.hiddenUntil, 301000);
  assert.equal(isTemporaryHideActive(state, 300999), true);
  assert.equal(isTemporaryHideActive(state, 301000), false);
});

test('enforceTemporaryHide keeps a visible window hidden during topmost refresh', () => {
  const calls = [];
  const state = createTemporaryHideState();
  startTemporaryHide(state, 300000, 1000);
  const window = {
    isVisible() {
      return true;
    },
    setAlwaysOnTop(value) {
      calls.push(['setAlwaysOnTop', value]);
    },
    hide() {
      calls.push(['hide']);
    }
  };

  const handled = enforceTemporaryHide(window, state, 2000);

  assert.equal(handled, true);
  assert.deepEqual(calls, [
    ['setAlwaysOnTop', false],
    ['hide']
  ]);
});

test('enforceTemporaryHide does not handle refresh after the hidden time expires', () => {
  const calls = [];
  const state = createTemporaryHideState();
  startTemporaryHide(state, 300000, 1000);

  const handled = enforceTemporaryHide(
    {
      isVisible() {
        return true;
      },
      setAlwaysOnTop(value) {
        calls.push(['setAlwaysOnTop', value]);
      },
      hide() {
        calls.push(['hide']);
      }
    },
    state,
    301000
  );

  assert.equal(handled, false);
  assert.deepEqual(calls, []);
});

test('clearTemporaryHide ends the active hidden interval', () => {
  const state = createTemporaryHideState();
  startTemporaryHide(state, 300000, 1000);

  clearTemporaryHide(state);

  assert.equal(isTemporaryHideActive(state, 2000), false);
});

test('revealTemporaryHiddenWindow clears temporary hide and shows the window inactive', () => {
  const calls = [];
  const state = createTemporaryHideState();
  startTemporaryHide(state, 300000, 1000);

  revealTemporaryHiddenWindow(
    {
      showInactive() {
        calls.push(['showInactive']);
      }
    },
    state
  );

  assert.equal(isTemporaryHideActive(state, 2000), false);
  assert.deepEqual(calls, [['showInactive']]);
});
