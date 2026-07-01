const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopCat', {
  clipboardHistory: {
    getAll: () => ipcRenderer.invoke('clipboard-history:get-items'),
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
  }
});
