function createTemporaryHideState() {
  return {
    hiddenUntil: 0
  };
}

function startTemporaryHide(state, durationMs, now = Date.now()) {
  state.hiddenUntil = now + Math.max(0, durationMs);
  return state;
}

function clearTemporaryHide(state) {
  state.hiddenUntil = 0;
  return state;
}

function isTemporaryHideActive(state, now = Date.now()) {
  return Number(state.hiddenUntil) > now;
}

function enforceTemporaryHide(window, state, now = Date.now()) {
  if (!window || !isTemporaryHideActive(state, now)) {
    return false;
  }

  if (typeof window.setAlwaysOnTop === 'function') {
    window.setAlwaysOnTop(false);
  }

  if (typeof window.isVisible !== 'function' || window.isVisible()) {
    window.hide();
  }

  return true;
}

module.exports = {
  clearTemporaryHide,
  createTemporaryHideState,
  enforceTemporaryHide,
  isTemporaryHideActive,
  startTemporaryHide
};
