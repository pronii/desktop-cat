function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createRoamOffset({ maxStep = 18, random = Math.random } = {}) {
  const boundedStep = Math.max(0, maxStep);
  const nextAxis = () => Math.round((random() * 2 - 1) * boundedStep);

  return {
    x: nextAxis(),
    y: nextAxis()
  };
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

function createDesktopCatBridge(nativeBridge) {
  const safeCall = (method, payload) => {
    if (!nativeBridge || typeof nativeBridge[method] !== 'function') {
      return;
    }

    nativeBridge[method](payload);
  };

  return {
    nudgeWindow(offset) {
      safeCall('nudgeWindow', offset);
    },
    onRoamingPausedChanged(callback) {
      if (
        !nativeBridge ||
        typeof nativeBridge.onRoamingPausedChanged !== 'function'
      ) {
        return () => {};
      }

      return nativeBridge.onRoamingPausedChanged(callback);
    }
  };
}

const petBehavior = {
  clamp,
  createRoamOffset,
  createHappyState,
  clearHappyState,
  shouldClearHappyState,
  createDesktopCatBridge
};

if (typeof window !== 'undefined') {
  window.petBehavior = petBehavior;
}

if (typeof module !== 'undefined') {
  module.exports = petBehavior;
}
