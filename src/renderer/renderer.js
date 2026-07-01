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
    }, 3500);

    try {
      const newCount = await window.desktopCat.waterReminder.recordDrink();
      waterCounter.textContent = `💧 ${newCount}`;
      waterCounter.classList.add('just-drank');
      window.setTimeout(() => waterCounter.classList.remove('just-drank'), 1200);
    } catch (_e) {
      // Non-critical: counter update failed but animation still plays.
    }
  }

  async function loadWaterCount() {
    try {
      const config = await window.desktopCat.waterReminder.getConfig();
      waterCounter.textContent = `💧 ${config.dailyCount}`;
    } catch (_e) {
      // Non-critical.
    }
  }

  cat.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;

    if (drinkState.isDrinking) {
      setHappy();
    } else {
      setHappy();
    }

    event.preventDefault();
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
