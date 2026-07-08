const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { shouldSuspendTopmost } = require('../../src/main/fullscreenGuard');

const display = { x: 0, y: 0, width: 1920, height: 1080 };

test('does not suspend topmost for a fullscreen background window', () => {
  const foreground = {
    hwnd: 'foreground',
    title: 'Notes',
    className: 'Notepad',
    processName: 'notepad',
    x: 80,
    y: 80,
    width: 800,
    height: 600
  };
  const backgroundFullscreen = {
    hwnd: 'background',
    title: 'Browser',
    className: 'Chrome_WidgetWin_1',
    processName: 'chrome',
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    display
  };

  assert.equal(
    shouldSuspendTopmost({
      foreground,
      windows: [foreground, backgroundFullscreen],
      display,
      petWindowId: 'pet'
    }),
    false
  );
});

test('suspends topmost when the foreground window is fullscreen', () => {
  const foreground = {
    hwnd: 'foreground',
    title: 'Video',
    className: 'Chrome_WidgetWin_1',
    processName: 'chrome',
    x: 0,
    y: 0,
    width: 1920,
    height: 1080
  };

  assert.equal(
    shouldSuspendTopmost({
      foreground,
      windows: [foreground],
      display,
      petWindowId: 'pet'
    }),
    true
  );
});

test('suspends topmost when the foreground window is Windows screen clipping', () => {
  const foreground = {
    hwnd: 'screen-clip',
    title: '',
    className: 'Windows.UI.Core.CoreWindow',
    processName: 'ScreenClippingHost',
    x: 0,
    y: 0,
    width: 1920,
    height: 1080
  };

  assert.equal(
    shouldSuspendTopmost({
      foreground,
      windows: [foreground],
      display,
      petWindowId: 'pet'
    }),
    true
  );
});

test('does not suspend topmost for taskbar window preview surfaces', () => {
  const foreground = {
    hwnd: 'taskbar-preview',
    title: 'Browser preview',
    className: 'TaskListThumbnailWnd',
    processName: 'explorer',
    x: 0,
    y: 0,
    width: 1920,
    height: 1080
  };

  assert.equal(
    shouldSuspendTopmost({
      foreground,
      windows: [foreground],
      display,
      petWindowId: 'pet'
    }),
    false
  );
});
test('topmost refresh hides the pet window while fullscreen suspension is active', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'main', 'main.js'),
    'utf8'
  );

  assert.match(source, /createFullscreenHideState/);
  assert.match(source, /enforceFullscreenVisibility/);
  assert.match(
    source,
    /if\s*\(topmostSuspended\)\s*\{[\s\S]*enforceFullscreenVisibility\(window,\s*fullscreenHideState,\s*true\);[\s\S]*return;[\s\S]*\}/
  );
});
