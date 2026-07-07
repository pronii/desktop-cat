const MIN_DRAG_WINDOW_POSITION = -2147483648;
const MAX_DRAG_WINDOW_POSITION = 2147483647;
const DEFAULT_DRAG_MOVE_FRAME_MS = 1000 / 60;

function normalizeDragWindowCoordinate(value) {
  const rounded = Math.round(Number(value));
  if (!Number.isFinite(rounded)) return null;
  return Math.max(
    MIN_DRAG_WINDOW_POSITION,
    Math.min(MAX_DRAG_WINDOW_POSITION, rounded)
  );
}

function normalizeDragWindowPosition(point) {
  const x = normalizeDragWindowCoordinate(point?.x);
  const y = normalizeDragWindowCoordinate(point?.y);

  if (x === null || y === null) return null;

  return {
    x,
    y
  };
}

function createDragModeController({
  getPetWindow,
  getCursorScreenPoint,
  setTimeout = globalThis.setTimeout,
  clearTimeout = globalThis.clearTimeout,
  frameMs = DEFAULT_DRAG_MOVE_FRAME_MS
} = {}) {
  let active = false;
  let offset = { x: 0, y: 0 };
  let pendingMovePoint = null;
  let moveTimer = null;

  function normalizeDragPoint(point) {
    const x = Number(point?.x);
    const y = Number(point?.y);

    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x, y };
    }

    return getCursorScreenPoint();
  }

  function stop() {
    active = false;
    pendingMovePoint = null;

    if (moveTimer) {
      clearTimeout(moveTimer);
      moveTimer = null;
    }
  }

  function flush() {
    if (moveTimer) {
      clearTimeout(moveTimer);
    }
    moveTimer = null;

    const window = getPetWindow();
    if (!active || !window || window.isDestroyed()) {
      stop();
      return;
    }

    const cursor = pendingMovePoint;
    pendingMovePoint = null;

    if (!cursor) return;

    const next = normalizeDragWindowPosition({
      x: cursor.x - offset.x,
      y: cursor.y - offset.y
    });
    if (!next) {
      stop();
      return;
    }

    window.setPosition(next.x, next.y);
  }

  function scheduleMoveFrame() {
    if (moveTimer) return;

    moveTimer = setTimeout(flush, frameMs);
    if (typeof moveTimer.unref === 'function') {
      moveTimer.unref();
    }
  }

  function enter(point) {
    const window = getPetWindow();
    if (!window || window.isDestroyed()) return;
    stop();

    const cursor = normalizeDragPoint(point);
    const bounds = window.getBounds();
    offset = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
    active = true;
  }

  function move(point) {
    const window = getPetWindow();
    if (!active || !window || window.isDestroyed()) {
      stop();
      return;
    }

    pendingMovePoint = normalizeDragPoint(point);
    scheduleMoveFrame();
  }

  function exit() {
    flush();
    stop();
  }

  return {
    enter,
    move,
    exit,
    stop,
    isActive: () => active
  };
}

module.exports = {
  DEFAULT_DRAG_MOVE_FRAME_MS,
  createDragModeController,
  normalizeDragWindowCoordinate,
  normalizeDragWindowPosition
};
