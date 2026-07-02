const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const test = require('node:test');

const { createRoomServer } = require('../../server/roomServer');

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          body: JSON.parse(body)
        });
      });
    }).on('error', reject);
  });
}

function encodeClientFrame(payload) {
  const body = Buffer.from(payload, 'utf8');
  const mask = Buffer.from([1, 2, 3, 4]);
  const header = [];

  header.push(0x81);
  if (body.length < 126) {
    header.push(0x80 | body.length);
  } else {
    header.push(0x80 | 126, (body.length >> 8) & 0xff, body.length & 0xff);
  }

  const masked = Buffer.alloc(body.length);
  for (let i = 0; i < body.length; i += 1) {
    masked[i] = body[i] ^ mask[i % 4];
  }

  return Buffer.concat([Buffer.from(header), mask, masked]);
}

function decodeServerFrame(buffer) {
  if (buffer.length < 2) {
    return null;
  }

  const opcode = buffer[0] & 0x0f;
  let offset = 2;
  let payloadLength = buffer[1] & 0x7f;

  if (payloadLength === 126) {
    if (buffer.length < 4) {
      return null;
    }
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  }

  const frameLength = offset + payloadLength;
  if (buffer.length < frameLength) {
    return null;
  }

  return {
    opcode,
    payload: buffer.subarray(offset, frameLength).toString('utf8'),
    remaining: buffer.subarray(frameLength)
  };
}

function connectWebSocket(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    const key = crypto.randomBytes(16).toString('base64');
    let handshakeBuffer = Buffer.alloc(0);
    let frameBuffer = Buffer.alloc(0);
    const messages = [];
    const waiters = [];

    function emitMessage(message) {
      const waiter = waiters.shift();
      if (waiter) {
        waiter.resolve(message);
      } else {
        messages.push(message);
      }
    }

    function onData(chunk) {
      if (handshakeBuffer !== null) {
        handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
        const headerEnd = handshakeBuffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
          return;
        }

        const responseHeader = handshakeBuffer.subarray(0, headerEnd).toString('utf8');
        assert.match(responseHeader, /^HTTP\/1\.1 101 /);
        frameBuffer = handshakeBuffer.subarray(headerEnd + 4);
        handshakeBuffer = null;
      } else {
        frameBuffer = Buffer.concat([frameBuffer, chunk]);
      }

      let frame;
      while ((frame = decodeServerFrame(frameBuffer))) {
        frameBuffer = frame.remaining;
        if (frame.opcode === 0x1) {
          emitMessage(JSON.parse(frame.payload));
        }
      }
    }

    socket.on('data', onData);
    socket.on('error', reject);
    socket.on('connect', () => {
      socket.write([
        'GET /room HTTP/1.1',
        'Host: 127.0.0.1',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        ''
      ].join('\r\n'));
    });

    const readyCheck = setInterval(() => {
      if (handshakeBuffer === null) {
        clearInterval(readyCheck);
        resolve({
          sendJson(message) {
            socket.write(encodeClientFrame(JSON.stringify(message)));
          },
          nextJson() {
            const message = messages.shift();
            if (message) {
              return Promise.resolve(message);
            }
            return new Promise((resolveNext, rejectNext) => {
              const timeout = setTimeout(() => {
                rejectNext(new Error('Timed out waiting for WebSocket message'));
              }, 1000);
              waiters.push({
                resolve(value) {
                  clearTimeout(timeout);
                  resolveNext(value);
                }
              });
            });
          },
          close() {
            socket.end();
          }
        });
      }
    }, 5);
  });
}

test('room server exposes a health check endpoint', async () => {
  const roomServer = createRoomServer({ port: 0 });
  await roomServer.listen();

  try {
    const response = await httpGetJson(`http://127.0.0.1:${roomServer.address().port}/health`);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { ok: true });
  } finally {
    await roomServer.close();
  }
});

test('room server relays pet state between WebSocket room clients', async () => {
  const roomServer = createRoomServer({ port: 0 });
  await roomServer.listen();

  const port = roomServer.address().port;
  const alice = await connectWebSocket(port);
  const bob = await connectWebSocket(port);

  try {
    alice.sendJson({
      type: 'room:join',
      roomCode: '123456',
      userId: 'alice',
      nickname: 'Alice'
    });
    assert.equal((await alice.nextJson()).type, 'room:joined');

    alice.sendJson({
      type: 'pet:update',
      pet: { x: 0.2, y: 0.8, action: 'idle', facing: 'right' }
    });

    bob.sendJson({
      type: 'room:join',
      roomCode: '123456',
      userId: 'bob',
      nickname: 'Bob'
    });
    const bobJoined = await bob.nextJson();

    assert.equal(typeof bobJoined.peers[0].updatedAt, 'number');
    assert.deepEqual(bobJoined.peers, [
      {
        userId: 'alice',
        nickname: 'Alice',
        pet: { x: 0.2, y: 0.8, action: 'idle', facing: 'right' },
        updatedAt: bobJoined.peers[0].updatedAt
      }
    ]);

    alice.sendJson({
      type: 'pet:update',
      pet: { x: 0.4, y: 0.5, action: 'walk', facing: 'left' }
    });
    const update = await bob.nextJson();

    assert.equal(update.type, 'pet:update');
    assert.equal(update.userId, 'alice');
    assert.deepEqual(update.pet, { x: 0.4, y: 0.5, action: 'walk', facing: 'left' });
  } finally {
    alice.close();
    bob.close();
    await roomServer.close();
  }
});
