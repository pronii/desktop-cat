const ROOM_PET_STATE_INTERVAL_MS = 1000;

function createRoomPetSyncController({
  BrowserWindow,
  screen,
  peerPetFile,
  peerPetPreload,
  createRoomClient,
  createPeerPetWindowManager,
  resolveLocalPetAnchorBounds,
  buildLocalPetState,
  getPetWindow,
  getLocalPetLayoutBounds,
  sendRoomStateToRenderer,
  setInterval = globalThis.setInterval,
  clearInterval = globalThis.clearInterval
} = {}) {
  let roomClient = null;
  let roomStateTeardown = null;
  let roomPetStateTimer = null;
  let peerPetWindowManager = null;

  function ensurePeerPetWindowManager() {
    if (!peerPetWindowManager) {
      peerPetWindowManager = createPeerPetWindowManager({
        BrowserWindow,
        screen,
        peerPetFile,
        peerPetPreload
      });
    }
    return peerPetWindowManager;
  }

  function syncPeerPetsBesideLocal(peers, localBounds) {
    if (!peerPetWindowManager) return;
    const localPetAnchorBounds = resolveLocalPetAnchorBounds(localBounds);
    if (!localPetAnchorBounds) {
      peerPetWindowManager.destroyAll();
      return;
    }
    peerPetWindowManager.syncPeers(peers || [], localPetAnchorBounds);
  }

  function handleRoomStateChanged(state) {
    sendRoomStateToRenderer?.(state);
    if (!peerPetWindowManager) return;
    if (state.status === 'connected') {
      const petWindow = getPetWindow?.();
      if (!petWindow || petWindow.isDestroyed()) {
        syncPeerPetsBesideLocal([], null);
        return;
      }
      syncPeerPetsBesideLocal(state.peers || [], getLocalPetLayoutBounds?.());
      return;
    }
    peerPetWindowManager.destroyAll();
  }

  function syncCurrentPeers() {
    if (!roomClient || roomClient.getState().status !== 'connected') return;
    syncPeerPetsBesideLocal(roomClient.getState().peers || [], getLocalPetLayoutBounds?.());
  }

  function beginPeerPetDrag(userId, point) {
    if (!peerPetWindowManager) return false;
    return peerPetWindowManager.beginPeerDrag(userId, point);
  }

  function movePeerPetDrag(userId, point) {
    if (!peerPetWindowManager) return false;
    return peerPetWindowManager.movePeerDrag(userId, point);
  }

  function endPeerPetDrag(userId) {
    if (!peerPetWindowManager) return false;
    return peerPetWindowManager.endPeerDrag(userId);
  }

  function startReporting() {
    if (roomPetStateTimer) return;
    roomPetStateTimer = setInterval(() => {
      if (!roomClient) return;
      const localLayoutBounds = getLocalPetLayoutBounds?.();
      const petState = buildLocalPetState?.();
      if (petState) {
        roomClient.sendPetState(petState);
        const roomState = roomClient.getState();
        if (roomState.status === 'connected') {
          syncPeerPetsBesideLocal(roomState.peers, localLayoutBounds);
        }
      }
    }, ROOM_PET_STATE_INTERVAL_MS);
    if (typeof roomPetStateTimer.unref === 'function') {
      roomPetStateTimer.unref();
    }
  }

  function stopReporting() {
    if (!roomPetStateTimer) return;
    clearInterval(roomPetStateTimer);
    roomPetStateTimer = null;
  }

  function setup() {
    if (roomClient) return roomClient;
    ensurePeerPetWindowManager();
    roomClient = createRoomClient();
    roomStateTeardown = roomClient.onStateChanged(handleRoomStateChanged);
    startReporting();
    return roomClient;
  }

  function teardown() {
    stopReporting();
    if (roomStateTeardown) {
      roomStateTeardown();
      roomStateTeardown = null;
    }
    if (roomClient) {
      roomClient.leave();
      roomClient = null;
    }
    if (peerPetWindowManager) {
      peerPetWindowManager.destroyAll();
      peerPetWindowManager = null;
    }
  }

  return {
    setup,
    teardown,
    syncCurrentPeers,
    beginPeerPetDrag,
    movePeerPetDrag,
    endPeerPetDrag,
    getRoomClient: () => roomClient
  };
}

module.exports = {
  ROOM_PET_STATE_INTERVAL_MS,
  createRoomPetSyncController
};
