function createManualHideState() {
  return {
    hiddenManually: false
  };
}

function hideManually(state) {
  state.hiddenManually = true;
  return state;
}

function clearManualHide(state) {
  state.hiddenManually = false;
  return state;
}

function isManualHideActive(state) {
  return Boolean(state.hiddenManually);
}

function enforceManualHide(window, state) {
  if (!window || !isManualHideActive(state)) {
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

function revealManuallyHiddenWindow(window, state) {
  clearManualHide(state);

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
  clearManualHide,
  clearTemporaryHide: clearManualHide,
  createFullscreenHideState,
  createManualHideState,
  createTemporaryHideState: createManualHideState,
  enforceFullscreenVisibility,
  enforceManualHide,
  enforceTemporaryHide: enforceManualHide,
  hideManually,
  isManualHideActive,
  isTemporaryHideActive: isManualHideActive,
  revealManuallyHiddenWindow,
  revealTemporaryHiddenWindow: revealManuallyHiddenWindow,
  startTemporaryHide: hideManually
};
