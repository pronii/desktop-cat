# Room Client MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible and testable "好友同屏" MVP that can create or join rooms from the desktop pet.

**Architecture:** Keep WebSocket connection logic in `src/main/roomClient.js` and expose it through Electron IPC/preload. The renderer owns the room panel UI and receives state-change events from the main process.

**Tech Stack:** Electron main/preload IPC, Node CommonJS, browser DOM JavaScript, Node `node:test`.

## Global Constraints

- Use `ws://45.136.28.241:3001/room` as the default room endpoint.
- Do not add a separate friend pet window in this MVP.
- Keep network logic out of renderer code.
- Preserve the existing hand-drawn compact desktop pet UI.

---

### Task 1: Main Room Client State Machine

**Files:**
- Create: `src/main/roomClient.js`
- Test: `tests/main/roomClient.test.js`

**Interfaces:**
- Produces: `createRoomClient({ WebSocket, endpoint, userId, now })`
- Produces methods: `join({ roomCode, nickname })`, `leave()`, `sendPetState(pet)`, `getState()`, `onStateChanged(callback)`

- [ ] Write failing tests for join, `room:joined`, peer updates, leave, and disconnected pet-state sends.
- [ ] Run `npm test -- tests/main/roomClient.test.js` and verify expected failure.
- [ ] Implement the minimal `roomClient` module.
- [ ] Re-run the room client tests and verify pass.

### Task 2: Electron IPC Integration

**Files:**
- Modify: `src/main/main.js`
- Modify: `src/main/preload.js`
- Modify: `src/main/trayMenu.js`

**Interfaces:**
- Consumes: `createRoomClient`
- Produces preload API: `window.desktopCat.room.getState()`, `join(roomCode, nickname)`, `leave()`, `onStateChanged(callback)`, `onOpenPanel(callback)`

- [ ] Add IPC handlers for room state, join, and leave.
- [ ] Emit room state to `petWindow.webContents`.
- [ ] Report pet window bounds every second while joined.
- [ ] Add tray menu action to open the room panel.

### Task 3: Renderer Room Panel

**Files:**
- Modify: `src/renderer/index.html`
- Create: `src/renderer/roomPanel.js`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: `window.desktopCat.room`

- [ ] Add bottom toolbar "好友" button and room panel markup.
- [ ] Add DOM controller for open, close, create, join, leave, status rendering, and peer list rendering.
- [ ] Add compact CSS that matches the existing sketch panel language.

### Task 4: Verification

**Files:**
- Verify changed JavaScript and full test suite.

- [ ] Run `npm test`.
- [ ] Run `node --check src\main\roomClient.js`.
- [ ] Run `node --check src\main\main.js`.
- [ ] Run `node --check src\main\preload.js`.
- [ ] Run `node --check src\renderer\roomPanel.js`.
