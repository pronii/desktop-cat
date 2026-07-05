const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function readSource(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf-8');
}

test('main drag mode has blur and close fallbacks for stopping the follow loop', () => {
  const source = readSource('src', 'main', 'main.js');

  assert.match(source, /function stopDragMode\(\)\s*\{/);
  assert.match(source, /ipcMain\.on\('drag-mode:exit',\s*\(\)\s*=>\s*\{[\s\S]*flushPendingDragMove\(\);[\s\S]*stopDragMode\(\);[\s\S]*\}\)/);
  assert.match(source, /window\.on\('blur',\s*\(\)\s*=>\s*\{[\s\S]*stopDragMode\(\);[\s\S]*refreshTopmost\(window\);[\s\S]*\}\)/);
  assert.match(source, /petWindow\.on\('closed',\s*\(\)\s*=>\s*\{[\s\S]*stopDragMode\(\);/);
});

test('main drag mode moves only when the renderer sends move events', () => {
  const main = readSource('src', 'main', 'main.js');
  const preload = readSource('src', 'main', 'preload.js');
  const enterHandler = main.match(/ipcMain\.on\('drag-mode:enter'[\s\S]*?\n\}\);/)?.[0] || '';

  assert.match(preload, /enter:\s*\(point\)\s*=>\s*ipcRenderer\.send\('drag-mode:enter',\s*point\)/);
  assert.match(preload, /move:\s*\(point\)\s*=>\s*ipcRenderer\.send\('drag-mode:move',\s*point\)/);
  assert.match(main, /function normalizeDragPoint\(point\)/);
  assert.match(main, /ipcMain\.on\('drag-mode:move'/);
  assert.match(main, /normalizeDragPoint\(point\)/);
  assert.doesNotMatch(enterHandler, /setInterval/);
});

test('main drag mode rounds window coordinates before moving the window', () => {
  const main = readSource('src', 'main', 'main.js');
  const moveFlush = main.match(/function flushPendingDragMove\(\)[\s\S]*?\n\}/)?.[0] || '';

  assert.match(main, /function normalizeDragWindowPosition\(point\)/);
  assert.match(moveFlush, /normalizeDragWindowPosition\(\{\s*x:\s*cursor\.x - dragOffset\.x,\s*y:\s*cursor\.y - dragOffset\.y\s*\}\)/);
  assert.doesNotMatch(moveFlush, /setPosition\(cursor\.x - dragOffset\.x,\s*cursor\.y - dragOffset\.y\)/);
});

test('main drag mode ignores invalid window coordinates before setPosition', () => {
  const main = readSource('src', 'main', 'main.js');
  const moveFlush = main.match(/function flushPendingDragMove\(\)[\s\S]*?\n\}/)?.[0] || '';

  assert.match(main, /function normalizeDragWindowCoordinate\(value\)/);
  assert.match(main, /Number\.isFinite\(rounded\)/);
  assert.match(main, /return null/);
  assert.match(moveFlush, /if \(!next\) \{\s*stopDragMode\(\);\s*return;\s*\}/);
  assert.match(moveFlush, /petWindow\.setPosition\(next\.x,\s*next\.y\)/);
});

test('main drag mode coalesces window moves on a 60fps timer', () => {
  const main = readSource('src', 'main', 'main.js');
  const moveHandler = main.match(/ipcMain\.on\('drag-mode:move'[\s\S]*?\n\}\);/)?.[0] || '';

  assert.match(main, /const DRAG_MOVE_FRAME_MS = 1000 \/ 60/);
  assert.match(main, /let pendingDragMovePoint = null/);
  assert.match(main, /let dragMoveTimer = null/);
  assert.match(main, /function scheduleDragMoveFrame\(\)/);
  assert.match(main, /function flushPendingDragMove\(\)/);
  assert.match(main, /setTimeout\(flushPendingDragMove,\s*DRAG_MOVE_FRAME_MS\)/);
  assert.match(moveHandler, /pendingDragMovePoint = normalizeDragPoint\(point\)/);
  assert.match(moveHandler, /scheduleDragMoveFrame\(\)/);
  assert.doesNotMatch(moveHandler, /petWindow\.setPosition\(next\.x,\s*next\.y\)/);
});
