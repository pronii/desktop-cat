// 剪贴板面板交互逻辑
(() => {
  const clipboardBtn = document.getElementById('clipboardBtn');
  const clipboardPanel = document.getElementById('clipboardPanel');
  const clipboardPanelClose = document.getElementById('clipboardPanelClose');
  const clipboardPanelContent = document.getElementById('clipboardPanelContent');

  const api = window.desktopCat?.clipboardHistory;

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

  function createTimeEl(timestamp) {
    const timeEl = document.createElement('div');
    timeEl.className = 'clipboard-item-time';
    timeEl.textContent = formatTime(timestamp);
    return timeEl;
  }

  function createEmptyEl() {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'clipboard-empty';
    emptyEl.textContent = '暂无剪贴板历史';
    return emptyEl;
  }

  function renderClipboardItems(items) {
    clipboardPanelContent.replaceChildren();

    if (!items || items.length === 0) {
      clipboardPanelContent.appendChild(createEmptyEl());
      return;
    }

    items.forEach((item) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'clipboard-item';
      itemEl.tabIndex = 0;
      itemEl.setAttribute('role', 'button');
      itemEl.setAttribute('aria-label', '复制这条剪贴板历史');

      if (item.type === 'text') {
        const textEl = document.createElement('div');
        textEl.className = 'clipboard-item-text';
        textEl.textContent = item.content || '';
        itemEl.append(textEl, createTimeEl(item.timestamp));
      } else if (item.type === 'image' || item.type === 'video') {
        const imgEl = document.createElement('img');
        imgEl.src = item.thumbnail;
        imgEl.alt = item.type === 'video' ? '视频缩略图' : '图片缩略图';
        itemEl.append(imgEl, createTimeEl(item.timestamp));
      }

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

  function openClipboardPanel() {
    setPanelOpen(true);

    if (api?.getAll) {
      api.getAll().then((items) => {
        renderClipboardItems(items);
      });
    } else {
      renderClipboardItems([]);
    }
  }

  function closeClipboardPanel() {
    setPanelOpen(false);
  }

  if (clipboardBtn) {
    clipboardBtn.addEventListener('click', () => {
      if (clipboardPanel.classList.contains('show')) {
        closeClipboardPanel();
        return;
      }

      openClipboardPanel();
    });
  }

  if (clipboardPanelClose) {
    clipboardPanelClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closeClipboardPanel();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && clipboardPanel.classList.contains('show')) {
      closeClipboardPanel();
    }
  });

  if (api?.onNewItem) {
    api.onNewItem(() => {
      if (clipboardPanel.classList.contains('show')) {
        api.getAll().then((items) => {
          renderClipboardItems(items);
        });
      }
    });
  }
})();
