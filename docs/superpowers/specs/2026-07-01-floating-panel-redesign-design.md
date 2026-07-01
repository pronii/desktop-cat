# 悬浮窗与按钮重设计规格

> 日期：2026-07-01
> 状态：已批准
> 设计方向：手绘风 + 毛色同色系

## 1. 设计目标

重新设计桌面猫 pet 的底部工具栏按钮和悬浮窗面板，从当前扁平风格切换为**手绘风**（粗描边 + 立体投影），配色从宠物毛色（橘黄色）自动提取，实现视觉统一。

## 2. 设计决策

| 维度 | 决策 | 说明 |
|------|------|------|
| 视觉风格 | 手绘风 | 粗描边（2.5px）+ 立体投影（box-shadow: 0 4px 0） |
| 配色方案 | 毛色同色系 | 描边 #8b6f47（深棕）、标题栏 #d99738（焦糖橙/毛色主色）、文字 #8b6f47 |
| 按钮形态 | 胶囊标签 | 横向圆角（border-radius: 20px），图标+文字组合 |
| 喝水悬浮窗 | 进度环式 | 左侧圆环显示今日进度，右侧操作区（记录按钮、开关、间隔选择） |
| 剪贴板悬浮窗 | 卡片列表 | 与喝水面板同风格但标题栏颜色区分（可用辅色） |
| 宠物本体样式 | 保持原样（不修改猫的视觉样式和动画） |
| 拖动手柄 | **移除**（见下方 4.6 节） |

## 3. 配色变量

```css
:root {
  /* 手绘风主题色 - 从毛色提取 */
  --sketch-border: #8b6f47;       /* 深棕描边 */
  --sketch-shadow: #5a4a3a;      /* 阴影色 */
  --sketch-accent: #d99738;       /* 焦糖橙/标题栏 */
  --sketch-bg: #fff;              /* 卡片白色背景 */
  --sketch-page-bg: #fff8ec;      /* 页面暖白底 */
  --sketch-text: #8b6f47;         /* 主文字 */
  --sketch-text-light: rgba(139,111,71,0.6); /* 辅助文字 */
  --sketch-fill: #fff3d5;         /* 按钮填充色 */
  --sketch-ring-track: #ffe0a0;   /* 进度环轨道 */
}
```

## 4. 组件设计

### 4.1 底部工具栏 `.bottom-bar`

```
位置：fixed, bottom:14px, left:50%, translateX(-50%)
布局：flex, gap:10px
z-index:1000
```

包含两个胶囊标签按钮并排居中。

### 4.2 胶囊按钮（通用）

**尺寸**：height: 40px, padding: 0 16px, border-radius: 20px

**样式**：
- background: #fff
- border: 2.5px solid var(--sketch-border)
- box-shadow: 0 4px 0 var(--sketch-border)
- cursor: pointer
- transition: transform 160ms ease, background 160ms ease

**交互状态**：
- hover: transform translateY(-1px), background: #fffbf0
- active: transform translateY(0) scale(0.97)
- aria-expanded="true": background: var(--sketch-fill), border-color: var(--sketch-accent)

#### 4.2.1 喝水按钮 `#waterCounter`

```
内容：💧 图标 + 数字（如 "8杯"）
结构：<button><span class="water-icon">💧</span><span class="water-num">8杯</span></button>
点击行为：toggle 喝水悬浮窗
aria-expanded 控制展开状态
```

#### 4.2.2 剪贴板按钮 `#clipboardBtn`

```
内容：📋 图标 + "历史" 文字
或保留 SVG 图标 + "历史"
点击行为：toggle 剪贴板悬浮窗
aria-expanded 控制展开状态
```

### 4.3 喝水悬浮窗 `.water-panel`

```
位置：fixed, left:14px, right:14px, bottom:80px
宽度：自适应（左右各 14px padding）
最大高度：280px
z-index:1100（高于底部栏）
圆角：12px
动画：opacity + transform scale(0.98→1), 160ms ease
```

**结构**：
```
┌─────────────────────────────┐
│ 🎨 标题栏 (bg:#d99738 白字)    │ × 关闭
├─────────────────────────────┤
│ ┌───┐                       │
│ │ ○ │ 进度环 (64x64)         │
│ │8/10│ conic-gradient        │
│ └───┘                       │
│ [🥤 记录一杯] 按钮            │
│ 提醒  开/关 toggle           │
│ [15m][30m][1h][2h] 间隔     │
│ 上次提醒时间                 │
└─────────────────────────────┘
```

**各元素详细**：

| 元素 | 样式 |
|------|------|
| 标题栏 | bg: #d99738, color: #fff, font-size: 12px, font-weight: 700, padding: 6px 10px |
| 关闭按钮 | 22x22 圆角, 半透明白底, 白字 × |
| 进度环 | 64x64 圆形, 外圈 conic-gradient(#d99738 0→进度角度, #ffe0a0 余下), 内圆白底居中数字 |
| 每日目标 | 默认 **10 杯**（硬编码，后续可扩展为可配置项） |
| 杯数数字 | font-size: 20px, color: #d99738, font-weight: 800 |
| 记录按钮 | bg: #fff3d5, border: 1.5px solid #d99738, border-radius: 8px, 全宽, 居中 |
| 提醒行 | label + toggle switch |
| Toggle | 自定义 CSS switch, active 色 #d99738 |
| 间隔按钮组 | flex 横排 gap:3px, 每个 flex:1, 选中项 solid #d99738 白字, 未选白底细边框 |

### 4.4 剪贴板悬浮窗 `.clipboard-panel`

与喝水面板**同手绘风格**，仅标题栏颜色区分：
- 标题栏使用 **#7b6ac7 紫色**（与喝水面板的 #d99738 焦糖橙形成区分）
- 其余样式完全一致（描边、阴影、圆角、内间距）

### 4.5 进度环组件

纯 CSS 实现，无需 SVG：
- 外层 div: width:64px, height:64px, border-radius:50%, position:relative
- 背景: conic-gradient(var(--sketch-accent) 0deg {progress}deg, var(--sketch-ring-track) {progress}deg)
- 内层遮罩: inset 6px, border-radius:50%, background:#fff, 居中显示数字

### 4.6 长按拖动宠物（替代拖动手柄）

**移除**原有 `.drag-handle` 元素及其样式，改为**长按宠物本体**触发窗口拖动。

**交互逻辑**：
1. 用户在宠物上按下鼠标（mousedown）
2. 启动 250ms 长按计时器
3. 计时器到达后：
   - 切换 `.cat` 的 `-webkit-app-region` 为 `drag`（允许拖动）
   - 给宠物添加 `.is-dragging` class（视觉反馈）
   - 如果此时已经移动鼠标，开始拖动窗口
4. 鼠标释放（mouseup）或离开（mouseleave）：
   - 清除长按计时器
   - 切换 `-webkit-app-region` 回 `no-drag`
   - 移除 `.is-dragging` class

**短按与长按的区分**：
- 按下到释放 < 250ms → 视为**点击**，触发开心反馈（保持原 `setHappy()` 行为）
- 按下到释放 ≥ 250ms 且有移动 → 视为**拖动**，不触发开心反馈

**视觉反馈 `.is-dragging`**：
- 宠物轻微放大：`transform: scale(1.06)`
- 添加呼吸感轻微摆动：`animation: drag-wiggle 0.8s ease-in-out infinite`
- 降低不透明度：`opacity: 0.85`
- 光标变为 grabbing：`cursor: grabbing`

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

**实现要点**：
- 由于 `-webkit-app-region: drag` 是静态 CSS 属性，无法在 mousedown 后动态切换。需要通过 `ipcRenderer` 请求主进程调用 `win.setPosition()` 实现手动拖动，或在 mousedown 前预设 `drag` 区域。
- **推荐方案**：监听 mousedown，长按达标后通过 IPC 通知主进程进入拖动模式，主进程用 `screen.getCursorScreenPoint()` + `win.setPosition()` 跟随鼠标移动；mouseup 时退出。

## 5. 交互动画

| 动作 | 效果 |
|------|------|
| 按钮悬停 | translateY(-1px) + 背景微变 |
| 按钮按下 | translateY(0) scale(0.97) |
| 面板打开 | opacity 0→1, scale(0.98→1), 160ms |
| 面板关闭 | 反向 |
| 记录喝水成功 | 按钮短暂变为绿色 (#c8e6c9)，计数器弹跳 scale(1.12) |
| 间隔选中 | 切换 solid/outline 态，无额外动画 |

## 6. 受影响文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| src/renderer/styles.css | 大幅修改 | 新增手绘风 CSS 变量，替换底部栏/按钮/面板全部样式；移除 .drag-handle 样式，新增 .is-dragging 反馈 |
| src/renderer/index.html | 小改 | 水平计数器改为 button，调整内部 span 结构；移除 .drag-handle 元素 |
| src/renderer/renderer.js | 中改 | 新增长按拖动逻辑（mousedown 计时器 + IPC 拖动），保留短按开心反馈 |
| src/main/main.js | 小改 | 新增 IPC handler：进入/退出拖动模式，跟随鼠标移动窗口 |
| src/main/preload.js | 小改 | 暴露 dragMode API（enter/exit） |
| src/renderer/waterPanel.js | 重写 | 面板内容改为进度环布局 |
| src/renderer/clipboardPanel.js | 微调 | 应用新手绘风格类名（如有变化） |

## 7. 范围边界

### 包含
- 底部两个按钮的视觉重做
- 喝水悬浮窗的完整重做（布局+样式）
- 剪贴板悬浮窗的手绘风格适配
- 所有交互状态（hover/active/expanded）

### 不包含
- 喝水提醒的后端逻辑（IPC、定时器等不变）
- 剪贴板的业务逻辑不变
- 新增功能需求
