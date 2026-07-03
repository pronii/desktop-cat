const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const petBehavior = require('../../src/renderer/petBehavior');

class FakeClassList {
  constructor() {
    this.names = new Set();
  }

  add(name) {
    this.names.add(name);
  }

  remove(name) {
    this.names.delete(name);
  }

  toggle(name, force) {
    if (force) {
      this.names.add(name);
      return true;
    }
    this.names.delete(name);
    return false;
  }

  contains(name) {
    return this.names.has(name);
  }
}

class FakeElement {
  constructor() {
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.attributes = new Map();
    this.textContent = '';
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) {
      listener(event);
    }
  }

  querySelector() {
    return new FakeElement();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  setPointerCapture() {}

  releasePointerCapture() {}
}

function createRendererHarness() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'renderer', 'renderer.js'),
    'utf8'
  );
  const cat = new FakeElement();
  const stage = new FakeElement();
  const live2dCanvas = new FakeElement();
  const waterBowl = new FakeElement();
  const waterCounter = new FakeElement();
  const bottomBar = new FakeElement();
  const catSizeBtn = new FakeElement();
  const documentElement = {
    classList: new FakeClassList(),
    style: { setProperty() {} }
  };
  const timers = new Map();
  const windowListeners = new Map();
  let nextTimerId = 1;
  let dragEnterCount = 0;
  let dragExitCount = 0;

  const fakeWindow = {
    petBehavior,
    desktopCatDebug: {},
    desktopCat: {
      dragMode: {
        enter() {
          dragEnterCount += 1;
        },
        exit() {
          dragExitCount += 1;
        }
      },
      waterReminder: {
        getConfig() {
          return Promise.resolve({ dailyCount: 0 });
        },
        onTrigger() {
          return () => {};
        }
      }
    },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {}
    },
    setTimeout(callback) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    dispatch(type, event = {}) {
      for (const listener of windowListeners.get(type) || []) {
        listener(event);
      }
    }
  };

  const fakeDocument = {
    documentElement,
    querySelector(selector) {
      if (selector === '.stage') return stage;
      if (selector === '.cat') return cat;
      if (selector === '.water-bowl') return waterBowl;
      if (selector === '.bottom-bar') return bottomBar;
      return null;
    },
    getElementById(id) {
      if (id === 'live2dCanvas') return live2dCanvas;
      if (id === 'waterCounter') return waterCounter;
      if (id === 'catSizeBtn') return catSizeBtn;
      return null;
    }
  };

  vm.runInNewContext(source, {
    window: fakeWindow,
    document: fakeDocument,
    console
  });

  return {
    cat,
    stage,
    live2dCanvas,
    catSizeBtn,
    documentElement,
    window: fakeWindow,
    flushTimers() {
      for (const [id, callback] of Array.from(timers.entries())) {
        timers.delete(id);
        callback();
      }
    },
    get dragEnterCount() {
      return dragEnterCount;
    },
    get dragExitCount() {
      return dragExitCount;
    }
  };
}

test('cat drag mode survives leaving the cat element until mouseup', () => {
  const harness = createRendererHarness();

  harness.cat.dispatch('mousedown', {
    button: 0,
    preventDefault() {}
  });
  harness.flushTimers();

  assert.equal(harness.dragEnterCount, 1);

  harness.cat.dispatch('mouseleave');

  assert.equal(harness.dragExitCount, 0);
  assert.equal(harness.cat.classList.contains('is-dragging'), true);

  harness.window.dispatch('mouseup');

  assert.equal(harness.dragExitCount, 1);
  assert.equal(harness.cat.classList.contains('is-dragging'), false);
});

test('live2d canvas uses the same long press drag mode as the default cat', () => {
  const harness = createRendererHarness();

  harness.live2dCanvas.dispatch('mousedown', {
    button: 0,
    preventDefault() {}
  });
  harness.flushTimers();

  assert.equal(harness.dragEnterCount, 1);
  assert.equal(harness.cat.classList.contains('is-dragging'), true);

  harness.window.dispatch('mouseup');

  assert.equal(harness.dragExitCount, 1);
  assert.equal(harness.cat.classList.contains('is-dragging'), false);
});

test('cat size button appears near the cat and stays visible while resizing', () => {
  const harness = createRendererHarness();

  assert.equal(harness.documentElement.classList.contains('is-cat-size-control-visible'), false);

  harness.stage.dispatch('pointerenter');
  assert.equal(harness.documentElement.classList.contains('is-cat-size-control-visible'), true);

  harness.stage.dispatch('pointerleave');
  assert.equal(harness.documentElement.classList.contains('is-cat-size-control-visible'), true);

  harness.catSizeBtn.dispatch('pointerenter');
  harness.flushTimers();
  assert.equal(harness.documentElement.classList.contains('is-cat-size-control-visible'), true);

  harness.catSizeBtn.dispatch('pointerleave');
  harness.flushTimers();
  assert.equal(harness.documentElement.classList.contains('is-cat-size-control-visible'), false);

  harness.stage.dispatch('pointerenter');
  harness.catSizeBtn.dispatch('pointerdown', {
    button: 0,
    pointerId: 1,
    clientX: 0,
    preventDefault() {},
    stopPropagation() {}
  });
  harness.stage.dispatch('pointerleave');
  harness.catSizeBtn.dispatch('pointerleave');
  harness.flushTimers();

  assert.equal(harness.documentElement.classList.contains('is-cat-size-control-visible'), true);
  assert.equal(harness.documentElement.classList.contains('is-cat-resizing'), true);

  harness.window.dispatch('pointerup', { pointerId: 1 });
  harness.flushTimers();

  assert.equal(harness.documentElement.classList.contains('is-cat-resizing'), false);
  assert.equal(harness.documentElement.classList.contains('is-cat-size-control-visible'), false);
});
