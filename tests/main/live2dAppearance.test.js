const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  LIVE2D_PROTOCOL,
  createLive2DAppearance,
  createLive2DModelUrl,
  discoverLive2DModel,
  discoverLive2DModels,
  resolveLive2DProtocolPath,
  resolveLive2DSearchRoots
} = require('../../src/main/live2dAppearance');

function makeTempRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-live2d-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeModel(root, relativePath, name = 'Hiyori') {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      Version: 3,
      Name: name,
      FileReferences: {
        Moc: 'model.moc3',
        Textures: ['textures/texture_00.png']
      }
    }),
    'utf-8'
  );
  return filePath;
}

test('resolveLive2DSearchRoots prefers the packaged executable live2d folder', () => {
  const roots = resolveLive2DSearchRoots({
    isPackaged: true,
    execPath: 'C:\\Portable\\desktop-cat.exe',
    cwd: 'E:\\dev\\desktop-cat',
    userDataDir: 'C:\\Users\\me\\AppData\\Roaming\\desktop-cat',
    builtInModelsDir: 'E:\\dev\\desktop-cat\\src\\renderer\\live2d-models'
  });

  assert.deepEqual(roots, [
    path.join('C:\\Portable', 'live2d'),
    path.join('E:\\dev\\desktop-cat', 'live2d'),
    path.join('C:\\Users\\me\\AppData\\Roaming\\desktop-cat', 'live2d'),
    path.join('E:\\dev\\desktop-cat\\src\\renderer\\live2d-models')
  ]);
});

test('resolveLive2DSearchRoots prefers portable executable directory for external live2d assets', () => {
  const roots = resolveLive2DSearchRoots({
    isPackaged: true,
    portableExecutableDir: 'D:\\Apps\\desktop-cat',
    execPath: 'C:\\Users\\me\\AppData\\Local\\Temp\\desktop-cat-portable\\desktop-cat.exe',
    cwd: 'E:\\dev\\desktop-cat',
    userDataDir: 'C:\\Users\\me\\AppData\\Roaming\\desktop-cat',
    builtInModelsDir: 'E:\\dev\\desktop-cat\\src\\renderer\\live2d-models'
  });

  assert.deepEqual(roots, [
    path.join('D:\\Apps\\desktop-cat', 'live2d'),
    path.join('C:\\Users\\me\\AppData\\Local\\Temp\\desktop-cat-portable', 'live2d'),
    path.join('E:\\dev\\desktop-cat', 'live2d'),
    path.join('C:\\Users\\me\\AppData\\Roaming\\desktop-cat', 'live2d'),
    path.join('E:\\dev\\desktop-cat\\src\\renderer\\live2d-models')
  ]);
});

test('discoverLive2DModel finds the first model3.json in configured folders', (t) => {
  const root = makeTempRoot(t);
  const live2dRoot = path.join(root, 'live2d');
  const modelJsonPath = writeModel(live2dRoot, path.join('hiyori', 'hiyori.model3.json'), 'Hiyori');

  const model = discoverLive2DModel({ searchRoots: [live2dRoot] });

  assert.equal(model.available, true);
  assert.equal(model.name, 'Hiyori');
  assert.equal(model.rootDir, path.dirname(modelJsonPath));
  assert.equal(model.modelJsonPath, modelJsonPath);
  assert.equal(model.modelUrl, `${LIVE2D_PROTOCOL}://model/hiyori/hiyori.model3.json`);
  assert.equal(model.previewImageUrl, `${LIVE2D_PROTOCOL}://model/hiyori/textures/texture_00.png`);
});

test('discoverLive2DModel prefers a dedicated preview image over texture atlases', (t) => {
  const root = makeTempRoot(t);
  const live2dRoot = path.join(root, 'live2d');
  const modelJsonPath = writeModel(live2dRoot, path.join('hiyori', 'hiyori.model3.json'), 'Hiyori');
  const previewPath = path.join(path.dirname(modelJsonPath), 'preview.png');
  fs.writeFileSync(previewPath, 'preview');

  const model = discoverLive2DModel({ searchRoots: [live2dRoot] });

  assert.equal(model.previewImagePath, previewPath);
  assert.equal(model.previewImageUrl, `${LIVE2D_PROTOCOL}://model/hiyori/preview.png`);
});

test('discoverLive2DModels lists multiple models while keeping external folders first', (t) => {
  const root = makeTempRoot(t);
  const externalRoot = path.join(root, 'live2d');
  const builtInRoot = path.join(root, 'src', 'renderer', 'live2d-models');
  const externalModelPath = writeModel(externalRoot, path.join('custom', 'custom.model3.json'), 'Custom');
  const hiyoriModelPath = writeModel(builtInRoot, path.join('Hiyori', 'Hiyori.model3.json'), 'Hiyori');
  const maoModelPath = writeModel(builtInRoot, path.join('Mao', 'Mao.model3.json'), 'Mao');

  const models = discoverLive2DModels({ searchRoots: [externalRoot, builtInRoot] });

  assert.deepEqual(models.map((model) => model.name), ['Custom', 'Hiyori', 'Mao']);
  assert.equal(models[0].rootDir, path.dirname(externalModelPath));
  assert.equal(models[1].rootDir, path.dirname(hiyoriModelPath));
  assert.equal(models[2].rootDir, path.dirname(maoModelPath));
  assert.equal(discoverLive2DModel({ searchRoots: [externalRoot, builtInRoot] }).name, 'Custom');
});

test('discoverLive2DModels gives every model an isolated protocol url for previews', (t) => {
  const root = makeTempRoot(t);
  const builtInRoot = path.join(root, 'src', 'renderer', 'live2d-models');
  const hiyoriModelPath = writeModel(builtInRoot, path.join('Hiyori', 'Hiyori.model3.json'), 'Hiyori');
  const maoModelPath = writeModel(builtInRoot, path.join('Mao', 'Mao.model3.json'), 'Mao');

  const models = discoverLive2DModels({ searchRoots: [builtInRoot] });

  assert.equal(models[0].modelUrl, `${LIVE2D_PROTOCOL}://model/Hiyori/Hiyori.model3.json`);
  assert.equal(models[1].modelUrl, `${LIVE2D_PROTOCOL}://model/Mao/Mao.model3.json`);
  assert.equal(models[0].previewImageUrl, `${LIVE2D_PROTOCOL}://model/Hiyori/textures/texture_00.png`);
  assert.equal(models[1].previewImageUrl, `${LIVE2D_PROTOCOL}://model/Mao/textures/texture_00.png`);
  assert.equal(
    resolveLive2DProtocolPath({ availableModels: models, currentModel: models[0] }, models[0].modelUrl),
    hiyoriModelPath
  );
  assert.equal(
    resolveLive2DProtocolPath({ availableModels: models, currentModel: models[0] }, models[1].modelUrl),
    maoModelPath
  );
  assert.equal(
    resolveLive2DProtocolPath(
      { availableModels: models, currentModel: models[0] },
      `${models[0].modelUrl}?desktopCatPreview=1`
    ),
    hiyoriModelPath
  );
  assert.equal(
    resolveLive2DProtocolPath({ availableModels: models, currentModel: models[0] }, models[0].previewImageUrl),
    path.join(path.dirname(hiyoriModelPath), 'textures', 'texture_00.png')
  );
  assert.equal(
    resolveLive2DProtocolPath({ availableModels: models, currentModel: models[0] }, models[1].previewImageUrl),
    path.join(path.dirname(maoModelPath), 'textures', 'texture_00.png')
  );
});

test('resolveLive2DProtocolPath keeps encoded nested model ids separate from asset paths', (t) => {
  const root = makeTempRoot(t);
  const live2dRoot = path.join(root, 'live2d');
  const modelJsonPath = writeModel(
    live2dRoot,
    path.join('custom', 'nested', 'avatar.model3.json'),
    'Nested Avatar'
  );
  const [model] = discoverLive2DModels({ searchRoots: [live2dRoot] });

  assert.equal(model.id, 'custom/nested');
  assert.equal(model.modelUrl, `${LIVE2D_PROTOCOL}://model/custom%2Fnested/avatar.model3.json`);
  assert.equal(
    resolveLive2DProtocolPath({ availableModels: [model], currentModel: model }, model.modelUrl),
    modelJsonPath
  );
});

test('discoverLive2DModel reports unavailable when no model3.json exists', (t) => {
  const root = makeTempRoot(t);
  fs.mkdirSync(path.join(root, 'live2d'), { recursive: true });

  const model = discoverLive2DModel({ searchRoots: [path.join(root, 'live2d')] });

  assert.deepEqual(model, { available: false });
});

test('resolveLive2DProtocolPath only serves files inside the active model folder', (t) => {
  const root = makeTempRoot(t);
  const live2dRoot = path.join(root, 'live2d');
  const modelJsonPath = writeModel(live2dRoot, path.join('model', 'avatar.model3.json'), 'Avatar');
  const model = discoverLive2DModel({ searchRoots: [live2dRoot] });
  const texturePath = path.join(path.dirname(modelJsonPath), 'textures', 'texture_00.png');
  fs.mkdirSync(path.dirname(texturePath), { recursive: true });
  fs.writeFileSync(texturePath, 'texture');

  assert.equal(
    createLive2DModelUrl(model.rootDir, texturePath),
    `${LIVE2D_PROTOCOL}://active/textures/texture_00.png`
  );
  assert.equal(
    resolveLive2DProtocolPath(model, `${LIVE2D_PROTOCOL}://active/textures/texture_00.png`),
    texturePath
  );
  assert.equal(
    resolveLive2DProtocolPath(model, `${LIVE2D_PROTOCOL}://active/../secret.txt`),
    null
  );
  assert.equal(
    resolveLive2DProtocolPath({ available: false }, `${LIVE2D_PROTOCOL}://active/avatar.model3.json`),
    null
  );
});

test('createLive2DAppearance can switch the current Live2D model by id', (t) => {
  const root = makeTempRoot(t);
  const modelsRoot = path.join(root, 'live2d-models');
  writeModel(modelsRoot, path.join('Hiyori', 'Hiyori.model3.json'), 'Hiyori');
  writeModel(modelsRoot, path.join('Mao', 'Mao.model3.json'), 'Mao');
  const registeredProtocols = [];
  const appearance = createLive2DAppearance({
    app: {
      isPackaged: false,
      getPath: () => path.join(root, 'userData')
    },
    protocol: {
      registerFileProtocol: (scheme, handler) => registeredProtocols.push({ scheme, handler })
    },
    searchRoots: [modelsRoot]
  });

  assert.equal(appearance.getCurrentModel().id, 'Hiyori');
  assert.equal(appearance.getCurrentModel().previewImageUrl, `${LIVE2D_PROTOCOL}://model/Hiyori/textures/texture_00.png`);
  assert.deepEqual(appearance.getAvailableModels().map((model) => model.id), ['Hiyori', 'Mao']);
  assert.deepEqual(
    appearance.getAvailableModels().map((model) => model.previewImageUrl),
    [
      `${LIVE2D_PROTOCOL}://model/Hiyori/textures/texture_00.png`,
      `${LIVE2D_PROTOCOL}://model/Mao/textures/texture_00.png`
    ]
  );
  assert.equal(appearance.setCurrentModel('Mao').id, 'Mao');
  assert.equal(appearance.getCurrentModel().id, 'Mao');
  assert.equal(appearance.setCurrentModel('missing').available, false);
  assert.equal(appearance.getCurrentModel().id, 'Mao');
  appearance.registerProtocol();
  assert.equal(registeredProtocols[0].scheme, LIVE2D_PROTOCOL);
});
