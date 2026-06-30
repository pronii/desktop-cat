const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clamp,
  createHappyState,
  clearHappyState,
  shouldClearHappyState
} = require('../src/renderer/petBehavior');
const petBehavior = require('../src/renderer/petBehavior');

test('clamp keeps values inside the provided bounds', () => {
  assert.equal(clamp(-8, 0, 10), 0);
  assert.equal(clamp(4, 0, 10), 4);
  assert.equal(clamp(18, 0, 10), 10);
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

test('pet behavior no longer exports roaming helpers', () => {
  assert.equal('createRoamOffset' in petBehavior, false);
  assert.equal('createDesktopCatBridge' in petBehavior, false);
});
