const PEER_WINDOW_WIDTH = 160;
const PEER_WINDOW_HEIGHT = 150;
const PEER_WINDOW_GAP = 12;

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
    const uniquePeers = normalizeUniquePeers(peers);
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
  createPeerPetWindowManager,
  resolvePeerBounds
};
