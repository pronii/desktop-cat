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
    console.log('[Clipboard Storage] Adding item:', item.type, 'id:', item.id);
    this._data.items.unshift(item);
    this._trim();
    this._save();
    console.log('[Clipboard Storage] Total items after add:', this._data.items.length);
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
