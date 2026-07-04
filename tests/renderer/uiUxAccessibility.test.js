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

test('main renderer declares Chinese language and localized pet labels', () => {
  const html = readSource('src', 'renderer', 'index.html');

  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<main class="stage" aria-label="桌面小猫宠物">/);
  assert.match(html, /<button class="cat" type="button" aria-label="摸摸小猫">/);
});

test('interactive controls have visible keyboard focus styles', () => {
  const css = readSource('src', 'renderer', 'styles.css');

  assert.match(css, /\.cat:focus-visible\s*\{/);
  assert.match(css, /\.sketch-btn:focus-visible\s*\{/);
  assert.match(css, /\.sketch-action-btn:focus-visible\s*\{/);
  assert.match(css, /\.sketch-panel-close:focus-visible\s*\{/);
  assert.match(css, /\.clipboard-panel-action:focus-visible\s*\{/);
  assert.match(css, /\.sketch-interval:focus-visible\s*\{/);
  assert.match(css, /\.live2d-model-card:focus-visible\s*\{/);
});

test('compact action controls keep usable hit targets', () => {
  const css = readSource('src', 'renderer', 'styles.css');
  const panelCloseCss = readCssBlock(css, '.sketch-panel-close');
  const clipboardCloseCss = readCssBlock(css, '.clipboard-panel-close');
  const clipboardActionCss = readCssBlock(css, '.clipboard-panel-action');
  const intervalCss = readCssBlock(css, '.sketch-interval');

  assert.match(panelCloseCss, /width:\s*32px/);
  assert.match(panelCloseCss, /height:\s*32px/);
  assert.match(clipboardCloseCss, /width:\s*32px/);
  assert.match(clipboardCloseCss, /height:\s*32px/);
  assert.match(clipboardActionCss, /min-height:\s*32px/);
  assert.match(intervalCss, /min-height:\s*30px/);
  assert.match(css, /\.water-task-input,\s*\.water-task-time-input\s*\{[\s\S]*?min-height:\s*32px/);
});

test('floating prompts move focus into the prompt and restore it when closed', () => {
  const renderer = readSource('src', 'renderer', 'renderer.js');
  const waterPanel = readSource('src', 'renderer', 'waterPanel.js');

  assert.match(renderer, /let updatePromptReturnFocus\s*=\s*null/);
  assert.match(renderer, /focusFirstPromptControl\(updatePrompt\)/);
  assert.match(renderer, /restorePromptFocus\(updatePromptReturnFocus\)/);

  assert.match(waterPanel, /let waterReminderReturnFocus\s*=\s*null/);
  assert.match(waterPanel, /focusFirstReminderControl\(waterReminderDialog\)/);
  assert.match(waterPanel, /restoreReminderFocus\(waterReminderReturnFocus\)/);
});

test('embedded clipboard panel exposes copy feedback to assistive tech', () => {
  const html = readSource('src', 'renderer', 'index.html');
  const script = readSource('src', 'renderer', 'clipboardPanel.js');

  assert.match(html, /id="clipboardPanelStatus"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(script, /clipboardPanelStatus/);
  assert.match(script, /announceClipboardStatus\('已复制'\)/);
  assert.match(script, /announceClipboardStatus\('已删除'\)/);
  assert.match(script, /announceClipboardStatus\('已清空历史'\)/);
});
