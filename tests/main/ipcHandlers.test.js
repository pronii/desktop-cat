const assert = require('node:assert/strict');
const test = require('node:test');

const { registerMainIpcHandlers } = require('../../src/main/ipcHandlers');

function createIpcMainStub() {
  const handles = new Map();
  const listeners = new Map();

  return {
    handles,
    listeners,
    handle(name, fn) {
      handles.set(name, fn);
    },
    on(name, fn) {
      listeners.set(name, fn);
    }
  };
}

test('registerMainIpcHandlers wires the main process IPC surface', () => {
  const ipcMain = createIpcMainStub();
  const pendingUpdatePrompts = new Map();
  const waterReminder = {
    getConfig: () => ({ enabled: true }),
    toggleEnabled: () => false,
    addTaskReminder: (task) => ({ id: 'task-1', ...task }),
    removeTaskReminder: () => true,
    toggleTaskEnabled: () => true,
    setIntervalMinutes: () => true,
    setTaskIntervalMinutes: () => true,
    setTaskScheduledAt: () => true,
    setTaskName: () => true,
    recordDrink: () => 1,
    snooze: () => true,
    snoozeTask: () => true,
    completeTask: () => true,
    fire: () => true
  };
  const live2DAppearance = {
    getCurrentModel: () => ({ available: false }),
    getAvailableModels: () => [],
    setCurrentModel: () => ({ available: false }),
    getModelById: (modelId) => ({ id: modelId, available: true })
  };
  const roomClient = {
    getState: () => ({ status: 'disconnected' }),
    join: (payload) => ({ status: 'connecting', ...payload }),
    leave: () => ({ status: 'disconnected' })
  };
  const licenseClient = {
    getState: () => ({ status: 'none' }),
    activate: async (licenseKey) => ({ status: 'active', licenseKey }),
    check: async () => ({ status: 'active' })
  };
  const autoLaunchController = {
    getState: () => ({ enabled: true }),
    setEnabled: (enabled) => ({ enabled })
  };
  const petWindow = {
    isDestroyed: () => false,
    isMinimized: () => false,
    restore() {},
    focus() {},
    webContents: {
      send() {}
    }
  };
  let dragModeEnterPoint = null;
  let dragModeMovePoint = null;
  let dragModeExited = false;
  let peerPetDragStart = null;
  let peerPetDragMove = null;
  let peerPetDragEnd = null;
  let clickThroughWindow = null;
  let clickThroughEnabled = null;
  let currentCatScale = 1;
  let roomPanelOpened = false;
  let historyPanelOpened = false;
  let trayMenuUpdated = false;
  let updatesRequested = 0;
  const diagnostics = [];

  registerMainIpcHandlers({
    ipcMain,
    waterReminder,
    live2DAppearance,
    pendingUpdatePrompts,
    setupRoomClient() {
      return roomClient;
    },
    setupLicenseClient() {
      return licenseClient;
    },
    getAutoLaunchController() {
      return autoLaunchController;
    },
    getPetWindow: () => petWindow,
    showPetWindow() {},
    updateTrayMenu() {
      trayMenuUpdated = true;
    },
    appendLive2DDiagnostic(entry) {
      diagnostics.push(entry);
    },
    openRoomPanel() {
      roomPanelOpened = true;
    },
    openHistoryWindow() {
      historyPanelOpened = true;
    },
    checkForUpdates() {
      updatesRequested += 1;
    },
    onDragModeEnter(point) {
      dragModeEnterPoint = point;
    },
    onDragModeMove(point) {
      dragModeMovePoint = point;
    },
    onDragModeExit() {
      dragModeExited = true;
    },
    onPeerPetDragStart(payload) {
      peerPetDragStart = payload;
    },
    onPeerPetDragMove(payload) {
      peerPetDragMove = payload;
    },
    onPeerPetDragEnd(payload) {
      peerPetDragEnd = payload;
    },
    setClickThrough(window, enabled) {
      clickThroughWindow = window;
      clickThroughEnabled = enabled;
    },
    setCurrentCatScale(scale) {
      currentCatScale = scale;
    },
    getCurrentCatScale() {
      return currentCatScale;
    }
  });

  assert.deepEqual(
    [...ipcMain.handles.keys()].sort(),
    [
      'appearance:get-live2d-model',
      'appearance:get-live2d-models',
      'appearance:set-live2d-model',
      'auto-launch:get-state',
      'auto-launch:set-enabled',
      'license:activate',
      'license:check',
      'license:get-state',
      'room:get-state',
      'room:join',
      'room:leave',
      'update:respond',
      'water-reminder:add-task',
      'water-reminder:complete-task',
      'water-reminder:get-config',
      'water-reminder:record-drink',
      'water-reminder:remove-task',
      'water-reminder:set-interval',
      'water-reminder:set-task-interval',
      'water-reminder:set-task-name',
      'water-reminder:set-task-scheduled-at',
      'water-reminder:snooze',
      'water-reminder:snooze-task',
      'water-reminder:test-trigger',
      'water-reminder:toggle',
      'water-reminder:toggle-task',
      'peer-live2d:get-default-model',
      'peer-live2d:get-model-by-id'
    ].sort()
  );

  assert.deepEqual(
    [...ipcMain.listeners.keys()].sort(),
    [
      'diagnostics:live2d-log',
      'drag-mode:enter',
      'drag-mode:exit',
      'drag-mode:move',
      'pet:set-scale',
      'peer-pet:drag-end',
      'peer-pet:drag-move',
      'peer-pet:drag-start',
      'window:set-click-through'
    ].sort()
  );

  pendingUpdatePrompts.set('prompt-1', {
    resolve: (value) => {
      pendingUpdatePrompts.set('resolved', value);
    }
  });

  assert.equal(ipcMain.handles.get('water-reminder:toggle')(), false);
  assert.equal(ipcMain.handles.get('room:join')(null, { roomCode: '123456', nickname: 'Alice' }).roomCode, '123456');
  assert.equal(ipcMain.handles.get('license:get-state')().status, 'none');
  assert.equal(ipcMain.handles.get('peer-live2d:get-model-by-id')(null, 'cat-1').id, 'cat-1');
  assert.equal(ipcMain.handles.get('auto-launch:set-enabled')(null, true).enabled, true);
  assert.equal(ipcMain.handles.get('update:respond')(null, { id: 'prompt-1', response: 'primary' }), true);
  assert.equal(pendingUpdatePrompts.get('resolved'), true);

  ipcMain.listeners.get('drag-mode:enter')(null, { x: 10, y: 20 });
  ipcMain.listeners.get('drag-mode:move')(null, { x: 15, y: 25 });
  ipcMain.listeners.get('drag-mode:exit')();
  ipcMain.listeners.get('peer-pet:drag-start')(null, { userId: 'bob', screenX: 10, screenY: 20 });
  ipcMain.listeners.get('peer-pet:drag-move')(null, { userId: 'bob', screenX: 30, screenY: 40 });
  ipcMain.listeners.get('peer-pet:drag-end')(null, { userId: 'bob' });
  ipcMain.listeners.get('window:set-click-through')(null, true);
  ipcMain.listeners.get('pet:set-scale')(null, 1.2);
  ipcMain.listeners.get('diagnostics:live2d-log')(null, { message: 'hello' });

  assert.deepEqual(dragModeEnterPoint, { x: 10, y: 20 });
  assert.deepEqual(dragModeMovePoint, { x: 15, y: 25 });
  assert.equal(dragModeExited, true);
  assert.deepEqual(peerPetDragStart, { userId: 'bob', screenX: 10, screenY: 20 });
  assert.deepEqual(peerPetDragMove, { userId: 'bob', screenX: 30, screenY: 40 });
  assert.deepEqual(peerPetDragEnd, { userId: 'bob' });
  assert.equal(clickThroughWindow, petWindow);
  assert.equal(clickThroughEnabled, true);
  assert.equal(currentCatScale, 1.2);
  assert.equal(trayMenuUpdated, true);
  assert.equal(updatesRequested, 0);
  assert.equal(roomPanelOpened, false);
  assert.equal(historyPanelOpened, false);
  assert.deepEqual(diagnostics, [{ message: 'hello' }]);
});
