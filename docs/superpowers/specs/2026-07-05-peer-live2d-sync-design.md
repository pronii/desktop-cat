# 好友同屏 Live2D 形象同步设计

> 日期：2026-07-05
> 状态：已实现
> 方向：同步形象标识，本地匹配渲染，失败回退小猫

## 1. 目标

让好友同屏中的远端好友不再只显示固定 CSS 小猫，而是优先显示对方当前选择的 Live2D 形象。

实现目标是“看起来像对方的 Live2D 形象在本机同屏出现”，但不通过房间服务传输模型文件、贴图、moc3 或本地文件路径。模型资源只从每个客户端本机已安装或内置的 Live2D 模型中加载。

## 2. 当前状态

当前好友同屏链路如下：

- 主进程 `buildLocalPetState()` 每秒上报本地窗口位置、大小、`action` 和 `facing`。
- `roomClient` 通过 WebSocket 发送 `pet:update`。
- 服务端 `sanitizePet()` 只保留数值字段和字符串字段 `action`、`facing`。
- 主进程 `peerPetWindows` 为每个好友创建一个透明、不可交互的 `peerPet.html` 窗口。
- `peerPet.html` 使用 `peerPet.css` 绘制固定绿色 CSS 小猫，`peerPet.js` 只更新昵称和拖动状态。

因此，当前不会同步本地 Live2D 选择，也不会在好友窗口加载 Live2D runtime。

## 3. 设计决策

采用“同步模型 ID，本地匹配渲染”的方案。

本地客户端加入房间后，在 `pet` 状态中追加：

```json
{
  "appearanceType": "live2d",
  "modelId": "Haru",
  "modelName": "Haru"
}
```

接收方拿到这些字段后，在自己的可用 Live2D 模型列表里查找相同 `modelId`。找到则在好友窗口中用该模型渲染；找不到则尝试本机默认 Live2D；如果 Live2D runtime 或模型加载失败，则继续显示现有 CSS 小猫。

不传输 `modelUrl`、`previewImageUrl`、磁盘路径或模型文件内容，避免版权、安全和网络负载问题。

## 4. 备选方案

### 4.1 只同步模型 ID，本地匹配

优点：实现简单，安全边界清楚，能复用内置 Haru/Hiyori/Mao 和外置同名模型。

缺点：如果双方没有同一套外置模型，看到的不会完全一致。

这是推荐方案。

### 4.2 同步模型预览图

优点：即使接收方没有模型，也能看到接近对方形象的静态图。

缺点：预览图会带来传输、缓存和隐私/版权边界，且不是动态 Live2D。

暂不做。

### 4.3 同步完整 Live2D 模型资源

优点：双方显示完全一致。

缺点：模型体积大，路径引用复杂，版权和安全风险高，多人房间性能不可控。

明确不做。

## 5. 范围

### 包含

- 扩展房间 `pet` 状态，允许同步 `appearanceType`、`modelId`、`modelName`。
- 主进程上报当前本地 Live2D 模型选择。
- 服务端保留上述安全字符串字段。
- 好友窗口增加 Live2D canvas 和 runtime 加载能力。
- 好友窗口在模型缺失或加载失败时回退到 CSS 小猫。
- 限制同时运行的远端 Live2D 数量，避免显存和 CPU 压力。
- 增加主进程、服务端、peer renderer 相关测试。

### 不包含

- 不传输或下载好友的模型资源。
- 不实现模型市场、模型分享、创意工坊。
- 不同步复杂动作队列、表情组或语音。
- 不改变好友同屏房间码和加入流程。

## 6. 协议设计

`pet` 状态新增三个可选字符串字段：

| 字段 | 示例 | 说明 |
| --- | --- | --- |
| `appearanceType` | `live2d` 或 `css-cat` | 本地当前显示类型。主窗口成功显示 Live2D 时为 `live2d`，否则为 `css-cat`。 |
| `modelId` | `Haru` | Live2D 模型 ID。来自 `createLive2DAppearance().getCurrentModel().id`。 |
| `modelName` | `Haru` | 展示名。仅用于面板或调试，不用于资源加载。 |

服务端 `PET_STRING_FIELDS` 需要加入这三个字段，继续使用现有长度限制和字符串清洗。

兼容性：

- 旧客户端不会发送这些字段，新客户端按 CSS 小猫处理。
- 旧服务端会过滤这些字段，新客户端仍回退 CSS 小猫。
- 新服务端转发旧客户端状态不会出错。

## 7. 主进程设计

### 7.1 本地状态上报

`buildLocalPetState()` 在当前位置、大小、动作字段之外，读取 `live2DAppearance.getCurrentModel()`。

当当前模型可用时：

```js
appearanceType: 'live2d'
modelId: currentModel.id
modelName: currentModel.name
```

当没有 Live2D 或模型不可用时：

```js
appearanceType: 'css-cat'
```

### 7.2 模型查询 IPC

给 peer preload 增加只读 API：

```js
window.peerPet.getLive2DModelById(modelId)
window.peerPet.getDefaultLive2DModel()
```

主进程新增 IPC handler，通过 `live2DAppearance` 返回序列化后的本机模型记录。

需要在 `src/main/live2dAppearance.js` 增加 `getModelById(modelId)`。该方法只返回本机已发现模型的安全序列化结果，不返回 `rootDir`、`modelJsonPath` 等文件系统路径。

### 7.3 远端 Live2D 上限

`peerPetWindows` 负责给 peer 更新添加本地渲染提示，例如：

```js
renderMode: 'live2d'
```

只有前 `MAX_PEER_LIVE2D_WINDOWS` 个请求 Live2D 的在线好友使用 Live2D，建议默认值为 3。超出后 `renderMode` 为 `css-cat`，peer 窗口继续显示 CSS 小猫。

## 8. Peer Renderer 设计

### 8.1 HTML

`peerPet.html` 保留现有 CSS 小猫 DOM，新增一个透明 canvas：

```html
<canvas class="peer-live2d-canvas" id="peerLive2DCanvas" width="160" height="140" aria-hidden="true"></canvas>
```

加载顺序：

1. Live2D Cubism core
2. Pixi
3. pixi-live2d-cubism4
4. peer Live2D renderer
5. peerPet.js

### 8.2 渲染逻辑

新增 `peerLive2D.js`，职责只限 peer 窗口：

- 创建并复用单个 PIXI Application。
- 根据 `modelConfig.modelUrl` 加载 Live2D 模型。
- 将模型缩放到 peer canvas。
- 使用请求序号避免快速切换时旧模型覆盖新模型。
- 加载失败时清理失败模型并显示 CSS 小猫。
- 不创建面板预览，不暴露交互 hit-test，不处理点击。

`peerPet.js` 收到 `peer-pet:update` 后：

1. 更新昵称。
2. 根据 `peer.renderMode` 和 `peer.pet.appearanceType` 判断是否尝试 Live2D。
3. 如果需要 Live2D，先调用 `getLive2DModelById(peer.pet.modelId)`。
4. 找不到则调用 `getDefaultLive2DModel()`。
5. 加载成功后隐藏 `.peer-cat`，显示 canvas。
6. 加载失败、字段缺失或 `renderMode` 不是 `live2d` 时显示 CSS 小猫。

### 8.3 动作状态

第一版只同步现有状态：

- `idle`：Live2D 正常待机。
- `drag`：给 peer stage 添加 `is-drag` class，让 canvas 和 CSS 小猫都轻微摇动。

不在第一版同步点击、开心气泡、表情组或动作组。

## 9. 样式与布局

peer 窗口尺寸第一版保持 `160 x 150`，降低布局风险。

新增样式：

- `.peer-live2d-canvas` 绝对定位居中，占据昵称下方区域。
- `.peer-stage.has-live2d .peer-cat` 隐藏。
- `.peer-stage.is-drag .peer-live2d-canvas` 使用与 CSS 小猫相同的摇动动画。

CSS 小猫继续作为兜底视图，因此无需为加载中状态新增可见文案。

## 10. 错误处理

- 模型 ID 为空：显示 CSS 小猫。
- 本机找不到对应模型：尝试默认 Live2D。
- 默认模型不可用：显示 CSS 小猫。
- Live2D runtime 不可用：显示 CSS 小猫。
- WebGL 上下文加载失败：记录 console warning，显示 CSS 小猫。
- peer 窗口销毁：释放当前模型和 PIXI 资源。

错误不应影响房间连接、好友列表或主窗口 Live2D。

## 11. 性能约束

- 同时最多 3 个远端好友使用 Live2D。
- 每个 peer 窗口最多创建 1 个 PIXI Application，并在模型切换时复用。
- 只有 `modelId` 或渲染模式变化时重新加载模型。
- 每秒位置同步不得触发重复 Live2D 加载。
- 超出上限的好友继续使用 CSS 小猫。

## 12. 测试计划

### 主进程

- `buildLocalPetState()` 在 Live2D 可用时包含 `appearanceType/modelId/modelName`。
- Live2D 不可用时上报 `appearanceType: 'css-cat'`。
- `peerPetWindows` 只给前 3 个可 Live2D 好友标记 `renderMode: 'live2d'`。
- peer 离开时仍关闭对应窗口并释放状态。

### 服务端

- `sanitizePet()` 保留 `appearanceType/modelId/modelName`。
- 超长字符串仍被拒绝或清洗。
- 未知字段继续被过滤。

### 房间客户端

- `roomClient` 可以接收和转发包含新字段的 peer pet 状态。
- 旧状态缺少新字段时仍能正常显示。

### Peer renderer

- `peerPet.html` 加载 Live2D runtime 和 `peerLive2D.js`。
- 收到匹配模型时隐藏 CSS 小猫并显示 Live2D canvas。
- 模型缺失或加载失败时回退 CSS 小猫。
- `action: 'drag'` 同时影响 CSS 小猫和 Live2D canvas。

## 13. 发布与回退

该功能可以随客户端和服务端一起发布。若客户端先发布、服务端未更新，新增字段会被旧服务端过滤，用户仍看到 CSS 小猫。若服务端先发布、客户端未更新，不会影响旧客户端。

如果线上出现 Live2D peer 窗口稳定性问题，可以通过配置将 `MAX_PEER_LIVE2D_WINDOWS` 设为 0，退回现有 CSS 小猫展示。

## 14. 受影响文件

| 文件 | 变更 |
| --- | --- |
| `src/main/main.js` | 上报本地 Live2D 形象状态，新增模型查询 IPC handler。 |
| `src/main/live2dAppearance.js` | 新增按模型 ID 查询序列化模型的方法。 |
| `src/main/peerPreload.js` | 暴露 peer 只读 Live2D 模型查询 API。 |
| `src/main/peerPetWindows.js` | 给 peer 更新添加本地 `renderMode`，限制远端 Live2D 数量。 |
| `src/renderer/peerPet.html` | 增加 Live2D canvas 和 runtime 脚本。 |
| `src/renderer/peerPet.css` | 增加 peer Live2D canvas、显示切换和拖动动画样式。 |
| `src/renderer/peerPet.js` | 根据 peer 状态选择 Live2D 或 CSS 小猫。 |
| `src/renderer/peerLive2D.js` | 新增 peer 专用 Live2D 加载和回退逻辑。 |
| `server/roomServer.js` | 允许新 pet 字符串字段。 |
| `tests/main/*`、`tests/renderer/*`、`tests/server/*` | 补充协议、渲染和回退测试。 |

