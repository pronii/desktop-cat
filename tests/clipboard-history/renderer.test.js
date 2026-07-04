const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class FakeClassList {
  constructor() {
    this.names = new Set();
  }

  setFromString(value) {
    this.names = new Set(String(value || '').split(/\s+/).filter(Boolean));
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

  set className(value) {
    this._className = String(value || '');
    this.classList.setFromString(this._className);
  }

  get className() {
    return this._className || '';
  }

  appendChild(child) {
    if (child.parentNode) {
      child.remove();
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child, before) {
    if (child.parentNode) {
      child.remove();
    }
    const index = this.children.indexOf(before);
    child.parentNode = this;
    if (index === -1) {
      this.children.push(child);
    } else {
      this.children.splice(index, 0, child);
    }
    return child;
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

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const className = selector.startsWith('.') ? selector.slice(1) : null;
    const matches = [];

    function visit(node) {
      for (const child of node.children) {
        if (className && child.classList.contains(className)) {
          matches.push(child);
        }
        visit(child);
      }
    }

    visit(this);
    return matches;
  }
}

function createDocument() {
  const grid = new FakeElement('div');
  const emptyMsg = new FakeElement('div');
  const clearBtn = new FakeElement('button');
  const pauseBtn = new FakeElement('button');
  const toast = new FakeElement('div');
  const body = new FakeElement('body');

  emptyMsg.className = 'ch-empty';
  grid.appendChild(emptyMsg);

  const elements = new Map([
    ['grid', grid],
    ['emptyMsg', emptyMsg],
    ['clearBtn', clearBtn],
    ['pauseBtn', pauseBtn],
    ['toast', toast]
  ]);

  return {
    body,
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };
}

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve());
}

test('clipboard history window does not render duplicate cards for the same item event', async () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'clipboard-history', 'renderer.js'),
    'utf8'
  );
  const document = createDocument();
  const item = {
    id: 'text_1',
    type: 'text',
    content: 'hello',
    timestamp: Date.now()
  };
  let onNewItem = null;

  const api = {
    getItems() {
      return Promise.resolve([item]);
    },
    getState() {
      return Promise.resolve({ isPaused: false });
    },
    copyItem() {
      return Promise.resolve();
    },
    removeItem() {
      return Promise.resolve([]);
    },
    clearHistory() {
      return Promise.resolve([]);
    },
    setPaused() {
      return Promise.resolve({ isPaused: false });
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
      clipboardHistoryAPI: api,
      confirm: () => true
    },
    document,
    Date,
    setTimeout,
    clearTimeout,
    console
  });

  await flushPromises();
  assert.equal(document.getElementById('grid').querySelectorAll('.ch-card').length, 1);

  onNewItem(item);

  assert.equal(document.getElementById('grid').querySelectorAll('.ch-card').length, 1);
});
