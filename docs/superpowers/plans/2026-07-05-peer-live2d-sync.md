# Peer Live2D Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show friends in the room as Live2D models when their selected model can be matched locally, with CSS cat fallback.

**Architecture:** Extend the room pet-state protocol with safe appearance identifiers, never model files or local paths. Move local pet-state construction into a testable helper, reuse the existing Live2D discovery/protocol layer for peer windows, and let each peer renderer decide between Live2D canvas and CSS cat based on a main-process render hint.

**Tech Stack:** Electron main/preload/renderer, Node.js built-in test runner, WebSocket room server, PixiJS + pixi-live2d-cubism4, existing `desktop-cat-live2d://` file protocol.

---

## File Structure

- Create `src/main/petState.js`: pure helper for building the local room pet state from window bounds, display work area, drag state, and Live2D appearance.
- Modify `src/main/main.js`: use `buildLocalPetState()` from `petState.js`; add peer Live2D model IPC handlers.
- Modify `src/main/live2dAppearance.js`: expose `getModelById(modelId)` and keep serialization path-safe.
- Modify `src/main/peerPreload.js`: expose peer-only Live2D lookup APIs.
- Modify `src/main/peerPetWindows.js`: add render-mode decoration and Live2D peer cap.
- Modify `server/roomServer.js`: allow sanitized appearance string fields.
- Modify `src/renderer/peerPet.html`: add peer Live2D canvas and runtime scripts.
- Modify `src/renderer/peerPet.css`: add Live2D canvas visibility and drag animation styles.
- Create `src/renderer/peerLive2D.js`: focused peer-window Live2D loader with fallback hooks.
- Modify `src/renderer/peerPet.js`: decide whether to render Live2D or CSS cat for each peer update.
- Modify tests under `tests/main`, `tests/server`, and `tests/renderer` to cover the new protocol, main helper, peer window render hints, and peer renderer behavior.

## Task 1: Extend The Room Protocol Fields

**Files:**
- Modify: `server/roomServer.js`
- Modify: `tests/server/roomServer.test.js`
- Modify: `tests/main/roomClient.test.js`

- [ ] **Step 1: Add a failing server test for appearance fields**

Append this test to `tests/server/roomServer.test.js`:

```js
test('room server relays sanitized Live2D appearance fields', async () => {
  const roomServer = createRoomServer({ port: 0 });
  await roomServer.listen();

  const port = roomServer.address().port;
  const alice = await connectWebSocket(port);
  const bob = await connectWebSocket(port);

  try {
    alice.sendJson({
      type: 'room:join',
      roomCode: '123456',
      userId: 'alice',
      nickname: 'Alice'
    });
    assert.equal((await alice.nextJson()).type, 'room:joined');

    alice.sendJson({
      type: 'pet:update',
      pet: {
        x: 0.2,
        y: 0.8,
        action: 'idle',
        facing: 'right',
        appearanceType: 'live2d',
        modelId: 'Haru',
        modelName: 'Haru',
        modelUrl: 'file:///must-not-pass'
      }
    });

    bob.sendJson({
      type: 'room:join',
      roomCode: '123456',
      userId: 'bob',
      nickname: 'Bob'
    });
    const bobJoined = await bob.nextJson();

    assert.deepEqual(bobJoined.peers[0].pet, {
      x: 0.2,
      y: 0.8,
      action: 'idle',
      facing: 'right',
      appearanceType: 'live2d',
      modelId: 'Haru',
      modelName: 'Haru'
    });
  } finally {
    alice.close();
    bob.close();
    await roomServer.close();
  }
});
```

- [ ] **Step 2: Run the server test and verify it fails**

Run:

```powershell
node --test tests/server/roomServer.test.js
```

Expected: FAIL because `appearanceType`, `modelId`, and `modelName` are filtered out.

- [ ] **Step 3: Allow the new sanitized pet string fields**

In `server/roomServer.js`, change the string-field set near the top from:

```js
const PET_STRING_FIELDS = new Set(['action', 'facing']);
```

to:

```js
const PET_STRING_FIELDS = new Set([
  'action',
  'facing',
  'appearanceType',
  'modelId',
  'modelName'
]);
```

- [ ] **Step 4: Add a room client preservation test**

Append this test to `tests/main/roomClient.test.js`:

```js
test('room client preserves Live2D appearance fields in peer state', () => {
  const client = createClient();

  client.join({ roomCode: '123456', nickname: 'Alice' });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.message({
    type: 'pet:update',
    userId: 'bob',
    nickname: 'Bob',
    pet: {
      action: 'idle',
      appearanceType: 'live2d',
      modelId: 'Haru',
      modelName: 'Haru'
    },
    updatedAt: 2000
  });

  assert.deepEqual(client.getState().peers, [{
    userId: 'bob',
    nickname: 'Bob',
    pet: {
      action: 'idle',
      appearanceType: 'live2d',
      modelId: 'Haru',
      modelName: 'Haru'
    },
    updatedAt: 2000
  }]);
});
```

- [ ] **Step 5: Run focused protocol tests**

Run:

```powershell
node --test tests/server/roomServer.test.js tests/main/roomClient.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit protocol changes**

Run:

```powershell
git add server/roomServer.js tests/server/roomServer.test.js tests/main/roomClient.test.js
git commit -m "Extend room pet appearance protocol"
```

## Task 2: Expose Safe Live2D Model Lookup

**Files:**
- Modify: `src/main/live2dAppearance.js`
- Modify: `src/main/peerPreload.js`
- Modify: `src/main/main.js`
- Modify: `tests/main/live2dAppearance.test.js`
- Modify: `tests/renderer/live2d-appearance.test.js`

- [ ] **Step 1: Add a failing model lookup test**

Append this test to `tests/main/live2dAppearance.test.js`:

```js
test('createLive2DAppearance returns serialized model by id without filesystem paths', (t) => {
  const root = makeTempRoot(t);
  const modelsRoot = path.join(root, 'live2d-models');
  writeModel(modelsRoot, path.join('Hiyori', 'Hiyori.model3.json'), 'Hiyori');
  writeModel(modelsRoot, path.join('Mao', 'Mao.model3.json'), 'Mao');
  const appearance = createLive2DAppearance({
    app: {
      isPackaged: false,
      getPath: () => path.join(root, 'userData')
    },
    protocol: {
      registerFileProtocol() {}
    },
    searchRoots: [modelsRoot]
  });

  const model = appearance.getModelById('Mao');

  assert.deepEqual(model, {
    available: true,
    id: 'Mao',
    name: 'Mao',
    modelUrl: `${LIVE2D_PROTOCOL}://model/Mao/Mao.model3.json`,
    previewImageUrl: `${LIVE2D_PROTOCOL}://model/Mao/textures/texture_00.png`
  });
  assert.equal(appearance.getModelById('missing').available, false);
  assert.equal(Object.hasOwn(model, 'rootDir'), false);
  assert.equal(Object.hasOwn(model, 'modelJsonPath'), false);
});
```

- [ ] **Step 2: Run the lookup test and verify it fails**

Run:

```powershell
node --test tests/main/live2dAppearance.test.js
```

Expected: FAIL with `appearance.getModelById is not a function`.

- [ ] **Step 3: Implement `getModelById()`**

In `src/main/live2dAppearance.js`, add this function inside `createLive2DAppearance()` after `getAvailableModels()`:

```js
function getModelById(modelId) {
  if (!availableModels.length) {
    refresh();
  }

  const normalizedId = String(modelId || '').trim();
  const model = availableModels.find((entry) => entry.id === normalizedId);
  return model ? serializeModel(model) : { available: false };
}
```

Then include it in the returned object:

```js
return {
  getAvailableModels,
  getCurrentModel,
  getModelById,
  refresh,
  registerProtocol,
  setCurrentModel
};
```

- [ ] **Step 4: Add failing tests for peer preload and IPC wiring**

Append this test to `tests/renderer/live2d-appearance.test.js`:

```js
test('peer preload exposes read-only Live2D model lookup APIs', () => {
  const preload = readSource('src', 'main', 'peerPreload.js');
  const main = readSource('src', 'main', 'main.js');

  assert.match(preload, /getLive2DModelById/);
  assert.match(preload, /ipcRenderer\.invoke\('peer-live2d:get-model-by-id'/);
  assert.match(preload, /getDefaultLive2DModel/);
  assert.match(preload, /ipcRenderer\.invoke\('peer-live2d:get-default-model'/);
  assert.match(main, /peer-live2d:get-model-by-id/);
  assert.match(main, /live2DAppearance\.getModelById/);
  assert.match(main, /peer-live2d:get-default-model/);
  assert.match(main, /live2DAppearance\.getCurrentModel/);
});
```

- [ ] **Step 5: Run the preload wiring test and verify it fails**

Run:

```powershell
node --test tests/renderer/live2d-appearance.test.js
```

Expected: FAIL because peer preload and main IPC handlers do not exist.

- [ ] **Step 6: Expose peer lookup APIs in preload**

Replace the exposed object in `src/main/peerPreload.js` with:

```js
contextBridge.exposeInMainWorld('peerPet', {
  onUpdate: (callback) => {
    const handler = (_event, peer) => callback(peer);
    ipcRenderer.on('peer-pet:update', handler);
    return () => ipcRenderer.removeListener('peer-pet:update', handler);
  },
  getLive2DModelById: (modelId) => ipcRenderer.invoke('peer-live2d:get-model-by-id', modelId),
  getDefaultLive2DModel: () => ipcRenderer.invoke('peer-live2d:get-default-model')
});
```

- [ ] **Step 7: Add peer model IPC handlers in main**

In `src/main/main.js`, near the existing Live2D appearance IPC handlers, add:

```js
ipcMain.handle('peer-live2d:get-model-by-id', (_event, modelId) => {
  return live2DAppearance.getModelById(modelId);
});

ipcMain.handle('peer-live2d:get-default-model', () => {
  return live2DAppearance.getCurrentModel();
});
```

- [ ] **Step 8: Run focused Live2D tests**

Run:

```powershell
node --test tests/main/live2dAppearance.test.js tests/renderer/live2d-appearance.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit lookup changes**

Run:

```powershell
git add src/main/live2dAppearance.js src/main/peerPreload.js src/main/main.js tests/main/live2dAppearance.test.js tests/renderer/live2d-appearance.test.js
git commit -m "Expose peer Live2D model lookup"
```

## Task 3: Make Local Pet State Testable And Include Appearance

**Files:**
- Create: `src/main/petState.js`
- Create: `tests/main/petState.test.js`
- Modify: `src/main/main.js`

- [ ] **Step 1: Write the failing helper tests**

Create `tests/main/petState.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');

const { buildLocalPetState } = require('../../src/main/petState');

function createWindow(bounds) {
  return {
    isDestroyed: () => false,
    getBounds: () => bounds
  };
}

const fakeScreen = {
  getDisplayMatching() {
    return {
      workArea: { x: 100, y: 50, width: 1000, height: 800 }
    };
  }
};

test('buildLocalPetState includes Live2D appearance when current model is available', () => {
  const state = buildLocalPetState({
    petWindow: createWindow({ x: 350, y: 450, width: 300, height: 360 }),
    screen: fakeScreen,
    dragModeActive: true,
    live2DAppearance: {
      getCurrentModel: () => ({
        available: true,
        id: 'Haru',
        name: 'Haru',
        modelUrl: 'desktop-cat-live2d://model/Haru/Haru.model3.json'
      })
    }
  });

  assert.deepEqual(state, {
    x: 350,
    y: 450,
    width: 300,
    height: 360,
    relativeX: 0.25,
    relativeY: 0.5,
    action: 'drag',
    facing: 'right',
    appearanceType: 'live2d',
    modelId: 'Haru',
    modelName: 'Haru'
  });
});

test('buildLocalPetState reports css-cat when Live2D is unavailable', () => {
  const state = buildLocalPetState({
    petWindow: createWindow({ x: 100, y: 50, width: 300, height: 360 }),
    screen: fakeScreen,
    dragModeActive: false,
    live2DAppearance: {
      getCurrentModel: () => ({ available: false })
    }
  });

  assert.equal(state.action, 'idle');
  assert.equal(state.appearanceType, 'css-cat');
  assert.equal(Object.hasOwn(state, 'modelId'), false);
  assert.equal(Object.hasOwn(state, 'modelName'), false);
});

test('buildLocalPetState returns null for missing or destroyed windows', () => {
  assert.equal(buildLocalPetState({
    petWindow: null,
    screen: fakeScreen,
    dragModeActive: false,
    live2DAppearance: null
  }), null);
  assert.equal(buildLocalPetState({
    petWindow: { isDestroyed: () => true },
    screen: fakeScreen,
    dragModeActive: false,
    live2DAppearance: null
  }), null);
});
```

- [ ] **Step 2: Run the helper tests and verify they fail**

Run:

```powershell
node --test tests/main/petState.test.js
```

Expected: FAIL because `src/main/petState.js` does not exist.

- [ ] **Step 3: Create `src/main/petState.js`**

Create the file with:

```js
function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function readAppearanceState(live2DAppearance) {
  let currentModel = null;
  try {
    currentModel = live2DAppearance?.getCurrentModel?.();
  } catch (_error) {
    currentModel = null;
  }

  if (!currentModel?.available || !currentModel.id) {
    return { appearanceType: 'css-cat' };
  }

  return {
    appearanceType: 'live2d',
    modelId: String(currentModel.id),
    modelName: String(currentModel.name || currentModel.id)
  };
}

function buildLocalPetState({
  petWindow,
  screen,
  dragModeActive = false,
  live2DAppearance
} = {}) {
  if (!petWindow || petWindow.isDestroyed()) return null;

  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;
  const relativeX = workArea.width > 0
    ? (bounds.x - workArea.x) / workArea.width
    : 0;
  const relativeY = workArea.height > 0
    ? (bounds.y - workArea.y) / workArea.height
    : 0;

  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    relativeX: clamp01(relativeX),
    relativeY: clamp01(relativeY),
    action: dragModeActive ? 'drag' : 'idle',
    facing: 'right',
    ...readAppearanceState(live2DAppearance)
  };
}

module.exports = {
  buildLocalPetState,
  readAppearanceState
};
```

- [ ] **Step 4: Replace the inline helper in `main.js`**

At the imports in `src/main/main.js`, add:

```js
const { buildLocalPetState: createLocalPetState } = require('./petState');
```

Then replace the body of the existing `buildLocalPetState()` function with:

```js
function buildLocalPetState() {
  return createLocalPetState({
    petWindow,
    screen,
    dragModeActive,
    live2DAppearance
  });
}
```

- [ ] **Step 5: Run focused main tests**

Run:

```powershell
node --test tests/main/petState.test.js tests/main/roomClient.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit pet-state helper**

Run:

```powershell
git add src/main/petState.js src/main/main.js tests/main/petState.test.js
git commit -m "Add local pet appearance state"
```

## Task 4: Add Peer Render Mode Selection And Cap

**Files:**
- Modify: `src/main/peerPetWindows.js`
- Modify: `tests/main/peerPetWindows.test.js`

- [ ] **Step 1: Add failing render-mode tests**

Append these tests to `tests/main/peerPetWindows.test.js`:

```js
test('peer pet manager marks only the first three Live2D peers for Live2D rendering', () => {
  const manager = createManager();

  manager.syncPeers([
    { userId: 'a', nickname: 'A', pet: { appearanceType: 'live2d', modelId: 'Haru' } },
    { userId: 'b', nickname: 'B', pet: { appearanceType: 'live2d', modelId: 'Hiyori' } },
    { userId: 'c', nickname: 'C', pet: { appearanceType: 'live2d', modelId: 'Mao' } },
    { userId: 'd', nickname: 'D', pet: { appearanceType: 'live2d', modelId: 'Custom' } }
  ], { x: 100, y: 200, width: 240, height: 180 });

  assert.deepEqual(
    FakeBrowserWindow.instances.map((window) => window.webContents.messages.at(-1).payload.renderMode),
    ['live2d', 'live2d', 'live2d', 'css-cat']
  );
});

test('peer pet manager uses CSS cat render mode for peers without Live2D identity', () => {
  const manager = createManager();

  manager.syncPeers([
    { userId: 'bob', nickname: 'Bob', pet: { action: 'idle' } }
  ], { x: 100, y: 200, width: 240, height: 180 });

  assert.equal(FakeBrowserWindow.instances[0].webContents.messages.at(-1).payload.renderMode, 'css-cat');
});
```

- [ ] **Step 2: Run the peer window tests and verify they fail**

Run:

```powershell
node --test tests/main/peerPetWindows.test.js
```

Expected: FAIL because payloads do not include `renderMode`.

- [ ] **Step 3: Implement render-mode decoration**

In `src/main/peerPetWindows.js`, add near constants:

```js
const MAX_PEER_LIVE2D_WINDOWS = 3;
```

Add helper functions before `createPeerPetWindowManager()`:

```js
function wantsLive2D(peer) {
  return Boolean(peer?.pet?.appearanceType === 'live2d' && peer.pet.modelId);
}

function decoratePeersForRender(peers, maxLive2DWindows = MAX_PEER_LIVE2D_WINDOWS) {
  let live2DCount = 0;
  return peers.map((peer) => {
    const useLive2D = wantsLive2D(peer) && live2DCount < maxLive2DWindows;
    if (useLive2D) {
      live2DCount += 1;
    }
    return {
      ...peer,
      renderMode: useLive2D ? 'live2d' : 'css-cat'
    };
  });
}
```

Change `syncPeers()` from:

```js
const uniquePeers = normalizeUniquePeers(peers);
```

to:

```js
const uniquePeers = decoratePeersForRender(normalizeUniquePeers(peers));
```

Export the helper constants for tests and future use:

```js
module.exports = {
  MAX_PEER_LIVE2D_WINDOWS,
  createPeerPetWindowManager,
  decoratePeersForRender,
  resolveLocalPetAnchorBounds,
  resolvePeerBounds
};
```

- [ ] **Step 4: Update existing payload assertions to include `renderMode`**

In `tests/main/peerPetWindows.test.js`, update deep-equal payloads that compare whole peer objects.

For the first existing window creation assertion, change expected payload to:

```js
payload: {
  userId: 'bob',
  nickname: 'Bob',
  pet: { relativeX: 0.25, relativeY: 0.5, action: 'idle' },
  renderMode: 'css-cat'
}
```

For the duplicate-peer assertion, change expected payload to:

```js
{
  userId: 'bob',
  nickname: 'Bobby',
  pet: { action: 'drag' },
  renderMode: 'css-cat'
}
```

- [ ] **Step 5: Run focused peer window tests**

Run:

```powershell
node --test tests/main/peerPetWindows.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit render-mode selection**

Run:

```powershell
git add src/main/peerPetWindows.js tests/main/peerPetWindows.test.js
git commit -m "Limit peer Live2D render windows"
```

## Task 5: Add Peer Live2D Renderer Shell

**Files:**
- Modify: `src/renderer/peerPet.html`
- Modify: `src/renderer/peerPet.css`
- Create: `src/renderer/peerLive2D.js`
- Modify: `tests/renderer/live2d-appearance.test.js`

- [ ] **Step 1: Add failing static renderer tests**

Append this test to `tests/renderer/live2d-appearance.test.js`:

```js
test('peer pet page includes Live2D canvas, runtime scripts, and fallback classes', () => {
  const html = readSource('src', 'renderer', 'peerPet.html');
  const css = readSource('src', 'renderer', 'peerPet.css');
  const peerLive2D = readSource('src', 'renderer', 'peerLive2D.js');

  assert.match(html, /id="peerLive2DCanvas"/);
  assert.match(html, /vendor\/live2d\/live2dcubismcore\.min\.js/);
  assert.match(html, /vendor\/live2d\/pixi\.min\.js/);
  assert.match(html, /vendor\/live2d\/pixi-live2d-cubism4\.min\.js/);
  assert.ok(
    html.indexOf('peerLive2D.js') < html.indexOf('peerPet.js'),
    'peer Live2D helper must load before peerPet.js'
  );
  assert.match(css, /\.peer-live2d-canvas\s*\{/);
  assert.match(css, /\.peer-stage\.has-live2d\s+\.peer-cat/);
  assert.match(css, /\.peer-stage\.is-drag\s+\.peer-live2d-canvas/);
  assert.match(peerLive2D, /createPeerLive2D/);
  assert.match(peerLive2D, /Live2DModel\.from/);
  assert.match(peerLive2D, /showCssCat/);
});
```

- [ ] **Step 2: Run the static renderer test and verify it fails**

Run:

```powershell
node --test tests/renderer/live2d-appearance.test.js
```

Expected: FAIL because `peerLive2D.js`, canvas, and runtime scripts are absent.

- [ ] **Step 3: Add the peer canvas and scripts**

In `src/renderer/peerPet.html`, insert this canvas inside `.peer-stage`, before `.peer-cat`:

```html
<canvas class="peer-live2d-canvas" id="peerLive2DCanvas" width="160" height="140" aria-hidden="true"></canvas>
```

Then replace the bottom script list with:

```html
<script src="./vendor/live2d/live2dcubismcore.min.js"></script>
<script src="./vendor/live2d/pixi.min.js"></script>
<script src="./vendor/live2d/pixi-live2d-cubism4.min.js"></script>
<script src="./peerLive2D.js"></script>
<script src="./peerPet.js"></script>
```

- [ ] **Step 4: Add peer Live2D CSS**

Append to `src/renderer/peerPet.css`:

```css
.peer-live2d-canvas {
  position: absolute;
  left: 50%;
  top: 18px;
  width: 138px;
  height: 126px;
  transform: translateX(-50%);
  opacity: 0;
  pointer-events: none;
  z-index: 2;
}

.peer-stage.has-live2d .peer-live2d-canvas {
  opacity: 1;
}

.peer-stage.has-live2d .peer-cat {
  opacity: 0;
}

.peer-stage.is-drag .peer-live2d-canvas {
  animation: peer-wiggle 0.8s ease-in-out infinite;
}
```

- [ ] **Step 5: Create `src/renderer/peerLive2D.js`**

Create the file with:

```js
(function initPeerLive2D() {
  function createPeerLive2D({
    canvas,
    stage,
    live2d = window.PIXI?.live2d,
    PixiApplication = window.PIXI?.Application
  } = {}) {
    let pixiApp = null;
    let currentModel = null;
    let currentModelId = null;
    let loadRequestId = 0;

    function hasRuntime() {
      return Boolean(PixiApplication && live2d?.Live2DModel);
    }

    function ensurePixiApp() {
      if (pixiApp) return pixiApp;
      if (!canvas || !PixiApplication) return null;
      canvas.width = 160;
      canvas.height = 140;
      pixiApp = new PixiApplication({
        view: canvas,
        width: canvas.width,
        height: canvas.height,
        transparent: true,
        backgroundAlpha: 0,
        antialias: true,
        autoStart: true
      });
      return pixiApp;
    }

    function fitModelToCanvas(model) {
      const width = model.width || model.internalModel?.width || 1;
      const height = model.height || model.internalModel?.height || 1;
      const scale = Math.min((canvas.width * 0.86) / width, (canvas.height * 0.96) / height);

      model.anchor?.set?.(0.5, 1);
      model.scale?.set?.(scale);
      model.x = canvas.width / 2;
      model.y = canvas.height;
    }

    function clearModel() {
      if (currentModel && pixiApp) {
        pixiApp.stage.removeChild(currentModel);
      }
      currentModel?.destroy?.({ children: true, texture: false, baseTexture: false });
      currentModel = null;
      currentModelId = null;
    }

    function showCssCat() {
      stage?.classList.remove('has-live2d');
      canvas?.setAttribute('aria-hidden', 'true');
    }

    async function loadModel(modelConfig) {
      if (!modelConfig?.available || !modelConfig.modelUrl || !modelConfig.id || !hasRuntime()) {
        clearModel();
        showCssCat();
        return false;
      }

      if (currentModel && currentModelId === modelConfig.id) {
        stage?.classList.add('has-live2d');
        canvas?.setAttribute('aria-hidden', 'false');
        return true;
      }

      const app = ensurePixiApp();
      if (!app) {
        showCssCat();
        return false;
      }

      const requestId = ++loadRequestId;
      let loadedModel;
      try {
        loadedModel = await live2d.Live2DModel.from(modelConfig.modelUrl);
        if (requestId !== loadRequestId) {
          loadedModel.destroy?.({ children: true, texture: false, baseTexture: false });
          return false;
        }

        fitModelToCanvas(loadedModel);
        app.stage.addChild(loadedModel);
      } catch (error) {
        console.warn('Peer Live2D model failed to load.', error);
        loadedModel?.destroy?.({ children: true, texture: false, baseTexture: false });
        if (requestId === loadRequestId) {
          clearModel();
          showCssCat();
        }
        return false;
      }

      clearModel();
      currentModel = loadedModel;
      currentModelId = modelConfig.id;
      stage?.classList.add('has-live2d');
      canvas?.setAttribute('aria-hidden', 'false');
      return true;
    }

    function dispose() {
      loadRequestId += 1;
      clearModel();
      pixiApp?.destroy?.(true, { children: true, texture: false, baseTexture: false });
      pixiApp = null;
      showCssCat();
    }

    return {
      dispose,
      loadModel,
      showCssCat
    };
  }

  window.peerLive2D = {
    createPeerLive2D
  };
})();
```

- [ ] **Step 6: Run focused renderer static tests**

Run:

```powershell
node --test tests/renderer/live2d-appearance.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit peer Live2D shell**

Run:

```powershell
git add src/renderer/peerPet.html src/renderer/peerPet.css src/renderer/peerLive2D.js tests/renderer/live2d-appearance.test.js
git commit -m "Add peer Live2D renderer shell"
```

## Task 6: Connect Peer Updates To Live2D Rendering

**Files:**
- Modify: `src/renderer/peerPet.js`
- Modify: `tests/renderer/live2d-appearance.test.js`

- [ ] **Step 1: Add a failing peer renderer behavior test**

Append this test to `tests/renderer/live2d-appearance.test.js`:

```js
test('peer renderer loads matching Live2D model and falls back to CSS cat', async () => {
  const script = readSource('src', 'renderer', 'peerPet.js');
  let updateHandler = null;
  const classNames = new Set();
  const peerName = { textContent: '' };
  const peerCat = {
    classList: {
      toggle(name, value) {
        if (value) classNames.add(`cat:${name}`);
        else classNames.delete(`cat:${name}`);
      }
    }
  };
  const stage = {
    classList: {
      add(name) {
        classNames.add(`stage:${name}`);
      },
      remove(name) {
        classNames.delete(`stage:${name}`);
      },
      toggle(name, value) {
        if (value) classNames.add(`stage:${name}`);
        else classNames.delete(`stage:${name}`);
      }
    }
  };
  const canvas = {};
  const loadedModels = [];
  let cssFallbacks = 0;
  const fakeWindow = {
    peerPet: {
      onUpdate(callback) {
        updateHandler = callback;
      },
      getLive2DModelById: async (modelId) => (
        modelId === 'Haru'
          ? { available: true, id: 'Haru', name: 'Haru', modelUrl: 'desktop-cat-live2d://model/Haru/Haru.model3.json' }
          : { available: false }
      ),
      getDefaultLive2DModel: async () => ({ available: false })
    },
    peerLive2D: {
      createPeerLive2D: () => ({
        loadModel: async (model) => {
          loadedModels.push(model.id);
          return true;
        },
        showCssCat: () => {
          cssFallbacks += 1;
          stage.classList.remove('has-live2d');
        }
      })
    }
  };
  const fakeDocument = {
    getElementById(id) {
      if (id === 'peerName') return peerName;
      if (id === 'peerCat') return peerCat;
      if (id === 'peerLive2DCanvas') return canvas;
      return null;
    },
    querySelector(selector) {
      return selector === '.peer-stage' ? stage : null;
    }
  };

  vm.runInNewContext(script, {
    window: fakeWindow,
    document: fakeDocument,
    console
  });

  assert.ok(updateHandler, 'peer update handler should be registered');
  await updateHandler({
    userId: 'bob',
    nickname: 'Bob',
    renderMode: 'live2d',
    pet: {
      action: 'drag',
      appearanceType: 'live2d',
      modelId: 'Haru',
      modelName: 'Haru'
    }
  });

  assert.equal(peerName.textContent, 'Bob');
  assert.deepEqual(loadedModels, ['Haru']);
  assert.equal(classNames.has('stage:is-drag'), true);

  await updateHandler({
    userId: 'cora',
    nickname: 'Cora',
    renderMode: 'css-cat',
    pet: { action: 'idle' }
  });

  assert.equal(peerName.textContent, 'Cora');
  assert.equal(cssFallbacks, 1);
  assert.equal(classNames.has('stage:is-drag'), false);
});
```

- [ ] **Step 2: Run the behavior test and verify it fails**

Run:

```powershell
node --test tests/renderer/live2d-appearance.test.js
```

Expected: FAIL because `peerPet.js` does not query or load Live2D models.

- [ ] **Step 3: Replace `peerPet.js` with Live2D-aware orchestration**

Replace `src/renderer/peerPet.js` with:

```js
(() => {
  const peerName = document.getElementById('peerName');
  const peerCat = document.getElementById('peerCat');
  const peerStage = document.querySelector('.peer-stage');
  const peerLive2DCanvas = document.getElementById('peerLive2DCanvas');
  const peerLive2D = window.peerLive2D?.createPeerLive2D?.({
    canvas: peerLive2DCanvas,
    stage: peerStage
  });

  let lastRequestedModelId = null;

  function setCssFallback() {
    lastRequestedModelId = null;
    peerLive2D?.showCssCat?.();
  }

  async function resolvePeerModel(peer) {
    const modelId = peer?.pet?.modelId;
    if (modelId && window.peerPet?.getLive2DModelById) {
      const matched = await window.peerPet.getLive2DModelById(modelId);
      if (matched?.available) return matched;
    }

    if (window.peerPet?.getDefaultLive2DModel) {
      const fallback = await window.peerPet.getDefaultLive2DModel();
      if (fallback?.available) return fallback;
    }

    return { available: false };
  }

  async function applyPeer(peer) {
    if (!peer) return;

    peerName.textContent = peer.nickname || peer.userId || '好友';
    const isDrag = peer.pet?.action === 'drag';
    peerCat.classList.toggle('is-drag', isDrag);
    peerStage?.classList.toggle('is-drag', isDrag);

    const shouldUseLive2D = peer.renderMode === 'live2d' && peer.pet?.appearanceType === 'live2d';
    if (!shouldUseLive2D || !peerLive2D) {
      setCssFallback();
      return;
    }

    const requestedModelId = String(peer.pet?.modelId || '');
    if (!requestedModelId) {
      setCssFallback();
      return;
    }

    const model = await resolvePeerModel(peer);
    if (!model?.available) {
      setCssFallback();
      return;
    }

    if (lastRequestedModelId === model.id) {
      return;
    }

    const loaded = await peerLive2D.loadModel(model);
    if (loaded) {
      lastRequestedModelId = model.id;
    } else {
      setCssFallback();
    }
  }

  window.peerPet?.onUpdate?.((peer) => {
    applyPeer(peer).catch((error) => {
      console.warn('Peer pet update failed.', error);
      setCssFallback();
    });
  });
})();
```

- [ ] **Step 4: Run focused renderer behavior tests**

Run:

```powershell
node --test tests/renderer/live2d-appearance.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit peer update orchestration**

Run:

```powershell
git add src/renderer/peerPet.js tests/renderer/live2d-appearance.test.js
git commit -m "Render peer updates as Live2D when available"
```

## Task 7: Full Verification And Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-05-peer-live2d-sync-design.md`

- [ ] **Step 1: Add README note for peer Live2D behavior**

In `README.md`, under `### 好友同屏`, add this paragraph after the existing room description:

```markdown
好友同屏会同步当前形象标识。若双方本机都有相同 ID 的 Live2D 模型，好友会优先以 Live2D 形象显示；若模型缺失、运行时不可用或房间内 Live2D 好友数量超过性能上限，会自动回退为轻量 CSS 小猫。
```

- [ ] **Step 2: Update the design status**

In `docs/superpowers/specs/2026-07-05-peer-live2d-sync-design.md`, change:

```markdown
> 状态：已批准进入规格阶段
```

to:

```markdown
> 状态：已实现
```

- [ ] **Step 3: Run the full test suite**

Run:

```powershell
npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Check git diff hygiene**

Run:

```powershell
git diff --check
```

Expected: no output.

- [ ] **Step 5: Review final changed files**

Run:

```powershell
git status --short
git diff --stat
```

Expected: only intended files from this plan are modified.

- [ ] **Step 6: Commit docs and verification-ready state**

Run:

```powershell
git add README.md docs/superpowers/specs/2026-07-05-peer-live2d-sync-design.md
git commit -m "Document peer Live2D sync behavior"
```

## Self-Review

- Spec coverage: protocol fields, local state reporting, service sanitization, peer window Live2D loading, fallback behavior, performance cap, and tests are each mapped to a task.
- Placeholder scan: this plan contains no placeholder steps or undefined follow-up work.
- Type consistency: the plan consistently uses `appearanceType`, `modelId`, `modelName`, and `renderMode`; renderer and main-process APIs match the names exposed through `peerPreload.js`.

