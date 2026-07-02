const assert = require('node:assert/strict');
const test = require('node:test');

const { createRoomServer } = require('../../server/roomServer');
const { SimpleWebSocket } = require('../../src/main/simpleWebSocket');

function waitForEvent(socket, type) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${type}`));
    }, 1000);

    socket.addEventListener(type, (event) => {
      clearTimeout(timeout);
      resolve(event);
    });
  });
}

test('simple websocket can join the room server over ws', async () => {
  const roomServer = createRoomServer({ port: 0 });
  await roomServer.listen();

  const socket = new SimpleWebSocket(`ws://127.0.0.1:${roomServer.address().port}/room`);

  try {
    await waitForEvent(socket, 'open');
    socket.send(JSON.stringify({
      type: 'room:join',
      roomCode: '111222',
      userId: 'simple-client',
      nickname: 'Simple'
    }));

    const messageEvent = await waitForEvent(socket, 'message');
    const message = JSON.parse(messageEvent.data);

    assert.equal(message.type, 'room:joined');
    assert.equal(message.roomCode, '111222');
    assert.equal(message.selfId, 'simple-client');
  } finally {
    socket.close();
    await roomServer.close();
  }
});
