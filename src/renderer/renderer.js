(() => {
  const {
    createHappyState,
    clearHappyState,
    shouldClearHappyState,
    createDrinkState,
    clearDrinkState,
    shouldClearDrinkState
  } = window.petBehavior;

  const cat = document.querySelector('.cat');
  const waterBowl = document.querySelector('.water-bowl');
  const waterBubble = cat.querySelector('.water-bubble');
  const waterCounter = document.getElementById('waterCounter');

  let happyState = clearHappyState();
  let happyTimer = null;
  let drinkState = clearDrinkState();
  let drinkTimer = null;

  window.desktopCatDebug = {
    rendererReady: true,
    happyCount: 0
  };

  function setHappy() {
    happyState = createHappyState({ duration: 900 });
    window.desktopCatDebug.happyCount += 1;
    cat.classList.add('is-happy');

    window.clearTimeout(happyTimer);
    happyTimer = window.setTimeout(() => {
      if (shouldClearHappyState(happyState)) {
        happyState = clearHappyState();
        cat.classList.remove('is-happy');
      }
    }, 1500);
  }

  async function setDrinking() {
    if (drinkState.isDrinking) return;

    // 清除上一次的重试定时器
    if (window.__waterRetryTimer) {
      window.clearTimeout(window.__waterRetryTimer);
      window.__waterRetryTimer = null;
    }

    drinkState = createDrinkState({ duration: 3200 });
    cat.classList.add('is-drinking');
    waterBowl.classList.add('is-visible');

    waterBubble.textContent = '该喝水啦！';

    window.clearTimeout(drinkTimer);
    drinkTimer = window.setTimeout(async () => {
      if (shouldClearDrinkState(drinkState)) {
        drinkState = clearDrinkState();
        cat.classList.remove('is-drinking');
        waterBowl.classList.remove('is-visible');
      }
      // 动画结束后，5 秒后再次提醒（如果用户还没记录）
      window.__waterRetryTimer = window.setTimeout(() => {
        setDrinking();
      }, 5000);
    }, 3500);
  }

  async function loadWaterCount() {
    try {
      const config = await window.desktopCat.waterReminder.getConfig();
      const numEl = waterCounter.querySelector('.water-counter-num');
      if (numEl) numEl.textContent = config.dailyCount;
    } catch (_e) {
      // Non-critical.
    }
  }

  const LONG_PRESS_MS = 250;
  let longPressTimer = null;
  let isLongPress = false;
  let dragEntered = false;

  cat.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;

    isLongPress = false;
    dragEntered = false;

    longPressTimer = window.setTimeout(() => {
      isLongPress = true;
      cat.classList.add('is-dragging');
      if (window.desktopCat?.dragMode) {
        window.desktopCat.dragMode.enter();
        dragEntered = true;
      }
    }, LONG_PRESS_MS);

    event.preventDefault();
  });

  cat.addEventListener('mouseup', () => {
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    if (isLongPress) {
      cat.classList.remove('is-dragging');
      if (dragEntered && window.desktopCat?.dragMode) {
        window.desktopCat.dragMode.exit();
        dragEntered = false;
      }
    } else {
      // 短按 → 开心反馈（不记录杯数，杯数只在悬浮窗手动记录）
      setHappy();
    }
    isLongPress = false;
  });

  cat.addEventListener('mouseleave', () => {
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (isLongPress) {
      cat.classList.remove('is-dragging');
      if (dragEntered && window.desktopCat?.dragMode) {
        window.desktopCat.dragMode.exit();
        dragEntered = false;
      }
      isLongPress = false;
    }
  });

  cat.addEventListener('dragstart', (event) => {
    event.preventDefault();
  });

  // Listen for water reminder triggers from main process
  if (window.desktopCat && window.desktopCat.waterReminder) {
    window.desktopCat.waterReminder.onTrigger(() => setDrinking());
  }

  loadWaterCount();

})();
