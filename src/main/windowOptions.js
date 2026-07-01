function createPetWindowOptions({ preloadPath }) {
  return {
    width: 300,
    height: 360,
    minWidth: 260,
    minHeight: 320,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    acceptFirstMouse: true,
    autoHideMenuBar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  };
}

function getAlwaysOnTopPolicy() {
  return {
    flag: true,
    level: 'screen-saver',
    relativeLevel: 1
  };
}

module.exports = {
  createPetWindowOptions,
  getAlwaysOnTopPolicy
};
