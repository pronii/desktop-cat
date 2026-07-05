const PEER_WINDOW_WIDTH = 160;
const PEER_WINDOW_HEIGHT = 150;
const PEER_WINDOW_GAP = 4;
const LOCAL_STAGE_WIDTH = 240;
const LOCAL_STAGE_HEIGHT = 240;
const LOCAL_STAGE_BOTTOM_PADDING = 8;
const LOCAL_CAT_WIDTH = 178;
const LOCAL_CAT_HEIGHT = 190;
const LOCAL_CAT_OFFSET_X_IN_STAGE = 31;
const LOCAL_CAT_OFFSET_Y_IN_STAGE = 25;
const MAX_PEER_LIVE2D_WINDOWS = 3;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getAnchorDisplay(screen, anchorBounds) {
  if (anchorBounds && typeof screen.getDisplayMatching === 'function') {
    return screen.getDisplayMatching(anchorBounds);
  }
  if (anchorBounds && typeof screen.getDisplayNearestPoint === 'function') {
    return screen.getDisplayNearestPoint({ x: anchorBounds.x, y: anchorBounds.y });
  }
  return screen.getPrimaryDisplay();
}

function resolveLocalPetAnchorBounds(windowBounds) {
  if (!windowBounds) return null;
  const stageX = windowBounds.x + Math.round((windowBounds.width - LOCAL_STAGE_WIDTH) / 2);
  const stageY = windowBounds.y + windowBounds.height - LOCAL_STAGE_BOTTOM_PADDING - LOCAL_STAGE_HEIGHT;

  return {
    x: stageX + LOCAL_CAT_OFFSET_X_IN_STAGE,
    y: stageY + LOCAL_CAT_OFFSET_Y_IN_STAGE,
    width: LOCAL_CAT_WIDTH,
    height: LOCAL_CAT_HEIGHT
  };
}

function resolvePeerBounds(anchorBounds, screen, index, total) {
  const display = getAnchorDisplay(screen, anchorBounds);
  const workArea = display.workArea;
  const anchor = anchorBounds || {
    x: workArea.x,
    y: workArea.y,
    width: 0,
    height: PEER_WINDOW_HEIGHT
  };
  const step = PEER_WINDOW_WIDTH + PEER_WINDOW_GAP;
  const rightStartX = anchor.x + anchor.width + PEER_WINDOW_GAP;
  const rightGroupWidth = total * PEER_WINDOW_WIDTH + Math.max(0, total - 1) * PEER_WINDOW_GAP;
  const canFitRight = rightStartX + rightGroupWidth <= workArea.x + workArea.width;
  const rawX = canFitRight
    ? rightStartX + index * step
    : anchor.x - PEER_WINDOW_GAP - PEER_WINDOW_WIDTH - index * step;
  const rawY = anchor.y + Math.round((anchor.height - PEER_WINDOW_HEIGHT) / 2);

  return {
    x: clamp(rawX, workArea.x, workArea.x + workArea.width - PEER_WINDOW_WIDTH),
    y: clamp(rawY, workArea.y, workArea.y + workArea.height - PEER_WINDOW_HEIGHT),
    width: PEER_WINDOW_WIDTH,
    height: PEER_WINDOW_HEIGHT
  };
}

function normalizeUniquePeers(peers) {
  const peersByUserId = new Map();
  for (const peer of peers || []) {
    if (!peer || !peer.userId) continue;
    peersByUserId.set(peer.userId, {
      userId: peer.userId,
      nickname: peer.nickname || peer.userId,
      pet: peer.pet || {}
    });
  }
  return Array.from(peersByUserId.values());
}

function wantsLive2D(peer) {
  return Boolean(peer?.pet?.appearanceType === 'live2d' && peer.pet.modelId);
}

function decoratePeersForRender(peers, maxLive2DWindows = MAX_PEER_LIVE2D_WINDOWS) {
  let live2DCount = 0;
  return peers.map((peer) => {
    const useLive2D = wantsLive2D(peer) && live2DCount < maxLive2DWindows;
    if (useLive2D) {
      live2DCount += 1;
    }
    return {
      ...peer,
      renderMode: useLive2D ? 'live2d' : 'css-cat'
    };
  });
}

function createPeerWindow({ BrowserWindow, peerPetFile, peerPetPreload }) {
  const windowOptions = {
    width: PEER_WINDOW_WIDTH,
    height: PEER_WINDOW_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };

  if (peerPetPreload) {
    windowOptions.webPreferences.preload = peerPetPreload;
  }

  const window = new BrowserWindow(windowOptions);
  if (typeof window.setIgnoreMouseEvents === 'function') {
    window.setIgnoreMouseEvents(true, { forward: true });
  }
  if (typeof window.setAlwaysOnTop === 'function') {
    window.setAlwaysOnTop(true, 'floating');
  }
  window.loadFile(peerPetFile);
  return window;
}

function sendPeerUpdate(entry) {
  if (!entry.window || entry.window.isDestroyed()) return;
  entry.window.webContents.send('peer-pet:update', entry.peer);
}

function createPeerPetWindowManager({
  BrowserWindow,
  screen,
  peerPetFile,
  peerPetPreload
}) {
  const windowsByUserId = new Map();

  function ensureWindow(peer) {
    let entry = windowsByUserId.get(peer.userId);
    if (entry && entry.window.isDestroyed()) {
      windowsByUserId.delete(peer.userId);
      entry = null;
    }

    if (!entry) {
      const window = createPeerWindow({ BrowserWindow, peerPetFile, peerPetPreload });
      entry = { window, peer };
      windowsByUserId.set(peer.userId, entry);

      if (window.webContents && typeof window.webContents.once === 'function') {
        window.webContents.once('did-finish-load', () => sendPeerUpdate(entry));
      }
    }

    return entry;
  }

  function syncPeers(peers, anchorBounds) {
    const uniquePeers = decoratePeersForRender(normalizeUniquePeers(peers));
    const activeUserIds = new Set();

    for (let index = 0; index < uniquePeers.length; index += 1) {
      const peer = uniquePeers[index];
      activeUserIds.add(peer.userId);

      const entry = ensureWindow(peer);
      entry.peer = peer;
      entry.window.setBounds(resolvePeerBounds(anchorBounds, screen, index, uniquePeers.length));
      sendPeerUpdate(entry);
    }

    for (const [userId, entry] of windowsByUserId) {
      if (activeUserIds.has(userId)) continue;
      if (!entry.window.isDestroyed()) {
        entry.window.close();
      }
      windowsByUserId.delete(userId);
    }
  }

  function destroyAll() {
    for (const entry of windowsByUserId.values()) {
      if (!entry.window.isDestroyed()) {
        entry.window.close();
      }
    }
    windowsByUserId.clear();
  }

  return {
    syncPeers,
    destroyAll
  };
}

module.exports = {
  MAX_PEER_LIVE2D_WINDOWS,
  createPeerPetWindowManager,
  decoratePeersForRender,
  resolveLocalPetAnchorBounds,
  resolvePeerBounds
};
