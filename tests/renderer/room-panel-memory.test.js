const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOM_FORM_STORAGE_KEY = 'desktopCat.roomForm';

function readSource(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf8');
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
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.disabled = false;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.classList = new FakeClassList();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    const dispatchedEvent = {
      preventDefault() {},
      stopPropagation() {},
      ...event,
      currentTarget: event.currentTarget || this,
      target: event.target || this
    };
    for (const listener of this.listeners.get(type) || []) {
      listener(dispatchedEvent);
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  replaceChildren(...children) {
    this.children = children;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  append(...children) {
    this.children.push(...children);
  }

  contains(target) {
    return target === this || this.children.includes(target);
  }
}

async function flushAsync() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

function createRoomPanelHarness({
  storedForm,
  initialState = { status: 'disconnected', roomCode: null, peers: [], error: null },
  joinState
} = {}) {
  const source = readSource('src', 'renderer', 'roomPanel.js');
  const ids = [
    'roomBtn',
    'roomPanel',
    'roomPanelClose',
    'roomStatusDot',
    'roomStatusText',
    'roomPeerCount',
    'roomCurrent',
    'roomNicknameInput',
    'roomCodeInput',
    'roomCreateBtn',
    'roomJoinBtn',
    'roomLeaveBtn',
    'roomError',
    'roomPeerList'
  ];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  const storage = new Map();
  if (storedForm !== undefined) {
    storage.set(ROOM_FORM_STORAGE_KEY, JSON.stringify(storedForm));
  }

  const documentListeners = new Map();
  const joinCalls = [];
  const fakeWindow = {
    desktopCat: {
      room: {
        getState: async () => initialState,
        join: async (roomCode, nickname) => {
          joinCalls.push({ roomCode, nickname });
          return joinState || { status: 'connected', roomCode, peers: [], error: null };
        },
        leave: async () => ({ status: 'disconnected', roomCode: null, peers: [], error: null }),
        onStateChanged() {},
        onOpenPanel() {}
      }
    },
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      }
    }
  };
  const fakeDocument = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tagName) {
      const element = new FakeElement();
      element.tagName = tagName.toUpperCase();
      return element;
    },
    addEventListener(type, listener) {
      const listeners = documentListeners.get(type) || [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    }
  };

  vm.runInNewContext(source, {
    window: fakeWindow,
    document: fakeDocument,
    console,
    Math
  });

  return {
    elements,
    storage,
    joinCalls,
    get roomCodeInput() {
      return elements.get('roomCodeInput');
    },
    get roomNicknameInput() {
      return elements.get('roomNicknameInput');
    },
    get roomJoinBtn() {
      return elements.get('roomJoinBtn');
    },
    storedForm() {
      return JSON.parse(storage.get(ROOM_FORM_STORAGE_KEY));
    }
  };
}

test('room panel restores the last room code and nickname from local storage', async () => {
  const harness = createRoomPanelHarness({
    storedForm: {
      roomCode: '12a3456',
      nickname: 'Mika'
    }
  });

  await flushAsync();

  assert.equal(harness.roomCodeInput.value, '123456');
  assert.equal(harness.roomNicknameInput.value, 'Mika');
});

test('room panel remembers nickname edits immediately', async () => {
  const harness = createRoomPanelHarness();
  await flushAsync();

  harness.roomNicknameInput.value = 'Nina';
  harness.roomNicknameInput.dispatch('input');

  assert.equal(harness.storedForm().nickname, 'Nina');
});

test('room panel remembers the room code after joining successfully', async () => {
  const harness = createRoomPanelHarness();
  await flushAsync();

  harness.roomNicknameInput.value = 'Nina';
  harness.roomCodeInput.value = '123456';
  harness.roomJoinBtn.dispatch('click');
  await flushAsync();

  assert.deepEqual(harness.joinCalls, [{ roomCode: '123456', nickname: 'Nina' }]);
  assert.equal(harness.storedForm().roomCode, '123456');
  assert.equal(harness.storedForm().nickname, 'Nina');
});
