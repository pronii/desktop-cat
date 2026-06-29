const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateCoverage,
  isFullscreenForeground,
  shouldSuspendTopmost,
  normalizeWindowSnapshot
  , isIgnoredSystemWindow
} = require('../src/main/fullscreenGuard');

const display = {
  x: 0,
  y: 0,
  width: 1920,
  height: 1080
};

test('calculateCoverage measures how much of the display a window covers', () => {
  const coverage = calculateCoverage(
    { x: 0, y: 0, width: 1920, height: 1080 },
    display
  );

  assert.equal(coverage, 1);
});

test('isFullscreenForeground returns true for a window covering the screen', () => {
  assert.equal(
    isFullscreenForeground(
      { hwnd: '123', x: 0, y: 0, width: 1920, height: 1080 },
      display
    ),
    true
  );
});

test('isFullscreenForeground returns false for a normal window', () => {
  assert.equal(
    isFullscreenForeground(
      { hwnd: '123', x: 100, y: 100, width: 1200, height: 700 },
      display
    ),
    false
  );
});

test('isFullscreenForeground returns false for a maximized window that leaves taskbar visible', () => {
  assert.equal(
    isFullscreenForeground(
      { hwnd: '123', x: -7, y: -7, width: 2062, height: 1118 },
      { x: 0, y: 0, width: 2048, height: 1152 }
    ),
    false
  );
});

test('shouldSuspendTopmost ignores the pet window itself', () => {
  assert.equal(
    shouldSuspendTopmost({
      foreground: { hwnd: '777', x: 0, y: 0, width: 1920, height: 1080 },
      display,
      petWindowId: '777'
    }),
    false
  );
});

test('shouldSuspendTopmost detects a fullscreen window even when pet is foreground', () => {
  assert.equal(
    shouldSuspendTopmost({
      foreground: { hwnd: '777', x: 30, y: 30, width: 240, height: 240 },
      windows: [
        { hwnd: '777', x: 30, y: 30, width: 240, height: 240, display },
        { hwnd: '999', x: 0, y: 0, width: 1920, height: 1080, display }
      ],
      display,
      petWindowId: '777'
    }),
    true
  );
});

test('shouldSuspendTopmost ignores fullscreen desktop shell windows', () => {
  assert.equal(
    shouldSuspendTopmost({
      foreground: { hwnd: '777', x: 30, y: 30, width: 240, height: 240 },
      windows: [
        {
          hwnd: '888',
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          className: 'WorkerW',
          title: '',
          display
        }
      ],
      display,
      petWindowId: '777'
    }),
    false
  );
});

test('isIgnoredSystemWindow recognizes desktop shell windows', () => {
  assert.equal(isIgnoredSystemWindow({ className: 'WorkerW', title: '' }), true);
  assert.equal(isIgnoredSystemWindow({ className: 'Progman', title: 'Program Manager' }), true);
  assert.equal(isIgnoredSystemWindow({ className: 'Windows.UI.Core.CoreWindow', processName: 'TextInputHost', title: 'Windows Input Experience' }), true);
  assert.equal(isIgnoredSystemWindow({ className: 'CEF-OSC-WIDGET', processName: 'NVIDIA Overlay', title: 'NVIDIA GeForce Overlay' }), true);
  assert.equal(isIgnoredSystemWindow({ className: 'Chrome_WidgetWin_1', title: 'Video' }), false);
});

test('shouldSuspendTopmost keeps previous state when detection fails', () => {
  assert.equal(
    shouldSuspendTopmost({
      foreground: null,
      display,
      petWindowId: '777',
      previousSuspend: true
    }),
    true
  );
});

test('normalizeWindowSnapshot converts Win32 rect data into a window snapshot', () => {
  assert.deepEqual(
    normalizeWindowSnapshot({
      hwnd: 42,
      left: 10,
      top: 20,
      right: 110,
      bottom: 220,
      title: 'Demo',
      className: 'DemoClass',
      processName: 'demo'
    }),
    {
      hwnd: '42',
      title: 'Demo',
      className: 'DemoClass',
      processName: 'demo',
      x: 10,
      y: 20,
      width: 100,
      height: 200
    }
  );
});
