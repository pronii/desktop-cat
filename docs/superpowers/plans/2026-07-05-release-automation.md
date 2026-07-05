# Release Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `npm run release:github` to build, checksum, tag, publish, upload, and verify GitHub Releases without garbling Chinese release notes.

**Architecture:** Split release automation into a pure helper module and a thin CLI. `scripts/release-github-core.js` owns version parsing, changelog extraction, release body generation, asset validation, checksum generation, and credential parsing. `scripts/release-github.js` owns side effects: running commands, git tag operations, GitHub API calls, and final verification.

**Tech Stack:** Node.js CommonJS, Node test runner, `node:fs`, `node:crypto`, `node:child_process`, built-in `fetch`, GitHub REST API, existing `electron-builder` outputs.

---

## File Structure

- Create `scripts/release-github-core.js`
  - Pure and filesystem helper functions that can be tested without network access.
  - Exports release metadata, changelog, checksum, asset, and credential helpers.
- Create `scripts/release-github.js`
  - Executable CLI entrypoint for `npm run release:github`.
  - Uses helper module and performs command execution, GitHub API requests, upload, and verification.
- Create `tests/scripts/release-github-core.test.js`
  - Unit tests for pure helper behavior and file-based checksum/asset validation.
- Modify `package.json`
  - Add `"release:github": "node scripts/release-github.js"`.
- Modify `PACKAGING.md`
  - Make `npm run release:github` the preferred publishing path after version and changelog are prepared.

## Task 1: Release Helper Core

**Files:**
- Create: `scripts/release-github-core.js`
- Create: `tests/scripts/release-github-core.test.js`

- [ ] **Step 1: Write failing tests for release metadata, changelog extraction, release body safety, assets, checksums, and credential parsing**

Create `tests/scripts/release-github-core.test.js`:

```js
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  assertReleaseBodySafe,
  createReleaseBody,
  createSha256Sums,
  extractChangelogSection,
  getReleaseMetadata,
  parseGitCredentialOutput,
  resolveRequiredAssets
} = require('../../scripts/release-github-core');

test('getReleaseMetadata derives tag and required GitHub release asset names', () => {
  const metadata = getReleaseMetadata({
    name: 'desktop-cat',
    version: '0.3.3'
  });

  assert.equal(metadata.version, '0.3.3');
  assert.equal(metadata.tagName, 'v0.3.3');
  assert.deepEqual(metadata.assetNames, [
    'desktop-cat-0.3.3-win-x64-setup.exe',
    'desktop-cat-0.3.3-win-x64-portable.exe',
    'desktop-cat-0.3.3-win-x64-setup.exe.blockmap',
    'latest.yml',
    'SHA256SUMS.txt'
  ]);
});

test('extractChangelogSection preserves Chinese release notes for a version', () => {
  const changelog = [
    '# Changelog',
    '',
    '## 0.3.3',
    '',
    '- 修复发布说明中文乱码。',
    '- 上传 latest.yml 和 blockmap。',
    '',
    '## 0.3.2',
    '',
    '- Previous release.'
  ].join('\n');

  assert.equal(
    extractChangelogSection(changelog, '0.3.3'),
    '- 修复发布说明中文乱码。\n- 上传 latest.yml 和 blockmap。'
  );
});

test('createReleaseBody uses UTF-8 Chinese text and rejects mojibake markers', () => {
  const body = createReleaseBody({
    productName: 'desktop-cat',
    version: '0.3.3',
    notes: '- 修复发布说明中文乱码。'
  });

  assert.match(body, /## desktop-cat 0\.3\.3/);
  assert.match(body, /修复发布说明中文乱码/);
  assert.match(body, /SHA-256 见 SHA256SUMS\.txt。/);
  assert.doesNotThrow(() => assertReleaseBodySafe(body));
  assert.throws(() => assertReleaseBodySafe('## desktop-cat\n\n- ??'), /garbled/i);
});

test('resolveRequiredAssets reports missing files clearly', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-assets-'));
  fs.writeFileSync(path.join(tempDir, 'desktop-cat-0.3.3-win-x64-setup.exe'), 'setup');

  assert.throws(
    () => resolveRequiredAssets(tempDir, [
      'desktop-cat-0.3.3-win-x64-setup.exe',
      'desktop-cat-0.3.3-win-x64-portable.exe'
    ]),
    /desktop-cat-0\.3\.3-win-x64-portable\.exe/
  );
});

test('createSha256Sums writes sorted lowercase hashes for exe assets', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-sha-'));
  const portablePath = path.join(tempDir, 'desktop-cat-0.3.3-win-x64-portable.exe');
  const setupPath = path.join(tempDir, 'desktop-cat-0.3.3-win-x64-setup.exe');
  const sumsPath = path.join(tempDir, 'SHA256SUMS.txt');
  fs.writeFileSync(portablePath, 'portable');
  fs.writeFileSync(setupPath, 'setup');

  const lines = createSha256Sums([setupPath, portablePath], sumsPath);

  const expectedPortable = crypto.createHash('sha256').update('portable').digest('hex');
  const expectedSetup = crypto.createHash('sha256').update('setup').digest('hex');
  assert.deepEqual(lines, [
    `${expectedPortable}  desktop-cat-0.3.3-win-x64-portable.exe`,
    `${expectedSetup}  desktop-cat-0.3.3-win-x64-setup.exe`
  ]);
  assert.equal(fs.readFileSync(sumsPath, 'utf8'), `${lines.join('\n')}\n`);
});

test('parseGitCredentialOutput returns only the password token', () => {
  assert.equal(
    parseGitCredentialOutput('protocol=https\nhost=github.com\nusername=x\npassword=secret-token\n'),
    'secret-token'
  );
  assert.throws(() => parseGitCredentialOutput('protocol=https\n'), /token/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- tests/scripts/release-github-core.test.js
```

Expected: FAIL because `../../scripts/release-github-core` does not exist.

- [ ] **Step 3: Implement `scripts/release-github-core.js`**

Create `scripts/release-github-core.js`:

```js
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
  return `## ${productName} ${version}\n\n${String(notes).trim()}\n\nSHA-256 见 SHA256SUMS.txt。`;
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
```

- [ ] **Step 4: Run helper tests to verify they pass**

Run:

```powershell
npm test -- tests/scripts/release-github-core.test.js
```

Expected: PASS, all 6 helper tests pass.

- [ ] **Step 5: Commit helper core**

```powershell
git add scripts/release-github-core.js tests/scripts/release-github-core.test.js
git commit -m "test: add release automation helpers"
```

## Task 2: GitHub Release CLI

**Files:**
- Create: `scripts/release-github.js`
- Modify: `package.json`
- Test: `tests/release-metadata.test.js`

- [ ] **Step 1: Write failing metadata test for the npm script**

Modify `tests/release-metadata.test.js` by adding this test after the package metadata test:

```js
test('package metadata exposes the GitHub release automation command', () => {
  const packageJson = readJson('package.json');

  assert.equal(packageJson.scripts['release:github'], 'node scripts/release-github.js');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- tests/release-metadata.test.js
```

Expected: FAIL because `release:github` is not defined.

- [ ] **Step 3: Add npm script**

Modify `package.json`:

```json
"release:github": "node scripts/release-github.js"
```

Place it after `"pack:release"` with a trailing comma on the previous script entry.

- [ ] **Step 4: Create `scripts/release-github.js`**

Create `scripts/release-github.js`:

```js
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

  run('npm', ['test']);
  run('npm', ['run', 'pack']);

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
```

- [ ] **Step 5: Run metadata tests**

Run:

```powershell
npm test -- tests/release-metadata.test.js
```

Expected: PASS, including the new `release:github` script assertion.

- [ ] **Step 6: Commit CLI and package script**

```powershell
git add package.json tests/release-metadata.test.js scripts/release-github.js
git commit -m "feat: add GitHub release automation command"
```

## Task 3: Packaging Documentation

**Files:**
- Modify: `PACKAGING.md`
- Test: `tests/release-metadata.test.js`

- [ ] **Step 1: Write failing metadata test for release automation documentation**

Modify `tests/release-metadata.test.js` by adding these assertions inside the existing release metadata test:

```js
assert.match(packaging, /npm run release:github/);
assert.match(packaging, /preferred publishing path/i);
```

Because `PACKAGING.md` contains Chinese text, the second assertion can instead use an English phrase added by this task.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- tests/release-metadata.test.js
```

Expected: FAIL because `PACKAGING.md` does not mention `npm run release:github`.

- [ ] **Step 3: Update `PACKAGING.md`**

Add this section after the packaging command section:

```markdown
## GitHub Release 自动发布

准备发布前，先手动确认版本内容已经更新：

- `package.json` 和 `package-lock.json` 版本号一致。
- `README.md`、`PACKAGING.md`、`CHANGELOG.md` 已写入本次版本内容。
- `CHANGELOG.md` 包含 `## 当前版本号` 小节。

确认后使用首选发布命令：

```powershell
npm run release:github
```

This is the preferred publishing path for GitHub Releases.

该命令会运行测试、打包、生成 `SHA256SUMS.txt`、创建或更新 tag、创建或更新 GitHub Release，并上传安装版自动更新所需的 `latest.yml` 和 `.blockmap`。
```

- [ ] **Step 4: Run metadata tests**

Run:

```powershell
npm test -- tests/release-metadata.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit documentation update**

```powershell
git add PACKAGING.md tests/release-metadata.test.js
git commit -m "docs: document GitHub release automation"
```

## Task 4: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run helper tests**

```powershell
npm test -- tests/scripts/release-github-core.test.js
```

Expected: PASS.

- [ ] **Step 2: Run metadata tests**

```powershell
npm test -- tests/release-metadata.test.js
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

```powershell
npm test
```

Expected: PASS, all tests pass.

- [ ] **Step 4: Run a non-publishing smoke check**

Run:

```powershell
node -e "const core=require('./scripts/release-github-core'); const pkg=require('./package.json'); const fs=require('node:fs'); const meta=core.getReleaseMetadata(pkg); const notes=core.extractChangelogSection(fs.readFileSync('CHANGELOG.md','utf8'), meta.version); const body=core.createReleaseBody({productName: meta.productName, version: meta.version, notes}); core.assertReleaseBodySafe(body); console.log(meta.tagName);"
```

Expected: prints the current tag, such as `v0.3.2`, and exits 0.

- [ ] **Step 5: Review git status**

```powershell
git status --short --branch
```

Expected: branch is clean except for any intentional unpushed commits.

- [ ] **Step 6: Push implementation commits**

```powershell
git push origin main
```

Expected: implementation commits are on GitHub.

## Self-Review

Spec coverage:

- Clean worktree, test, pack, checksum, changelog extraction, tag, GitHub Release upsert, asset upload, and verification are covered by Tasks 1 and 2.
- Documentation update is covered by Task 3.
- Final verification is covered by Task 4.

Placeholder scan:

- No forbidden placeholder patterns or unspecified implementation steps remain.

Type consistency:

- Helper names are consistent across tests, implementation, and CLI usage:
  `getReleaseMetadata`, `extractChangelogSection`, `createReleaseBody`, `assertReleaseBodySafe`, `resolveRequiredAssets`, `createSha256Sums`, and `parseGitCredentialOutput`.
