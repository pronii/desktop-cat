const path = require('node:path');
const crypto = require('node:crypto');
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  screen,
  ipcMain
} = require('electron');
const { centerInWorkArea } = require('./windowMovement');
const {
  createPetWindowOptions,
  getAlwaysOnTopPolicy
} = require('./windowOptions');
const {
  createTopmostSuspendState,
  probeForegroundWindow,
  resolveTopmostSuspend,
  shouldSuspendTopmost
} = require('./fullscreenGuard');
const {
  createPetContextMenuTemplate,
  createPetMenuState,
  toggleAlwaysOnTop
} = require('./menuState');
const {
  clearTemporaryHide,
  createTemporaryHideState,
  enforceTemporaryHide,
  revealTemporaryHiddenWindow,
  startTemporaryHide
} =
require('./windowVisibility');
const {
  createTrayIconDataUrl,
  createTrayMenuTemplate
} = require('./trayMenu');
const { initClipboardHistory, openHistoryWindow, teardownClipboardHistory } = require('../clipboard-history/main');
const { getForegroundProbeWorker } = require('./foregroundWorker');
const { createWaterReminder } = require('./waterReminder');
const { createRoomClient, DEFAULT_ROOM_ENDPOINT } = require('./roomClient');
const { SimpleWebSocket } = require('./simpleWebSocket');
const { createPeerPetWindowManager } = require('./peerPetWindows');

const TOPMOST_FAST_INTERVAL = 500;
const TOPMOST_CALM_INTERVAL = 3000;
const CALM_THRESHOLD = 4;

let petWindow = null;
let tray = null;
let topmostTimer = null;
let hideTimer = null;
let topmostSuspended = false;
let topmostChecking = false;
let displayChangeTeardown = null;
let calmProbes = 0;
let currentTopmostInterval = TOPMOST_FAST_INTERVAL;
let petMenuState = createPetMenuState();
let temporaryHideState = createTemporaryHideState();
let topmostSuspendState = createTopmostSuspendState();
let waterReminder = createWaterReminder();
let roomClient = null;
let roomStateTeardown = null;
let roomPetStateTimer = null;
let roomUserId = `cat-${crypto.randomUUID()}`;
let peerPetWindowManager = null;

function centerWindowOnScreen(window) {
  const bounds = window.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const next = centerInWorkArea(bounds, display.workArea);
  window.setPosition(next.x, next.y, false);
}

let displayRecoveryTimer = null;

function recoverWindowIntoWorkArea(window) {
  if (!window || window.isDestroyed()) return;

  const bounds = window.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;

  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const inWorkArea =
    centerX >= workArea.x &&
    centerX <= workArea.x + workArea.width &&
    centerY >= workArea.y &&
    centerY <= workArea.y + workArea.height;

  if (!inWorkArea) {
    const next = centerInWorkArea(bounds, workArea);
    window.setPosition(next.x, next.y, false);
  }
}

function scheduleDisplayRecovery(window) {
  if (!window || window.isDestroyed()) return;
  if (displayRecoveryTimer) return;
  displayRecoveryTimer = setTimeout(() => {
    displayRecoveryTimer = null;
    recoverWindowIntoWorkArea(window);
  }, 200);
  if (typeof displayRecoveryTimer.unref === 'function') {
    displayRecoveryTimer.unref();
  }
}

function setupDisplayChangeHandlers(window) {
  const handler = () => scheduleDisplayRecovery(window);
  screen.on('display-added', handler);
  screen.on('display-removed', handler);
  screen.on('display-metrics-changed', handler);

  return () => {
    screen.removeListener('display-added', handler);
    screen.removeListener('display-removed', handler);
    screen.removeListener('display-metrics-changed', handler);
  };
}

function keepWindowOnTop(window) {
  if (!window || window.isDestroyed()) return;
  if (!petMenuState.alwaysOnTopEnabled) {
    window.setAlwaysOnTop(false);
    return;
  }

  const policy = getAlwaysOnTopPolicy();
  window.setAlwaysOnTop(policy.flag, policy.level, policy.relativeLevel);
  window.moveTop();
}

function getNativeWindowId(window) {
  const handle = window.getNativeWindowHandle();

  if (handle.length >= 8 && typeof handle.readBigUInt64LE === 'function') {
    return handle.readBigUInt64LE(0).toString();
  }

  return String(handle.readUInt32LE(0));
}

async function refreshTopmost(window) {
  if (!window || window.isDestroyed() || topmostChecking) return;
  if (enforceTemporaryHide(window, temporaryHideState)) return;

  if (!petMenuState.alwaysOnTopEnabled) {
    topmostSuspended = false;
    suspendWindowTopmost(window);
    return;
  }

  topmostChecking = true;

  try {
    const snapshot = await probeForegroundWindow();
    const detectedSuspend = shouldSuspendTopmost({
      foreground: snapshot?.foreground,
      windows: snapshot?.windows,
      display: snapshot?.display,
      petWindowId: getNativeWindowId(window),
      previousSuspend: topmostSuspended
    });
    topmostSuspended = resolveTopmostSuspend({
      state: topmostSuspendState,
      detectedSuspend
    });
  } catch (_error) {
    // Keep the previous topmost state when OS probing fails.
  } finally {
    topmostChecking = false;
  }

  if (enforceTemporaryHide(window, temporaryHideState)) return;

  applyAdaptiveInterval(window, topmostSuspended);

  if (topmostSuspended) {
    suspendWindowTopmost(window);
    return;
  }

  keepWindowOnTop(window);
}

function restartTopmostTimer(window, interval) {
  if (topmostTimer) {
    clearInterval(topmostTimer);
  }
  currentTopmostInterval = interval;
  topmostTimer = setInterval(() => {
    refreshTopmost(window);
  }, interval);
}

function applyAdaptiveInterval(window, suspended) {
  if (suspended) {
    calmProbes = 0;
    if (currentTopmostInterval !== TOPMOST_FAST_INTERVAL) {
      restartTopmostTimer(window, TOPMOST_FAST_INTERVAL);
    }
    return;
  }

  calmProbes += 1;
  if (
    calmProbes >= CALM_THRESHOLD &&
    currentTopmostInterval !== TOPMOST_CALM_INTERVAL
  ) {
    restartTopmostTimer(window, TOPMOST_CALM_INTERVAL);
  }
}

function resetToFastInterval(window) {
  calmProbes = 0;
  if (currentTopmostInterval !== TOPMOST_FAST_INTERVAL) {
    restartTopmostTimer(window, TOPMOST_FAST_INTERVAL);
  }
}

function startTopmostWatch(window) {
  window.on('show', () => {
    resetToFastInterval(window);
    refreshTopmost(window);
  });
  window.on('focus', () => {
    resetToFastInterval(window);
    refreshTopmost(window);
  });
  window.on('blur', () => {
    refreshTopmost(window);
  });
  window.on('restore', () => {
    resetToFastInterval(window);
    refreshTopmost(window);
  });

  restartTopmostTimer(window, TOPMOST_FAST_INTERVAL);
}

function hideWindowTemporarily(window, durationMs = 5 * 60 * 1000) {
  if (!window || window.isDestroyed()) return;

  if (hideTimer) {
    clearTimeout(hideTimer);
  }

  startTemporaryHide(temporaryHideState, durationMs);
  suspendWindowTopmost(window);
  window.hide();
  updateTrayMenu(window);
  hideTimer = setTimeout(() => {
    hideTimer = null;
    clearTemporaryHide(temporaryHideState);

    if (!window || window.isDestroyed()) return;
    window.showInactive();
    refreshTopmost(window);
  }, durationMs);

  if (typeof hideTimer.unref === 'function') {
    hideTimer.unref();
  }
}

function togglePetAlwaysOnTop(window) {
  petMenuState = toggleAlwaysOnTop(petMenuState);
  refreshTopmost(window);
  updateTrayMenu(window);
}

function showPetWindow(window, { center = true } = {}) {
  if (!window || window.isDestroyed()) return;

  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  if (center) {
    centerWindowOnScreen(window);
  }

  revealTemporaryHiddenWindow(window, temporaryHideState);
  refreshTopmost(window);
  updateTrayMenu(window);
}

function createPetContextMenu(window) {
  return Menu.buildFromTemplate(
    createPetContextMenuTemplate({
      state: petMenuState,
      waterReminderConfig: waterReminder.getConfig(),
      actions: {
        toggleAlwaysOnTop: () => togglePetAlwaysOnTop(window),
        centerOnScreen: () => centerWindowOnScreen(window),
        hideTemporarily: () => hideWindowTemporarily(window),
        openRoomPanel: () => openRoomPanel(window),
        openClipboardHistory: () => openHistoryWindow(path.join(__dirname, '..', 'clipboard-history', 'preload.js')),
        toggleWaterReminder: () => {
          const enabled = waterReminder.toggleEnabled();
          updateTrayMenu(window);
          return enabled;
        },
        testWaterReminder: () => waterReminder.fire()
      }
    })
  );
}

function createTrayImage() {
  const image = nativeImage.createFromDataURL(createTrayIconDataUrl());
  return image.resize({ width: 16, height: 16 });
}

function createTrayContextMenu(window) {
  return Menu.buildFromTemplate(
    createTrayMenuTemplate({
      state: petMenuState,
      waterReminderConfig: waterReminder.getConfig(),
      actions: {
        showPet: () => showPetWindow(window),
        hideTemporarily: () => hideWindowTemporarily(window),
        toggleAlwaysOnTop: () => togglePetAlwaysOnTop(window),
        openRoomPanel: () => openRoomPanel(window),
        openClipboardHistory: () => openHistoryWindow(path.join(__dirname, '..', 'clipboard-history', 'preload.js')),
        toggleWaterReminder: () => {
          const enabled = waterReminder.toggleEnabled();
          updateTrayMenu(window);
          return enabled;
        },
        testWaterReminder: () => waterReminder.fire()
      }
    })
  );
}

function updateTrayMenu(window) {
  if (!tray || !window || window.isDestroyed()) return;
  tray.setContextMenu(createTrayContextMenu(window));
}

function createApplicationTray(window) {
  if (tray) {
    updateTrayMenu(window);
    return;
  }

  tray = new Tray(createTrayImage());
  tray.setToolTip('desktop-cat');
  tray.on('click', () => {
    showPetWindow(window);
  });
  tray.on('double-click', () => {
    showPetWindow(window);
  });
  updateTrayMenu(window);
}

function createPetWindow() {
  petWindow = new BrowserWindow(
    createPetWindowOptions({
      preloadPath: path.join(__dirname, 'preload.js')
    })
  );

  keepWindowOnTop(petWindow);
  startTopmostWatch(petWindow);
  displayChangeTeardown = setupDisplayChangeHandlers(petWindow);
  createApplicationTray(petWindow);
  petWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  petWindow.once('ready-to-show', () => {
    petWindow.showInactive();
    refreshTopmost(petWindow);
  });

  petWindow.on('context-menu', () => {
    createPetContextMenu(petWindow).popup({ window: petWindow });
  });

  petWindow.on('closed', () => {
    clearInterval(topmostTimer);
    clearTimeout(hideTimer);
    if (displayRecoveryTimer) {
      clearTimeout(displayRecoveryTimer);
      displayRecoveryTimer = null;
    }
    if (displayChangeTeardown) {
      displayChangeTeardown();
      displayChangeTeardown = null;
    }
    topmostTimer = null;
    hideTimer = null;
    topmostSuspended = false;
    topmostChecking = false;
    calmProbes = 0;
    currentTopmostInterval = TOPMOST_FAST_INTERVAL;
    temporaryHideState = createTemporaryHideState();
    topmostSuspendState = createTopmostSuspendState();
    petWindow = null;
  });
}

function openRoomPanel(window) {
  if (!window || window.isDestroyed()) return;
  showPetWindow(window, { center: false });
  window.webContents.send('room:open-panel');
}

function sendRoomStateToRenderer(state) {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send('room:state-changed', state);
}

function syncPeerPetsBesideLocal(peers, localBounds) {
  if (!peerPetWindowManager) return;
  if (!localBounds) {
    peerPetWindowManager.destroyAll();
    return;
  }
  peerPetWindowManager.syncPeers(peers || [], localBounds);
}

function handleRoomStateChanged(state) {
  sendRoomStateToRenderer(state);
  if (!peerPetWindowManager) return;
  if (state.status === 'connected') {
    if (!petWindow || petWindow.isDestroyed()) {
      syncPeerPetsBesideLocal([], null);
      return;
    }
    syncPeerPetsBesideLocal(state.peers || [], petWindow.getBounds());
    return;
  }
  peerPetWindowManager.destroyAll();
}

function buildLocalPetState() {
  if (!petWindow || petWindow.isDestroyed()) return null;
  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;
  const relativeX = workArea.width > 0
    ? (bounds.x - workArea.x) / workArea.width
    : 0;
  const relativeY = workArea.height > 0
    ? (bounds.y - workArea.y) / workArea.height
    : 0;

  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    relativeX: Math.min(Math.max(relativeX, 0), 1),
    relativeY: Math.min(Math.max(relativeY, 0), 1),
    action: dragModeActive ? 'drag' : 'idle',
    facing: 'right'
  };
}

function startRoomPetStateReporting() {
  if (roomPetStateTimer) return;
  roomPetStateTimer = setInterval(() => {
    if (!roomClient) return;
    const petState = buildLocalPetState();
    if (petState) {
      roomClient.sendPetState(petState);
      const roomState = roomClient.getState();
      if (roomState.status === 'connected') {
        syncPeerPetsBesideLocal(roomState.peers, petState);
      }
    }
  }, 1000);
  if (typeof roomPetStateTimer.unref === 'function') {
    roomPetStateTimer.unref();
  }
}

function stopRoomPetStateReporting() {
  if (!roomPetStateTimer) return;
  clearInterval(roomPetStateTimer);
  roomPetStateTimer = null;
}

function setupRoomClient() {
  if (roomClient) return;
  if (!peerPetWindowManager) {
    peerPetWindowManager = createPeerPetWindowManager({
      BrowserWindow,
      screen,
      peerPetFile: path.join(__dirname, '..', 'renderer', 'peerPet.html'),
      peerPetPreload: path.join(__dirname, 'peerPreload.js')
    });
  }
  roomClient = createRoomClient({
    WebSocket: globalThis.WebSocket || SimpleWebSocket,
    endpoint: DEFAULT_ROOM_ENDPOINT,
    userId: roomUserId
  });
  roomStateTeardown = roomClient.onStateChanged(handleRoomStateChanged);
  startRoomPetStateReporting();
}

function teardownRoomClient() {
  stopRoomPetStateReporting();
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

function suspendWindowTopmost(window) {
  if (!window || window.isDestroyed()) return;
  window.setAlwaysOnTop(false);
}

/* --- 喝水提醒 IPC --- */

ipcMain.handle('water-reminder:get-config', () => waterReminder.getConfig());

ipcMain.handle('water-reminder:toggle', () => {
  const enabled = waterReminder.toggleEnabled();
  updateTrayMenu(petWindow);
  return enabled;
});

ipcMain.handle('water-reminder:set-interval', (_event, minutes) => {
  return waterReminder.setIntervalMinutes(minutes);
});

ipcMain.handle('water-reminder:record-drink', () => waterReminder.recordDrink());

ipcMain.handle('water-reminder:snooze', () => {
  // "下次再提醒"：停止了重试提醒，阻止 fire 重新调度
  return waterReminder.snooze();
});

ipcMain.handle('water-reminder:test-trigger', () => {
  waterReminder.fire();
  return true;
});

/* --- 好友同屏 IPC --- */

ipcMain.handle('room:get-state', () => {
  setupRoomClient();
  return roomClient.getState();
});

ipcMain.handle('room:join', (_event, payload = {}) => {
  setupRoomClient();
  return roomClient.join({
    roomCode: payload.roomCode,
    nickname: payload.nickname
  });
});

ipcMain.handle('room:leave', () => {
  setupRoomClient();
  return roomClient.leave();
});

/* --- 长按拖动 IPC --- */

let dragModeActive = false;
let dragOffset = { x: 0, y: 0 };
let dragTick = null;

ipcMain.on('drag-mode:enter', () => {
  if (!petWindow || petWindow.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const winBounds = petWindow.getBounds();
  dragOffset = { x: cursor.x - winBounds.x, y: cursor.y - winBounds.y };
  dragModeActive = true;

  if (dragTick) clearInterval(dragTick);
  // 每 16ms（约 60fps）跟随鼠标移动窗口
  dragTick = setInterval(() => {
    if (!dragModeActive || !petWindow || petWindow.isDestroyed()) {
      if (dragTick) clearInterval(dragTick);
      dragTick = null;
      return;
    }
    const cur = screen.getCursorScreenPoint();
    petWindow.setPosition(cur.x - dragOffset.x, cur.y - dragOffset.y);
  }, 16);
});

ipcMain.on('drag-mode:exit', () => {
  dragModeActive = false;
  if (dragTick) {
    clearInterval(dragTick);
    dragTick = null;
  }
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    if (petWindow.isMinimized()) petWindow.restore();
    showPetWindow(petWindow, { center: false });
    petWindow.focus();
  });

  app.whenReady().then(() => {
    getForegroundProbeWorker().start();
    initClipboardHistory({
      preloadPath: path.join(__dirname, '..', 'clipboard-history', 'preload.js')
    });
    waterReminder.start();
    setupRoomClient();
    createPetWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createPetWindow();
      }
    });
  });
}

app.on('before-quit', () => {
  waterReminder.stop();
  teardownRoomClient();
  teardownClipboardHistory();
  getForegroundProbeWorker().stop();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
