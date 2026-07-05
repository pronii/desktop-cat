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
  resolveNpmInvocation,
  resolveRequiredAssets
} = require('../../scripts/release-github-core');

const chineseMojibakeFix = '\u4fee\u590d\u53d1\u5e03\u8bf4\u660e\u4e2d\u6587\u4e71\u7801\u3002';
const chineseUploadNote = '\u4e0a\u4f20 latest.yml \u548c blockmap\u3002';
const shaLine = 'SHA-256 \u89c1 SHA256SUMS.txt\u3002';

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
    `- ${chineseMojibakeFix}`,
    `- ${chineseUploadNote}`,
    '',
    '## 0.3.2',
    '',
    '- Previous release.'
  ].join('\n');

  assert.equal(
    extractChangelogSection(changelog, '0.3.3'),
    `- ${chineseMojibakeFix}\n- ${chineseUploadNote}`
  );
});

test('createReleaseBody uses UTF-8 Chinese text and rejects mojibake markers', () => {
  const body = createReleaseBody({
    productName: 'desktop-cat',
    version: '0.3.3',
    notes: `- ${chineseMojibakeFix}`
  });

  assert.match(body, /## desktop-cat 0\.3\.3/);
  assert.match(body, new RegExp(chineseMojibakeFix));
  assert.match(body, new RegExp(shaLine.replace('.', '\\.')));
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

test('resolveNpmInvocation uses cmd.exe for npm on Windows', () => {
  assert.deepEqual(resolveNpmInvocation(['test'], 'win32'), {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', 'npm test']
  });
  assert.deepEqual(resolveNpmInvocation(['run', 'pack'], 'linux'), {
    command: 'npm',
    args: ['run', 'pack']
  });
  assert.deepEqual(resolveNpmInvocation(['run', 'pack'], 'darwin'), {
    command: 'npm',
    args: ['run', 'pack']
  });
});
