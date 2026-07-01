const path = require('node:path');
const fs = require('node:fs');

const DEFAULT_MAX_ITEMS = 50;

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
    const removed = this._trim();
    this._save();
    return removed;
  }

  removeById(id) {
    const idx = this._data.items.findIndex(i => i.id === id);
    if (idx !== -1) {
      const [removed] = this._data.items.splice(idx, 1);
      this._save();
      return removed;
    }
    return null;
  }

  clear() {
    const removed = this._data.items;
    this._data.items = [];
    this._save();
    return removed;
  }

  setItems(items) {
    this._data.items = Array.isArray(items) ? items : [];
    this._trim();
    this._save();
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

  _save() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify({ items: this._data.items }, null, 2), 'utf-8');
  }
}

module.exports = { ClipboardStorage };
