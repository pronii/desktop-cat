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

test('release metadata describes the 0.3.14 modularization release', () => {
  const packageJson = readJson('package.json');
  const packageLock = readJson('package-lock.json');
  const readme = readText('README.md');
  const packaging = readText('PACKAGING.md');
  const changelog = readText('CHANGELOG.md');

  assert.equal(packageJson.version, '0.3.14');
  assert.equal(packageLock.version, '0.3.14');
  assert.equal(packageLock.packages[''].version, '0.3.14');

  assert.match(readme, /`0\.3\.14`/);
  assert.match(readme, /desktop-cat-0\.3\.14-win-x64-setup\.exe/);
  assert.match(readme, /desktop-cat-0\.3\.14-win-x64-portable\.exe/);

  assert.match(packaging, /`0\.3\.14`/);
  assert.match(packaging, /desktop-cat-0\.3\.14-win-x64-setup\.exe/);
  assert.match(packaging, /desktop-cat-0\.3\.14-win-x64-portable\.exe/);
  assert.match(packaging, /npm run release:github/);
  assert.match(packaging, /preferred publishing path/i);

  assert.match(changelog, /## 0\.3\.14/);
  assert.match(changelog, /main\.js/);
  assert.match(changelog, /dragMode/);
  assert.match(changelog, /roomPetSync/);
  assert.match(changelog, /IPC/);
  assert.match(changelog, /重新打包/);
});

test('package metadata enables GitHub installer auto updates', () => {
  const packageJson = readJson('package.json');

  assert.equal(packageJson.scripts.test, 'node --test tests');
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

test('package and docker metadata expose license administration support', () => {
  const packageJson = readJson('package.json');
  const dockerCompose = readText('docker-compose.yml');

  assert.equal(packageJson.scripts['license:create'], 'node scripts/create-license-codes.js');
  assert.match(dockerCompose, /DESKTOP_CAT_ADMIN_TOKEN/);
  assert.match(dockerCompose, /DESKTOP_CAT_ADMIN_PASSWORD/);
  assert.match(dockerCompose, /\.\/data:\/app\/data/);
});
