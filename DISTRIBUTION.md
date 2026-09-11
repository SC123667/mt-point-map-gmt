# 分发说明 / Distribution

本地开发版本 **v1.13.0**（AI 编辑包与 EPS 矢量保留，保留 GMT 6.7 引擎适配）；此轮仅本地验证，安装状态另列，公开发行仍为下述 v1.8.1。

本机“实用app”已安装 **v1.13.0** 并后台运行；候选严格深度验签通过，安装目标深度验签与 ASAR 一致性通过。安装目标严格检查仍提示 FileProvider 的已知 Finder 元数据问题。旧版保存在全局目录 `版本备份/v1.12.0-升级v1.13.0`。

当前发布版本 **v1.8.1**，仓库与下载：[SC123667/mt-point-map-gmt](https://github.com/SC123667/mt-point-map-gmt/releases/tag/v1.8.1)。这是 v1.1.3 之后的累积更新。

Current release: **v1.8.1**, a cumulative update after v1.1.3.

发布包：macOS Apple Silicon DMG；Windows x64/ARM64 各有安装版和便携版；另附 SHA-256 校验文件。macOS 为 ad-hoc 签名、未公证，Windows 未签名。本轮 Windows 为交叉构建，未进行实机安装、升级和卸载验证。

Packages: Apple Silicon DMG and Windows x64/ARM64 setup and portable executables, with SHA-256 checksums. macOS is ad-hoc signed and not notarized; Windows is unsigned and cross-built, without on-device install/upgrade/uninstall validation.

发布构建：`./script/package_release.sh /absolute/output/path`。脚本在隔离目录使用锁定依赖和标准 electron-builder，保留 NSIS 补丁，不启动或替换正在使用的 App，也不自动上传。

新用户默认全局目录：`~/Documents/GMT工作区`；可用 `MT_GMT_WORKSPACE` 或目录符号链接指定外接盘。链接目标磁盘断开时明确报错，不创建替代缓存。安装包不包含用户工程、地形缓存、本地构造库和个人名称词典。

New users default to their own `~/Documents/GMT工作区`; an environment override or directory symlink can select another disk. User datasets and dictionaries are not distributed.

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

- macOS：使用现有 Homebrew 执行 `brew install gmt ghostscript`，先核对稳定版属于 6.7；不下载不存在的 6.7 macOS DMG，也不静默安装其他次版本。没有 Homebrew 时提供说明。缓存和日志位于全局目录“安装包/GMT-6.7”。
- Windows：下载官方 GMT 6.7.0 win64 安装器。ARM64 Windows 的 x64 兼容运行以及 Windows 安装/运行本轮未做实机验证。
- 如果下载失败，软件会提示网络或下载错误。
- GMT 中文手册安装页和 GMT 官方下载页保留为备用帮助入口。

- macOS: install GMT and Ghostscript with existing Homebrew after checking that its stable GMT formula is 6.7.x.
- Windows: download the official GMT 6.7.0 x64 installer.
- If downloading fails, the app reports a network or download error.
- GMT Chinese documentation and official download pages are kept as backup help links.

GMT 不随本软件内置打包。这样可以避免把跨平台 GMT/GDAL/PROJ/Ghostscript 运行时塞进安装包导致体积、授权和维护复杂度大幅上升。软件本身会保存 GMT 脚本；安装 GMT 后即可直接导出 PNG、矢量 PDF 和 EPS。

GMT is not bundled inside this app. This avoids shipping large cross-platform GMT/GDAL/PROJ/Ghostscript runtimes and keeps licensing and maintenance simpler. The app can still save GMT scripts; after GMT is installed, PNG, vector PDF, and EPS export work directly.

## v1.4.0 矢量导出 / Vector Export

无需测点即可按经纬度范围出图。PDF 可在 Illustrator 中打开并编辑；中文标题/图例通过 PDF 页面合成保留底图矢量。地形晕渲仍是栅格影像，v1.6.0 起应用导出已增加原生中文 EPS 合成。

Region-only maps require no station import. PDF composition preserves vector paths beneath native Chinese decorations. Shaded relief remains raster; app exports since v1.6.0 support native Chinese EPS composition. `pdf-lib` is a bundled pure-JavaScript runtime dependency used by the GMT worker.

## v1.4.1 地形下载 / Terrain Downloads

新增 `@cornerstonejs/codec-openjpeg@1.3.5`（JS + WASM，约 2 MB 包文件）生产依赖，随 App 打包并由 SRTM worker 读取；无需本机 GDAL 的 JPEG2000 驱动，也不在运行时从 CDN 加载解码器。许可证见 `electron/THIRD_PARTY_NOTICES.txt`。USTC 与 AWS 下载格式不同，解码后复用现有 HGT 缓存与 GMT 流程。

The bundled OpenJPEG WASM decoder is loaded by the SRTM worker from local package bytes, including inside ASAR. Packaging must retain both its JS and WASM files. Validate a real USTC download from the packaged App, not only source execution. Windows runtime validation remains separate from macOS validation.

## v1.5.0 本地安装版与全局目录

v1.5.0 本机曾指定外接 SSD；v1.8.1 起默认目录以本文顶部为准。自动化验证可用 `MT_GMT_WORKSPACE` 隔离数据。GeoNames 城镇数据与许可证随 `electron/data/` 打包。

本次须分别核对源代码 12 组 Node 测试、真实 GMT 数值和速度、候选及实用app安装包、迁移 SHA-256 清单。实际交付结果见 PROJECT_HANDOFF.md 最新记录。

## v1.6.0 地理数据与标注

新增 `shpjs`（SHP 重投影）和 `fast-xml-parser`（WFS 能力文档），需随生产依赖打包。`cartography-ui.js` 由主进程内嵌加载；`geodata-worker.js` 负责后台下载和解析。公共构造数据不打入 ASAR，首次下载后存入全局目录，数据许可与应用 MIT 许可分别处理。

本轮验证 macOS App、GMT 6.5.0 和 Windows 布局/ASCII 工作区代码路径；未在 Windows 实机执行。以上为该版本历史验证记录。

## v1.7.0 构造编辑与名称

新增 `map-names.js`、`map-project-worker.js` 和 `renderer/map-drawing-ui.js`，必须随 Electron 目录打包。投影转换在独立 worker 中执行，不改变 GMT/SRTM/导入边界。名称词典为运行数据，保存在全局目录下的 `名称词典`，不打入 ASAR；旧工程语言默认 original，新工程默认中文。

## v1.8.0 本地构造库

新增 local-structures.js 和 renderer/local-library-ui.js，沿用 geodata worker。用户构造数据不打入 ASAR，不上传仓库；库保存在全局目录的 `构造数据/本地构造库`。换电脑需另行复制该目录，原始文件夹不是绘图时的依赖。安装包只包含解析、索引及界面代码。该功能包含于 v1.8.1 累积发布。

### v1.13.0 导出依赖

AI 编辑包包含 base-map.pdf、labels.svg 和生成可编辑AI.jsx，需保持文件夹完整。在 Illustrator 中运行脚本生成原生 AI；重复运行另存新文件，不覆盖已有 AI 修改。脚本将输入复制到 Illustrator 系统临时目录，完成或失败后清理，最终文件写回编辑包。

EPS 转换优先寻找 GMT bin、PATH、macOS Homebrew 的 pdftocairo。PDF 含透明内容但无 Cairo 时，返回清楚的 EPS 限制提示，不再输出整页位图伪装矢量。EPS 不能完整保留 PDF 透明度。Windows 的脚本/工具路径处理已实现，尚未在 Windows Illustrator 实机验证。

2026-09-11 最终验证：实际论文工程 AI 重开后含 200 条路径、23 个文字对象、1 张地形影像，完整名称可改写和移动。实用app 已更新并后台启动；ASAR 为 58edabdf6573db04f2d15116b10f8b6ae16931a54ec9492a16c3af0a8f811b0e。未远端发布。
