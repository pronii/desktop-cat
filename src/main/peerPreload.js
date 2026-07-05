const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('peerPet', {
  onUpdate: (callback) => {
    const handler = (_event, peer) => callback(peer);
    ipcRenderer.on('peer-pet:update', handler);
    return () => ipcRenderer.removeListener('peer-pet:update', handler);
  },
  getLive2DModelById: (modelId) => ipcRenderer.invoke('peer-live2d:get-model-by-id', modelId),
  getDefaultLive2DModel: () => ipcRenderer.invoke('peer-live2d:get-default-model')
});
