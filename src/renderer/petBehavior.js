function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const CAT_SCALE_MIN = 0.5;
const CAT_SCALE_MAX = 1.25;
const CAT_SCALE_STEP = 0.1;
const CAT_SCALE_DEFAULT = 1;
const CAT_SCALE_DRAG_PIXELS = 300;
const CAT_SCALE_COMPACT_MAX = 0.9;

function normalizeCatScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return CAT_SCALE_DEFAULT;

  const rounded = Math.round(numeric * 1000) / 1000;
  return clamp(rounded, CAT_SCALE_MIN, CAT_SCALE_MAX);
}

function stepCatScale(value, direction) {
  const stepDirection = Number(direction) >= 0 ? 1 : -1;
  return normalizeCatScale(normalizeCatScale(value) + stepDirection * CAT_SCALE_STEP);
}

function scaleFromDragDelta(startScale, deltaX, pixelsPerScale = CAT_SCALE_DRAG_PIXELS) {
  const pixels = Number(pixelsPerScale);
  const divisor = Number.isFinite(pixels) && pixels > 0 ? pixels : CAT_SCALE_DRAG_PIXELS;
  return normalizeCatScale(normalizeCatScale(startScale) + Number(deltaX || 0) / divisor);
}

function shouldUseCompactControls(scale) {
  return normalizeCatScale(scale) <= CAT_SCALE_COMPACT_MAX;
}

function formatCatScale(value) {
  return `${Math.round(normalizeCatScale(value) * 100)}%`;
}

function createHappyState({ now = Date.now(), duration = 900 } = {}) {
  return {
    isHappy: true,
    happyUntil: now + duration
  };
}

function clearHappyState() {
  return {
    isHappy: false,
    happyUntil: 0
  };
}

function shouldClearHappyState(state, now = Date.now()) {
  return Boolean(state.isHappy && now >= state.happyUntil);
}

function createDrinkState({ now = Date.now(), duration = 3200 } = {}) {
  return {
    isDrinking: true,
    drinkUntil: now + duration
  };
}

function clearDrinkState() {
  return {
    isDrinking: false,
    drinkUntil: 0
  };
}

function shouldClearDrinkState(state, now = Date.now()) {
  return Boolean(state.isDrinking && now >= state.drinkUntil);
}

const petBehavior = {
  clamp,
  CAT_SCALE_DEFAULT,
  CAT_SCALE_DRAG_PIXELS,
  CAT_SCALE_MAX,
  CAT_SCALE_COMPACT_MAX,
  CAT_SCALE_MIN,
  CAT_SCALE_STEP,
  formatCatScale,
  normalizeCatScale,
  scaleFromDragDelta,
  shouldUseCompactControls,
  stepCatScale,
  createHappyState,
  clearHappyState,
  shouldClearHappyState,
  createDrinkState,
  clearDrinkState,
  shouldClearDrinkState
};

if (typeof window !== 'undefined') {
  window.petBehavior = petBehavior;
}

if (typeof module !== 'undefined') {
  module.exports = petBehavior;
}
