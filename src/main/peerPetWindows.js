const { normalizeCatScale } = require('../renderer/petBehavior');

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
  const scale = normalizeCatScale(windowBounds.scale);
  const stageX = windowBounds.x + Math.round((windowBounds.width - LOCAL_STAGE_WIDTH) / 2);
  const stageY = windowBounds.y + windowBounds.height - LOCAL_STAGE_BOTTOM_PADDING - LOCAL_STAGE_HEIGHT;
  const scaledStageX = stageX + (LOCAL_STAGE_WIDTH - LOCAL_STAGE_WIDTH * scale) / 2;
  const scaledStageY = stageY + LOCAL_STAGE_HEIGHT - LOCAL_STAGE_HEIGHT * scale;

  return {
    x: Math.round(scaledStageX + LOCAL_CAT_OFFSET_X_IN_STAGE * scale),
    y: Math.round(scaledStageY + LOCAL_CAT_OFFSET_Y_IN_STAGE * scale),
    width: Math.round(LOCAL_CAT_WIDTH * scale),
    height: Math.round(LOCAL_CAT_HEIGHT * scale)
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
  const rawY = anchor.y + anchor.height - PEER_WINDOW_HEIGHT;

  return {
    x: clamp(rawX, workArea.x, workArea.x + workArea.width - PEER_WINDOW_WIDTH),
    y: clamp(rawY, workArea.y, workArea.y + workArea.height - PEER_WINDOW_HEIGHT),
    width: PEER_WINDOW_WIDTH,
    height: PEER_WINDOW_HEIGHT
  };
}

function normalizeDragPoint(point) {
  if (!point || !Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) {
    return null;
  }
  return {
    screenX: Math.round(point.screenX),
    screenY: Math.round(point.screenY)
  };
}

function clampWindowBoundsToDisplay(bounds, screen) {
  const display = getAnchorDisplay(screen, bounds);
  const workArea = display.workArea;
  return {
    ...bounds,
    x: clamp(bounds.x, workArea.x, workArea.x + workArea.width - bounds.width),
    y: clamp(bounds.y, workArea.y, workArea.y + workArea.height - bounds.height)
  };
}

function normalizeUniquePeers(peers) {
  const peersByUserId = new Map();
  for (const peer of peers || []) {
    if (!peer || peer.userId === undefined || peer.userId === null) continue;
    const userId = String(peer.userId).trim();
    if (!userId) continue;
    peersByUserId.set(userId, {
      userId,
      nickname: peer.nickname || userId,
      pet: peer.pet || {}
    });
  }
  return Array.from(peersByUserId.values());
}

function orderPeersForStableLayout(peers, windowsByUserId) {
  const peersByUserId = new Map(peers.map((peer) => [peer.userId, peer]));
  const orderedPeers = [];

  for (const userId of windowsByUserId.keys()) {
    const peer = peersByUserId.get(userId);
    if (!peer) continue;
    orderedPeers.push(peer);
    peersByUserId.delete(userId);
  }

  orderedPeers.push(...peersByUserId.values());
  return orderedPeers;
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
  const manualBoundsByUserId = new Map();
  const dragSessionsByUserId = new Map();

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
    const uniquePeers = decoratePeersForRender(orderPeersForStableLayout(
      normalizeUniquePeers(peers),
      windowsByUserId
    ));
    const activeUserIds = new Set();

    for (let index = 0; index < uniquePeers.length; index += 1) {
      const peer = uniquePeers[index];
      activeUserIds.add(peer.userId);

      const entry = ensureWindow(peer);
      entry.peer = peer;
      const manualBounds = manualBoundsByUserId.get(peer.userId);
      entry.window.setBounds(
        manualBounds || resolvePeerBounds(anchorBounds, screen, index, uniquePeers.length)
      );
      sendPeerUpdate(entry);
    }

    for (const [userId, entry] of windowsByUserId) {
      if (activeUserIds.has(userId)) continue;
      if (!entry.window.isDestroyed()) {
        entry.window.close();
      }
      windowsByUserId.delete(userId);
      manualBoundsByUserId.delete(userId);
      dragSessionsByUserId.delete(userId);
    }
  }

  function beginPeerDrag(userId, point) {
    const normalizedUserId = String(userId || '').trim();
    const dragPoint = normalizeDragPoint(point);
    const entry = windowsByUserId.get(normalizedUserId);
    if (!entry || entry.window.isDestroyed() || !dragPoint || typeof entry.window.getBounds !== 'function') {
      return false;
    }

    dragSessionsByUserId.set(normalizedUserId, {
      startPoint: dragPoint,
      startBounds: entry.window.getBounds()
    });
    return true;
  }

  function movePeerDrag(userId, point) {
    const normalizedUserId = String(userId || '').trim();
    const dragPoint = normalizeDragPoint(point);
    const session = dragSessionsByUserId.get(normalizedUserId);
    const entry = windowsByUserId.get(normalizedUserId);
    if (!entry || entry.window.isDestroyed() || !session || !dragPoint) {
      return false;
    }

    const nextBounds = clampWindowBoundsToDisplay({
      ...session.startBounds,
      x: session.startBounds.x + dragPoint.screenX - session.startPoint.screenX,
      y: session.startBounds.y + dragPoint.screenY - session.startPoint.screenY
    }, screen);
    manualBoundsByUserId.set(normalizedUserId, nextBounds);
    entry.window.setBounds(nextBounds);
    return true;
  }

  function endPeerDrag(userId) {
    const normalizedUserId = String(userId || '').trim();
    const hadSession = dragSessionsByUserId.delete(normalizedUserId);
    return hadSession;
  }

  function destroyAll() {
    for (const entry of windowsByUserId.values()) {
      if (!entry.window.isDestroyed()) {
        entry.window.close();
      }
    }
    windowsByUserId.clear();
    manualBoundsByUserId.clear();
    dragSessionsByUserId.clear();
  }

  return {
    syncPeers,
    beginPeerDrag,
    movePeerDrag,
    endPeerDrag,
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
