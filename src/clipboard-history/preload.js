const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipboardHistoryAPI', {
  getItems: () => ipcRenderer.invoke('clipboard-history:get-items'),
  clearHistory: () => ipcRenderer.invoke('clipboard-history:clear'),
  copyItem: (id) => ipcRenderer.invoke('clipboard-history:copy', id),
  onNewItem: (callback) => {
    const listener = (_event, item) => callback(item);
    ipcRenderer.on('clipboard-history:new-item', listener);
    return () => {
      ipcRenderer.removeListener('clipboard-history:new-item', listener);
    };
  }
});
