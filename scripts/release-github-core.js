const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function getReleaseMetadata(packageJson) {
  const productName = String(packageJson?.name || '').trim();
  const version = String(packageJson?.version || '').trim();
  if (!productName) throw new Error('package.json requires a name');
  if (!version) throw new Error('package.json requires a version');

  return {
    productName,
    version,
    tagName: `v${version}`,
    releaseName: `${productName} ${version}`,
    assetNames: [
      `${productName}-${version}-win-x64-setup.exe`,
      `${productName}-${version}-win-x64-portable.exe`,
      `${productName}-${version}-win-x64-setup.exe.blockmap`,
      'latest.yml',
      'SHA256SUMS.txt'
    ]
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractChangelogSection(changelogText, version) {
  const escapedVersion = escapeRegExp(version);
  const pattern = new RegExp(
    `(^|\\n)## ${escapedVersion}\\r?\\n\\r?\\n([\\s\\S]*?)(?=\\r?\\n## \\d|$)`
  );
  const match = String(changelogText || '').match(pattern);
  if (!match) throw new Error(`CHANGELOG.md has no ## ${version} section`);
  const notes = match[2].trim();
  if (!notes) throw new Error(`CHANGELOG.md ## ${version} section is empty`);
  return notes;
}

function createReleaseBody({ productName, version, notes }) {
  return `## ${productName} ${version}\n\n${String(notes).trim()}\n\nSHA-256 \u89c1 SHA256SUMS.txt\u3002`;
}

function assertReleaseBodySafe(body) {
  if (String(body).includes('??')) {
    throw new Error('Release body appears garbled and contains ?? markers');
  }
}

function resolveRequiredAssets(distDir, assetNames) {
  const assets = assetNames.map((name) => ({
    name,
    path: path.join(distDir, name)
  }));
  const missing = assets.filter((asset) => !fs.existsSync(asset.path));
  if (missing.length > 0) {
    throw new Error(`Missing release asset(s): ${missing.map((asset) => asset.name).join(', ')}`);
  }
  return assets;
}

function createSha256Sums(exePaths, outputPath) {
  const lines = [...exePaths]
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)))
    .map((filePath) => {
      const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
      return `${hash}  ${path.basename(filePath)}`;
    });
  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
  return lines;
}

function parseGitCredentialOutput(output) {
  const match = String(output || '').match(/^password=(.+)$/m);
  if (!match) throw new Error('GitHub token not found from git credential helper');
  return match[1];
}

module.exports = {
  assertReleaseBodySafe,
  createReleaseBody,
  createSha256Sums,
  extractChangelogSection,
  getReleaseMetadata,
  parseGitCredentialOutput,
  resolveRequiredAssets
};
