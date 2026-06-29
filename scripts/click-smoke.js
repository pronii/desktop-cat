const path = require('node:path');
const { app, BrowserWindow } = require('electron');

async function run() {
  await app.whenReady();

  const window = new BrowserWindow({
    show: false,
    width: 240,
    height: 240,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.webContents.on('console-message', (_event, level, message) => {
    console.log(`[renderer:${level}] ${message}`);
  });

  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const cat = document.querySelector('.cat');
      const bubble = document.querySelector('.happy-bubble');
      let localMouseDownCount = 0;
      cat?.addEventListener('mousedown', () => {
        localMouseDownCount += 1;
      });

      const before = {
        hasCat: Boolean(cat),
        hasPetBehavior: Boolean(window.petBehavior),
        rendererReady: Boolean(window.desktopCatDebug?.rendererReady),
        happyCount: window.desktopCatDebug?.happyCount ?? null,
        isHappy: cat?.classList.contains('is-happy') ?? false,
        bubbleOpacity: bubble ? getComputedStyle(bubble).opacity : null
      };

      cat?.dispatchEvent(new MouseEvent('mousedown', {
        button: 0,
        bubbles: true,
        cancelable: true,
        view: window
      }));

      await new Promise((resolve) => setTimeout(resolve, 120));

      const after = {
        localMouseDownCount,
        rendererReady: Boolean(window.desktopCatDebug?.rendererReady),
        happyCount: window.desktopCatDebug?.happyCount ?? null,
        catClassName: cat?.className ?? null,
        bubbleMatchesHappySelector:
          bubble?.matches('.cat.is-happy .happy-bubble') ?? false,
        isHappy: cat?.classList.contains('is-happy') ?? false,
        bubbleOpacity: bubble ? getComputedStyle(bubble).opacity : null,
        animationName: cat ? getComputedStyle(cat).animationName : null,
        filter: cat ? getComputedStyle(cat).filter : null
      };

      return { before, after };
    })();
  `);

  console.log(JSON.stringify(result, null, 2));

  if (
    !result.before.hasCat ||
    !result.before.hasPetBehavior ||
    !result.after.isHappy ||
    result.after.animationName !== 'happy-bounce'
  ) {
    process.exitCode = 1;
  }

  await window.close();
  app.quit();
}

run().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
