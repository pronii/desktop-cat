#!/usr/bin/env node

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {
  assertReleaseBodySafe,
  createReleaseBody,
  createSha256Sums,
  extractChangelogSection,
  getReleaseMetadata,
  parseGitCredentialOutput,
  resolveNpmInvocation,
  resolveRequiredAssets
} = require('./release-github-core');

const OWNER = 'pronii';
const REPO = 'desktop-cat';
const API_ROOT = `https://api.github.com/repos/${OWNER}/${REPO}`;

function run(command, args, options = {}) {
  console.log(`> ${[command, ...args].join(' ')}`);
  childProcess.execFileSync(command, args, {
    stdio: 'inherit',
    ...options
  });
}

function read(command, args, options = {}) {
  return childProcess.execFileSync(command, args, {
    encoding: 'utf8',
    ...options
  });
}

function assertCleanWorktree() {
  const status = read('git', ['status', '--porcelain']).trim();
  if (status) {
    throw new Error(`Release requires a clean worktree:\n${status}`);
  }
}

function getGitHubToken() {
  const output = childProcess.execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8'
  });
  return parseGitCredentialOutput(output);
}

async function githubFetch(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'desktop-cat-release-script',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method || 'GET'} ${url} failed: HTTP ${response.status} ${body}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function getReleaseByTag(token, tagName) {
  const response = await fetch(`${API_ROOT}/releases/tags/${encodeURIComponent(tagName)}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'desktop-cat-release-script',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GET release failed: HTTP ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function createOrUpdateRelease(token, metadata, body) {
  const existing = await getReleaseByTag(token, metadata.tagName);
  if (!existing) {
    return githubFetch(token, `${API_ROOT}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        tag_name: metadata.tagName,
        target_commitish: 'main',
        name: metadata.releaseName,
        body,
        draft: false,
        prerelease: false
      })
    });
  }

  return githubFetch(token, `${API_ROOT}/releases/${existing.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      name: metadata.releaseName,
      body,
      draft: false,
      prerelease: false
    })
  });
}

async function uploadAssets(token, release, assets) {
  for (const asset of assets) {
    const existing = (release.assets || []).find((entry) => entry.name === asset.name);
    if (existing) {
      await githubFetch(token, existing.url, { method: 'DELETE' });
    }

    const uploadUrl = release.upload_url.replace(
      '{?name,label}',
      `?name=${encodeURIComponent(asset.name)}`
    );
    await githubFetch(token, uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: fs.readFileSync(asset.path)
    });
    console.log(`Uploaded ${asset.name}`);
  }
}

function ensureTag(tagName) {
  const localTags = read('git', ['tag', '--list', tagName]).trim();
  if (!localTags) {
    run('git', ['tag', tagName]);
  }

  const remoteTags = read('git', ['ls-remote', '--tags', 'origin', tagName]).trim();
  if (!remoteTags) {
    run('git', ['push', 'origin', tagName]);
  }
}

function verifyRelease(release, metadata, body) {
  assertReleaseBodySafe(release.body || '');
  if ((release.body || '').trim() !== body.trim()) {
    throw new Error('Verified release body does not match generated release body');
  }

  const uploadedNames = new Set((release.assets || []).map((asset) => asset.name));
  const missing = metadata.assetNames.filter((name) => !uploadedNames.has(name));
  if (missing.length > 0) {
    throw new Error(`Release is missing uploaded asset(s): ${missing.join(', ')}`);
  }
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  process.chdir(projectRoot);

  assertCleanWorktree();

  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const metadata = getReleaseMetadata(packageJson);
  const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
  const notes = extractChangelogSection(changelog, metadata.version);
  const body = createReleaseBody({
    productName: metadata.productName,
    version: metadata.version,
    notes
  });
  assertReleaseBodySafe(body);

  const npmTest = resolveNpmInvocation(['test']);
  run(npmTest.command, npmTest.args);
  const npmPack = resolveNpmInvocation(['run', 'pack']);
  run(npmPack.command, npmPack.args);

  const distDir = path.join(projectRoot, 'dist');
  const setupPath = path.join(distDir, `${metadata.productName}-${metadata.version}-win-x64-setup.exe`);
  const portablePath = path.join(distDir, `${metadata.productName}-${metadata.version}-win-x64-portable.exe`);
  createSha256Sums([portablePath, setupPath], path.join(distDir, 'SHA256SUMS.txt'));
  const assets = resolveRequiredAssets(distDir, metadata.assetNames);

  ensureTag(metadata.tagName);

  const token = getGitHubToken();
  const release = await createOrUpdateRelease(token, metadata, body);
  await uploadAssets(token, release, assets);

  const verified = await githubFetch(
    token,
    `${API_ROOT}/releases/tags/${encodeURIComponent(metadata.tagName)}`
  );
  verifyRelease(verified, metadata, body);

  console.log(`Release published: ${verified.html_url}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
