const assert = require('node:assert/strict');
const test = require('node:test');

const { buildLocalPetState } = require('../../src/main/petState');

function createWindow(bounds = { x: 350, y: 450, width: 300, height: 360 }) {
  return {
    isDestroyed: () => false,
    getBounds: () => bounds
  };
}

const fakeScreen = {
  getDisplayMatching() {
    return {
      workArea: { x: 100, y: 50, width: 1000, height: 800 }
    };
  }
};

test('buildLocalPetState includes Live2D appearance when current model is available', () => {
  const state = buildLocalPetState({
    petWindow: createWindow(),
    screen: fakeScreen,
    dragModeActive: true,
    catScale: 0.5,
    live2DAppearance: {
      getCurrentModel: () => ({
        available: true,
        id: 'Haru',
        name: 'Haru',
        modelUrl: 'desktop-cat-live2d://model/Haru/Haru.model3.json'
      })
    }
  });

  assert.deepEqual(state, {
    scale: 0.5,
    action: 'drag',
    facing: 'right',
    appearanceType: 'live2d',
    modelId: 'Haru',
    modelName: 'Haru'
  });
});

test('buildLocalPetState reports css-cat when Live2D is unavailable', () => {
  const state = buildLocalPetState({
    petWindow: createWindow({ x: 100, y: 50, width: 300, height: 360 }),
    screen: fakeScreen,
    dragModeActive: false,
    live2DAppearance: {
      getCurrentModel: () => ({ available: false })
    }
  });

  assert.equal(state.action, 'idle');
  assert.equal(state.appearanceType, 'css-cat');
  assert.equal(Object.hasOwn(state, 'x'), false);
  assert.equal(Object.hasOwn(state, 'y'), false);
  assert.equal(Object.hasOwn(state, 'relativeX'), false);
  assert.equal(Object.hasOwn(state, 'relativeY'), false);
  assert.equal(Object.hasOwn(state, 'modelId'), false);
  assert.equal(Object.hasOwn(state, 'modelName'), false);
});

test('buildLocalPetState returns null for missing or destroyed windows', () => {
  assert.equal(buildLocalPetState({
    petWindow: null,
    screen: fakeScreen,
    dragModeActive: false,
    live2DAppearance: null
  }), null);
  assert.equal(buildLocalPetState({
    petWindow: { isDestroyed: () => true },
    screen: fakeScreen,
    dragModeActive: false,
    live2DAppearance: null
  }), null);
});
