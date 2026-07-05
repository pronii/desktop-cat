const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
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

function httpPostJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);
    const request = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          body: JSON.parse(responseBody)
        });
      });
    });
    request.on('error', reject);
    request.end(payload);
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

function connectWebSocket(port, path = '/room') {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    const key = crypto.randomBytes(16).toString('base64');
    let handshakeBuffer = Buffer.alloc(0);
    let frameBuffer = Buffer.alloc(0);
    const messages = [];
    const waiters = [];
    let readyCheck = null;

    function rejectConnection(error) {
      if (readyCheck) {
        clearInterval(readyCheck);
        readyCheck = null;
      }
      reject(error);
    }

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
        if (!/^HTTP\/1\.1 101 /.test(responseHeader)) {
          rejectConnection(new Error(`WebSocket handshake failed: ${responseHeader.split('\r\n')[0]}`));
          socket.destroy();
          return;
        }
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
    socket.on('error', rejectConnection);
    socket.on('close', () => {
      if (handshakeBuffer !== null) {
        rejectConnection(new Error('WebSocket closed before handshake completed'));
      }
    });
    socket.on('connect', () => {
      socket.write([
        `GET ${path} HTTP/1.1`,
        'Host: 127.0.0.1',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        ''
      ].join('\r\n'));
    });

    readyCheck = setInterval(() => {
      if (handshakeBuffer === null) {
        clearInterval(readyCheck);
        readyCheck = null;
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

test('room server exposes the latest update manifest', async () => {
  const manifest = {
    version: '0.3.1',
    url: 'https://example.test/releases/desktop-cat-0.3.1.exe',
    sha256: 'a'.repeat(64),
    notes: 'Remote update prompt',
    mandatory: false
  };
  const roomServer = createRoomServer({ port: 0, updateManifest: manifest });
  await roomServer.listen();

  try {
    const response = await httpGetJson(`http://127.0.0.1:${roomServer.address().port}/updates/latest.json`);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, manifest);
  } finally {
    await roomServer.close();
  }
});

test('room server accepts update manifest files with a UTF-8 BOM', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-update-manifest-'));
  const manifestPath = path.join(tempDir, 'latest.json');
  const manifest = {
    version: '0.3.1',
    url: 'https://example.test/releases/desktop-cat-0.3.1.exe',
    sha256: 'a'.repeat(64),
    notes: 'PowerShell generated manifest',
    mandatory: false
  };
  fs.writeFileSync(
    manifestPath,
    Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(JSON.stringify(manifest), 'utf8')
    ])
  );
  const roomServer = createRoomServer({ port: 0, updateManifestPath: manifestPath });
  await roomServer.listen();

  try {
    const response = await httpGetJson(`http://127.0.0.1:${roomServer.address().port}/updates/latest.json`);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, manifest);
  } finally {
    await roomServer.close();
  }
});

test('room server broadcasts update notifications to update stream clients', async () => {
  const manifest = {
    version: '0.3.1',
    url: 'https://example.test/releases/desktop-cat-0.3.1.exe',
    sha256: 'b'.repeat(64),
    mandatory: true
  };
  const roomServer = createRoomServer({
    port: 0,
    updateManifest: manifest,
    updatePublishToken: 'secret-token'
  });
  await roomServer.listen();

  const port = roomServer.address().port;
  let streamClient;

  try {
    streamClient = await connectWebSocket(port, '/updates/stream?version=0.3.0');
    const response = await httpPostJson(
      `http://127.0.0.1:${port}/updates/publish`,
      { version: manifest.version },
      { Authorization: 'Bearer secret-token' }
    );
    const message = await streamClient.nextJson();

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ok, true);
    assert.deepEqual(message, {
      type: 'update:available',
      version: '0.3.1',
      manifestUrl: '/updates/latest.json',
      mandatory: true
    });
  } finally {
    if (streamClient) {
      streamClient.close();
    }
    await roomServer.close();
  }
});

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

test('room server relays sanitized Live2D appearance fields', async () => {
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
      pet: {
        x: 0.2,
        y: 0.8,
        scale: 0.5,
        action: 'idle',
        facing: 'right',
        appearanceType: 'live2d',
        modelId: 'Haru',
        modelName: 'Haru',
        modelUrl: 'file:///must-not-pass'
      }
    });

    bob.sendJson({
      type: 'room:join',
      roomCode: '123456',
      userId: 'bob',
      nickname: 'Bob'
    });
    const bobJoined = await bob.nextJson();

    assert.deepEqual(bobJoined.peers[0].pet, {
      x: 0.2,
      y: 0.8,
      scale: 0.5,
      action: 'idle',
      facing: 'right',
      appearanceType: 'live2d',
      modelId: 'Haru',
      modelName: 'Haru'
    });
  } finally {
    alice.close();
    bob.close();
    await roomServer.close();
  }
});

test('room server rejects invalid room codes from WebSocket clients', async () => {
  const roomServer = createRoomServer({ port: 0 });
  await roomServer.listen();

  const port = roomServer.address().port;
  const alice = await connectWebSocket(port);

  try {
    alice.sendJson({
      type: 'room:join',
      roomCode: 'abc',
      userId: 'alice',
      nickname: 'Alice'
    });

    const message = await alice.nextJson();

    assert.equal(message.type, 'error');
    assert.match(message.message, /room code/i);
  } finally {
    alice.close();
    await roomServer.close();
  }
});

test('room server rejects oversized WebSocket messages', async () => {
  const roomServer = createRoomServer({ port: 0, maxPayloadBytes: 64 });
  await roomServer.listen();

  const port = roomServer.address().port;
  const alice = await connectWebSocket(port);

  try {
    alice.sendJson({
      type: 'room:join',
      roomCode: '123456',
      userId: 'alice',
      nickname: 'A'.repeat(80)
    });

    const message = await alice.nextJson();

    assert.equal(message.type, 'error');
    assert.match(message.message, /too large/i);
  } finally {
    alice.close();
    await roomServer.close();
  }
});
