# Clipboard History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clipboard history feature that monitors Windows clipboard for images and video files, persists history to disk, and provides a grid-view panel accessible from the tray menu.

**Architecture:** A standalone `BrowserWindow` launched from the tray menu. The clipboard watcher runs in the main process via polling (800ms interval). Data is persisted to a JSON file in `app.getPath('userData')`. The panel uses a simple HTML/CSS grid with dark theme.

**Tech Stack:** Electron 33, Node.js 20, CommonJS, `node:test` for testing

---

### Task 1: Create the clipboard-history directory and storage module

**Files:**
- Create: `src/clipboard-history/storage.js`
- Test: `test/clipboardStorage.test.js`

- [ ] **Step 1: Write the failing storage tests**

```js
// test/clipboardStorage.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { ClipboardStorage } = require('../src/clipboard-history/storage');

test('ClipboardStorage loads empty store when file missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-test-'));
  const storage = new ClipboardStorage({ dir });
  assert.equal(storage.getAll().length, 0);
  assert.equal(storage.getMaxItems(), 200);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ClipboardStorage add and getAll', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-test-'));
  const storage = new ClipboardStorage({ dir });
  storage.add({ id: '1', type: 'image', thumbnail: 'data:...', timestamp: 1000 });
  storage.add({ id: '2', type: 'video', thumbnail: 'data:...', filePath: 'c:/v.mp4', timestamp: 2000 });
  const items = storage.getAll();
  assert.equal(items.length, 2);
  // most recent first
  assert.equal(items[0].id, '2');
  assert.equal(items[1].id, '1');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ClipboardStorage respects maxItems and trims oldest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-test-'));
  const storage = new ClipboardStorage({ dir, maxItems: 3 });
  storage.add({ id: '1', type: 'image', thumbnail: 't', timestamp: 1000 });
  storage.add({ id: '2', type: 'image', thumbnail: 't', timestamp: 2000 });
  storage.add({ id: '3', type: 'image', thumbnail: 't', timestamp: 3000 });
  storage.add({ id: '4', type: 'image', thumbnail: 't', timestamp: 4000 });
  assert.equal(storage.getAll().length, 3);
  assert.equal(storage.getAll()[0].id, '4');
  assert.equal(storage.getAll()[2].id, '2');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ClipboardStorage clear removes all items', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-test-'));
  const storage = new ClipboardStorage({ dir });
  storage.add({ id: '1', type: 'image', thumbnail: 't', timestamp: 1000 });
  storage.add({ id: '2', type: 'image', thumbnail: 't', timestamp: 2000 });
  storage.clear();
  assert.equal(storage.getAll().length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ClipboardStorage persists to disk across instances', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-test-'));
  const storage1 = new ClipboardStorage({ dir });
  storage1.add({ id: '1', type: 'image', thumbnail: 't', timestamp: 1000 });
  storage1.add({ id: '2', type: 'image', thumbnail: 't', timestamp: 2000 });
  // new instance reads from same file
  const storage2 = new ClipboardStorage({ dir });
  assert.equal(storage2.getAll().length, 2);
  assert.equal(storage2.getAll()[0].id, '2');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ClipboardStorage removeById deletes a specific item', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-test-'));
  const storage = new ClipboardStorage({ dir });
  storage.add({ id: '1', type: 'image', thumbnail: 't', timestamp: 1000 });
  storage.add({ id: '2', type: 'image', thumbnail: 't', timestamp: 2000 });
  storage.add({ id: '3', type: 'image', thumbnail: 't', timestamp: 3000 });
  storage.removeById('2');
  assert.equal(storage.getAll().length, 2);
  assert.equal(storage.getAll().find(i => i.id === '2'), undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd E:/cat/desktop-cat && npx node --test test/clipboardStorage.test.js`
Expected: All tests throw MODULE_NOT_FOUND or similar failure

- [ ] **Step 3: Write the storage implementation**

```js
// src/clipboard-history/storage.js
const path = require('node:path');
const fs = require('node:fs');

const DEFAULT_MAX_ITEMS = 200;

class ClipboardStorage {
  constructor({ dir, maxItems } = {}) {
    this.filePath = path.join(dir, 'clipboard-history.json');
    this.maxItems = maxItems ?? DEFAULT_MAX_ITEMS;
    this._data = this._load();
  }

  getAll() {
    return [...this._data.items];
  }

  getMaxItems() {
    return this.maxItems;
  }

  add(item) {
    this._data.items.unshift(item);
    this._trim();
    this._save();
  }

  removeById(id) {
    const idx = this._data.items.findIndex(i => i.id === id);
    if (idx !== -1) {
      this._data.items.splice(idx, 1);
      this._save();
    }
  }

  clear() {
    this._data.items = [];
    this._save();
  }

  _trim() {
    if (this._data.items.length > this.maxItems) {
      this._data.items = this._data.items.slice(0, this.maxItems);
    }
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return { items: Array.isArray(parsed.items) ? parsed.items : [] };
    } catch {
      return { items: [] };
    }
  }

  _save() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify({ items: this._data.items }, null, 2), 'utf-8');
  }
}

module.exports = { ClipboardStorage };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd E:/cat/desktop-cat && npx node --test test/clipboardStorage.test.js`
Expected: All 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add clipboard history storage module"
```

---

### Task 2: Create the clipboard watcher module

**Files:**
- Create: `src/clipboard-history/watcher.js`
- Test: `test/clipboardWatcher.test.js`

- [ ] **Step 1: Write the failing watcher tests**

```js
// test/clipboardWatcher.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// We test the pure logic parts of the watcher (fingerprint, type detection)
// The actual clipboard polling requires Electron's clipboard module,
// so that part is tested via integration/smoke tests.
const { createContentFingerprint, isSupportedVideoPath } = require('../src/clipboard-history/watcher');

test('createContentFingerprint returns a string for any input', () => {
  const fp = createContentFingerprint({ type: 'image', raw: 'abc' });
  assert.equal(typeof fp, 'string');
  assert.ok(fp.length > 0);
});

test('createContentFingerprint differs for different content', () => {
  const fp1 = createContentFingerprint({ type: 'image', raw: 'abc' });
  const fp2 = createContentFingerprint({ type: 'image', raw: 'xyz' });
  assert.notEqual(fp1, fp2);
});

test('isSupportedVideoPath returns true for .mp4', () => {
  assert.equal(isSupportedVideoPath('c:/video.mp4'), true);
});

test('isSupportedVideoPath returns true for .mov', () => {
  assert.equal(isSupportedVideoPath('/path/video.mov'), true);
});

test('isSupportedVideoPath returns true for .avi', () => {
  assert.equal(isSupportedVideoPath('/path/video.avi'), true);
});

test('isSupportedVideoPath returns false for non-video extensions', () => {
  assert.equal(isSupportedVideoPath('/path/image.png'), false);
  assert.equal(isSupportedVideoPath('/path/doc.pdf'), false);
  assert.equal(isSupportedVideoPath('/path/file.txt'), false);
});

test('isSupportedVideoPath returns false for undefined/null', () => {
  assert.equal(isSupportedVideoPath(undefined), false);
  assert.equal(isSupportedVideoPath(null), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd E:/cat/desktop-cat && npx node --test test/clipboardWatcher.test.js`
Expected: All tests throw MODULE_NOT_FOUND

- [ ] **Step 3: Write the watcher implementation**

```js
// src/clipboard-history/watcher.js
const crypto = require('node:crypto');

const SUPPORTED_VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi']);

function isSupportedVideoPath(filePath) {
  if (typeof filePath !== 'string') return false;
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
  return SUPPORTED_VIDEO_EXTS.has(ext);
}

function createContentFingerprint(content) {
  const raw = typeof content.raw === 'string' ? content.raw : JSON.stringify(content.raw);
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

class ClipboardWatcher {
  constructor({ clipboard, onNewItem, intervalMs = 800 } = {}) {
    this.clipboard = clipboard;
    this.onNewItem = onNewItem;
    this.intervalMs = intervalMs;
    this._lastFingerprint = null;
    this._timer = null;
  }

  start() {
    if (this._timer) return;
    // Poll immediately, then every intervalMs
    this._poll();
    this._timer = setInterval(() => this._poll(), this.intervalMs);
    if (typeof this._timer.unref === 'function') {
      this._timer.unref();
    }
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  _poll() {
    try {
      const item = this._readClipboard();
      if (!item) return;

      const fingerprint = createContentFingerprint(item);
      if (fingerprint === this._lastFingerprint) return;
      this._lastFingerprint = fingerprint;

      this.onNewItem(item);
    } catch {
      // Silently ignore clipboard access errors (e.g. empty clipboard)
    }
  }

  _readClipboard() {
    const cb = this.clipboard;

    // Check for image
    const image = cb.readImage();
    if (!image.isEmpty()) {
      const size = image.getSize();
      // Skip tiny images (likely empty/placeholder)
      if (size.width <= 4 && size.height <= 4) return null;
      const dataUrl = image.toDataURL();
      return { type: 'image', raw: dataUrl, thumbnail: dataUrl, width: size.width, height: size.height };
    }

    // Check for file(s) — video files
    const fileList = cb.read('public.file-urls');
    if (fileList) {
      const files = fileList.split('\n').filter(Boolean);
      for (const filePath of files) {
        if (isSupportedVideoPath(filePath)) {
          return { type: 'video', raw: filePath, filePath, thumbnail: null };
        }
      }
    }

    return null;
  }
}

module.exports = { ClipboardWatcher, createContentFingerprint, isSupportedVideoPath };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd E:/cat/desktop-cat && npx node --test test/clipboardWatcher.test.js`
Expected: All 7 tests pass

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add clipboard watcher module"
```

---

### Task 3: Create the clipboard history preload script

**Files:**
- Create: `src/clipboard-history/preload.js`

- [ ] **Step 1: Write the preload script**

```js
// src/clipboard-history/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipboardHistoryAPI', {
  getItems: () => ipcRenderer.invoke('clipboard-history:get-items'),
  clearHistory: () => ipcRenderer.invoke('clipboard-history:clear'),
  copyItem: (id) => ipcRenderer.invoke('clipboard-history:copy', id),
  onNewItem: (callback) => {
    const listener = (_event, item) => callback(item);
    ipcRenderer.on('clipboard-history:new-item', listener);
    return () => {
      ipcRenderer.removeListener('clipboard-history:new-item', listener);
    };
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add clipboard history preload script"
```

---

### Task 4: Create the clipboard history main process module

**Files:**
- Create: `src/clipboard-history/main.js`

- [ ] **Step 1: Write the main process module**

```js
// src/clipboard-history/main.js
const path = require('node:path');
const { BrowserWindow, clipboard, ipcMain, app } = require('electron');
const { ClipboardStorage } = require('./storage');
const { ClipboardWatcher } = require('./watcher');

const HISTORY_DIR = path.join(app.getPath('userData'), 'clipboard-history');
const HISTORY_WINDOW_WIDTH = 620;
const HISTORY_WINDOW_HEIGHT = 460;

let storage = null;
let watcher = null;
let historyWindow = null;

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function createHistoryWindow(preloadPath) {
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.focus();
    return;
  }

  historyWindow = new BrowserWindow({
    width: HISTORY_WINDOW_WIDTH,
    height: HISTORY_WINDOW_HEIGHT,
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
      const img = clipboard.readImage();
      const nativeImg = require('electron').nativeImage.createFromDataURL(item.thumbnail);
      clipboard.writeImage(nativeImg);
    } else if (item.type === 'video' && item.filePath) {
      clipboard.writeBuffer('file', Buffer.from(item.filePath, 'utf-16le'));
    }
  });
}

function initClipboardHistory({ preloadPath }) {
  storage = new ClipboardStorage({ dir: HISTORY_DIR });

  watcher = new ClipboardWatcher({
    clipboard,
    onNewItem: (item) => {
      const record = {
        id: generateId(),
        type: item.type,
        thumbnail: item.thumbnail,
        filePath: item.filePath,
        timestamp: Date.now()
      };
      storage.add(record);

      // Notify the panel window if it's open
      if (historyWindow && !historyWindow.isDestroyed()) {
        historyWindow.webContents.send('clipboard-history:new-item', record);
      }
    }
  });

  watcher.start();
  registerIpcHandlers();
}

function openHistoryWindow(preloadPath) {
  createHistoryWindow(preloadPath);
}

function teardownClipboardHistory() {
  if (watcher) {
    watcher.stop();
    watcher = null;
  }
  storage = null;
}

module.exports = { initClipboardHistory, openHistoryWindow, teardownClipboardHistory };
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add clipboard history main process module"
```

---

### Task 5: Create the renderer page (HTML + CSS + JS)

**Files:**
- Create: `src/clipboard-history/index.html`
- Create: `src/clipboard-history/styles.css`
- Create: `src/clipboard-history/renderer.js`

- [ ] **Step 1: Write the HTML**

```html
<!-- src/clipboard-history/index.html -->
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>剪贴板历史</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <div class="ch-header">
    <h1 class="ch-title">剪贴板历史</h1>
    <button class="ch-clear-btn" id="clearBtn">清空</button>
  </div>
  <div class="ch-grid" id="grid">
    <div class="ch-empty" id="emptyMsg">暂无剪贴板历史</div>
  </div>
  <div class="ch-toast" id="toast" aria-live="polite"></div>
  <script src="./renderer.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write the CSS**

```css
/* src/clipboard-history/styles.css */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
  overflow-x: hidden;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.ch-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #2a2a4a;
  flex-shrink: 0;
}

.ch-title {
  font-size: 16px;
  font-weight: 600;
  color: #e0e0e0;
}

.ch-clear-btn {
  background: none;
  border: 1px solid #4a4a6a;
  color: #a0a0c0;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s, color 0.15s;
}

.ch-clear-btn:hover {
  background: #3a3a5a;
  color: #e0e0e0;
}

.ch-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
  padding: 12px 16px;
  overflow-y: auto;
  align-content: start;
}

.ch-empty {
  grid-column: 1 / -1;
  text-align: center;
  color: #6a6a8a;
  padding: 60px 0;
  font-size: 14px;
}

.ch-card {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #2a2a4a;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  aspect-ratio: 1;
}

.ch-card:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.ch-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ch-card-video-icon {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  pointer-events: none;
}

.ch-card-time {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  color: #ccc;
  font-size: 11px;
  padding: 20px 6px 4px;
  pointer-events: none;
}

.ch-card-copied {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4caf50;
  font-size: 14px;
  font-weight: 600;
  animation: ch-fade-in 0.15s ease;
  pointer-events: none;
}

@keyframes ch-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.ch-toast {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: #333;
  color: #e0e0e0;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.ch-toast.ch-toast-visible {
  opacity: 1;
}
```

- [ ] **Step 3: Write the renderer JS**

```js
// src/clipboard-history/renderer.js
(() => {
  const api = window.clipboardHistoryAPI;
  if (!api) return;

  const grid = document.getElementById('grid');
  const emptyMsg = document.getElementById('emptyMsg');
  const clearBtn = document.getElementById('clearBtn');
  const toast = document.getElementById('toast');

  let toastTimer = null;

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('ch-toast-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('ch-toast-visible');
    }, 1500);
  }

  function formatTime(ts) {
    const diff = Date.now() - ts;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return '刚刚';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}天前`;
    return new Date(ts).toLocaleDateString('zh-CN');
  }

  function createCard(item) {
    const card = document.createElement('div');
    card.className = 'ch-card';
    card.dataset.id = item.id;

    const img = document.createElement('img');
    if (item.type === 'video') {
      img.src = item.thumbnail || 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="130" height="130" viewBox="0 0 130 130"><rect fill="#2a2a4a" width="130" height="130"/><text x="65" y="65" text-anchor="middle" dominant-baseline="central" font-size="32" fill="#6a6a8a">▶</text></svg>'
      );
    } else {
      img.src = item.thumbnail;
    }
    img.alt = item.type === 'video' ? '视频' : '图片';
    card.appendChild(img);

    if (item.type === 'video') {
      const icon = document.createElement('span');
      icon.className = 'ch-card-video-icon';
      icon.textContent = '▶';
      card.appendChild(icon);
    }

    const time = document.createElement('div');
    time.className = 'ch-card-time';
    time.textContent = formatTime(item.timestamp);
    card.appendChild(time);

    card.addEventListener('click', () => {
      api.copyItem(item.id).then(() => {
        showToast('已复制');
        const overlay = document.createElement('div');
        overlay.className = 'ch-card-copied';
        overlay.textContent = '✓ 已复制';
        card.appendChild(overlay);
        setTimeout(() => overlay.remove(), 1000);
      });
    });

    return card;
  }

  function renderItems(items) {
    // Remove all cards, keep empty message
    grid.querySelectorAll('.ch-card').forEach(el => el.remove());

    if (!items || items.length === 0) {
      emptyMsg.style.display = 'block';
      return;
    }

    emptyMsg.style.display = 'none';
    for (const item of items) {
      grid.appendChild(createCard(item));
    }
  }

  function addItem(item) {
    emptyMsg.style.display = 'none';
    // Insert at the top
    const firstCard = grid.querySelector('.ch-card');
    if (firstCard) {
      grid.insertBefore(createCard(item), firstCard);
    } else {
      grid.appendChild(createCard(item));
    }
  }

  // Load initial items
  api.getItems().then(renderItems);

  // Listen for new items in real-time
  api.onNewItem((item) => {
    addItem(item);
  });

  // Clear button
  clearBtn.addEventListener('click', () => {
    api.clearHistory().then(() => {
      renderItems([]);
      showToast('已清空历史');
    });
  });
})();
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add clipboard history panel UI"
```

---

### Task 6: Integrate into the main application

**Files:**
- Modify: `src/main/trayMenu.js`
- Modify: `src/main/main.js`

- [ ] **Step 1: Add clipboard history entry to tray menu**

In `src/main/trayMenu.js`, add a new menu item between "总是置顶" and "退出" (above the separator before quit). The relevant portion of the file becomes:

```js
function createTrayMenuTemplate({ state, actions = {} }) {
  return [
    {
      label: '显示小猫',
      click: actions.showPet || noop
    },
    {
      label: '隐藏 5 分钟',
      click: actions.hideTemporarily || noop
    },
    {
      type: 'separator'
    },
    {
      label: '总是置顶',
      type: 'checkbox',
      checked: state.alwaysOnTopEnabled,
      click: actions.toggleAlwaysOnTop || noop
    },
    {
      type: 'separator'
    },
    {
      label: '剪切板历史',
      click: actions.openClipboardHistory || noop
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      role: 'quit'
    }
  ];
}
```

- [ ] **Step 2: Update tray menu test**

Edit `test/trayMenu.test.js` to expect the new clipboard history item. The expected template array now has 9 items instead of 6. The new entry (index 6) should be:

```js
{
  label: '剪切板历史',
  type: undefined,
  checked: undefined,
  role: undefined
}
```

And the separator that follows (index 7).

- [ ] **Step 3: Integrate clipboard history into main.js**

In `src/main/main.js`, add require and hook up initialization and tray action:

```js
// Add near top requires:
const {
  initClipboardHistory,
  openHistoryWindow,
  teardownClipboardHistory
} = require('../clipboard-history/main');
```

In `createTrayContextMenu`, add `openClipboardHistory` action:

```js
function createTrayContextMenu(window) {
  return Menu.buildFromTemplate(
    createTrayMenuTemplate({
      state: petMenuState,
      actions: {
        showPet: () => showPetWindow(window),
        hideTemporarily: () => hideWindowTemporarily(window),
        toggleAlwaysOnTop: () => togglePetAlwaysOnTop(window),
        openClipboardHistory: () => openHistoryWindow(
          path.join(__dirname, '..', 'clipboard-history', 'preload.js')
        )
      }
    })
  );
}
```

In `app.whenReady()`, after `createPetWindow()`, initialize clipboard history:

```js
app.whenReady().then(() => {
  createPetWindow();
  initClipboardHistory({
    preloadPath: path.join(__dirname, '..', 'clipboard-history', 'preload.js')
  });
  // ...
});
```

In `app.on('before-quit', ...)`, add teardown:

```js
app.on('before-quit', () => {
  teardownClipboardHistory();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});
```

- [ ] **Step 4: Run existing tests to verify nothing is broken**

Run: `cd E:/cat/desktop-cat && npx node --test test/trayMenu.test.js`
Expected: All existing tests pass (after test update)

- [ ] **Step 5: Run all tests**

Run: `cd E:/cat/desktop-cat && npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: integrate clipboard history into main app"
```

---

### Task 7: Smoke test — manual verification

- [ ] **Step 1: Launch the app**

Run: `cd E:/cat/desktop-cat && npm start`
Verify: App starts, tray icon appears

- [ ] **Step 2: Verify tray menu has clipboard history entry**

Right-click tray icon → see "剪切板历史" menu item

- [ ] **Step 3: Open clipboard history panel**

Click "剪切板历史" → a new window opens titled "剪贴板历史" with empty state

- [ ] **Step 4: Copy an image, check it appears**

Copy an image (e.g. screenshot) → the clipboard history panel should show the thumbnail

- [ ] **Step 5: Click thumbnail to re-copy**

Click a thumbnail → "已复制" toast appears

- [ ] **Step 6: Verify clear button**

Click "清空" → all items removed, empty state shown

- [ ] **Step 7: Close panel, verify it reopens correctly**

Close panel → reopen from tray → history still there (persisted)

- [ ] **Step 8: Commit if any fixes were needed**

```bash
git add -A && git commit -m "fix: adjustments from smoke test"
```
