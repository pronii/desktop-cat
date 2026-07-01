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
