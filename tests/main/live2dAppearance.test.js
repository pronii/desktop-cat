const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  LIVE2D_PROTOCOL,
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
  assert.equal(model.modelUrl, `${LIVE2D_PROTOCOL}://active/hiyori.model3.json`);
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
