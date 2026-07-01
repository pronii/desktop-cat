const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow } = require('electron');

const DEFAULT_INTERVAL = 30;

function getConfigPath() {
  return path.join(app.getPath('userData'), 'water-reminder.json');
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8');
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

function writeConfig(config) {
  const dir = path.dirname(getConfigPath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

function defaultConfig() {
  return {
    enabled: true,
    interval: DEFAULT_INTERVAL,
    lastTriggerAt: null,
    dailyCount: 0,
    dailyDate: todayKey()
  };
}

function loadConfig() {
  const saved = readConfig();
  const config = { ...defaultConfig(), ...saved };

  if (config.dailyDate !== todayKey()) {
    config.dailyCount = 0;
    config.dailyDate = todayKey();
    persistConfig(config);
  }

  return config;
}

function persistConfig(config) {
  try {
    writeConfig(config);
  } catch (_e) {
    // Non-critical; timer still works in memory.
  }
}

function createWaterReminder() {
  let config = loadConfig();
  let timer = null;

  function resetDailyCount() {
    if (config.dailyDate !== todayKey()) {
      config.dailyCount = 0;
      config.dailyDate = todayKey();
      persistConfig(config);
    }
  }

  function notifyRenderer() {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed() && win.getTitle() === 'desktop-cat') {
        win.webContents.send('water-reminder:trigger');
        break;
      }
    }
  }

  function fire() {
    resetDailyCount();
    config.lastTriggerAt = new Date().toISOString();
    persistConfig(config);
    notifyRenderer();
  }

  function schedule() {
    if (timer) clearInterval(timer);
    if (!config.enabled) return;

    timer = setInterval(fire, config.interval * 60 * 1000);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  }

  function start() {
    config = loadConfig();
    schedule();
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function getConfig() {
    resetDailyCount();
    return {
      enabled: config.enabled,
      interval: config.interval,
      dailyCount: config.dailyCount,
      lastTriggerAt: config.lastTriggerAt
    };
  }

  function toggleEnabled() {
    config.enabled = !config.enabled;
    persistConfig(config);
    if (config.enabled) {
      schedule();
    } else {
      stop();
    }
    return config.enabled;
  }

  function setIntervalMinutes(minutes) {
    if (typeof minutes !== 'number' || minutes < 1) return false;
    config.interval = minutes;
    persistConfig(config);
    schedule();
    return true;
  }

  function recordDrink() {
    resetDailyCount();
    config.dailyCount += 1;
    persistConfig(config);
    return config.dailyCount;
  }

  return {
    start,
    stop,
    getConfig,
    toggleEnabled,
    setIntervalMinutes,
    recordDrink,
    fire // exposed for testing
  };
}

module.exports = {
  createWaterReminder,
  DEFAULT_INTERVAL
};
