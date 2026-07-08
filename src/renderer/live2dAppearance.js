(function initLive2DAppearance() {
  const CANVAS_SIZE = 240;
  const CODEX_PET_KIND = 'codex-pet';
  const CODEX_PET_CELL_WIDTH = 192;
  const CODEX_PET_CELL_HEIGHT = 208;
  const CODEX_PET_IDLE_ROW = 0;
  const CODEX_PET_IDLE_FRAMES = 6;
  const CODEX_PET_IDLE_DURATIONS = [280, 110, 110, 140, 140, 320];
  const CODEX_PET_ACTION_ALIASES = {
    tap: ['waving', 'jumping'],
    hover: ['jumping', 'waving'],
    'drag-left': ['running-left', 'running'],
    'drag-right': ['running-right', 'running'],
    drag: ['running', 'waiting'],
    working: ['running', 'waiting'],
    waiting: ['waiting'],
    review: ['review'],
    failed: ['failed'],
    error: ['failed']
  };
  let pixiApp = null;
  let currentModel = null;
  let motionController = null;
  let currentModelConfig = null;
  let codexPetAnimation = null;
  let loadRequestId = 0;

  function logLive2D(message, details = {}) {
    try {
      window.desktopCatDebug = window.desktopCatDebug || {};
      const events = window.desktopCatDebug.live2dEvents || [];
      const entry = {
        source: 'appearance',
        message,
        time: new Date().toISOString(),
        ...details
      };
      events.push(entry);
      window.desktopCatDebug.live2dEvents = events.slice(-200);
      console.info?.('[desktop-cat:live2d]', message, details);
      window.desktopCat?.diagnostics?.logLive2D?.(entry);
    } catch (_error) {
      // Diagnostics must never affect rendering.
    }
  }

  function setDebugState(state) {
    window.desktopCatDebug = window.desktopCatDebug || {};
    window.desktopCatDebug.live2d = state;
  }

  function hasRuntime() {
    return Boolean(window.PIXI?.Application && window.PIXI?.live2d?.Live2DModel);
  }

  function isCodexPetModelConfig(modelConfig) {
    return modelConfig?.kind === CODEX_PET_KIND;
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

  function createMotionController(model) {
    const factory = window.live2dMotionController?.createLive2DMotionController;
    if (!factory) return null;

    const controller = factory({ model });

    model.on?.('hit', () => {
      controller.playTap();
    });

    return controller;
  }

  function exposeMotionController(controller) {
    window.__desktopCatLive2D = controller
      ? {
        playAlias: (alias, options) => controller.playAlias?.(alias, options),
        playTap: () => controller.playTap(),
        dispose: () => controller.dispose()
      }
      : null;
  }

  function exposeCodexPetController() {
    window.__desktopCatLive2D = {
      playAlias: (alias, options) => playCodexPetAction(alias, options),
      playTap: () => playCodexPetAction('tap'),
      playHover: () => playCodexPetAction('hover'),
      playDragLeft: () => playCodexPetAction('drag-left', { loop: true }),
      playDragRight: () => playCodexPetAction('drag-right', { loop: true }),
      playDrag: () => playCodexPetAction('drag', { loop: true }),
      playWaiting: () => playCodexPetAction('waiting', { loop: true }),
      playWorking: () => playCodexPetAction('working', { loop: true }),
      playReview: () => playCodexPetAction('review', { loop: true }),
      playFailed: () => playCodexPetAction('failed'),
      playIdle: () => playCodexPetAction('idle', { loop: true }),
      dispose: () => stopCodexPetAnimation()
    };
  }

  function getDebugSnapshot() {
    const stage = document.querySelector('.stage');
    const canvas = document.getElementById('live2dCanvas');
    const stageChildren = pixiApp?.stage?.children || [];
    const isCodexPet = currentModelConfig?.kind === CODEX_PET_KIND;
    const isAttached = isCodexPet
      ? Boolean(codexPetAnimation)
      : Boolean(currentModel && stageChildren.includes?.(currentModel));
    const gl = pixiApp?.renderer?.gl || pixiApp?.renderer?.context?.gl;
    let contextLost = null;
    try {
      contextLost = Boolean(gl?.isContextLost?.());
    } catch (_error) {
      contextLost = 'unknown';
    }

    return {
      currentModelId: currentModelConfig?.id || null,
      currentModelKind: currentModelConfig?.kind || 'live2d',
      currentModelAvailable: Boolean(currentModelConfig?.available),
      hasCurrentModel: Boolean(currentModel || codexPetAnimation),
      hasPixiApp: Boolean(pixiApp),
      hasCodexPetAnimation: Boolean(codexPetAnimation),
      isAttached,
      stageChildren: stageChildren.length || 0,
      stageHasLive2D: Boolean(stage?.classList.contains('has-live2d')),
      canvasHidden: canvas?.getAttribute?.('aria-hidden') || null,
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
      contextLost
    };
  }

  function markCanvasRenderContext(canvas, contextName) {
    canvas.dataset = canvas.dataset || {};
    canvas.dataset.renderContext = contextName;
  }

  function notifyLive2DCanvasReplaced(canvas) {
    if (typeof document.dispatchEvent !== 'function') return;

    const detail = { canvas };
    let event = null;
    if (typeof window.CustomEvent === 'function') {
      event = new window.CustomEvent('desktop-cat:live2d-canvas-replaced', { detail });
    } else {
      event = { type: 'desktop-cat:live2d-canvas-replaced', detail };
    }
    document.dispatchEvent(event);
  }

  function prepareCanvasForRenderContext(contextName) {
    let canvas = document.getElementById('live2dCanvas');
    if (!canvas) return null;

    const previousContext = canvas.dataset?.renderContext || null;
    if (
      previousContext &&
      previousContext !== contextName &&
      typeof canvas.cloneNode === 'function' &&
      typeof canvas.replaceWith === 'function'
    ) {
      const replacement = canvas.cloneNode(false);
      replacement.width = CANVAS_SIZE;
      replacement.height = CANVAS_SIZE;
      replacement.dataset = replacement.dataset || {};
      canvas.replaceWith(replacement);
      canvas = replacement;
      pixiApp = null;
      notifyLive2DCanvasReplaced(canvas);
    }

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    markCanvasRenderContext(canvas, contextName);
    return canvas;
  }

  function ensurePixiApp() {
    if (pixiApp) return pixiApp;
    const canvas = prepareCanvasForRenderContext('webgl');
    if (!canvas) return null;
    pixiApp = new window.PIXI.Application({
      view: canvas,
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      transparent: true,
      backgroundAlpha: 0,
      antialias: true,
      autoStart: true
    });
    canvas.dataset = canvas.dataset || {};
    if (!canvas.dataset.live2dContextDiagnosticsBound) {
      canvas.dataset.live2dContextDiagnosticsBound = 'true';
      canvas.addEventListener?.('webglcontextlost', (event) => {
        logLive2D('webglcontextlost', {
          defaultPrevented: Boolean(event.defaultPrevented),
          snapshot: getDebugSnapshot()
        });
      });
      canvas.addEventListener?.('webglcontextrestored', () => {
        logLive2D('webglcontextrestored', {
          snapshot: getDebugSnapshot()
        });
      });
    }
    logLive2D('pixi app created', { snapshot: getDebugSnapshot() });
    return pixiApp;
  }

  function stopCodexPetAnimation() {
    if (codexPetAnimation?.rafId && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(codexPetAnimation.rafId);
    }
    codexPetAnimation = null;
  }

  function disposeCurrentModel() {
    const reason = arguments[0] || 'unknown';
    logLive2D('dispose current model requested', {
      reason,
      before: getDebugSnapshot()
    });
    motionController?.dispose?.();
    motionController = null;
    stopCodexPetAnimation();

    if (currentModel && pixiApp && currentModelConfig?.kind !== CODEX_PET_KIND) {
      pixiApp.stage.removeChild(currentModel);
    }
    if (currentModelConfig?.kind !== CODEX_PET_KIND) {
      currentModel?.destroy?.({ children: true, texture: false, baseTexture: false });
    }
    currentModel = null;
    currentModelConfig = null;

    const canvas = document.getElementById('live2dCanvas');
    if (canvas) {
      const context2d = canvas.dataset?.renderContext === '2d' ? canvas.getContext?.('2d') : null;
      context2d?.clearRect?.(0, 0, canvas.width || CANVAS_SIZE, canvas.height || CANVAS_SIZE);
      canvas.setAttribute('aria-hidden', 'true');
    }

    document.querySelector('.stage')?.classList.remove('has-live2d');
    window.__desktopCatLive2D = null;
    logLive2D('dispose current model complete', {
      reason,
      after: getDebugSnapshot()
    });
  }

  function isCurrentModelVisible() {
    const stage = document.querySelector('.stage');
    const canvas = document.getElementById('live2dCanvas');
    if (currentModelConfig?.kind === CODEX_PET_KIND) {
      return Boolean(
        currentModelConfig?.available &&
        codexPetAnimation &&
        stage?.classList.contains('has-live2d') &&
        canvas?.getAttribute?.('aria-hidden') === 'false'
      );
    }

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

  function read2DAlphaAt(pixelX, pixelY) {
    const context = codexPetAnimation?.context;
    if (!context?.getImageData) return null;

    const pixel = context.getImageData(pixelX, pixelY, 1, 1).data;
    return pixel?.[3] ?? null;
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
      if (currentModelConfig?.kind === CODEX_PET_KIND) {
        const alpha = read2DAlphaAt(pixelX, pixelY);
        return alpha !== null && alpha > 10;
      }

      pixiApp?.render?.();
      const alpha = readWebGLAlphaAt(canvas, pixelX, pixelY);
      return alpha !== null && alpha > 10;
    } catch (_error) {
      return false;
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const ImageCtor = window.Image || Image;
      const image = new ImageCtor();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load spritesheet: ${src}`));
      image.src = src;
    });
  }

  function normalizeCodexPetAction(action) {
    const state = typeof action?.state === 'string' ? action.state.trim().toLowerCase() : '';
    const row = Number(action?.row);
    const frames = Number(action?.frames);
    if (!state || !Number.isInteger(row) || row < 1 || !Number.isInteger(frames) || frames < 1) {
      return null;
    }
    return {
      state,
      rowIndex: row - 1,
      frameCount: frames
    };
  }

  function createCodexPetActions(actionMap) {
    const actions = new Map();
    if (Array.isArray(actionMap)) {
      for (const action of actionMap) {
        const normalized = normalizeCodexPetAction(action);
        if (normalized && !actions.has(normalized.state)) {
          actions.set(normalized.state, normalized);
        }
      }
    }

    if (!actions.has('idle')) {
      actions.set('idle', {
        state: 'idle',
        rowIndex: CODEX_PET_IDLE_ROW,
        frameCount: CODEX_PET_IDLE_FRAMES
      });
    }
    return actions;
  }

  function resolveCodexPetAction(animation, alias) {
    const key = typeof alias === 'string' && alias.trim() ? alias.trim().toLowerCase() : 'idle';
    const candidates = CODEX_PET_ACTION_ALIASES[key] || [key];
    for (const state of candidates) {
      const action = animation.actions.get(state);
      if (action) return action;
    }
    return null;
  }

  function drawCodexPetFrame(animation) {
    const action = animation.currentAction || animation.idleAction;
    const frame = animation.frameIndex % action.frameCount;
    const sx = frame * CODEX_PET_CELL_WIDTH;
    const sy = action.rowIndex * CODEX_PET_CELL_HEIGHT;
    const scale = Math.min(
      animation.canvas.width / CODEX_PET_CELL_WIDTH,
      animation.canvas.height / CODEX_PET_CELL_HEIGHT
    );
    const dw = Math.round(CODEX_PET_CELL_WIDTH * scale);
    const dh = Math.round(CODEX_PET_CELL_HEIGHT * scale);
    const dx = Math.round((animation.canvas.width - dw) / 2);
    const dy = Math.round(animation.canvas.height - dh);

    animation.context.clearRect(0, 0, animation.canvas.width, animation.canvas.height);
    animation.context.imageSmoothingEnabled = false;
    animation.context.drawImage(
      animation.image,
      sx,
      sy,
      CODEX_PET_CELL_WIDTH,
      CODEX_PET_CELL_HEIGHT,
      dx,
      dy,
      dw,
      dh
    );
  }

  function completeCodexPetFrameAdvance(animation) {
    animation.frameIndex += 1;
    if (animation.actionMode === 'once' && animation.frameIndex >= animation.currentAction.frameCount) {
      animation.currentAction = animation.idleAction;
      animation.actionMode = 'loop';
      animation.frameIndex = 0;
    }
    drawCodexPetFrame(animation);
  }

  function scheduleCodexPetFrame(animation) {
    if (typeof window.requestAnimationFrame !== 'function') return;

    animation.rafId = window.requestAnimationFrame((time = 0) => {
      if (animation !== codexPetAnimation) return;
      const duration = CODEX_PET_IDLE_DURATIONS[animation.frameIndex % CODEX_PET_IDLE_DURATIONS.length];
      if (animation.lastFrameTime === null) {
        animation.lastFrameTime = time;
      }
      if (time - animation.lastFrameTime >= duration) {
        animation.lastFrameTime = time;
        completeCodexPetFrameAdvance(animation);
      }
      scheduleCodexPetFrame(animation);
    });
  }

  function playCodexPetAction(alias, options = {}) {
    const animation = codexPetAnimation;
    if (!animation) return false;
    const action = resolveCodexPetAction(animation, alias);
    if (!action) return false;

    const mode = options.loop ? 'loop' : 'once';
    if (animation.currentAction === action && animation.actionMode === mode) {
      return true;
    }

    animation.currentAction = action;
    animation.actionMode = mode;
    animation.frameIndex = 0;
    animation.lastFrameTime = null;
    drawCodexPetFrame(animation);
    return true;
  }

  async function loadCodexPetModel(modelConfig, requestId) {
    const stage = document.querySelector('.stage');
    const initialCanvas = document.getElementById('live2dCanvas');
    if (!stage || !initialCanvas) return;
    if (!modelConfig.spritesheetUrl) {
      throw new Error('Codex pet spritesheet is not configured.');
    }

    const image = await loadImage(modelConfig.spritesheetUrl);
    if (requestId !== loadRequestId) {
      logLive2D('codex pet load abandoned after image load', { modelId: modelConfig.id, requestId, loadRequestId });
      return;
    }

    disposeCurrentModel(`replace with ${modelConfig.id}`);
    const canvas = prepareCanvasForRenderContext('2d');
    if (!canvas) return;
    const context = canvas.getContext?.('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('2D canvas context is not available.');
    }

    const actions = createCodexPetActions(modelConfig.actionMap);
    const idleAction = actions.get('idle');
    const animation = {
      kind: CODEX_PET_KIND,
      canvas,
      context,
      image,
      actions,
      idleAction,
      currentAction: idleAction,
      actionMode: 'loop',
      frameIndex: 0,
      lastFrameTime: null,
      rafId: null
    };

    if (requestId !== loadRequestId) {
      logLive2D('codex pet load abandoned after setup', { modelId: modelConfig.id, requestId, loadRequestId });
      return;
    }

    codexPetAnimation = animation;
    currentModel = animation;
    currentModelConfig = modelConfig;
    drawCodexPetFrame(animation);

    stage.classList.add('has-live2d');
    canvas.setAttribute('aria-hidden', 'false');
    exposeCodexPetController();
    setDebugState({
      available: true,
      kind: CODEX_PET_KIND,
      name: modelConfig.name,
      modelUrl: modelConfig.modelUrl,
      spritesheetUrl: modelConfig.spritesheetUrl,
      actionMap: Array.from(actions.keys()),
      motionController: false
    });
    scheduleCodexPetFrame(animation);
    logLive2D('codex pet load complete', {
      modelId: modelConfig.id,
      after: getDebugSnapshot()
    });
  }

  async function loadModel(modelConfig) {
    const stage = document.querySelector('.stage');
    const canvas = document.getElementById('live2dCanvas');
    const modelId = modelConfig?.id || null;
    logLive2D('load model requested', {
      modelId,
      available: Boolean(modelConfig?.available),
      hasModelUrl: Boolean(modelConfig?.modelUrl),
      before: getDebugSnapshot()
    });

    if (!stage || !canvas) {
      logLive2D('load model skipped: missing stage or canvas', {
        modelId,
        hasStage: Boolean(stage),
        hasCanvas: Boolean(canvas)
      });
      return;
    }

    if (!modelConfig?.available || !modelConfig.modelUrl) {
      disposeCurrentModel('model unavailable');
      setDebugState({ available: false });
      return;
    }

    const requestId = ++loadRequestId;
    if (isCodexPetModelConfig(modelConfig)) {
      await loadCodexPetModel(modelConfig, requestId);
      return;
    }

    if (!hasRuntime()) {
      logLive2D('load model failed: runtime unavailable', { modelId });
      throw new Error('Live2D runtime is not available.');
    }

    const app = ensurePixiApp();
    if (!app) {
      throw new Error('Failed to create PIXI application.');
    }
    let renderCanvas = document.getElementById('live2dCanvas') || canvas;

    const loadedModel = await window.PIXI.live2d.Live2DModel.from(modelConfig.modelUrl);
    if (requestId !== loadRequestId) {
      logLive2D('load model abandoned after async load', { modelId, requestId, loadRequestId });
      loadedModel.destroy?.({ children: true, texture: false, baseTexture: false });
      return;
    }

    let nextMotionController = null;
    try {
      renderCanvas = document.getElementById('live2dCanvas') || renderCanvas;
      fitModelToCanvas(loadedModel, renderCanvas);
      nextMotionController = createMotionController(loadedModel);
    } catch (error) {
      nextMotionController?.dispose?.();
      loadedModel.destroy?.({ children: true, texture: false, baseTexture: false });
      logLive2D('load model setup failed', {
        modelId,
        error: error?.message || String(error),
        snapshot: getDebugSnapshot()
      });
      throw error;
    }

    if (requestId !== loadRequestId) {
      logLive2D('load model abandoned after setup', { modelId, requestId, loadRequestId });
      nextMotionController?.dispose?.();
      loadedModel.destroy?.({ children: true, texture: false, baseTexture: false });
      return;
    }

    try {
      app.stage.addChild(loadedModel);
    } catch (error) {
      nextMotionController?.dispose?.();
      loadedModel.destroy?.({ children: true, texture: false, baseTexture: false });
      logLive2D('load model addChild failed', {
        modelId,
        error: error?.message || String(error),
        snapshot: getDebugSnapshot()
      });
      throw error;
    }

    disposeCurrentModel(`replace with ${modelId}`);
    currentModel = loadedModel;
    motionController = nextMotionController;
    currentModelConfig = modelConfig;

    stage.classList.add('has-live2d');
    renderCanvas = document.getElementById('live2dCanvas') || renderCanvas;
    renderCanvas.setAttribute('aria-hidden', 'false');
    exposeMotionController(motionController);
    setDebugState({
      available: true,
      name: modelConfig.name,
      modelUrl: modelConfig.modelUrl,
      motionController: Boolean(motionController)
    });
    logLive2D('load model complete', {
      modelId,
      after: getDebugSnapshot()
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
    logLive2D('ensure current model visible requested', {
      before: getDebugSnapshot()
    });
    if (isCurrentModelVisible()) {
      logLive2D('ensure current model visible skipped: already visible', {
        after: getDebugSnapshot()
      });
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
    isPointOverVisible,
    getDebugSnapshot
  };

  loadConfiguredModel().catch((error) => {
    console.warn('Live2D model failed to load; using default cat.', error);
    setDebugState({
      available: false,
      error: error?.message || String(error)
    });
  });
})();
