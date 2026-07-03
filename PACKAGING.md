# 打包说明

以后凡是执行打包、重新打免安装包、整理 `dist` 产物前，都先阅读本文件。

## 当前约定

- Windows 免安装包指可直接双击运行的 portable `.exe` 文件，不使用 zip 作为最终交付物。
- 不要在用户测试前反复打包；只有用户明确要求“打包/重新打包/打免安装包”时才执行。
- 打包前先运行 `npm test`，确认测试通过后再生成产物。
- `dist` 目录最终保留一个免安装 `.exe`，以及可选的 `live2d/` 外置覆盖资源目录。
- Live2D 内置模型位于 `src/renderer/live2d-models/`，会随 `.exe` 打包；`dist/live2d/` 只用于用户替换或测试外部模型。
- 不保留 `win-unpacked`、`builder-debug.yml`、`builder-effective-config.yaml`、旧 zip、旧 exe、临时启动脚本等中间产物；`live2d/` 不是中间产物，可以随 portable `.exe` 保留。

## 标准打包流程

在项目根目录执行：

```powershell
npm test
npm run pack
```

`npm run pack` 使用 `electron-builder --win portable`，会在 `dist` 下生成类似下面的最终产物：

```text
desktop-cat 0.2.0.exe
```

## 打包后清理 `dist`

打包完成后，只保留最新的 portable `.exe`，以及可选的 `dist/live2d/` 外置覆盖目录。清理前必须确认删除目标都在当前项目的 `dist` 目录内：

```powershell
$workspace = (Resolve-Path -LiteralPath '.').Path
$dist = (Resolve-Path -LiteralPath 'dist').Path
$keep = Get-ChildItem -Force -LiteralPath $dist -Filter '*.exe' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $keep) {
  throw 'No portable exe found in dist.'
}

$workspacePrefix = $workspace.TrimEnd('\') + '\'
$distPrefix = $dist.TrimEnd('\') + '\'
$keepPaths = @($keep.FullName)
$live2dPath = Join-Path $dist 'live2d'

if (-not ($dist -eq (Join-Path $workspace 'dist'))) {
  throw "Unexpected dist path: $dist"
}

if (Test-Path -LiteralPath $live2dPath) {
  $keepPaths += (Resolve-Path -LiteralPath $live2dPath).Path
}

$items = Get-ChildItem -Force -LiteralPath $dist | Where-Object { $keepPaths -notcontains $_.FullName }

foreach ($item in $items) {
  if (-not $item.FullName.StartsWith($distPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove path outside dist: $($item.FullName)"
  }
  if (-not $item.FullName.StartsWith($workspacePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove path outside workspace: $($item.FullName)"
  }
  Remove-Item -LiteralPath $item.FullName -Recurse -Force
}
```

最后检查：

```powershell
Get-ChildItem -Force -LiteralPath 'dist'
```

检查结果应包含一个 `desktop-cat <version>.exe`；内置 Live2D 模型已经在 `.exe` 中。如果本次包需要测试外部 Live2D 覆盖模型，也可以同时包含 `live2d/`。
