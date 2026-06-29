(() => {
  const {
    createRoamOffset,
    createHappyState,
    clearHappyState,
    shouldClearHappyState,
    createDesktopCatBridge
  } = window.petBehavior;

  const cat = document.querySelector('.cat');
  const desktopCat = createDesktopCatBridge(window.desktopCat);

  let happyState = clearHappyState();
  let happyTimer = null;
  let roamingPaused = false;

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

  cat.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;

    setHappy();
    event.preventDefault();
  });

  cat.addEventListener('dragstart', (event) => {
    event.preventDefault();
  });

  desktopCat.onRoamingPausedChanged((paused) => {
    roamingPaused = paused;
  });

  window.setInterval(() => {
    if (roamingPaused) return;
    if (happyState.isHappy) return;

    desktopCat.nudgeWindow(createRoamOffset({ maxStep: 18 }));
  }, 5200);
})();
