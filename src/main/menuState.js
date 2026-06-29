function noop() {}

function createPetMenuState(overrides = {}) {
  return {
    roamingPaused: false,
    alwaysOnTopEnabled: true,
    ...overrides
  };
}

function toggleRoamingPaused(state) {
  return {
    ...state,
    roamingPaused: !state.roamingPaused
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
      label: state.roamingPaused ? '恢复随机移动' : '暂停随机移动',
      click: actions.toggleRoamingPaused || noop
    },
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
  toggleRoamingPaused,
  createPetContextMenuTemplate
};
