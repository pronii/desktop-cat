# desktop-cat

一个基于 Electron 的 Windows 桌面宠物项目。当前版本 v0.2.0，是一只 Q 版小猫，可以悬浮在桌面上陪伴你，提供剪贴板历史辅助和喝水提醒功能。

## 当前功能

- 透明、无边框的桌面宠物窗口
- 默认置顶显示，并可在菜单中开关置顶
- 支持通过顶部拖拽柄移动小猫窗口
- 空闲时有呼吸、眨眼、摇尾巴动画
- 点击小猫会触发开心反馈
- 检测到视频或游戏等全屏窗口时，会临时取消置顶，避免遮挡全屏内容
- 隐藏后可通过系统托盘图标立即呼出
- 系统托盘菜单支持显示小猫、隐藏 5 分钟、总是置顶、喝水提醒、剪切板历史和退出

## 喝水提醒

v0.2.0 新增定时喝水提醒功能。

- 默认每 30 分钟提醒一次，小猫低头喝水 + 水碗浮现 + 聊天气泡
- 右上角显示今日喝水杯数 💧
- 右键菜单和托盘菜单均可开关喝水提醒
- 提醒配置持久化到 `userData/water-reminder.json`

## 剪贴板历史

项目新增了剪贴板历史功能，用于记录最近复制过的文本、图片和部分视频文件路径。

- 每 1.5 秒轮询系统剪贴板
- 自动去重，避免连续记录相同内容
- 支持文本、图片，以及 `.mp4`、`.mov`、`.avi` 视频文件路径
- 默认最多保留 50 条历史
- 历史记录持久化到 Electron `userData` 目录下的 `clipboard-history/clipboard-history.json`
- 图片原图保存到 `userData/clipboard-history/images/`，界面只加载缩略图以降低内存占用
- 可通过系统托盘菜单的"剪切板历史"打开独立历史窗口
- 小猫窗口底部也提供一个紧凑剪贴板按钮，可快速查看最近记录
- 点击历史项会把对应内容重新写入系统剪贴板
- 支持删除单条历史、清空全部历史
- 支持暂停 / 恢复记录，适合临时处理敏感内容

## 暂不包含

- 喂食、心情、等级、养成系统
- 设置页面
- 打包安装器

## 本地运行

先安装依赖：

```powershell
npm install
```

启动项目：

```powershell
npm start
```

## 项目结构

```text
desktop-cat
├─ docs
│  └─ superpowers        剪贴板历史功能的设计与计划文档
├─ scripts               启动辅助脚本
├─ src
│  ├─ clipboard-history  剪贴板监听、存储、历史窗口和渲染层
│  ├─ main               Electron 主进程，负责宠物窗口、菜单、置顶和系统检测
│  └─ renderer           小猫外观、动画、点击反馈和紧凑剪贴板入口
├─ package.json
└─ README.md
```

## 技术栈

- Electron
- HTML / CSS / JavaScript
- Node.js

## 多人桌宠房间服务端

项目包含一个轻量 WebSocket 房间服务端，用于多人桌宠 MVP 的好友宠物同屏中转。第一版只做内存房间状态，不依赖数据库，服务重启后房间会清空。

本地启动：

```powershell
npm run room:server
```

默认监听 `3001` 端口：

- 健康检查：`http://127.0.0.1:3001/health`
- WebSocket：`ws://127.0.0.1:3001/room`

Docker 启动：

```bash
docker compose up -d --build
```

客户端消息协议：

```json
{"type":"room:join","roomCode":"123456","userId":"alice","nickname":"Alice"}
{"type":"pet:update","pet":{"x":0.4,"y":0.5,"action":"walk","facing":"left"}}
{"type":"room:leave"}
```

服务端会返回 `room:joined`，并向同房间其他客户端广播 `pet:join`、`pet:update` 和 `pet:leave`。
