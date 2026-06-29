const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampToWorkArea,
  centerInWorkArea
} = require('../src/main/windowMovement');

test('clampToWorkArea keeps the whole window inside the display work area', () => {
  const target = clampToWorkArea(
    { width: 240, height: 240 },
    { x: 0, y: 0, width: 800, height: 600 },
    700,
    -40
  );

  assert.deepEqual(target, { x: 560, y: 0 });
});

test('centerInWorkArea places the window in the middle of the display work area', () => {
  const target = centerInWorkArea(
    { width: 240, height: 200 },
    { x: 20, y: 40, width: 1000, height: 800 }
  );

  assert.deepEqual(target, { x: 400, y: 340 });
});
