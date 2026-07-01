# 分发说明 / Distribution

`MT点位图制作工具—GMT` 的正式分发路线是 Electron 跨平台版。

The official distribution route for `MT Point Map GMT` is the cross-platform Electron desktop app.

公开源码仓库：

- https://github.com/SC123667/mt-point-map-gmt

建议从 GitHub Releases 下载正式安装包；从源码构建适合二次开发和本地调试。

Use GitHub Releases for ready-to-install packages. Build from source for development and local debugging.

## macOS

在 macOS 上运行：

```bash
npm install
npm run dist:mac
```

产物：

- `release/mac-arm64/MT点位图制作工具—GMT.app`
- `release/MT点位图制作工具—GMT-0.5.8-mac-arm64.dmg`

如果要公开分发给陌生用户，后续需要 Apple Developer ID 签名和 notarization。当前本地构建包适合自己或熟人测试使用。

For broad public macOS distribution, Apple Developer ID signing and notarization are still recommended. Current local builds are suitable for personal use or trusted testing.

## Windows

在 Windows 或当前已验证可交叉打包的 macOS 环境运行：

```bash
npm install
npm run dist:win
```

产物包括：

- `release/MT点位图制作工具—GMT-0.5.8-win-x64-setup.exe`
- `release/MT点位图制作工具—GMT-0.5.8-win-x64-portable.exe`
- `release/MT点位图制作工具—GMT-0.5.8-win-arm64-setup.exe`
- `release/MT点位图制作工具—GMT-0.5.8-win-arm64-portable.exe`

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

GMT 不随本软件内置打包。这样可以避免把跨平台 GMT/GDAL/PROJ/Ghostscript 运行时塞进安装包导致体积、授权和维护复杂度大幅上升。软件本身会保存 GMT 脚本；安装 GMT 后即可直接导出 PNG/PDF。

GMT is not bundled inside this app. This avoids shipping large cross-platform GMT/GDAL/PROJ/Ghostscript runtimes and keeps licensing and maintenance simpler. The app can still save GMT scripts; after GMT is installed, PNG/PDF export works directly.
