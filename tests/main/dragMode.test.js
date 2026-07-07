const assert = require('node:assert/strict');
const test = require('node:test');

const { createDragModeController } = require('../../src/main/dragMode');

function createWindowStub({ bounds = { x: 100, y: 200 }, destroyed = false } = {}) {
  const positions = [];

  return {
    positions,
    isDestroyed: () => destroyed,
    getBounds: () => bounds,
    setPosition: (x, y) => {
      positions.push({ x, y });
    }
  };
}

function createTimerHarness() {
  let nextId = 1;
  const callbacks = new Map();
  const cleared = [];

  return {
    cleared,
    setTimeout(callback, delay) {
      const id = nextId++;
      callbacks.set(id, { callback, delay });
      return {
        id,
        unrefCalled: false,
        unref() {
          this.unrefCalled = true;
        }
      };
    },
    clearTimeout(timer) {
      cleared.push(timer?.id);
      callbacks.delete(timer?.id);
    },
    flush(id = 1) {
      const entry = callbacks.get(id);
      assert.ok(entry, `Expected timer ${id} to be scheduled`);
      entry.callback();
    },
    getDelay(id = 1) {
      return callbacks.get(id)?.delay;
    }
  };
}

test('drag mode coalesces move events and rounds the flushed window position', () => {
  const window = createWindowStub();
  const timers = createTimerHarness();
  const dragMode = createDragModeController({
    getPetWindow: () => window,
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout
  });

  dragMode.enter({ x: 125, y: 245 });
  dragMode.move({ x: 160.4, y: 290.6 });
  dragMode.move({ x: 170.5, y: 300.2 });

  assert.equal(dragMode.isActive(), true);
  assert.equal(timers.getDelay(), 1000 / 60);
  assert.deepEqual(window.positions, []);

  timers.flush();

  assert.deepEqual(window.positions, [{ x: 146, y: 255 }]);
});

test('drag mode flushes pending movement before stopping on exit', () => {
  const window = createWindowStub();
  const timers = createTimerHarness();
  const dragMode = createDragModeController({
    getPetWindow: () => window,
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout
  });

  dragMode.enter({ x: 110, y: 220 });
  dragMode.move({ x: 130, y: 250 });
  dragMode.exit();

  assert.deepEqual(window.positions, [{ x: 120, y: 230 }]);
  assert.equal(dragMode.isActive(), false);
  assert.deepEqual(timers.cleared, [1]);
});

test('drag mode falls back to the screen cursor for invalid points', () => {
  const window = createWindowStub({ bounds: { x: 25, y: 40 } });
  const timers = createTimerHarness();
  const dragMode = createDragModeController({
    getPetWindow: () => window,
    getCursorScreenPoint: () => ({ x: 80, y: 90 }),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout
  });

  dragMode.enter({ x: 'bad', y: null });
  dragMode.move({ x: Infinity, y: undefined });
  timers.flush();

  assert.deepEqual(window.positions, [{ x: 25, y: 40 }]);
});

test('drag mode stops without moving when the pet window is unavailable', () => {
  const timers = createTimerHarness();
  let window = createWindowStub();
  const dragMode = createDragModeController({
    getPetWindow: () => window,
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout
  });

  dragMode.enter({ x: 10, y: 20 });
  window = null;
  dragMode.move({ x: 30, y: 40 });

  assert.equal(dragMode.isActive(), false);
});
