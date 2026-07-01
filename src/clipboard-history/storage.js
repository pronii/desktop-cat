const path = require('node:path');
const fs = require('node:fs');

const DEFAULT_MAX_ITEMS = 50;
const SAVE_DEBOUNCE_MS = 300;

class ClipboardStorage {
  constructor({ dir, maxItems } = {}) {
    this.filePath = path.join(dir, 'clipboard-history.json');
    this.maxItems = maxItems ?? DEFAULT_MAX_ITEMS;
    this._data = this._load();
    this._saveTimer = null;
    this._savePending = false;
  }

  getAll() {
    return [...this._data.items];
  }

  getMaxItems() {
    return this.maxItems;
  }

  add(item) {
    this._data.items.unshift(item);
    const removed = this._trim();
    this.scheduleSave();
    return removed;
  }

  removeById(id) {
    const idx = this._data.items.findIndex(i => i.id === id);
    if (idx !== -1) {
      const [removed] = this._data.items.splice(idx, 1);
      this.scheduleSave();
      return removed;
    }
    return null;
  }

  clear() {
    const removed = this._data.items;
    this._data.items = [];
    this.scheduleSave();
    return removed;
  }

  setItems(items) {
    this._data.items = Array.isArray(items) ? items : [];
    this._trim();
    this.scheduleSave();
  }

  _trim() {
    if (this._data.items.length > this.maxItems) {
      const removed = this._data.items.slice(this.maxItems);
      this._data.items = this._data.items.slice(0, this.maxItems);
      return removed;
    }
    return [];
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

  /**
   * Debounced async write. Multiple mutations within SAVE_DEBOUNCE_MS collapse
   * into a single disk write. Memory data (`_data.items`) is always current,
   * so `getAll()` reads are not affected by the write delay.
   */
  scheduleSave() {
    this._savePending = true;
    if (this._saveTimer) return;

    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._writeAsync();
    }, SAVE_DEBOUNCE_MS);

    if (typeof this._saveTimer.unref === 'function') {
      this._saveTimer.unref();
    }
  }

  _writeAsync() {
    if (!this._savePending) return;
    this._savePending = false;

    const dir = path.dirname(this.filePath);
    const payload = JSON.stringify({ items: this._data.items }, null, 2);

    const write = () => {
      fs.writeFile(this.filePath, payload, 'utf-8', (err) => {
        if (err) {
          // Keep the in-memory data authoritative; log and move on.
          console.error('[ClipboardStorage] async write failed:', err.message);
        }
      });
    };

    if (!fs.existsSync(dir)) {
      fs.mkdir(dir, { recursive: true }, (mkdirErr) => {
        if (mkdirErr) {
          console.error('[ClipboardStorage] mkdir failed:', mkdirErr.message);
          return;
        }
        write();
      });
    } else {
      write();
    }
  }

  /**
   * Force a synchronous flush of any pending write. Call on app exit to
   * guarantee the latest in-memory state reaches disk before the process ends.
   */
  flushSync() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (!this._savePending) return;
    this._savePending = false;

    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.filePath,
        JSON.stringify({ items: this._data.items }, null, 2),
        'utf-8'
      );
    } catch (err) {
      console.error('[ClipboardStorage] flushSync failed:', err.message);
    }
  }
}

module.exports = { ClipboardStorage };
