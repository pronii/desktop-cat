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

function revealTemporaryHiddenWindow(window, state) {
  clearTemporaryHide(state);

  if (window && typeof window.showInactive === 'function') {
    window.showInactive();
  }
}

function createFullscreenHideState() {
  return {
    hiddenByFullscreen: false
  };
}

function enforceFullscreenVisibility(window, state, suspended) {
  if (!window || (typeof window.isDestroyed === 'function' && window.isDestroyed())) {
    return false;
  }

  if (suspended) {
    if (typeof window.setAlwaysOnTop === 'function') {
      window.setAlwaysOnTop(false);
    }

    if (typeof window.isVisible !== 'function' || window.isVisible()) {
      window.hide();
      state.hiddenByFullscreen = true;
    }

    return true;
  }

  if (!state.hiddenByFullscreen) {
    return false;
  }

  state.hiddenByFullscreen = false;
  if (typeof window.showInactive === 'function') {
    window.showInactive();
  }
  return true;
}

module.exports = {
  clearTemporaryHide,
  createFullscreenHideState,
  createTemporaryHideState,
  enforceFullscreenVisibility,
  enforceTemporaryHide,
  isTemporaryHideActive,
  revealTemporaryHiddenWindow,
  startTemporaryHide
};
