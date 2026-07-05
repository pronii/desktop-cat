(() => {
  const input = document.getElementById('licenseKeyInput');
  const activateBtn = document.getElementById('licenseActivateBtn');
  const statusText = document.getElementById('licenseStatusText');
  const api = window.desktopCat?.license;

  function normalizeLicenseKey(value) {
    return String(value || '').trim().toUpperCase();
  }

  function renderStatus(state = {}) {
    if (!statusText) return;
    const status = state.status || 'none';
    if (status === 'active') {
      statusText.textContent = '授权已激活';
      return;
    }
    if (status === 'revoked') {
      statusText.textContent = '授权已撤销';
      return;
    }
    if (status === 'expired') {
      statusText.textContent = '授权已过期';
      return;
    }
    if (status === 'device_limit_reached') {
      statusText.textContent = '授权已绑定其他设备';
      return;
    }
    statusText.textContent = '未激活';
  }

  async function refresh() {
    if (!api?.getState || !statusText) return;
    try {
      renderStatus(await api.getState());
    } catch (_error) {
      statusText.textContent = '授权状态不可用';
    }
  }

  activateBtn?.addEventListener('click', async () => {
    if (!api?.activate || !statusText) return;
    const licenseKey = normalizeLicenseKey(input?.value);
    if (!licenseKey) {
      statusText.textContent = '请输入授权码';
      return;
    }

    activateBtn.disabled = true;
    try {
      renderStatus(await api.activate(licenseKey));
    } catch (_error) {
      statusText.textContent = '激活失败';
    } finally {
      activateBtn.disabled = false;
    }
  });

  refresh();
})();
