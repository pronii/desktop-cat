# Release Automation Design

## Goal

Add a local release automation command that turns the existing manual Windows release process into a repeatable, verified workflow for GitHub Releases.

## Context

The project currently releases Windows artifacts through `npm test`, `npm run pack`, manual SHA-256 generation, manual tag creation, and manual GitHub Release API calls. The recent `v0.3.2` release exposed two avoidable risks:

- Release notes can become garbled when Chinese text is embedded directly in a PowerShell API command.
- Release attachments can be missed or become stale when `SHA256SUMS.txt`, `latest.yml`, `.blockmap`, installer, and portable artifacts are uploaded manually.

The project already has:

- `electron-builder` generating NSIS installer, portable executable, `latest.yml`, and installer `.blockmap`.
- `electron-updater` configured to use GitHub Releases for installer auto updates.
- `PACKAGING.md` documenting the release checklist.
- `CHANGELOG.md` containing version-specific release notes.

## Approach Options

### Option A: Upload-only helper

Create a script that only uploads existing `dist` files to GitHub.

This is small, but it leaves testing, packaging, checksums, tag creation, and release note encoding as separate manual steps. It reduces one failure mode while preserving most of the current release risk.

### Option B: Fully automatic release manager

Create a script that bumps versions, edits `CHANGELOG.md`, commits, tags, builds, and publishes.

This is powerful, but too aggressive for the current project. Release wording and version intent should remain explicit human decisions, especially while the product is still moving quickly.

### Option C: Verified semi-automatic release

Create a script that assumes the version and changelog are already prepared, then runs the mechanical release steps end to end.

This is the preferred approach. It removes the error-prone mechanics while keeping version selection and release content under human control.

## Chosen Design

Add `npm run release:github`, backed by a Node.js script at `scripts/release-github.js`.

The script will:

1. Read `package.json` and derive the release version and tag, such as `0.3.3` and `v0.3.3`.
2. Require a clean Git worktree before publishing.
3. Run `npm test`.
4. Run `npm run pack`.
5. Generate `dist/SHA256SUMS.txt` from the final `setup.exe` and `portable.exe`.
6. Extract the matching section from `CHANGELOG.md`, such as `## 0.3.3`.
7. Create a UTF-8 GitHub Release body from the extracted changelog text.
8. Create and push the Git tag if it does not already exist.
9. Create or update the GitHub Release.
10. Upload or replace the required assets:
    - `desktop-cat-<version>-win-x64-setup.exe`
    - `desktop-cat-<version>-win-x64-portable.exe`
    - `desktop-cat-<version>-win-x64-setup.exe.blockmap`
    - `latest.yml`
    - `SHA256SUMS.txt`
11. Fetch the release after upload and verify:
    - Release body contains no `??` mojibake marker.
    - All required asset names are present.
    - Asset count is at least the required five assets.

## Command Shape

```powershell
npm run release:github
```

The command publishes the current version from `package.json`. It does not accept a version argument in the first implementation. This keeps the first release automation path narrow and avoids mismatches between `package.json`, `package-lock.json`, `README.md`, `PACKAGING.md`, and `CHANGELOG.md`.

## Authentication

The script will use the existing local Git credential helper:

```text
protocol=https
host=github.com
```

It will read the credential via `git credential fill`, use the returned password/token only in memory, and never write it to disk or print it.

## Release Notes Encoding

The script will read `CHANGELOG.md` with Node.js using UTF-8 and send JSON with `Content-Type: application/json; charset=utf-8`.

This avoids embedding Chinese release notes directly inside PowerShell command text, which caused the `v0.3.2` Release description to become garbled.

## Failure Handling

The script will fail fast with a clear message when:

- The Git worktree is not clean.
- `package.json` has no version.
- `CHANGELOG.md` has no matching `## <version>` section.
- `npm test` fails.
- `npm run pack` fails.
- A required artifact is missing from `dist`.
- GitHub authentication is unavailable.
- GitHub API calls fail.
- Post-upload verification cannot find the expected assets.

If a GitHub Release already exists, the script will update its body and replace same-name assets. This makes rerunning the command safe after fixing a local packaging or release-note issue.

## Non-Goals

The first implementation will not:

- Bump the version number.
- Edit `CHANGELOG.md`.
- Commit source changes.
- Create prereleases or draft releases.
- Publish release artifacts to any host other than GitHub Releases.
- Configure Windows code signing.
- Perform a real installed-app update test.

## Tests

Add focused Node.js tests for pure release helper behavior:

- Version metadata creates the expected tag and artifact names.
- Changelog extraction returns the intended version section and preserves Chinese text.
- Release body creation does not introduce `??`.
- Required asset validation reports missing files clearly.

The network publishing path will stay behind the script command and will be verified through a dry helper layer where practical. The final command will still be manually verified with `npm test` and a real release run when publishing the next version.

## Documentation

Update `PACKAGING.md` to make `npm run release:github` the preferred publishing path after version metadata and changelog are prepared.

Keep the manual checklist as a fallback, but mark it as fallback rather than the primary process.
