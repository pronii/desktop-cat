const crypto = require('node:crypto');
const http = require('node:http');

const { createRoomManager } = require('./roomManager');

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const DEFAULT_MAX_PAYLOAD_BYTES = 16 * 1024;
const MAX_WEBSOCKET_HEADER_BYTES = 14;
const MAX_USER_ID_LENGTH = 64;
const MAX_NICKNAME_LENGTH = 32;
const MAX_PET_STRING_LENGTH = 32;
const PET_NUMBER_FIELDS = new Set([
  'x',
  'y',
  'width',
  'height',
  'relativeX',
  'relativeY'
]);
const PET_STRING_FIELDS = new Set(['action', 'facing']);

function createFatalError(message) {
  const error = new Error(message);
  error.fatal = true;
  return error;
}

function normalizeByteLimit(value, fallback) {
  const limit = Number(value);
  return Number.isFinite(limit) && limit > 0 ? limit : fallback;
}

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

function decodeClientFrame(buffer, { maxPayloadBytes = DEFAULT_MAX_PAYLOAD_BYTES } = {}) {
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
    if (
      longLength > BigInt(maxPayloadBytes) ||
      longLength > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw createFatalError('WebSocket frame is too large');
    }
    payloadLength = Number(longLength);
    offset = 10;
  }

  if (payloadLength > maxPayloadBytes) {
    throw createFatalError('WebSocket frame is too large');
  }

  if (!masked) {
    throw createFatalError('Client WebSocket frames must be masked');
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

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function parseClientMessage(message) {
  let data;
  try {
    data = JSON.parse(message);
  } catch (_error) {
    throw new Error('Invalid JSON message');
  }

  if (!isPlainObject(data)) {
    throw new Error('Client message must be an object');
  }

  if (typeof data.type !== 'string') {
    throw new Error('Unsupported message type');
  }

  return data;
}

function validateRoomCode(roomCode) {
  const normalized = String(roomCode || '').trim();
  if (!/^\d{6}$/.test(normalized)) {
    throw new Error('Room code must be 6 digits');
  }
  return normalized;
}

function normalizeBoundedString(value, fallback, maxLength, label) {
  const normalized = String(value ?? '').trim() || fallback;
  if (normalized.length > maxLength) {
    throw new Error(`${label} is too long`);
  }
  return normalized;
}

function normalizeUserId(userId, fallback) {
  return normalizeBoundedString(userId, fallback, MAX_USER_ID_LENGTH, 'User id');
}

function normalizeNickname(nickname, fallback) {
  return normalizeBoundedString(nickname, fallback, MAX_NICKNAME_LENGTH, 'Nickname');
}

function sanitizePet(pet) {
  if (pet == null) {
    return null;
  }
  if (!isPlainObject(pet)) {
    throw new Error('Pet state must be an object');
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(pet)) {
    if (PET_NUMBER_FIELDS.has(key)) {
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue)) {
        throw new Error(`${key} must be a finite number`);
      }
      sanitized[key] = numberValue;
      continue;
    }

    if (PET_STRING_FIELDS.has(key)) {
      const textValue = String(value ?? '').trim();
      if (textValue.length > MAX_PET_STRING_LENGTH) {
        throw new Error(`${key} is too long`);
      }
      sanitized[key] = textValue;
    }
  }

  return sanitized;
}

function createRoomServer(options = {}) {
  const port = options.port ?? Number(process.env.PORT || 3001);
  const host = options.host;
  const manager = options.manager || createRoomManager(options.roomManager);
  const maxPayloadBytes = normalizeByteLimit(
    options.maxPayloadBytes,
    DEFAULT_MAX_PAYLOAD_BYTES
  );
  const maxBufferBytes = Math.max(
    normalizeByteLimit(
      options.maxBufferBytes,
      maxPayloadBytes + MAX_WEBSOCKET_HEADER_BYTES
    ),
    maxPayloadBytes + MAX_WEBSOCKET_HEADER_BYTES
  );
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
    const data = parseClientMessage(message);

    if (data.type === 'room:join') {
      const roomCode = validateRoomCode(data.roomCode);
      client.id = normalizeUserId(data.userId, client.id);
      manager.joinRoom(roomCode, client, {
        nickname: normalizeNickname(data.nickname, client.id),
        pet: sanitizePet(data.pet)
      });
      return;
    }

    if (data.type === 'pet:update') {
      manager.updateState(client, {
        pet: sanitizePet(data.pet)
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
        while ((frame = decodeClientFrame(buffer, { maxPayloadBytes }))) {
          buffer = frame.remaining;

          if (frame.opcode === 0x8) {
            socket.end(encodeServerFrame('', 0x8));
            return;
          }

          if (frame.opcode === 0x1) {
            handleClientMessage(client, frame.payload);
          }
        }

        if (buffer.length > maxBufferBytes) {
          throw createFatalError('WebSocket frame is too large');
        }
      } catch (error) {
        sendError(client, error.message);
        if (error.fatal) {
          socket.end(encodeServerFrame('', 0x8));
        }
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
