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
