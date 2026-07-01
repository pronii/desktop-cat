const crypto = require('node:crypto');
const { clipboard } = require('electron');

const SUPPORTED_VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi']);
const DEFAULT_INTERVAL_MS = 1500;
const THUMBNAIL_MAX_SIZE = 220;

function isSupportedVideoPath(filePath) {
  if (typeof filePath !== 'string') return false;
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
  return SUPPORTED_VIDEO_EXTS.has(ext);
}

function createContentFingerprint(content) {
  const hash = crypto.createHash('sha256');
  if (Buffer.isBuffer(content.raw)) {
    hash.update(content.raw);
  } else {
    const raw = typeof content.raw === 'string' ? content.raw : JSON.stringify(content.raw);
    hash.update(raw);
  }
  return hash.digest('hex').slice(0, 16);
}

function createThumbnailDataUrl(image, size) {
  const scale = Math.min(THUMBNAIL_MAX_SIZE / size.width, THUMBNAIL_MAX_SIZE / size.height, 1);
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  return image.resize({ width, height, quality: 'good' }).toDataURL();
}

function createThumbnailImage(image, size) {
  const scale = Math.min(THUMBNAIL_MAX_SIZE / size.width, THUMBNAIL_MAX_SIZE / size.height, 1);
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  return image.resize({ width, height, quality: 'good' });
}

function startClipboardWatch(onChange, { intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  let currentFingerprint = null;

  function emitIfChanged(raw, createItem) {
    const fingerprint = createContentFingerprint({ raw });
    if (fingerprint === currentFingerprint) return;

    currentFingerprint = fingerprint;
    onChange({ ...createItem(), timestamp: Date.now() });
  }

  const poll = () => {
    try {
      const img = clipboard.readImage();
      if (!img.isEmpty()) {
        const size = img.getSize();
        if (size.width > 4 || size.height > 4) {
          const thumbnailImage = createThumbnailImage(img, size);
          const thumbnailBuffer = thumbnailImage.toPNG();
          emitIfChanged(thumbnailBuffer, () => ({
            type: 'image',
            raw: thumbnailBuffer,
            imageBuffer: img.toPNG(),
            thumbnail: thumbnailImage.toDataURL(),
            width: size.width,
            height: size.height
          }));
          return;
        }
      }

      const fileList = clipboard.read('public.file-urls');
      if (fileList) {
        const files = fileList.split('\n').filter(Boolean);
        for (const filePath of files) {
          if (isSupportedVideoPath(filePath)) {
            emitIfChanged(filePath, () => ({ type: 'video', raw: filePath, filePath, thumbnail: null }));
            return;
          }
        }
      }

      const text = clipboard.readText();
      if (text && text.trim().length > 0) {
        emitIfChanged(text, () => ({ type: 'text', raw: text, content: text }));
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

module.exports = { startClipboardWatch, isSupportedVideoPath, createContentFingerprint, createThumbnailDataUrl };
