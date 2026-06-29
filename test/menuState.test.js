const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPetMenuState,
  toggleAlwaysOnTop,
  toggleRoamingPaused,
  createPetContextMenuTemplate
} = require('../src/main/menuState');

test('createPetMenuState starts with roaming enabled and topmost enabled', () => {
  assert.deepEqual(createPetMenuState(), {
    roamingPaused: false,
    alwaysOnTopEnabled: true
  });
});

test('toggleRoamingPaused switches the roaming menu label', () => {
  const paused = toggleRoamingPaused(createPetMenuState());
  const resumed = toggleRoamingPaused(paused);

  assert.equal(paused.roamingPaused, true);
  assert.equal(resumed.roamingPaused, false);
});

test('toggleAlwaysOnTop changes only the user topmost preference', () => {
  const disabled = toggleAlwaysOnTop(createPetMenuState());

  assert.deepEqual(disabled, {
    roamingPaused: false,
    alwaysOnTopEnabled: false
  });
});

test('createPetContextMenuTemplate reflects current pet controls', () => {
  const template = createPetContextMenuTemplate({
    state: {
      roamingPaused: true,
      alwaysOnTopEnabled: false
    },
    actions: {}
  });

  assert.deepEqual(
    template.map((item) => ({
      label: item.label,
      type: item.type,
      checked: item.checked,
      role: item.role
    })),
    [
      {
        label: '恢复随机移动',
        type: undefined,
        checked: undefined,
        role: undefined
      },
      {
        label: '总是置顶',
        type: 'checkbox',
        checked: false,
        role: undefined
      },
      {
        label: '回到屏幕中央',
        type: undefined,
        checked: undefined,
        role: undefined
      },
      {
        label: '隐藏 5 分钟',
        type: undefined,
        checked: undefined,
        role: undefined
      },
      {
        label: undefined,
        type: 'separator',
        checked: undefined,
        role: undefined
      },
      {
        label: '退出',
        type: undefined,
        checked: undefined,
        role: 'quit'
      }
    ]
  );
});
