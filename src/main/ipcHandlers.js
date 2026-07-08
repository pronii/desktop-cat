const { normalizeCatScale } = require('../renderer/petBehavior');

function registerMainIpcHandlers({
  ipcMain,
  waterReminder,
  live2DAppearance,
  pendingUpdatePrompts,
  setupRoomClient,
  // License activation is disabled for this version; keep the hook commented for quick restore.
  // setupLicenseClient,
  getAutoLaunchController,
  getPetWindow,
  updateTrayMenu,
  appendLive2DDiagnostic,
  onDragModeEnter,
  onDragModeMove,
  onDragModeExit,
  onPeerPetDragStart,
  onPeerPetDragMove,
  onPeerPetDragEnd,
  setClickThrough,
  setCurrentCatScale,
  syncCurrentRoomPeersBesideLocal
} = {}) {
  if (!ipcMain) {
    throw new Error('ipcMain is required');
  }

  ipcMain.handle('water-reminder:get-config', () => waterReminder.getConfig());

  ipcMain.handle('water-reminder:toggle', () => {
    const enabled = waterReminder.toggleEnabled();
    updateTrayMenu?.(getPetWindow?.());
    return enabled;
  });

  ipcMain.handle('water-reminder:add-task', (_event, task) => {
    return waterReminder.addTaskReminder(task);
  });

  ipcMain.handle('water-reminder:remove-task', (_event, taskId) => {
    return waterReminder.removeTaskReminder(taskId);
  });

  ipcMain.handle('water-reminder:toggle-task', (_event, taskId) => {
    return waterReminder.toggleTaskEnabled(taskId);
  });

  ipcMain.handle('water-reminder:set-interval', (_event, minutes) => {
    return waterReminder.setIntervalMinutes(minutes);
  });

  ipcMain.handle('water-reminder:set-task-interval', (_event, taskId, minutes) => {
    return waterReminder.setTaskIntervalMinutes(taskId, minutes);
  });

  ipcMain.handle('water-reminder:set-task-scheduled-at', (_event, taskId, scheduledAt) => {
    return waterReminder.setTaskScheduledAt(taskId, scheduledAt);
  });

  ipcMain.handle('water-reminder:set-task-name', (_event, taskId, taskName) => {
    return waterReminder.setTaskName(taskId, taskName);
  });

  ipcMain.handle('water-reminder:record-drink', () => waterReminder.recordDrink());

  ipcMain.handle('water-reminder:snooze', () => {
    return waterReminder.snooze();
  });

  ipcMain.handle('water-reminder:snooze-task', (_event, taskId) => {
    return waterReminder.snoozeTask(taskId);
  });

  ipcMain.handle('water-reminder:complete-task', (_event, taskId) => {
    return waterReminder.completeTask(taskId);
  });

  ipcMain.handle('water-reminder:test-trigger', () => {
    waterReminder.fire();
    return true;
  });

  ipcMain.handle('appearance:get-live2d-model', () => {
    return live2DAppearance.getCurrentModel();
  });

  ipcMain.handle('appearance:get-live2d-models', () => {
    return live2DAppearance.getAvailableModels();
  });

  ipcMain.handle('appearance:set-live2d-model', (_event, modelId) => {
    return live2DAppearance.setCurrentModel(modelId);
  });

  ipcMain.handle('peer-live2d:get-model-by-id', (_event, modelId) => {
    return live2DAppearance.getModelById(modelId);
  });

  ipcMain.handle('peer-live2d:get-default-model', () => {
    return live2DAppearance.getCurrentModel();
  });

  ipcMain.on('diagnostics:live2d-log', (_event, entry = {}) => {
    appendLive2DDiagnostic?.(entry);
  });

  ipcMain.handle('update:respond', (_event, payload = {}) => {
    const prompt = pendingUpdatePrompts.get(payload.id);
    if (!prompt) {
      return false;
    }
    pendingUpdatePrompts.delete(payload.id);
    prompt.resolve(payload.response === 'primary');
    return true;
  });

  ipcMain.handle('room:get-state', () => {
    const roomClient = setupRoomClient();
    return roomClient.getState();
  });

  ipcMain.handle('room:join', (_event, payload = {}) => {
    const roomClient = setupRoomClient();
    return roomClient.join({
      roomCode: payload.roomCode,
      nickname: payload.nickname
    });
  });

  ipcMain.handle('room:leave', () => {
    const roomClient = setupRoomClient();
    return roomClient.leave();
  });

  /* License activation is disabled for this version.
  ipcMain.handle('license:get-state', () => {
    const client = setupLicenseClient();
    return client.getState();
  });

  ipcMain.handle('license:activate', async (_event, licenseKey) => {
    const client = setupLicenseClient();
    return client.activate(licenseKey);
  });

  ipcMain.handle('license:check', async () => {
    const client = setupLicenseClient();
    return client.check();
  });
  */
  ipcMain.handle('auto-launch:get-state', () => {
    return getAutoLaunchController().getState();
  });

  ipcMain.handle('auto-launch:set-enabled', (_event, enabled) => {
    return getAutoLaunchController().setEnabled(enabled);
  });

  ipcMain.on('drag-mode:enter', (_event, point) => {
    onDragModeEnter?.(point);
  });

  ipcMain.on('drag-mode:move', (_event, point) => {
    onDragModeMove?.(point);
  });

  ipcMain.on('drag-mode:exit', () => {
    onDragModeExit?.();
  });

  ipcMain.on('peer-pet:drag-start', (_event, payload = {}) => {
    onPeerPetDragStart?.(payload);
  });

  ipcMain.on('peer-pet:drag-move', (_event, payload = {}) => {
    onPeerPetDragMove?.(payload);
  });

  ipcMain.on('peer-pet:drag-end', (_event, payload = {}) => {
    onPeerPetDragEnd?.(payload);
  });

  ipcMain.on('pet:set-scale', (_event, scale) => {
    setCurrentCatScale?.(normalizeCatScale(scale));
    syncCurrentRoomPeersBesideLocal?.();
  });

  ipcMain.on('window:set-click-through', (_event, enabled) => {
    const petWindow = getPetWindow?.();
    if (!petWindow || petWindow.isDestroyed()) return;
    setClickThrough?.(petWindow, enabled);
  });

  return {
    ipcMain
  };
}

module.exports = {
  registerMainIpcHandlers
};
