(() => {
  const peerName = document.getElementById('peerName');
  const peerCat = document.getElementById('peerCat');
  const peerStage = document.querySelector('.peer-stage');
  const peerLive2DCanvas = document.getElementById('peerLive2DCanvas');
  const peerLive2D = window.peerLive2D?.createPeerLive2D?.({
    canvas: peerLive2DCanvas,
    stage: peerStage
  });

  let lastRequestedModelId = null;
  let updateVersion = 0;
  let currentPeerUserId = null;
  let activePointerId = null;
  let activeDragUserId = null;

  function toDragPayload(userId, event) {
    return {
      userId,
      screenX: event.screenX,
      screenY: event.screenY
    };
  }

  function beginDrag(event) {
    if (event.button !== 0 || !currentPeerUserId || activePointerId !== null) return;
    activePointerId = event.pointerId;
    activeDragUserId = currentPeerUserId;
    event.preventDefault?.();
    peerStage?.setPointerCapture?.(event.pointerId);
    window.peerPet?.beginDrag?.(toDragPayload(activeDragUserId, event));
  }

  function moveDrag(event) {
    if (event.pointerId !== activePointerId || !activeDragUserId) return;
    event.preventDefault?.();
    window.peerPet?.moveDrag?.(toDragPayload(activeDragUserId, event));
  }

  function endDrag(event) {
    if (event.pointerId !== activePointerId || !activeDragUserId) return;
    const userId = activeDragUserId;
    event.preventDefault?.();
    window.peerPet?.endDrag?.({ userId });
    peerStage?.releasePointerCapture?.(event.pointerId);
    activePointerId = null;
    activeDragUserId = null;
  }

  function setCssFallback() {
    lastRequestedModelId = null;
    peerLive2D?.showCssCat?.();
  }

  async function resolvePeerModel(peer) {
    const modelId = peer?.pet?.modelId;
    if (modelId && window.peerPet?.getLive2DModelById) {
      const matched = await window.peerPet.getLive2DModelById(modelId);
      if (matched?.available) return matched;
    }

    if (window.peerPet?.getDefaultLive2DModel) {
      const fallback = await window.peerPet.getDefaultLive2DModel();
      if (fallback?.available) return fallback;
    }

    return { available: false };
  }

  async function applyPeer(peer) {
    if (!peer) return;
    const version = ++updateVersion;
    currentPeerUserId = peer.userId ? String(peer.userId) : null;

    peerName.textContent = peer.nickname || peer.userId || '好友';
    const isDrag = peer.pet?.action === 'drag';
    peerCat.classList.toggle('is-drag', isDrag);
    peerStage?.classList.toggle('is-drag', isDrag);

    const shouldUseLive2D = peer.renderMode === 'live2d' && peer.pet?.appearanceType === 'live2d';
    if (!shouldUseLive2D || !peerLive2D) {
      setCssFallback();
      return;
    }

    const requestedModelId = String(peer.pet?.modelId || '');
    if (!requestedModelId) {
      setCssFallback();
      return;
    }

    const model = await resolvePeerModel(peer);
    if (version !== updateVersion) {
      return;
    }
    if (!model?.available) {
      setCssFallback();
      return;
    }

    if (lastRequestedModelId === model.id) {
      return;
    }

    const loaded = await peerLive2D.loadModel(model);
    if (version !== updateVersion) {
      return;
    }
    if (loaded) {
      lastRequestedModelId = model.id;
    } else {
      setCssFallback();
    }
  }

  window.peerPet?.onUpdate?.((peer) => {
    return applyPeer(peer).catch((error) => {
      console.warn('Peer pet update failed.', error);
      setCssFallback();
    });
  });

  peerStage?.addEventListener?.('pointerdown', beginDrag);
  peerStage?.addEventListener?.('pointermove', moveDrag);
  peerStage?.addEventListener?.('pointerup', endDrag);
  peerStage?.addEventListener?.('pointercancel', endDrag);
})();
