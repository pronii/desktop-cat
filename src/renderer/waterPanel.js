// 喝水记录面板交互逻辑
(() => {
  const DAILY_GOAL = 10;

  function updateProgressRing(count) {
    const fillEl = document.querySelector('.water-progress-fill');
    if (!fillEl) return;
    const progress = Math.min(count / DAILY_GOAL, 1);
    const deg = Math.round(progress * 360);
    fillEl.style.background = `conic-gradient(var(--sketch-accent) 0deg ${deg}deg, var(--sketch-ring-track) ${deg}deg)`;
  }

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

  const api = window.desktopCat?.waterReminder;

  // 当前配置缓存，用于倒计时计算
  let currentConfig = null;
  let countdownTimer = null;

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

  function formatNextTrigger(config) {
    if (!config) return '⏰ 等待提醒';
    if (!config.enabled) return '⏸ 提醒已关闭';
    if (!config.lastTriggerAt) return '⏰ 等待第一次提醒';

    const lastTime = new Date(config.lastTriggerAt).getTime();
    if (isNaN(lastTime)) return '⏰ 等待提醒';

    const intervalMs = config.interval * 60 * 1000;
    const nextTime = lastTime + intervalMs;
    const remaining = nextTime - Date.now();

    if (remaining <= 0) return '🚨 该喝水啦！';

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
    const nextTime = lastTime + config.interval * 60 * 1000;
    const remaining = nextTime - Date.now();
    return remaining <= 0;
  }

  function updateCountdown() {
    if (!currentConfig) return;
    waterPanelNext.textContent = formatNextTrigger(currentConfig);
    waterPanelNext.classList.toggle('is-urgent', isUrgent(currentConfig));
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

  // 停止 renderer.js 中设置的 5 秒重试提醒
  function stopRetry() {
    if (window.__waterRetryTimer) {
      window.clearTimeout(window.__waterRetryTimer);
      window.__waterRetryTimer = null;
    }
  }

  function applyConfig(config) {
    if (!config) return;
    currentConfig = config;
    waterPanelCount.textContent = config.dailyCount;
    updateProgressRing(config.dailyCount);
    waterPanelToggle.checked = Boolean(config.enabled);
    waterPanelLast.textContent = formatLastTrigger(config.lastTriggerAt);
    updateCountdown();

    // 同步底部计数器数字
    const bottomNum = waterCounter?.querySelector('.water-counter-num');
    if (bottomNum) bottomNum.textContent = config.dailyCount;

    // 高亮当前间隔
    const intervalBtns = waterPanelIntervals.querySelectorAll('.sketch-interval');
    intervalBtns.forEach((btn) => {
      const minutes = Number(btn.dataset.minutes);
      btn.classList.toggle('is-active', minutes === config.interval);
    });
  }

  async function refreshConfig() {
    if (!api?.getConfig) return;
    try {
      const config = await api.getConfig();
      applyConfig(config);
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

  // 曝光关闭方法，供其他面板切换用
  window.__closeWaterPanel = closePanel;

  // 点击计数器按钮：切换面板（打开前先关掉剪贴板）
  if (waterCounter) {
    waterCounter.addEventListener('click', () => {
      if (waterPanel.classList.contains('show')) {
        closePanel();
        return;
      }
      // 如果剪贴板面板开着，先关掉
      window.__closeClipboardPanel?.();
      window.__closeRoomPanel?.();
      openPanel();
    });
  }

  // 关闭按钮
  if (waterPanelClose) {
    waterPanelClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closePanel();
    });
  }

  // 记录一杯水
  if (waterPanelDrinkBtn) {
    waterPanelDrinkBtn.addEventListener('click', async () => {
      if (!api?.recordDrink) return;
      // 停止重试提醒
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
        // 刷新配置以更新倒计时
        refreshConfig();
      } catch (_e) {
        // Non-critical.
      }
    });
  }

  // "下次再提醒我喝" 按钮
  if (waterPanelSnoozeBtn) {
    waterPanelSnoozeBtn.addEventListener('click', async () => {
      if (!api?.snooze) return;
      // 停止重试提醒
      stopRetry();
      try {
        await api.snooze();
        refreshConfig();
      } catch (_e) {
        // Non-critical.
      }
    });
  }

  // 提醒开关
  if (waterPanelToggle) {
    waterPanelToggle.addEventListener('change', async () => {
      if (!api?.toggle) return;
      try {
        const enabled = await api.toggle();
        waterPanelToggle.checked = enabled;
      } catch (_e) {
        // 回滚
        waterPanelToggle.checked = !waterPanelToggle.checked;
      }
    });
  }

  // 间隔按钮
  if (waterPanelIntervals) {
    waterPanelIntervals.addEventListener('click', async (e) => {
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
          // 刷新配置以更新倒计时
          refreshConfig();
        }
      } catch (_e) {
        // Non-critical.
      }
    });
  }

  // ESC 关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && waterPanel.classList.contains('show')) {
      closePanel();
    }
  });

  // 点击面板外部关闭
  document.addEventListener('click', (e) => {
    if (!waterPanel.classList.contains('show')) return;
    if (waterPanel.contains(e.target) || waterCounter?.contains(e.target)) return;
    closePanel();
  });

  // 初始化
  refreshConfig();
})();
