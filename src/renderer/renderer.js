(() => {
  const {
    createHappyState,
    clearHappyState,
    shouldClearHappyState
  } = window.petBehavior;

  const cat = document.querySelector('.cat');

  let happyState = clearHappyState();
  let happyTimer = null;

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

})();
