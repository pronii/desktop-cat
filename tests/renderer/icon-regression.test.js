const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html'),
  'utf-8'
);

test('toolbar and water panel keep the original icons', () => {
  assert.match(html, /id="waterCounter"[\s\S]*?<span class="sketch-btn-icon">💧<\/span>/);
  assert.match(html, /id="clipboardBtn"[\s\S]*?<span class="sketch-btn-icon">📋<\/span>/);
  assert.match(html, /<h3>💧 喝水记录<\/h3>/);
  assert.match(html, /id="waterPanelDrinkBtn"[\s\S]*?<span>🥤<\/span> 记录/);
});
