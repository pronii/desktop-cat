const fs = require('node:fs');
const path = require('node:path');

const LOCAL_ROOM_ENDPOINT = 'ws://127.0.0.1:3001/room';
const GENERATED_BUILD_CONFIG_PATH = path.join(__dirname, 'buildConfig.generated.json');

function normalizeEndpoint(value) {
  return String(value || '').trim();
}

function readGeneratedBuildConfig(configPath = GENERATED_BUILD_CONFIG_PATH) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function resolveBuildRoomEndpoint(env = process.env, generatedConfig = readGeneratedBuildConfig()) {
  const runtimeEndpoint = normalizeEndpoint(env.DESKTOP_CAT_ROOM_ENDPOINT);
  if (runtimeEndpoint) return runtimeEndpoint;

  const buildEndpoint = normalizeEndpoint(generatedConfig.roomEndpoint);
  return buildEndpoint || LOCAL_ROOM_ENDPOINT;
}

module.exports = {
  GENERATED_BUILD_CONFIG_PATH,
  LOCAL_ROOM_ENDPOINT,
  readGeneratedBuildConfig,
  resolveBuildRoomEndpoint
};
