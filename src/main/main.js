const path = require('node:path');
const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
const { centerInWorkArea, clampToWorkArea } = require('./windowMovement');
const {
  createPetWindowOptions,
  getAlwaysOnTopPolicy
} = require('./windowOptions');
const {
  probeForegroundWindow,
  shouldSuspendTopmost
} = require('./fullscreenGuard');
const {
  createPetContextMenuTemplate,
  createPetMenuState,
  toggleAlwaysOnTop,
  toggleRoamingPaused
} = require('./menuState');

let petWindow = null;
let topmostTimer = null;
let hideTimer = null;
let topmostSuspended = false;
let topmostChecking = false;
let petMenuState = createPetMenuState();

function clampWindowToWorkArea(bounds, targetX, targetY) {
  const display = screen.getDisplayMatching(bounds);
  return clampToWorkArea(bounds, display.workArea, targetX, targetY);
}

function moveWindowTo(window, x, y) {
  const bounds = window.getBounds();
  const next = clampWindowToWorkArea(bounds, x, y);
  window.setPosition(next.x, next.y, false);
}

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

function suspendWindowTopmost(window) {
  if (!window || window.isDestroyed()) return;
  window.setAlwaysOnTop(false);
}

async function refreshTopmost(window) {
  if (!window || window.isDestroyed() || topmostChecking) return;

  if (!petMenuState.alwaysOnTopEnabled) {
    topmostSuspended = false;
    suspendWindowTopmost(window);
    return;
  }

  topmostChecking = true;

  try {
    const snapshot = await probeForegroundWindow();
    topmostSuspended = shouldSuspendTopmost({
      foreground: snapshot?.foreground,
      windows: snapshot?.windows,
      display: snapshot?.display,
      petWindowId: getNativeWindowId(window),
      previousSuspend: topmostSuspended
    });
  } catch (_error) {
    // Keep the previous topmost state when OS probing fails.
  } finally {
    topmostChecking = false;
  }

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
  }, 1000);
}

function sendRoamingPausedState(window) {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(
    'pet-controls:roaming-paused',
    petMenuState.roamingPaused
  );
}

function hideWindowTemporarily(window, durationMs = 5 * 60 * 1000) {
  if (!window || window.isDestroyed()) return;

  if (hideTimer) {
    clearTimeout(hideTimer);
  }

  window.hide();
  hideTimer = setTimeout(() => {
    hideTimer = null;

    if (!window || window.isDestroyed()) return;
    window.showInactive();
    refreshTopmost(window);
  }, durationMs);

  if (typeof hideTimer.unref === 'function') {
    hideTimer.unref();
  }
}

function togglePetRoaming(window) {
  petMenuState = toggleRoamingPaused(petMenuState);
  sendRoamingPausedState(window);
}

function togglePetAlwaysOnTop(window) {
  petMenuState = toggleAlwaysOnTop(petMenuState);
  refreshTopmost(window);
}

function createPetContextMenu(window) {
  return Menu.buildFromTemplate(
    createPetContextMenuTemplate({
      state: petMenuState,
      actions: {
        toggleRoamingPaused: () => togglePetRoaming(window),
        toggleAlwaysOnTop: () => togglePetAlwaysOnTop(window),
        centerOnScreen: () => centerWindowOnScreen(window),
        hideTemporarily: () => hideWindowTemporarily(window)
      }
    })
  );
}

function createPetWindow() {
  petWindow = new BrowserWindow(
    createPetWindowOptions({
      preloadPath: path.join(__dirname, 'preload.js')
    })
  );

  keepWindowOnTop(petWindow);
  startTopmostWatch(petWindow);
  petWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  petWindow.once('ready-to-show', () => {
    petWindow.showInactive();
    sendRoamingPausedState(petWindow);
    refreshTopmost(petWindow);
  });

  petWindow.webContents.on('context-menu', () => {
    createPetContextMenu(petWindow).popup({ window: petWindow });
  });

  petWindow.on('closed', () => {
    clearInterval(topmostTimer);
    clearTimeout(hideTimer);
    topmostTimer = null;
    hideTimer = null;
    topmostSuspended = false;
    topmostChecking = false;
    petWindow = null;
  });
}

app.whenReady().then(() => {
  createPetWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('pet-window:nudge', (event, offset) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;

  const bounds = window.getBounds();
  moveWindowTo(window, bounds.x + offset.x, bounds.y + offset.y);
});
