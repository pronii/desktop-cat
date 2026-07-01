(() => {
  const api = window.clipboardHistoryAPI;
  if (!api) return;

  const grid = document.getElementById('grid');
  const emptyMsg = document.getElementById('emptyMsg');
  const clearBtn = document.getElementById('clearBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const toast = document.getElementById('toast');

  let toastTimer = null;
  let itemsCache = [];
  let isPaused = false;

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('ch-toast-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('ch-toast-visible');
    }, 1500);
  }

  function formatTime(ts) {
    const diff = Date.now() - ts;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return '刚刚';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}天前`;
    return new Date(ts).toLocaleDateString('zh-CN');
  }

  function applyState(state) {
    isPaused = Boolean(state?.isPaused);
    pauseBtn.textContent = isPaused ? '恢复记录' : '暂停记录';
    pauseBtn.setAttribute('aria-pressed', String(isPaused));
    pauseBtn.classList.toggle('is-paused', isPaused);
    document.body.classList.toggle('is-paused', isPaused);
  }

  function createDeleteButton(item, card) {
    const button = document.createElement('button');
    button.className = 'ch-card-delete';
    button.type = 'button';
    button.textContent = '×';
    button.setAttribute('aria-label', '删除这条历史');

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      api.removeItem(item.id).then((items) => {
        if (Array.isArray(items)) {
          renderItems(items);
        } else {
          card.remove();
          itemsCache = itemsCache.filter((cached) => cached.id !== item.id);
          emptyMsg.style.display = itemsCache.length === 0 ? 'block' : 'none';
        }
        showToast('已删除');
      });
    });

    return button;
  }

  function createCard(item) {
    const card = document.createElement('div');
    card.className = 'ch-card';
    card.dataset.id = item.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', '复制这条剪贴板历史');

    if (item.type === 'text') {
      const textPreview = document.createElement('div');
      textPreview.className = 'ch-card-text';
      textPreview.textContent = item.content || '';
      card.appendChild(textPreview);
    } else {
      const img = document.createElement('img');
      if (item.type === 'video') {
        img.src = item.thumbnail || 'data:image/svg+xml,' + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="130" height="130" viewBox="0 0 130 130"><rect fill="#2a2a4a" width="130" height="130"/><text x="65" y="65" text-anchor="middle" dominant-baseline="central" font-size="32" fill="#6a6a8a">▶</text></svg>'
        );
      } else {
        img.src = item.thumbnail;
      }
      img.alt = item.type === 'video' ? '视频' : '图片';
      card.appendChild(img);

      if (item.type === 'video') {
        const icon = document.createElement('span');
        icon.className = 'ch-card-video-icon';
        icon.textContent = '▶';
        card.appendChild(icon);
      }
    }

    const time = document.createElement('div');
    time.className = 'ch-card-time';
    time.textContent = formatTime(item.timestamp);
    card.appendChild(time);
    card.appendChild(createDeleteButton(item, card));

    const copyItem = () => {
      api.copyItem(item.id).then(() => {
        showToast('已复制');
        const overlay = document.createElement('div');
        overlay.className = 'ch-card-copied';
        overlay.textContent = '已复制';
        card.appendChild(overlay);
        setTimeout(() => overlay.remove(), 1000);
      });
    };

    card.addEventListener('click', copyItem);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        copyItem();
      }
    });

    return card;
  }

  function renderItems(items) {
    itemsCache = Array.isArray(items) ? items : [];
    grid.querySelectorAll('.ch-card').forEach(el => el.remove());

    if (itemsCache.length === 0) {
      emptyMsg.style.display = 'block';
      return;
    }

    emptyMsg.style.display = 'none';
    for (const item of itemsCache) {
      grid.appendChild(createCard(item));
    }
  }

  function addItem(item) {
    itemsCache = [item, ...itemsCache.filter((cached) => cached.id !== item.id)];
    emptyMsg.style.display = 'none';
    const firstCard = grid.querySelector('.ch-card');
    if (firstCard) {
      grid.insertBefore(createCard(item), firstCard);
    } else {
      grid.appendChild(createCard(item));
    }
  }

  api.getItems().then(renderItems);
  api.getState().then(applyState);

  api.onNewItem((item) => {
    addItem(item);
  });

  api.onStateChanged((state) => {
    applyState(state);
  });

  pauseBtn.addEventListener('click', () => {
    api.setPaused(!isPaused).then((state) => {
      applyState(state);
      showToast(state.isPaused ? '已暂停记录' : '已恢复记录');
    });
  });

  clearBtn.addEventListener('click', () => {
    if (itemsCache.length === 0) return;
    const confirmed = window.confirm('确定清空所有剪贴板历史吗？');
    if (!confirmed) return;

    api.clearHistory().then(() => {
      renderItems([]);
      showToast('已清空历史');
    });
  });
})();
