const assert = require('node:assert/strict');
const test = require('node:test');

const { createRoomClient } = require('../../src/main/roomClient');

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    this.listeners = new Map();
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close');
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }

  message(payload) {
    this.emit('message', { data: JSON.stringify(payload) });
  }

  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) {
      listener(event);
    }
  }
}

FakeWebSocket.CONNECTING = 0;
FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSING = 2;
FakeWebSocket.CLOSED = 3;

function createClient() {
  FakeWebSocket.instances = [];
  return createRoomClient({
    WebSocket: FakeWebSocket,
    endpoint: 'ws://example.test/room',
    userId: 'local-user',
    now: () => 1234
  });
}

test('room client sends a join message when the socket opens', () => {
  const client = createClient();

  client.join({ roomCode: '123456', nickname: 'Alice' });
  const socket = FakeWebSocket.instances[0];
  socket.open();

  assert.equal(socket.url, 'ws://example.test/room');
  assert.deepEqual(socket.sent, [{
    type: 'room:join',
    roomCode: '123456',
    userId: 'local-user',
    nickname: 'Alice'
  }]);
  assert.equal(client.getState().status, 'connecting');
});

test('room client records joined room state and peers', () => {
  const client = createClient();

  client.join({ roomCode: '123456', nickname: 'Alice' });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.message({
    type: 'room:joined',
    roomCode: '123456',
    selfId: 'local-user',
    peers: [{
      userId: 'bob',
      nickname: 'Bob',
      pet: { x: 10, y: 20, action: 'idle' },
      updatedAt: 1000
    }]
  });

  assert.deepEqual(client.getState(), {
    status: 'connected',
    roomCode: '123456',
    selfId: 'local-user',
    nickname: 'Alice',
    error: null,
    peers: [{
      userId: 'bob',
      nickname: 'Bob',
      pet: { x: 10, y: 20, action: 'idle' },
      updatedAt: 1000
    }]
  });
});

test('room client excludes self and deduplicates peers from joined room state', () => {
  const client = createClient();

  client.join({ roomCode: '123456', nickname: 'Alice' });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.message({
    type: 'room:joined',
    roomCode: '123456',
    selfId: 'local-user',
    peers: [
      { userId: 'local-user', nickname: 'Alice', pet: { action: 'idle' }, updatedAt: 1000 },
      { userId: 'bob', nickname: 'Bob', pet: { action: 'idle' }, updatedAt: 1000 },
      { userId: 'bob', nickname: 'Bobby', pet: { action: 'drag' }, updatedAt: 2000 }
    ]
  });

  assert.deepEqual(client.getState().peers, [{
    userId: 'bob',
    nickname: 'Bobby',
    pet: { action: 'drag' },
    updatedAt: 2000
  }]);
});

test('room client updates and removes peers from server messages', () => {
  const client = createClient();

  client.join({ roomCode: '654321', nickname: 'Alice' });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.message({
    type: 'pet:join',
    userId: 'bob',
    nickname: 'Bob',
    pet: { x: 1, y: 2, action: 'idle' },
    updatedAt: 2000
  });
  socket.message({
    type: 'pet:update',
    userId: 'bob',
    nickname: 'Bobby',
    pet: { x: 3, y: 4, action: 'walk', facing: 'left' },
    updatedAt: 3000
  });

  assert.deepEqual(client.getState().peers, [{
    userId: 'bob',
    nickname: 'Bobby',
    pet: { x: 3, y: 4, action: 'walk', facing: 'left' },
    updatedAt: 3000
  }]);

  socket.message({ type: 'pet:leave', userId: 'bob' });

  assert.deepEqual(client.getState().peers, []);
});

test('room client leaves the room and clears peer state', () => {
  const client = createClient();

  client.join({ roomCode: '123456', nickname: 'Alice' });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.message({
    type: 'pet:join',
    userId: 'bob',
    nickname: 'Bob',
    pet: { action: 'idle' },
    updatedAt: 1000
  });

  client.leave();

  assert.deepEqual(socket.sent.at(-1), { type: 'room:leave' });
  assert.equal(client.getState().status, 'disconnected');
  assert.equal(client.getState().roomCode, null);
  assert.deepEqual(client.getState().peers, []);
});

test('room client only sends pet state while connected', () => {
  const client = createClient();

  assert.equal(client.sendPetState({ action: 'idle' }), false);

  client.join({ roomCode: '123456', nickname: 'Alice' });
  const socket = FakeWebSocket.instances[0];
  socket.open();

  assert.equal(client.sendPetState({ x: 5, y: 6, action: 'idle' }), false);

  socket.message({
    type: 'room:joined',
    roomCode: '123456',
    selfId: 'local-user',
    peers: []
  });

  assert.equal(client.sendPetState({ x: 5, y: 6, action: 'idle' }), true);
  assert.deepEqual(socket.sent.at(-1), {
    type: 'pet:update',
    pet: { x: 5, y: 6, action: 'idle' }
  });
});
