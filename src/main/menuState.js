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

function createPetContextMenuTemplate({ state, waterReminderConfig = {}, actions = {} }) {
  const dailyInfo = waterReminderConfig.dailyCount !== undefined
    ? `今日已喝: ${waterReminderConfig.dailyCount} 杯`
    : null;

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
      label: '喝水提醒',
      type: 'checkbox',
      checked: waterReminderConfig.enabled !== false,
      click: actions.toggleWaterReminder || noop
    },
    {
      label: '触发喝水提醒',
      click: actions.testWaterReminder || noop
    },
    ...(dailyInfo
      ? [{
        label: dailyInfo,
        enabled: false
      }]
      : []),
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
