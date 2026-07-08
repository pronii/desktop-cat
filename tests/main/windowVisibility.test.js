const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createFullscreenHideState,
  createManualHideState,
  enforceFullscreenVisibility,
  enforceManualHide,
  hideManually,
  isManualHideActive,
  revealManuallyHiddenWindow
} = require('../../src/main/windowVisibility');

function createFakeWindow({ visible = true } = {}) {
  const calls = [];
  return {
    calls,
    visible,
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    isVisible() {
      return this.visible;
    },
    setAlwaysOnTop(...args) {
      calls.push(['setAlwaysOnTop', ...args]);
    },
    hide() {
      this.visible = false;
      calls.push(['hide']);
    },
    showInactive() {
      this.visible = true;
      calls.push(['showInactive']);
    }
  };
}

test('fullscreen visibility hides the pet window while suspended and restores it afterward', () => {
  const state = createFullscreenHideState();
  const window = createFakeWindow();

  assert.equal(enforceFullscreenVisibility(window, state, true), true);
  assert.deepEqual(window.calls, [
    ['setAlwaysOnTop', false],
    ['hide']
  ]);
  assert.equal(window.visible, false);

  assert.equal(enforceFullscreenVisibility(window, state, false), true);
  assert.deepEqual(window.calls, [
    ['setAlwaysOnTop', false],
    ['hide'],
    ['showInactive']
  ]);
  assert.equal(window.visible, true);
});

test('fullscreen visibility does not reveal a window hidden for another reason', () => {
  const state = createFullscreenHideState();
  const window = createFakeWindow({ visible: false });

  assert.equal(enforceFullscreenVisibility(window, state, true), true);
  assert.deepEqual(window.calls, [['setAlwaysOnTop', false]]);

  assert.equal(enforceFullscreenVisibility(window, state, false), false);
  assert.deepEqual(window.calls, [['setAlwaysOnTop', false]]);
  assert.equal(window.visible, false);
});

test('manual pet hide stays active until explicitly revealed', () => {
  const state = createManualHideState();
  const window = createFakeWindow();

  hideManually(state);

  assert.equal(isManualHideActive(state), true);
  assert.equal(enforceManualHide(window, state), true);
  assert.deepEqual(window.calls, [
    ['setAlwaysOnTop', false],
    ['hide']
  ]);
  assert.equal(window.visible, false);

  assert.equal(isManualHideActive(state), true);
  assert.equal(enforceManualHide(window, state), true);
  assert.equal(window.visible, false);

  revealManuallyHiddenWindow(window, state);

  assert.equal(isManualHideActive(state), false);
  assert.equal(window.visible, true);
  assert.equal(window.calls.at(-1)[0], 'showInactive');
});
