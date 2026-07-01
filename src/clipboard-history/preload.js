const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipboardHistoryAPI', {
  getItems: () => ipcRenderer.invoke('clipboard-history:get-items'),
  clearHistory: () => ipcRenderer.invoke('clipboard-history:clear'),
  removeItem: (id) => ipcRenderer.invoke('clipboard-history:removeById', id),
  copyItem: (id) => ipcRenderer.invoke('clipboard-history:copy', id),
  getState: () => ipcRenderer.invoke('clipboard-history:get-state'),
  setPaused: (paused) => ipcRenderer.invoke('clipboard-history:set-paused', paused),
  onNewItem: (callback) => {
    const listener = (_event, item) => callback(item);
    ipcRenderer.on('clipboard-history:new-item', listener);
    return () => {
      ipcRenderer.removeListener('clipboard-history:new-item', listener);
    };
  },
  onStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('clipboard-history:state-changed', listener);
    return () => {
      ipcRenderer.removeListener('clipboard-history:state-changed', listener);
    };
  }
});
