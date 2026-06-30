const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clamp,
  createRoamOffset,
  createHappyState,
  clearHappyState,
  shouldClearHappyState,
  createDesktopCatBridge
} = require('../src/renderer/petBehavior');

test('clamp keeps values inside the provided bounds', () => {
  assert.equal(clamp(-8, 0, 10), 0);
  assert.equal(clamp(4, 0, 10), 4);
  assert.equal(clamp(18, 0, 10), 10);
});

test('createRoamOffset returns a bounded movement from deterministic random values', () => {
  const offset = createRoamOffset({
    maxStep: 24,
    random: () => 0.75
  });

  assert.deepEqual(offset, { x: 12, y: 12 });
});

test('createRoamOffset keeps at least one axis visibly moving when minStep is set', () => {
  const offset = createRoamOffset({
    maxStep: 28,
    minStep: 12,
    random: () => 0.51
  });

  assert.equal(Math.max(Math.abs(offset.x), Math.abs(offset.y)) >= 12, true);
});

test('createHappyState and clearHappyState toggle the happy feedback flag', () => {
  const happy = createHappyState({ now: 1000, duration: 900 });

  assert.deepEqual(happy, {
    isHappy: true,
    happyUntil: 1900
  });

  assert.deepEqual(clearHappyState(happy), {
    isHappy: false,
    happyUntil: 0
  });
});

test('shouldClearHappyState becomes true after the happy timeout', () => {
  const state = createHappyState({ now: 1000, duration: 900 });

  assert.equal(shouldClearHappyState(state, 1899), false);
  assert.equal(shouldClearHappyState(state, 1900), true);
});

test('createDesktopCatBridge falls back to no-op methods when preload is unavailable', () => {
  const bridge = createDesktopCatBridge(undefined);

  assert.doesNotThrow(() => {
    bridge.nudgeWindow({ x: 1, y: -1 });
  });
});

test('createDesktopCatBridge forwards calls to the native bridge when available', () => {
  const calls = [];
  const bridge = createDesktopCatBridge({
    nudgeWindow(offset) {
      calls.push(['nudgeWindow', offset]);
    }
  });

  bridge.nudgeWindow({ x: 2, y: -3 });

  assert.deepEqual(calls, [
    ['nudgeWindow', { x: 2, y: -3 }]
  ]);
});

test('createDesktopCatBridge subscribes to roaming pause changes when available', () => {
  const callbacks = [];
  const bridge = createDesktopCatBridge({
    onRoamingPausedChanged(callback) {
      callbacks.push(callback);
      return () => callbacks.pop();
    }
  });

  const unsubscribe = bridge.onRoamingPausedChanged(() => {});

  assert.equal(callbacks.length, 1);
  unsubscribe();
  assert.equal(callbacks.length, 0);
});
