# 分发说明 / Distribution

`MT点位图制作工具—GMT` 的正式分发路线是 Electron 跨平台版。当前本地开发分支版本为 `1.4.0`，GitHub `main` 和最新公开 Release 仍为 `1.1.3`。

The official distribution route for `MT Point Map GMT` is the cross-platform Electron desktop app. The local development branch is `1.4.0`, while GitHub `main` and the latest public release remain `1.1.3`.

公开源码仓库：

- https://github.com/SC123667/mt-point-map-gmt

公开用户可从 GitHub Releases 下载 `v1.1.3` 正式安装包；本地 `v1.2.x–v1.4.x` 分支必须完成真实 GMT 和跨平台验证后才能发布。

Public users can download the `v1.1.3` GitHub Release. The local `v1.2.x–v1.4.x` branch must complete real-GMT and cross-platform validation before publication.

## macOS

在 macOS 上运行：

```bash
npm install
npm run dist:mac
```

若 Documents/FileProvider 导致 electron-builder 读取卡顿，可使用本地构建入口（不替换或停止已安装 App）：

```bash
./script/package_mac_local.sh
```

默认产物为 `release/local-<version>/mac-arm64/MT点位图制作工具—GMT.app`，使用标准 electron-builder 和 ad-hoc 签名，仅适合本地使用；脚本先在临时目录严格深度验签，复制后再验证目标包；FileProvider 目标可能附加 Finder 元数据。

当前源码常规构建产物：

- `release/mac-arm64/MT点位图制作工具—GMT.app`
- `release/MT点位图制作工具—GMT-<version>-mac-arm64.dmg`

如果要公开分发给陌生用户，后续需要 Apple Developer ID 签名和 notarization。当前本地构建包适合自己或熟人测试使用。

For broad public macOS distribution, Apple Developer ID signing and notarization are still recommended. Current local builds are suitable for personal use or trusted testing.

## Windows

在 Windows 或当前已验证可交叉打包的 macOS 环境运行：

```bash
npm install
npm run dist:win
```

当前源码构建产物包括：

- `release/MT点位图制作工具—GMT-<version>-win-x64-setup.exe`
- `release/MT点位图制作工具—GMT-<version>-win-x64-portable.exe`
- `release/MT点位图制作工具—GMT-<version>-win-arm64-setup.exe`
- `release/MT点位图制作工具—GMT-<version>-win-arm64-portable.exe`

完整接手和发布检查清单见 [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md)。

## GMT 依赖 / GMT Dependency

软件会自动检测 `gmt` 命令。

The app automatically detects the local `gmt` command.

- macOS：点击安装按钮会下载 GMT 官方 macOS `.dmg`。当前使用有 DMG 资产的 GMT 6.5.0，Apple Silicon 下载 `darwin-arm64`，Intel 下载 `darwin-x86_64`。
- Windows：点击安装按钮会下载 GMT 官方 Windows 64 位安装器。当前使用 GMT 6.6.0。
- 如果下载失败，软件会提示网络或下载错误。
- GMT 中文手册安装页和 GMT 官方下载页保留为备用帮助入口。

- macOS: the install button downloads the official GMT macOS `.dmg`.
- Windows: the install button downloads the official GMT Windows 64-bit installer.
- If downloading fails, the app reports a network or download error.
- GMT Chinese documentation and official download pages are kept as backup help links.

GMT 不随本软件内置打包。这样可以避免把跨平台 GMT/GDAL/PROJ/Ghostscript 运行时塞进安装包导致体积、授权和维护复杂度大幅上升。软件本身会保存 GMT 脚本；安装 GMT 后即可直接导出 PNG、矢量 PDF 和 EPS。

GMT is not bundled inside this app. This avoids shipping large cross-platform GMT/GDAL/PROJ/Ghostscript runtimes and keeps licensing and maintenance simpler. The app can still save GMT scripts; after GMT is installed, PNG, vector PDF, and EPS export work directly.

## v1.4.0 矢量导出 / Vector Export

无需测点即可按经纬度范围出图。PDF 可在 Illustrator 中打开并编辑；中文标题/图例通过 PDF 页面合成保留底图矢量。地形晕渲仍是栅格影像，EPS 仍不包含原生中文叠加。

Region-only maps require no station import. PDF composition preserves vector paths beneath native Chinese decorations. Shaded relief remains raster; EPS omits native Chinese overlays. `pdf-lib` is a bundled pure-JavaScript runtime dependency used by the GMT worker.
