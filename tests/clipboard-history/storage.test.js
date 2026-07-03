const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { ClipboardStorage } = require('../../src/clipboard-history/storage');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-clipboard-'));
}

test('clipboard storage trims loaded history to the configured maximum', () => {
  const dir = makeTempDir();
  fs.writeFileSync(
    path.join(dir, 'clipboard-history.json'),
    JSON.stringify({
      items: [
        { id: 'one', type: 'text', content: '1' },
        { id: 'two', type: 'text', content: '2' },
        { id: 'three', type: 'text', content: '3' }
      ]
    }),
    'utf8'
  );

  const storage = new ClipboardStorage({ dir, maxItems: 2 });

  assert.deepEqual(storage.getAll().map((item) => item.id), ['one', 'two']);
});

test('clipboard storage can return a limited item list', () => {
  const dir = makeTempDir();
  const storage = new ClipboardStorage({ dir, maxItems: 5 });

  storage.setItems([
    { id: 'one', type: 'text', content: '1' },
    { id: 'two', type: 'text', content: '2' },
    { id: 'three', type: 'text', content: '3' }
  ]);

  assert.deepEqual(storage.getAll({ limit: 2 }).map((item) => item.id), ['one', 'two']);
  assert.deepEqual(storage.getAll({ limit: 0 }).map((item) => item.id), ['one', 'two', 'three']);
});

test('clipboard storage tolerates non-object getAll options', () => {
  const dir = makeTempDir();
  const storage = new ClipboardStorage({ dir, maxItems: 5 });

  storage.setItems([
    { id: 'one', type: 'text', content: '1' },
    { id: 'two', type: 'text', content: '2' }
  ]);

  assert.deepEqual(storage.getAll(null).map((item) => item.id), ['one', 'two']);
});
