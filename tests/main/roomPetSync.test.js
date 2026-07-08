const assert = require('node:assert/strict');
const test = require('node:test');

const { createRoomPetSyncController } = require('../../src/main/roomPetSync');

function createTimerHarness() {
  let nextId = 1;
  const intervals = new Map();
  const cleared = [];

  return {
    cleared,
    setInterval(callback, delay) {
      const id = nextId++;
      intervals.set(id, { callback, delay });
      return {
        id,
        unrefCalled: false,
        unref() {
          this.unrefCalled = true;
        }
      };
    },
    clearInterval(timer) {
      cleared.push(timer?.id);
      intervals.delete(timer?.id);
    },
    tick(id = 1) {
      const entry = intervals.get(id);
      assert.ok(entry, `Expected interval ${id} to be active`);
      entry.callback();
    },
    getDelay(id = 1) {
      return intervals.get(id)?.delay;
    }
  };
}

function createPetWindowStub({ destroyed = false, bounds = { x: 10, y: 20, width: 240, height: 240 } } = {}) {
  const sent = [];
  return {
    sent,
    isDestroyed: () => destroyed,
    getBounds: () => bounds,
    webContents: {
      send(channel, payload) {
        sent.push({ channel, payload });
      }
    }
  };
}

function createRoomClientHarness(initialState = { status: 'disconnected', peers: [] }) {
  let state = initialState;
  const sentPetStates = [];
  const listeners = new Set();
  let leaveCount = 0;

  return {
    sentPetStates,
    get leaveCount() {
      return leaveCount;
    },
    client: {
      getState: () => state,
      sendPetState(petState) {
        sentPetStates.push(petState);
      },
      onStateChanged(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      leave() {
        leaveCount += 1;
      }
    },
    emit(nextState) {
      state = nextState;
      for (const listener of listeners) {
        listener(nextState);
      }
    },
    listenerCount() {
      return listeners.size;
    }
  };
}

function createPeerManagerHarness() {
  const syncs = [];
  const dragCalls = [];
  let destroyAllCount = 0;

  return {
    syncs,
    dragCalls,
    get destroyAllCount() {
      return destroyAllCount;
    },
    manager: {
      syncPeers(peers, anchorBounds) {
        syncs.push({ peers, anchorBounds });
      },
      beginPeerDrag(userId, point) {
        dragCalls.push({ method: 'beginPeerDrag', userId, point });
        return true;
      },
      movePeerDrag(userId, point) {
        dragCalls.push({ method: 'movePeerDrag', userId, point });
        return true;
      },
      endPeerDrag(userId) {
        dragCalls.push({ method: 'endPeerDrag', userId });
        return true;
      },
      destroyAll() {
        destroyAllCount += 1;
      }
    }
  };
}

function createControllerHarness({
  petWindow = createPetWindowStub(),
  localPetState = { action: 'idle', scale: 1 },
  roomState = { status: 'disconnected', peers: [] }
} = {}) {
  const timers = createTimerHarness();
  const room = createRoomClientHarness(roomState);
  const peers = createPeerManagerHarness();
  const createdPeerManagers = [];

  const controller = createRoomPetSyncController({
    BrowserWindow: function BrowserWindow() {},
    screen: {},
    peerPetFile: 'peer.html',
    peerPetPreload: 'peerPreload.js',
    createRoomClient: () => room.client,
    createPeerPetWindowManager: (options) => {
      createdPeerManagers.push(options);
      return peers.manager;
    },
    resolveLocalPetAnchorBounds: (bounds) => (
      bounds ? { x: bounds.x + 1, y: bounds.y + 2, width: 100, height: 120 } : null
    ),
    buildLocalPetState: () => localPetState,
    getPetWindow: () => petWindow,
    getLocalPetLayoutBounds: () => (petWindow && !petWindow.isDestroyed()
      ? { ...petWindow.getBounds(), scale: 1.25 }
      : null),
    sendRoomStateToRenderer: (state) => {
      petWindow?.webContents?.send('room:state-changed', state);
    },
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval
  });

  return {
    controller,
    timers,
    room,
    peers,
    createdPeerManagers,
    petWindow
  };
}

test('room pet sync forwards connected state and syncs peer windows beside the local pet', () => {
  const { controller, room, peers, petWindow, createdPeerManagers } = createControllerHarness();

  controller.setup();
  room.emit({
    status: 'connected',
    peers: [{ userId: 'peer-1', pet: { action: 'idle' } }]
  });

  assert.equal(createdPeerManagers.length, 1);
  assert.deepEqual(petWindow.sent, [{
    channel: 'room:state-changed',
    payload: {
      status: 'connected',
      peers: [{ userId: 'peer-1', pet: { action: 'idle' } }]
    }
  }]);
  assert.deepEqual(peers.syncs, [{
    peers: [{ userId: 'peer-1', pet: { action: 'idle' } }],
    anchorBounds: { x: 11, y: 22, width: 100, height: 120 }
  }]);
});

test('room pet sync reports local pet state on the interval and keeps peers aligned', () => {
  const { controller, timers, room, peers } = createControllerHarness({
    roomState: {
      status: 'connected',
      peers: [{ userId: 'peer-2', pet: { action: 'drag' } }]
    },
    localPetState: { action: 'idle', scale: 1.25 }
  });

  controller.setup();

  assert.equal(timers.getDelay(), 1000);
  timers.tick();

  assert.deepEqual(room.sentPetStates, [{ action: 'idle', scale: 1.25 }]);
  assert.deepEqual(peers.syncs, [{
    peers: [{ userId: 'peer-2', pet: { action: 'drag' } }],
    anchorBounds: { x: 11, y: 22, width: 100, height: 120 }
  }]);
});

test('room pet sync delegates peer drag updates to the peer window manager', () => {
  const { controller, peers } = createControllerHarness();

  controller.setup();

  assert.equal(controller.beginPeerPetDrag('bob', { screenX: 10, screenY: 20 }), true);
  assert.equal(controller.movePeerPetDrag('bob', { screenX: 30, screenY: 40 }), true);
  assert.equal(controller.endPeerPetDrag('bob'), true);

  assert.deepEqual(peers.dragCalls, [
    { method: 'beginPeerDrag', userId: 'bob', point: { screenX: 10, screenY: 20 } },
    { method: 'movePeerDrag', userId: 'bob', point: { screenX: 30, screenY: 40 } },
    { method: 'endPeerDrag', userId: 'bob' }
  ]);
});

test('room pet sync destroys peer windows when the local pet window is unavailable', () => {
  const petWindow = createPetWindowStub({ destroyed: true });
  const { controller, room, peers } = createControllerHarness({ petWindow });

  controller.setup();
  room.emit({
    status: 'connected',
    peers: [{ userId: 'peer-3', pet: {} }]
  });

  assert.deepEqual(peers.syncs, []);
  assert.equal(peers.destroyAllCount, 1);
});

test('room pet sync teardown stops reporting and releases room resources', () => {
  const { controller, timers, room, peers } = createControllerHarness();

  controller.setup();
  controller.teardown();

  assert.deepEqual(timers.cleared, [1]);
  assert.equal(room.listenerCount(), 0);
  assert.equal(room.leaveCount, 1);
  assert.equal(peers.destroyAllCount, 1);
});
