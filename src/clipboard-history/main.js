const { BrowserWindow, clipboard, ipcMain, app, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { ClipboardStorage } = require('./storage');
const { createThumbnailDataUrl, startClipboardWatch } = require('./watcher');

let storage = null;
let watcher = null;
let historyWindow = null;
let isPaused = false;
let imageDir = null;

function getState() {
  return { isPaused };
}

function sendStateChanged() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('clipboard-history:state-changed', getState());
    }
  }
}

function sendNewItem(record) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('clipboard-history:new-item', record);
    }
  }
}

function ensureImageDir() {
  if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
  }
}

function createImagePath(id) {
  ensureImageDir();
  return path.join(imageDir, `${id}.png`);
}

function removeImageFile(item) {
  if (item?.type !== 'image' || !item.imagePath) return;
  try {
    fs.rmSync(item.imagePath, { force: true });
  } catch {
    // Ignore cleanup failures; history removal should still succeed.
  }
}

function persistImageItem(item, id) {
  if (item.type !== 'image' || !Buffer.isBuffer(item.imageBuffer)) return {};

  const imagePath = createImagePath(id);
  fs.writeFileSync(imagePath, item.imageBuffer);
  return { imagePath };
}

function migrateLegacyImageRecords() {
  const items = storage.getAll();
  let changed = false;

  const migrated = items.map((item) => {
    if (item.type !== 'image' || item.imagePath || typeof item.thumbnail !== 'string') {
      return item;
    }

    try {
      const image = nativeImage.createFromDataURL(item.thumbnail);
      if (image.isEmpty()) return item;

      const imagePath = createImagePath(item.id);
      fs.writeFileSync(imagePath, image.toPNG());
      changed = true;
      return {
        ...item,
        imagePath,
        thumbnail: createThumbnailDataUrl(image, image.getSize())
      };
    } catch {
      return item;
    }
  });

  if (changed) {
    storage.setItems(migrated);
  }
}

function createHistoryWindow(preloadPath) {
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.focus();
    return;
  }

  historyWindow = new BrowserWindow({
    width: 620,
    height: 460,
    minWidth: 400,
    minHeight: 300,
    show: false,
    frame: true,
    resizable: true,
    title: '剪贴板历史',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  historyWindow.loadFile(path.join(__dirname, 'index.html'));

  historyWindow.once('ready-to-show', () => {
    historyWindow.show();
  });

  historyWindow.on('closed', () => {
    historyWindow = null;
  });
}

function registerIpcHandlers() {
  ipcMain.handle('clipboard-history:get-items', () => {
    return storage.getAll();
  });

  ipcMain.handle('clipboard-history:clear', () => {
    const removed = storage.clear();
    removed.forEach(removeImageFile);
    return storage.getAll();
  });

  ipcMain.handle('clipboard-history:removeById', (_event, id) => {
    removeImageFile(storage.removeById(id));
    return storage.getAll();
  });

  ipcMain.handle('clipboard-history:copy', (_event, id) => {
    const items = storage.getAll();
    const item = items.find(i => i.id === id);
    if (!item) return;

    if (item.type === 'image') {
      if (item.imagePath && fs.existsSync(item.imagePath)) {
        clipboard.writeImage(nativeImage.createFromBuffer(fs.readFileSync(item.imagePath)));
      } else {
        clipboard.writeImage(nativeImage.createFromDataURL(item.thumbnail));
      }
    } else if (item.type === 'video' && item.filePath) {
      // On Windows, writing a file to clipboard requires a specific format.
      // For simplicity, we'll just copy the path as text, or if it's more complex,
      // we might need a native module. For now, let's try writing as a file if possible.
      // Since we are in Electron, let's try writing it as a file.
      clipboard.writeBuffer('file', Buffer.from(item.filePath, 'utf-16le'));
    } else if (item.type === 'text') {
      clipboard.writeText(item.content);
    }
  });

  ipcMain.handle('clipboard-history:get-state', () => {
    return getState();
  });

  ipcMain.handle('clipboard-history:set-paused', (_event, paused) => {
    isPaused = Boolean(paused);
    sendStateChanged();
    return getState();
  });
}

function initClipboardHistory({ preloadPath }) {
  const historyDir = path.join(app.getPath('userData'), 'clipboard-history');
  imageDir = path.join(historyDir, 'images');
  storage = new ClipboardStorage({ dir: historyDir });
  migrateLegacyImageRecords();

  watcher = startClipboardWatch((item) => {
    if (isPaused) {
      return;
    }

    const id = `${item.type}_${item.timestamp}`;
    const record = {
      id,
      type: item.type,
      thumbnail: item.thumbnail,
      filePath: item.filePath,
      content: item.content,
      timestamp: item.timestamp,
      ...persistImageItem(item, id)
    };
    storage.add(record).forEach(removeImageFile);
    sendNewItem(record);
  });

  registerIpcHandlers();
}

function openHistoryWindow(preloadPath) {
  createHistoryWindow(preloadPath);
}

function teardownClipboardHistory() {
  if (watcher) {
    watcher();
    watcher = null;
  }
  if (storage) {
    storage.flushSync();
  }
  isPaused = false;
  storage = null;
  imageDir = null;
}

module.exports = { initClipboardHistory, openHistoryWindow, teardownClipboardHistory };
