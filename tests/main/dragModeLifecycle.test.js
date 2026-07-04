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
  assert.match(source, /ipcMain\.on\('drag-mode:exit',\s*stopDragMode\)/);
  assert.match(source, /window\.on\('blur',\s*\(\)\s*=>\s*\{[\s\S]*stopDragMode\(\);[\s\S]*refreshTopmost\(window\);[\s\S]*\}\)/);
  assert.match(source, /petWindow\.on\('closed',\s*\(\)\s*=>\s*\{[\s\S]*stopDragMode\(\);/);
});
