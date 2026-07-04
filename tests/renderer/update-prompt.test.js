const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSource(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf-8');
}

test('renderer provides a compact update prompt instead of relying on system dialogs', () => {
  const html = readSource('src', 'renderer', 'index.html');
  const css = readSource('src', 'renderer', 'styles.css');
  const renderer = readSource('src', 'renderer', 'renderer.js');
  const preload = readSource('src', 'main', 'preload.js');

  assert.match(html, /id="updatePrompt"/);
  assert.match(html, /id="updatePromptPrimary"/);
  assert.match(html, /id="updatePromptSecondary"/);
  assert.match(css, /\.update-prompt\s*\{/);
  assert.match(css, /\.update-prompt\.show\s*\{/);
  assert.match(renderer, /desktopCat\?\.updates\?\.onPrompt/);
  assert.match(renderer, /desktopCat\?\.updates\?\.respond/);
  assert.match(renderer, /setUpdatePromptOpen/);
  assert.match(preload, /updates:\s*\{/);
  assert.match(preload, /update:prompt/);
  assert.match(preload, /update:respond/);
});
