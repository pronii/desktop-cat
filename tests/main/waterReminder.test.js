const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function installFakeIntervals(t) {
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const intervals = [];
  const timeouts = [];
  const cleared = [];
  let nextId = 1;

  global.setInterval = (callback, delay) => {
    const handle = {
      id: nextId,
      delay,
      callback,
      unrefCalled: false,
      unref() {
        this.unrefCalled = true;
      }
    };
    nextId += 1;
    intervals.push(handle);
    return handle;
  };

  global.setTimeout = (callback, delay) => {
    const handle = {
      id: nextId,
      delay,
      callback,
      unrefCalled: false,
      unref() {
        this.unrefCalled = true;
      }
    };
    nextId += 1;
    timeouts.push(handle);
    return handle;
  };

  global.clearInterval = (handle) => {
    cleared.push(handle);
  };

  global.clearTimeout = (handle) => {
    cleared.push(handle);
  };

  t.after(() => {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  });

  return { intervals, timeouts, cleared };
}

function loadWaterReminderWithFakeElectron(t) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cat-water-'));
  const modulePath = path.join(__dirname, '..', '..', 'src', 'main', 'waterReminder.js');
  const originalLoad = Module._load;

  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath(name) {
            assert.equal(name, 'userData');
            return userDataDir;
          }
        },
        BrowserWindow: {
          getAllWindows() {
            return [];
          }
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[require.resolve(modulePath)];
  const waterReminder = require(modulePath);

  t.after(() => {
    Module._load = originalLoad;
    delete require.cache[require.resolve(modulePath)];
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  return waterReminder;
}

test('recording a drink restarts the reminder interval', (t) => {
  const timers = installFakeIntervals(t);
  const { createWaterReminder, DEFAULT_INTERVAL } = loadWaterReminderWithFakeElectron(t);
  const reminder = createWaterReminder();

  reminder.start();
  const initialTimer = timers.intervals[0];

  const count = reminder.recordDrink();

  assert.equal(count, 1);
  assert.equal(timers.cleared.at(-1), initialTimer);
  assert.equal(timers.intervals.length, 2);
  assert.equal(timers.intervals[1].delay, DEFAULT_INTERVAL * 60 * 1000);
});

test('snoozing restarts the reminder interval', (t) => {
  const timers = installFakeIntervals(t);
  const { createWaterReminder, DEFAULT_INTERVAL } = loadWaterReminderWithFakeElectron(t);
  const reminder = createWaterReminder();

  reminder.start();
  const initialTimer = timers.intervals[0];

  const ok = reminder.snooze();

  assert.equal(ok, true);
  assert.equal(timers.cleared.at(-1), initialTimer);
  assert.equal(timers.intervals.length, 2);
  assert.equal(timers.intervals[1].delay, DEFAULT_INTERVAL * 60 * 1000);
});

test('custom task name has a useful default and can be customized', (t) => {
  const timers = installFakeIntervals(t);
  const { createWaterReminder } = loadWaterReminderWithFakeElectron(t);
  const reminder = createWaterReminder();

  reminder.start();

  assert.equal(reminder.getConfig().taskName, '站起来活动');

  const ok = reminder.setTaskName('站起来活动');

  assert.equal(ok, true);
  assert.equal(reminder.getConfig().taskName, '站起来活动');
  assert.equal(timers.intervals.length, 1);
});

test('custom task reminder has independent switch and interval', (t) => {
  const timers = installFakeIntervals(t);
  const { createWaterReminder, DEFAULT_INTERVAL, DEFAULT_TASK_INTERVAL } = loadWaterReminderWithFakeElectron(t);
  const reminder = createWaterReminder();

  reminder.start();

  assert.equal(reminder.getConfig().enabled, true);
  assert.equal(reminder.getConfig().taskEnabled, false);
  assert.equal(timers.intervals.length, 1);
  assert.equal(timers.intervals[0].delay, DEFAULT_INTERVAL * 60 * 1000);

  assert.equal(reminder.setTaskName('站起来活动'), true);
  assert.equal(reminder.setTaskIntervalMinutes(15), true);
  assert.equal(reminder.toggleTaskEnabled(), true);

  const config = reminder.getConfig();
  assert.equal(config.enabled, true);
  assert.equal(config.interval, DEFAULT_INTERVAL);
  assert.equal(config.taskEnabled, true);
  assert.equal(config.taskName, '站起来活动');
  assert.equal(config.taskInterval, 15);
  assert.equal(timers.intervals.length, 2);
  assert.equal(timers.intervals[1].delay, 15 * 60 * 1000);
  assert.ok(config.lastTriggerAt);
  assert.ok(config.taskLastTriggerAt);

  const ok = reminder.completeTask();

  assert.equal(ok, true);
  assert.equal(reminder.getConfig().dailyCount, 0);
  assert.equal(timers.intervals.length, 3);
  assert.equal(timers.intervals[2].delay, 15 * 60 * 1000);
});

test('custom task reminders support multiple independent items and intervals', (t) => {
  const timers = installFakeIntervals(t);
  const { createWaterReminder } = loadWaterReminderWithFakeElectron(t);
  const reminder = createWaterReminder();

  reminder.start();

  const stretch = reminder.addTaskReminder({ name: 'Stretch', interval: 15 });
  const eyes = reminder.addTaskReminder({ name: 'Rest eyes', interval: 30 });

  assert.ok(stretch.id);
  assert.ok(eyes.id);
  assert.notEqual(stretch.id, eyes.id);
  assert.equal(reminder.toggleTaskEnabled(stretch.id), true);
  assert.equal(reminder.toggleTaskEnabled(eyes.id), true);

  let config = reminder.getConfig();
  assert.equal(config.taskReminders.length, 2);
  assert.deepEqual(
    config.taskReminders.map((task) => ({
      name: task.name,
      enabled: task.enabled,
      interval: task.interval
    })),
    [
      { name: 'Stretch', enabled: true, interval: 15 },
      { name: 'Rest eyes', enabled: true, interval: 30 }
    ]
  );
  assert.ok(timers.intervals.some((handle) => handle.delay === 15 * 60 * 1000));
  assert.ok(timers.intervals.some((handle) => handle.delay === 30 * 60 * 1000));

  assert.equal(reminder.setTaskIntervalMinutes(stretch.id, 45), true);
  assert.equal(reminder.completeTask(eyes.id), true);

  config = reminder.getConfig();
  assert.equal(config.taskReminders[0].interval, 45);
  assert.ok(config.taskReminders[0].lastTriggerAt);
  assert.ok(config.taskReminders[1].lastTriggerAt);
  assert.equal(config.dailyCount, 0);
  assert.ok(timers.intervals.some((handle) => handle.delay === 45 * 60 * 1000));
});

test('custom task reminders can target a specific date time', (t) => {
  const timers = installFakeIntervals(t);
  const { createWaterReminder } = loadWaterReminderWithFakeElectron(t);
  const reminder = createWaterReminder();

  reminder.start();
  const task = reminder.addTaskReminder({ name: 'Pay rent', interval: 30 });
  const scheduledAt = new Date(Date.now() + 90 * 1000).toISOString();

  assert.equal(reminder.setTaskScheduledAt(task.id, scheduledAt), true);

  let config = reminder.getConfig();
  assert.equal(config.taskReminders[0].scheduledAt, scheduledAt);
  assert.equal(config.taskReminders[0].enabled, true);
  assert.equal(timers.timeouts.length, 1);
  assert.ok(timers.timeouts[0].delay > 0);
  assert.ok(timers.timeouts[0].delay <= 90 * 1000);

  timers.timeouts[0].callback();

  config = reminder.getConfig();
  assert.equal(config.taskReminders[0].enabled, false);
  assert.equal(config.taskReminders[0].scheduledAt, scheduledAt);
  assert.ok(config.taskReminders[0].lastTriggerAt);

  assert.equal(reminder.setTaskIntervalMinutes(task.id, 45), true);
  config = reminder.getConfig();
  assert.equal(config.taskReminders[0].scheduledAt, null);
  assert.equal(config.taskReminders[0].interval, 45);
  assert.equal(config.taskReminders[0].enabled, false);
  assert.equal(reminder.toggleTaskEnabled(task.id), true);
  assert.ok(timers.intervals.some((handle) => handle.delay === 45 * 60 * 1000));
});
