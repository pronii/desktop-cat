const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_PET_VISIBILITY_SHORTCUT,
  registerPetVisibilityShortcut
} = require('../../src/main/petVisibilityShortcut');

test('registerPetVisibilityShortcut toggles the current pet window', () => {
  const registered = [];
  let callback = null;
  const petWindow = { id: 'pet-window' };
  const calls = [];
  const globalShortcut = {
    register(accelerator, handler) {
      registered.push(accelerator);
      callback = handler;
      return true;
    }
  };

  assert.equal(
    registerPetVisibilityShortcut({
      globalShortcut,
      getPetWindow: () => petWindow,
      togglePetVisibility: (window) => calls.push(window)
    }),
    true
  );

  assert.deepEqual(registered, [DEFAULT_PET_VISIBILITY_SHORTCUT]);

  callback();

  assert.deepEqual(calls, [petWindow]);
});
