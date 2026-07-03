const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { app, BrowserWindow } = require('electron');

const DEFAULT_INTERVAL = 30;
const DEFAULT_TASK_NAME = '站起来活动';
const DEFAULT_TASK_INTERVAL = 60;
const MAX_TASK_NAME_LENGTH = 24;

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
    taskReminders: [],
    lastTriggerAt: null,
    dailyCount: 0,
    dailyDate: todayKey()
  };
}

function normalizeTaskName(value) {
  const text = String(value || '').trim();
  if (!text) return DEFAULT_TASK_NAME;
  return text.slice(0, MAX_TASK_NAME_LENGTH);
}

function normalizeInterval(value, fallback = DEFAULT_TASK_INTERVAL) {
  const interval = Number(value);
  return Number.isFinite(interval) && interval > 0 ? interval : fallback;
}

function createTaskReminder(task = {}) {
  return {
    id: typeof task.id === 'string' && task.id.trim()
      ? task.id
      : `task-${crypto.randomUUID()}`,
    name: normalizeTaskName(task.name),
    enabled: Boolean(task.enabled),
    interval: normalizeInterval(task.interval),
    lastTriggerAt: typeof task.lastTriggerAt === 'string' ? task.lastTriggerAt : null
  };
}

function normalizeTaskReminders(saved) {
  if (Array.isArray(saved?.taskReminders)) {
    return saved.taskReminders.map(createTaskReminder);
  }

  if (
    saved &&
    (
      saved.taskName ||
      saved.taskEnabled ||
      saved.taskInterval ||
      saved.taskLastTriggerAt
    )
  ) {
    return [
      createTaskReminder({
        name: saved.taskName,
        enabled: saved.taskEnabled,
        interval: saved.taskInterval,
        lastTriggerAt: saved.taskLastTriggerAt
      })
    ];
  }

  return [];
}

function loadConfig() {
  const saved = readConfig();
  const config = { ...defaultConfig(), ...saved };
  config.interval = normalizeInterval(config.interval, DEFAULT_INTERVAL);
  config.enabled = Boolean(config.enabled);
  config.taskReminders = normalizeTaskReminders(saved);

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
    // Non-critical; timers still work in memory.
  }
}

function getPrimaryTask(config) {
  return config.taskReminders[0] || {
    id: null,
    name: DEFAULT_TASK_NAME,
    enabled: false,
    interval: DEFAULT_TASK_INTERVAL,
    lastTriggerAt: null
  };
}

function cloneTask(task) {
  return {
    id: task.id,
    name: task.name,
    enabled: task.enabled,
    interval: task.interval,
    lastTriggerAt: task.lastTriggerAt
  };
}

function createWaterReminder() {
  let config = loadConfig();
  let waterTimer = null;
  const taskTimers = new Map();

  function resetDailyCount() {
    if (config.dailyDate !== todayKey()) {
      config.dailyCount = 0;
      config.dailyDate = todayKey();
      persistConfig(config);
    }
  }

  function getConfig() {
    resetDailyCount();
    const primaryTask = getPrimaryTask(config);
    return {
      enabled: config.enabled,
      interval: config.interval,
      taskReminders: config.taskReminders.map(cloneTask),
      taskName: primaryTask.name,
      taskEnabled: primaryTask.enabled,
      taskInterval: primaryTask.interval,
      taskLastTriggerAt: primaryTask.lastTriggerAt,
      dailyCount: config.dailyCount,
      lastTriggerAt: config.lastTriggerAt
    };
  }

  function notifyRenderer(type, taskId = null) {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed() && win.getTitle() === 'desktop-cat') {
        win.webContents.send('water-reminder:trigger', {
          type,
          taskId,
          config: getConfig()
        });
        break;
      }
    }
  }

  function clearTaskTimer(taskId) {
    const timer = taskTimers.get(taskId);
    if (timer) {
      clearInterval(timer);
      taskTimers.delete(taskId);
    }
  }

  function scheduleTask(task) {
    clearTaskTimer(task.id);
    if (!task.enabled) return;

    const timer = setInterval(() => fire('task', task.id), task.interval * 60 * 1000);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    taskTimers.set(task.id, timer);
  }

  function scheduleTasks() {
    for (const taskId of Array.from(taskTimers.keys())) {
      clearTaskTimer(taskId);
    }
    config.taskReminders.forEach(scheduleTask);
  }

  function scheduleWater() {
    if (waterTimer) clearInterval(waterTimer);
    waterTimer = null;
    if (!config.enabled) return;

    waterTimer = setInterval(() => fire('water'), config.interval * 60 * 1000);
    if (typeof waterTimer.unref === 'function') {
      waterTimer.unref();
    }
  }

  function findTask(taskId) {
    if (taskId) {
      return config.taskReminders.find((task) => task.id === taskId) || null;
    }
    return config.taskReminders[0] || null;
  }

  function ensurePrimaryTask() {
    let task = config.taskReminders[0];
    if (!task) {
      task = createTaskReminder({
        name: DEFAULT_TASK_NAME,
        enabled: false,
        interval: DEFAULT_TASK_INTERVAL
      });
      config.taskReminders.push(task);
    }
    return task;
  }

  function start() {
    config = loadConfig();
    if (config.enabled && !config.lastTriggerAt) {
      config.lastTriggerAt = new Date().toISOString();
      persistConfig(config);
    }
    for (const task of config.taskReminders) {
      if (task.enabled && !task.lastTriggerAt) {
        task.lastTriggerAt = new Date().toISOString();
        persistConfig(config);
      }
    }
    scheduleWater();
    scheduleTasks();
  }

  function stop() {
    if (waterTimer) {
      clearInterval(waterTimer);
      waterTimer = null;
    }
    for (const taskId of Array.from(taskTimers.keys())) {
      clearTaskTimer(taskId);
    }
  }

  function fire(type = 'water', taskId = null) {
    resetDailyCount();
    if (type === 'task') {
      const task = findTask(taskId);
      if (!task) return false;
      task.lastTriggerAt = new Date().toISOString();
      persistConfig(config);
      notifyRenderer('task', task.id);
      return true;
    }

    config.lastTriggerAt = new Date().toISOString();
    persistConfig(config);
    notifyRenderer('water');
    return true;
  }

  function toggleEnabled() {
    config.enabled = !config.enabled;
    persistConfig(config);
    scheduleWater();
    return config.enabled;
  }

  function addTaskReminder(task = {}) {
    const newTask = createTaskReminder({
      name: task.name,
      enabled: Boolean(task.enabled),
      interval: task.interval
    });
    config.taskReminders.push(newTask);
    persistConfig(config);
    scheduleTask(newTask);
    return cloneTask(newTask);
  }

  function removeTaskReminder(taskId) {
    const index = config.taskReminders.findIndex((task) => task.id === taskId);
    if (index === -1) return false;
    const [removed] = config.taskReminders.splice(index, 1);
    clearTaskTimer(removed.id);
    persistConfig(config);
    return true;
  }

  function toggleTaskEnabled(taskId = null) {
    const task = taskId ? findTask(taskId) : ensurePrimaryTask();
    if (!task) return false;
    task.enabled = !task.enabled;
    if (task.enabled && !task.lastTriggerAt) {
      task.lastTriggerAt = new Date().toISOString();
    }
    persistConfig(config);
    scheduleTask(task);
    return task.enabled;
  }

  function setIntervalMinutes(minutes) {
    if (typeof minutes !== 'number' || minutes <= 0) return false;
    config.interval = minutes;
    config.lastTriggerAt = new Date().toISOString();
    persistConfig(config);
    scheduleWater();
    return true;
  }

  function setTaskIntervalMinutes(taskIdOrMinutes, maybeMinutes) {
    const hasTaskId = typeof maybeMinutes !== 'undefined';
    const task = hasTaskId ? findTask(taskIdOrMinutes) : ensurePrimaryTask();
    const minutes = hasTaskId ? maybeMinutes : taskIdOrMinutes;
    if (!task || typeof minutes !== 'number' || minutes <= 0) return false;
    task.interval = minutes;
    task.lastTriggerAt = new Date().toISOString();
    persistConfig(config);
    scheduleTask(task);
    return true;
  }

  function setTaskName(taskIdOrName, maybeName) {
    const hasTaskId = typeof maybeName !== 'undefined';
    const task = hasTaskId ? findTask(taskIdOrName) : ensurePrimaryTask();
    const taskName = hasTaskId ? maybeName : taskIdOrName;
    if (!task) return false;
    task.name = normalizeTaskName(taskName);
    persistConfig(config);
    return true;
  }

  function recordDrink() {
    resetDailyCount();
    config.dailyCount += 1;
    config.lastTriggerAt = new Date().toISOString();
    persistConfig(config);
    scheduleWater();
    return config.dailyCount;
  }

  function snooze() {
    config.lastTriggerAt = new Date().toISOString();
    persistConfig(config);
    scheduleWater();
    return true;
  }

  function snoozeTask(taskId = null) {
    const task = findTask(taskId);
    if (!task) return false;
    task.lastTriggerAt = new Date().toISOString();
    persistConfig(config);
    scheduleTask(task);
    return true;
  }

  function completeTask(taskId = null) {
    const task = findTask(taskId);
    if (!task) return false;
    task.lastTriggerAt = new Date().toISOString();
    persistConfig(config);
    scheduleTask(task);
    return true;
  }

  return {
    start,
    stop,
    getConfig,
    toggleEnabled,
    addTaskReminder,
    removeTaskReminder,
    toggleTaskEnabled,
    setIntervalMinutes,
    setTaskIntervalMinutes,
    setTaskName,
    recordDrink,
    snooze,
    snoozeTask,
    completeTask,
    fire
  };
}

module.exports = {
  createWaterReminder,
  DEFAULT_INTERVAL,
  DEFAULT_TASK_INTERVAL,
  DEFAULT_TASK_NAME
};
