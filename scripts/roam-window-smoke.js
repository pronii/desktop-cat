const path = require('node:path');
const os = require('node:os');
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { clampToWorkArea } = require('../src/main/windowMovement');

app.setPath(
  'userData',
  path.join(os.tmpdir(), `desktop-cat-roam-window-smoke-${process.pid}`)
);

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function moveWindowBy(window, offset) {
  const bounds = window.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const next = clampToWorkArea(
    bounds,
    display.workArea,
    bounds.x + Number(offset.x || 0),
    bounds.y + Number(offset.y || 0)
  );

  window.setPosition(next.x, next.y, false);
}

async function run() {
  await app.whenReady();

  const window = new BrowserWindow({
    show: false,
    width: 240,
    height: 240,
    x: 300,
    y: 300,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const before = window.getBounds();
  const nudgeEvents = [];
  const listener = (event, offset) => {
    if (event.sender !== window.webContents) return;
    nudgeEvents.push(offset);
    moveWindowBy(window, offset);
  };

  ipcMain.on('pet-window:nudge', listener);
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await wait(4500);
  const after = window.getBounds();
  ipcMain.removeListener('pet-window:nudge', listener);

  console.log(
    JSON.stringify(
      {
        before: { x: before.x, y: before.y },
        after: { x: after.x, y: after.y },
        nudgeEvents
      },
      null,
      2
    )
  );

  window.close();
  app.quit();

  if (nudgeEvents.length < 1 || (before.x === after.x && before.y === after.y)) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
