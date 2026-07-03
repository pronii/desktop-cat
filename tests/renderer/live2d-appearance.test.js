const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSource(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf-8');
}

test('renderer auto-loads Live2D from folder without adding an import button', () => {
  const html = readSource('src', 'renderer', 'index.html');
  const css = readSource('src', 'renderer', 'styles.css');
  const preload = readSource('src', 'main', 'preload.js');

  assert.match(html, /id="live2dCanvas"/);
  assert.match(html, /vendor\/live2d\/live2dcubismcore\.min\.js/);
  assert.match(html, /vendor\/live2d\/pixi\.min\.js/);
  assert.match(html, /vendor\/live2d\/pixi-live2d-cubism4\.min\.js/);
  assert.match(html, /live2dMotionController\.js/);
  assert.match(html, /live2dAppearance\.js/);
  assert.ok(
    html.indexOf('live2dMotionController.js') < html.indexOf('live2dAppearance.js'),
    'motion controller must load before Live2D appearance script'
  );
  assert.doesNotMatch(html, /id="live2dImportBtn"/);
  assert.doesNotMatch(html, /导入 Live2D|瀵煎叆 Live2D/);

  assert.match(css, /\.live2d-canvas\s*\{/);
  assert.match(css, /\.stage\.has-live2d\s+\.cat/);
  assert.match(css, /\.stage\.has-live2d\s+\.live2d-canvas/);

  assert.match(preload, /appearance\s*:\s*\{/);
  assert.match(preload, /getLive2DModel:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('appearance:get-live2d-model'\)/);
});

test('live2d renderer script keeps the default cat when no model is configured', () => {
  const script = readSource('src', 'renderer', 'live2dAppearance.js');

  assert.match(script, /getLive2DModel/);
  assert.match(script, /Live2DModel\.from/);
  assert.match(script, /createLive2DMotionController/);
  assert.match(script, /playTap/);
  assert.match(script, /has-live2d/);
  assert.match(script, /catch/);
});
