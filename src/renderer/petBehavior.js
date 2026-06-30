function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createRoamOffset({
  maxStep = 18,
  minStep = 0,
  random = Math.random
} = {}) {
  const boundedStep = Math.max(0, maxStep);
  const minimumStep = Math.min(Math.max(0, minStep), boundedStep);
  const nextAxis = () => Math.round((random() * 2 - 1) * boundedStep);
  const offset = {
    x: nextAxis(),
    y: nextAxis()
  };

  if (
    minimumStep > 0 &&
    Math.max(Math.abs(offset.x), Math.abs(offset.y)) < minimumStep
  ) {
    const axis = Math.abs(offset.x) >= Math.abs(offset.y) ? 'x' : 'y';
    const sign = offset[axis] < 0 ? -1 : 1;
    offset[axis] = sign * minimumStep;
  }

  return offset;
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
