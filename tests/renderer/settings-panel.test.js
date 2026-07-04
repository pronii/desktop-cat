const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSource(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf-8');
}

function readCssBlock(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escapedSelector}\\s*\\{[\\s\\S]*?\\}`))?.[0] || '';
}

test('settings panel controls random speech and bottom button visibility', () => {
  const html = readSource('src', 'renderer', 'index.html');
  const css = readSource('src', 'renderer', 'styles.css');
  const renderer = readSource('src', 'renderer', 'renderer.js');
  const petBehavior = readSource('src', 'renderer', 'petBehavior.js');

  assert.match(html, /id="settingsBtn"/);
  assert.match(html, /aria-controls="settingsPanel"/);
  assert.match(html, /id="settingsPanel"/);
  assert.match(html, /id="settingsPanelClose"/);
  assert.match(html, /id="randomSpeechToggle"/);
  assert.match(html, /data-bottom-button-toggle="water"/);
  assert.match(html, /data-bottom-button-toggle="clipboard"/);
  assert.match(html, /data-bottom-button-toggle="room"/);
  assert.match(html, /data-bottom-button-toggle="live2d"/);
  assert.match(html, /data-bottom-button-toggle="catSize"/);

  const settingsPanelCss = readCssBlock(css, '.settings-panel');
  assert.match(settingsPanelCss, /height:\s*280px/);
  assert.match(css, /\.sketch-panel-header-settings\s*\{/);
  assert.match(css, /\.settings-panel-body\s*\{/);
  assert.match(css, /\.settings-row\s*\{/);
  assert.match(css, /\.is-hidden-by-settings\s*\{/);

  assert.match(petBehavior, /DEFAULT_PET_SETTINGS/);
  assert.match(petBehavior, /normalizePetSettings/);
  assert.match(petBehavior, /createRandomSpeechDelay/);

  assert.match(renderer, /PET_SETTINGS_STORAGE_KEY/);
  assert.match(renderer, /randomSpeechToggle/);
  assert.match(renderer, /bottomButtonControls/);
  assert.match(renderer, /scheduleRandomSpeech/);
  assert.match(renderer, /__desktopCatApplySettings/);
  assert.match(renderer, /ensureCurrentModelVisible/);
});
