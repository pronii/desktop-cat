const crypto = require('node:crypto');
const net = require('node:net');

class SimpleWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = SimpleWebSocket.CONNECTING;
    this.listeners = new Map();
    this.handshakeBuffer = Buffer.alloc(0);
    this.frameBuffer = Buffer.alloc(0);
    this.socket = null;

    this.connect(url);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((item) => item !== listener));
  }

  send(payload) {
    if (this.readyState !== SimpleWebSocket.OPEN || !this.socket) {
      throw new Error('WebSocket is not open');
    }
    this.socket.write(encodeClientFrame(String(payload)));
  }

  close() {
    if (this.readyState === SimpleWebSocket.CLOSED) return;
    this.readyState = SimpleWebSocket.CLOSING;
    if (this.socket) {
      if (!this.socket.destroyed) {
        this.socket.end();
      }
      return;
    }
    this.finishClose();
  }

  connect(rawUrl) {
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch (error) {
      this.fail(error);
      return;
    }

    if (parsed.protocol !== 'ws:') {
      this.fail(new Error('SimpleWebSocket only supports ws:// URLs'));
      return;
    }

    const port = Number(parsed.port || 80);
    const host = parsed.hostname;
    const path = `${parsed.pathname || '/'}${parsed.search || ''}`;
    const key = crypto.randomBytes(16).toString('base64');

    this.socket = net.createConnection({ host, port });
    this.socket.on('connect', () => {
      this.socket.write([
        `GET ${path} HTTP/1.1`,
        `Host: ${host}:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        ''
      ].join('\r\n'));
    });
    this.socket.on('data', (chunk) => this.handleData(chunk));
    this.socket.on('error', (error) => this.fail(error));
    this.socket.on('close', () => this.finishClose());
  }

  handleData(chunk) {
    if (this.readyState === SimpleWebSocket.CLOSED) return;

    if (this.handshakeBuffer !== null) {
      this.handshakeBuffer = Buffer.concat([this.handshakeBuffer, chunk]);
      const headerEnd = this.handshakeBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      const header = this.handshakeBuffer.subarray(0, headerEnd).toString('utf8');
      if (!/^HTTP\/1\.1 101 /.test(header)) {
        this.fail(new Error('WebSocket handshake failed'));
        return;
      }

      this.frameBuffer = this.handshakeBuffer.subarray(headerEnd + 4);
      this.handshakeBuffer = null;
      this.readyState = SimpleWebSocket.OPEN;
      this.emit('open', {});
    } else {
      this.frameBuffer = Buffer.concat([this.frameBuffer, chunk]);
    }

    this.drainFrames();
  }

  drainFrames() {
    let frame;
    while ((frame = decodeServerFrame(this.frameBuffer))) {
      this.frameBuffer = frame.remaining;

      if (frame.opcode === 0x1) {
        this.emit('message', { data: frame.payload.toString('utf8') });
      } else if (frame.opcode === 0x8) {
        this.close();
      } else if (frame.opcode === 0x9 && this.socket && this.readyState === SimpleWebSocket.OPEN) {
        this.socket.write(encodeControlFrame(0x0a, frame.payload));
      }
    }
  }

  fail(error) {
    if (this.readyState === SimpleWebSocket.CLOSED) return;
    this.emit('error', { error, message: error.message });
    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy();
    }
    this.finishClose();
  }

  finishClose() {
    if (this.readyState === SimpleWebSocket.CLOSED) return;
    this.readyState = SimpleWebSocket.CLOSED;
    this.emit('close', {});
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) || []) {
      listener(event);
    }
  }
}

function encodeLength(length, masked) {
  const maskBit = masked ? 0x80 : 0;
  if (length < 126) {
    return Buffer.from([maskBit | length]);
  }
  if (length <= 0xffff) {
    const header = Buffer.alloc(3);
    header[0] = maskBit | 126;
    header.writeUInt16BE(length, 1);
    return header;
  }
  const header = Buffer.alloc(9);
  header[0] = maskBit | 127;
  header.writeBigUInt64BE(BigInt(length), 1);
  return header;
}

function encodeClientFrame(payload) {
  const body = Buffer.from(payload, 'utf8');
  const mask = crypto.randomBytes(4);
  const header = Buffer.concat([Buffer.from([0x81]), encodeLength(body.length, true), mask]);
  const masked = Buffer.alloc(body.length);

  for (let i = 0; i < body.length; i += 1) {
    masked[i] = body[i] ^ mask[i % 4];
  }

  return Buffer.concat([header, masked]);
}

function encodeControlFrame(opcode, payload = Buffer.alloc(0)) {
  return Buffer.concat([Buffer.from([0x80 | opcode]), encodeLength(payload.length, false), payload]);
}

function decodeServerFrame(buffer) {
  if (buffer.length < 2) return null;

  const opcode = buffer[0] & 0x0f;
  const masked = Boolean(buffer[1] & 0x80);
  let payloadLength = buffer[1] & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < offset + 2) return null;
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) return null;
    payloadLength = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }

  let mask;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    mask = buffer.subarray(offset, offset + 4);
    offset += 4;
  }

  const frameLength = offset + payloadLength;
  if (buffer.length < frameLength) return null;

  const payload = Buffer.from(buffer.subarray(offset, frameLength));
  if (mask) {
    for (let i = 0; i < payload.length; i += 1) {
      payload[i] ^= mask[i % 4];
    }
  }

  return {
    opcode,
    payload,
    remaining: buffer.subarray(frameLength)
  };
}

module.exports = {
  SimpleWebSocket
};
