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
  const preload = readSource('src', 'main', 'preload.js');
  const main = readSource('src', 'main', 'main.js');
  const ipcHandlers = readSource('src', 'main', 'ipcHandlers.js');

  assert.match(html, /id="settingsBtn"/);
  assert.match(html, /aria-controls="settingsPanel"/);
  assert.match(html, /id="settingsPanel"/);
  assert.match(html, /id="settingsPanelClose"/);
  assert.match(html, /id="randomSpeechToggle"/);
  assert.match(html, /id="autoLaunchToggle"/);
  assert.match(html, /话痨模式/);
  assert.doesNotMatch(html, /随机说话/);
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
  assert.match(renderer, /autoLaunchToggle/);
  assert.match(renderer, /bottomButtonControls/);
  assert.match(renderer, /scheduleRandomSpeech/);
  assert.match(renderer, /__desktopCatApplySettings/);
  assert.match(renderer, /ensureCurrentModelVisible/);

  assert.match(preload, /autoLaunch:\s*\{/);
  assert.match(preload, /auto-launch:get-state/);
  assert.match(preload, /auto-launch:set-enabled/);
  assert.match(main, /getAutoLaunchController/);
  assert.match(ipcHandlers, /auto-launch:get-state/);
  assert.match(ipcHandlers, /auto-launch:set-enabled/);
});

test('settings panel closes when switching to another floating panel', () => {
  const renderer = readSource('src', 'renderer', 'renderer.js');
  const waterPanel = readSource('src', 'renderer', 'waterPanel.js');
  const clipboardPanel = readSource('src', 'renderer', 'clipboardPanel.js');
  const roomPanel = readSource('src', 'renderer', 'roomPanel.js');
  const live2dPanel = readSource('src', 'renderer', 'live2dPanel.js');

  assert.match(renderer, /window\.__closeSettingsPanel\s*=\s*\(\)\s*=>\s*setSettingsPanelOpen\(false\)/);
  assert.match(waterPanel, /function openReminderDialog[\s\S]*?window\.__closeSettingsPanel\?\.\(\);[\s\S]*?waterReminderDialog\.classList\.add\('show'\)/);
  assert.match(waterPanel, /waterCounter\?\.addEventListener\('click'[\s\S]*?window\.__closeSettingsPanel\?\.\(\);[\s\S]*?openPanel\(\)/);
  assert.match(clipboardPanel, /clipboardBtn\.addEventListener\('click'[\s\S]*?window\.__closeSettingsPanel\?\.\(\);[\s\S]*?openClipboardPanel\(\)/);
  assert.match(roomPanel, /function openPanel\(\)[\s\S]*?window\.__closeSettingsPanel\?\.\(\);[\s\S]*?setPanelOpen\(true\)/);
  assert.match(live2dPanel, /live2dBtn\?\.addEventListener\('click'[\s\S]*?window\.__closeSettingsPanel\?\.\(\);[\s\S]*?setOpen\(!live2dPanel\?\.classList\.contains\('show'\)\)/);
});
