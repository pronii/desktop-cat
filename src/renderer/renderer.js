(() => {
  const {
    createHappyState,
    clearHappyState,
    shouldClearHappyState,
    createDrinkState,
    clearDrinkState,
    shouldClearDrinkState,
    CAT_SCALE_DEFAULT,
    CAT_SCALE_DRAG_PIXELS,
    CAT_SCALE_MAX,
    CAT_SCALE_MIN,
    ENCOURAGEMENT_MESSAGES,
    formatCatScale,
    normalizeCatScale,
    scaleFromDragDelta,
    shouldUseCompactControls,
    stepCatScale
  } = window.petBehavior;

  const stage = document.querySelector('.stage');
  const cat = document.querySelector('.cat');
  const waterBowl = document.querySelector('.water-bowl');
  const live2dCanvas = document.getElementById('live2dCanvas');
  const happyBubble = document.querySelector('.happy-bubble');
  const waterBubble = cat.querySelector('.water-bubble');
  const waterCounter = document.getElementById('waterCounter');
  const bottomBar = document.querySelector('.bottom-bar');
  const catSizeBtn = document.getElementById('catSizeBtn');

  const CAT_SIZE_STORAGE_KEY = 'desktopCat.catScale';
  const CAT_SIZE_DRAG_PIXELS = CAT_SCALE_DRAG_PIXELS;
  const CAT_SIZE_CONTROL_HIDE_DELAY_MS = 850;

  let happyState = clearHappyState();
  let happyTimer = null;
  let drinkState = clearDrinkState();
  let drinkTimer = null;
  let catScale = CAT_SCALE_DEFAULT;
  let encouragementIndex = 0;
  let catSizeDragState = null;
  let catSizeHideTimer = null;
  let catSizePointerOverStage = false;
  let catSizePointerOverButton = false;

  window.desktopCatDebug = {
    rendererReady: true,
    happyCount: 0,
    catScale
  };

  function readStoredCatScale() {
    try {
      return normalizeCatScale(window.localStorage?.getItem(CAT_SIZE_STORAGE_KEY));
    } catch (_error) {
      return CAT_SCALE_DEFAULT;
    }
  }

  function persistCatScale(scale) {
    try {
      const localStorage = window.localStorage;
      if (localStorage) {
        localStorage.setItem(CAT_SIZE_STORAGE_KEY, String(scale));
      }
    } catch (_error) {
      // Non-critical.
    }
  }

  function applyCatScale(scale) {
    catScale = normalizeCatScale(scale);
    document.documentElement.style.setProperty('--cat-scale', String(catScale));
    bottomBar?.classList.toggle('is-compact', shouldUseCompactControls(catScale));
    catSizeBtn?.setAttribute('title', `拖动调整小猫大小 · ${formatCatScale(catScale)}`);
    window.desktopCatDebug.catScale = catScale;
  }

  function setCatScale(scale, { persist = true } = {}) {
    applyCatScale(scale);
    if (persist) {
      persistCatScale(catScale);
    }
  }

  function clearCatSizeHideTimer() {
    if (!catSizeHideTimer) return;
    window.clearTimeout(catSizeHideTimer);
    catSizeHideTimer = null;
  }

  function showCatSizeControl() {
    clearCatSizeHideTimer();
    document.documentElement.classList.add('is-cat-size-control-visible');
  }

  function hideCatSizeControl() {
    clearCatSizeHideTimer();
    if (catSizeDragState || catSizePointerOverStage || catSizePointerOverButton) {
      showCatSizeControl();
      return;
    }
    document.documentElement.classList.remove('is-cat-size-control-visible');
  }

  function scheduleCatSizeControlHide() {
    clearCatSizeHideTimer();
    if (catSizeDragState || catSizePointerOverStage || catSizePointerOverButton) {
      showCatSizeControl();
      return;
    }
    catSizeHideTimer = window.setTimeout(() => {
      catSizeHideTimer = null;
      hideCatSizeControl();
    }, CAT_SIZE_CONTROL_HIDE_DELAY_MS);
  }

  function stopCatSizeDrag({ persist = false } = {}) {
    if (!catSizeDragState) return;
    catSizeDragState = null;
    catSizeBtn?.classList.remove('is-resizing');
    document.documentElement.classList.remove('is-cat-resizing');
    if (persist) {
      persistCatScale(catScale);
    }
    scheduleCatSizeControlHide();
  }

  window.__closeCatSizePanel = () => stopCatSizeDrag({ persist: true });

  applyCatScale(readStoredCatScale());

  function setHappy() {
    if (ENCOURAGEMENT_MESSAGES?.length) {
      const message = ENCOURAGEMENT_MESSAGES[encouragementIndex % ENCOURAGEMENT_MESSAGES.length];
      encouragementIndex += 1;
      if (happyBubble) {
        happyBubble.textContent = message;
      }
    }

    happyState = createHappyState({ duration: 900 });
    window.desktopCatDebug.happyCount += 1;
    stage?.classList.add('is-happy');
    cat.classList.add('is-happy');
    window.__desktopCatLive2D?.playTap?.();

    window.clearTimeout(happyTimer);
    happyTimer = window.setTimeout(() => {
      if (shouldClearHappyState(happyState)) {
        happyState = clearHappyState();
        stage?.classList.remove('is-happy');
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
    window.__desktopCatLive2D?.playDrink?.();

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
  let pressActive = false;
  let isLongPress = false;
  let dragEntered = false;
  let suppressNextCatClick = false;

  function clearPendingLongPress() {
    if (!longPressTimer) return;
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  function finishCatPress() {
    if (!pressActive && !isLongPress) return;

    clearPendingLongPress();

    if (isLongPress) {
      suppressNextCatClick = true;
      cat.classList.remove('is-dragging');
      if (dragEntered && window.desktopCat?.dragMode) {
        window.desktopCat.dragMode.exit();
        dragEntered = false;
      }
    }

    pressActive = false;
    isLongPress = false;
  }

  function handleCatPressStart(event) {
    if (event.button !== 0) return;

    finishCatPress();
    suppressNextCatClick = false;
    pressActive = true;
    isLongPress = false;
    dragEntered = false;

    longPressTimer = window.setTimeout(() => {
      longPressTimer = null;
      isLongPress = true;
      cat.classList.add('is-dragging');
      if (window.desktopCat?.dragMode) {
        window.desktopCat.dragMode.enter();
        dragEntered = true;
      }
    }, LONG_PRESS_MS);

    event.preventDefault();
  }

  function handleCatPressEnd() {
    finishCatPress();
  }

  function handleCatClick(event) {
    if (suppressNextCatClick) {
      suppressNextCatClick = false;
      event.preventDefault?.();
      return;
    }

    setHappy();
  }

  function handleCatPressLeave() {
    if (!isLongPress) {
      clearPendingLongPress();
      pressActive = false;
    }
  }

  function preventElementDrag(event) {
    event.preventDefault();
  }

  for (const dragTarget of [cat, live2dCanvas].filter(Boolean)) {
    dragTarget.addEventListener('mousedown', handleCatPressStart);
    dragTarget.addEventListener('mouseup', handleCatPressEnd);
    dragTarget.addEventListener('click', handleCatClick);
    dragTarget.addEventListener('mouseleave', handleCatPressLeave);
    dragTarget.addEventListener('dragstart', preventElementDrag);
  }

  window.addEventListener('mouseup', () => {
    finishCatPress();
  });

  window.addEventListener('blur', () => {
    finishCatPress();
  });

  stage?.addEventListener('pointerenter', () => {
    catSizePointerOverStage = true;
    showCatSizeControl();
  });

  stage?.addEventListener('pointerleave', () => {
    catSizePointerOverStage = false;
    scheduleCatSizeControlHide();
  });

  catSizeBtn?.addEventListener('pointerenter', () => {
    catSizePointerOverButton = true;
    showCatSizeControl();
  });

  catSizeBtn?.addEventListener('pointerleave', () => {
    catSizePointerOverButton = false;
    scheduleCatSizeControlHide();
  });

  catSizeBtn?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    window.__closeWaterPanel?.();
    window.__closeClipboardPanel?.();
    window.__closeRoomPanel?.();
    window.__closeLive2DPanel?.();
    catSizeDragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScale: catScale
    };
    catSizeBtn.classList.add('is-resizing');
    showCatSizeControl();
    document.documentElement.classList.add('is-cat-resizing');
    catSizeBtn.setPointerCapture?.(event.pointerId);
  });

  window.addEventListener('pointermove', (event) => {
    if (!catSizeDragState || event.pointerId !== catSizeDragState.pointerId) return;
    event.preventDefault();
    setCatScale(
      scaleFromDragDelta(
        catSizeDragState.startScale,
        event.clientX - catSizeDragState.startX,
        CAT_SIZE_DRAG_PIXELS
      ),
      { persist: false }
    );
  });

  window.addEventListener('pointerup', (event) => {
    if (!catSizeDragState || event.pointerId !== catSizeDragState.pointerId) return;
    catSizeBtn?.releasePointerCapture?.(event.pointerId);
    stopCatSizeDrag({ persist: true });
  });

  window.addEventListener('pointercancel', (event) => {
    if (!catSizeDragState || event.pointerId !== catSizeDragState.pointerId) return;
    catSizeBtn?.releasePointerCapture?.(event.pointerId);
    stopCatSizeDrag({ persist: true });
  });

  catSizeBtn?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      setCatScale(stepCatScale(catScale, 1));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      setCatScale(stepCatScale(catScale, -1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setCatScale(CAT_SCALE_DEFAULT);
    }
  });

  // Listen for water reminder triggers from main process
  if (window.desktopCat && window.desktopCat.waterReminder) {
    window.desktopCat.waterReminder.onTrigger((payload) => {
      if (!payload || payload.type === 'water') {
        setDrinking();
      }
    });
  }

  loadWaterCount();

})();
