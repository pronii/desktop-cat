# Room Pet Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract room pet synchronization from `main.js` into a dedicated controller.

**Architecture:** Add `src/main/roomPetSync.js` as a dependency-injected controller. `main.js` will instantiate the controller and delegate room setup, client access, peer sync, and teardown to it.

**Tech Stack:** Electron main process, CommonJS, Node.js `node:test`.

## Global Constraints

Keep existing IPC channels unchanged.
Keep room protocol and peer window layout unchanged.
Use TDD: write failing controller tests before implementation.
Do not modify unrelated app features.

---

### Task 1: Add Room Pet Sync Controller

**Files:**
- Create: `src/main/roomPetSync.js`
- Create: `tests/main/roomPetSync.test.js`

**Interfaces:**
- Produces: `createRoomPetSyncController(options)`
- Produces methods: `setup()`, `getRoomClient()`, `syncCurrentPeers()`, `teardown()`

- [x] **Step 1: Write failing tests**

Run: `node --test tests\main\roomPetSync.test.js`

Expected: FAIL with `Cannot find module '../../src/main/roomPetSync'`.

- [x] **Step 2: Implement the controller**

Move room state forwarding, peer sync, pet state reporting, setup, and teardown logic into `src/main/roomPetSync.js`.

- [x] **Step 3: Verify controller tests**

Run: `node --test tests\main\roomPetSync.test.js`

Expected: PASS.

### Task 2: Wire Main Process To The Controller

**Files:**
- Modify: `src/main/main.js`
- Modify: `tests/main/dragModeLifecycle.test.js` only if structural assertions need updated anchors
- Modify: renderer structural tests only if they still point at old `main.js` IPC locations

**Interfaces:**
- Consumes: `createRoomPetSyncController(options)`
- `registerMainIpcHandlers.setupRoomClient` returns `roomPetSync.getRoomClient()`
- `syncCurrentRoomPeersBesideLocal` delegates to `roomPetSync.syncCurrentPeers()`

- [x] **Step 1: Update `main.js` wiring**

Instantiate `roomPetSync` with existing dependencies and replace local room helper functions with controller method calls.

- [x] **Step 2: Verify focused tests**

Run: `node --test tests\main\roomPetSync.test.js tests\main\ipcHandlers.test.js tests\main\petState.test.js tests\main\peerPetWindows.test.js tests\main\roomClient.test.js`

Expected: PASS.

- [x] **Step 3: Verify full suite**

Run: `npm test`

Expected: PASS.
