const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { formatUpdatePromptNotes } = require('../../src/renderer/updatePromptText');

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
  assert.match(html, /<script src="\.\/updatePromptText\.js"><\/script>\s*<script src="\.\/renderer\.js"><\/script>/);
  assert.match(renderer, /formatUpdatePromptNotes/);
  assert.match(renderer, /desktopCat\?\.updates\?\.onPrompt/);
  assert.match(renderer, /desktopCat\?\.updates\?\.respond/);
  assert.match(renderer, /setUpdatePromptOpen/);
  assert.match(preload, /updates:\s*\{/);
  assert.match(preload, /update:prompt/);
  assert.match(preload, /update:respond/);
});

test('update prompt release notes render HTML release notes as readable text', () => {
  const notes = '<h2>desktop-cat 0.3.6</h2><ul><li>好友同屏现在会同步本地宠物的 Live2D 形象。</li><li>修复 &amp; 优化更新提示。</li></ul>';

  assert.equal(
    formatUpdatePromptNotes(notes),
    'desktop-cat 0.3.6 好友同屏现在会同步本地宠物的 Live2D 形象。 修复 & 优化更新提示。'
  );
  assert.equal(formatUpdatePromptNotes(''), 'desktop-cat 有新版本可用。');
});
