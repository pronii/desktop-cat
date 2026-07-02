# Room Server Docker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a minimal Dockerized WebSocket room relay for desktop-cat multiplayer rooms.

**Architecture:** Keep the first server stateless and in-memory. The Node.js server exposes `/health` over HTTP and `/room` over WebSocket, then relays join, state, and leave messages between users in the same room.

**Tech Stack:** Node.js 20 CommonJS, built-in `http` and `crypto`, Docker, Docker Compose.

## Global Constraints

- No database in MVP; rooms disappear after server restart.
- No new runtime npm dependencies for the first deploy.
- Room state stores only room membership and latest pet state.
- Public MVP endpoint is IP-based: `ws://45.136.28.241:3001/room`.
- Keep tests runnable through `npm test`.

---

### Task 1: Room State Core

**Files:**
- Create: `server/roomManager.js`
- Test: `tests/server/roomManager.test.js`

**Interfaces:**
- Produces: `createRoomManager(options)`, returning `{ joinRoom, leaveClient, updateState, getRoomSnapshot }`.
- Consumes: plain client objects shaped as `{ id: string, send: Function }`.

- [ ] **Step 1: Write the failing test**

```js
test('joinRoom sends existing peer states to the joining client', () => {
  const manager = createRoomManager({ now: () => 1000 });
  const alice = makeClient('alice');
  const bob = makeClient('bob');
  manager.joinRoom('123456', alice, { nickname: 'Alice' });
  manager.updateState(alice, { pet: { x: 0.2, y: 0.8, action: 'idle' } });
  manager.joinRoom('123456', bob, { nickname: 'Bob' });
  assert.deepEqual(bob.messages[0].peers[0].userId, 'alice');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server/roomManager.test.js`
Expected: FAIL because `server/roomManager.js` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement `joinRoom`, `updateState`, `leaveClient`, and `getRoomSnapshot` with in-memory `Map` storage.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/server/roomManager.test.js`
Expected: PASS.

### Task 2: WebSocket Relay Server

**Files:**
- Create: `server/roomServer.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createRoomManager`.
- Produces: HTTP health response at `/health` and WebSocket endpoint at `/room`.

- [ ] **Step 1: Add the server**

Use Node `http` upgrade handling and a minimal RFC6455 text-frame encoder/decoder for JSON messages.

- [ ] **Step 2: Add script**

Add `room:server` script pointing to `node server/roomServer.js`.

- [ ] **Step 3: Run verification**

Run: `npm test`
Expected: PASS.

### Task 3: Docker Deployment Files

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Modify: `README.md`

**Interfaces:**
- Produces: container listening on port `3001`.

- [ ] **Step 1: Add Docker files**

Use `node:20-alpine`, copy `server`, `package.json`, and expose port `3001`.

- [ ] **Step 2: Add README deployment note**

Document local and Docker start commands.

- [ ] **Step 3: Run verification**

Run: `npm test`
Expected: PASS.

### Task 4: Deploy And Verify

**Files:**
- Remote path: `/opt/desktop-cat-room`

**Interfaces:**
- Consumes: SSH access to `root@45.136.28.241`.
- Produces: reachable service at `http://45.136.28.241:3001/health` and `ws://45.136.28.241:3001/room`.

- [ ] **Step 1: Copy files to server**

Copy the repository deployment files and `server` folder into `/opt/desktop-cat-room`.

- [ ] **Step 2: Start Docker Compose**

Run: `docker compose up -d --build`.

- [ ] **Step 3: Verify health**

Run: `curl http://127.0.0.1:3001/health` on the server.
Expected: JSON with `"ok":true`.
