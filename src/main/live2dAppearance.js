const fs = require('node:fs');
const path = require('node:path');

const LIVE2D_PROTOCOL = 'desktop-cat-live2d';
const MODEL_JSON_PATTERN = /\.model3\.json$/i;
const CODEX_PET_JSON = 'pet.json';
const CODEX_PET_KIND = 'codex-pet';
const MAX_SEARCH_DEPTH = 4;
const BUILT_IN_LIVE2D_MODELS_DIR = path.join(__dirname, '..', 'renderer', 'live2d-models');
const BUILT_IN_CODEX_PETS_DIR = path.join(__dirname, '..', 'renderer', 'codex-pets');

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

function resolveCodexPetSearchRoots({
  isPackaged = false,
  portableExecutableDir = process.env.PORTABLE_EXECUTABLE_DIR,
  execPath = process.execPath,
  cwd = process.cwd(),
  userDataDir,
  builtInCodexPetsDir = BUILT_IN_CODEX_PETS_DIR
} = {}) {
  const roots = [];

  if (isPackaged && portableExecutableDir) {
    roots.push(path.join(portableExecutableDir, 'codex-pets'));
  }

  if (isPackaged && execPath) {
    roots.push(path.join(path.dirname(execPath), 'codex-pets'));
  }

  if (cwd) {
    roots.push(path.join(cwd, 'codex-pets'));
  }

  if (userDataDir) {
    roots.push(path.join(userDataDir, 'codex-pets'));
  }

  if (builtInCodexPetsDir) {
    roots.push(builtInCodexPetsDir);
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

function findCodexPetJsons(rootDir, depth = 0) {
  if (depth > MAX_SEARCH_DEPTH) return [];
  let entries;

  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch (_error) {
    return [];
  }

  const petJson = entries.find((entry) => entry.isFile() && entry.name === CODEX_PET_JSON);
  const found = petJson ? [path.join(rootDir, CODEX_PET_JSON)] : [];

  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const dir of dirs) {
    found.push(...findCodexPetJsons(path.join(rootDir, dir.name), depth + 1));
  }

  return found;
}

function readJson(jsonPath) {
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch (_error) {
    return null;
  }
}

function readModelJson(modelJsonPath) {
  return readJson(modelJsonPath);
}

function readModelName(modelJsonPath, modelJson) {
  return typeof modelJson?.Name === 'string' && modelJson.Name.trim()
    ? modelJson.Name.trim()
    : path.basename(path.dirname(modelJsonPath));
}

function readFirstTexturePath(modelJson) {
  const textures = modelJson?.FileReferences?.Textures;
  if (!Array.isArray(textures)) return null;

  const texturePath = textures.find((texture) => typeof texture === 'string' && texture.trim());
  return texturePath ? texturePath.trim() : null;
}

function findDedicatedPreviewImagePath(modelRootDir) {
  const names = ['preview', 'thumbnail', 'thumb', 'cover'];
  const extensions = ['.png', '.jpg', '.jpeg', '.webp'];

  for (const name of names) {
    for (const extension of extensions) {
      const filePath = path.join(modelRootDir, `${name}${extension}`);
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }
  }

  return null;
}

function resolveModelAssetPath(modelRootDir, assetPath) {
  if (typeof assetPath !== 'string' || !assetPath.trim()) return null;

  const relativeAssetPath = assetPath.trim();
  if (path.isAbsolute(relativeAssetPath)) return null;

  const resolved = path.resolve(modelRootDir, relativeAssetPath);
  return isInsidePath(resolved, modelRootDir) ? resolved : null;
}

function createLive2DModelUrl(modelRootDir, filePath, modelId = 'active') {
  const relative = path.relative(modelRootDir, filePath);
  const parts = relative.split(path.sep).filter(Boolean).map(encodeURIComponent);
  if (modelId === 'active') {
    return `${LIVE2D_PROTOCOL}://active/${parts.join('/')}`;
  }
  return `${LIVE2D_PROTOCOL}://model/${encodeURIComponent(modelId)}/${parts.join('/')}`;
}

function createLive2DModelRecord(searchRoot, modelJsonPath) {
  const rootDir = path.dirname(modelJsonPath);
  const relativeRoot = path.relative(searchRoot, rootDir);
  const id = relativeRoot && !relativeRoot.startsWith('..')
    ? relativeRoot.split(path.sep).filter(Boolean).join('/')
    : path.basename(rootDir);
  const modelJson = readModelJson(modelJsonPath);
  const previewImagePath = findDedicatedPreviewImagePath(rootDir)
    || resolveModelAssetPath(rootDir, readFirstTexturePath(modelJson));
  const model = {
    available: true,
    id,
    name: readModelName(modelJsonPath, modelJson),
    rootDir,
    modelJsonPath,
    modelUrl: createLive2DModelUrl(rootDir, modelJsonPath, id)
  };

  if (previewImagePath) {
    model.previewImagePath = previewImagePath;
    model.previewImageUrl = createLive2DModelUrl(rootDir, previewImagePath, id);
  }

  return model;
}

function readCodexPetName(petJsonPath, petJson, submissionJson) {
  const displayName = petJson?.displayName || petJson?.name || submissionJson?.name;
  return typeof displayName === 'string' && displayName.trim()
    ? displayName.trim()
    : path.basename(path.dirname(petJsonPath));
}

function readCodexPetSlug(petJsonPath, petJson, submissionJson) {
  const slug = petJson?.id || submissionJson?.slug || path.basename(path.dirname(petJsonPath));
  return typeof slug === 'string' && slug.trim()
    ? slug.trim()
    : path.basename(path.dirname(petJsonPath));
}

function normalizeCodexPetActionMap(actionMap) {
  if (!Array.isArray(actionMap)) return null;

  const normalized = [];
  for (const action of actionMap) {
    const row = Number(action?.row);
    const frames = Number(action?.frames);
    const state = typeof action?.state === 'string' ? action.state.trim() : '';
    if (!state || !Number.isInteger(row) || row < 1 || !Number.isInteger(frames) || frames < 1) {
      continue;
    }

    const entry = { row, state, frames };
    if (typeof action.meaning === 'string' && action.meaning.trim()) {
      entry.meaning = action.meaning.trim();
    }
    normalized.push(entry);
  }

  return normalized.length ? normalized : null;
}
function createCodexPetRecord(_searchRoot, petJsonPath) {
  const rootDir = path.dirname(petJsonPath);
  const petJson = readJson(petJsonPath);
  if (!petJson) return null;

  const submissionJson = readJson(path.join(rootDir, 'submission.json')) || {};
  const spritesheetRelativePath = petJson.spritesheetPath
    || submissionJson.codex_install?.spritesheet
    || 'spritesheet.webp';
  const spritesheetPath = resolveModelAssetPath(rootDir, spritesheetRelativePath);
  if (!spritesheetPath || !fs.existsSync(spritesheetPath)) return null;

  const id = `${CODEX_PET_KIND}/${readCodexPetSlug(petJsonPath, petJson, submissionJson)}`;
  const model = {
    available: true,
    kind: CODEX_PET_KIND,
    id,
    name: readCodexPetName(petJsonPath, petJson, submissionJson),
    rootDir,
    modelJsonPath: petJsonPath,
    spritesheetPath,
    modelUrl: createLive2DModelUrl(rootDir, petJsonPath, id),
    spritesheetUrl: createLive2DModelUrl(rootDir, spritesheetPath, id),
    previewImagePath: spritesheetPath,
    previewImageUrl: createLive2DModelUrl(rootDir, spritesheetPath, id)
  };

  if (typeof submissionJson.license === 'string' && submissionJson.license.trim()) {
    model.license = submissionJson.license.trim();
  }
  if (typeof submissionJson.author === 'string' && submissionJson.author.trim()) {
    model.author = submissionJson.author.trim();
  }
  if (typeof submissionJson.primary_category === 'string' && submissionJson.primary_category.trim()) {
    model.category = submissionJson.primary_category.trim();
  }
  const actionMap = normalizeCodexPetActionMap(submissionJson.action_map);
  if (actionMap) {
    model.actionMap = actionMap;
  }

  return model;
}

function discoverLive2DModels({ searchRoots = [], codexPetRoots = [] } = {}) {
  const models = [];
  const seen = new Set();

  function pushIfNew(filePath, createRecord, root) {
    const key = process.platform === 'win32'
      ? path.resolve(filePath).toLowerCase()
      : path.resolve(filePath);
    if (seen.has(key)) return;
    seen.add(key);
    const model = createRecord(root, filePath);
    if (model) {
      models.push(model);
    }
  }

  for (const root of searchRoots) {
    for (const modelJsonPath of findModelJsons(root)) {
      pushIfNew(modelJsonPath, createLive2DModelRecord, root);
    }
  }

  for (const root of codexPetRoots) {
    for (const petJsonPath of findCodexPetJsons(root)) {
      pushIfNew(petJsonPath, createCodexPetRecord, root);
    }
  }

  return models;
}

function discoverLive2DModel({ searchRoots = [], codexPetRoots = [] } = {}) {
  const [model] = discoverLive2DModels({ searchRoots, codexPetRoots });
  if (model) {
    return model;
  }

  return { available: false };
}

function isInsidePath(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function getProtocolModel(protocolState, requestUrl) {
  if (protocolState?.available && protocolState.rootDir) {
    return protocolState;
  }

  const rawPath = String(requestUrl).split(`${LIVE2D_PROTOCOL}://active/`)[1] || '';
  if (rawPath) {
    return protocolState?.currentModel || null;
  }

  let parsed;
  try {
    parsed = new URL(requestUrl);
  } catch (_error) {
    return null;
  }

  if (parsed.protocol !== `${LIVE2D_PROTOCOL}:` || parsed.hostname !== 'active') {
    if (parsed.protocol !== `${LIVE2D_PROTOCOL}:` || parsed.hostname !== 'model') {
      return null;
    }
    const modelId = decodeURIComponent(parsed.pathname.split('/').filter(Boolean)[0] || '');
    return (protocolState?.availableModels || []).find((model) => model.id === modelId) || null;
  }

  return protocolState?.currentModel || null;
}

function getProtocolRelativeParts(requestUrl) {
  const activePrefix = `${LIVE2D_PROTOCOL}://active/`;
  const rawActivePath = String(requestUrl).split(activePrefix)[1] || '';
  if (rawActivePath) {
    const decodedRawPath = decodeURIComponent(rawActivePath.split(/[?#]/)[0] || '');
    if (decodedRawPath.split('/').some((part) => part === '..' || part.includes('\\'))) {
      return null;
    }
  }

  let parsed;
  try {
    parsed = new URL(requestUrl);
  } catch (_error) {
    return null;
  }

  if (parsed.protocol !== `${LIVE2D_PROTOCOL}:`) return null;

  let pathname = parsed.pathname.replace(/^\/+/, '');
  if (parsed.hostname === 'model') {
    const parts = pathname.split('/').filter(Boolean);
    parts.shift();
    pathname = parts.map((part) => decodeURIComponent(part)).join('/');
  } else if (parsed.hostname !== 'active') {
    return null;
  } else {
    pathname = decodeURIComponent(pathname);
  }

  const relativePath = pathname;
  const parts = relativePath.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '..' || part.includes('\\'))) {
    return null;
  }
  return parts;
}

function resolveLive2DProtocolPath(protocolState, requestUrl) {
  const model = getProtocolModel(protocolState, requestUrl);
  if (!model?.available || !model.rootDir) return null;

  const parts = getProtocolRelativeParts(requestUrl);
  if (!parts) return null;

  const resolved = path.resolve(model.rootDir, ...parts);
  return isInsidePath(resolved, model.rootDir) ? resolved : null;
}

function createLive2DAppearance({ app, protocol, searchRoots: configuredSearchRoots, codexPetRoots: configuredCodexPetRoots } = {}) {
  let currentModel = { available: false };
  let availableModels = [];

  function refresh() {
    const searchRoots = configuredSearchRoots || resolveLive2DSearchRoots({
        isPackaged: app.isPackaged,
        portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR,
        execPath: process.execPath,
        cwd: process.cwd(),
        userDataDir: app.getPath('userData')
      });
    const codexPetRoots = configuredCodexPetRoots || (configuredSearchRoots ? [] : resolveCodexPetSearchRoots({
        isPackaged: app.isPackaged,
        portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR,
        execPath: process.execPath,
        cwd: process.cwd(),
        userDataDir: app.getPath('userData')
      }));
    availableModels = discoverLive2DModels({ searchRoots, codexPetRoots });
    const currentId = currentModel.available ? currentModel.id : null;
    currentModel = availableModels.find((model) => model.id === currentId) || availableModels[0] || { available: false };
    return currentModel;
  }

  function serializeModel(model) {
    const serialized = {
      available: true,
      id: model.id,
      name: model.name,
      modelUrl: model.modelUrl
    };

    if (model.kind) {
      serialized.kind = model.kind;
    }
    if (model.previewImageUrl) {
      serialized.previewImageUrl = model.previewImageUrl;
    }
    if (model.spritesheetUrl) {
      serialized.spritesheetUrl = model.spritesheetUrl;
    }
    if (model.license) {
      serialized.license = model.license;
    }
    if (model.author) {
      serialized.author = model.author;
    }
    if (model.category) {
      serialized.category = model.category;
    }
    if (model.actionMap) {
      serialized.actionMap = model.actionMap;
    }

    return serialized;
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

  function getModelById(modelId) {
    if (!availableModels.length) {
      refresh();
    }

    const normalizedId = String(modelId || '').trim();
    const model = availableModels.find((entry) => entry.id === normalizedId);
    return model ? serializeModel(model) : { available: false };
  }

  function setCurrentModel(modelId) {
    if (!availableModels.length) {
      refresh();
    }

    const nextModel = availableModels.find((model) => model.id === modelId);
    if (!nextModel) {
      return { available: false };
    }

    currentModel = nextModel;
    return serializeModel(currentModel);
  }

  function registerProtocol() {
    protocol.registerFileProtocol(LIVE2D_PROTOCOL, (request, callback) => {
      const filePath = resolveLive2DProtocolPath(
        {
          currentModel,
          availableModels
        },
        request.url
      );
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
    getModelById,
    refresh,
    registerProtocol,
    setCurrentModel
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
