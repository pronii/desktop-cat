const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function readProjectFile(...segments) {
  return fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf8');
}

test('renderer no longer schedules random movement', () => {
  const renderer = readProjectFile('src', 'renderer', 'renderer.js');

  assert.equal(renderer.includes('createRoamOffset'), false);
  assert.equal(renderer.includes('nudgeWindow'), false);
  assert.equal(renderer.includes('roamingPaused'), false);
});

test('electron bridge no longer exposes random movement IPC', () => {
  const preload = readProjectFile('src', 'main', 'preload.js');
  const main = readProjectFile('src', 'main', 'main.js');

  assert.equal(preload.includes('pet-window:nudge'), false);
  assert.equal(preload.includes('pet-controls:roaming-paused'), false);
  assert.equal(main.includes('pet-window:nudge'), false);
  assert.equal(main.includes('pet-controls:roaming-paused'), false);
});
