const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const petBehavior = require('../../src/renderer/petBehavior');

function readSource(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf8');
}

function readCssBlock(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escapedSelector}\\s*\\{[\\s\\S]*?\\}`))?.[0] || '';
}

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
    this.childrenBySelector = new Map();
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

  querySelector(selector) {
    return this.childrenBySelector.get(selector) || new FakeElement();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  setPointerCapture() {}

  releasePointerCapture() {}
}

function createRendererHarness() {
  const source = readSource('src', 'renderer', 'renderer.js');
  const cat = new FakeElement();
  const stage = new FakeElement();
  const live2dCanvas = new FakeElement();
  const waterBowl = new FakeElement();
  const happyBubble = new FakeElement();
  const waterBubble = new FakeElement();
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

  cat.childrenBySelector.set('.happy-bubble', happyBubble);
  cat.childrenBySelector.set('.water-bubble', waterBubble);

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
      if (selector === '.happy-bubble') return happyBubble;
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
    happyBubble,
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

test('cat click cycles through five encouragement messages', () => {
  const harness = createRendererHarness();
  const messages = [
    '辛苦啦，歇一小会儿吧',
    '做得很好，继续加油',
    '别忘了喝口水',
    '今天也很努力呢',
    '我在这里陪着你'
  ];

  assert.deepEqual(petBehavior.ENCOURAGEMENT_MESSAGES, messages);

  for (let index = 0; index < messages.length + 1; index += 1) {
    harness.cat.dispatch('click');

    assert.equal(harness.happyBubble.textContent, messages[index % messages.length]);
    assert.equal(harness.cat.classList.contains('is-happy'), true);
    assert.equal(harness.stage.classList.contains('is-happy'), true);
  }
});

test('encouragement bubble renders as a centered long info bar with at most two lines', () => {
  const html = readSource('src', 'renderer', 'index.html');
  const css = readSource('src', 'renderer', 'styles.css');
  const bubbleCss = readCssBlock(css, '.happy-bubble');
  const activeBubbleCss = readCssBlock(css, '.stage.is-happy .happy-bubble');

  assert.match(html, /<\/button>\s*<span class="happy-bubble"><\/span>/);
  assert.match(bubbleCss, /left:\s*50%/);
  assert.doesNotMatch(bubbleCss, /left:\s*132px/);
  assert.match(bubbleCss, /width:\s*max-content/);
  assert.match(bubbleCss, /min-width:\s*168px/);
  assert.match(bubbleCss, /max-width:\s*min\(280px,\s*calc\(100vw\s*-\s*32px\)\)/);
  assert.match(bubbleCss, /display:\s*-webkit-box/);
  assert.match(bubbleCss, /-webkit-line-clamp:\s*2/);
  assert.match(bubbleCss, /-webkit-box-orient:\s*vertical/);
  assert.match(bubbleCss, /overflow:\s*hidden/);
  assert.match(bubbleCss, /text-align:\s*center/);
  assert.match(bubbleCss, /transform:\s*translate\(-50%,\s*8px\)\s*scale\(0\.9\)/);
  assert.match(activeBubbleCss, /opacity:\s*1\s*!important/);
  assert.match(activeBubbleCss, /transform:\s*translate\(-50%,\s*0\)\s*scale\(1\)/);
});

test('cat mouse press without click does not show encouragement text', () => {
  const harness = createRendererHarness();

  harness.cat.dispatch('mousedown', {
    button: 0,
    preventDefault() {}
  });
  harness.cat.dispatch('mouseup');

  assert.equal(harness.happyBubble.textContent, '');
  assert.equal(harness.window.desktopCatDebug.happyCount, 0);
});

test('cat long press drag suppresses the following click encouragement', () => {
  const harness = createRendererHarness();

  harness.cat.dispatch('mousedown', {
    button: 0,
    preventDefault() {}
  });
  harness.flushTimers();
  harness.window.dispatch('mouseup');
  harness.cat.dispatch('click');

  assert.equal(harness.happyBubble.textContent, '');
  assert.equal(harness.window.desktopCatDebug.happyCount, 0);
});

test('live2d canvas click uses the same encouragement cycle as the default cat', () => {
  const harness = createRendererHarness();

  harness.live2dCanvas.dispatch('click');

  assert.equal(harness.happyBubble.textContent, petBehavior.ENCOURAGEMENT_MESSAGES[0]);
  assert.equal(harness.cat.classList.contains('is-happy'), true);
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
