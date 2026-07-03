const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

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
    if (force === undefined) {
      if (this.names.has(name)) {
        this.names.delete(name);
        return false;
      }
      this.names.add(name);
      return true;
    }
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
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.parentNode = null;
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = '';
    this.tabIndex = -1;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  replaceChildren(...children) {
    this.children.forEach((child) => {
      child.parentNode = null;
    });
    this.children = [];
    this.append(...children);
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
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

  contains(target) {
    if (target === this) return true;
    return this.children.some((child) => child.contains(target));
  }
}

function createDocument() {
  const elements = new Map();
  for (const id of [
    'clipboardBtn',
    'clipboardPanel',
    'clipboardPanelClose',
    'clipboardPanelContent',
    'clipboardPauseBtn',
    'clipboardClearBtn'
  ]) {
    elements.set(id, new FakeElement('div'));
  }

  return {
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    addEventListener() {}
  };
}

test('clipboard panel adds new visible items without refetching all history', async () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'renderer', 'clipboardPanel.js'),
    'utf8'
  );
  const document = createDocument();
  let getAllCalls = 0;
  let onNewItem = null;

  const api = {
    getAll() {
      getAllCalls += 1;
      return Promise.resolve([]);
    },
    getState() {
      return Promise.resolve({ isPaused: false });
    },
    setPaused() {
      return Promise.resolve({ isPaused: false });
    },
    clear() {
      return Promise.resolve([]);
    },
    copy() {
      return Promise.resolve();
    },
    removeById() {
      return Promise.resolve([]);
    },
    onNewItem(callback) {
      onNewItem = callback;
      return () => {};
    },
    onStateChanged() {
      return () => {};
    }
  };

  vm.runInNewContext(source, {
    window: {
      desktopCat: { clipboardHistory: api },
      confirm: () => true
    },
    document,
    setTimeout,
    clearTimeout,
    console
  });

  assert.equal(getAllCalls, 0);
  assert.equal(typeof onNewItem, 'function');

  document.getElementById('clipboardPanel').classList.add('show');
  onNewItem({
    id: 'text_1',
    type: 'text',
    content: 'hello',
    timestamp: Date.now()
  });
  await Promise.resolve();

  assert.equal(getAllCalls, 0);
  assert.equal(document.getElementById('clipboardPanelContent').children.length, 1);
});

test('clipboard panel keeps the full retained history available when opened', async () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'renderer', 'clipboardPanel.js'),
    'utf8'
  );
  const document = createDocument();
  const requestedOptions = [];
  const items = Array.from({ length: 50 }, (_value, index) => ({
    id: `text_${index}`,
    type: 'text',
    content: `item ${index}`,
    timestamp: Date.now() - index
  }));

  const api = {
    getAll(options) {
      requestedOptions.push(options);
      return Promise.resolve(items.slice(0, options?.limit || items.length));
    },
    getState() {
      return Promise.resolve({ isPaused: false });
    },
    setPaused() {
      return Promise.resolve({ isPaused: false });
    },
    clear() {
      return Promise.resolve([]);
    },
    copy() {
      return Promise.resolve();
    },
    removeById() {
      return Promise.resolve([]);
    },
    onNewItem() {
      return () => {};
    },
    onStateChanged() {
      return () => {};
    }
  };

  vm.runInNewContext(source, {
    window: {
      desktopCat: { clipboardHistory: api },
      confirm: () => true
    },
    document,
    setTimeout,
    clearTimeout,
    console
  });

  document.getElementById('clipboardBtn').dispatch('click');
  await Promise.resolve();

  assert.equal(requestedOptions[0].limit, 50);
  assert.equal(document.getElementById('clipboardPanelContent').children.length, 50);
});
