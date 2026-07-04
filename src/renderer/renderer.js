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
    DEFAULT_PET_SETTINGS,
    ENCOURAGEMENT_MESSAGES,
    createRandomSpeechDelay,
    formatCatScale,
    normalizePetSettings,
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
  const clipboardBtn = document.getElementById('clipboardBtn');
  const roomBtn = document.getElementById('roomBtn');
  const live2dSwitcherBtn = document.getElementById('live2dSwitcherBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const settingsPanelClose = document.getElementById('settingsPanelClose');
  const randomSpeechToggle = document.getElementById('randomSpeechToggle');
  const bottomButtonToggles = Array.from(document.querySelectorAll?.('[data-bottom-button-toggle]') || []);
  const updatePrompt = document.getElementById('updatePrompt');
  const updatePromptTitle = document.getElementById('updatePromptTitle');
  const updatePromptText = document.getElementById('updatePromptText');
  const updatePromptClose = document.getElementById('updatePromptClose');
  const updatePromptPrimary = document.getElementById('updatePromptPrimary');
  const updatePromptSecondary = document.getElementById('updatePromptSecondary');

  const CAT_SIZE_STORAGE_KEY = 'desktopCat.catScale';
  const CAT_SIZE_DRAG_PIXELS = CAT_SCALE_DRAG_PIXELS;
  const PET_SETTINGS_STORAGE_KEY = 'desktopCat.petSettings';
  const HAPPY_BUBBLE_VISIBLE_MS = 1500;
  const RANDOM_SPEECH_VISIBLE_MS = 3000;
  const bottomButtonControls = {
    water: waterCounter,
    clipboard: clipboardBtn,
    room: roomBtn,
    live2d: live2dSwitcherBtn,
    catSize: catSizeBtn
  };

  let happyState = clearHappyState();
  let happyTimer = null;
  let drinkState = clearDrinkState();
  let drinkTimer = null;
  let catScale = CAT_SCALE_DEFAULT;
  let encouragementIndex = 0;
  let catSizeDragState = null;
  let catSizeHideTimer = null;
  let randomSpeechTimer = null;
  let petSettings = normalizePetSettings(readStoredPetSettings());

  window.desktopCatDebug = {
    rendererReady: true,
    happyCount: 0,
    randomSpeechEnabled: petSettings.randomSpeechEnabled,
    catScale
  };

  function readStoredPetSettings() {
    try {
      const raw = window.localStorage?.getItem(PET_SETTINGS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_PET_SETTINGS;
    } catch (_error) {
      return DEFAULT_PET_SETTINGS;
    }
  }

  function persistPetSettings() {
    try {
      window.localStorage?.setItem(PET_SETTINGS_STORAGE_KEY, JSON.stringify(petSettings));
    } catch (_error) {
      // Non-critical.
    }
  }

  function clearRandomSpeechTimer() {
    if (!randomSpeechTimer) return;
    window.clearTimeout(randomSpeechTimer);
    randomSpeechTimer = null;
  }

  function restoreLive2DIfNeeded() {
    window.__desktopCatLive2DAppearance?.ensureCurrentModelVisible?.().catch((error) => {
      console.warn('Live2D model failed to restore after settings changed.', error);
    });
  }

  function applySettings(nextSettings, { persist = false } = {}) {
    petSettings = normalizePetSettings(nextSettings);
    window.desktopCatDebug.randomSpeechEnabled = petSettings.randomSpeechEnabled;

    if (randomSpeechToggle) {
      randomSpeechToggle.checked = petSettings.randomSpeechEnabled;
    }

    for (const [key, element] of Object.entries(bottomButtonControls)) {
      element?.classList.toggle('is-hidden-by-settings', petSettings.visibleButtons[key] === false);
    }

    for (const toggle of bottomButtonToggles) {
      const key = toggle.dataset?.bottomButtonToggle;
      if (!key) continue;
      toggle.checked = petSettings.visibleButtons[key] !== false;
    }

    if (persist) {
      persistPetSettings();
    }

    restoreLive2DIfNeeded();
  }

  window.__desktopCatApplySettings = (nextSettings) => applySettings(nextSettings);

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
    document.documentElement.classList.add('is-bottom-controls-visible');
    document.documentElement.classList.add('is-cat-size-control-visible');
  }

  function hideCatSizeControl() {
    clearCatSizeHideTimer();
    if (catSizeDragState) {
      showCatSizeControl();
      return;
    }
    document.documentElement.classList.remove('is-bottom-controls-visible');
    document.documentElement.classList.remove('is-cat-size-control-visible');
  }

  function scheduleCatSizeControlHide() {
    clearCatSizeHideTimer();
    hideCatSizeControl();
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
  applySettings(petSettings);

  function setHappy({ visibleMs = HAPPY_BUBBLE_VISIBLE_MS } = {}) {
    if (ENCOURAGEMENT_MESSAGES?.length) {
      const message = ENCOURAGEMENT_MESSAGES[encouragementIndex % ENCOURAGEMENT_MESSAGES.length];
      encouragementIndex += 1;
      if (happyBubble) {
        happyBubble.textContent = message;
      }
    }

    happyState = createHappyState({ duration: visibleMs });
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
    }, visibleMs);
  }

  function canRunRandomSpeech() {
    return Boolean(
      petSettings.randomSpeechEnabled &&
      !drinkState.isDrinking &&
      !pressActive &&
      !isLongPress &&
      !catSizeDragState &&
      !isAnyOverlayOpen()
    );
  }

  function scheduleRandomSpeech() {
    clearRandomSpeechTimer();
    if (!petSettings.randomSpeechEnabled) return;

    randomSpeechTimer = window.setTimeout(() => {
      randomSpeechTimer = null;
      if (canRunRandomSpeech()) {
        setHappy({ visibleMs: RANDOM_SPEECH_VISIBLE_MS });
      }
      scheduleRandomSpeech();
    }, createRandomSpeechDelay());
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
  let activePressTarget = null;
  let activePointerId = null;

  function clearPendingLongPress() {
    if (!longPressTimer) return;
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  function capturePressPointer(event) {
    if (event.pointerId === undefined || event.pointerId === null) return;

    activePressTarget = event.currentTarget || event.target || null;
    activePointerId = event.pointerId;

    try {
      activePressTarget?.setPointerCapture?.(activePointerId);
    } catch (_error) {
      // Losing capture is non-fatal; the global release fallbacks still run.
    }
  }

  function releasePressPointer() {
    if (activePressTarget && activePointerId !== null) {
      try {
        activePressTarget.releasePointerCapture?.(activePointerId);
      } catch (_error) {
        // The browser may already have released capture after pointerup/cancel.
      }
    }

    activePressTarget = null;
    activePointerId = null;
  }

  function isActivePressPointer(event) {
    return activePointerId === null || event?.pointerId === undefined || event.pointerId === activePointerId;
  }

  function finishCatPress() {
    if (!pressActive && !isLongPress) {
      releasePressPointer();
      return;
    }

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
    releasePressPointer();
  }

  function handleCatPressStart(event) {
    if (event.button !== 0) return;

    finishCatPress();
    capturePressPointer(event);
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

  function handleCatPressEnd(event) {
    if (!isActivePressPointer(event)) return;
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
      releasePressPointer();
    }
  }

  function preventElementDrag(event) {
    event.preventDefault();
  }

  const supportsPointerEvents = 'PointerEvent' in window;

  for (const dragTarget of [cat, live2dCanvas].filter(Boolean)) {
    if (supportsPointerEvents) {
      dragTarget.addEventListener('pointerdown', handleCatPressStart);
      dragTarget.addEventListener('pointerup', handleCatPressEnd);
      dragTarget.addEventListener('pointercancel', handleCatPressEnd);
      dragTarget.addEventListener('pointerleave', handleCatPressLeave);
      dragTarget.addEventListener('lostpointercapture', handleCatPressEnd);
    } else {
      dragTarget.addEventListener('mousedown', handleCatPressStart);
      dragTarget.addEventListener('mouseup', handleCatPressEnd);
      dragTarget.addEventListener('mouseleave', handleCatPressLeave);
    }
    dragTarget.addEventListener('click', handleCatClick);
    dragTarget.addEventListener('dragstart', preventElementDrag);
  }

  /* --- 透明区域点击穿透 ---
   * 窗口 380×380 透明，但小猫只占底部一小块。通过 setIgnoreMouseEvents
   * 让透明区域点击穿透到桌面，仅在光标位于小猫/面板等可见元素上时恢复交互。
   */
  let clickThroughEnabled = false;
  let lastClickThroughCheck = 0;
  const CLICK_THROUGH_THROTTLE_MS = 16;

  // CSS 猫的可见子元素（耳朵、头、身体、尾巴、爪子），用于像素级 hit-test
  const catHitElements = ['.ear-left', '.ear-right', '.head', '.body', '.tail', '.paw-left', '.paw-right']
    .map((sel) => cat.querySelector(sel))
    .filter(Boolean);

  function isPointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function isPointOverCatVisible(x, y) {
    for (const el of catHitElements) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && isPointInRect(x, y, rect)) {
        return true;
      }
    }
    return false;
  }

  function isPointOverLive2DVisible(x, y) {
    if (!live2dCanvas || window.getComputedStyle?.(live2dCanvas).display === 'none') return false;
    const rect = live2dCanvas.getBoundingClientRect();
    if (!isPointInRect(x, y, rect)) return false;
    return Boolean(window.__desktopCatLive2DAppearance?.isPointOverVisible?.(x, y));
  }

  function isPointOverPetVisible(x, y) {
    const clientX = Number(x);
    const clientY = Number(y);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
    return isPointOverCatVisible(clientX, clientY) || isPointOverLive2DVisible(clientX, clientY);
  }

  function isPointOverBottomControls(x, y) {
    const clientX = Number(x);
    const clientY = Number(y);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || !bottomBar) return false;
    const rect = bottomBar.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && isPointInRect(clientX, clientY, rect);
  }

  function updateBottomControlsForPointer(x, y) {
    if (isPointOverPetVisible(x, y) || isPointOverBottomControls(x, y)) {
      showCatSizeControl();
    } else {
      hideCatSizeControl();
    }
  }

  function isAnyOverlayOpen() {
    return Boolean(document.querySelector(
      '.water-panel.show, .clipboard-panel.show, .room-panel.show, .live2d-panel.show, .settings-panel.show, .water-reminder-dialog.show, .update-prompt.show'
    ));
  }

  function shouldClickThrough(x, y) {
    if (pressActive || isLongPress || catSizeDragState) return false;
    if (isAnyOverlayOpen()) return false;

    const el = document.elementFromPoint(x, y);
    if (!el) return true;
    if (el === document.body || el === document.documentElement || el === stage) return true;
    if (el === cat) return !isPointOverCatVisible(x, y);
    if (el === live2dCanvas) return !isPointOverLive2DVisible(x, y);
    return false;
  }

  function applyClickThrough(should) {
    if (should === clickThroughEnabled) return;
    clickThroughEnabled = should;
    window.desktopCat?.setClickThrough?.(should);
  }

  function updateClickThrough(x, y) {
    const now = performance.now();
    if (now - lastClickThroughCheck < CLICK_THROUGH_THROTTLE_MS) return;
    lastClickThroughCheck = now;
    applyClickThrough(shouldClickThrough(x, y));
  }

  document.addEventListener('mousemove', (event) => {
    if (pressActive && event.buttons === 0) {
      finishCatPress();
    }
    updateBottomControlsForPointer(event.clientX, event.clientY);
    updateClickThrough(event.clientX, event.clientY);
  });

  // 安全兜底：面板/弹窗打开时确保窗口可交互（mouse 不动时 mousemove 不会触发）
  window.setInterval(() => {
    if (clickThroughEnabled && isAnyOverlayOpen()) {
      applyClickThrough(false);
    }
  }, 300);

  window.addEventListener('mouseup', () => {
    finishCatPress();
  });

  window.addEventListener('blur', () => {
    finishCatPress();
  });

  stage?.addEventListener('pointerenter', (event) => {
    updateBottomControlsForPointer(event.clientX, event.clientY);
  });

  stage?.addEventListener('pointerleave', () => {
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
    handleCatPressEnd(event);
    if (!catSizeDragState || event.pointerId !== catSizeDragState.pointerId) return;
    catSizeBtn?.releasePointerCapture?.(event.pointerId);
    stopCatSizeDrag({ persist: true });
  });

  window.addEventListener('pointercancel', (event) => {
    handleCatPressEnd(event);
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

  function setSettingsPanelOpen(isOpen) {
    settingsPanel?.classList.toggle('show', isOpen);
    settingsBtn?.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      window.__closeWaterPanel?.();
      window.__closeClipboardPanel?.();
      window.__closeRoomPanel?.();
      window.__closeLive2DPanel?.();
      showCatSizeControl();
      applyClickThrough(false);
    } else {
      restoreLive2DIfNeeded();
    }
  }

  window.__closeSettingsPanel = () => setSettingsPanelOpen(false);

  let currentUpdatePrompt = null;

  function setUpdatePromptOpen(isOpen) {
    updatePrompt?.classList.toggle('show', isOpen);
    if (isOpen) {
      window.__closeWaterPanel?.();
      window.__closeClipboardPanel?.();
      window.__closeRoomPanel?.();
      window.__closeLive2DPanel?.();
      setSettingsPanelOpen(false);
      showCatSizeControl();
      applyClickThrough(false);
    }
  }

  function respondToUpdatePrompt(response) {
    const prompt = currentUpdatePrompt;
    currentUpdatePrompt = null;
    setUpdatePromptOpen(false);
    if (prompt?.id) {
      window.desktopCat?.updates?.respond?.(prompt.id, response);
    }
  }

  function showUpdatePrompt(prompt) {
    currentUpdatePrompt = prompt || null;
    const version = prompt?.version || '';
    if (prompt?.kind === 'ready') {
      if (updatePromptTitle) updatePromptTitle.textContent = '更新已准备好';
      if (updatePromptText) {
        updatePromptText.textContent = version
          ? `desktop-cat ${version} 已下载完成。`
          : '更新已下载完成。';
      }
      if (updatePromptPrimary) updatePromptPrimary.textContent = '重启更新';
      if (updatePromptSecondary) updatePromptSecondary.textContent = '稍后';
    } else {
      if (updatePromptTitle) {
        updatePromptTitle.textContent = version
          ? `发现新版本 ${version}`
          : '发现新版本';
      }
      if (updatePromptText) {
        updatePromptText.textContent = prompt?.notes || 'desktop-cat 有新版本可用。';
      }
      if (updatePromptPrimary) updatePromptPrimary.textContent = '下载更新';
      if (updatePromptSecondary) updatePromptSecondary.textContent = '稍后';
    }
    setUpdatePromptOpen(true);
  }

  window.__closeUpdatePrompt = () => respondToUpdatePrompt('secondary');

  updatePromptPrimary?.addEventListener('click', () => respondToUpdatePrompt('primary'));
  updatePromptSecondary?.addEventListener('click', () => respondToUpdatePrompt('secondary'));
  updatePromptClose?.addEventListener('click', () => respondToUpdatePrompt('secondary'));

  window.desktopCat?.updates?.onPrompt?.(showUpdatePrompt);

  settingsBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSettingsPanelOpen(!settingsPanel?.classList.contains('show'));
  });

  settingsPanelClose?.addEventListener('click', () => {
    setSettingsPanelOpen(false);
  });

  randomSpeechToggle?.addEventListener('change', () => {
    applySettings({
      ...petSettings,
      randomSpeechEnabled: Boolean(randomSpeechToggle.checked)
    }, { persist: true });
    scheduleRandomSpeech();
  });

  for (const toggle of bottomButtonToggles) {
    toggle.addEventListener('change', () => {
      const key = toggle.dataset?.bottomButtonToggle;
      if (!key) return;
      applySettings({
        ...petSettings,
        visibleButtons: {
          ...petSettings.visibleButtons,
          [key]: Boolean(toggle.checked)
        }
      }, { persist: true });
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && settingsPanel?.classList.contains('show')) {
      setSettingsPanelOpen(false);
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
  scheduleRandomSpeech();

})();
