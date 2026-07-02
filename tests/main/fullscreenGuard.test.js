const test = require('node:test');
const assert = require('node:assert/strict');

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
