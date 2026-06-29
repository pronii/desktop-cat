const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopCat', {
  nudgeWindow(offset) {
    ipcRenderer.send('pet-window:nudge', offset);
  },
  onRoamingPausedChanged(callback) {
    const listener = (_event, paused) => {
      callback(Boolean(paused));
    };

    ipcRenderer.on('pet-controls:roaming-paused', listener);
    return () => {
      ipcRenderer.removeListener('pet-controls:roaming-paused', listener);
    };
  }
});
