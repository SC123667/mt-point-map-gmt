# 从源码构建 macOS / Windows 版本

当前源码版本为 **v1.33.2**。本文命令对应仓库锁定的 Electron 35.7.5 和 electron-builder 26.15.3。2026-11-08 的交付内容为源码、版本标签和构建说明。历史安装包可在 Releases 下载，最新安装包版本为 v1.8.1。

## 1. 获取源码和安装依赖

准备 Git、Node.js 22.x 和随 Node.js 安装的 npm。在可写的本地目录中打开终端，Windows 使用 PowerShell。

```sh
git clone https://github.com/SC123667/mt-point-map-gmt.git
cd mt-point-map-gmt
git switch --detach v1.33.2
npm ci
```

`npm ci` 按 `package-lock.json` 安装固定依赖。Electron 和构建工具首次安装需要联网。下载 ZIP 时选择 v1.33.2 标签下的源码，解压后在包含 `package.json` 的目录执行 `npm ci`。

只运行源码时，安装下文所需绘图运行环境后执行 `npm start`。`npm run test:node` 是项目的 Node 回归入口，其中部分用例需要 GMT、Ghostscript 和 Poppler。部分集成测试还引用维护者本机的 EDI、工程和地形路径，运行前需准备对应测试输入。

## 2. 在 macOS 构建

在 Mac 上执行以下命令。按目标机器的处理器选择一种。

Apple Silicon（M 系列），生成 `.app` 和 `.dmg`。

```sh
npm run dist:mac -- --arm64 --config.mac.identity=- --publish never
```

Intel Mac，生成 x64 版本。

```sh
npm run dist:mac -- --x64 --config.mac.identity=- --publish never
```

一次生成两个独立架构的版本。

```sh
npm run dist:mac -- --arm64 --x64 --config.mac.identity=- --publish never
```

仅需要 Apple Silicon 的 `.app` 目录时执行以下命令。

```sh
npm run pack:mac -- --arm64 --config.mac.identity=- --publish never
```

当前版本的主要产物如下。

| 架构 | App 路径 | DMG 路径 |
| --- | --- | --- |
| Apple Silicon | `release/mac-arm64/MT点位图制作工具—GMT.app` | `release/MT点位图制作工具—GMT-1.33.2-mac-arm64.dmg` |
| Intel | `release/mac/MT点位图制作工具—GMT.app` | `release/MT点位图制作工具—GMT-1.33.2-mac-x64.dmg` |

`--config.mac.identity=-` 使用本地 ad-hoc 签名。项目的 `electron/entitlements.mac.plist` 已配置 JIT 与库加载权限。面向其他用户正式分发时，配置 Apple Developer ID 签名和公证，构建命令去掉 `--config.mac.identity=-`，使用自己的证书配置。签名和架构选项依据 electron-builder 26 文档。[macOS 签名说明](https://www.electron.build/v26/docs/features/code-signing/code-signing-mac/)、[架构选项](https://www.electron.build/v26/docs/architecture/)

Documents/iCloud 目录读取缓慢时，可将源码移至普通本地目录后重新执行 `npm ci`。项目另提供 Apple Silicon 本地构建脚本，在临时目录构建、签名并验证 `.app`。

```sh
bash script/package_mac_local.sh
```

该脚本默认输出到 `release/local-1.33.2/mac-arm64/`。也可把绝对输出目录作为第一个参数传入。

构建后可核对版本与签名。

```sh
/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' 'release/mac-arm64/MT点位图制作工具—GMT.app/Contents/Info.plist'
codesign --verify --deep --strict 'release/mac-arm64/MT点位图制作工具—GMT.app'
hdiutil verify 'release/MT点位图制作工具—GMT-1.33.2-mac-arm64.dmg'
```

使用 Intel 构建或本地脚本时，将上述路径换成对应的产物路径。

## 3. 在 Windows 构建

在 Windows PowerShell 中先完成第 1 步。普通 Intel/AMD 64 位电脑选择 x64。

```powershell
npm run dist:win -- --x64 --publish never
```

Windows ARM 电脑选择 arm64。

```powershell
npm run dist:win -- --arm64 --publish never
```

一次生成两个架构的安装版和便携版。

```powershell
npm run dist:win -- --x64 --arm64 --publish never
```

仅需要解包后的程序目录时执行以下命令。

```powershell
npm run pack:win -- --x64 --publish never
```

`dist:win` 和 `pack:win` 会先执行项目的 NSIS 模板补丁，再运行 electron-builder。保留 `scripts/patch-nsis-install-section.js` 和 `build/installer.nsh`，使用上面的 npm 入口。

| 类型 | x64 产物 | ARM64 产物 |
| --- | --- | --- |
| 安装版 | `release/MT点位图制作工具—GMT-1.33.2-win-x64-setup.exe` | `release/MT点位图制作工具—GMT-1.33.2-win-arm64-setup.exe` |
| 便携版 | `release/MT点位图制作工具—GMT-1.33.2-win-x64-portable.exe` | `release/MT点位图制作工具—GMT-1.33.2-win-arm64-portable.exe` |
| 解包目录 | `release/win-unpacked/MTPointMapGMT.exe` | `release/win-arm64-unpacked/MTPointMapGMT.exe` |

正式分发可配置自己的 Windows 代码签名证书。生成安装包后，应在目标 Windows 架构上验证启动、文件导入、GMT 出图、升级和卸载。本项目已有 macOS 上交叉构建 Windows 的历史记录，当前版本的 Windows 实机验证仍待进行。

macOS 的签名步骤需要 Mac。跨平台构建能力还取决于依赖和构建工具，按目标系统分别构建更便于核验。[electron-builder 跨平台构建说明](https://www.electron.build/v26/docs/features/multi-platform-build/)

## 4. 配置绘图运行环境

### GMT、Ghostscript 和 Poppler

制图需要 GMT 6.x。macOS 可使用 Homebrew 安装。

```sh
brew install gmt ghostscript poppler
gmt --version
gs --version
pdftocairo -v
```

Windows 可在软件的“GMT 引擎”中下载官方安装器，安装 GMT 和 Ghostscript 后重新打开软件。手动安装时，在“GMT 引擎”里选择 `gmt.exe`。EPS 透明图件转换使用 Poppler 的 `pdftocairo.exe`，可将其所在目录加入 PATH。安装器来源见 [GMT 官方下载](https://www.generic-mapping-tools.org/download/)。

### MTpy 相位张量和感应矢量

MTpy 图件还需要 Python 3.11 与 `mtpy-v2==2.1.4` 的独立环境。每台运行这些功能的电脑都需配置。

macOS 默认路径的安装命令如下。

```sh
python3.11 -m venv "$HOME/Library/Application Support/MTPointMapGMT/mtpy-v2.1.4"
"$HOME/Library/Application Support/MTPointMapGMT/mtpy-v2.1.4/bin/python" -m pip install "mtpy-v2==2.1.4"
```

Windows 安装 Python 3.11 后，在 PowerShell 执行。

```powershell
$MtpyRuntime = Join-Path $env:LOCALAPPDATA 'MTPointMapGMT/mtpy-v2.1.4'
py -3.11 -m venv "$MtpyRuntime"
& "$MtpyRuntime/Scripts/python.exe" -m pip install 'mtpy-v2==2.1.4'
```

使用其他环境时，可将 `MT_GMT_MTPY_PYTHON` 指向该环境的 Python 可执行文件，并从设置了该变量的终端启动软件。包内的 Python worker 由 `asarUnpack` 放到 `app.asar.unpacked/electron/mtpy_backend.py`。运行机制和验证入口见 [MTpy 集成说明](docs/MTPY_INTEGRATION.md)。

直接导出 `.ai` 还需要目标电脑安装 Adobe Illustrator。macOS 首次调用可能需要允许自动化权限。

## 5. 数据目录与构建验证

新用户的数据目录默认为 `~/Documents/GMT工作区`，Windows 对应当前用户的 Documents。工程、导出图、地形缓存和构造库存放于其中。需要另一个位置时设置 `MT_GMT_WORKSPACE`。源码构建所需文件由 `package.json` 的 `build.files`、依赖锁文件和脚本共同定义。

构建完成后，建议用示例点位验证预览和 PDF 导出，再用 EDI 验证相位张量、感应矢量及曲线。最后检查工程保存、重新打开、色标开关和中文标签。

v1.33.1 已完成 macOS Apple Silicon 的安装与实图验证。v1.33.2 更新构建文档和源码发布元数据，2026-11-08 按源码交付范围核对命令、依赖和文件完整性。Windows x64、Windows ARM64 和 Intel macOS 的当前版完整安装运行验证仍待在对应机器上完成。
