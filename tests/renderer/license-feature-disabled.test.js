const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function readSource(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf8');
}

function stripHtmlComments(source) {
  return source.replace(/<!--([\s\S]*?)-->/g, '');
}

function stripJsLineComments(source) {
  return source
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

test('license activation UI is commented out for this version', () => {
  const activeHtml = stripHtmlComments(readSource('src', 'renderer', 'index.html'));

  assert.doesNotMatch(activeHtml, /id="licenseKeyInput"/);
  assert.doesNotMatch(activeHtml, /id="licenseActivateBtn"/);
  assert.doesNotMatch(activeHtml, /src="\.\/licensePanel\.js"/);
});

test('preload does not expose license activation API for this version', () => {
  const activeSource = stripJsLineComments(readSource('src', 'main', 'preload.js'));

  assert.doesNotMatch(activeSource, /license:\s*\{/);
  assert.doesNotMatch(activeSource, /license:activate/);
  assert.doesNotMatch(activeSource, /license:check/);
});