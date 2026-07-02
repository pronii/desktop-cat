const assert = require('node:assert/strict');
const test = require('node:test');

const { createRoomManager } = require('../../server/roomManager');

function makeClient(id) {
  return {
    id,
    messages: [],
    send(message) {
      this.messages.push(message);
    }
  };
}

test('joinRoom sends existing peer states to the joining client', () => {
  const manager = createRoomManager({ now: () => 1000 });
  const alice = makeClient('alice');
  const bob = makeClient('bob');

  manager.joinRoom('123456', alice, { nickname: 'Alice' });
  manager.updateState(alice, {
    pet: { x: 0.2, y: 0.8, action: 'idle', facing: 'right' }
  });

  manager.joinRoom('123456', bob, { nickname: 'Bob' });

  assert.equal(bob.messages[0].type, 'room:joined');
  assert.deepEqual(bob.messages[0].peers, [
    {
      userId: 'alice',
      nickname: 'Alice',
      pet: { x: 0.2, y: 0.8, action: 'idle', facing: 'right' },
      updatedAt: 1000
    }
  ]);
});

test('updateState broadcasts pet state to other clients in the same room', () => {
  const manager = createRoomManager({ now: () => 2000 });
  const alice = makeClient('alice');
  const bob = makeClient('bob');
  const outsider = makeClient('outsider');

  manager.joinRoom('123456', alice, { nickname: 'Alice' });
  manager.joinRoom('123456', bob, { nickname: 'Bob' });
  manager.joinRoom('999999', outsider, { nickname: 'Outsider' });

  manager.updateState(alice, {
    pet: { x: 0.4, y: 0.5, action: 'walk', facing: 'left' }
  });

  assert.equal(bob.messages.at(-1).type, 'pet:update');
  assert.equal(bob.messages.at(-1).userId, 'alice');
  assert.equal(bob.messages.at(-1).nickname, 'Alice');
  assert.deepEqual(bob.messages.at(-1).pet, {
    x: 0.4,
    y: 0.5,
    action: 'walk',
    facing: 'left'
  });
  assert.equal(outsider.messages.length, 1);
});

test('leaveClient notifies remaining peers and removes empty rooms', () => {
  const manager = createRoomManager({ now: () => 3000 });
  const alice = makeClient('alice');
  const bob = makeClient('bob');

  manager.joinRoom('123456', alice, { nickname: 'Alice' });
  manager.joinRoom('123456', bob, { nickname: 'Bob' });

  manager.leaveClient(alice);

  assert.deepEqual(bob.messages.at(-1), {
    type: 'pet:leave',
    userId: 'alice'
  });
  assert.deepEqual(manager.getRoomSnapshot('123456').clients, ['bob']);

  manager.leaveClient(bob);

  assert.equal(manager.getRoomSnapshot('123456'), null);
});
