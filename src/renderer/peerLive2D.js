(function initPeerLive2D() {
  function createPeerLive2D({
    canvas,
    stage,
    live2d = window.PIXI?.live2d,
    PixiApplication = window.PIXI?.Application
  } = {}) {
    let pixiApp = null;
    let currentModel = null;
    let currentModelId = null;
    let loadRequestId = 0;

    function hasRuntime() {
      return Boolean(PixiApplication && live2d?.Live2DModel);
    }

    function ensurePixiApp() {
      if (pixiApp) return pixiApp;
      if (!canvas || !PixiApplication) return null;
      canvas.width = 160;
      canvas.height = 140;
      pixiApp = new PixiApplication({
        view: canvas,
        width: canvas.width,
        height: canvas.height,
        transparent: true,
        backgroundAlpha: 0,
        antialias: true,
        autoStart: true
      });
      return pixiApp;
    }

    function fitModelToCanvas(model) {
      const width = model.width || model.internalModel?.width || 1;
      const height = model.height || model.internalModel?.height || 1;
      const scale = Math.min((canvas.width * 0.86) / width, (canvas.height * 0.96) / height);

      model.anchor?.set?.(0.5, 1);
      model.scale?.set?.(scale);
      model.x = canvas.width / 2;
      model.y = canvas.height;
    }

    function clearModel() {
      if (currentModel && pixiApp) {
        pixiApp.stage.removeChild(currentModel);
      }
      currentModel?.destroy?.({ children: true, texture: false, baseTexture: false });
      currentModel = null;
      currentModelId = null;
    }

    function showCssCat() {
      loadRequestId += 1;
      stage?.classList.remove('has-live2d');
      canvas?.setAttribute('aria-hidden', 'true');
    }

    async function loadModel(modelConfig) {
      if (!modelConfig?.available || !modelConfig.modelUrl || !modelConfig.id || !hasRuntime()) {
        clearModel();
        showCssCat();
        return false;
      }

      if (currentModel && currentModelId === modelConfig.id) {
        stage?.classList.add('has-live2d');
        canvas?.setAttribute('aria-hidden', 'false');
        return true;
      }

      const app = ensurePixiApp();
      if (!app) {
        showCssCat();
        return false;
      }

      const requestId = ++loadRequestId;
      let loadedModel;
      try {
        loadedModel = await live2d.Live2DModel.from(modelConfig.modelUrl);
        if (requestId !== loadRequestId) {
          loadedModel.destroy?.({ children: true, texture: false, baseTexture: false });
          return false;
        }

        fitModelToCanvas(loadedModel);
        app.stage.addChild(loadedModel);
      } catch (error) {
        console.warn('Peer Live2D model failed to load.', error);
        loadedModel?.destroy?.({ children: true, texture: false, baseTexture: false });
        if (requestId === loadRequestId) {
          clearModel();
          showCssCat();
        }
        return false;
      }

      clearModel();
      currentModel = loadedModel;
      currentModelId = modelConfig.id;
      stage?.classList.add('has-live2d');
      canvas?.setAttribute('aria-hidden', 'false');
      return true;
    }

    function dispose() {
      loadRequestId += 1;
      clearModel();
      pixiApp?.destroy?.(true, { children: true, texture: false, baseTexture: false });
      pixiApp = null;
      showCssCat();
    }

    return {
      dispose,
      loadModel,
      showCssCat
    };
  }

  window.peerLive2D = {
    createPeerLive2D
  };
})();
