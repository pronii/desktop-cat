const LIVE2D_MOTION_PRIORITY = {
  NONE: 0,
  IDLE: 1,
  NORMAL: 2,
  FORCE: 3
};

const DEFAULT_GROUP_ALIASES = {
  idle: ['Idle', 'idle'],
  tap: ['TapBody', 'TapHead', 'Tap', 'tapBody', 'tap']
};

function getMotionDefinitions(model) {
  return model?.internalModel?.motionManager?.definitions ||
    model?.internalModel?.settings?.motions ||
    {};
}

function resolveMotionGroup(model, aliases = []) {
  const definitions = getMotionDefinitions(model);
  for (const alias of aliases) {
    const motions = definitions?.[alias];
    if (Array.isArray(motions) && motions.length > 0) {
      return alias;
    }
  }
  return null;
}

function getMotionManager(model) {
  return model?.internalModel?.motionManager || null;
}

function normalizeFadeValue(value, minimum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < minimum) {
    return minimum;
  }
  return numeric;
}

function ensureMinimumMotionFade(
  model,
  { minFadeInSeconds = 0.4, minFadeOutSeconds = 0.45 } = {}
) {
  const motionManager = getMotionManager(model);
  if (!motionManager) return;

  const definitions = motionManager.definitions || {};
  for (const motions of Object.values(definitions)) {
    if (!Array.isArray(motions)) continue;
    for (const motion of motions) {
      if (!motion || typeof motion !== 'object') continue;
      motion.FadeInTime = normalizeFadeValue(motion.FadeInTime, minFadeInSeconds);
      motion.FadeOutTime = normalizeFadeValue(motion.FadeOutTime, minFadeOutSeconds);
    }
  }

  const motionGroups = motionManager.motionGroups || {};
  for (const motions of Object.values(motionGroups)) {
    if (!Array.isArray(motions)) continue;
    for (const motion of motions) {
      if (!motion) continue;
      if (typeof motion.getFadeInTime === 'function' && typeof motion.setFadeInTime === 'function') {
        motion.setFadeInTime(normalizeFadeValue(motion.getFadeInTime(), minFadeInSeconds));
      }
      if (typeof motion.getFadeOutTime === 'function' && typeof motion.setFadeOutTime === 'function') {
        motion.setFadeOutTime(normalizeFadeValue(motion.getFadeOutTime(), minFadeOutSeconds));
      }
    }
  }
}

function createLive2DMotionController({
  model,
  timers,
  groupAliases = DEFAULT_GROUP_ALIASES,
  transitionDelayMs = 220,
  fallbackMotionMs = 3600,
  minFadeInSeconds = 0.4,
  minFadeOutSeconds = 0.45,
  priority = LIVE2D_MOTION_PRIORITY.NORMAL,
  logger = console
} = {}) {
  const timerApi = timers || (typeof window !== 'undefined' ? window : globalThis);
  const motionManager = getMotionManager(model);
  let active = false;
  let pendingRequest = null;
  let transitionTimer = null;
  let fallbackTimer = null;
  let disposed = false;
  const fadeOptions = { minFadeInSeconds, minFadeOutSeconds };

  function clearTimer(timer) {
    if (timer) {
      timerApi.clearTimeout(timer);
    }
  }

  function clearTransitionTimer() {
    clearTimer(transitionTimer);
    transitionTimer = null;
  }

  function clearFallbackTimer() {
    clearTimer(fallbackTimer);
    fallbackTimer = null;
  }

  function resolveAlias(alias, fallbackAlias) {
    const aliases = groupAliases[alias] || [alias];
    const group = resolveMotionGroup(model, aliases);
    if (group || !fallbackAlias) return group;
    return resolveMotionGroup(model, groupAliases[fallbackAlias] || [fallbackAlias]);
  }

  async function startRequest(request) {
    if (disposed || !request.group || typeof model?.motion !== 'function') {
      return false;
    }

    clearTransitionTimer();
    clearFallbackTimer();
    active = true;
    ensureMinimumMotionFade(model, fadeOptions);

    fallbackTimer = timerApi.setTimeout(() => {
      handleMotionFinish();
    }, request.fallbackMotionMs);

    try {
      const ok = await model.motion(request.group, undefined, request.priority);
      if (!ok) {
        clearFallbackTimer();
        active = false;
      }
      return Boolean(ok);
    } catch (error) {
      clearFallbackTimer();
      active = false;
      logger?.warn?.('Live2D motion failed to start.', error);
      return false;
    }
  }

  function scheduleRequest(request, delay = transitionDelayMs) {
    clearTransitionTimer();
    transitionTimer = timerApi.setTimeout(() => {
      transitionTimer = null;
      startRequest(request);
    }, delay);
  }

  function handleMotionFinish() {
    if (disposed) return;

    clearFallbackTimer();
    active = false;

    if (!pendingRequest) return;

    const nextRequest = pendingRequest;
    pendingRequest = null;
    scheduleRequest(nextRequest);
  }

  function playAlias(alias, options = {}) {
    const group = resolveAlias(alias, options.fallbackAlias);
    if (!group) return Promise.resolve(false);

    const request = {
      group,
      priority: options.priority || priority,
      fallbackMotionMs: options.fallbackMotionMs || fallbackMotionMs
    };

    if (active || transitionTimer) {
      if (request.priority >= LIVE2D_MOTION_PRIORITY.FORCE) {
        pendingRequest = null;
        return startRequest(request);
      }
      pendingRequest = request;
      return Promise.resolve(false);
    }

    return startRequest(request);
  }

  function playTap() {
    return playAlias('tap');
  }

  function dispose() {
    disposed = true;
    clearTransitionTimer();
    clearFallbackTimer();
    pendingRequest = null;

    if (motionManager?.off) {
      motionManager.off('motionFinish', handleMotionFinish);
    } else if (motionManager?.removeListener) {
      motionManager.removeListener('motionFinish', handleMotionFinish);
    }
  }

  if (motionManager?.on) {
    motionManager.on('motionFinish', handleMotionFinish);
  }

  ensureMinimumMotionFade(model, fadeOptions);

  return {
    playAlias,
    playTap,
    dispose
  };
}

const live2dMotionController = {
  DEFAULT_GROUP_ALIASES,
  LIVE2D_MOTION_PRIORITY,
  createLive2DMotionController,
  ensureMinimumMotionFade,
  resolveMotionGroup
};

if (typeof window !== 'undefined') {
  window.live2dMotionController = live2dMotionController;
}

if (typeof module !== 'undefined') {
  module.exports = live2dMotionController;
}
