const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.join(__dirname, '..', '..');
const FORBIDDEN_VALUES = [
  ['45', '136', '28', '241'].join('.')
];

const BINARY_EXTENSIONS = new Set([
  '.ico',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.moc3'
]);

function listScannedFiles() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  })
    .split(/\r?\n/)
    .filter(Boolean);
}

function isTextFile(filePath) {
  if (BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return false;
  const stat = fs.statSync(filePath);
  return stat.size < 2 * 1024 * 1024;
}

test('committable source files do not expose the private deployment IP', () => {
  const matches = [];

  for (const relativePath of listScannedFiles()) {
    const filePath = path.join(REPO_ROOT, relativePath);
    if (!isTextFile(filePath)) continue;

    const text = fs.readFileSync(filePath, 'utf8');
    for (const forbidden of FORBIDDEN_VALUES) {
      if (text.includes(forbidden)) {
        matches.push(`${relativePath}: ${forbidden}`);
      }
    }
  }

  assert.deepEqual(matches, []);
});
