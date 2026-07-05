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

test('release metadata describes the 0.3.3 appearance icon release', () => {
  const packageJson = readJson('package.json');
  const packageLock = readJson('package-lock.json');
  const readme = readText('README.md');
  const packaging = readText('PACKAGING.md');
  const changelog = readText('CHANGELOG.md');

  assert.equal(packageJson.version, '0.3.3');
  assert.equal(packageLock.version, '0.3.3');
  assert.equal(packageLock.packages[''].version, '0.3.3');

  assert.match(readme, /`0\.3\.3`/);
  assert.match(readme, /desktop-cat-0\.3\.3-win-x64-setup\.exe/);
  assert.match(readme, /desktop-cat-0\.3\.3-win-x64-portable\.exe/);

  assert.match(packaging, /`0\.3\.3`/);
  assert.match(packaging, /desktop-cat-0\.3\.3-win-x64-setup\.exe/);
  assert.match(packaging, /desktop-cat-0\.3\.3-win-x64-portable\.exe/);
  assert.match(packaging, /npm run release:github/);
  assert.match(packaging, /preferred publishing path/i);

  assert.match(changelog, /## 0\.3\.3/);
  assert.match(changelog, /Live2D/);
  assert.match(changelog, /形象/);
  assert.match(changelog, /appearance-sparkles/);
});

test('package metadata enables GitHub installer auto updates', () => {
  const packageJson = readJson('package.json');

  assert.match(packageJson.dependencies['electron-updater'], /^\^/);
  assert.deepEqual(packageJson.build.publish, [
    {
      provider: 'github',
      owner: 'pronii',
      repo: 'desktop-cat'
    }
  ]);
});

test('package metadata exposes the GitHub release automation command', () => {
  const packageJson = readJson('package.json');

  assert.equal(packageJson.scripts['release:github'], 'node scripts/release-github.js');
});
