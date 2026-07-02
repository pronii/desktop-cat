(() => {
  const roomBtn = document.getElementById('roomBtn');
  const roomPanel = document.getElementById('roomPanel');
  const roomPanelClose = document.getElementById('roomPanelClose');
  const roomStatusDot = document.getElementById('roomStatusDot');
  const roomStatusText = document.getElementById('roomStatusText');
  const roomPeerCount = document.getElementById('roomPeerCount');
  const roomCurrent = document.getElementById('roomCurrent');
  const roomNicknameInput = document.getElementById('roomNicknameInput');
  const roomCodeInput = document.getElementById('roomCodeInput');
  const roomCreateBtn = document.getElementById('roomCreateBtn');
  const roomJoinBtn = document.getElementById('roomJoinBtn');
  const roomLeaveBtn = document.getElementById('roomLeaveBtn');
  const roomError = document.getElementById('roomError');
  const roomPeerList = document.getElementById('roomPeerList');

  const api = window.desktopCat?.room;
  let currentState = null;

  function generateRoomCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function getNickname() {
    return roomNicknameInput.value.trim() || '小猫好友';
  }

  function getRoomCode() {
    return roomCodeInput.value.replace(/\D/g, '').slice(0, 6);
  }

  function setError(message) {
    roomError.textContent = message || '';
  }

  function setPanelOpen(isOpen) {
    roomPanel.classList.toggle('show', isOpen);
    roomBtn?.setAttribute('aria-expanded', String(isOpen));
  }

  function formatStatus(status) {
    if (status === 'connected') return '已连接';
    if (status === 'connecting') return '连接中';
    if (status === 'error') return '连接异常';
    return '未连接';
  }

  function formatPetState(peer) {
    const pet = peer.pet || {};
    const action = pet.action === 'drag' ? '移动中' : '待机';
    if (typeof pet.x === 'number' && typeof pet.y === 'number') {
      return `${action} · ${Math.round(pet.x)}, ${Math.round(pet.y)}`;
    }
    return action;
  }

  function renderPeers(peers) {
    roomPeerList.replaceChildren();

    if (!peers.length) {
      const empty = document.createElement('div');
      empty.className = 'room-empty';
      empty.textContent = '暂无好友在线';
      roomPeerList.appendChild(empty);
      return;
    }

    for (const peer of peers) {
      const item = document.createElement('div');
      item.className = 'room-peer';

      const avatar = document.createElement('span');
      avatar.className = 'room-peer-avatar';
      avatar.textContent = '🐾';

      const main = document.createElement('span');
      main.className = 'room-peer-main';

      const name = document.createElement('span');
      name.className = 'room-peer-name';
      name.textContent = peer.nickname || peer.userId || '好友';

      const meta = document.createElement('span');
      meta.className = 'room-peer-meta';
      meta.textContent = formatPetState(peer);

      main.append(name, meta);
      item.append(avatar, main);
      roomPeerList.appendChild(item);
    }
  }

  function renderState(state) {
    currentState = state || {
      status: 'disconnected',
      roomCode: null,
      peers: [],
      error: null
    };

    const peers = currentState.peers || [];
    roomStatusText.textContent = formatStatus(currentState.status);
    roomStatusDot.className = `room-status-dot is-${currentState.status || 'disconnected'}`;
    roomPeerCount.textContent = `${peers.length} 在线`;
    roomCurrent.textContent = `房间: ${currentState.roomCode || '-'}`;
    roomLeaveBtn.disabled = currentState.status !== 'connected' && currentState.status !== 'connecting';
    roomJoinBtn.disabled = currentState.status === 'connecting';
    roomCreateBtn.disabled = currentState.status === 'connecting';
    setError(currentState.error);

    if (currentState.roomCode) {
      roomCodeInput.value = currentState.roomCode;
    }

    renderPeers(peers);
  }

  async function refreshState() {
    if (!api?.getState) return;
    try {
      renderState(await api.getState());
    } catch (_error) {
      setError('无法读取房间状态');
    }
  }

  function openPanel() {
    window.__closeWaterPanel?.();
    window.__closeClipboardPanel?.();
    setPanelOpen(true);
    refreshState();
  }

  function closePanel() {
    setPanelOpen(false);
  }

  async function joinRoom(roomCode) {
    if (!api?.join) return;
    const normalizedCode = String(roomCode || getRoomCode()).replace(/\D/g, '').slice(0, 6);

    if (!/^\d{6}$/.test(normalizedCode)) {
      setError('请输入 6 位房间码');
      return;
    }

    roomCodeInput.value = normalizedCode;
    setError('');

    try {
      renderState(await api.join(normalizedCode, getNickname()));
    } catch (error) {
      setError(error?.message || '加入房间失败');
    }
  }

  window.__closeRoomPanel = closePanel;

  roomBtn?.addEventListener('click', () => {
    if (roomPanel.classList.contains('show')) {
      closePanel();
      return;
    }
    openPanel();
  });

  roomPanelClose?.addEventListener('click', (event) => {
    event.stopPropagation();
    closePanel();
  });

  roomCodeInput?.addEventListener('input', () => {
    roomCodeInput.value = getRoomCode();
  });

  roomCreateBtn?.addEventListener('click', () => {
    const code = generateRoomCode();
    roomCodeInput.value = code;
    joinRoom(code);
  });

  roomJoinBtn?.addEventListener('click', () => {
    joinRoom();
  });

  roomLeaveBtn?.addEventListener('click', async () => {
    if (!api?.leave) return;
    try {
      renderState(await api.leave());
    } catch (_error) {
      setError('退出房间失败');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && roomPanel.classList.contains('show')) {
      closePanel();
    }
  });

  document.addEventListener('click', (event) => {
    if (!roomPanel.classList.contains('show')) return;
    if (roomPanel.contains(event.target) || roomBtn?.contains(event.target)) return;
    closePanel();
  });

  api?.onStateChanged?.(renderState);
  api?.onOpenPanel?.(openPanel);
  refreshState();
})();
