const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_OUTPUT_PATH = path.join(__dirname, '..', 'src', 'main', 'buildConfig.generated.json');

function normalizeEndpoint(value) {
  return String(value || '').trim();
}

function writeBuildConfig({
  env = process.env,
  outputPath = DEFAULT_OUTPUT_PATH,
  logger = console
} = {}) {
  const roomEndpoint = normalizeEndpoint(env.DESKTOP_CAT_ROOM_ENDPOINT);
  const config = { roomEndpoint };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  if (logger && typeof logger.log === 'function') {
    logger.log(
      roomEndpoint
        ? `Wrote build room endpoint to ${outputPath}`
        : `Wrote empty build room endpoint to ${outputPath}`
    );
  }

  return config;
}

if (require.main === module) {
  writeBuildConfig();
}

module.exports = {
  DEFAULT_OUTPUT_PATH,
  writeBuildConfig
};
