const path = require('node:path');
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

let petWindow = null;
let tray = null;
let topmostTimer = null;
let hideTimer = null;
let topmostSuspended = false;
let topmostChecking = false;
let petMenuState = createPetMenuState();
let temporaryHideState = createTemporaryHideState();
let topmostSuspendState = createTopmostSuspendState();

function centerWindowOnScreen(window) {
  const bounds = window.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const next = centerInWorkArea(bounds, display.workArea);
  window.setPosition(next.x, next.y, false);
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

  if (topmostSuspended) {
    suspendWindowTopmost(window);
    return;
  }

  keepWindowOnTop(window);
}

function startTopmostWatch(window) {
  window.on('show', () => {
    refreshTopmost(window);
  });
  window.on('focus', () => {
    refreshTopmost(window);
  });
  window.on('blur', () => {
    refreshTopmost(window);
  });
  window.on('restore', () => {
    refreshTopmost(window);
  });

  topmostTimer = setInterval(() => {
    refreshTopmost(window);
  }, 500);
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
      actions: {
        toggleAlwaysOnTop: () => togglePetAlwaysOnTop(window),
        centerOnScreen: () => centerWindowOnScreen(window),
        hideTemporarily: () => hideWindowTemporarily(window),
        openClipboardHistory: () => openHistoryWindow(path.join(__dirname, '..', 'clipboard-history', 'preload.js'))
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
      actions: {
        showPet: () => showPetWindow(window),
        hideTemporarily: () => hideWindowTemporarily(window),
        toggleAlwaysOnTop: () => togglePetAlwaysOnTop(window),
        openClipboardHistory: () => openHistoryWindow(path.join(__dirname, '..', 'clipboard-history', 'preload.js'))
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
    topmostTimer = null;
    hideTimer = null;
    topmostSuspended = false;
    topmostChecking = false;
    temporaryHideState = createTemporaryHideState();
    topmostSuspendState = createTopmostSuspendState();
    petWindow = null;
  });
}

function suspendWindowTopmost(window) {
  if (!window || window.isDestroyed()) return;
  window.setAlwaysOnTop(false);
}

app.whenReady().then(() => {
  initClipboardHistory({
    preloadPath: path.join(__dirname, '..', 'clipboard-history', 'preload.js')
  });
  createPetWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
    }
  });
});

app.on('before-quit', () => {
  teardownClipboardHistory();
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
