# Remote Update Push Implementation Plan

> **For AI agents:** Use TDD for each behavioral slice. Keep the update service separate from room state and keep the Electron main-process integration thin.

**Goal:** Add remote update notifications for the Windows portable Electron app using a server-hosted manifest plus optional WebSocket update nudges.

**Architecture:** The server exposes `GET /updates/latest.json`, `GET /updates/stream`, and authenticated `POST /updates/publish`. The client polls the manifest and listens to the stream; when a newer version is found it prompts, downloads, validates SHA-256, prepares a replacement script, and restarts on user approval.

**Tech Stack:** Node.js HTTP/WebSocket server, Electron main process, Node test runner.

---

### Task 1: Server Update Endpoints

**Files:**
- Modify: `server/roomServer.js`
- Test: `tests/server/roomServer.test.js`

- [ ] Step 1: Add failing tests for `GET /updates/latest.json`, update stream clients, and authenticated publish broadcasts.
- [ ] Step 2: Run the server tests and confirm the new tests fail because update endpoints are missing.
- [ ] Step 3: Implement manifest loading, stream WebSocket clients, and token-protected publish broadcasts.
- [ ] Step 4: Run the server tests and confirm they pass.

### Task 2: Client Update Manager

**Files:**
- Create: `src/main/updateManager.js`
- Test: `tests/main/updateManager.test.js`

- [ ] Step 1: Add failing tests for version comparison, manifest validation, newer-version checks, and SHA-256 download verification.
- [ ] Step 2: Run the update manager tests and confirm they fail because the module is missing.
- [ ] Step 3: Implement the update manager with dependency injection for app/dialog/WebSocket/fetch to keep it testable.
- [ ] Step 4: Run the update manager tests and confirm they pass.

### Task 3: Electron Wiring and Documentation

**Files:**
- Modify: `src/main/main.js`
- Modify: `src/main/menuState.js`
- Modify: `src/main/trayMenu.js`
- Modify: `README.md`

- [ ] Step 1: Add tray and context menu actions for manual update checks.
- [ ] Step 2: Start automatic manifest polling and optional update stream listening when the app is ready.
- [ ] Step 3: Document server environment variables, manifest format, and client environment variables.
- [ ] Step 4: Run `npm test`.
