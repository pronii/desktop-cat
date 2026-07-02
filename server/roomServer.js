const crypto = require('node:crypto');
const http = require('node:http');

const { createRoomManager } = require('./roomManager');

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function createAcceptKey(key) {
  return crypto
    .createHash('sha1')
    .update(`${key}${WEBSOCKET_GUID}`)
    .digest('base64');
}

function encodeServerFrame(payload, opcode = 0x1) {
  const body = Buffer.from(payload, 'utf8');
  let header;

  if (body.length < 126) {
    header = Buffer.from([0x80 | opcode, body.length]);
  } else if (body.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }

  return Buffer.concat([header, body]);
}

function decodeClientFrame(buffer) {
  if (buffer.length < 2) {
    return null;
  }

  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let payloadLength = buffer[1] & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < 4) {
      return null;
    }
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) {
      return null;
    }
    const longLength = buffer.readBigUInt64BE(2);
    if (longLength > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('WebSocket frame is too large');
    }
    payloadLength = Number(longLength);
    offset = 10;
  }

  if (!masked) {
    throw new Error('Client WebSocket frames must be masked');
  }

  if (buffer.length < offset + 4 + payloadLength) {
    return null;
  }

  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;

  const payload = Buffer.alloc(payloadLength);
  for (let i = 0; i < payloadLength; i += 1) {
    payload[i] = buffer[offset + i] ^ mask[i % 4];
  }

  return {
    opcode,
    payload: payload.toString('utf8'),
    remaining: buffer.subarray(offset + payloadLength)
  };
}

function makeClientId() {
  return crypto.randomBytes(8).toString('hex');
}

function createRoomServer(options = {}) {
  const port = options.port ?? Number(process.env.PORT || 3001);
  const host = options.host;
  const manager = options.manager || createRoomManager(options.roomManager);
  const sockets = new Set();

  const server = http.createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'not_found' }));
  });

  function sendError(client, message) {
    client.send({
      type: 'error',
      message
    });
  }

  function handleClientMessage(client, message) {
    const data = JSON.parse(message);

    if (data.type === 'room:join') {
      client.id = data.userId || client.id;
      manager.joinRoom(data.roomCode, client, {
        nickname: data.nickname,
        pet: data.pet
      });
      return;
    }

    if (data.type === 'pet:update') {
      manager.updateState(client, {
        pet: data.pet
      });
      return;
    }

    if (data.type === 'room:leave') {
      manager.leaveClient(client);
      return;
    }

    throw new Error('Unsupported message type');
  }

  server.on('upgrade', (request, socket) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    if (path !== '/room') {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }

    const key = request.headers['sec-websocket-key'];
    if (!key || request.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${createAcceptKey(key)}`,
      '',
      ''
    ].join('\r\n'));

    sockets.add(socket);

    const client = {
      id: makeClientId(),
      send(message) {
        if (!socket.destroyed) {
          socket.write(encodeServerFrame(JSON.stringify(message)));
        }
      }
    };
    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      try {
        let frame;
        while ((frame = decodeClientFrame(buffer))) {
          buffer = frame.remaining;

          if (frame.opcode === 0x8) {
            socket.end(encodeServerFrame('', 0x8));
            return;
          }

          if (frame.opcode === 0x1) {
            handleClientMessage(client, frame.payload);
          }
        }
      } catch (error) {
        sendError(client, error.message);
      }
    });

    socket.on('close', () => {
      sockets.delete(socket);
      manager.leaveClient(client);
    });
    socket.on('error', () => {
      sockets.delete(socket);
      manager.leaveClient(client);
    });
  });

  return {
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve();
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
    address() {
      return server.address();
    }
  };
}

async function startRoomServer(options = {}) {
  const roomServer = createRoomServer(options);
  await roomServer.listen();

  const address = roomServer.address();
  const boundPort = typeof address === 'object' && address ? address.port : options.port;
  console.log(`desktop-cat room server listening on ${boundPort}`);

  return roomServer;
}

if (require.main === module) {
  startRoomServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  createRoomServer,
  startRoomServer
};
