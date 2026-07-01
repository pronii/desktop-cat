# 健壮性加固设计文档

## 概述

针对 desktop-cat 桌面宠物在长期运行中暴露的健壮性短板做一轮加固。范围聚焦四类已对照源码确认的真实问题，不引入新功能，目标是让应用在多实例误开、显示器热插拔、快速连续复制、空闲轮询等场景下稳定且低开销。

## 问题清单（已对照源码确认）

### 问题 1：缺少单实例锁

`src/main/main.js` 启动流程未调用 `app.requestSingleInstanceLock()`。用户误开第二次会同时启动两个宠物窗口、两个剪贴板监听器，且两个主进程会**并发写同一个 `clipboard-history.json`**，造成记录互相覆盖、图片文件与索引不一致。

### 问题 2：不监听显示器变化

`main.js` 未注册 `screen` 的 `display-added` / `display-removed` / `display-metrics-changed` 事件。当用户拔掉外接显示器、修改分辨率或缩放比例后，宠物窗口可能停留在已不存在的屏幕坐标上（屏外不可见），或 DPI 错位。置顶轮询能把它拉回顶层，但位置无法自动恢复。

### 问题 3：storage 同步写盘阻塞主进程

`src/clipboard-history/storage.js` 的 `_save()` 使用 `fs.writeFileSync` 同步写整个 JSON。每新增一条剪贴板记录都会同步写盘一次。快速连续复制（例如复制多段文本）时，主进程在每次写盘时被阻塞，导致 UI 卡顿、置顶轮询延迟。

### 问题 4：topmost 轮询无前台短路

`main.js` 的 `startTopmostWatch` 每 500ms 调用 `refreshTopmost`，后者通过 `probeForegroundWindow` **每次都 spawn 一个 `powershell.exe` 子进程**枚举所有窗口。即便前台窗口从未改变（用户静止阅读时），也会每秒 spawn 两次 PowerShell，CPU 与进程创建开销显著。`topmostChecking` 仅防重入，未做"前台句柄未变即跳过"的节流。

> **更正说明**：上一轮分析中曾提出"删除剪贴板项时不清理磁盘图片文件"为 bug。复核 `src/clipboard-history/main.js` 后确认，`removeById`、`clear`、以及 `add` 触发 trim 时均已调用 `removeImageFile` 清理磁盘文件，该问题不存在，故不纳入本次范围。

## 技术方案

### 改进 1：单实例锁

在 `main.js` 的 `app.whenReady()` 之前调用 `app.requestSingleInstanceLock()`。

- 返回 `true`：正常进入启动流程。
- 返回 `false`：第二个实例，立即 `app.quit()` 退出。
- 注册 `app.on('second-instance')`：当已有实例运行时，若用户再次启动，把宠物窗口从临时隐藏中恢复、显示并聚焦，而不是静默忽略。

这样既防止并发写文件，又把"误双开"转化为"唤起已有实例"的良性体验。

### 改进 2：显示器变化监听

在 `main.js` 中新增 `setupDisplayChangeHandlers(window)`，监听 `screen` 的三个事件：

- `display-removed`：当前窗口所在显示器被移除时，立即把窗口重新定位到剩余主显示器的工作区内。
- `display-metrics-changed`：分辨率或缩放变化时，校验窗口边界是否仍在可见工作区内，越界则拉回。
- `display-added`：新显示器接入一般无需移动窗口，但同样做一次边界校验兜底。

统一的恢复策略：取 `screen.getDisplayMatching(window.getBounds())`，若该显示器已不存在或窗口完全在工作区外，则把窗口居中到主显示器（`screen.getPrimaryDisplay()`）工作区。复用已有的 `centerInWorkArea`。

为避免在事件风暴中频繁 setPosition，恢复动作做一次轻量节流（例如 200ms 内只执行一次）。

### 改进 3：storage 异步 debounce 写盘

改造 `storage.js`：

- `_save()` 改为 `scheduleSave()`：用 `setTimeout(300)` debounce，300ms 内多次 `add` / `removeById` / `clear` / `setItems` 合并为一次写盘。
- 实际写盘改用 `fs.writeFile`（异步），回调里仅记录错误日志，不抛出。
- 新增 `flushSync()`：在应用退出（`before-quit`）时强制同步落盘，保证未写的数据不丢失。`teardownClipboardHistory` 调用它。
- 读路径 `_load()` 保持同步（仅在构造时执行一次，无阻塞问题）。
- 内存数据 `_data.items` 始终是最新值，`getAll()` 等读方法不受写盘延迟影响——写盘延迟只影响磁盘持久化，不影响内存一致性。

### 改进 4：topmost 轮询前台短路

在 `main.js` 的 `refreshTopmost` 中，spawn powershell 之前先做一次轻量的前台句柄探测。Windows 下可用 `user32.GetForegroundWindow` 的更廉价方式，但为了不引入额外原生依赖，采用如下折中：

- 缓存上一次探测到的前台窗口句柄（`lastForegroundHwnd`）。
- 由于纯 JS 无法直接拿前台句柄，而完整 probe 又太重，改为**拉长空闲时的轮询间隔**：保留 500ms 的快速轮询，但当连续 N 次（例如 6 次，约 3 秒）探测结果未检测到全屏暂停时，自动把后续轮询间隔放宽到 1500ms；一旦检测到暂停或前台窗口变化迹象，立即回落到 500ms。

> 说明：真正的前台句柄短路需要原生模块或单独的轻量 PowerShell 片段。本次不引入原生依赖，采用"自适应轮询间隔"作为低风险实现，等效降低空闲时的 spawn 频率（从每秒 2 次降到约每 3 秒 1 次）。若后续愿意引入原生模块，可进一步换成句柄级短路。

## 非功能需求

- 不改变现有用户可见行为（宠物动画、剪贴板功能、托盘菜单均保持）。
- 不引入新的运行时依赖。
- 所有改动保持 CommonJS 风格、与现有代码风格一致。
- 改动后 `node --check` 通过，现有冒烟脚本不报错。

## 测试

- 手动验证：双开应用 → 第二个窗口应退出并聚焦首个实例。
- 手动验证：拔插外接显示器 → 宠物窗口回到主屏可见区。
- 手动验证：快速连续复制 10 条文本 → 主进程不卡顿，JSON 最终正确落盘且条数正确。
- 手动验证：静止不操作 10 秒 → 观察任务管理器中 powershell.exe 子进程创建频率下降。
- `node --check` 对所有改动文件通过。

## 后续可扩展

- 引入轻量原生模块做前台句柄级短路，进一步降低 topmost 轮询开销。
- 把"自适应轮询间隔"的阈值做成可配置。
- 单实例锁的 `second-instance` 可解析命令行参数（例如未来支持 `desktop-cat.exe --show` 唤起）。
