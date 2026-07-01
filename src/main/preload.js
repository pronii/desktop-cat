const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopCat', {
  clipboardHistory: {
    getAll: () => ipcRenderer.invoke('clipboard-history:get-items'),
    copy: (id) => ipcRenderer.invoke('clipboard-history:copy', id),
    removeById: (id) => ipcRenderer.invoke('clipboard-history:removeById', id),
    clear: () => ipcRenderer.invoke('clipboard-history:clear'),
    onNewItem: (callback) => {
      const handler = (_event, item) => callback(item);
      ipcRenderer.on('clipboard-history:new-item', handler);
      return () => ipcRenderer.removeListener('clipboard-history:new-item', handler);
    }
  }
});
