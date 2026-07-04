const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const {
  LIVE2D_MOTION_PRIORITY,
  createLive2DMotionController,
  ensureMinimumMotionFade,
  resolveMotionGroup
} = require('../../src/renderer/live2dMotionController');

function createFakeTimers() {
  const timers = [];

  return {
    timers,
    setTimeout(callback, delay) {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) {
        timer.cleared = true;
      }
    },
    flushNext() {
      const timer = timers.find((item) => !item.cleared);
      assert.ok(timer, 'expected a pending timer');
      timer.cleared = true;
      timer.callback();
      return timer.delay;
    }
  };
}

function createFakeModel() {
  const manager = new EventEmitter();
  manager.definitions = {
    Idle: [{ File: 'idle.motion3.json' }],
    TapBody: [{ File: 'tap.motion3.json' }]
  };

  const calls = [];
  return {
    calls,
    model: {
      internalModel: {
        motionManager: manager
      },
      motion(group, index, priority) {
        calls.push({ group, index, priority });
        return Promise.resolve(true);
      }
    },
    manager
  };
}

test('resolves the first available Live2D motion group alias', () => {
  const { model } = createFakeModel();

  assert.equal(resolveMotionGroup(model, ['Missing', 'TapBody', 'Idle']), 'TapBody');
  assert.equal(resolveMotionGroup(model, ['Missing']), null);
});

test('queues the next Live2D motion until the current motion finishes', async () => {
  const fakeTimers = createFakeTimers();
  const { model, manager, calls } = createFakeModel();
  const controller = createLive2DMotionController({
    model,
    timers: fakeTimers,
    transitionDelayMs: 180,
    fallbackMotionMs: 5000
  });

  await controller.playAlias('tap');
  const queued = await controller.playAlias('idle');

  assert.equal(queued, false);
  assert.deepEqual(calls, [{
    group: 'TapBody',
    index: undefined,
    priority: LIVE2D_MOTION_PRIORITY.NORMAL
  }]);

  manager.emit('motionFinish');
  const delay = fakeTimers.flushNext();

  assert.equal(delay, 180);
  assert.deepEqual(calls, [
    {
      group: 'TapBody',
      index: undefined,
      priority: LIVE2D_MOTION_PRIORITY.NORMAL
    },
    {
      group: 'Idle',
      index: undefined,
      priority: LIVE2D_MOTION_PRIORITY.NORMAL
    }
  ]);

  controller.dispose();
});

test('raises very short Live2D motion fade times to a natural minimum', () => {
  const loadedMotion = {
    fadeIn: 0.1,
    fadeOut: 0.2,
    getFadeInTime() {
      return this.fadeIn;
    },
    getFadeOutTime() {
      return this.fadeOut;
    },
    setFadeInTime(value) {
      this.fadeIn = value;
    },
    setFadeOutTime(value) {
      this.fadeOut = value;
    }
  };
  const manager = new EventEmitter();
  manager.definitions = {
    TapBody: [{ FadeInTime: 0.05, FadeOutTime: 0.15 }]
  };
  manager.motionGroups = {
    TapBody: [loadedMotion]
  };

  ensureMinimumMotionFade({
    internalModel: {
      motionManager: manager
    }
  }, { minFadeInSeconds: 0.45, minFadeOutSeconds: 0.5 });

  assert.deepEqual(manager.definitions.TapBody[0], {
    FadeInTime: 0.45,
    FadeOutTime: 0.5
  });
  assert.equal(loadedMotion.fadeIn, 0.45);
  assert.equal(loadedMotion.fadeOut, 0.5);
});
