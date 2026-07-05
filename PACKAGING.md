# 打包说明

以后凡是执行打包、重新打包、整理 `dist` 产物或准备发布版本前，都先阅读本文件。

## 当前约定

- Windows 正式发布产物包含 NSIS 安装包和 portable 免安装包。
- 面向普通用户优先交付 NSIS 安装包；portable `.exe` 作为绿色版保留。
- 不使用 zip 作为最终交付物。
- 打包前先运行 `npm test`，确认测试通过后再生成产物。
- `dist` 目录可以保留本次发布的安装包、免安装包、校验文件，以及可选的 `live2d/` 外置覆盖资源目录。
- Live2D 内置模型位于 `src/renderer/live2d-models/`，会随 `.exe` 打包；`dist/live2d/` 只用于用户替换或测试外部模型。
- 当前未配置代码签名证书，Windows SmartScreen 仍可能提示未知发布者。正式公开发布前建议购买并配置代码签名证书。

## 打包命令

在项目根目录执行完整发布打包：

```powershell
npm test
npm run pack
```

`npm run pack` 会同时生成：

```text
dist/desktop-cat-0.3.4-win-x64-setup.exe
dist/desktop-cat-0.3.4-win-x64-portable.exe
```

如果只需要单独产物，可以使用：

```powershell
npm run pack:installer
npm run pack:portable
```

## GitHub Release 自动发布

准备发布前，先手动确认版本内容已经更新：

- `package.json` 和 `package-lock.json` 版本号一致。
- `README.md`、`PACKAGING.md`、`CHANGELOG.md` 已写入本次版本内容。
- `CHANGELOG.md` 包含 `## 当前版本号` 小节。

确认后使用首选发布命令：

```powershell
npm run release:github
```

This is the preferred publishing path for GitHub Releases.

该命令会运行测试、打包、生成 `SHA256SUMS.txt`、创建或更新 tag、创建或更新 GitHub Release，并上传安装版自动更新所需的 `latest.yml` 和 `.blockmap`。

## 校验值

发布前为最终 `.exe` 生成 SHA-256：

```powershell
Get-ChildItem -LiteralPath 'dist' -Filter '*.exe' |
  Get-FileHash -Algorithm SHA256 |
  Select-Object Path, Hash
```

远程更新清单里的 `sha256` 必须使用最终下载文件对应的 SHA-256。

## 发布检查

发布 `0.3.4` 时至少确认：

- `package.json` 版本号正确。
- `npm test` 通过。
- `npm run pack` 成功。
- `dist` 下存在 NSIS 安装包和 portable 免安装包。
- 已记录每个发布产物的 SHA-256。
- GitHub Release 已上传 NSIS 安装包、`latest.yml` 和 `.blockmap`，用于安装版自动更新。
- GitHub Release 的附件和更新清单里的下载地址一致。
- 更新推送服务的 `latest.json` 指向本次正式发布产物。

## 打包后整理 `dist`

如果需要清理 `dist`，只保留本次发布的 `.exe`、校验文件，以及可选的 `dist/live2d/` 外置覆盖目录。清理前必须确认删除目标都在当前项目的 `dist` 目录内。

不要删除当前仍需要发布或用于更新清单计算的产物。
