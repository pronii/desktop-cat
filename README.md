# desktop-cat

`desktop-cat` 是一个基于 Electron 的 Windows 桌面宠物项目。它会在桌面上显示一只可互动的小猫，并提供喝水提醒、剪贴板历史、Live2D 外观和好友同屏等辅助功能。

当前版本：`0.2.0`

## 功能概览

- 透明、无边框的桌面宠物窗口，默认置顶显示。
- 支持右键菜单和系统托盘菜单，可显示、隐藏、回到屏幕中央、切换置顶和退出。
- 检测到全屏前台窗口时会临时取消置顶，避免遮挡游戏或视频。
- 小猫支持点击反馈、喝水动画、长按拖动窗口、拖动按钮调整大小。
- 喝水提醒支持今日杯数、提醒间隔、稍后提醒和提醒开关。
- 剪贴板历史支持文本、图片和视频文件路径，支持暂停记录、删除、清空和复制回剪贴板。
- Live2D 会自动扫描本地 `live2d/` 目录，找到模型后替换默认 CSS 小猫。
- 好友同屏支持加入 6 位数字房间码，在同一房间中显示其他人的小猫。

## 环境要求

- Windows
- Node.js 20 或更新版本
- npm

## 本地开发

安装依赖：

```powershell
npm install
```

启动桌面宠物：

```powershell
npm start
```

启动好友同屏房间服务端：

```powershell
npm run room:server
```

运行测试：

```powershell
npm test
```

## 打包

打包前必须先阅读 [PACKAGING.md](./PACKAGING.md)。

标准流程：

```powershell
npm test
npm run pack
```

`npm run pack` 会生成 Windows portable 免安装 `.exe`。打包完成后，`dist` 目录最终只保留一个可直接双击运行的 `.exe`，例如：

```text
dist/desktop-cat 0.2.0.exe
```

不要把 zip 当作最终免安装包交付。

## Live2D 外观

应用启动时会自动搜索 `live2d/` 目录中的 Cubism `*.model3.json` 模型。找到模型后会加载 Live2D；没有找到或加载失败时，会继续使用默认小猫。

开发运行时，可以把模型放到项目根目录：

```text
desktop-cat/
└─ live2d/
   └─ Hiyori/
      ├─ Hiyori.model3.json
      ├─ Hiyori.moc3
      └─ textures/
```

portable `.exe` 运行时，可以把 `live2d/` 放到 `.exe` 同级目录：

```text
dist/
├─ desktop-cat 0.2.0.exe
└─ live2d/
   └─ Hiyori/
      └─ Hiyori.model3.json
```

## 喝水提醒

默认开启喝水提醒，初始间隔为 30 分钟。触发提醒时，小猫会进入喝水动画，界面中会显示水碗和提醒气泡。

喝水面板支持：

- 记录一杯水。
- 查看今日已喝杯数。
- 调整提醒间隔。
- 暂停或开启提醒。
- 稍后提醒。

配置会持久化到 Electron `userData` 下的 `water-reminder.json`。

## 剪贴板历史

剪贴板历史会定时轮询系统剪贴板，并保存最近记录。它支持：

- 文本。
- 图片。
- `.mp4`、`.mov`、`.avi` 等视频文件路径。
- 去重。
- 暂停记录。
- 删除单条记录。
- 清空全部记录。
- 点击记录后复制回系统剪贴板。

数据保存在 Electron `userData/clipboard-history/` 下。图片原图会保存到 `images/`，界面优先加载缩略图以降低内存占用。

## 好友同屏

好友同屏通过 WebSocket 房间服务同步宠物状态。客户端默认会连接代码中配置的房间服务地址，也可以通过环境变量覆盖：

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

服务端当前使用内存房间状态，不依赖数据库；服务重启后房间会清空。

## 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm start` | 启动 Electron 桌面宠物 |
| `npm run room:server` | 启动好友同屏房间服务 |
| `npm test` | 运行 Node 测试 |
| `npm run pack` | 生成 Windows portable `.exe` |

## 项目结构

```text
desktop-cat/
├─ server/                    好友同屏 WebSocket 服务
├─ src/
│  ├─ clipboard-history/       剪贴板历史主进程、存储和窗口
│  ├─ main/                    Electron 主进程、菜单、托盘、提醒、房间客户端
│  └─ renderer/                小猫 UI、动画、面板和 Live2D 渲染
├─ tests/                      自动化测试
├─ dist/                       打包产物目录
├─ PACKAGING.md                打包规程
├─ package.json
└─ README.md
```

## 注意事项

- 这是 Windows 桌面宠物项目，其他系统没有作为主要目标验证。
- 当前没有安装器，交付物是 portable `.exe`。
- 好友同屏服务端是轻量 MVP，房间状态只保存在内存中。
- Live2D 模型不内置在仓库中，需要按需放到 `live2d/` 目录。
