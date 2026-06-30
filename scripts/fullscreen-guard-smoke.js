const { app, BrowserWindow } = require('electron');
const {
  calculateCoverage,
  isIgnoredSystemWindow,
  probeForegroundWindow,
  shouldSuspendTopmost
} = require('../src/main/fullscreenGuard');

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  await app.whenReady();

  const fullscreenWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Desktop Cat Fullscreen Guard Smoke',
    backgroundColor: '#101010',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await fullscreenWindow.loadURL(
    'data:text/html,<html><body style="margin:0;background:#101010;color:white;font:32px Arial;display:grid;place-items:center;height:100vh;">fullscreen guard smoke</body></html>'
  );
  fullscreenWindow.setFullScreen(true);
  fullscreenWindow.focus();
  await wait(1200);

  const snapshot = await probeForegroundWindow();
  const candidates = (snapshot.windows || [])
    .map((windowSnapshot) => ({
      ...windowSnapshot,
      coverage: calculateCoverage(windowSnapshot, windowSnapshot.display),
      ignored: isIgnoredSystemWindow(windowSnapshot)
    }))
    .filter((windowSnapshot) => windowSnapshot.coverage > 0.97);
  const suspend = shouldSuspendTopmost({
    foreground: snapshot.foreground,
    windows: snapshot.windows,
    display: snapshot.display,
    petWindowId: 'none'
  });

  console.log(JSON.stringify({ suspend, candidates }, null, 2));

  fullscreenWindow.close();
  app.quit();

  if (!suspend) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
