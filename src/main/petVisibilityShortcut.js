const DEFAULT_PET_VISIBILITY_SHORTCUT = 'CommandOrControl+Alt+H';

function registerPetVisibilityShortcut({
  globalShortcut,
  accelerator = DEFAULT_PET_VISIBILITY_SHORTCUT,
  getPetWindow,
  togglePetVisibility
} = {}) {
  if (!globalShortcut || typeof globalShortcut.register !== 'function') {
    return false;
  }
  if (typeof getPetWindow !== 'function' || typeof togglePetVisibility !== 'function') {
    return false;
  }

  return globalShortcut.register(accelerator, () => {
    togglePetVisibility(getPetWindow());
  });
}

module.exports = {
  DEFAULT_PET_VISIBILITY_SHORTCUT,
  registerPetVisibilityShortcut
};
