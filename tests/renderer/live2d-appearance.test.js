const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function readSource(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf-8');
}

function listFilesRecursive(rootDir) {
  const files = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

test('renderer auto-loads Live2D from folder without adding an import button', () => {
  const html = readSource('src', 'renderer', 'index.html');
  const css = readSource('src', 'renderer', 'styles.css');
  const preload = readSource('src', 'main', 'preload.js');

  assert.match(html, /id="live2dCanvas"/);
  assert.match(html, /vendor\/live2d\/live2dcubismcore\.min\.js/);
  assert.match(html, /vendor\/live2d\/pixi\.min\.js/);
  assert.match(html, /vendor\/live2d\/pixi-live2d-cubism4\.min\.js/);
  assert.match(html, /live2dMotionController\.js/);
  assert.match(html, /live2dAppearance\.js/);
  assert.match(html, /live2dPanel\.js/);
  assert.ok(
    html.indexOf('live2dMotionController.js') < html.indexOf('live2dAppearance.js'),
    'motion controller must load before Live2D appearance script'
  );
  assert.ok(
    html.indexOf('live2dAppearance.js') < html.indexOf('live2dPanel.js'),
    'Live2D appearance script must load before the switcher panel'
  );
  assert.doesNotMatch(html, /id="live2dImportBtn"/);
  assert.doesNotMatch(html, /导入 Live2D|瀵煎叆 Live2D/);
  assert.match(html, /id="live2dSwitcherBtn"/);
  assert.match(html, /aria-controls="live2dPanel"/);
  assert.match(html, /id="live2dPanel"/);
  assert.match(html, /id="live2dModelList"/);

  assert.match(css, /\.live2d-canvas\s*\{/);
  assert.match(css, /\.stage\.has-live2d\s+\.cat/);
  assert.match(css, /\.stage\.has-live2d\s+\.live2d-canvas/);
  assert.match(css, /\.live2d-panel-body\s*\{/);
  assert.match(css, /\.live2d-model-list\s*\{/);
  assert.match(css, /\.live2d-model-card\s*\{/);
  assert.match(css, /\.live2d-model-preview\s*\{/);

  assert.match(preload, /appearance\s*:\s*\{/);
  assert.match(preload, /getLive2DModel:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('appearance:get-live2d-model'\)/);
  assert.match(preload, /getLive2DModels:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('appearance:get-live2d-models'\)/);
  assert.match(preload, /setLive2DModel:\s*\(modelId\)\s*=>\s*ipcRenderer\.invoke\('appearance:set-live2d-model',\s*modelId\)/);
});

test('live2d renderer script keeps the default cat when no model is configured', () => {
  const script = readSource('src', 'renderer', 'live2dAppearance.js');

  assert.match(script, /getLive2DModel/);
  assert.match(script, /Live2DModel\.from/);
  assert.match(script, /createLive2DMotionController/);
  assert.match(script, /playTap/);
  assert.match(script, /has-live2d/);
  assert.match(script, /catch/);
});

test('live2d switcher panel renders model previews and selects a model', () => {
  const script = readSource('src', 'renderer', 'live2dPanel.js');

  assert.match(script, /getLive2DModels/);
  assert.match(script, /setLive2DModel/);
  assert.match(script, /previewImageUrl/);
  assert.match(script, /document\.createElement\('img'\)/);
  assert.doesNotMatch(script, /Live2DModel\.from/);
  assert.doesNotMatch(script, /new\s+window\.PIXI\.Application/);
  assert.doesNotMatch(script, /document\.createElement\('canvas'\)/);
  assert.match(script, /live2dModelList/);
  assert.match(script, /live2d-model-card/);
  assert.match(script, /loadModel\?\.\(selected\)/);
});

test('bundled live2d models do not include audio assets or sound motion bindings', () => {
  const live2dModelsDir = path.join(__dirname, '..', '..', 'src', 'renderer', 'live2d-models');
  const files = listFilesRecursive(live2dModelsDir);
  const audioFiles = files.filter((file) => /\.(wav|mp3|ogg|m4a)$/i.test(file));
  const soundReferences = files
    .filter((file) => /\.json$/i.test(file))
    .filter((file) => /"Sound"\s*:/.test(fs.readFileSync(file, 'utf-8')));

  assert.deepEqual(audioFiles, []);
  assert.deepEqual(soundReferences, []);
});

test('live2d switcher uses static previews so the panel cannot disturb the visible model runtime', () => {
  const script = readSource('src', 'renderer', 'live2dPanel.js');
  const loadModelsMatch = script.match(/async\s+function\s+loadModels\s*\(\)\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(loadModelsMatch, 'loadModels function should exist');
  const loadModelsBody = loadModelsMatch[1];
  const setOpenMatch = script.match(/function\s+setOpen\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(setOpenMatch, 'setOpen function should exist');
  const setOpenBody = setOpenMatch[1];

  assert.doesNotMatch(
    loadModelsBody,
    /if\s*\(\s*modelsLoaded\s*\)\s*\{\s*renderModels\s*\(\s*\)/,
    'loadModels must not re-render model cards on every panel open because old preview PIXI apps keep running'
  );
  assert.match(
    script,
    /if\s*\(\s*modelsLoaded\s*\)\s*\{[\s\S]*updateActiveCards\s*\(\s*\)[\s\S]*return\s*;/,
    'when models are already loaded, reopening the panel should only refresh active card state'
  );
  assert.doesNotMatch(
    setOpenBody,
    /else\s*\{[\s\S]*clearModelList\s*\(\s*\)[\s\S]*\}/,
    'hiding the panel must not clear preview images or disturb the visible model'
  );
  assert.match(script, /preview\.src\s*=\s*modelConfig\.previewImageUrl/, 'preview cards should use static image assets');
  assert.doesNotMatch(script, /previewResources/, 'switcher previews should not own PIXI resources');
  assert.doesNotMatch(script, /Live2DModel\.from/, 'preview cards must not load Live2D models');
  assert.doesNotMatch(script, /new\s+window\.PIXI\.Application/, 'preview cards must not create PIXI apps');
  assert.match(
    script,
    /isCurrentModelVisible/,
    'selecting the model that is already active should only skip reload when the current model is still visible'
  );
});

test('live2d switcher restores the same stored model when it is hidden', async () => {
  const script = readSource('src', 'renderer', 'live2dPanel.js');
  const modelConfig = {
    available: true,
    id: 'Haru',
    name: 'Haru',
    modelUrl: 'desktop-cat-live2d://model/Haru/Haru.model3.json'
  };
  const restorations = [];

  function createElement() {
    return {
      classList: {
        contains() {
          return false;
        },
        toggle() {},
        add() {},
        remove() {}
      },
      dataset: {},
      setAttribute() {},
      addEventListener() {},
      querySelectorAll() {
        return [];
      },
      replaceChildren() {},
      contains() {
        return false;
      }
    };
  }

  const elements = new Map([
    ['live2dSwitcherBtn', createElement()],
    ['live2dPanel', createElement()],
    ['live2dPanelClose', createElement()],
    ['live2dModelList', createElement()]
  ]);

  const fakeWindow = {
    desktopCat: {
      appearance: {
        getLive2DModels: async () => [modelConfig],
        setLive2DModel: async () => modelConfig
      }
    },
    __desktopCatLive2DAppearance: {
      getCurrentModel: () => ({ id: 'Haru' }),
      isCurrentModelVisible: () => false,
      ensureCurrentModelVisible: async () => {
        restorations.push('ensure');
      },
      loadModel: async () => {
        restorations.push('load');
      }
    },
    localStorage: {
      getItem: () => 'Haru',
      setItem() {}
    }
  };

  const fakeDocument = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    addEventListener() {}
  };

  vm.runInNewContext(script, {
    window: fakeWindow,
    document: fakeDocument,
    console
  });

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.notDeepEqual(restorations, []);
});

test('live2d switcher does not reset the current visible model when no switch is needed', async () => {
  const script = readSource('src', 'renderer', 'live2dPanel.js');
  const modelConfig = {
    available: true,
    id: 'Haru',
    name: 'Haru',
    modelUrl: 'desktop-cat-live2d://model/Haru/Haru.model3.json'
  };
  let setModelCalls = 0;
  let loadCalls = 0;

  function createElement() {
    return {
      classList: {
        contains() {
          return false;
        },
        toggle() {},
        add() {},
        remove() {}
      },
      dataset: {},
      setAttribute() {},
      addEventListener() {},
      querySelectorAll() {
        return [];
      },
      replaceChildren() {},
      contains() {
        return false;
      }
    };
  }

  const elements = new Map([
    ['live2dSwitcherBtn', createElement()],
    ['live2dPanel', createElement()],
    ['live2dPanelClose', createElement()],
    ['live2dModelList', createElement()]
  ]);

  const fakeWindow = {
    desktopCat: {
      appearance: {
        getLive2DModels: async () => [modelConfig],
        setLive2DModel: async () => {
          setModelCalls += 1;
          return modelConfig;
        }
      }
    },
    __desktopCatLive2DAppearance: {
      getCurrentModel: () => ({ id: 'Haru' }),
      isCurrentModelVisible: () => true,
      ensureCurrentModelVisible: async () => {
        loadCalls += 1;
      },
      loadModel: async () => {
        loadCalls += 1;
      }
    },
    localStorage: {
      getItem: () => 'Haru',
      setItem() {}
    }
  };

  const fakeDocument = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    addEventListener() {}
  };

  vm.runInNewContext(script, {
    window: fakeWindow,
    document: fakeDocument,
    console
  });

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(setModelCalls, 0);
  assert.equal(loadCalls, 0);
});

test('live2d switcher button opens previews without touching the visible main model', async () => {
  const script = readSource('src', 'renderer', 'live2dPanel.js');
  const modelConfig = {
    available: true,
    id: 'Haru',
    name: 'Haru',
    modelUrl: 'desktop-cat-live2d://model/Haru/Haru.model3.json',
    previewImageUrl: 'desktop-cat-live2d://model/Haru/textures/texture_00.png'
  };
  let panelOpen = false;
  let buttonClick = null;
  let setModelCalls = 0;
  let loadCalls = 0;
  let previewAppCreations = 0;
  let previewModelLoads = 0;
  const createdImages = [];

  function createElement(id = '') {
    return {
      children: [],
      classList: {
        contains(name) {
          return id === 'live2dPanel' && name === 'show' ? panelOpen : false;
        },
        toggle(name, value) {
          if (id === 'live2dPanel' && name === 'show') {
            panelOpen = Boolean(value);
          }
        },
        add() {},
        remove() {}
      },
      dataset: {},
      setAttribute() {},
      addEventListener(type, handler) {
        if (id === 'live2dSwitcherBtn' && type === 'click') {
          buttonClick = handler;
        }
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      replaceChildren() {
        this.children = [];
      },
      append(...children) {
        this.children.push(...children);
      },
      contains() {
        return false;
      }
    };
  }

  const elements = new Map([
    ['live2dSwitcherBtn', createElement('live2dSwitcherBtn')],
    ['live2dPanel', createElement('live2dPanel')],
    ['live2dPanelClose', createElement('live2dPanelClose')],
    ['live2dModelList', createElement('live2dModelList')]
  ]);

  class FakePixiApplication {
    constructor(options = {}) {
      previewAppCreations += 1;
      this.view = options.view;
      this.stage = {
        children: [],
        addChild(child) {
          this.children.push(child);
        },
        removeChild(child) {
          this.children = this.children.filter((entry) => entry !== child);
        }
      };
    }

    render() {}
    destroy() {}
  }

  const fakeWindow = {
    desktopCat: {
      appearance: {
        getLive2DModels: async () => [modelConfig],
        setLive2DModel: async () => {
          setModelCalls += 1;
          return modelConfig;
        }
      }
    },
    __desktopCatLive2DAppearance: {
      getCurrentModel: () => ({ id: 'Haru', available: true }),
      isCurrentModelVisible: () => true,
      ensureCurrentModelVisible: async () => {
        loadCalls += 1;
      },
      loadModel: async () => {
        loadCalls += 1;
      }
    },
    localStorage: {
      getItem: () => 'Haru',
      setItem() {}
    },
    PIXI: {
      Application: FakePixiApplication,
      live2d: {
        Live2DModel: {
          from: async () => {
            previewModelLoads += 1;
            return {
              width: 120,
              height: 180,
              anchor: { set() {} },
              scale: { set() {} },
              on() {},
              destroy() {}
            };
          }
        }
      }
    }
  };

  const fakeDocument = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tagName) {
      const element = createElement();
      element.tagName = tagName.toUpperCase();
      if (tagName === 'canvas') {
        throw new Error('switcher previews must not create canvases');
      }
      if (tagName === 'img') {
        createdImages.push(element);
      }
      return element;
    },
    createDocumentFragment() {
      return {
        children: [],
        append(...children) {
          this.children.push(...children);
        }
      };
    },
    addEventListener() {}
  };

  vm.runInNewContext(script, {
    window: fakeWindow,
    document: fakeDocument,
    console
  });

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(setModelCalls, 0);
  assert.equal(loadCalls, 0);
  assert.equal(previewAppCreations, 0);
  assert.equal(previewModelLoads, 0);

  assert.ok(buttonClick, 'switcher button click handler should be registered');
  buttonClick({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(panelOpen, true);
  assert.equal(setModelCalls, 0);
  assert.equal(loadCalls, 0);
  assert.equal(previewAppCreations, 0);
  assert.equal(previewModelLoads, 0);
  assert.equal(createdImages.length, 1);
  assert.equal(createdImages[0].src, modelConfig.previewImageUrl);
});

test('closing live2d switcher preview does not destroy the visible main model', async () => {
  const script = readSource('src', 'renderer', 'live2dPanel.js');
  const modelConfig = {
    available: true,
    id: 'Haru',
    name: 'Haru',
    modelUrl: 'desktop-cat-live2d://model/Haru/Haru.model3.json',
    previewImageUrl: 'desktop-cat-live2d://model/Haru/textures/texture_00.png'
  };
  let panelOpen = false;
  let buttonClick = null;
  let mainModelDestroyed = false;
  const loadedPreviewUrls = [];
  const mainModel = {
    width: 120,
    height: 180,
    anchor: { set() {} },
    scale: { set() {} },
    on() {},
    destroy() {
      mainModelDestroyed = true;
    }
  };

  function createElement(id = '') {
    return {
      children: [],
      classList: {
        contains(name) {
          return id === 'live2dPanel' && name === 'show' ? panelOpen : false;
        },
        toggle(name, value) {
          if (id === 'live2dPanel' && name === 'show') {
            panelOpen = Boolean(value);
          }
        },
        add() {},
        remove() {}
      },
      dataset: {},
      setAttribute() {},
      addEventListener(type, handler) {
        if (id === 'live2dSwitcherBtn' && type === 'click') {
          buttonClick = handler;
        }
      },
      querySelector() {
        return this.children.length ? this.children[0] : null;
      },
      querySelectorAll() {
        return [];
      },
      replaceChildren() {
        this.children = [];
      },
      append(...children) {
        this.children.push(...children);
      },
      contains() {
        return false;
      }
    };
  }

  const elements = new Map([
    ['live2dSwitcherBtn', createElement('live2dSwitcherBtn')],
    ['live2dPanel', createElement('live2dPanel')],
    ['live2dPanelClose', createElement('live2dPanelClose')],
    ['live2dModelList', createElement('live2dModelList')]
  ]);

  class FakePixiApplication {
    constructor() {
      this.stage = {
        children: [],
        addChild(child) {
          this.children.push(child);
        },
        removeChild(child) {
          this.children = this.children.filter((entry) => entry !== child);
        }
      };
    }

    render() {}
    destroy() {
      mainModelDestroyed = true;
    }
  }

  const fakeWindow = {
    desktopCat: {
      appearance: {
        getLive2DModels: async () => [modelConfig],
        setLive2DModel: async () => modelConfig
      }
    },
    __desktopCatLive2DAppearance: {
      getCurrentModel: () => modelConfig,
      isCurrentModelVisible: () => true,
      ensureCurrentModelVisible: async () => modelConfig,
      loadModel: async () => {
        throw new Error('opening the switcher must not reload the main model');
      }
    },
    localStorage: {
      getItem: () => 'Haru',
      setItem() {}
    },
    PIXI: {
      Application: FakePixiApplication,
      live2d: {
        Live2DModel: {
          from: async (url) => {
            loadedPreviewUrls.push(url);
            if (url === modelConfig.modelUrl) {
              return mainModel;
            }
            return {
              width: 120,
              height: 180,
              anchor: { set() {} },
              scale: { set() {} },
              on() {},
              destroy() {}
            };
          }
        }
      }
    }
  };

  const fakeDocument = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tagName) {
      const element = createElement();
      element.tagName = tagName.toUpperCase();
      return element;
    },
    createDocumentFragment() {
      return {
        children: [],
        append(...children) {
          this.children.push(...children);
        }
      };
    },
    addEventListener() {}
  };

  vm.runInNewContext(script, {
    window: fakeWindow,
    document: fakeDocument,
    console
  });

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(buttonClick, 'switcher button click handler should be registered');
  buttonClick({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  buttonClick({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(panelOpen, false);
  assert.equal(mainModelDestroyed, false);
  assert.equal(loadedPreviewUrls.length, 0);
});

test('live2d renderer reuses the PIXI application across model switches', () => {
  const script = readSource('src', 'renderer', 'live2dAppearance.js');

  // 提取 disposeCurrentModel 函数体
  const disposeMatch = script.match(/function\s+disposeCurrentModel\s*\(\)\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(disposeMatch, 'disposeCurrentModel function should exist');
  const disposeBody = disposeMatch[1];

  // 销毁 PIXI app 会触发 WEBGL_lose_context.loseContext()，导致同一 canvas 上
  // 后续 getContext('webgl') 返回已丢失的 context，新模型无法渲染。
  assert.doesNotMatch(
    disposeBody,
    /pixiApp\s*\.\s*destroy/,
    'disposeCurrentModel must not destroy the PIXI app — destroying it loses the WebGL ' +
    'context on the shared canvas, making every subsequent model switch fail silently'
  );

  // PIXI app 应通过 helper 只创建一次并复用，而非每次 loadModel 都重建
  assert.match(
    script,
    /ensurePixiApp/,
    'should have an ensurePixiApp helper that creates the PIXI application only once ' +
    'and reuses it across switches'
  );

  // loadModel 中不应直接 new PIXI.Application（应走 ensurePixiApp）
  const loadMatch = script.match(/async\s+function\s+loadModel\s*\([\s\S]*?\n\s*\}/);
  assert.ok(loadMatch, 'loadModel function should exist');
  assert.doesNotMatch(
    loadMatch[0],
    /new\s+window\.PIXI\.Application/,
    'loadModel must not create a new PIXI.Application directly — use ensurePixiApp instead'
  );
});

test('renderer makes transparent window areas click-through via setIgnoreMouseEvents', () => {
  const renderer = readSource('src', 'renderer', 'renderer.js');
  const preload = readSource('src', 'main', 'preload.js');
  const main = readSource('src', 'main', 'main.js');

  // preload 暴露 setClickThrough API
  assert.match(preload, /setClickThrough/, 'preload should expose setClickThrough');
  assert.match(
    preload,
    /ipcRenderer\.send\('window:set-click-through'/,
    'preload should send IPC to main process'
  );

  // main 进程注册 IPC handler 调用 setIgnoreMouseEvents
  assert.match(main, /window:set-click-through/, 'main should handle the IPC');
  assert.match(
    main,
    /setIgnoreMouseEvents/,
    'main should call petWindow.setIgnoreMouseEvents'
  );

  // renderer 有 mousemove 监听器动态切换穿透状态
  assert.match(renderer, /mousemove/, 'renderer should listen to mousemove');
  assert.match(renderer, /elementFromPoint/, 'renderer should use elementFromPoint for hit-test');
  assert.match(renderer, /setClickThrough/, 'renderer should call setClickThrough API');

  // CSS 猫应做子元素级 hit-test，而非整个 .cat bounding box
  assert.match(renderer, /catHitElements/, 'renderer should collect cat child elements for hit-test');
  assert.match(renderer, /isPointOverCatVisible/, 'renderer should check if point is over visible cat parts');
  assert.match(
    renderer,
    /\.ear-left|\.ear-right|\.head|\.body|\.tail/,
    'cat hit-test should check visible child elements (ears, head, body, tail)'
  );

  // Live2D canvas 应做像素级 alpha 检测
  assert.match(renderer, /isPointOverLive2DVisible/, 'renderer should check Live2D canvas pixel alpha');
  assert.match(renderer, /isPointOverVisible/, 'renderer should use the Live2D appearance hit-test');
  assert.doesNotMatch(renderer, /getContext\('2d'\)/, 'renderer must not read a PIXI WebGL canvas as a 2D canvas');

  // 按下/拖拽/面板打开时不应穿透
  assert.match(renderer, /pressActive|isLongPress/, 'renderer should not click-through while pressing cat');
  assert.match(renderer, /isAnyOverlayOpen/, 'renderer should not click-through while overlay is open');
});

test('live2d appearance can restore the current model when settings leave it hidden', async () => {
  const script = readSource('src', 'renderer', 'live2dAppearance.js');
  const stageClasses = new Set();
  const loadedModels = [];
  const stage = {
    classList: {
      add(name) {
        stageClasses.add(name);
      },
      remove(name) {
        stageClasses.delete(name);
      },
      contains(name) {
        return stageClasses.has(name);
      }
    }
  };
  const canvas = {
    width: 0,
    height: 0,
    attributes: new Map(),
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    getAttribute(name) {
      return this.attributes.get(name);
    }
  };
  class FakePixiApplication {
    constructor() {
      this.stage = {
        children: [],
        addChild: (child) => {
          this.stage.children.push(child);
        },
        removeChild: (child) => {
          this.stage.children = this.stage.children.filter((entry) => entry !== child);
        }
      };
    }
  }
  const modelConfig = {
    available: true,
    id: 'Haru',
    name: 'Haru',
    modelUrl: 'desktop-cat-live2d://model/Haru/Haru.model3.json'
  };
  const fakeWindow = {
    desktopCatDebug: {},
    desktopCat: {
      appearance: {
        getLive2DModel: async () => ({ available: false })
      }
    },
    live2dMotionController: {
      createLive2DMotionController: () => ({
        playTap() {},
        dispose() {}
      })
    },
    PIXI: {
      Application: FakePixiApplication,
      live2d: {
        Live2DModel: {
          from: async () => {
            const model = {
              width: 120,
              height: 180,
              anchor: { set() {} },
              scale: { set() {} },
              on() {},
              destroy() {}
            };
            loadedModels.push(model);
            return model;
          }
        }
      }
    }
  };
  const fakeDocument = {
    querySelector(selector) {
      return selector === '.stage' ? stage : null;
    },
    getElementById(id) {
      return id === 'live2dCanvas' ? canvas : null;
    }
  };

  vm.runInNewContext(script, {
    window: fakeWindow,
    document: fakeDocument,
    console
  });

  await fakeWindow.__desktopCatLive2DAppearance.loadModel(modelConfig);

  assert.equal(loadedModels.length, 1);
  assert.equal(stage.classList.contains('has-live2d'), true);
  assert.equal(canvas.getAttribute('aria-hidden'), 'false');

  stage.classList.remove('has-live2d');
  canvas.setAttribute('aria-hidden', 'true');

  await fakeWindow.__desktopCatLive2DAppearance.ensureCurrentModelVisible();

  assert.equal(loadedModels.length, 2);
  assert.equal(stage.classList.contains('has-live2d'), true);
  assert.equal(canvas.getAttribute('aria-hidden'), 'false');
});

test('live2d appearance keeps the current model visible when a replacement fails to load', async () => {
  const script = readSource('src', 'renderer', 'live2dAppearance.js');
  const stageClasses = new Set();
  const stage = {
    classList: {
      add(name) {
        stageClasses.add(name);
      },
      remove(name) {
        stageClasses.delete(name);
      },
      contains(name) {
        return stageClasses.has(name);
      }
    }
  };
  const canvas = {
    width: 0,
    height: 0,
    attributes: new Map(),
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    getAttribute(name) {
      return this.attributes.get(name);
    }
  };
  class FakePixiApplication {
    constructor() {
      this.stage = {
        children: [],
        addChild: (child) => {
          this.stage.children.push(child);
        },
        removeChild: (child) => {
          this.stage.children = this.stage.children.filter((entry) => entry !== child);
        }
      };
    }
  }
  let shouldFail = false;
  const goodModel = {
    available: true,
    id: 'Haru',
    name: 'Haru',
    modelUrl: 'desktop-cat-live2d://model/Haru/Haru.model3.json'
  };
  const badModel = {
    available: true,
    id: 'Broken',
    name: 'Broken',
    modelUrl: 'desktop-cat-live2d://model/Broken/Broken.model3.json'
  };
  const fakeWindow = {
    desktopCatDebug: {},
    desktopCat: {
      appearance: {}
    },
    live2dMotionController: {
      createLive2DMotionController: () => ({
        playTap() {},
        dispose() {}
      })
    },
    PIXI: {
      Application: FakePixiApplication,
      live2d: {
        Live2DModel: {
          from: async () => {
            if (shouldFail) {
              throw new Error('load failed');
            }
            return {
              width: 120,
              height: 180,
              anchor: { set() {} },
              scale: { set() {} },
              on() {},
              destroy() {}
            };
          }
        }
      }
    }
  };
  const fakeDocument = {
    querySelector(selector) {
      return selector === '.stage' ? stage : null;
    },
    getElementById(id) {
      return id === 'live2dCanvas' ? canvas : null;
    }
  };

  vm.runInNewContext(script, {
    window: fakeWindow,
    document: fakeDocument,
    console
  });

  await fakeWindow.__desktopCatLive2DAppearance.loadModel(goodModel);
  assert.equal(fakeWindow.__desktopCatLive2DAppearance.isCurrentModelVisible(), true);

  shouldFail = true;
  await assert.rejects(
    fakeWindow.__desktopCatLive2DAppearance.loadModel(badModel),
    /load failed/
  );

  assert.equal(fakeWindow.__desktopCatLive2DAppearance.getCurrentModel().id, 'Haru');
  assert.equal(fakeWindow.__desktopCatLive2DAppearance.isCurrentModelVisible(), true);
  assert.equal(stage.classList.contains('has-live2d'), true);
  assert.equal(canvas.getAttribute('aria-hidden'), 'false');
});

test('live2d appearance keeps the current model visible when replacement setup fails', async () => {
  const script = readSource('src', 'renderer', 'live2dAppearance.js');
  const stageClasses = new Set();
  const stage = {
    classList: {
      add(name) {
        stageClasses.add(name);
      },
      remove(name) {
        stageClasses.delete(name);
      },
      contains(name) {
        return stageClasses.has(name);
      }
    }
  };
  const canvas = {
    width: 0,
    height: 0,
    attributes: new Map(),
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    getAttribute(name) {
      return this.attributes.get(name);
    }
  };
  class FakePixiApplication {
    constructor() {
      this.stage = {
        children: [],
        addChild: (child) => {
          this.stage.children.push(child);
        },
        removeChild: (child) => {
          this.stage.children = this.stage.children.filter((entry) => entry !== child);
        }
      };
    }
  }
  let nextModelShouldFailSetup = false;
  let failedModelDestroyed = false;
  const goodModel = {
    available: true,
    id: 'Haru',
    name: 'Haru',
    modelUrl: 'desktop-cat-live2d://model/Haru/Haru.model3.json'
  };
  const badModel = {
    available: true,
    id: 'Broken',
    name: 'Broken',
    modelUrl: 'desktop-cat-live2d://model/Broken/Broken.model3.json'
  };
  const fakeWindow = {
    desktopCatDebug: {},
    desktopCat: {
      appearance: {}
    },
    live2dMotionController: {
      createLive2DMotionController: () => ({
        playTap() {},
        dispose() {}
      })
    },
    PIXI: {
      Application: FakePixiApplication,
      live2d: {
        Live2DModel: {
          from: async () => ({
            width: 120,
            height: 180,
            anchor: { set() {} },
            scale: {
              set() {
                if (nextModelShouldFailSetup) {
                  throw new Error('setup failed');
                }
              }
            },
            on() {},
            destroy() {
              if (nextModelShouldFailSetup) {
                failedModelDestroyed = true;
              }
            }
          })
        }
      }
    }
  };
  const fakeDocument = {
    querySelector(selector) {
      return selector === '.stage' ? stage : null;
    },
    getElementById(id) {
      return id === 'live2dCanvas' ? canvas : null;
    }
  };

  vm.runInNewContext(script, {
    window: fakeWindow,
    document: fakeDocument,
    console
  });

  await fakeWindow.__desktopCatLive2DAppearance.loadModel(goodModel);
  assert.equal(fakeWindow.__desktopCatLive2DAppearance.isCurrentModelVisible(), true);

  nextModelShouldFailSetup = true;
  await assert.rejects(
    fakeWindow.__desktopCatLive2DAppearance.loadModel(badModel),
    /setup failed/
  );

  assert.equal(fakeWindow.__desktopCatLive2DAppearance.getCurrentModel().id, 'Haru');
  assert.equal(fakeWindow.__desktopCatLive2DAppearance.isCurrentModelVisible(), true);
  assert.equal(stage.classList.contains('has-live2d'), true);
  assert.equal(canvas.getAttribute('aria-hidden'), 'false');
  assert.equal(failedModelDestroyed, true);
});

test('live2d appearance hit-tests WebGL pixels by alpha', async () => {
  const script = readSource('src', 'renderer', 'live2dAppearance.js');
  const stageClasses = new Set();
  const reads = [];
  const stage = {
    classList: {
      add(name) {
        stageClasses.add(name);
      },
      remove(name) {
        stageClasses.delete(name);
      },
      contains(name) {
        return stageClasses.has(name);
      }
    }
  };
  const canvas = {
    width: 0,
    height: 0,
    attributes: new Map(),
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    getAttribute(name) {
      return this.attributes.get(name);
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 240, bottom: 240, width: 240, height: 240 };
    }
  };
  class FakePixiApplication {
    constructor() {
      this.stage = {
        children: [],
        addChild: (child) => {
          this.stage.children.push(child);
        },
        removeChild: (child) => {
          this.stage.children = this.stage.children.filter((entry) => entry !== child);
        }
      };
      this.renderer = {
        gl: {
          RGBA: 0x1908,
          UNSIGNED_BYTE: 0x1401,
          drawingBufferHeight: 240,
          readPixels(x, y, _width, _height, _format, _type, pixel) {
            reads.push([x, y]);
            pixel[3] = x === 120 ? 0 : 255;
          }
        }
      };
    }

    render() {}
  }
  const modelConfig = {
    available: true,
    id: 'Haru',
    name: 'Haru',
    modelUrl: 'desktop-cat-live2d://model/Haru/Haru.model3.json'
  };
  const fakeWindow = {
    desktopCatDebug: {},
    desktopCat: {
      appearance: {}
    },
    live2dMotionController: {
      createLive2DMotionController: () => ({
        playTap() {},
        dispose() {}
      })
    },
    PIXI: {
      Application: FakePixiApplication,
      live2d: {
        Live2DModel: {
          from: async () => ({
            width: 120,
            height: 180,
            anchor: { set() {} },
            scale: { set() {} },
            on() {},
            destroy() {}
          })
        }
      }
    }
  };
  const fakeDocument = {
    querySelector(selector) {
      return selector === '.stage' ? stage : null;
    },
    getElementById(id) {
      return id === 'live2dCanvas' ? canvas : null;
    }
  };

  vm.runInNewContext(script, {
    window: fakeWindow,
    document: fakeDocument,
    console,
    Uint8Array
  });

  await fakeWindow.__desktopCatLive2DAppearance.loadModel(modelConfig);

  assert.equal(fakeWindow.__desktopCatLive2DAppearance.isPointOverVisible(120, 40), false);
  assert.equal(fakeWindow.__desktopCatLive2DAppearance.isPointOverVisible(130, 40), true);
  assert.deepEqual(reads, [[120, 199], [130, 199]]);
});
