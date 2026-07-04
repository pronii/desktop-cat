const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  compareVersions,
  createUpdateManager,
  validateManifest
} = require('../../src/main/updateManager');

test('compareVersions orders dotted numeric versions', () => {
  assert.equal(compareVersions('0.3.1', '0.3.0') > 0, true);
  assert.equal(compareVersions('0.3.0', '0.3.0'), 0);
  assert.equal(compareVersions('0.2.9', '0.3.0') < 0, true);
});

test('validateManifest accepts the release fields required for a safe update', () => {
  const manifest = validateManifest({
    version: '0.3.1',
    url: 'https://example.test/desktop-cat-0.3.1.exe',
    sha256: 'c'.repeat(64),
    notes: 'Small update',
    mandatory: false
  });

  assert.equal(manifest.version, '0.3.1');
  assert.equal(manifest.mandatory, false);
});

test('checkNow downloads a newer update and prepares an install script', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-update-'));
  const executablePath = path.join(tempDir, 'desktop-cat.exe');
  fs.writeFileSync(executablePath, 'old exe');

  const updateBody = Buffer.from('new exe');
  const sha256 = require('node:crypto')
    .createHash('sha256')
    .update(updateBody)
    .digest('hex');
  const manifest = {
    version: '0.3.1',
    url: 'https://example.test/desktop-cat-0.3.1.exe',
    sha256,
    notes: 'New release'
  };
  const fetchCalls = [];
  const dialogResponses = [{ response: 0 }, { response: 1 }];

  const manager = createUpdateManager({
    currentVersion: '0.3.0',
    manifestUrl: 'https://example.test/latest.json',
    executablePath,
    userDataPath: tempDir,
    fetch: async (url) => {
      fetchCalls.push(url);
      if (url.endsWith('/latest.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => manifest
        };
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => updateBody
      };
    },
    dialog: {
      showMessageBox: async () => dialogResponses.shift() || { response: 1 }
    },
    app: {
      quit() {}
    },
    spawn: () => ({ unref() {} })
  });

  const result = await manager.checkNow({ userInitiated: true });

  assert.equal(result.status, 'ready');
  assert.equal(result.manifest.version, '0.3.1');
  assert.equal(fs.existsSync(result.downloadPath), true);
  assert.equal(fs.existsSync(result.scriptPath), true);
  assert.deepEqual(fetchCalls, [
    'https://example.test/latest.json',
    'https://example.test/desktop-cat-0.3.1.exe'
  ]);
});

test('checkNow uses non-blocking prompt callbacks for optional updates', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-update-'));
  const executablePath = path.join(tempDir, 'desktop-cat.exe');
  fs.writeFileSync(executablePath, 'old exe');

  const updateBody = Buffer.from('new exe');
  const sha256 = require('node:crypto')
    .createHash('sha256')
    .update(updateBody)
    .digest('hex');
  const promptCalls = [];

  const manager = createUpdateManager({
    currentVersion: '0.3.0',
    manifestUrl: 'https://example.test/latest.json',
    executablePath,
    userDataPath: tempDir,
    fetch: async (url) => {
      if (url.endsWith('/latest.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            version: '0.3.1',
            url: 'https://example.test/desktop-cat-0.3.1.exe',
            sha256,
            notes: 'Small update'
          })
        };
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => updateBody
      };
    },
    dialog: {
      showMessageBox: async () => {
        throw new Error('system dialog should not be used for optional updates');
      }
    },
    promptForUpdate: async (manifest) => {
      promptCalls.push(['available', manifest.version]);
      return true;
    },
    promptForRestart: async (manifest) => {
      promptCalls.push(['ready', manifest.version]);
      return false;
    },
    app: {
      quit() {}
    },
    spawn: () => ({ unref() {} })
  });

  const result = await manager.checkNow({ userInitiated: true });

  assert.equal(result.status, 'ready');
  assert.deepEqual(promptCalls, [
    ['available', '0.3.1'],
    ['ready', '0.3.1']
  ]);
});

test('checkNow rejects downloaded updates with a sha256 mismatch', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-update-'));
  const executablePath = path.join(tempDir, 'desktop-cat.exe');
  fs.writeFileSync(executablePath, 'old exe');

  const manager = createUpdateManager({
    currentVersion: '0.3.0',
    manifestUrl: 'https://example.test/latest.json',
    executablePath,
    userDataPath: tempDir,
    fetch: async (url) => {
      if (url.endsWith('/latest.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            version: '0.3.1',
            url: 'https://example.test/desktop-cat-0.3.1.exe',
            sha256: 'd'.repeat(64)
          })
        };
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from('tampered exe')
      };
    },
    dialog: {
      showMessageBox: async () => ({ response: 0 })
    },
    app: {
      quit() {}
    },
    spawn: () => ({ unref() {} })
  });

  await assert.rejects(
    () => manager.checkNow({ userInitiated: true }),
    /sha256/i
  );
});
