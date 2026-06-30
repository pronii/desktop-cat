function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
