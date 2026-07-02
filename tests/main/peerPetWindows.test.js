const assert = require('node:assert/strict');
const test = require('node:test');

const { createPeerPetWindowManager } = require('../../src/main/peerPetWindows');

class FakeBrowserWindow {
  static instances = [];

  constructor(options) {
    this.options = options;
    this.bounds = null;
    this.closed = false;
    this.loadedFile = null;
    this.webContents = {
      messages: [],
      send: (channel, payload) => {
        this.webContents.messages.push({ channel, payload });
      }
    };
    FakeBrowserWindow.instances.push(this);
  }

  loadFile(file) {
    this.loadedFile = file;
  }

  setBounds(bounds) {
    this.bounds = bounds;
  }

  isDestroyed() {
    return this.closed;
  }

  close() {
    this.closed = true;
  }
}

const fakeScreen = {
  getPrimaryDisplay() {
    return {
      workArea: { x: 0, y: 0, width: 1000, height: 800 }
    };
  },
  getDisplayNearestPoint() {
    return {
      workArea: { x: 0, y: 0, width: 1000, height: 800 }
    };
  }
};

function createManager() {
  FakeBrowserWindow.instances = [];
  return createPeerPetWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: fakeScreen,
    peerPetFile: 'peer.html'
  });
}

test('peer pet manager creates a transparent window for each peer', () => {
  const manager = createManager();

  manager.syncPeers([{
    userId: 'bob',
    nickname: 'Bob',
    pet: { relativeX: 0.25, relativeY: 0.5, action: 'idle' }
  }], { x: 100, y: 200, width: 240, height: 180 });

  assert.equal(FakeBrowserWindow.instances.length, 1);
  assert.equal(FakeBrowserWindow.instances[0].options.transparent, true);
  assert.equal(FakeBrowserWindow.instances[0].options.frame, false);
  assert.equal(FakeBrowserWindow.instances[0].loadedFile, 'peer.html');
  assert.deepEqual(FakeBrowserWindow.instances[0].bounds, {
    x: 352,
    y: 215,
    width: 160,
    height: 150
  });
  assert.deepEqual(FakeBrowserWindow.instances[0].webContents.messages.at(-1), {
    channel: 'peer-pet:update',
    payload: {
      userId: 'bob',
      nickname: 'Bob',
      pet: { relativeX: 0.25, relativeY: 0.5, action: 'idle' }
    }
  });
});

test('peer pet manager reuses existing windows when peers update', () => {
  const manager = createManager();

  manager.syncPeers([{
    userId: 'bob',
    nickname: 'Bob',
    pet: { relativeX: 0.1, relativeY: 0.2, action: 'idle' }
  }], { x: 100, y: 200, width: 240, height: 180 });
  manager.syncPeers([{
    userId: 'bob',
    nickname: 'Bobby',
    pet: { relativeX: 0.8, relativeY: 0.7, action: 'drag' }
  }], { x: 120, y: 220, width: 240, height: 180 });

  assert.equal(FakeBrowserWindow.instances.length, 1);
  assert.deepEqual(FakeBrowserWindow.instances[0].bounds, {
    x: 372,
    y: 235,
    width: 160,
    height: 150
  });
  assert.equal(FakeBrowserWindow.instances[0].webContents.messages.at(-1).payload.nickname, 'Bobby');
});

test('peer pet manager ignores duplicate peers in a single sync', () => {
  const manager = createManager();

  manager.syncPeers([
    { userId: 'bob', nickname: 'Bob', pet: { action: 'idle' } },
    { userId: 'bob', nickname: 'Bobby', pet: { action: 'drag' } }
  ], { x: 100, y: 200, width: 240, height: 180 });

  assert.equal(FakeBrowserWindow.instances.length, 1);
  assert.deepEqual(FakeBrowserWindow.instances[0].webContents.messages.at(-1).payload, {
    userId: 'bob',
    nickname: 'Bobby',
    pet: { action: 'drag' }
  });
});

test('peer pet manager lays out multiple peers beside the local pet', () => {
  const manager = createManager();

  manager.syncPeers([
    { userId: 'bob', nickname: 'Bob', pet: { x: 900, y: 700 } },
    { userId: 'cora', nickname: 'Cora', pet: { x: 10, y: 20 } }
  ], { x: 100, y: 200, width: 240, height: 180 });

  assert.deepEqual(FakeBrowserWindow.instances.map((window) => window.bounds), [
    { x: 352, y: 215, width: 160, height: 150 },
    { x: 524, y: 215, width: 160, height: 150 }
  ]);
});

test('peer pet manager keeps peer windows inside the local display work area', () => {
  const manager = createManager();

  manager.syncPeers([
    { userId: 'bob', nickname: 'Bob', pet: { action: 'idle' } },
    { userId: 'cora', nickname: 'Cora', pet: { action: 'idle' } }
  ], { x: 900, y: 700, width: 240, height: 180 });

  assert.deepEqual(FakeBrowserWindow.instances.map((window) => window.bounds), [
    { x: 728, y: 650, width: 160, height: 150 },
    { x: 556, y: 650, width: 160, height: 150 }
  ]);
});

test('peer pet manager closes windows for peers that leave', () => {
  const manager = createManager();

  manager.syncPeers([
    { userId: 'bob', nickname: 'Bob', pet: { relativeX: 0.1, relativeY: 0.2 } },
    { userId: 'cora', nickname: 'Cora', pet: { relativeX: 0.3, relativeY: 0.4 } }
  ], { x: 100, y: 200, width: 240, height: 180 });
  manager.syncPeers([
    { userId: 'cora', nickname: 'Cora', pet: { relativeX: 0.3, relativeY: 0.4 } }
  ], { x: 100, y: 200, width: 240, height: 180 });

  assert.equal(FakeBrowserWindow.instances[0].closed, true);
  assert.equal(FakeBrowserWindow.instances[1].closed, false);

  manager.destroyAll();

  assert.equal(FakeBrowserWindow.instances[1].closed, true);
});
