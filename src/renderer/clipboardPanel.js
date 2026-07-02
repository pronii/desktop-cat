// 剪贴板面板交互逻辑
(() => {
  const clipboardBtn = document.getElementById('clipboardBtn');
  const clipboardPanel = document.getElementById('clipboardPanel');
  const clipboardPanelClose = document.getElementById('clipboardPanelClose');
  const clipboardPanelContent = document.getElementById('clipboardPanelContent');
  const clipboardPauseBtn = document.getElementById('clipboardPauseBtn');
  const clipboardClearBtn = document.getElementById('clipboardClearBtn');

  const api = window.desktopCat?.clipboardHistory;
  let itemsCache = [];
  let isPaused = false;
  const videoPlaceholder = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="72" viewBox="0 0 160 72"><rect fill="#f3f0eb" width="160" height="72"/><circle cx="80" cy="36" r="18" fill="#7d6ac7"/><polygon points="76,27 76,45 91,36" fill="white"/></svg>'
  );

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

  function setPanelOpen(isOpen) {
    clipboardPanel.classList.toggle('show', isOpen);
    clipboardBtn?.setAttribute('aria-expanded', String(isOpen));
  }

  function applyState(state) {
    isPaused = Boolean(state?.isPaused);
    clipboardPauseBtn.textContent = isPaused ? '恢复' : '暂停';
    clipboardPauseBtn.setAttribute('aria-pressed', String(isPaused));
    clipboardPauseBtn.classList.toggle('is-paused', isPaused);
    clipboardPanel.classList.toggle('is-paused', isPaused);
  }

  function createTimeEl(timestamp) {
    const timeEl = document.createElement('div');
    timeEl.className = 'clipboard-item-time';
    timeEl.textContent = formatTime(timestamp);
    return timeEl;
  }

  function createEmptyEl() {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'clipboard-empty';
    emptyEl.textContent = isPaused ? '记录已暂停' : '暂无剪贴板历史';
    return emptyEl;
  }

  function createDeleteButton(item, itemEl) {
    const button = document.createElement('button');
    button.className = 'clipboard-item-delete';
    button.type = 'button';
    button.textContent = '×';
    button.setAttribute('aria-label', '删除这条历史');

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!api?.removeById) return;

      api.removeById(item.id).then((items) => {
        if (Array.isArray(items)) {
          renderClipboardItems(items);
        } else {
          itemsCache = itemsCache.filter((cached) => cached.id !== item.id);
          itemEl.remove();
          if (itemsCache.length === 0) {
            renderClipboardItems([]);
          }
        }
      });
    });

    return button;
  }

  function renderClipboardItems(items) {
    itemsCache = Array.isArray(items) ? items : [];
    clipboardPanelContent.replaceChildren();

    if (itemsCache.length === 0) {
      clipboardPanelContent.appendChild(createEmptyEl());
      return;
    }

    itemsCache.forEach((item) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'clipboard-item';
      itemEl.tabIndex = 0;
      itemEl.setAttribute('role', 'button');
      itemEl.setAttribute('aria-label', '复制这条剪贴板历史');

      if (item.type === 'text') {
        const textEl = document.createElement('div');
        textEl.className = 'clipboard-item-text';
        textEl.textContent = item.content || '';
        const metaEl = document.createElement('div');
        metaEl.className = 'clipboard-item-meta';
        metaEl.appendChild(createTimeEl(item.timestamp));
        itemEl.append(textEl, metaEl);
      } else if (item.type === 'image' || item.type === 'video') {
        const imgEl = document.createElement('img');
        imgEl.src = item.thumbnail || videoPlaceholder;
        imgEl.alt = item.type === 'video' ? '视频缩略图' : '图片缩略图';
        itemEl.append(imgEl, createTimeEl(item.timestamp));
      }

      itemEl.appendChild(createDeleteButton(item, itemEl));

      const copyItem = () => {
        if (!api?.copy) return;

        api.copy(item.id).then(() => {
          itemEl.classList.add('is-copied');
          setTimeout(() => {
            itemEl.classList.remove('is-copied');
          }, 300);
        });
      };

      itemEl.addEventListener('click', copyItem);
      itemEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          copyItem();
        }
      });

      clipboardPanelContent.appendChild(itemEl);
    });
  }

  function refreshItems() {
    if (api?.getAll) {
      api.getAll().then((items) => {
        renderClipboardItems(items);
      });
    } else {
      renderClipboardItems([]);
    }
  }

  function openClipboardPanel() {
    setPanelOpen(true);
    refreshItems();
    api?.getState?.().then(applyState);
  }

  function closeClipboardPanel() {
    setPanelOpen(false);
  }

  // 曝光关闭方法，供其他面板切换用
  window.__closeClipboardPanel = closeClipboardPanel;

  if (clipboardBtn) {
    clipboardBtn.addEventListener('click', () => {
      if (clipboardPanel.classList.contains('show')) {
        closeClipboardPanel();
        return;
      }
      // 如果喝水面板开着，先关掉
      window.__closeWaterPanel?.();
      window.__closeRoomPanel?.();
      openClipboardPanel();
    });
  }

  if (clipboardPanelClose) {
    clipboardPanelClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closeClipboardPanel();
    });
  }

  clipboardPauseBtn?.addEventListener('click', () => {
    api?.setPaused?.(!isPaused).then((state) => {
      applyState(state);
      if (itemsCache.length === 0) {
        renderClipboardItems([]);
      }
    });
  });

  clipboardClearBtn?.addEventListener('click', () => {
    if (itemsCache.length === 0 || !api?.clear) return;
    const confirmed = window.confirm('确定清空所有剪贴板历史吗？');
    if (!confirmed) return;

    api.clear().then(() => {
      renderClipboardItems([]);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && clipboardPanel.classList.contains('show')) {
      closeClipboardPanel();
    }
  });

  if (api?.onNewItem) {
    api.onNewItem(() => {
      if (clipboardPanel.classList.contains('show')) {
        refreshItems();
      }
    });
  }

  if (api?.onStateChanged) {
    api.onStateChanged((state) => {
      applyState(state);
      if (itemsCache.length === 0) {
        renderClipboardItems([]);
      }
    });
  }

  api?.getState?.().then(applyState);
})();
