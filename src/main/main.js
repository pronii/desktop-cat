const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {
  app,
  BrowserWindow,
  dialog,
  Menu,
  Tray,
  nativeImage,
  protocol,
  screen,
  shell,
  ipcMain
} = require('electron');
const { autoUpdater } = require('electron-updater');
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
  createFullscreenHideState,
  createTemporaryHideState,
  enforceFullscreenVisibility,
  enforceTemporaryHide,
  revealTemporaryHiddenWindow,
  startTemporaryHide
} = require('./windowVisibility');
const {
  createTrayIconDataUrl,
  createTrayMenuTemplate
} = require('./trayMenu');
const { initClipboardHistory, openHistoryWindow, teardownClipboardHistory } = require('../clipboard-history/main');
const { getForegroundProbeWorker } = require('./foregroundWorker');
const { createWaterReminder } = require('./waterReminder');
const { createAutoLaunchController } = require('./autoLaunch');
const { createDeviceIdentity } = require('./deviceIdentity');
const { createRoomClient, resolveRoomEndpoint } = require('./roomClient');
const {
  createLicenseClient,
  resolveLicenseEndpoint
} = require('./licenseClient');
const { createOnlineClient } = require('./onlineClient');
const { buildLocalPetState: createLocalPetState } = require('./petState');
const { SimpleWebSocket } = require('./simpleWebSocket');
const {
  createUpdateManager,
  resolveUpdateConfig
} = require('./updateManager');
const {
  LIVE2D_PROTOCOL,
  createLive2DAppearance
} = require('./live2dAppearance');
const {
  createPeerPetWindowManager,
  resolveLocalPetAnchorBounds
} = require('./peerPetWindows');
const { CAT_SCALE_DEFAULT } = require('../renderer/petBehavior');
const { registerMainIpcHandlers } = require('./ipcHandlers');
const { createDragModeController } = require('./dragMode');

protocol.registerSchemesAsPrivileged([
  {
    scheme: LIVE2D_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

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
let fullscreenHideState = createFullscreenHideState();
let topmostSuspendState = createTopmostSuspendState();
let waterReminder = createWaterReminder();
let autoLaunchController = null;
let roomClient = null;
let roomStateTeardown = null;
let roomPetStateTimer = null;
let roomUserId = `cat-${crypto.randomUUID()}`;
let deviceIdentity = null;
let licenseClient = null;
let onlineClient = null;
let peerPetWindowManager = null;
let updateManager = null;
let currentCatScale = CAT_SCALE_DEFAULT;
const pendingUpdatePrompts = new Map();
const live2DAppearance = createLive2DAppearance({ app, protocol });
const dragMode = createDragModeController({
  getPetWindow: () => petWindow,
  getCursorScreenPoint: () => screen.getCursorScreenPoint()
});

function appendLive2DDiagnostic(entry = {}) {
  try {
    const logPath = path.join(app.getPath('userData'), 'live2d-diagnostics.log');
    const payload = {
      time: new Date().toISOString(),
      ...entry
    };
    const line = `${JSON.stringify(payload).slice(0, 12000)}\n`;
    fs.appendFile(logPath, line, () => {});
  } catch (_error) {
    // Diagnostics must never affect app behavior.
  }
}

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
    enforceFullscreenVisibility(window, fullscreenHideState, true);
    return;
  }

  enforceFullscreenVisibility(window, fullscreenHideState, false);
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
    dragMode.stop();
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
        testWaterReminder: () => waterReminder.fire(),
        checkForUpdates
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
        testWaterReminder: () => waterReminder.fire(),
        checkForUpdates
      }
    })
  );
}

function updateTrayMenu(window) {
  if (!tray || !window || window.isDestroyed()) return;
  tray.setContextMenu(createTrayContextMenu(window));
}

function checkForUpdates() {
  if (!updateManager) return;
  updateManager.checkNow({ userInitiated: true }).catch(() => {});
}

function requestUpdatePrompt(kind, payload = {}) {
  if (!petWindow || petWindow.isDestroyed()) {
    return Promise.resolve(false);
  }

  showPetWindow(petWindow, { center: false });

  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingUpdatePrompts.delete(id);
      resolve(false);
    }, 5 * 60 * 1000);
    if (typeof timeout.unref === 'function') {
      timeout.unref();
    }

    pendingUpdatePrompts.set(id, {
      resolve(value) {
        clearTimeout(timeout);
        resolve(value);
      }
    });

    petWindow.webContents.send('update:prompt', {
      id,
      kind,
      ...payload
    });
  });
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
    dragMode.stop();
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
    fullscreenHideState = createFullscreenHideState();
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

function getLocalPetLayoutBounds() {
  if (!petWindow || petWindow.isDestroyed()) return null;
  return {
    ...petWindow.getBounds(),
    scale: currentCatScale
  };
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
  sendRoomStateToRenderer(state);
  if (!peerPetWindowManager) return;
  if (state.status === 'connected') {
    if (!petWindow || petWindow.isDestroyed()) {
      syncPeerPetsBesideLocal([], null);
      return;
    }
    syncPeerPetsBesideLocal(state.peers || [], getLocalPetLayoutBounds());
    return;
  }
  peerPetWindowManager.destroyAll();
}

function buildLocalPetState() {
  return createLocalPetState({
    petWindow,
    screen,
    dragModeActive: dragMode.isActive(),
    catScale: currentCatScale,
    live2DAppearance
  });
}

function syncCurrentRoomPeersBesideLocal() {
  if (!roomClient || roomClient.getState().status !== 'connected') return;
  syncPeerPetsBesideLocal(roomClient.getState().peers || [], getLocalPetLayoutBounds());
}

function startRoomPetStateReporting() {
  if (roomPetStateTimer) return;
  roomPetStateTimer = setInterval(() => {
    if (!roomClient) return;
    const localLayoutBounds = getLocalPetLayoutBounds();
    const petState = buildLocalPetState();
    if (petState) {
      roomClient.sendPetState(petState);
      const roomState = roomClient.getState();
      if (roomState.status === 'connected') {
        syncPeerPetsBesideLocal(roomState.peers, localLayoutBounds);
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
    endpoint: resolveRoomEndpoint(),
    userId: roomUserId,
    deviceInfo: deviceIdentity || {}
  });
  roomStateTeardown = roomClient.onStateChanged(handleRoomStateChanged);
  startRoomPetStateReporting();
}

function setupLicenseClient() {
  if (licenseClient) return;
  licenseClient = createLicenseClient({
    endpoint: resolveLicenseEndpoint(process.env, resolveRoomEndpoint()),
    userDataPath: app.getPath('userData'),
    deviceInfo: deviceIdentity || {},
    fetch: globalThis.fetch
  });
}

function setupOnlineClient() {
  if (onlineClient) return;
  onlineClient = createOnlineClient({
    endpoint: resolveLicenseEndpoint(process.env, resolveRoomEndpoint()),
    deviceInfo: deviceIdentity || {},
    fetch: globalThis.fetch
  });
  onlineClient.start().catch(() => {});
}

function getAutoLaunchController() {
  if (!autoLaunchController) {
    autoLaunchController = createAutoLaunchController({
      app,
      userDataPath: app.getPath('userData')
    });
  }
  return autoLaunchController;
}

function setupAutoLaunch() {
  getAutoLaunchController().ensureDefaultEnabled();
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

function teardownOnlineClient() {
  if (!onlineClient) return;
  onlineClient.stop();
  onlineClient = null;
}

function suspendWindowTopmost(window) {
  if (!window || window.isDestroyed()) return;
  window.setAlwaysOnTop(false);
}

/* --- Drag mode IPC --- */

registerMainIpcHandlers({
  ipcMain,
  waterReminder,
  live2DAppearance,
  pendingUpdatePrompts,
  setupRoomClient: () => {
    setupRoomClient();
    return roomClient;
  },
  setupLicenseClient: () => {
    setupLicenseClient();
    return licenseClient;
  },
  getAutoLaunchController,
  getPetWindow: () => petWindow,
  updateTrayMenu,
  appendLive2DDiagnostic,
  onDragModeEnter: dragMode.enter,
  onDragModeMove: dragMode.move,
  onDragModeExit: dragMode.exit,
  setClickThrough: (window, enabled) => {
    window.setIgnoreMouseEvents(enabled, { forward: true });
  },
  setCurrentCatScale: (scale) => {
    currentCatScale = scale;
  },
  syncCurrentRoomPeersBesideLocal
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
    live2DAppearance.registerProtocol();
    getForegroundProbeWorker().start();
    initClipboardHistory({
      preloadPath: path.join(__dirname, '..', 'clipboard-history', 'preload.js')
    });
    waterReminder.start();
    deviceIdentity = createDeviceIdentity({
      userDataPath: app.getPath('userData'),
      appVersion: app.getVersion()
    });
    setupOnlineClient();
    setupLicenseClient();
    setupAutoLaunch();
    setupRoomClient();
    updateManager = createUpdateManager({
      app,
      dialog,
      shell,
      autoUpdater: app.isPackaged ? autoUpdater : null,
      fetch: globalThis.fetch,
      WebSocket: globalThis.WebSocket || SimpleWebSocket,
      promptForUpdate: (manifest) => requestUpdatePrompt('available', {
        version: manifest.version,
        notes: manifest.notes
      }),
      promptForRestart: (manifest) => requestUpdatePrompt('ready', {
        version: manifest.version
      }),
      ...resolveUpdateConfig()
    });
    updateManager.start();
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
  if (updateManager) {
    updateManager.stop();
    updateManager = null;
  }
  teardownRoomClient();
  teardownOnlineClient();
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
