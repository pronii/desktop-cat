# 悬浮窗与按钮重设计实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将底部工具栏按钮和悬浮窗从扁平风格重做为手绘风（粗描边+立体投影+毛色同色系），新增长按宠物拖动反馈，移除顶部拖动手柄。

**架构：** 纯前端样式重做 + 新增 IPC 通道支持长按拖动窗口。CSS 变量统一手绘风主题色，进度环用 conic-gradient 实现。长按拖动通过 renderer 监听 mousedown → IPC 通知 main → main 用 screen.getCursorScreenPoint() 跟随鼠标移动窗口。

**技术栈：** Electron 33, 原生 CSS, JavaScript (无框架)

**规格文档：** `docs/superpowers/specs/2026-07-01-floating-panel-redesign-design.md`

---

## 文件结构

| 文件 | 变更类型 | 职责 |
|------|---------|------|
| `src/renderer/styles.css` | 大幅修改 | 新增手绘风 CSS 变量、胶囊按钮、进度环面板、is-dragging 反馈样式；移除 .drag-handle 样式 |
| `src/renderer/index.html` | 小改 | 移除 .drag-handle 元素；water-counter 改为 button + span 结构 |
| `src/renderer/renderer.js` | 中改 | 新增长按拖动逻辑（计时器 + IPC 调用）；保留短按开心反馈 |
| `src/renderer/waterPanel.js` | 重写 | 进度环布局，DOM 结构改为进度环+操作区 |
| `src/main/main.js` | 小改 | 新增 drag-mode IPC handlers（enter/exit + mousemove 跟随） |
| `src/main/preload.js` | 小改 | 暴露 dragMode API（enter/exit） |
| `src/renderer/clipboardPanel.js` | 微调 | 无逻辑变化（仅 CSS 类复用） |

---

## 任务 1：新增手绘风 CSS 变量

**文件：**
- 修改：`src/renderer/styles.css:1-10`（在 :root 中新增变量）

- [ ] **步骤 1：在 :root 中新增手绘风变量**

在 `src/renderer/styles.css` 第 1-10 行的 `:root` 块中，在现有变量后追加：

```css
:root {
  color-scheme: light;
  --fur: #f7c875;
  --fur-deep: #d99738;
  --fur-soft: #ffe0a0;
  --ink: #3c2b24;
  --blush: #f58da8;
  --cream: #fff3d5;
  --shadow: rgba(91, 56, 29, 0.24);

  /* 手绘风主题色 - 从毛色提取 */
  --sketch-border: #8b6f47;
  --sketch-shadow: #5a4a3a;
  --sketch-accent: #d99738;
  --sketch-bg: #fff;
  --sketch-page-bg: #fff8ec;
  --sketch-text: #8b6f47;
  --sketch-text-light: rgba(139, 111, 71, 0.6);
  --sketch-fill: #fff3d5;
  --sketch-ring-track: #ffe0a0;
  --sketch-clipboard-accent: #7b6ac7;
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/renderer/styles.css
git commit -m "style: add hand-drawn theme CSS variables"
```

---

## 任务 2：移除拖动手柄并新增长按拖动反馈样式

**文件：**
- 修改：`src/renderer/index.html:11-15`（移除 .drag-handle 元素）
- 修改：`src/renderer/styles.css`（移除 .drag-handle 样式，新增 .is-dragging）

- [ ] **步骤 1：从 index.html 移除拖动手柄元素**

在 `src/renderer/index.html` 中，删除第 11-15 行的 `<div class="drag-handle">` 块：

删除前：
```html
      <div class="drag-handle" aria-label="Drag desktop cat">
        <span></span>
        <span></span>
        <span></span>
      </div>
```

删除后该区域直接以 `<button class="cat">` 开始。

- [ ] **步骤 2：从 styles.css 移除 .drag-handle 相关样式**

在 `src/renderer/styles.css` 中，删除 `.drag-handle`、`.drag-handle:active`、`.drag-handle span` 三个规则块（约第 43-72 行）。

- [ ] **步骤 3：新增 .cat.is-dragging 视觉反馈样式**

在 `src/renderer/styles.css` 的 `.cat` 规则块后追加：

```css
@keyframes drag-wiggle {
  0%, 100% { transform: scale(1.06) rotate(-2deg); }
  50% { transform: scale(1.06) rotate(2deg); }
}

.cat.is-dragging {
  animation: drag-wiggle 0.8s ease-in-out infinite;
  opacity: 0.85;
  cursor: grabbing;
}
```

- [ ] **步骤 4：Commit**

```bash
git add src/renderer/index.html src/renderer/styles.css
git commit -m "refactor: remove drag handle, add long-press drag feedback style"
```

---

## 任务 3：新增主进程长按拖动 IPC

**文件：**
- 修改：`src/main/main.js`（在喝水 IPC 后新增 drag-mode handlers）
- 修改：`src/main/preload.js`（暴露 dragMode API）

- [ ] **步骤 1：在 main.js 新增 drag-mode IPC handlers**

在 `src/main/main.js` 第 422 行（`water-reminder:test-trigger` handler 之后、`gotTheLock` 之前）插入：

```javascript
/* --- 长按拖动 IPC --- */

let dragModeActive = false;
let dragOffset = { x: 0, y: 0 };
let dragTick = null;

ipcMain.on('drag-mode:enter', () => {
  if (!petWindow || petWindow.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const winBounds = petWindow.getBounds();
  dragOffset = { x: cursor.x - winBounds.x, y: cursor.y - winBounds.y };
  dragModeActive = true;

  if (dragTick) clearInterval(dragTick);
  // 每 16ms（约 60fps）跟随鼠标移动窗口
  dragTick = setInterval(() => {
    if (!dragModeActive || !petWindow || petWindow.isDestroyed()) {
      if (dragTick) clearInterval(dragTick);
      dragTick = null;
      return;
    }
    const cur = screen.getCursorScreenPoint();
    petWindow.setPosition(cur.x - dragOffset.x, cur.y - dragOffset.y);
  }, 16);
});

ipcMain.on('drag-mode:exit', () => {
  dragModeActive = false;
  if (dragTick) {
    clearInterval(dragTick);
    dragTick = null;
  }
});
```

- [ ] **步骤 2：在 preload.js 暴露 dragMode API**

在 `src/main/preload.js` 的 `contextBridge.exposeInMainWorld('desktopCat', {...})` 中，新增 `dragMode` 字段：

```javascript
contextBridge.exposeInMainWorld('desktopCat', {
  dragMode: {
    enter: () => ipcRenderer.send('drag-mode:enter'),
    exit: () => ipcRenderer.send('drag-mode:exit')
  },
  waterReminder: {
    // ... 保持原有内容不变
  },
  clipboardHistory: {
    // ... 保持原有内容不变
  }
});
```

- [ ] **步骤 3：Commit**

```bash
git add src/main/main.js src/main/preload.js
git commit -m "feat: add long-press drag mode IPC handlers"
```

---

## 任务 4：在 renderer.js 实现长按拖动逻辑

**文件：**
- 修改：`src/renderer/renderer.js`（替换原有 mousedown 监听为新逻辑）

- [ ] **步骤 1：替换 cat 的 mousedown 监听为长按拖动逻辑**

在 `src/renderer/renderer.js` 中，找到第 77-91 行的 mousedown 和 dragstart 监听，替换为：

```javascript
const LONG_PRESS_MS = 250;
let longPressTimer = null;
let isLongPress = false;
let dragEntered = false;

cat.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;

  isLongPress = false;
  dragEntered = false;

  longPressTimer = window.setTimeout(() => {
    isLongPress = true;
    cat.classList.add('is-dragging');
    if (window.desktopCat?.dragMode) {
      window.desktopCat.dragMode.enter();
      dragEntered = true;
    }
  }, LONG_PRESS_MS);

  event.preventDefault();
});

cat.addEventListener('mouseup', () => {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  if (isLongPress) {
    cat.classList.remove('is-dragging');
    if (dragEntered && window.desktopCat?.dragMode) {
      window.desktopCat.dragMode.exit();
      dragEntered = false;
    }
  } else {
    // 短按 → 开心反馈
    if (drinkState.isDrinking) {
      setHappy();
    } else {
      setHappy();
    }
  }
  isLongPress = false;
});

cat.addEventListener('mouseleave', () => {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  if (isLongPress) {
    cat.classList.remove('is-dragging');
    if (dragEntered && window.desktopCat?.dragMode) {
      window.desktopCat.dragMode.exit();
      dragEntered = false;
    }
    isLongPress = false;
  }
});

cat.addEventListener('dragstart', (event) => {
  event.preventDefault();
});
```

- [ ] **步骤 2：Commit**

```bash
git add src/renderer/renderer.js
git commit -m "feat: implement long-press to drag pet with visual feedback"
```

---

## 任务 5：重做底部工具栏为胶囊按钮

**文件：**
- 修改：`src/renderer/index.html`（water-counter 改为 button，clipboard-btn 调整内容）
- 修改：`src/renderer/styles.css`（重写 .bottom-bar / .water-counter / .clipboard-btn）

- [ ] **步骤 1：在 index.html 调整按钮结构**

将 `src/renderer/index.html` 中的 `.bottom-bar` 块替换为：

```html
    <div class="bottom-bar">
      <button
        class="sketch-btn water-counter"
        id="waterCounter"
        type="button"
        aria-label="今日喝水杯数"
        aria-controls="waterPanel"
        aria-expanded="false"
        title="喝水记录"
      >
        <span class="sketch-btn-icon">💧</span>
        <span class="sketch-btn-text"><span class="water-counter-num">0</span>杯</span>
      </button>

      <button
        class="sketch-btn clipboard-btn"
        id="clipboardBtn"
        type="button"
        aria-label="打开剪贴板历史"
        aria-controls="clipboardPanel"
        aria-expanded="false"
        title="剪贴板历史"
      >
        <span class="sketch-btn-icon">📋</span>
        <span class="sketch-btn-text">历史</span>
      </button>
    </div>
```

同时移除原 clipboard-btn 内的 SVG（已被 emoji 图标替代）。

- [ ] **步骤 2：在 styles.css 重写底部栏和胶囊按钮样式**

替换 `.bottom-bar`、`.water-counter`、`.clipboard-btn` 相关样式为：

```css
/* --- 底部工具栏 --- */
.bottom-bar {
  position: fixed;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 1000;
  -webkit-app-region: no-drag;
}

/* --- 手绘风胶囊按钮（通用） --- */
.sketch-btn {
  height: 40px;
  padding: 0 16px;
  border: 2.5px solid var(--sketch-border);
  border-radius: 20px;
  background: var(--sketch-bg);
  box-shadow: 0 4px 0 var(--sketch-border);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
  transition: transform 160ms ease, background 160ms ease, box-shadow 160ms ease;
  -webkit-app-region: no-drag;
}

.sketch-btn:hover {
  transform: translateY(-1px);
  background: #fffbf0;
}

.sketch-btn:active {
  transform: translateY(0) scale(0.97);
  box-shadow: 0 2px 0 var(--sketch-border);
}

.sketch-btn[aria-expanded="true"] {
  background: var(--sketch-fill);
  border-color: var(--sketch-accent);
  box-shadow: 0 4px 0 var(--sketch-accent);
}

.sketch-btn-icon {
  font-size: 16px;
  line-height: 1;
}

.sketch-btn-text {
  font-size: 12px;
  font-weight: 700;
  color: var(--sketch-text);
  line-height: 1;
}

/* 喝水按钮专属 */
.water-counter.just-drank {
  background: #c8e6c9;
  border-color: #4caf50;
  box-shadow: 0 4px 0 #4caf50;
  transform: scale(1.12);
}
```

- [ ] **步骤 3：Commit**

```bash
git add src/renderer/index.html src/renderer/styles.css
git commit -m "style: redesign bottom buttons as hand-drawn capsule labels"
```

---

## 任务 6：重做喝水悬浮窗为进度环布局

**文件：**
- 修改：`src/renderer/index.html`（重写 .water-panel 内部结构）
- 修改：`src/renderer/styles.css`（重写 .water-panel 全部样式）
- 修改：`src/renderer/waterPanel.js`（更新 DOM 引用和渲染逻辑）

- [ ] **步骤 1：在 index.html 重写 water-panel 结构**

将 `src/renderer/index.html` 中的 `.water-panel` 块替换为：

```html
    <div class="water-panel sketch-panel" id="waterPanel">
      <div class="sketch-panel-header sketch-panel-header-water">
        <h3>💧 喝水记录</h3>
        <button class="sketch-panel-close" id="waterPanelClose" type="button" aria-label="关闭喝水记录">×</button>
      </div>
      <div class="water-panel-body">
        <div class="water-progress-ring" id="waterProgressRing">
          <div class="water-progress-fill"></div>
          <div class="water-progress-inner">
            <span class="water-progress-num" id="waterPanelCount">0</span>
            <span class="water-progress-goal">/10杯</span>
          </div>
        </div>
        <div class="water-panel-actions">
          <button class="sketch-action-btn" id="waterPanelDrinkBtn" type="button">
            <span>🥤</span> 记录一杯
          </button>
          <div class="water-panel-row">
            <span class="water-panel-row-label">提醒</span>
            <label class="sketch-switch">
              <input type="checkbox" id="waterPanelToggle">
              <span class="sketch-switch-slider"></span>
            </label>
          </div>
          <div class="water-panel-row water-panel-row-column">
            <span class="water-panel-row-label">提醒间隔</span>
            <div class="water-panel-intervals" id="waterPanelIntervals">
              <button class="sketch-interval" data-minutes="15" type="button">15m</button>
              <button class="sketch-interval" data-minutes="30" type="button">30m</button>
              <button class="sketch-interval" data-minutes="60" type="button">1h</button>
              <button class="sketch-interval" data-minutes="120" type="button">2h</button>
            </div>
          </div>
          <div class="water-panel-last" id="waterPanelLast">尚未提醒</div>
        </div>
      </div>
    </div>
```

- [ ] **步骤 2：在 styles.css 新增手绘风面板通用样式**

```css
/* --- 手绘风面板（通用） --- */
.sketch-panel {
  position: fixed;
  left: 14px;
  right: 14px;
  bottom: 80px;
  background: var(--sketch-bg);
  border: 2.5px solid var(--sketch-border);
  border-radius: 12px;
  box-shadow: 0 4px 0 var(--sketch-border);
  z-index: 1100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transform: translateY(8px) scale(0.98);
  transform-origin: 50% 100%;
  transition: opacity 160ms ease, transform 160ms ease;
}

.sketch-panel.show {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}

.sketch-panel-header {
  padding: 6px 10px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.sketch-panel-header-water {
  background: var(--sketch-accent);
}

.sketch-panel-header-clipboard {
  background: var(--sketch-clipboard-accent);
}

.sketch-panel-header h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
}

.sketch-panel-close {
  width: 22px;
  height: 22px;
  border: 1.5px solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-weight: 700;
  padding: 0;
  transition: background 160ms ease;
}

.sketch-panel-close:hover {
  background: rgba(255, 255, 255, 0.35);
}
```

- [ ] **步骤 3：在 styles.css 新增喝水面板专属样式**

```css
/* --- 喝水面板 --- */
.water-panel-body {
  padding: 12px;
  display: flex;
  gap: 12px;
  align-items: stretch;
}

.water-progress-ring {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  position: relative;
  flex-shrink: 0;
  background: var(--sketch-ring-track);
}

.water-progress-fill {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(var(--sketch-accent) 0deg, var(--sketch-ring-track) 0deg);
  transition: background 300ms ease;
}

.water-progress-inner {
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
}

.water-progress-num {
  font-size: 20px;
  font-weight: 800;
  color: var(--sketch-accent);
  line-height: 1;
}

.water-progress-goal {
  font-size: 8px;
  color: var(--sketch-text-light);
  line-height: 1;
}

.water-panel-actions {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.sketch-action-btn {
  border: 1.5px solid var(--sketch-accent);
  border-radius: 8px;
  background: var(--sketch-fill);
  color: #8b5a00;
  font-size: 11px;
  font-weight: 700;
  padding: 5px;
  cursor: pointer;
  transition: background 160ms ease, transform 160ms ease;
}

.sketch-action-btn:hover {
  background: #ffe9b8;
  transform: translateY(-1px);
}

.sketch-action-btn:active {
  transform: scale(0.98);
}

.sketch-action-btn.is-copied {
  background: #c8e6c9;
  border-color: #4caf50;
  color: #2e7d32;
}

.water-panel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.water-panel-row-column {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.water-panel-row-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--sketch-text);
}

/* 手绘风开关 */
.sketch-switch {
  position: relative;
  display: inline-block;
  width: 30px;
  height: 16px;
  flex-shrink: 0;
}

.sketch-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.sketch-switch-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #ccc;
  border-radius: 8px;
  transition: background 200ms ease;
}

.sketch-switch-slider::before {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  left: 2px;
  top: 2px;
  background: #fff;
  border-radius: 50%;
  transition: transform 200ms ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}

.sketch-switch input:checked + .sketch-switch-slider {
  background: var(--sketch-accent);
}

.sketch-switch input:checked + .sketch-switch-slider::before {
  transform: translateX(14px);
}

/* 间隔按钮组 */
.water-panel-intervals {
  display: flex;
  gap: 3px;
  width: 100%;
}

.sketch-interval {
  flex: 1;
  height: 22px;
  border: 1.5px solid var(--sketch-border);
  border-radius: 5px;
  background: #fff;
  color: var(--sketch-text);
  cursor: pointer;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
}

.sketch-interval:hover {
  border-color: var(--sketch-accent);
  color: var(--sketch-accent);
}

.sketch-interval.is-active {
  background: var(--sketch-accent);
  border-color: var(--sketch-accent);
  color: #fff;
}

.water-panel-last {
  font-size: 9px;
  color: var(--sketch-text-light);
  text-align: center;
  padding-top: 2px;
}
```

- [ ] **步骤 4：在 waterPanel.js 更新进度环渲染逻辑**

将 `src/renderer/waterPanel.js` 中的 `applyConfig` 函数替换为（新增进度环角度计算）：

```javascript
const DAILY_GOAL = 10;

function updateProgressRing(count) {
  const fillEl = document.querySelector('.water-progress-fill');
  if (!fillEl) return;
  const progress = Math.min(count / DAILY_GOAL, 1);
  const deg = Math.round(progress * 360);
  fillEl.style.background = `conic-gradient(var(--sketch-accent) 0deg ${deg}deg, var(--sketch-ring-track) ${deg}deg)`;
}

function applyConfig(config) {
  if (!config) return;
  waterPanelCount.textContent = config.dailyCount;
  updateProgressRing(config.dailyCount);
  waterPanelToggle.checked = Boolean(config.enabled);
  waterPanelLast.textContent = formatLastTrigger(config.lastTriggerAt);

  const bottomNum = waterCounter?.querySelector('.water-counter-num');
  if (bottomNum) bottomNum.textContent = config.dailyCount;

  const intervalBtns = waterPanelIntervals.querySelectorAll('.sketch-interval');
  intervalBtns.forEach((btn) => {
    const minutes = Number(btn.dataset.minutes);
    btn.classList.toggle('is-active', minutes === config.interval);
  });
}
```

同时在"记录一杯"成功回调中追加 `updateProgressRing(newCount)`：

```javascript
if (waterPanelDrinkBtn) {
  waterPanelDrinkBtn.addEventListener('click', async () => {
    if (!api?.recordDrink) return;
    try {
      const newCount = await api.recordDrink();
      waterPanelCount.textContent = newCount;
      updateProgressRing(newCount);
      const bottomNum = waterCounter?.querySelector('.water-counter-num');
      if (bottomNum) bottomNum.textContent = newCount;
      waterCounter?.classList.add('just-drank');
      window.setTimeout(() => waterCounter?.classList.remove('just-drank'), 1200);
      waterPanelDrinkBtn.classList.add('is-copied');
      window.setTimeout(() => waterPanelDrinkBtn.classList.remove('is-copied'), 400);
    } catch (_e) {
      // Non-critical.
    }
  });
}
```

- [ ] **步骤 5：Commit**

```bash
git add src/renderer/index.html src/renderer/styles.css src/renderer/waterPanel.js
git commit -m "feat: redesign water panel with progress ring layout"
```

---

## 任务 7：适配剪贴板面板为手绘风

**文件：**
- 修改：`src/renderer/index.html`（clipboard-panel 添加 sketch-panel 类，标题栏加 sketch-panel-header-clipboard）
- 修改：`src/renderer/styles.css`（移除旧的 .clipboard-panel 独立样式，复用 .sketch-panel）

- [ ] **步骤 1：在 index.html 给 clipboard-panel 添加 sketch-panel 类**

将 `<div class="clipboard-panel" id="clipboardPanel">` 改为：
```html
<div class="clipboard-panel sketch-panel" id="clipboardPanel">
```

将其标题栏 `<div class="clipboard-panel-header">` 改为：
```html
<div class="clipboard-panel-header sketch-panel-header sketch-panel-header-clipboard">
```

- [ ] **步骤 2：在 styles.css 清理旧 clipboard-panel 冲突样式**

移除 `.clipboard-panel` 原有的 `position/border/background/box-shadow/z-index/opacity/transform/transition` 属性（这些已由 `.sketch-panel` 提供）。保留 `.clipboard-panel` 作为命名空间，但不再重复定义手绘风属性。

确保 `.clipboard-panel-header` 不再覆盖 `.sketch-panel-header` 的背景色（移除原 `background: #7d6ac7`，改由 `.sketch-panel-header-clipboard` 提供）。

- [ ] **步骤 3：Commit**

```bash
git add src/renderer/index.html src/renderer/styles.css
git commit -m "style: adapt clipboard panel to hand-drawn sketch style"
```

---

## 任务 8：同步 renderer.js 的喝水计数更新

**文件：**
- 修改：`src/renderer/renderer.js`（loadWaterCount 和 setDrinking 更新新 DOM 结构）

- [ ] **步骤 1：更新 loadWaterCount**

```javascript
async function loadWaterCount() {
  try {
    const config = await window.desktopCat.waterReminder.getConfig();
    const numEl = waterCounter.querySelector('.water-counter-num');
    if (numEl) numEl.textContent = config.dailyCount;
  } catch (_e) {
    // Non-critical.
  }
}
```

- [ ] **步骤 2：更新 setDrinking 中的计数更新**

```javascript
try {
  const newCount = await window.desktopCat.waterReminder.recordDrink();
  const numEl = waterCounter.querySelector('.water-counter-num');
  if (numEl) numEl.textContent = newCount;
  waterCounter.classList.add('just-drank');
  window.setTimeout(() => waterCounter.classList.remove('just-drank'), 1200);
} catch (_e) {
  // Non-critical: counter update failed but animation still plays.
}
```

- [ ] **步骤 3：Commit**

```bash
git add src/renderer/renderer.js
git commit -m "refactor: update water counter DOM selectors for new structure"
```

---

## 任务 9：清理并最终验证

- [ ] **步骤 1：清理临时文件**

删除 `D:\desktop-cat\node-v22.17.0-x64.msi`（Node.js 安装包，不再需要）。
删除 `D:\desktop-cat\nul`（之前误创建的文件）。

```bash
rm -f D:/desktop-cat/node-v22.17.0-x64.msi D:/desktop-cat/nul
```

- [ ] **步骤 2：启动应用验证**

```bash
cd D:/desktop-cat && npm start
```

验证清单：
- [ ] 宠物正常显示，无顶部拖动手柄
- [ ] 短按宠物 → 开心反馈
- [ ] 长按宠物 250ms → 宠物摇摆放大 + 可拖动窗口
- [ ] 释放鼠标 → 停止拖动，宠物恢复正常
- [ ] 底部两个胶囊按钮（💧 N杯 / 📋 历史）样式统一
- [ ] 点击 💧 按钮 → 弹出喝水面板（进度环显示 8/10）
- [ ] 点击"记录一杯" → 数字增加 + 进度环填充 + 按钮变绿
- [ ] 提醒开关可切换
- [ ] 间隔按钮可选中（高亮焦糖橙）
- [ ] 点击 📋 按钮 → 弹出剪贴板面板（紫色标题栏）
- [ ] ESC 或点击外部 → 关闭面板

- [ ] **步骤 3：Commit 清理**

```bash
git add -A
git commit -m "chore: cleanup installer and temp files"
```

---

## 自检结果

**规格覆盖度：** ✓ 所有规格章节（CSS 变量、拖动手柄移除、胶囊按钮、进度环面板、剪贴板适配、长按拖动、IPC）都有对应任务。

**占位符扫描：** ✓ 无 TODO/待定，每个代码步骤都有完整代码。

**类型一致性：** ✓ `.sketch-btn`、`.sketch-panel`、`.sketch-interval`、`.sketch-switch` 类名在所有任务中一致；`updateProgressRing`、`DAILY_GOAL`、`drag-mode:enter/exit` 在定义和使用处一致。
