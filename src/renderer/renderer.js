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

  async function recordDrink() {
    try {
      const newCount = await window.desktopCat.waterReminder.recordDrink();
      const numEl = waterCounter.querySelector('.water-counter-num');
      if (numEl) numEl.textContent = newCount;
      waterCounter.classList.add('just-drank');
      window.setTimeout(() => waterCounter.classList.remove('just-drank'), 1200);
    } catch (_e) {
      // Non-critical.
    }
  }

  async function setDrinking() {
    if (drinkState.isDrinking) return;

    drinkState = createDrinkState({ duration: 3200 });
    cat.classList.add('is-drinking');
    waterBowl.classList.add('is-visible');

    waterBubble.textContent = '该喝水啦！点击猫咪记录喝水';

    window.clearTimeout(drinkTimer);
    drinkTimer = window.setTimeout(async () => {
      if (shouldClearDrinkState(drinkState)) {
        drinkState = clearDrinkState();
        cat.classList.remove('is-drinking');
        waterBowl.classList.remove('is-visible');
      }
    }, 3500);

    // 不自动记录喝水，等用户点击猫咪确认
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
      // 短按 → 开心反馈
      if (drinkState.isDrinking) {
        // 正在提醒喝水，记录一杯 + 开心
        setHappy();
        recordDrink();
      } else {
        setHappy();
      }
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
