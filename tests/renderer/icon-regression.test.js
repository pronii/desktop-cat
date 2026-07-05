const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html'),
  'utf-8'
);
const waterPanelScript = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'renderer', 'waterPanel.js'),
  'utf-8'
);
const noticePath = path.join(__dirname, '..', '..', 'src', 'renderer', 'assets', 'NOTICE.lucide.md');

test('toolbar and panels use local SVG icons instead of emoji', () => {
  const live2dButton = html.match(/<button[^>]*id="live2dSwitcherBtn"[\s\S]*?<\/button>/)?.[0] || '';

  assert.match(html, /id="waterCounter"[\s\S]*?<svg[^>]*data-icon="droplet"/);
  assert.match(html, /id="clipboardBtn"[\s\S]*?<svg[^>]*data-icon="clipboard-list"/);
  assert.match(html, /id="roomBtn"[\s\S]*?<svg[^>]*data-icon="users"/);
  assert.match(live2dButton, /<svg[^>]*data-icon="appearance-sparkles"/);
  assert.doesNotMatch(live2dButton, /data-icon="theater"/);
  assert.match(html, /id="settingsBtn"[\s\S]*?<svg[^>]*data-icon="settings"/);
  assert.match(html, /id="catSizeBtn"[\s\S]*?<svg[^>]*data-icon="move-diagonal"/);
  assert.match(html, /id="waterPanelDrinkBtn"[\s\S]*?<svg[^>]*data-icon="cup-soda"/);
  assert.match(html, /class="water-reminder-icon"[\s\S]*?<svg[^>]*data-icon="droplet"/);
  assert.match(html, /class="update-prompt-icon"[\s\S]*?<svg[^>]*data-icon="arrow-up"/);

  assert.doesNotMatch(html, /[💧📋👥🎭⚙🥤⏰]/);
  assert.doesNotMatch(waterPanelScript, /[💧⏰]/);
  assert.equal(fs.existsSync(noticePath), true);
  const notice = fs.readFileSync(noticePath, 'utf-8');
  assert.match(notice, /lucide-static/);
  assert.match(notice, /ISC/);
});
