const path = require('node:path');
const os = require('node:os');
const { app, BrowserWindow, ipcMain } = require('electron');

app.setPath(
  'userData',
  path.join(os.tmpdir(), `desktop-cat-roam-smoke-${process.pid}`)
);

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  await app.whenReady();

  const nudgeEvents = [];
  const listener = (_event, offset) => {
    nudgeEvents.push(offset);
  };

  ipcMain.on('pet-window:nudge', listener);

  const window = new BrowserWindow({
    show: false,
    width: 240,
    height: 240,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await wait(4500);

  ipcMain.removeListener('pet-window:nudge', listener);
  console.log(
    JSON.stringify(
      {
        nudgeCount: nudgeEvents.length,
        firstNudge: nudgeEvents[0] || null
      },
      null,
      2
    )
  );

  window.close();
  app.quit();

  if (nudgeEvents.length < 1) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
