const { BrowserWindow, clipboard, ipcMain, app } = require('electron');
const path = require('node:path');
const { ClipboardStorage } = require('./storage');
const { startClipboardWatch } = require('./watcher');

let storage = null;
let watcher = null;
let historyWindow = null;

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
    storage.clear();
  });

  ipcMain.handle('clipboard-history:copy', (_event, id) => {
    const items = storage.getAll();
    const item = items.find(i => i.id === id);
    if (!item) return;

    if (item.type === 'image') {
      const nativeImg = require('electron').nativeImage.createFromDataURL(item.thumbnail);
      clipboard.writeImage(nativeImg);
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
}

function initClipboardHistory({ preloadPath }) {
  const historyDir = path.join(app.getPath('userData'), 'clipboard-history');
  storage = new ClipboardStorage({ dir: historyDir });

  watcher = startClipboardWatch((item) => {
    console.log('[Clipboard History] Watcher callback triggered, item type:', item.type);
    const id = `${item.type}_${item.timestamp}`;
    const record = {
      id,
      type: item.type,
      thumbnail: item.thumbnail,
      filePath: item.filePath,
      content: item.content, // for text
      timestamp: item.timestamp
    };
    console.log('[Clipboard History] Record created:', record.id);
    storage.add(record);

    if (historyWindow && !historyWindow.isDestroyed()) {
      console.log('[Clipboard History] Sending new-item event to window');
      historyWindow.webContents.send('clipboard-history:new-item', record);
    }
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
  storage = null;
}

module.exports = { initClipboardHistory, openHistoryWindow, teardownClipboardHistory };
