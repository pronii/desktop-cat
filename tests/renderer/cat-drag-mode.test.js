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
  constructor({ rect } = {}) {
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.attributes = new Map();
    this.childrenBySelector = new Map();
    this.textContent = '';
    this.checked = false;
    this.rect = rect || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    this.capturedPointerIds = [];
    this.releasedPointerIds = [];
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    if (!event.currentTarget) {
      event.currentTarget = this;
    }
    if (!event.target) {
      event.target = this;
    }
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

  setPointerCapture(pointerId) {
    this.capturedPointerIds.push(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.releasedPointerIds.push(pointerId);
  }

  getBoundingClientRect() {
    return this.rect;
  }
}

function createRendererHarness({ supportsPointerEvents = false, bottomBarRect } = {}) {
  const source = readSource('src', 'renderer', 'renderer.js');
  const cat = new FakeElement();
  const stage = new FakeElement();
  const live2dCanvas = new FakeElement();
  const waterBowl = new FakeElement();
  const happyBubble = new FakeElement();
  const waterBubble = new FakeElement();
  const waterCounter = new FakeElement();
  const bottomBar = new FakeElement({ rect: bottomBarRect });
  const catSizeBtn = new FakeElement();
  const settingsBtn = new FakeElement();
  const settingsPanel = new FakeElement();
  const settingsPanelClose = new FakeElement();
  const randomSpeechToggle = new FakeElement();
  const clipboardBtn = new FakeElement();
  const roomBtn = new FakeElement();
  const live2dSwitcherBtn = new FakeElement();
  const documentElement = {
    classList: new FakeClassList(),
    style: { setProperty() {} }
  };
  const timers = new Map();
  const windowListeners = new Map();
  let nextTimerId = 1;
  let dragEnterCount = 0;
  let dragExitCount = 0;
  let now = 0;

  class FakeDate extends Date {
    constructor(...args) {
      if (args.length) {
        super(...args);
      } else {
        super(now);
      }
    }

    static now() {
      return now;
    }
  }

  const contextualPetBehavior = {
    ...petBehavior,
    createHappyState(options = {}) {
      return petBehavior.createHappyState({ ...options, now });
    },
    shouldClearHappyState(state) {
      return petBehavior.shouldClearHappyState(state, now);
    },
    createDrinkState(options = {}) {
      return petBehavior.createDrinkState({ ...options, now });
    },
    shouldClearDrinkState(state) {
      return petBehavior.shouldClearDrinkState(state, now);
    }
  };

  cat.childrenBySelector.set('.happy-bubble', happyBubble);
  cat.childrenBySelector.set('.water-bubble', waterBubble);
  for (const selector of ['.ear-left', '.ear-right', '.head', '.body', '.tail', '.paw-left', '.paw-right']) {
    cat.childrenBySelector.set(selector, new FakeElement({
      rect: { left: 10, top: 10, right: 70, bottom: 80, width: 60, height: 70 }
    }));
  }

  const fakeWindow = {
    petBehavior: contextualPetBehavior,
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
      setClickThrough() {},
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
    setTimeout(callback, delay = 0) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, delay: Number(delay) || 0 });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    setInterval() {
      return 0;
    },
    clearInterval() {},
    getComputedStyle() {
      return { display: 'none' };
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

  const documentListeners = new Map();

  const fakeDocument = {
    documentElement,
    addEventListener(type, listener) {
      const listeners = documentListeners.get(type) || [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    },
    dispatch(type, event = {}) {
      for (const listener of documentListeners.get(type) || []) {
        listener(event);
      }
    },
    elementFromPoint() {
      return null;
    },
    querySelector(selector) {
      if (selector === '.stage') return stage;
      if (selector === '.cat') return cat;
      if (selector === '.water-bowl') return waterBowl;
      if (selector === '.bottom-bar') return bottomBar;
      if (selector === '.happy-bubble') return happyBubble;
      if (selector === '.water-panel.show, .clipboard-panel.show, .room-panel.show, .live2d-panel.show, .settings-panel.show, .water-reminder-dialog.show') return null;
      return null;
    },
    getElementById(id) {
      if (id === 'live2dCanvas') return live2dCanvas;
      if (id === 'waterCounter') return waterCounter;
      if (id === 'catSizeBtn') return catSizeBtn;
      if (id === 'settingsBtn') return settingsBtn;
      if (id === 'settingsPanel') return settingsPanel;
      if (id === 'settingsPanelClose') return settingsPanelClose;
      if (id === 'randomSpeechToggle') return randomSpeechToggle;
      if (id === 'clipboardBtn') return clipboardBtn;
      if (id === 'roomBtn') return roomBtn;
      if (id === 'live2dSwitcherBtn') return live2dSwitcherBtn;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-bottom-button-toggle]') return [];
      return [];
    }
  };
  if (supportsPointerEvents) {
    fakeWindow.PointerEvent = function PointerEvent() {};
  }

  vm.runInNewContext(source, {
    window: fakeWindow,
    document: fakeDocument,
    console,
    Date: FakeDate,
    performance: { now: () => now }
  });

  return {
    cat,
    document: fakeDocument,
    happyBubble,
    stage,
    live2dCanvas,
    waterCounter,
    clipboardBtn,
    roomBtn,
    live2dSwitcherBtn,
    catSizeBtn,
    settingsBtn,
    settingsPanel,
    randomSpeechToggle,
    documentElement,
    window: fakeWindow,
    flushTimers({ minDelay = 0, maxDelay = 1000 } = {}) {
      for (const [id, timer] of Array.from(timers.entries())) {
        if (timer.delay < minDelay || timer.delay > maxDelay) continue;
        timers.delete(id);
        now += timer.delay;
        timer.callback();
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

test('cat drag mode exits on window pointerup when mouseup is missed', () => {
  const harness = createRendererHarness();

  harness.cat.dispatch('mousedown', {
    button: 0,
    preventDefault() {}
  });
  harness.flushTimers();

  assert.equal(harness.dragEnterCount, 1);

  harness.window.dispatch('pointerup', { pointerId: 7 });

  assert.equal(harness.dragExitCount, 1);
  assert.equal(harness.cat.classList.contains('is-dragging'), false);
});

test('cat drag mode exits on mousemove after the mouse button is released', () => {
  const harness = createRendererHarness();

  harness.cat.dispatch('mousedown', {
    button: 0,
    preventDefault() {}
  });
  harness.flushTimers();

  assert.equal(harness.dragEnterCount, 1);

  harness.document.dispatch('mousemove', {
    buttons: 0,
    clientX: 20,
    clientY: 20
  });

  assert.equal(harness.dragExitCount, 1);
  assert.equal(harness.cat.classList.contains('is-dragging'), false);
});

test('cat drag mode captures the active pointer and exits on captured pointerup', () => {
  const harness = createRendererHarness({ supportsPointerEvents: true });

  harness.cat.dispatch('pointerdown', {
    button: 0,
    pointerId: 42,
    preventDefault() {}
  });

  assert.deepEqual(harness.cat.capturedPointerIds, [42]);

  harness.flushTimers();
  assert.equal(harness.dragEnterCount, 1);

  harness.cat.dispatch('pointerup', { pointerId: 42 });

  assert.deepEqual(harness.cat.releasedPointerIds, [42]);
  assert.equal(harness.dragExitCount, 1);
  assert.equal(harness.cat.classList.contains('is-dragging'), false);
});

test('cat drag mode exits when the captured pointer is lost', () => {
  const harness = createRendererHarness({ supportsPointerEvents: true });

  harness.cat.dispatch('pointerdown', {
    button: 0,
    pointerId: 7,
    preventDefault() {}
  });
  harness.flushTimers();

  assert.equal(harness.dragEnterCount, 1);

  harness.cat.dispatch('lostpointercapture', { pointerId: 7 });

  assert.equal(harness.dragExitCount, 1);
  assert.equal(harness.cat.classList.contains('is-dragging'), false);
});

test('cat click cycles through encouragement messages', () => {
  const harness = createRendererHarness();
  const messages = [
    '辛苦啦，歇一小会儿吧',
    '做得很好，继续加油',
    '别忘了喝口水',
    '今天也很努力呢',
    '我在这里陪着你',
    '先伸个懒腰再继续吧',
    '眼睛也需要休息一下',
    '这一步已经很棒了',
    '慢慢来，我会等你',
    '记得保存一下进度',
    '呼吸一下，思路会更清楚',
    '再坚持一点点就好'
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

  harness.stage.dispatch('pointerenter', { clientX: 20, clientY: 20 });
  assert.equal(harness.documentElement.classList.contains('is-cat-size-control-visible'), true);
  assert.equal(harness.documentElement.classList.contains('is-bottom-controls-visible'), true);

  harness.stage.dispatch('pointerleave');
  assert.equal(harness.documentElement.classList.contains('is-cat-size-control-visible'), false);
  assert.equal(harness.documentElement.classList.contains('is-bottom-controls-visible'), false);

  harness.stage.dispatch('pointerenter', { clientX: 20, clientY: 20 });
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
  assert.equal(harness.documentElement.classList.contains('is-bottom-controls-visible'), true);
  assert.equal(harness.documentElement.classList.contains('is-cat-resizing'), true);

  harness.window.dispatch('pointerup', { pointerId: 1 });
  harness.flushTimers();

  assert.equal(harness.documentElement.classList.contains('is-cat-resizing'), false);
  assert.equal(harness.documentElement.classList.contains('is-cat-size-control-visible'), false);
  assert.equal(harness.documentElement.classList.contains('is-bottom-controls-visible'), false);
});

test('bottom controls hide immediately when the pointer is not over the pet shape', () => {
  const harness = createRendererHarness();

  assert.equal(harness.documentElement.classList.contains('is-bottom-controls-visible'), false);

  harness.document.dispatch('mousemove', { clientX: 20, clientY: 20 });

  assert.equal(harness.documentElement.classList.contains('is-bottom-controls-visible'), true);
  assert.equal(harness.documentElement.classList.contains('is-cat-size-control-visible'), true);

  harness.document.dispatch('mousemove', { clientX: 120, clientY: 120 });

  assert.equal(harness.documentElement.classList.contains('is-bottom-controls-visible'), false);
  assert.equal(harness.documentElement.classList.contains('is-cat-size-control-visible'), false);
});

test('bottom controls stay visible while moving from the pet to the toolbar', () => {
  const harness = createRendererHarness({
    bottomBarRect: { left: 80, top: 120, right: 240, bottom: 160, width: 160, height: 40 }
  });

  harness.document.dispatch('mousemove', { clientX: 20, clientY: 20 });

  assert.equal(harness.documentElement.classList.contains('is-bottom-controls-visible'), true);

  harness.document.dispatch('mousemove', { clientX: 120, clientY: 140 });

  assert.equal(harness.documentElement.classList.contains('is-bottom-controls-visible'), true);
  assert.equal(harness.documentElement.classList.contains('is-cat-size-control-visible'), true);

  harness.settingsBtn.dispatch('click', {
    preventDefault() {},
    stopPropagation() {}
  });

  assert.equal(harness.settingsPanel.classList.contains('show'), true);
  assert.equal(harness.settingsBtn.attributes.get('aria-expanded'), 'true');
});

test('random speech schedules a later encouragement and respects the settings toggle', () => {
  const harness = createRendererHarness();

  assert.equal(typeof petBehavior.createRandomSpeechDelay, 'function');
  assert.equal(harness.window.desktopCatDebug.randomSpeechEnabled, true);

  harness.flushTimers({ minDelay: petBehavior.RANDOM_SPEECH_MIN_MS, maxDelay: Infinity });

  assert.equal(harness.happyBubble.textContent, petBehavior.ENCOURAGEMENT_MESSAGES[0]);
  assert.equal(harness.window.desktopCatDebug.happyCount, 1);

  harness.randomSpeechToggle.checked = false;
  harness.randomSpeechToggle.dispatch('change');
  const countAfterDisable = harness.window.desktopCatDebug.happyCount;

  harness.flushTimers({ minDelay: petBehavior.RANDOM_SPEECH_MIN_MS, maxDelay: Infinity });

  assert.equal(harness.window.desktopCatDebug.randomSpeechEnabled, false);
  assert.equal(harness.window.desktopCatDebug.happyCount, countAfterDisable);
});

test('random speech bubble closes after three seconds', () => {
  const harness = createRendererHarness();

  harness.flushTimers({ minDelay: petBehavior.RANDOM_SPEECH_MIN_MS, maxDelay: Infinity });

  assert.equal(harness.stage.classList.contains('is-happy'), true);
  assert.equal(harness.cat.classList.contains('is-happy'), true);

  harness.flushTimers({ minDelay: 1500, maxDelay: 1500 });

  assert.equal(harness.stage.classList.contains('is-happy'), true);
  assert.equal(harness.cat.classList.contains('is-happy'), true);

  harness.flushTimers({ minDelay: 3000, maxDelay: 3000 });

  assert.equal(harness.stage.classList.contains('is-happy'), false);
  assert.equal(harness.cat.classList.contains('is-happy'), false);
});

test('settings can hide and restore bottom toolbar buttons without hiding settings', () => {
  const harness = createRendererHarness();

  assert.equal(harness.waterCounter.classList.contains('is-hidden-by-settings'), false);
  assert.equal(harness.settingsBtn.classList.contains('is-hidden-by-settings'), false);

  const hiddenSettings = petBehavior.normalizePetSettings({
    visibleButtons: {
      water: false,
      clipboard: false,
      room: false,
      live2d: false,
      catSize: false
    }
  });

  harness.window.__desktopCatApplySettings(hiddenSettings);

  assert.equal(harness.waterCounter.classList.contains('is-hidden-by-settings'), true);
  assert.equal(harness.clipboardBtn.classList.contains('is-hidden-by-settings'), true);
  assert.equal(harness.roomBtn.classList.contains('is-hidden-by-settings'), true);
  assert.equal(harness.live2dSwitcherBtn.classList.contains('is-hidden-by-settings'), true);
  assert.equal(harness.catSizeBtn.classList.contains('is-hidden-by-settings'), true);
  assert.equal(harness.settingsBtn.classList.contains('is-hidden-by-settings'), false);

  harness.window.__desktopCatApplySettings(petBehavior.DEFAULT_PET_SETTINGS);

  assert.equal(harness.waterCounter.classList.contains('is-hidden-by-settings'), false);
  assert.equal(harness.catSizeBtn.classList.contains('is-hidden-by-settings'), false);
});
