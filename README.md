# desktop-cat

当前版本：`0.3.1`

`desktop-cat` 是一个面向 Windows 的 Electron 桌面宠物。它把一只可互动的小猫放在桌面上，既能陪伴、提醒喝水、管理剪贴板，也能切换 Live2D 形象、和朋友进入同一个房间同屏出现。

项目的目标不是做一个厚重的效率软件，而是做一个轻量、可打包、可扩展、不会打扰用户当前工作的桌面伙伴。

## 项目特点

- 轻量桌面宠物：透明无边框窗口，默认置顶显示，支持拖动、缩放、隐藏、回到屏幕中央和托盘控制。
- 不打扰工作：检测到全屏前台窗口时会临时取消置顶，避免遮挡游戏、视频或演示。
- Live2D 形象切换：内置 Haru、Hiyori、Mao 三套示例形象，支持外置 `live2d/` 目录加载自定义 Cubism 模型。
- 稳定的 Live2D 预览：形象面板使用静态预览图，不在切换窗口里重复创建 Live2D runtime，降低主形象消失和 WebGL 上下文异常的风险。
- 话痨模式：小猫会随机显示陪伴文案，也可以在设置里关闭。
- 喝水提醒：记录今日杯数，支持提醒间隔、稍后提醒、启停提醒和紧凑的应用内提醒弹窗。
- 剪贴板历史：保存最近文本、图片和视频文件路径，支持暂停记录、删除、清空和复制回系统剪贴板。
- 好友同屏：通过 WebSocket 房间同步宠物状态，输入 6 位房间码即可看到同房间里的其他小猫。
- 远程更新提示：支持服务端清单、WebSocket 推送提醒、SHA-256 校验和紧凑的应用内更新提示。
- 正式打包：使用 `electron-builder` 生成 Windows NSIS 安装包和 portable 免安装包。

## 快速开始

### 环境要求

- Windows
- Node.js 20 或更新版本
- npm

### 安装依赖

```powershell
npm install
```

### 启动桌面宠物

```powershell
npm start
```

### 启动好友同屏服务端

```powershell
npm run room:server
```

### 运行测试

```powershell
npm test
```

## 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm start` | 启动 Electron 桌面宠物 |
| `npm run room:server` | 启动好友同屏和更新推送服务 |
| `npm test` | 运行 Node.js 测试 |
| `npm run pack` | 打包 Windows 正式发布产物 |
| `npm run pack:installer` | 只打包 Windows NSIS 安装包 |
| `npm run pack:portable` | 只打包 Windows portable 免安装包 |

## 打包

打包前建议先运行完整测试：

```powershell
npm test
npm run pack
```

`npm run pack` 会同时生成 Windows 安装包和免安装包。当前版本产物示例：

```text
dist/desktop-cat-0.3.1-win-x64-setup.exe
dist/desktop-cat-0.3.1-win-x64-portable.exe
```

打包前请阅读 [PACKAGING.md](./PACKAGING.md)。正式发布建议优先给普通用户提供 NSIS 安装包，同时保留 portable 免安装包作为绿色版。

## 核心功能

### 桌面宠物

默认形象是一只 CSS 绘制的小猫。它支持：

- 点击反馈和随机陪伴文案。
- 长按拖动窗口。
- 拖动尺寸按钮调整大小。
- 通过托盘或右键菜单显示、隐藏、置顶、回到屏幕中央、退出。
- 全屏前台窗口保护，避免置顶遮挡。

### 设置面板

设置面板可以控制：

- 话痨模式开关。
- 底部喝水、剪贴板、好友同屏、Live2D 形象、大小调节按钮是否显示。

设置会保存在浏览器本地存储中。

### 喝水提醒

喝水提醒默认开启，初始提醒间隔为 30 分钟。触发提醒时，应用会显示紧凑的提醒弹窗，不再播放旧版小猫喝水动画。

喝水面板支持：

- 记录一杯水。
- 查看今日杯数。
- 调整提醒间隔。
- 暂停或开启提醒。
- 稍后提醒。
- 自定义事项提醒。

喝水配置会持久化到 Electron `userData` 下的 `water-reminder.json`。

### 剪贴板历史

剪贴板历史会轮询系统剪贴板并保存最近记录。它支持：

- 文本。
- 图片。
- `.mp4`、`.mov`、`.avi` 等视频文件路径。
- 去重。
- 暂停记录。
- 删除单条记录。
- 清空全部记录。
- 点击记录后复制回系统剪贴板。

数据保存在 Electron `userData/clipboard-history/` 下。图片原图会保存到 `images/`，界面优先加载缩略图以降低内存占用。

### Live2D 形象

应用启动时会优先搜索外置 `live2d/` 目录中的 Cubism `*.model3.json` 模型；没有外置模型时，会回退到内置的 Haru、Hiyori、Mao。

搜索优先级从高到低：

- portable `.exe` 同级目录下的 `live2d/`
- 当前工作目录下的 `live2d/`
- Electron `userData/live2d/`
- 应用内置的 `src/renderer/live2d-models/`

开发运行时，可以把模型放到项目根目录：

```text
desktop-cat/
└─ live2d/
   └─ Hiyori/
      ├─ Hiyori.model3.json
      ├─ Hiyori.moc3
      └─ Hiyori.2048/
```

portable `.exe` 运行时，可以把 `live2d/` 放到 `.exe` 同级目录：

```text
dist/
├─ desktop-cat 0.3.1.exe
└─ live2d/
   └─ Hiyori/
      └─ Hiyori.model3.json
```

内置 Live2D 示例模型来自 [Live2D/CubismWebSamples](https://github.com/Live2D/CubismWebSamples)，按 Live2D Free Material License 使用。仓库内保留了对应的 `LICENSE.Live2D.md` 和 `NOTICE.Live2D.md`。

### 好友同屏

好友同屏通过 WebSocket 房间服务同步宠物状态。客户端默认连接代码中配置的房间服务地址，也可以用环境变量覆盖：

```powershell
$env:DESKTOP_CAT_ROOM_ENDPOINT = "ws://127.0.0.1:3001/room"
npm start
```

本地服务默认端口是 `3001`：

- 健康检查：`http://127.0.0.1:3001/health`
- WebSocket：`ws://127.0.0.1:3001/room`

Docker 启动服务端：

```powershell
docker compose up -d --build
```

服务端当前使用内存保存房间状态，不依赖数据库。服务重启后房间会清空。

### 远程更新推送

远程更新使用“服务端清单 + 可选 WebSocket 推送提醒”的方式。客户端不会直接信任推送消息，收到提醒后仍会重新拉取 `latest.json`，并校验下载文件的 `sha256`。

服务端环境变量：

```powershell
$env:DESKTOP_CAT_UPDATE_MANIFEST_PATH = "D:\releases\desktop-cat\latest.json"
$env:DESKTOP_CAT_UPDATE_PUBLISH_TOKEN = "change-me"
$env:DESKTOP_CAT_UPDATE_MANIFEST_URL = "/updates/latest.json"
npm run room:server
```

客户端环境变量：

```powershell
$env:DESKTOP_CAT_UPDATE_MANIFEST_URL = "http://127.0.0.1:3001/updates/latest.json"
$env:DESKTOP_CAT_UPDATE_STREAM_URL = "ws://127.0.0.1:3001/updates/stream"
npm start
```

`latest.json` 示例：

```json
{
  "version": "0.3.1",
  "url": "https://example.com/releases/desktop-cat-0.3.1.exe",
  "sha256": "64位十六进制sha256",
  "notes": "新增远程更新提示。",
  "mandatory": false
}
```

发布新版本后，调用发布接口通知在线客户端立即检查：

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:3001/updates/publish" `
  -Headers @{ Authorization = "Bearer change-me" } `
  -ContentType "application/json" `
  -Body "{}"
```

即使 WebSocket 不可用，客户端也会在启动后和后台轮询时检查更新。

## 项目结构

```text
desktop-cat/
├─ server/                    好友同屏与更新推送 WebSocket/HTTP 服务
├─ scripts/                   启动脚本和辅助脚本
├─ src/
│  ├─ clipboard-history/       剪贴板历史主进程、存储和窗口
│  ├─ main/                    Electron 主进程、菜单、托盘、提醒、更新和房间客户端
│  └─ renderer/                小猫 UI、动画、面板和 Live2D 渲染
├─ tests/                      自动化测试
├─ dist/                       打包产物目录
├─ PACKAGING.md                打包规程
├─ package.json
└─ README.md
```

## 注意事项

- 当前主要目标平台是 Windows，其他系统没有作为主要目标验证。
- Windows 正式发布会生成 NSIS 安装包，portable `.exe` 作为免安装版本保留。
- 好友同屏服务端是轻量 MVP，房间状态只保存在内存中。
- Live2D 外置模型需要保持 Cubism 模型文件的相对路径完整。
- 更新下载会校验 `sha256`，生产环境中应使用 HTTPS 下载地址和保密的发布 token。
- 托盘猫脸图标来自 Microsoft Fluent Emoji `Cat face`，按 MIT 许可证使用。
