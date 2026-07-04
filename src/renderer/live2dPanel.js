(function initLive2DPanel() {
  const PREVIEW_WIDTH = 92;
  const PREVIEW_HEIGHT = 86;
  const SELECTED_MODEL_KEY = 'desktopCat.live2dModelId';

  const live2dBtn = document.getElementById('live2dSwitcherBtn');
  const live2dPanel = document.getElementById('live2dPanel');
  const live2dPanelClose = document.getElementById('live2dPanelClose');
  const live2dModelList = document.getElementById('live2dModelList');
  const api = window.desktopCat?.appearance;
  const previewApps = new Map();
  let models = [];
  let activeModelId = null;
  let modelsLoaded = false;

  function hasRuntime() {
    return Boolean(window.PIXI?.Application && window.PIXI?.live2d?.Live2DModel);
  }

  function readStoredModelId() {
    try {
      return window.localStorage?.getItem(SELECTED_MODEL_KEY) || null;
    } catch (_error) {
      return null;
    }
  }

  function persistModelId(modelId) {
    try {
      window.localStorage?.setItem(SELECTED_MODEL_KEY, modelId);
    } catch (_error) {
      // Non-critical.
    }
  }

  function setOpen(isOpen) {
    live2dPanel?.classList.toggle('show', isOpen);
    live2dBtn?.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      loadModels().catch((error) => {
        console.warn('Live2D model list failed to load.', error);
      });
    } else {
      disposePreviewApps();
    }
  }

  function closePanel() {
    setOpen(false);
  }

  function updateActiveCards() {
    live2dModelList?.querySelectorAll('.live2d-model-card').forEach((card) => {
      const isActive = card.dataset.modelId === activeModelId;
      card.classList.toggle('is-active', isActive);
      card.setAttribute('aria-pressed', String(isActive));
    });
  }

  function hasRenderedModelList() {
    return Boolean(live2dModelList?.querySelector('.live2d-model-card, .live2d-panel-empty'));
  }

  function disposePreviewApps() {
    for (const previewApp of previewApps.values()) {
      previewApp?.destroy?.(true, { children: true, texture: false, baseTexture: false });
    }
    previewApps.clear();
    live2dModelList?.replaceChildren();
  }

  function fitPreviewModel(model, canvas) {
    const width = model.width || model.internalModel?.width || 1;
    const height = model.height || model.internalModel?.height || 1;
    const scale = Math.min((canvas.width * 0.86) / width, (canvas.height * 0.96) / height);

    if (model.anchor?.set) {
      model.anchor.set(0.5, 1);
    }
    model.scale.set(scale);
    model.x = canvas.width / 2;
    model.y = canvas.height;
  }

  async function renderPreview(canvas, modelConfig) {
    if (!hasRuntime() || !modelConfig?.modelUrl) return;
    if (previewApps.has(modelConfig.id)) return;

    canvas.width = PREVIEW_WIDTH;
    canvas.height = PREVIEW_HEIGHT;
    const previewApp = new window.PIXI.Application({
      view: canvas,
      width: PREVIEW_WIDTH,
      height: PREVIEW_HEIGHT,
      transparent: true,
      backgroundAlpha: 0,
      antialias: true,
      autoStart: false
    });
    previewApps.set(modelConfig.id, previewApp);

    try {
      const previewModel = await window.PIXI.live2d.Live2DModel.from(modelConfig.modelUrl);
      if (previewApps.get(modelConfig.id) !== previewApp) {
        previewModel.destroy?.({ children: true, texture: false, baseTexture: false });
        return;
      }
      previewModel.interactive = false;
      previewModel.autoUpdate = false;
      fitPreviewModel(previewModel, canvas);
      previewApp.stage.addChild(previewModel);
      previewApp.render();
    } catch (error) {
      previewApps.delete(modelConfig.id);
      previewApp.destroy(true, { children: true, texture: false, baseTexture: false });
      throw error;
    }
  }

  async function selectModel(modelId) {
    const selected = await api?.setLive2DModel?.(modelId);
    if (!selected?.available) return;

    activeModelId = selected.id;
    persistModelId(selected.id);
    updateActiveCards();
    const live2dAppearance = window.__desktopCatLive2DAppearance;
    const isSameModel = live2dAppearance?.getCurrentModel?.()?.id === selected.id;
    if (isSameModel && live2dAppearance?.isCurrentModelVisible?.()) {
      return;
    }
    if (isSameModel && live2dAppearance?.ensureCurrentModelVisible) {
      await live2dAppearance.ensureCurrentModelVisible();
      return;
    }
    await live2dAppearance?.loadModel?.(selected);
  }

  async function restoreVisibleModel(modelConfig) {
    activeModelId = modelConfig.id;
    updateActiveCards();

    const live2dAppearance = window.__desktopCatLive2DAppearance;
    const isSameModel = live2dAppearance?.getCurrentModel?.()?.id === modelConfig.id;
    if (!isSameModel) {
      await selectModel(modelConfig.id);
      return;
    }

    if (live2dAppearance?.isCurrentModelVisible?.()) {
      return;
    }
    if (live2dAppearance?.ensureCurrentModelVisible) {
      await live2dAppearance.ensureCurrentModelVisible();
      return;
    }
    await live2dAppearance?.loadModel?.(modelConfig);
  }

  function createModelCard(modelConfig) {
    const card = document.createElement('button');
    card.className = 'live2d-model-card';
    card.type = 'button';
    card.dataset.modelId = modelConfig.id;
    card.setAttribute('aria-pressed', 'false');

    const canvas = document.createElement('canvas');
    canvas.className = 'live2d-model-preview';
    canvas.width = PREVIEW_WIDTH;
    canvas.height = PREVIEW_HEIGHT;
    canvas.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'live2d-model-name';
    name.textContent = modelConfig.name || modelConfig.id;

    card.append(canvas, name);
    card.addEventListener('click', () => {
      selectModel(modelConfig.id).catch((error) => {
        console.warn('Live2D model failed to switch.', error);
      });
    });

    renderPreview(canvas, modelConfig).catch((error) => {
      console.warn('Live2D preview failed to load.', error);
    });

    return card;
  }

  function renderModels() {
    if (!live2dModelList) return;
    disposePreviewApps();
    live2dModelList.replaceChildren();

    if (!models.length) {
      const empty = document.createElement('div');
      empty.className = 'live2d-panel-empty';
      empty.textContent = '暂无可用形象';
      live2dModelList.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const modelConfig of models) {
      fragment.append(createModelCard(modelConfig));
    }
    live2dModelList.append(fragment);
    updateActiveCards();
  }

  async function loadModels() {
    if (modelsLoaded) {
      if (!hasRenderedModelList()) {
        renderModels();
      }
      updateActiveCards();
      return;
    }
    if (!api?.getLive2DModels) return;
    modelsLoaded = true;
    models = await api.getLive2DModels();
    activeModelId = window.__desktopCatLive2DAppearance?.getCurrentModel?.()?.id || models[0]?.id || null;
    renderModels();
    window.desktopCatDebug = window.desktopCatDebug || {};
    window.desktopCatDebug.live2dModels = models.map((model) => model.id);
  }

  async function restoreStoredModel() {
    if (!api?.getLive2DModels || !api?.setLive2DModel) return;
    models = await api.getLive2DModels();
    modelsLoaded = true;
    const storedModelId = readStoredModelId();
    const storedModel = models.find((model) => model.id === storedModelId);
    if (storedModel) {
      await restoreVisibleModel(storedModel);
    } else {
      activeModelId = window.__desktopCatLive2DAppearance?.getCurrentModel?.()?.id || models[0]?.id || null;
    }
    if (live2dPanel?.classList.contains('show')) {
      renderModels();
    }
  }

  window.__closeLive2DPanel = closePanel;

  live2dBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    window.__closeWaterPanel?.();
    window.__closeClipboardPanel?.();
    window.__closeRoomPanel?.();
    window.__closeCatSizePanel?.();
    setOpen(!live2dPanel?.classList.contains('show'));
  });

  live2dPanelClose?.addEventListener('click', (event) => {
    event.preventDefault();
    closePanel();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && live2dPanel?.classList.contains('show')) {
      closePanel();
    }
  });

  document.addEventListener('mousedown', (event) => {
    if (!live2dPanel?.classList.contains('show')) return;
    if (live2dPanel.contains(event.target) || live2dBtn?.contains(event.target)) return;
    closePanel();
  });

  restoreStoredModel().catch((error) => {
    console.warn('Stored Live2D model failed to restore.', error);
  });
})();
