function noop() {}

function createPetMenuState(overrides = {}) {
  return {
    alwaysOnTopEnabled: true,
    ...overrides
  };
}

function toggleAlwaysOnTop(state) {
  return {
    ...state,
    alwaysOnTopEnabled: !state.alwaysOnTopEnabled
  };
}

function createPetContextMenuTemplate({ state, actions = {} }) {
  return [
    {
      label: '总是置顶',
      type: 'checkbox',
      checked: state.alwaysOnTopEnabled,
      click: actions.toggleAlwaysOnTop || noop
    },
    {
      label: '回到屏幕中央',
      click: actions.centerOnScreen || noop
    },
    {
      label: '隐藏 5 分钟',
      click: actions.hideTemporarily || noop
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      role: 'quit'
    }
  ];
}

module.exports = {
  createPetMenuState,
  toggleAlwaysOnTop,
  createPetContextMenuTemplate
};
