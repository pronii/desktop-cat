const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { writeBuildConfig } = require('../../scripts/write-build-config');

test('write-build-config writes the room endpoint from the build environment', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-write-config-'));
  const outputPath = path.join(tempDir, 'buildConfig.generated.json');

  try {
    const result = writeBuildConfig({
      env: {
        DESKTOP_CAT_ROOM_ENDPOINT: ' ws://build.example.test/room '
      },
      outputPath,
      logger: null
    });

    const config = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    assert.equal(result.roomEndpoint, 'ws://build.example.test/room');
    assert.deepEqual(config, {
      roomEndpoint: 'ws://build.example.test/room'
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('write-build-config clears stale generated endpoints when no build value is set', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-write-config-'));
  const outputPath = path.join(tempDir, 'buildConfig.generated.json');

  try {
    fs.writeFileSync(outputPath, JSON.stringify({ roomEndpoint: 'ws://old.example.test/room' }), 'utf8');

    const result = writeBuildConfig({
      env: {},
      outputPath,
      logger: null
    });

    const config = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    assert.equal(result.roomEndpoint, '');
    assert.deepEqual(config, {
      roomEndpoint: ''
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
