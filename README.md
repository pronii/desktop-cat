# desktop-cat

一个基于 Electron 的 Windows 桌面宠物项目。当前版本是一只 Q 版小猫，可以悬浮在桌面上陪伴你。

## 当前功能

- 透明、无边框的悬浮窗口
- 默认置顶显示
- 支持拖拽移动小猫窗口
- 空闲时有呼吸、眨眼、摇尾巴动画
- 会在小范围内随机移动
- 点击小猫会触发开心反馈
- 检测到视频或游戏等全屏窗口时，会临时取消置顶
- 隐藏后可通过系统托盘图标立即呼出
- 右键菜单支持：
  - 暂停 / 恢复随机移动
  - 开启 / 关闭总是置顶
  - 回到屏幕中央
  - 隐藏 5 分钟
  - 退出

## 暂不包含

- 喂食、心情、等级、养成系统
- 设置页面
- 外部图片资源
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

## 测试

运行自动测试：

```powershell
npm test
```

点击反馈冒烟测试：

```powershell
npm run smoke:click
```

全屏置顶避让冒烟测试：

```powershell
npm run smoke:fullscreen
```

随机移动冒烟测试：

```powershell
npm run smoke:roam-window
```

系统托盘冒烟测试：

```powershell
npm run smoke:tray
```

## 项目结构

```text
desktop-cat
├─ src
│  ├─ main        Electron 主进程，负责窗口、菜单、置顶和系统检测
│  └─ renderer    页面层，负责小猫外观、动画和点击反馈
├─ scripts        冒烟测试脚本
└─ test           自动测试
```

## 技术栈

- Electron
- HTML / CSS / JavaScript
- Node.js 内置测试框架
