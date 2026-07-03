(function initLive2DAppearance() {
  const CANVAS_SIZE = 240;
  let pixiApp = null;
  let currentModel = null;
  let motionController = null;
  let currentModelConfig = null;
  let loadRequestId = 0;

  function setDebugState(state) {
    window.desktopCatDebug = window.desktopCatDebug || {};
    window.desktopCatDebug.live2d = state;
  }

  function hasRuntime() {
    return Boolean(window.PIXI?.Application && window.PIXI?.live2d?.Live2DModel);
  }

  function fitModelToCanvas(model, canvas) {
    const width = model.width || model.internalModel?.width || 1;
    const height = model.height || model.internalModel?.height || 1;
    const scale = Math.min((canvas.width * 0.88) / width, (canvas.height * 0.96) / height);

    if (model.anchor?.set) {
      model.anchor.set(0.5, 1);
    }
    model.scale.set(scale);
    model.x = canvas.width / 2;
    model.y = canvas.height;
  }

  function bindMotionController(model) {
    const factory = window.live2dMotionController?.createLive2DMotionController;
    if (!factory) return null;

    const controller = factory({ model });
    window.__desktopCatLive2D = {
      playTap: () => controller.playTap(),
      playDrink: () => controller.playDrink(),
      dispose: () => controller.dispose()
    };

    model.on?.('hit', () => {
      controller.playTap();
    });

    return controller;
  }

  function disposeCurrentModel() {
    motionController?.dispose?.();
    motionController = null;
    currentModel = null;
    currentModelConfig = null;

    if (pixiApp) {
      pixiApp.destroy(true, { children: true, texture: false, baseTexture: false });
      pixiApp = null;
    }

    const canvas = document.getElementById('live2dCanvas');
    if (canvas) {
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      canvas.setAttribute('aria-hidden', 'true');
    }

    document.querySelector('.stage')?.classList.remove('has-live2d');
    window.__desktopCatLive2D = null;
  }

  async function loadModel(modelConfig) {
    const stage = document.querySelector('.stage');
    const canvas = document.getElementById('live2dCanvas');

    if (!stage || !canvas) {
      return;
    }

    if (!modelConfig?.available || !modelConfig.modelUrl) {
      disposeCurrentModel();
      setDebugState({ available: false });
      return;
    }

    if (!hasRuntime()) {
      throw new Error('Live2D runtime is not available.');
    }

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    const requestId = ++loadRequestId;
    disposeCurrentModel();

    pixiApp = new window.PIXI.Application({
      view: canvas,
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      transparent: true,
      backgroundAlpha: 0,
      antialias: true,
      autoStart: true
    });

    const loadedModel = await window.PIXI.live2d.Live2DModel.from(modelConfig.modelUrl);
    if (requestId !== loadRequestId) {
      loadedModel.destroy?.();
      return;
    }

    currentModel = loadedModel;
    pixiApp.stage.addChild(currentModel);
    fitModelToCanvas(currentModel, canvas);
    motionController = bindMotionController(currentModel);
    currentModelConfig = modelConfig;

    stage.classList.add('has-live2d');
    canvas.setAttribute('aria-hidden', 'false');
    setDebugState({
      available: true,
      name: modelConfig.name,
      modelUrl: modelConfig.modelUrl,
      motionController: Boolean(motionController)
    });
  }

  async function loadConfiguredModel() {
    const api = window.desktopCat?.appearance;

    if (!api?.getLive2DModel) {
      return;
    }

    await loadModel(await api.getLive2DModel());
  }

  window.__desktopCatLive2DAppearance = {
    loadModel,
    loadConfiguredModel,
    getCurrentModel: () => currentModelConfig
  };

  loadConfiguredModel().catch((error) => {
    console.warn('Live2D model failed to load; using default cat.', error);
    setDebugState({
      available: false,
      error: error?.message || String(error)
    });
  });
})();
