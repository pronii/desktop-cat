(() => {
  const api = window.clipboardHistoryAPI;
  if (!api) return;

  const grid = document.getElementById('grid');
  const emptyMsg = document.getElementById('emptyMsg');
  const clearBtn = document.getElementById('clearBtn');
  const toast = document.getElementById('toast');

  let toastTimer = null;

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

  function createCard(item) {
    const card = document.createElement('div');
    card.className = 'ch-card';
    card.dataset.id = item.id;

    if (item.type === 'text') {
      // For text items, show text preview instead of image
      const textPreview = document.createElement('div');
      textPreview.className = 'ch-card-text';
      textPreview.textContent = item.content || '';
      card.appendChild(textPreview);
    } else {
      // For image and video items
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

    card.addEventListener('click', () => {
      api.copyItem(item.id).then(() => {
        showToast('已复制');
        const overlay = document.createElement('div');
        overlay.className = 'ch-card-copied';
        overlay.textContent = '✓ 已复制';
        card.appendChild(overlay);
        setTimeout(() => overlay.remove(), 1000);
      });
    });

    return card;
  }

  function renderItems(items) {
    // Remove all cards, keep empty message
    grid.querySelectorAll('.ch-card').forEach(el => el.remove());

    if (!items || items.length === 0) {
      emptyMsg.style.display = 'block';
      return;
    }

    emptyMsg.style.display = 'none';
    for (const item of items) {
      grid.appendChild(createCard(item));
    }
  }

  function addItem(item) {
    emptyMsg.style.display = 'none';
    // Insert at the top
    const firstCard = grid.querySelector('.ch-card');
    if (firstCard) {
      grid.insertBefore(createCard(item), firstCard);
    } else {
      grid.appendChild(createCard(item));
    }
  }

  // Load initial items
  api.getItems().then(renderItems);

  // Listen for new items in real-time
  api.onNewItem((item) => {
    addItem(item);
  });

  // Clear button
  clearBtn.addEventListener('click', () => {
    api.clearHistory().then(() => {
      renderItems([]);
      showToast('已清空历史');
    });
  });
})();
