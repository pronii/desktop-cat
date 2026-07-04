(function initLive2DPanel() {
  const SELECTED_MODEL_KEY = 'desktopCat.live2dModelId';

  const live2dBtn = document.getElementById('live2dSwitcherBtn');
  const live2dPanel = document.getElementById('live2dPanel');
  const live2dPanelClose = document.getElementById('live2dPanelClose');
  const live2dModelList = document.getElementById('live2dModelList');
  const api = window.desktopCat?.appearance;
  let models = [];
  let activeModelId = null;
  let modelsLoaded = false;

  function logLive2DPanel(message, details = {}) {
    try {
      window.desktopCatDebug = window.desktopCatDebug || {};
      const events = window.desktopCatDebug.live2dEvents || [];
      const entry = {
        source: 'panel',
        message,
        time: new Date().toISOString(),
        ...details
      };
      events.push(entry);
      window.desktopCatDebug.live2dEvents = events.slice(-200);
      console.info?.('[desktop-cat:live2d]', message, details);
      window.desktopCat?.diagnostics?.logLive2D?.(entry);
    } catch (_error) {
      // Diagnostics must never affect panel behavior.
    }
  }

  function getPanelDebugSnapshot() {
    return {
      panelOpen: Boolean(live2dPanel?.classList.contains('show')),
      modelsLoaded,
      modelCount: models.length,
      activeModelId,
      renderedModelList: hasRenderedModelList(),
      previewResourceCount: 0,
      appearance: window.__desktopCatLive2DAppearance?.getDebugSnapshot?.() || null
    };
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
    logLive2DPanel('set panel open requested', {
      isOpen,
      before: getPanelDebugSnapshot()
    });
    live2dPanel?.classList.toggle('show', isOpen);
    live2dBtn?.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      loadModels().catch((error) => {
        console.warn('Live2D model list failed to load.', error);
        logLive2DPanel('load model list failed while opening panel', {
          error: error?.message || String(error),
          after: getPanelDebugSnapshot()
        });
      });
    }
    logLive2DPanel('set panel open complete', {
      isOpen,
      after: getPanelDebugSnapshot()
    });
  }

  function closePanel() {
    logLive2DPanel('close panel requested', {
      before: getPanelDebugSnapshot()
    });
    setOpen(false);
  }

  function updateActiveCards() {
    for (const card of live2dModelList?.querySelectorAll?.('.live2d-model-card') || []) {
      const isActive = card.dataset.modelId === activeModelId;
      card.classList.toggle('is-active', isActive);
      card.setAttribute('aria-pressed', String(isActive));
    }
  }

  function hasRenderedModelList() {
    return Boolean(live2dModelList?.querySelector?.('.live2d-model-card, .live2d-panel-empty'));
  }

  function clearModelList() {
    logLive2DPanel('clear model list requested', {
      before: getPanelDebugSnapshot()
    });
    live2dModelList?.replaceChildren();
    logLive2DPanel('clear model list complete', {
      after: getPanelDebugSnapshot()
    });
  }

  async function selectModel(modelId) {
    logLive2DPanel('select model requested', {
      modelId,
      before: getPanelDebugSnapshot()
    });
    const selected = await api?.setLive2DModel?.(modelId);
    if (!selected?.available) {
      logLive2DPanel('select model skipped: unavailable selection', {
        modelId,
        selected
      });
      return;
    }

    activeModelId = selected.id;
    persistModelId(selected.id);
    updateActiveCards();
    const live2dAppearance = window.__desktopCatLive2DAppearance;
    const isSameModel = live2dAppearance?.getCurrentModel?.()?.id === selected.id;
    if (isSameModel && live2dAppearance?.isCurrentModelVisible?.()) {
      logLive2DPanel('select model skipped: same visible model', {
        modelId: selected.id,
        after: getPanelDebugSnapshot()
      });
      return;
    }
    if (isSameModel && live2dAppearance?.ensureCurrentModelVisible) {
      await live2dAppearance.ensureCurrentModelVisible();
      logLive2DPanel('select model ensured existing model visible', {
        modelId: selected.id,
        after: getPanelDebugSnapshot()
      });
      return;
    }
    await live2dAppearance?.loadModel?.(selected);
    logLive2DPanel('select model loaded model', {
      modelId: selected.id,
      after: getPanelDebugSnapshot()
    });
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

  function renderModelPreview(modelConfig, preview, card) {
    logLive2DPanel('render static preview requested', {
      modelId: modelConfig?.id || null,
      hasPreviewImageUrl: Boolean(modelConfig?.previewImageUrl),
      before: getPanelDebugSnapshot()
    });
    if (!modelConfig?.previewImageUrl) {
      card.classList.add('is-preview-unavailable');
      logLive2DPanel('render static preview skipped', {
        modelId: modelConfig?.id || null,
        after: getPanelDebugSnapshot()
      });
      return;
    }

    preview.src = modelConfig.previewImageUrl;
    preview.addEventListener('load', () => {
      logLive2DPanel('static preview loaded', {
        modelId: modelConfig.id,
        after: getPanelDebugSnapshot()
      });
    }, { once: true });
    preview.addEventListener('error', () => {
      card.classList.add('is-preview-unavailable');
      logLive2DPanel('static preview failed', {
        modelId: modelConfig.id,
        after: getPanelDebugSnapshot()
      });
    }, { once: true });
  }

  function createModelCard(modelConfig) {
    const card = document.createElement('button');
    card.className = 'live2d-model-card';
    card.type = 'button';
    card.dataset.modelId = modelConfig.id;
    card.setAttribute('aria-pressed', 'false');

    const preview = document.createElement('img');
    preview.className = 'live2d-model-preview';
    preview.alt = '';
    preview.draggable = false;
    preview.decoding = 'async';
    preview.loading = 'eager';
    preview.setAttribute('aria-hidden', 'true');
    renderModelPreview(modelConfig, preview, card);

    const name = document.createElement('span');
    name.className = 'live2d-model-name';
    name.textContent = modelConfig.name || modelConfig.id;

    card.append(preview, name);
    card.addEventListener('click', () => {
      selectModel(modelConfig.id).catch((error) => {
        console.warn('Live2D model failed to switch.', error);
      });
    });

    return card;
  }

  function renderModels() {
    if (!live2dModelList) return;
    clearModelList();

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
    logLive2DPanel('load model list requested', {
      before: getPanelDebugSnapshot()
    });
    if (modelsLoaded) {
      if (!hasRenderedModelList()) {
        renderModels();
      }
      updateActiveCards();
      logLive2DPanel('load model list skipped: already loaded', {
        after: getPanelDebugSnapshot()
      });
      return;
    }
    if (!api?.getLive2DModels) {
      logLive2DPanel('load model list skipped: api unavailable', {
        after: getPanelDebugSnapshot()
      });
      return;
    }
    modelsLoaded = true;
    models = await api.getLive2DModels();
    activeModelId = window.__desktopCatLive2DAppearance?.getCurrentModel?.()?.id || models[0]?.id || null;
    renderModels();
    window.desktopCatDebug = window.desktopCatDebug || {};
    window.desktopCatDebug.live2dModels = models.map((model) => model.id);
    logLive2DPanel('load model list complete', {
      modelIds: models.map((model) => model.id),
      after: getPanelDebugSnapshot()
    });
  }

  async function restoreStoredModel() {
    logLive2DPanel('restore stored model requested', {
      before: getPanelDebugSnapshot()
    });
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
    logLive2DPanel('restore stored model complete', {
      storedModelId,
      activeModelId,
      after: getPanelDebugSnapshot()
    });
  }

  window.__closeLive2DPanel = closePanel;

  live2dBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    logLive2DPanel('switcher button clicked', {
      targetOpenState: !live2dPanel?.classList.contains('show'),
      before: getPanelDebugSnapshot()
    });
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
