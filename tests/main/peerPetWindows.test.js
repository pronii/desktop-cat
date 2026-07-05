const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createPeerPetWindowManager,
  resolveLocalPetAnchorBounds,
  resolvePeerBounds
} = require('../../src/main/peerPetWindows');

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

test('local pet anchor resolves to the visible cat area inside the main window', () => {
  assert.deepEqual(resolveLocalPetAnchorBounds({
    x: 700,
    y: 80,
    width: 300,
    height: 360
  }), {
    x: 761,
    y: 217,
    width: 178,
    height: 190
  });
});

test('local pet anchor follows the scaled visible cat area from the bottom center', () => {
  assert.deepEqual(resolveLocalPetAnchorBounds({
    x: 700,
    y: 80,
    width: 300,
    height: 360,
    scale: 0.5
  }), {
    x: 806,
    y: 325,
    width: 89,
    height: 95
  });
});

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
    x: 344,
    y: 230,
    width: 160,
    height: 150
  });
  assert.deepEqual(FakeBrowserWindow.instances[0].webContents.messages.at(-1), {
    channel: 'peer-pet:update',
    payload: {
      userId: 'bob',
      nickname: 'Bob',
      pet: { relativeX: 0.25, relativeY: 0.5, action: 'idle' },
      renderMode: 'css-cat'
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
    x: 364,
    y: 250,
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
    pet: { action: 'drag' },
    renderMode: 'css-cat'
  });
});

test('peer pet manager marks only the first three Live2D peers for Live2D rendering', () => {
  const manager = createManager();

  manager.syncPeers([
    { userId: 'a', nickname: 'A', pet: { appearanceType: 'live2d', modelId: 'Haru' } },
    { userId: 'b', nickname: 'B', pet: { appearanceType: 'live2d', modelId: 'Hiyori' } },
    { userId: 'c', nickname: 'C', pet: { appearanceType: 'live2d', modelId: 'Mao' } },
    { userId: 'd', nickname: 'D', pet: { appearanceType: 'live2d', modelId: 'Custom' } }
  ], { x: 100, y: 200, width: 240, height: 180 });

  assert.deepEqual(
    FakeBrowserWindow.instances.map((window) => window.webContents.messages.at(-1).payload.renderMode),
    ['live2d', 'live2d', 'live2d', 'css-cat']
  );
});

test('peer pet manager uses CSS cat render mode for peers without Live2D identity', () => {
  const manager = createManager();

  manager.syncPeers([
    { userId: 'bob', nickname: 'Bob', pet: { action: 'idle' } }
  ], { x: 100, y: 200, width: 240, height: 180 });

  assert.equal(FakeBrowserWindow.instances[0].webContents.messages.at(-1).payload.renderMode, 'css-cat');
});

test('peer pet manager lays out multiple peers beside the local pet', () => {
  const manager = createManager();

  manager.syncPeers([
    { userId: 'bob', nickname: 'Bob', pet: { x: 900, y: 700 } },
    { userId: 'cora', nickname: 'Cora', pet: { x: 10, y: 20 } }
  ], { x: 100, y: 200, width: 240, height: 180 });

  assert.deepEqual(FakeBrowserWindow.instances.map((window) => window.bounds), [
    { x: 344, y: 230, width: 160, height: 150 },
    { x: 508, y: 230, width: 160, height: 150 }
  ]);
});

test('peer pet manager ignores peer screen coordinates when keeping fixed spacing', () => {
  const manager = createManager();

  manager.syncPeers([
    { userId: 'bob', nickname: 'Bob', pet: { x: 900, y: 700, relativeX: 0.9, relativeY: 0.9 } }
  ], { x: 100, y: 200, width: 240, height: 180 });
  const firstBounds = FakeBrowserWindow.instances[0].bounds;

  manager.syncPeers([
    { userId: 'bob', nickname: 'Bob', pet: { x: 10, y: 20, relativeX: 0.01, relativeY: 0.02 } }
  ], { x: 100, y: 200, width: 240, height: 180 });

  assert.deepEqual(FakeBrowserWindow.instances[0].bounds, firstBounds);
});

test('peer bounds keep a fixed side gap and shared baseline for scaled local anchors', () => {
  assert.deepEqual(resolvePeerBounds({
    x: 100,
    y: 300,
    width: 89,
    height: 95
  }, fakeScreen, 0, 1), {
    x: 193,
    y: 245,
    width: 160,
    height: 150
  });
});

test('peer pet manager keeps peer windows inside the local display work area', () => {
  const manager = createManager();

  manager.syncPeers([
    { userId: 'bob', nickname: 'Bob', pet: { action: 'idle' } },
    { userId: 'cora', nickname: 'Cora', pet: { action: 'idle' } }
  ], { x: 900, y: 700, width: 240, height: 180 });

  assert.deepEqual(FakeBrowserWindow.instances.map((window) => window.bounds), [
    { x: 736, y: 650, width: 160, height: 150 },
    { x: 572, y: 650, width: 160, height: 150 }
  ]);
});

test('peer pet manager aligns peers beside the visible local cat area', () => {
  const manager = createManager();
  const localCatBounds = resolveLocalPetAnchorBounds({
    x: 700,
    y: 80,
    width: 300,
    height: 360
  });

  manager.syncPeers([
    { userId: 'bob', nickname: 'Bob', pet: { action: 'idle' } }
  ], localCatBounds);

  assert.deepEqual(FakeBrowserWindow.instances[0].bounds, {
    x: 597,
    y: 257,
    width: 160,
    height: 150
  });
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
