const { normalizeCatScale } = require('../renderer/petBehavior');

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

  const appearanceType = currentModel.kind === 'codex-pet' ? 'codex-pet' : 'live2d';

  return {
    appearanceType,
    modelId: String(currentModel.id),
    modelName: String(currentModel.name || currentModel.id)
  };
}

function buildLocalPetState({
  petWindow,
  dragModeActive = false,
  catScale = 1,
  live2DAppearance
} = {}) {
  if (!petWindow || petWindow.isDestroyed()) return null;

  return {
    scale: normalizeCatScale(catScale),
    action: dragModeActive ? 'drag' : 'idle',
    facing: 'right',
    ...readAppearanceState(live2DAppearance)
  };
}

module.exports = {
  buildLocalPetState,
  readAppearanceState
};
