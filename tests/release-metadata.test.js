const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readJson(...parts) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf-8'));
}

function readText(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf-8');
}

test('release metadata describes the 0.3.1 UI polish update', () => {
  const packageJson = readJson('package.json');
  const packageLock = readJson('package-lock.json');
  const readme = readText('README.md');
  const packaging = readText('PACKAGING.md');
  const changelog = readText('CHANGELOG.md');

  assert.equal(packageJson.version, '0.3.1');
  assert.equal(packageLock.version, '0.3.1');
  assert.equal(packageLock.packages[''].version, '0.3.1');

  assert.match(readme, /当前版本：`0\.3\.1`/);
  assert.match(readme, /desktop-cat-0\.3\.1-win-x64-setup\.exe/);
  assert.match(readme, /desktop-cat-0\.3\.1-win-x64-portable\.exe/);

  assert.match(packaging, /desktop-cat-0\.3\.1-win-x64-setup\.exe/);
  assert.match(packaging, /desktop-cat-0\.3\.1-win-x64-portable\.exe/);
  assert.match(packaging, /发布 `0\.3\.1`/);

  assert.match(changelog, /## 0\.3\.1/);
  assert.match(changelog, /UI\/UX/);
  assert.match(changelog, /Lucide/);
  assert.match(changelog, /喝水动画/);
});
