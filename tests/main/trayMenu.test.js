const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const {
  TRAY_ICON_PATH,
  createFallbackTrayIconDataUrl,
  createTrayIconDataUrl
} = require('../../src/main/trayMenu');

test('createTrayIconDataUrl uses the bundled Fluent Emoji tray icon', () => {
  const dataUrl = createTrayIconDataUrl();
  const expectedBase64 = fs.readFileSync(TRAY_ICON_PATH).toString('base64');

  assert.equal(dataUrl, `data:image/png;base64,${expectedBase64}`);
});

test('createTrayIconDataUrl falls back when the bundled icon cannot be read', () => {
  assert.equal(
    createTrayIconDataUrl('missing-tray-icon.png'),
    createFallbackTrayIconDataUrl()
  );
});
