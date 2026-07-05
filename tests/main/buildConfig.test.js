const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  LOCAL_ROOM_ENDPOINT,
  readGeneratedBuildConfig,
  resolveBuildRoomEndpoint
} = require('../../src/main/buildConfig');

test('build config falls back to the local room endpoint when no value is injected', () => {
  const endpoint = resolveBuildRoomEndpoint({}, {});

  assert.equal(endpoint, LOCAL_ROOM_ENDPOINT);
  assert.equal(endpoint, 'ws://127.0.0.1:3001/room');
});

test('build config prefers runtime environment over generated config', () => {
  const endpoint = resolveBuildRoomEndpoint(
    { DESKTOP_CAT_ROOM_ENDPOINT: ' ws://env.example.test/room ' },
    { roomEndpoint: 'ws://generated.example.test/room' }
  );

  assert.equal(endpoint, 'ws://env.example.test/room');
});

test('build config reads a generated endpoint file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-build-config-'));
  const configPath = path.join(tempDir, 'buildConfig.generated.json');

  try {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ roomEndpoint: ' ws://generated.example.test/room ' }),
      'utf8'
    );

    const config = readGeneratedBuildConfig(configPath);

    assert.deepEqual(config, { roomEndpoint: ' ws://generated.example.test/room ' });
    assert.equal(resolveBuildRoomEndpoint({}, config), 'ws://generated.example.test/room');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
