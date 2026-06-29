const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rendererDir = path.join(__dirname, '..', 'src', 'renderer');

test('renderer includes a dedicated native drag handle', () => {
  const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');

  assert.match(html, /class="drag-handle"/);
  assert.match(html, /aria-label="Drag desktop cat"/);
});

test('drag handle uses Electron native drag while cat stays clickable', () => {
  const css = fs.readFileSync(path.join(rendererDir, 'styles.css'), 'utf8');

  assert.match(css, /\.drag-handle\s*{[^}]*-webkit-app-region:\s*drag;/s);
  assert.match(css, /\.cat\s*{[^}]*-webkit-app-region:\s*no-drag;/s);
  assert.match(css, /\.cat \*\s*{[^}]*-webkit-app-region:\s*no-drag;/s);
});

test('cat feedback starts on mouse down for immediate desktop response', () => {
  const js = fs.readFileSync(path.join(rendererDir, 'renderer.js'), 'utf8');

  assert.match(js, /cat\.addEventListener\('mousedown'/);
  assert.match(js, /setHappy\(\)/);
});
