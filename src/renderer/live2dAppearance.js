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

  function ensurePixiApp() {
    if (pixiApp) return pixiApp;
    const canvas = document.getElementById('live2dCanvas');
    if (!canvas) return null;

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    pixiApp = new window.PIXI.Application({
      view: canvas,
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      transparent: true,
      backgroundAlpha: 0,
      antialias: true,
      autoStart: true
    });
    return pixiApp;
  }

  function disposeCurrentModel() {
    motionController?.dispose?.();
    motionController = null;

    if (currentModel && pixiApp) {
      pixiApp.stage.removeChild(currentModel);
    }
    currentModel?.destroy?.({ children: true, texture: false, baseTexture: false });
    currentModel = null;
    currentModelConfig = null;

    const canvas = document.getElementById('live2dCanvas');
    if (canvas) {
      canvas.setAttribute('aria-hidden', 'true');
    }

    document.querySelector('.stage')?.classList.remove('has-live2d');
    window.__desktopCatLive2D = null;
  }

  function isCurrentModelVisible() {
    const stage = document.querySelector('.stage');
    const canvas = document.getElementById('live2dCanvas');
    const isAttached = Boolean(currentModel && pixiApp?.stage?.children?.includes?.(currentModel));
    return Boolean(
      currentModelConfig?.available &&
      isAttached &&
      stage?.classList.contains('has-live2d') &&
      canvas?.getAttribute?.('aria-hidden') === 'false'
    );
  }

  function readWebGLAlphaAt(canvas, pixelX, pixelY) {
    const gl = pixiApp?.renderer?.gl || pixiApp?.renderer?.context?.gl;
    if (!gl?.readPixels) return null;

    const pixel = new Uint8Array(4);
    const bufferHeight = gl.drawingBufferHeight || canvas.height;
    gl.readPixels(pixelX, bufferHeight - pixelY - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return pixel[3];
  }

  function isPointOverVisible(clientX, clientY) {
    const canvas = document.getElementById('live2dCanvas');
    if (!canvas || !isCurrentModelVisible()) return false;

    const rect = canvas.getBoundingClientRect();
    const x = Number(clientX);
    const y = Number(clientY);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < rect.left ||
      x > rect.right ||
      y < rect.top ||
      y > rect.bottom ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return false;
    }

    const pixelX = Math.min(canvas.width - 1, Math.max(0, Math.round((x - rect.left) * (canvas.width / rect.width))));
    const pixelY = Math.min(canvas.height - 1, Math.max(0, Math.round((y - rect.top) * (canvas.height / rect.height))));

    try {
      pixiApp?.render?.();
      const alpha = readWebGLAlphaAt(canvas, pixelX, pixelY);
      return alpha !== null && alpha > 10;
    } catch (_error) {
      return false;
    }
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

    const requestId = ++loadRequestId;
    const app = ensurePixiApp();
    if (!app) {
      throw new Error('Failed to create PIXI application.');
    }

    const loadedModel = await window.PIXI.live2d.Live2DModel.from(modelConfig.modelUrl);
    if (requestId !== loadRequestId) {
      loadedModel.destroy?.({ children: true, texture: false, baseTexture: false });
      return;
    }

    disposeCurrentModel();
    currentModel = loadedModel;
    app.stage.addChild(currentModel);
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

  async function ensureCurrentModelVisible() {
    if (isCurrentModelVisible()) {
      return currentModelConfig;
    }

    if (currentModelConfig?.available) {
      await loadModel(currentModelConfig);
      return currentModelConfig;
    }

    await loadConfiguredModel();
    return currentModelConfig;
  }

  window.__desktopCatLive2DAppearance = {
    ensureCurrentModelVisible,
    loadModel,
    loadConfiguredModel,
    getCurrentModel: () => currentModelConfig,
    isCurrentModelVisible,
    isPointOverVisible
  };

  loadConfiguredModel().catch((error) => {
    console.warn('Live2D model failed to load; using default cat.', error);
    setDebugState({
      available: false,
      error: error?.message || String(error)
    });
  });
})();
