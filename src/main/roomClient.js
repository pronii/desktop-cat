const DEFAULT_ROOM_ENDPOINT = 'ws://45.136.28.241:3001/room';

function clonePet(pet) {
  return pet && typeof pet === 'object' ? { ...pet } : null;
}

function normalizePeer(peer, now) {
  return {
    userId: String(peer.userId || ''),
    nickname: String(peer.nickname || peer.userId || '好友'),
    pet: clonePet(peer.pet),
    updatedAt: Number(peer.updatedAt || now())
  };
}

function normalizePeerList(peers, selfId, now) {
  const peersByUserId = new Map();
  for (const peer of peers || []) {
    const nextPeer = normalizePeer(peer, now);
    if (!nextPeer.userId || nextPeer.userId === selfId) continue;
    peersByUserId.set(nextPeer.userId, nextPeer);
  }
  return Array.from(peersByUserId.values());
}

function createInitialState() {
  return {
    status: 'disconnected',
    roomCode: null,
    selfId: null,
    nickname: '',
    error: null,
    peers: []
  };
}

function cloneState(state) {
  return {
    ...state,
    peers: state.peers.map((peer) => ({
      ...peer,
      pet: clonePet(peer.pet)
    }))
  };
}

function getReadyState(WebSocketCtor, name, fallback) {
  return typeof WebSocketCtor[name] === 'number' ? WebSocketCtor[name] : fallback;
}

function addSocketListener(socket, type, listener) {
  if (typeof socket.addEventListener === 'function') {
    socket.addEventListener(type, listener);
    return;
  }
  if (typeof socket.on === 'function') {
    socket.on(type, listener);
  }
}

function parseMessage(event) {
  const data = event && Object.prototype.hasOwnProperty.call(event, 'data')
    ? event.data
    : event;
  if (typeof data === 'string') {
    return JSON.parse(data);
  }
  if (Buffer.isBuffer(data)) {
    return JSON.parse(data.toString('utf8'));
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

function createRoomClient({
  WebSocket,
  endpoint = DEFAULT_ROOM_ENDPOINT,
  userId,
  now = () => Date.now()
} = {}) {
  if (!WebSocket) {
    throw new Error('WebSocket constructor is required');
  }

  const openState = getReadyState(WebSocket, 'OPEN', 1);
  let socket = null;
  let state = createInitialState();
  const listeners = new Set();

  function notify() {
    const snapshot = cloneState(state);
    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  function setState(next) {
    state = { ...state, ...next };
    notify();
  }

  function replacePeers(peers) {
    state = {
      ...state,
      peers: normalizePeerList(peers, state.selfId, now)
    };
    notify();
  }

  function upsertPeer(peer) {
    const nextPeer = normalizePeer(peer, now);
    if (!nextPeer.userId || nextPeer.userId === state.selfId) return;

    const peers = state.peers.filter((item) => item.userId !== nextPeer.userId);
    peers.push(nextPeer);
    replacePeers(peers);
  }

  function removePeer(userId) {
    state = {
      ...state,
      peers: state.peers.filter((peer) => peer.userId !== userId)
    };
    notify();
  }

  function sendJson(message) {
    if (!socket || socket.readyState !== openState) {
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }

  function handleMessage(event) {
    let message;
    try {
      message = parseMessage(event);
    } catch (error) {
      setState({ status: 'error', error: '无法解析房间消息' });
      return;
    }

    if (!message || typeof message.type !== 'string') return;

    if (message.type === 'room:joined') {
      const selfId = message.selfId || userId;
      state = {
        ...state,
        status: 'connected',
        roomCode: message.roomCode || state.roomCode,
        selfId,
        error: null,
        peers: normalizePeerList(message.peers, selfId, now)
      };
      notify();
      return;
    }

    if (message.type === 'pet:join' || message.type === 'pet:update') {
      upsertPeer(message);
      return;
    }

    if (message.type === 'pet:leave') {
      removePeer(message.userId);
      return;
    }

    if (message.type === 'error') {
      setState({ status: 'error', error: message.message || '房间连接出错' });
    }
  }

  function resetDisconnected() {
    state = createInitialState();
    notify();
  }

  function closeSocket() {
    if (!socket) return;
    const currentSocket = socket;
    socket = null;
    if (typeof currentSocket.close === 'function') {
      currentSocket.close();
    }
  }

  function join({ roomCode, nickname = '' }) {
    const normalizedRoomCode = validateRoomCode(roomCode);
    closeSocket();

    state = {
      ...createInitialState(),
      status: 'connecting',
      roomCode: normalizedRoomCode,
      selfId: userId,
      nickname: String(nickname || '').trim() || '小猫好友'
    };
    notify();

    socket = new WebSocket(endpoint);
    addSocketListener(socket, 'open', () => {
      sendJson({
        type: 'room:join',
        roomCode: normalizedRoomCode,
        userId,
        nickname: state.nickname
      });
    });
    addSocketListener(socket, 'message', handleMessage);
    addSocketListener(socket, 'error', () => {
      setState({ status: 'error', error: '房间连接失败' });
    });
    addSocketListener(socket, 'close', () => {
      if (socket) {
        resetDisconnected();
        socket = null;
      }
    });

    return cloneState(state);
  }

  function leave() {
    sendJson({ type: 'room:leave' });
    closeSocket();
    resetDisconnected();
    return cloneState(state);
  }

  function sendPetState(pet) {
    if (state.status !== 'connected') {
      return false;
    }
    return sendJson({
      type: 'pet:update',
      pet: clonePet(pet) || {}
    });
  }

  return {
    join,
    leave,
    sendPetState,
    getState: () => cloneState(state),
    onStateChanged(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    }
  };
}

module.exports = {
  DEFAULT_ROOM_ENDPOINT,
  createRoomClient
};
