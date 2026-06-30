const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createTrayMenuTemplate,
  createTrayIconDataUrl
} = require('../src/main/trayMenu');

test('createTrayMenuTemplate exposes the expected desktop cat controls', () => {
  const template = createTrayMenuTemplate({
    state: {
      alwaysOnTopEnabled: true
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
        label: '显示小猫',
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
        label: '总是置顶',
        type: 'checkbox',
        checked: true,
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

test('createTrayIconDataUrl returns an embedded png data url', () => {
  const dataUrl = createTrayIconDataUrl();

  assert.match(dataUrl, /^data:image\/png;base64,/);
  assert.ok(dataUrl.length > 200);
});
