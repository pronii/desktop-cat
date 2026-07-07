const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function readSource(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf-8');
}

test('main drag mode has blur and close fallbacks for stopping the follow loop', () => {
  const source = readSource('src', 'main', 'main.js');
  const ipcHandlers = readSource('src', 'main', 'ipcHandlers.js');

  assert.match(source, /createDragModeController\(\{/);
  assert.match(ipcHandlers, /ipcMain\.on\('drag-mode:exit',\s*\(\)\s*=>\s*\{[\s\S]*onDragModeExit\?\.\(\);[\s\S]*\}\)/);
  assert.match(source, /window\.on\('blur',\s*\(\)\s*=>\s*\{[\s\S]*dragMode\.stop\(\);[\s\S]*refreshTopmost\(window\);[\s\S]*\}\)/);
  assert.match(source, /petWindow\.on\('closed',\s*\(\)\s*=>\s*\{[\s\S]*dragMode\.stop\(\);/);
});

test('main drag mode moves only when the renderer sends move events', () => {
  const main = readSource('src', 'main', 'main.js');
  const preload = readSource('src', 'main', 'preload.js');
  const ipcHandlers = readSource('src', 'main', 'ipcHandlers.js');
  const dragMoveHandler = ipcHandlers.match(/ipcMain\.on\('drag-mode:move'[\s\S]*?\n  \}\);/)?.[0] || '';

  assert.match(preload, /enter:\s*\(point\)\s*=>\s*ipcRenderer\.send\('drag-mode:enter',\s*point\)/);
  assert.match(preload, /move:\s*\(point\)\s*=>\s*ipcRenderer\.send\('drag-mode:move',\s*point\)/);
  assert.match(ipcHandlers, /ipcMain\.on\('drag-mode:move'/);
  assert.match(main, /onDragModeMove:\s*dragMode\.move/);
  assert.doesNotMatch(dragMoveHandler, /setInterval/);
});

test('main drag mode rounds window coordinates before moving the window', () => {
  const dragMode = readSource('src', 'main', 'dragMode.js');
  const moveFlush = dragMode.match(/function flush\(\)[\s\S]*?\n  \}/)?.[0] || '';

  assert.match(dragMode, /function normalizeDragWindowPosition\(point\)/);
  assert.match(moveFlush, /normalizeDragWindowPosition\(\{\s*x:\s*cursor\.x - offset\.x,\s*y:\s*cursor\.y - offset\.y\s*\}\)/);
  assert.doesNotMatch(moveFlush, /setPosition\(cursor\.x - offset\.x,\s*cursor\.y - offset\.y\)/);
});

test('main drag mode ignores invalid window coordinates before setPosition', () => {
  const dragMode = readSource('src', 'main', 'dragMode.js');
  const moveFlush = dragMode.match(/function flush\(\)[\s\S]*?\n  \}/)?.[0] || '';

  assert.match(dragMode, /function normalizeDragWindowCoordinate\(value\)/);
  assert.match(dragMode, /Number\.isFinite\(rounded\)/);
  assert.match(dragMode, /return null/);
  assert.match(moveFlush, /if \(!next\) \{\s*stop\(\);\s*return;\s*\}/);
  assert.match(moveFlush, /window\.setPosition\(next\.x,\s*next\.y\)/);
});

test('main drag mode coalesces window moves on a 60fps timer', () => {
  const main = readSource('src', 'main', 'main.js');
  const dragMode = readSource('src', 'main', 'dragMode.js');
  const ipcHandlers = readSource('src', 'main', 'ipcHandlers.js');

  assert.match(dragMode, /const DEFAULT_DRAG_MOVE_FRAME_MS = 1000 \/ 60/);
  assert.match(dragMode, /let pendingMovePoint = null/);
  assert.match(dragMode, /let moveTimer = null/);
  assert.match(dragMode, /function scheduleMoveFrame\(\)/);
  assert.match(dragMode, /function flush\(\)/);
  assert.match(dragMode, /setTimeout\(flush,\s*frameMs\)/);
  assert.match(dragMode, /pendingMovePoint = normalizeDragPoint\(point\)/);
  assert.match(dragMode, /scheduleMoveFrame\(\)/);
  assert.match(main, /onDragModeMove:\s*dragMode\.move/);
  assert.match(ipcHandlers, /ipcMain\.on\('drag-mode:move'/);
  assert.doesNotMatch(ipcHandlers, /petWindow\.setPosition\(next\.x,\s*next\.y\)/);
});
