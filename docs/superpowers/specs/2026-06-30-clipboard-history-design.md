# 剪贴板历史功能设计文档

## 概述

为 desktop-cat 桌面宠物添加剪贴板历史功能，自动监控 Windows 系统剪贴板，记录用户复制的图片和视频文件，通过网格缩略图界面让用户可以快速重新复制历史内容。

## 功能需求

1. 自动监控系统剪贴板，检测并记录图片和视频文件
2. 通过托盘菜单打开独立的历史面板窗口（网格缩略图展示）
3. 点击缩略图将内容重新复制到系统剪贴板
4. 数据持久化保存到本地文件
5. 支持配置最大保留条数（默认 200 条）
6. 支持清空历史记录

## 技术方案

采用**方案 A**：独立的 Electron BrowserWindow，与现有小猫窗口解耦。

### 架构

```
src/clipboard-history/
├── main.js              # 主进程：剪贴板监听、窗口管理
├── preload.js           # preload 脚本，暴露 API 给渲染进程
├── renderer.js          # 渲染进程：界面渲染和交互
├── index.html           # 历史面板页面
├── styles.css           # 面板样式
├── storage.js           # 数据持久化
└── watcher.js           # 系统剪贴板轮询监听
```

### 组件职责

#### watcher.js — 剪贴板监听

- 每 800ms 轮询读取系统剪贴板
- 检测内容是否变化（对比上次内容的 hash/指纹）
- 识别内容类型：
  - **图片**：通过 `nativeImage` 获取图片数据，转换为 dataURL 保存
  - **视频文件**：读取剪贴板中的 `file` 格式，识别视频文件扩展名（mp4, mov, avi），记录文件路径
- 检测到新内容时，通过回调通知 `main.js`

```
轮询流程：

读取剪贴板 → 计算内容指纹 → 与上次指纹对比
                                ↓
                           相同 → 跳过
                                ↓
                           不同 → 判断类型 → 生成记录 → 回调通知
```

#### storage.js — 数据持久化

- 存储路径：`app.getPath('userData')/clipboard-history.json`
- 数据格式：
```json
{
  "maxItems": 200,
  "items": [
    {
      "id": "uuid",
      "type": "image",
      "thumbnail": "data:image/png;base64,...",
      "timestamp": 1700000000000
    },
    {
      "id": "uuid",
      "type": "video",
      "thumbnail": "data:image/png;base64,...",
      "filePath": "C:\\path\\to\\video.mp4",
      "timestamp": 1700000000000
    }
  ]
}
```

- 操作方法：`load()`, `save(items)`, `add(item)`, `clear()`, `getAll()`, `getMaxItems()`, `setMaxItems(n)`
- 超出最大条数时，自动删除最旧的记录
- 错误处理：JSON 解析失败时返回空数据，不崩溃

#### main.js — 主进程逻辑

- 集成到 `src/main/main.js` 中（作为模块引用）
- 负责：初始化 watcher、管理历史面板窗口、处理 IPC 通信
- 暴露 API：打开/关闭面板、获取历史列表、清空历史、复制内容到剪贴板
- 剪贴板写回：图片用 `clipboard.writeImage()`，视频文件用 `clipboard.writeBuffer()` 以 `'file'` 格式

#### preload.js — 上下文桥接

```js
contextBridge.exposeInMainWorld('clipboardHistoryAPI', {
  getItems: () => ipcRenderer.invoke('clipboard-history:get-items'),
  clearHistory: () => ipcRenderer.invoke('clipboard-history:clear'),
  copyItem: (id) => ipcRenderer.invoke('clipboard-history:copy', id),
  onNewItem: (callback) => {
    const listener = (_event, item) => callback(item);
    ipcRenderer.on('clipboard-history:new-item', listener);
    return () => ipcRenderer.removeListener(...);
  }
})
```

#### renderer.js — 界面交互

- 加载时调用 `getItems()` 获取全部历史
- 监听 `onNewItem` 实时更新界面
- 点击缩略图 → `copyItem(id)` → 复制到剪贴板
- 清空按钮 → `clearHistory()` → 清空列表
- 空状态显示："暂无剪贴板历史"
- 复制后短暂显示反馈（如缩略图上闪过 "已复制" 提示）

### UI 设计

- 窗口大小：620 × 460px，最小 400 × 300px
- 窗口标题："剪贴板历史"
- 顶部栏：标题 + 清空按钮 + 关闭按钮
- 主体：网格布局，每行 4 个缩略图
- 每张卡片：
  - 图片：直接显示缩略图，等比例裁剪为正方形
  - 视频：缩略图 + 右下角叠加 ▶ 图标
  - 卡片下方：相对时间（"2分钟前"、"1小时前"）
- 滚动：内容超出时垂直滚动
- 选中/悬停效果：卡片轻微放大 + 阴影
- 暗色主题，与小猫风格一致

### 集成点

#### 托盘菜单 — trayMenu.js
在"总是置顶"和"退出"之间增加：
```
---
剪切板历史
---
```

#### 小猫右键菜单 — menuState.js （暂不改动）
也可以在小猫右键菜单加上"剪切板历史"，可后续考虑。

### 配置

- 最大保留条数：默认 200 条
- 存储在 storage 的 JSON 中，后续可通过设置页面调整

## 非功能需求

- 轮询间隔 800ms，对性能影响极小
- 数据文件不超过 50MB（图片缩略图采用 dataURL 压缩存储）
- 面板窗口关闭时不销毁 watcher，后台继续监听
- 退出应用时停止轮询

## 测试

- `test/clipboardStorage.test.js` — 存储读写、最大条数限制、清空
- `test/clipboardWatcher.test.js` — 剪贴板变化检测、去重
- `test/clipboardHistory.test.js` — 主流程集成测试

## 后续可扩展

1. 设置面板：调整最大条数、清除全部历史
2. 文本历史：支持记录文本复制历史
3. 搜索/筛选：按类型过滤
4. 托盘 UI 美化（用户已提及）
