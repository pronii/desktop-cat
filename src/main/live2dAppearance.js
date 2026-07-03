const fs = require('node:fs');
const path = require('node:path');

const LIVE2D_PROTOCOL = 'desktop-cat-live2d';
const MODEL_JSON_PATTERN = /\.model3\.json$/i;
const MAX_SEARCH_DEPTH = 4;
const BUILT_IN_LIVE2D_MODELS_DIR = path.join(__dirname, '..', 'renderer', 'live2d-models');

function uniquePaths(paths) {
  const seen = new Set();
  const result = [];

  for (const value of paths) {
    if (!value) continue;
    const resolved = path.resolve(value);
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(resolved);
  }

  return result;
}

function resolveLive2DSearchRoots({
  isPackaged = false,
  portableExecutableDir = process.env.PORTABLE_EXECUTABLE_DIR,
  execPath = process.execPath,
  cwd = process.cwd(),
  userDataDir,
  builtInModelsDir = BUILT_IN_LIVE2D_MODELS_DIR
} = {}) {
  const roots = [];

  if (isPackaged && portableExecutableDir) {
    roots.push(path.join(portableExecutableDir, 'live2d'));
  }

  if (isPackaged && execPath) {
    roots.push(path.join(path.dirname(execPath), 'live2d'));
  }

  if (cwd) {
    roots.push(path.join(cwd, 'live2d'));
  }

  if (userDataDir) {
    roots.push(path.join(userDataDir, 'live2d'));
  }

  if (builtInModelsDir) {
    roots.push(builtInModelsDir);
  }

  return uniquePaths(roots);
}

function findModelJsons(rootDir, depth = 0) {
  if (depth > MAX_SEARCH_DEPTH) return [];
  let entries;

  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch (_error) {
    return [];
  }

  const files = entries
    .filter((entry) => entry.isFile() && MODEL_JSON_PATTERN.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const found = files.map((file) => path.join(rootDir, file.name));

  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const dir of dirs) {
    found.push(...findModelJsons(path.join(rootDir, dir.name), depth + 1));
  }

  return found;
}

function readModelName(modelJsonPath) {
  try {
    const json = JSON.parse(fs.readFileSync(modelJsonPath, 'utf-8'));
    return typeof json.Name === 'string' && json.Name.trim()
      ? json.Name.trim()
      : path.basename(path.dirname(modelJsonPath));
  } catch (_error) {
    return path.basename(path.dirname(modelJsonPath));
  }
}

function createLive2DModelUrl(modelRootDir, filePath) {
  const relative = path.relative(modelRootDir, filePath);
  const parts = relative.split(path.sep).filter(Boolean).map(encodeURIComponent);
  return `${LIVE2D_PROTOCOL}://active/${parts.join('/')}`;
}

function createLive2DModelRecord(searchRoot, modelJsonPath) {
  const rootDir = path.dirname(modelJsonPath);
  const relativeRoot = path.relative(searchRoot, rootDir);
  const id = relativeRoot && !relativeRoot.startsWith('..')
    ? relativeRoot.split(path.sep).filter(Boolean).join('/')
    : path.basename(rootDir);

  return {
    available: true,
    id,
    name: readModelName(modelJsonPath),
    rootDir,
    modelJsonPath,
    modelUrl: createLive2DModelUrl(rootDir, modelJsonPath)
  };
}

function discoverLive2DModels({ searchRoots = [] } = {}) {
  const models = [];
  const seen = new Set();

  for (const root of searchRoots) {
    for (const modelJsonPath of findModelJsons(root)) {
      const key = process.platform === 'win32'
        ? path.resolve(modelJsonPath).toLowerCase()
        : path.resolve(modelJsonPath);
      if (seen.has(key)) continue;
      seen.add(key);
      models.push(createLive2DModelRecord(root, modelJsonPath));
    }
  }

  return models;
}

function discoverLive2DModel({ searchRoots = [] } = {}) {
  const [model] = discoverLive2DModels({ searchRoots });
  if (model) {
    return model;
  }

  return { available: false };
}

function isInsidePath(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveLive2DProtocolPath(model, requestUrl) {
  if (!model?.available || !model.rootDir) return null;

  const rawPath = String(requestUrl).split(`${LIVE2D_PROTOCOL}://active/`)[1] || '';
  const decodedRawPath = decodeURIComponent(rawPath.split(/[?#]/)[0] || '');
  if (decodedRawPath.split('/').some((part) => part === '..' || part.includes('\\'))) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(requestUrl);
  } catch (_error) {
    return null;
  }

  if (parsed.protocol !== `${LIVE2D_PROTOCOL}:` || parsed.hostname !== 'active') {
    return null;
  }

  const relativePath = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  const parts = relativePath.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '..' || part.includes('\\'))) {
    return null;
  }

  const resolved = path.resolve(model.rootDir, ...parts);
  return isInsidePath(resolved, model.rootDir) ? resolved : null;
}

function createLive2DAppearance({ app, protocol }) {
  let currentModel = { available: false };
  let availableModels = [];

  function refresh() {
    const searchRoots = resolveLive2DSearchRoots({
      isPackaged: app.isPackaged,
      portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR,
      execPath: process.execPath,
      cwd: process.cwd(),
      userDataDir: app.getPath('userData')
    });
    availableModels = discoverLive2DModels({ searchRoots });
    currentModel = availableModels[0] || { available: false };
    return currentModel;
  }

  function serializeModel(model) {
    return {
      available: true,
      id: model.id,
      name: model.name,
      modelUrl: model.modelUrl
    };
  }

  function getCurrentModel() {
    if (!currentModel.available) {
      refresh();
    }

    if (!currentModel.available) {
      return { available: false };
    }

    return serializeModel(currentModel);
  }

  function getAvailableModels() {
    if (!availableModels.length) {
      refresh();
    }

    return availableModels.map(serializeModel);
  }

  function registerProtocol() {
    protocol.registerFileProtocol(LIVE2D_PROTOCOL, (request, callback) => {
      const filePath = resolveLive2DProtocolPath(currentModel, request.url);
      if (!filePath) {
        callback({ error: -6 });
        return;
      }
      callback({ path: filePath });
    });
  }

  return {
    getAvailableModels,
    getCurrentModel,
    refresh,
    registerProtocol
  };
}

module.exports = {
  LIVE2D_PROTOCOL,
  createLive2DAppearance,
  createLive2DModelUrl,
  discoverLive2DModel,
  discoverLive2DModels,
  resolveLive2DProtocolPath,
  resolveLive2DSearchRoots
};
