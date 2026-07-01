const crypto = require('node:crypto');
const { clipboard } = require('electron');

const SUPPORTED_VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi']);

function isSupportedVideoPath(filePath) {
  if (typeof filePath !== 'string') return false;
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
  return SUPPORTED_VIDEO_EXTS.has(ext);
}

function createContentFingerprint(content) {
  const raw = typeof content.raw === 'string' ? content.raw : JSON.stringify(content.raw);
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function startClipboardWatch(onChange, { intervalMs = 800 } = {}) {
  let currentFingerprint = null;

  const poll = () => {
    try {
      let item = null;

      // 1. Check for image
      const img = clipboard.readImage();
      if (!img.isEmpty()) {
        const size = img.getSize();
        console.log('[Clipboard Watcher] Image detected, size:', size);
        if (size.width > 4 || size.height > 4) {
          const dataUrl = img.toDataURL();
          item = { type: 'image', raw: dataUrl, thumbnail: dataUrl, width: size.width, height: size.height };
          console.log('[Clipboard Watcher] Image item created, data URL length:', dataUrl.length);
        }
      }

      // 2. Check for video files
      if (!item) {
        const fileList = clipboard.read('public.file-urls');
        if (fileList) {
          const files = fileList.split('\n').filter(Boolean);
          for (const filePath of files) {
            if (isSupportedVideoPath(filePath)) {
              item = { type: 'video', raw: filePath, filePath, thumbnail: null };
              break;
            }
          }
        }
      }

      // 3. Check for text
      if (!item) {
        const text = clipboard.readText();
        if (text && text.trim().length > 0) {
          item = { type: 'text', raw: text, content: text };
        }
      }

      if (item) {
        const fingerprint = createContentFingerprint(item);
        console.log('[Clipboard Watcher] Item fingerprint:', fingerprint, 'current:', currentFingerprint);
        if (fingerprint !== currentFingerprint) {
          currentFingerprint = fingerprint;
          console.log('[Clipboard Watcher] New item detected, type:', item.type, 'timestamp:', Date.now());
          onChange({ ...item, timestamp: Date.now() });
        } else {
          console.log('[Clipboard Watcher] Item unchanged, skipping');
        }
      }
    } catch (err) {
      console.error('[Clipboard Watcher] Error polling clipboard:', err);
    }
  };

  poll();
  const timer = setInterval(poll, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return () => clearInterval(timer);
}

module.exports = { startClipboardWatch, isSupportedVideoPath, createContentFingerprint };
