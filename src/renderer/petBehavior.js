function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const CAT_SCALE_MIN = 0.5;
const CAT_SCALE_MAX = 1.25;
const CAT_SCALE_STEP = 0.1;
const CAT_SCALE_DEFAULT = 1;
const CAT_SCALE_DRAG_PIXELS = 300;
const CAT_SCALE_COMPACT_MAX = 0.9;
const RANDOM_SPEECH_MIN_MS = 45 * 1000;
const RANDOM_SPEECH_MAX_MS = 140 * 1000;
const ENCOURAGEMENT_MESSAGES = [
  '辛苦啦，歇一小会儿吧',
  '做得很好，继续加油',
  '别忘了喝口水',
  '今天也很努力呢',
  '我在这里陪着你',
  '先伸个懒腰再继续吧',
  '眼睛也需要休息一下',
  '这一步已经很棒了',
  '慢慢来，我会等你',
  '记得保存一下进度',
  '呼吸一下，思路会更清楚',
  '再坚持一点点就好'
];
const DEFAULT_PET_SETTINGS = {
  randomSpeechEnabled: true,
  visibleButtons: {
    water: true,
    clipboard: true,
    room: true,
    live2d: true,
    catSize: true
  }
};

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

function normalizePetSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const visibleButtons = source.visibleButtons && typeof source.visibleButtons === 'object'
    ? source.visibleButtons
    : {};

  return {
    randomSpeechEnabled: source.randomSpeechEnabled !== false,
    visibleButtons: Object.fromEntries(
      Object.entries(DEFAULT_PET_SETTINGS.visibleButtons).map(([key, defaultValue]) => [
        key,
        visibleButtons[key] === undefined ? defaultValue : visibleButtons[key] !== false
      ])
    )
  };
}

function createRandomSpeechDelay({
  random = Math.random,
  min = RANDOM_SPEECH_MIN_MS,
  max = RANDOM_SPEECH_MAX_MS
} = {}) {
  const safeMin = Math.max(1, Number(min) || RANDOM_SPEECH_MIN_MS);
  const safeMax = Math.max(safeMin, Number(max) || RANDOM_SPEECH_MAX_MS);
  const ratio = clamp(Number(random()) || 0, 0, 0.999999);
  return Math.floor(safeMin + ratio * (safeMax - safeMin + 1));
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

const petBehavior = {
  clamp,
  CAT_SCALE_DEFAULT,
  CAT_SCALE_DRAG_PIXELS,
  CAT_SCALE_MAX,
  CAT_SCALE_COMPACT_MAX,
  CAT_SCALE_MIN,
  CAT_SCALE_STEP,
  DEFAULT_PET_SETTINGS,
  ENCOURAGEMENT_MESSAGES,
  RANDOM_SPEECH_MAX_MS,
  RANDOM_SPEECH_MIN_MS,
  createRandomSpeechDelay,
  formatCatScale,
  normalizePetSettings,
  normalizeCatScale,
  scaleFromDragDelta,
  shouldUseCompactControls,
  stepCatScale,
  createHappyState,
  clearHappyState,
  shouldClearHappyState
};

if (typeof window !== 'undefined') {
  window.petBehavior = petBehavior;
}

if (typeof module !== 'undefined') {
  module.exports = petBehavior;
}
