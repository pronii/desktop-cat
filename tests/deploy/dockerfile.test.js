const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.join(__dirname, '..', '..');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('Dockerfile installs native build dependencies before production npm install', () => {
  const lockfile = fs.readFileSync(path.join(REPO_ROOT, 'package-lock.json'), 'utf8');
  if (!lockfile.includes('node_modules/better-sqlite3')) return;

  const dockerfile = fs.readFileSync(path.join(REPO_ROOT, 'Dockerfile'), 'utf8');
  const npmInstallIndex = dockerfile.indexOf('RUN npm ci --omit=dev');

  assert.notEqual(npmInstallIndex, -1, 'Dockerfile should install production dependencies');

  const beforeNpmInstall = dockerfile.slice(0, npmInstallIndex);

  assert.match(beforeNpmInstall, /apt-get\s+install[\s\S]*--no-install-recommends/);
  assert.match(beforeNpmInstall, /rm\s+-rf\s+\/var\/lib\/apt\/lists\/\*/);

  for (const dependency of ['python3', 'make', 'g++']) {
    assert.match(
      beforeNpmInstall,
      new RegExp(`(^|\\s)${escapeRegExp(dependency)}($|\\s|\\\\)`),
      `Dockerfile should install ${dependency} before npm ci`
    );
  }
});
