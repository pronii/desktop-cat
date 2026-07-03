const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopCat', {
  dragMode: {
    enter: () => ipcRenderer.send('drag-mode:enter'),
    exit: () => ipcRenderer.send('drag-mode:exit')
  },
  setClickThrough: (enabled) => ipcRenderer.send('window:set-click-through', enabled),
  appearance: {
    getLive2DModel: () => ipcRenderer.invoke('appearance:get-live2d-model'),
    getLive2DModels: () => ipcRenderer.invoke('appearance:get-live2d-models'),
    setLive2DModel: (modelId) => ipcRenderer.invoke('appearance:set-live2d-model', modelId)
  },
  waterReminder: {
    getConfig: () => ipcRenderer.invoke('water-reminder:get-config'),
    toggle: () => ipcRenderer.invoke('water-reminder:toggle'),
    addTaskReminder: (task) => ipcRenderer.invoke('water-reminder:add-task', task),
    removeTaskReminder: (taskId) => ipcRenderer.invoke('water-reminder:remove-task', taskId),
    toggleTask: (taskId) => ipcRenderer.invoke('water-reminder:toggle-task', taskId),
    setInterval: (minutes) => ipcRenderer.invoke('water-reminder:set-interval', minutes),
    setTaskInterval: (taskId, minutes) => ipcRenderer.invoke('water-reminder:set-task-interval', taskId, minutes),
    setTaskName: (taskId, taskName) => ipcRenderer.invoke('water-reminder:set-task-name', taskId, taskName),
    recordDrink: () => ipcRenderer.invoke('water-reminder:record-drink'),
    snooze: () => ipcRenderer.invoke('water-reminder:snooze'),
    snoozeTask: (taskId) => ipcRenderer.invoke('water-reminder:snooze-task', taskId),
    completeTask: (taskId) => ipcRenderer.invoke('water-reminder:complete-task', taskId),
    onTrigger: (callback) => {
      const handler = (_event, payload) => callback(payload || { type: 'water' });
      ipcRenderer.on('water-reminder:trigger', handler);
      return () => ipcRenderer.removeListener('water-reminder:trigger', handler);
    }
  },
  clipboardHistory: {
    getAll: (options) => ipcRenderer.invoke('clipboard-history:get-items', options),
    copy: (id) => ipcRenderer.invoke('clipboard-history:copy', id),
    removeById: (id) => ipcRenderer.invoke('clipboard-history:removeById', id),
    clear: () => ipcRenderer.invoke('clipboard-history:clear'),
    getState: () => ipcRenderer.invoke('clipboard-history:get-state'),
    setPaused: (paused) => ipcRenderer.invoke('clipboard-history:set-paused', paused),
    onNewItem: (callback) => {
      const handler = (_event, item) => callback(item);
      ipcRenderer.on('clipboard-history:new-item', handler);
      return () => ipcRenderer.removeListener('clipboard-history:new-item', handler);
    },
    onStateChanged: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on('clipboard-history:state-changed', handler);
      return () => ipcRenderer.removeListener('clipboard-history:state-changed', handler);
    }
  },
  room: {
    getState: () => ipcRenderer.invoke('room:get-state'),
    join: (roomCode, nickname) => ipcRenderer.invoke('room:join', { roomCode, nickname }),
    leave: () => ipcRenderer.invoke('room:leave'),
    onStateChanged: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on('room:state-changed', handler);
      return () => ipcRenderer.removeListener('room:state-changed', handler);
    },
    onOpenPanel: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('room:open-panel', handler);
      return () => ipcRenderer.removeListener('room:open-panel', handler);
    }
  }
});
