const assert = require('node:assert/strict');
const test = require('node:test');

const { createPetContextMenuTemplate, createPetMenuState } = require('../../src/main/menuState');
const { createTrayMenuTemplate } = require('../../src/main/trayMenu');

test('pet context menu exposes manual hide without a five minute limit', () => {
  const template = createPetContextMenuTemplate({
    state: createPetMenuState(),
    actions: { hidePet: () => {} }
  });
  const labels = template.map((item) => item.label).filter(Boolean);

  assert.ok(labels.includes('隐藏小猫'));
  assert.equal(labels.some((label) => /5 分钟|5分钟/.test(label)), false);
});

test('tray menu exposes manual show and hide actions', () => {
  const template = createTrayMenuTemplate({
    state: createPetMenuState(),
    actions: { showPet: () => {}, hidePet: () => {} }
  });
  const labels = template.map((item) => item.label).filter(Boolean);

  assert.ok(labels.includes('显示小猫'));
  assert.ok(labels.includes('隐藏小猫'));
  assert.equal(labels.some((label) => /5 分钟|5分钟/.test(label)), false);
});
