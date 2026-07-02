function createRoomManager(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const maxClientsPerRoom = options.maxClientsPerRoom || 8;
  const rooms = new Map();
  const clientRooms = new Map();

  function getOrCreateRoom(roomCode) {
    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, {
        clients: new Map()
      });
    }
    return rooms.get(roomCode);
  }

  function send(client, message) {
    client.send(message);
  }

  function broadcast(room, message, exceptClient) {
    for (const peer of room.clients.values()) {
      if (peer.client !== exceptClient) {
        send(peer.client, message);
      }
    }
  }

  function joinRoom(roomCode, client, profile = {}) {
    if (!roomCode || typeof roomCode !== 'string') {
      throw new Error('roomCode is required');
    }
    if (!client?.id || typeof client.send !== 'function') {
      throw new Error('client id and send function are required');
    }

    if (clientRooms.has(client)) {
      leaveClient(client);
    }

    const room = getOrCreateRoom(roomCode);
    if (room.clients.size >= maxClientsPerRoom) {
      throw new Error('room is full');
    }

    const peerList = Array.from(room.clients.values()).map((peer) => ({
      userId: peer.client.id,
      nickname: peer.nickname,
      pet: peer.pet,
      updatedAt: peer.updatedAt
    }));

    room.clients.set(client, {
      client,
      nickname: profile.nickname || client.id,
      pet: profile.pet || null,
      updatedAt: now()
    });
    clientRooms.set(client, roomCode);

    send(client, {
      type: 'room:joined',
      roomCode,
      selfId: client.id,
      peers: peerList
    });

    broadcast(room, {
      type: 'pet:join',
      userId: client.id,
      nickname: profile.nickname || client.id,
      pet: profile.pet || null
    }, client);
  }

  function updateState(client, state = {}) {
    const roomCode = clientRooms.get(client);
    if (!roomCode) {
      throw new Error('client has not joined a room');
    }

    const room = rooms.get(roomCode);
    const peer = room?.clients.get(client);
    if (!room || !peer) {
      throw new Error('client room state is missing');
    }

    peer.pet = state.pet || null;
    peer.updatedAt = now();

    broadcast(room, {
      type: 'pet:update',
      userId: client.id,
      nickname: peer.nickname,
      pet: peer.pet,
      updatedAt: peer.updatedAt
    }, client);
  }

  function leaveClient(client) {
    const roomCode = clientRooms.get(client);
    if (!roomCode) {
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      clientRooms.delete(client);
      return;
    }

    room.clients.delete(client);
    clientRooms.delete(client);

    broadcast(room, {
      type: 'pet:leave',
      userId: client.id
    }, client);

    if (room.clients.size === 0) {
      rooms.delete(roomCode);
    }
  }

  function getRoomSnapshot(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) {
      return null;
    }

    return {
      roomCode,
      clients: Array.from(room.clients.values()).map((peer) => peer.client.id)
    };
  }

  return {
    joinRoom,
    updateState,
    leaveClient,
    getRoomSnapshot
  };
}

module.exports = {
  createRoomManager
};
