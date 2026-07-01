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
  const waterPanelToggle = document.getElementById('waterPanelToggle');
  const waterPanelIntervals = document.getElementById('waterPanelIntervals');
  const waterPanelLast = document.getElementById('waterPanelLast');

  const api = window.desktopCat?.waterReminder;

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

  function applyConfig(config) {
    if (!config) return;
    waterPanelCount.textContent = config.dailyCount;
    updateProgressRing(config.dailyCount);
    waterPanelToggle.checked = Boolean(config.enabled);
    waterPanelLast.textContent = formatLastTrigger(config.lastTriggerAt);

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
  }

  function closePanel() {
    setPanelOpen(false);
  }

  // 点击计数器按钮：切换面板
  if (waterCounter) {
    waterCounter.addEventListener('click', () => {
      if (waterPanel.classList.contains('show')) {
        closePanel();
        return;
      }
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
