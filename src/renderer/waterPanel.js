(() => {
  const DAILY_GOAL = 10;
  const DEFAULT_WATER_NAME = '喝水';
  const DEFAULT_TASK_NAME = '站起来活动';
  const DEFAULT_TASK_INTERVAL = 60;
  const MAX_TASK_NAME_LENGTH = 24;
  const TASK_INTERVAL_OPTIONS = [15, 30, 60, 120];

  const waterCounter = document.getElementById('waterCounter');
  const waterPanel = document.getElementById('waterPanel');
  const waterPanelClose = document.getElementById('waterPanelClose');
  const waterPanelCount = document.getElementById('waterPanelCount');
  const waterPanelDrinkBtn = document.getElementById('waterPanelDrinkBtn');
  const waterPanelSnoozeBtn = document.getElementById('waterPanelSnoozeBtn');
  const waterPanelToggle = document.getElementById('waterPanelToggle');
  const waterPanelIntervals = document.getElementById('waterPanelIntervals');
  const waterPanelLast = document.getElementById('waterPanelLast');
  const waterPanelNext = document.getElementById('waterPanelNext');
  const waterTaskNameInput = document.getElementById('waterTaskNameInput');
  const waterTaskAddBtn = document.getElementById('waterTaskAddBtn');
  const waterTaskNewIntervals = document.getElementById('waterTaskNewIntervals');
  const waterTaskList = document.getElementById('waterTaskList');
  const waterReminderDialog = document.getElementById('waterReminderDialog');
  const waterReminderDrinkBtn = document.getElementById('waterReminderDrinkBtn');
  const waterReminderSnoozeBtn = document.getElementById('waterReminderSnoozeBtn');
  const waterReminderDoneBtn = document.getElementById('waterReminderDoneBtn');
  const waterReminderLaterBtn = document.getElementById('waterReminderLaterBtn');
  const waterReminderClose = document.getElementById('waterReminderClose');
  const waterReminderIcon = waterReminderDialog?.querySelector('.water-reminder-icon');
  const waterReminderTitle = document.getElementById('waterReminderTitle');
  const waterReminderText = document.getElementById('waterReminderText');

  const api = window.desktopCat?.waterReminder;
  let currentConfig = null;
  let countdownTimer = null;
  let activeReminderType = 'water';
  let activeReminderTaskId = null;
  let selectedNewTaskInterval = DEFAULT_TASK_INTERVAL;

  function updateProgressRing(count) {
    const fillEl = document.querySelector('.water-progress-fill');
    if (!fillEl) return;
    const progress = Math.min(count / DAILY_GOAL, 1);
    const deg = Math.round(progress * 360);
    fillEl.style.background = `conic-gradient(var(--sketch-accent) 0deg ${deg}deg, var(--sketch-ring-track) ${deg}deg)`;
  }

  function setPanelOpen(isOpen) {
    waterPanel.classList.toggle('show', isOpen);
    waterCounter?.setAttribute('aria-expanded', String(isOpen));
  }

  function formatLastTrigger(isoString) {
    if (!isoString) return '尚未提醒';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '尚未提醒';
    const diff = Date.now() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚提醒过';
    if (minutes < 60) return `${minutes} 分钟前提醒过`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前提醒过`;
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function formatNextTrigger(config, taskName = DEFAULT_WATER_NAME) {
    if (!config) return '⏰ 等待提醒';
    if (!config.enabled) return '⏰ 提醒已关闭';
    if (!config.lastTriggerAt) return '⏰ 等待第一次提醒';

    const lastTime = new Date(config.lastTriggerAt).getTime();
    if (isNaN(lastTime)) return '⏰ 等待提醒';

    const intervalMs = config.interval * 60 * 1000;
    const nextTime = lastTime + intervalMs;
    const remaining = nextTime - Date.now();

    if (remaining <= 0) return `🚨 该${taskName}啦！`;

    const totalSec = Math.floor(remaining / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;

    if (min >= 60) {
      const hr = Math.floor(min / 60);
      const remainMin = min % 60;
      return `⏰ ${hr}时${remainMin}分后提醒`;
    }
    if (min > 0) {
      return `⏰ ${min}分${String(sec).padStart(2, '0')}秒后提醒`;
    }
    return `⏰ ${sec}秒后提醒`;
  }

  function isUrgent(config) {
    if (!config || !config.enabled || !config.lastTriggerAt) return false;
    const lastTime = new Date(config.lastTriggerAt).getTime();
    if (isNaN(lastTime)) return false;
    return lastTime + config.interval * 60 * 1000 <= Date.now();
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

  function getTaskReminders(config = currentConfig) {
    if (Array.isArray(config?.taskReminders)) return config.taskReminders;
    if (config?.taskName) {
      return [
        {
          id: 'legacy-task',
          name: config.taskName,
          enabled: Boolean(config.taskEnabled),
          interval: config.taskInterval || DEFAULT_TASK_INTERVAL,
          lastTriggerAt: config.taskLastTriggerAt
        }
      ];
    }
    return [];
  }

  function getTaskById(taskId) {
    const tasks = getTaskReminders();
    return tasks.find((task) => task.id === taskId) || tasks[0] || null;
  }

  function updateNewTaskIntervalButtons() {
    waterTaskNewIntervals?.querySelectorAll('.sketch-interval').forEach((btn) => {
      btn.classList.toggle('is-active', Number(btn.dataset.minutes) === selectedNewTaskInterval);
    });
  }

  function stopRetry() {
    if (window.__waterRetryTimer) {
      window.clearTimeout(window.__waterRetryTimer);
      window.__waterRetryTimer = null;
    }
  }

  function updateTaskCountdowns() {
    if (!waterTaskList) return;
    getTaskReminders().forEach((task) => {
      const row = Array.from(waterTaskList.querySelectorAll('.water-task-item'))
        .find((item) => item.dataset.taskId === task.id);
      if (!row) return;
      const lastEl = row.querySelector('[data-task-last]');
      const nextEl = row.querySelector('[data-task-next]');
      if (lastEl) lastEl.textContent = formatLastTrigger(task.lastTriggerAt);
      if (nextEl) {
        nextEl.textContent = formatNextTrigger(task, normalizeTaskName(task.name));
        nextEl.classList.toggle('is-urgent', isUrgent(task));
      }
    });
  }

  function updateCountdown() {
    if (!currentConfig) return;
    const waterState = {
      enabled: currentConfig.enabled,
      interval: currentConfig.interval,
      lastTriggerAt: currentConfig.lastTriggerAt
    };
    waterPanelNext.textContent = formatNextTrigger(waterState, DEFAULT_WATER_NAME);
    waterPanelNext.classList.toggle('is-urgent', isUrgent(waterState));
    updateTaskCountdowns();
  }

  function startCountdown() {
    stopCountdown();
    updateCountdown();
    countdownTimer = window.setInterval(updateCountdown, 1000);
  }

  function stopCountdown() {
    if (countdownTimer) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function renderTaskReminders() {
    if (!waterTaskList) return;
    const tasks = getTaskReminders();
    waterTaskList.innerHTML = '';

    if (tasks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'water-task-empty';
      empty.textContent = '还没有事项提醒';
      waterTaskList.appendChild(empty);
      return;
    }

    tasks.forEach((task) => {
      const item = document.createElement('div');
      item.className = 'water-task-item';
      item.dataset.taskId = task.id;

      const head = document.createElement('div');
      head.className = 'water-task-item-head';

      const name = document.createElement('div');
      name.className = 'water-task-item-name';
      name.textContent = normalizeTaskName(task.name);
      name.title = name.textContent;

      const switchLabel = document.createElement('label');
      switchLabel.className = 'sketch-switch';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = Boolean(task.enabled);
      toggle.dataset.action = 'toggle-task';
      const slider = document.createElement('span');
      slider.className = 'sketch-switch-slider';
      switchLabel.append(toggle, slider);

      const remove = document.createElement('button');
      remove.className = 'water-task-remove';
      remove.type = 'button';
      remove.dataset.action = 'remove-task';
      remove.setAttribute('aria-label', '删除事项提醒');
      remove.textContent = '×';

      head.append(name, switchLabel, remove);

      const meta = document.createElement('div');
      meta.className = 'water-task-item-meta';
      const last = document.createElement('span');
      last.dataset.taskLast = 'true';
      last.textContent = formatLastTrigger(task.lastTriggerAt);
      const next = document.createElement('span');
      next.dataset.taskNext = 'true';
      next.textContent = formatNextTrigger(task, normalizeTaskName(task.name));
      next.classList.toggle('is-urgent', isUrgent(task));
      meta.append(last, next);

      const controls = document.createElement('div');
      controls.className = 'water-task-item-controls';
      const intervals = document.createElement('div');
      intervals.className = 'water-panel-intervals water-task-intervals';
      TASK_INTERVAL_OPTIONS.forEach((minutes) => {
        const btn = document.createElement('button');
        btn.className = 'sketch-interval';
        btn.type = 'button';
        btn.dataset.action = 'set-task-interval';
        btn.dataset.minutes = String(minutes);
        btn.classList.toggle('is-active', Number(task.interval) === minutes);
        btn.textContent = minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`;
        intervals.appendChild(btn);
      });

      const customInterval = document.createElement('input');
      customInterval.className = 'water-task-interval-input';
      customInterval.type = 'number';
      customInterval.min = '1';
      customInterval.max = '1440';
      customInterval.step = '1';
      customInterval.value = String(normalizeInterval(task.interval));
      customInterval.dataset.action = 'custom-task-interval';
      customInterval.setAttribute('aria-label', '自定义提醒间隔分钟');
      customInterval.title = '分钟';

      controls.append(intervals, customInterval);
      item.append(head, meta, controls);
      waterTaskList.appendChild(item);
    });
  }

  function applyReminderDialog(type = activeReminderType, taskId = activeReminderTaskId) {
    activeReminderType = type === 'task' ? 'task' : 'water';
    activeReminderTaskId = activeReminderType === 'task' ? taskId : null;
    const isTaskReminder = activeReminderType === 'task';
    const task = isTaskReminder ? getTaskById(activeReminderTaskId) : null;
    const name = isTaskReminder ? normalizeTaskName(task?.name) : DEFAULT_WATER_NAME;
    waterReminderDialog?.classList.toggle('is-task-reminder', isTaskReminder);
    if (waterReminderIcon) {
      waterReminderIcon.textContent = isTaskReminder ? '⏰' : '💧';
    }
    if (waterReminderTitle) {
      waterReminderTitle.textContent = `该${name}啦！`;
    }
    if (waterReminderText) {
      waterReminderText.textContent = !isTaskReminder
        ? '起来活动一下，顺手补一杯水。'
        : `现在该${name}了。`;
    }
  }

  function applyConfig(config) {
    if (!config) return;
    currentConfig = config;
    waterPanelCount.textContent = config.dailyCount;
    updateProgressRing(config.dailyCount);
    waterPanelToggle.checked = Boolean(config.enabled);
    waterPanelLast.textContent = formatLastTrigger(config.lastTriggerAt);

    const bottomNum = waterCounter?.querySelector('.water-counter-num');
    if (bottomNum) bottomNum.textContent = config.dailyCount;

    waterPanelIntervals.querySelectorAll('.sketch-interval').forEach((btn) => {
      const minutes = Number(btn.dataset.minutes);
      btn.classList.toggle('is-active', minutes === config.interval);
    });

    updateNewTaskIntervalButtons();
    renderTaskReminders();
    updateCountdown();
  }

  async function refreshConfig() {
    if (!api?.getConfig) return;
    try {
      applyConfig(await api.getConfig());
    } catch (_e) {
      // Non-critical.
    }
  }

  function openPanel() {
    setPanelOpen(true);
    refreshConfig();
    startCountdown();
  }

  function closePanel() {
    setPanelOpen(false);
    stopCountdown();
  }

  function openReminderDialog(type = 'water', taskId = null) {
    if (!waterReminderDialog) return;
    activeReminderTaskId = taskId;
    applyReminderDialog(type, taskId);
    window.__closeClipboardPanel?.();
    window.__closeRoomPanel?.();
    window.__closeCatSizePanel?.();
    window.__closeLive2DPanel?.();
    closePanel();
    waterReminderDialog.classList.add('show');
  }

  function closeReminderDialog() {
    waterReminderDialog?.classList.remove('show');
  }

  async function recordDrinkFromReminder() {
    if (!api?.recordDrink) return;
    stopRetry();
    try {
      const newCount = await api.recordDrink();
      closeReminderDialog();
      waterPanelCount.textContent = newCount;
      updateProgressRing(newCount);
      const bottomNum = waterCounter?.querySelector('.water-counter-num');
      if (bottomNum) bottomNum.textContent = newCount;
      waterCounter?.classList.add('just-drank');
      window.setTimeout(() => waterCounter?.classList.remove('just-drank'), 1200);
      refreshConfig();
    } catch (_e) {
      // Non-critical.
    }
  }

  async function snoozeReminderDialog() {
    if (!api?.snooze) {
      closeReminderDialog();
      return;
    }
    stopRetry();
    try {
      await api.snooze();
      closeReminderDialog();
      refreshConfig();
    } catch (_e) {
      // Non-critical.
    }
  }

  async function completeTaskReminder() {
    if (!api?.completeTask) {
      closeReminderDialog();
      return;
    }
    stopRetry();
    try {
      await api.completeTask(activeReminderTaskId);
      closeReminderDialog();
      refreshConfig();
    } catch (_e) {
      // Non-critical.
    }
  }

  async function snoozeTaskReminder() {
    if (!api?.snoozeTask) {
      closeReminderDialog();
      return;
    }
    stopRetry();
    try {
      await api.snoozeTask(activeReminderTaskId);
      closeReminderDialog();
      refreshConfig();
    } catch (_e) {
      // Non-critical.
    }
  }

  async function addTaskReminder() {
    if (!api?.addTaskReminder) return;
    const name = normalizeTaskName(waterTaskNameInput?.value);
    try {
      await api.addTaskReminder({
        name,
        interval: selectedNewTaskInterval,
        enabled: false
      });
      if (waterTaskNameInput) waterTaskNameInput.value = '';
      refreshConfig();
    } catch (_e) {
      // Non-critical.
    }
  }

  window.__closeWaterPanel = closePanel;

  waterCounter?.addEventListener('click', () => {
    if (waterPanel.classList.contains('show')) {
      closePanel();
      return;
    }
      window.__closeClipboardPanel?.();
      window.__closeRoomPanel?.();
      window.__closeCatSizePanel?.();
      window.__closeLive2DPanel?.();
      openPanel();
  });

  waterPanelClose?.addEventListener('click', (e) => {
    e.stopPropagation();
    closePanel();
  });

  waterPanelDrinkBtn?.addEventListener('click', async () => {
    if (!api?.recordDrink) return;
    stopRetry();
    try {
      const newCount = await api.recordDrink();
      waterPanelCount.textContent = newCount;
      updateProgressRing(newCount);
      const bottomNum = waterCounter?.querySelector('.water-counter-num');
      if (bottomNum) bottomNum.textContent = newCount;
      waterCounter?.classList.add('just-drank');
      window.setTimeout(() => waterCounter?.classList.remove('just-drank'), 1200);
      waterPanelDrinkBtn.classList.add('is-copied');
      window.setTimeout(() => waterPanelDrinkBtn.classList.remove('is-copied'), 400);
      refreshConfig();
    } catch (_e) {
      // Non-critical.
    }
  });

  waterPanelSnoozeBtn?.addEventListener('click', async () => {
    if (!api?.snooze) return;
    stopRetry();
    try {
      await api.snooze();
      refreshConfig();
    } catch (_e) {
      // Non-critical.
    }
  });

  waterReminderDrinkBtn?.addEventListener('click', () => recordDrinkFromReminder());
  waterReminderSnoozeBtn?.addEventListener('click', () => snoozeReminderDialog());
  waterReminderDoneBtn?.addEventListener('click', () => completeTaskReminder());
  waterReminderLaterBtn?.addEventListener('click', () => snoozeTaskReminder());
  waterReminderClose?.addEventListener('click', () => closeReminderDialog());

  waterTaskAddBtn?.addEventListener('click', () => addTaskReminder());
  waterTaskNameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTaskReminder();
    }
  });

  waterTaskNewIntervals?.addEventListener('click', (e) => {
    const btn = e.target.closest('.sketch-interval');
    if (!btn) return;
    selectedNewTaskInterval = normalizeInterval(btn.dataset.minutes);
    updateNewTaskIntervalButtons();
  });

  waterTaskList?.addEventListener('click', async (e) => {
    const item = e.target.closest('.water-task-item');
    const taskId = item?.dataset.taskId;
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!taskId || !action) return;

    try {
      if (action === 'remove-task' && api?.removeTaskReminder) {
        await api.removeTaskReminder(taskId);
        refreshConfig();
      }
      if (action === 'set-task-interval' && api?.setTaskInterval) {
        const minutes = normalizeInterval(e.target.closest('[data-minutes]')?.dataset.minutes);
        await api.setTaskInterval(taskId, minutes);
        refreshConfig();
      }
    } catch (_e) {
      // Non-critical.
    }
  });

  waterTaskList?.addEventListener('change', async (e) => {
    const item = e.target.closest('.water-task-item');
    const taskId = item?.dataset.taskId;
    const action = e.target.dataset.action;
    if (!taskId || !action) return;

    try {
      if (action === 'toggle-task' && api?.toggleTask) {
        await api.toggleTask(taskId);
        refreshConfig();
      }
      if (action === 'custom-task-interval' && api?.setTaskInterval) {
        const minutes = normalizeInterval(e.target.value);
        await api.setTaskInterval(taskId, minutes);
        refreshConfig();
      }
    } catch (_e) {
      refreshConfig();
    }
  });

  waterPanelToggle?.addEventListener('change', async () => {
    if (!api?.toggle) return;
    try {
      const enabled = await api.toggle();
      waterPanelToggle.checked = enabled;
      if (currentConfig) {
        currentConfig = { ...currentConfig, enabled };
        updateCountdown();
      }
      refreshConfig();
    } catch (_e) {
      waterPanelToggle.checked = !waterPanelToggle.checked;
    }
  });

  waterPanelIntervals?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.sketch-interval');
    if (!btn) return;
    const minutes = Number(btn.dataset.minutes);
    if (!api?.setInterval || !minutes) return;
    try {
      const ok = await api.setInterval(minutes);
      if (ok) {
        waterPanelIntervals.querySelectorAll('.sketch-interval').forEach((b) => {
          b.classList.toggle('is-active', b === btn);
        });
        refreshConfig();
      }
    } catch (_e) {
      // Non-critical.
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && waterReminderDialog?.classList.contains('show')) {
      closeReminderDialog();
      return;
    }
    if (e.key === 'Escape' && waterPanel.classList.contains('show')) {
      closePanel();
    }
  });

  document.addEventListener('click', (e) => {
    if (waterReminderDialog?.classList.contains('show')) {
      if (
        waterReminderDialog.contains(e.target) ||
        waterCounter?.contains(e.target)
      ) {
        return;
      }
      closeReminderDialog();
    }

    if (!waterPanel.classList.contains('show')) return;
    if (waterPanel.contains(e.target) || waterCounter?.contains(e.target)) return;
    closePanel();
  });

  api?.onTrigger?.((payload) => {
    if (payload?.config) {
      applyConfig(payload.config);
    }
    openReminderDialog(payload?.type === 'task' ? 'task' : 'water', payload?.taskId || null);
  });

  updateNewTaskIntervalButtons();
  refreshConfig();
})();
