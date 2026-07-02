const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSource(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf-8');
}

test('renderer shell no longer renders shortcuts entry points', () => {
  const html = readSource('src', 'renderer', 'index.html');

  assert.doesNotMatch(html, /id="shortcutsBtn"/);
  assert.doesNotMatch(html, /id="shortcutsPanel"/);
  assert.doesNotMatch(html, /shortcutsPanel\.js/);
  assert.doesNotMatch(html, /常用捷径仓/);
});

test('desktop bridge no longer exposes shortcuts api', () => {
  const preload = readSource('src', 'main', 'preload.js');

  assert.doesNotMatch(preload, /\bshortcuts\s*:/);
  assert.doesNotMatch(preload, /shortcuts:/);
});

test('main and clipboard flows no longer depend on shortcuts feature', () => {
  const main = readSource('src', 'main', 'main.js');
  const trayMenu = readSource('src', 'main', 'trayMenu.js');
  const menuState = readSource('src', 'main', 'menuState.js');
  const clipboardPanel = readSource('src', 'renderer', 'clipboardPanel.js');
  const waterPanel = readSource('src', 'renderer', 'waterPanel.js');

  assert.doesNotMatch(main, /shortcuts/i);
  assert.doesNotMatch(trayMenu, /常用捷径|openShortcuts|shortcuts/i);
  assert.doesNotMatch(menuState, /常用捷径|openShortcuts|shortcuts/i);
  assert.doesNotMatch(clipboardPanel, /shortcutsApi|收藏为捷径|requestOpenPanel|setDraftFromClipboard/);
  assert.doesNotMatch(waterPanel, /__closeShortcutsPanel|shortcuts/i);
});
