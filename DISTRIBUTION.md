# 分发说明

`MT点位图制作工具—GMT` 的正式分发路线是 Electron 跨平台版。

## macOS

在 macOS 上运行：

```bash
npm install
npm run dist:mac
```

产物：

- `release/mac-arm64/MT点位图制作工具—GMT.app`
- `release/MT点位图制作工具—GMT-0.3.0-mac-arm64.dmg`

如果要公开分发给陌生用户，后续需要 Apple Developer ID 签名和 notarization。当前本地构建包适合自己或熟人测试使用。

## Windows

在 Windows 或当前已验证可交叉打包的 macOS 环境运行：

```bash
npm install
npm run dist:win
```

产物包括：

- Windows x64 安装器
- Windows x64 便携版
- Windows arm64 安装器
- Windows arm64 便携版

## GMT 依赖

软件会自动检测 `gmt` 命令。

- macOS：检测到 Homebrew 时，可从软件里启动 `brew install gmt`。
- Windows：检测到 winget 时，可从软件里启动 `winget install --id GenericMappingTools.gmt --exact --accept-package-agreements --accept-source-agreements`。
- 如果自动安装不可用，软件会提供 GMT 中文手册安装页和 GMT 官方下载页。

GMT 不随本软件内置打包。这样可以避免把跨平台 GMT/GDAL/PROJ/Ghostscript 运行时塞进安装包导致体积、授权和维护复杂度大幅上升。软件本身会保存 GMT 脚本；安装 GMT 后即可直接导出 PNG/PDF。
