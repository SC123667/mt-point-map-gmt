# MT点位图制作工具-GMT / MT Point Map GMT

[![Development Version](https://img.shields.io/badge/development-v1.2.3-0d8584)](PROJECT_HANDOFF.md)
[![Latest Release](https://img.shields.io/github/v/release/SC123667/mt-point-map-gmt?label=installer)](https://github.com/SC123667/mt-point-map-gmt/releases)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows-334155)](#运行要求--requirements)
[![GMT](https://img.shields.io/badge/GMT-6.x-2563eb)](https://www.generic-mapping-tools.org/)
[![License](https://img.shields.io/badge/license-MIT-64748b)](LICENSE)

**MT点位图制作工具-GMT** 是一款面向大地电磁测深（MT/AMT/LMT）野外工作的跨平台桌面制图软件。它把常见 GMT 命令行绘图流程做成图形界面：导入点位表或递归扫描 EDI 文件夹，预览图件，调整论文制图参数，并导出 PNG、矢量 PDF、EPS 和可复现的 GMT 脚本。

**MT Point Map GMT** is a cross-platform desktop application for magnetotelluric (MT/AMT/LMT) field-station mapping and GMT-based geophysical figure production. It turns common GMT plotting workflows into a graphical interface: import station tables or recursively scan EDI folders, preview figures, tune publication-style parameters, and export PNG, vector PDF, EPS, plus reproducible GMT scripts.

关键词 / Keywords: 大地电磁、GMT、地球物理、EDI、相位张量、感应矢量、视电阻率、测点图、magnetotelluric, geophysics, phase tensor, tipper, apparent resistivity.

## 项目接手 / Developer Handoff

完整的架构、版本状态、模块职责、数据流、测试、打包、发布和技术债务说明见 [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md)。当前本地开发分支为 `codex/method-colored-stations`，源码版本为 **v1.2.3**；GitHub `main` 和最新公开安装包仍为 **v1.1.3**。

See [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) for the complete architecture, branch state, module ownership, runtime flows, testing, packaging, release process, and known technical debt. The local development branch is **v1.2.3**, while GitHub `main` and the latest public installers remain **v1.1.3**.

## 软件界面 / Interface Preview

### 画布优先工作台 / Canvas-first Workbench

![MT/GMT 1.1.3 canvas-first workbench](docs/images/mt-gmt-workbench-1.1.3.png)

1.1.3 工作台采用画布优先布局：左侧常驻数据、制图、图层、标注、导出和工具入口，右侧快捷参数默认收起，让中央地图获得最大空间。

The 1.1.3 workbench uses a canvas-first layout: data, mapping, layer, label, export, and utility entry points stay visible on the left, while the contextual quick inspector stays collapsed by default so the central map receives maximum space.

### 就近导入数据 / Direct Data Import

![MT/GMT 1.1.3 data import menu](docs/images/mt-gmt-data-menu-1.1.3.png)

TXT/CSV/Excel、EDI 文件夹和示例数据都可直接从左侧“数据”菜单进入，原有系统文件菜单与快捷键仍然保留。

TXT/CSV/Excel tables, EDI folders, and sample data are directly available from the left Data menu, while the native File menu and shortcuts remain available.

### 可滚动快捷参数 / Scrollable Quick Inspector

![MT/GMT 1.1.3 contextual quick inspector](docs/images/mt-gmt-quick-inspector-1.1.3.png)

右侧快捷参数按需展开，中间参数区支持鼠标滚轮、触控板和键盘滚动；顶部标题与底部操作始终可见，不会压缩成难以操作的长面板。

The contextual quick inspector opens on demand. Its middle content supports mouse-wheel, trackpad, and keyboard scrolling, while the title and bottom actions remain reachable.

## 为什么做这个工具 / Why This Tool

大地电磁野外和论文制图经常需要快速制作点位分布图、测线图、带地形底图的图件、相位张量图、感应矢量图和单点曲线图。直接写 GMT 脚本很强大，但重复劳动多，也不适合频繁调参数。本软件保留 GMT 作为制图引擎，同时提供桌面界面，让常用 MT 图件可以更快生成和复现。

MT field work often needs quick station maps, line maps, terrain-backed figures, phase tensor maps, tipper maps, and single-site sounding curves. GMT scripts are powerful but repetitive when parameters change frequently. This app keeps GMT as the rendering engine while providing a desktop UI for routine MT plotting.

## 主要功能 / Highlights

- 导入 TXT、CSV、DAT、TSV、XLSX、XLS 点位表。
- Import TXT, CSV, DAT, TSV, XLSX, and XLS station tables.
- 从左侧数据菜单直接导入点位表、EDI 文件夹或示例数据，无需在界面中寻找隐藏入口。
- Import station tables, EDI folders, or sample data directly from the persistent Data menu.
- 递归扫描文件夹中的 `.edi` 文件，读取测点坐标和可用的 MT 响应数据。
- Recursively scan `.edi` folders and extract station coordinates plus available MT response data.
- 自动识别测点名、经度、纬度、测线、高程等字段，也支持手动指定列含义。
- Auto-detect station name, longitude, latitude, line, and elevation columns, with manual column mapping.
- 支持经纬度坐标和常见 3 度带高斯投影野外坐标。
- Support longitude/latitude tables and common 3-degree Gauss projected field coordinates.
- 绘制 MT 点位图，支持标签、符号、经纬网、比例尺、指北针。
- Draw MT station maps with labels, symbols, grid, scale bar, and north arrow.
- 支持 GMT 在线/缓存地形晕渲底图，也支持导入本地 GMT `.grd`/`.nc` 地形网格。
- Support GMT online/cache shaded-relief basemaps and local GMT `.grd`/`.nc` terrain grids.
- 支持导入构造线/断层线文件并作为 GMT 叠加层绘制，可为图件生成简洁图例。
- Import structural or fault-line files as GMT overlays, with optional compact legends.
- 支持可编辑图例、比例尺、指北针位置和图件元素。
- Support editable legend content plus draggable legend, scale-bar, north-arrow, and map-element placement.
- 绘制相位张量主轴（alpha - beta）/ 广义电性走向图。
- Draw phase-tensor principal-axis (alpha minus beta) / generalized electric-strike maps.
- 绘制相位张量椭圆图。
- Draw phase tensor ellipse maps.
- 绘制 Tipper 感应矢量图，支持 Parkinson / Wiese 约定。
- Draw Tipper induction vectors with Parkinson / Wiese convention choices.
- 从 EDI 阻抗张量绘制视电阻率和相位曲线。
- Draw apparent-resistivity and phase sounding curves from EDI impedance tensors.
- 曲线测点支持下拉、上一点/下一点按钮和键盘左右方向键切换。
- Switch response-curve stations from the selector, previous/next buttons, or left/right arrow keys.
- 预览区支持滚轮缩放、框选局部放大、拖拽平移。
- Preview supports mouse-wheel zoom, box zoom, and drag-to-pan.
- 导入、GMT 渲染和 SRTM 地形准备使用后台 worker，减少大数据和高分辨率任务对界面的阻塞。
- Import, GMT rendering, and SRTM terrain preparation use background workers to keep large-data and high-resolution tasks responsive.
- 支持 PNG 自定义 DPI、矢量 PDF、EPS、全格式导出，并保存可复现 GMT 脚本。
- Export PNG with custom DPI, vector PDF, EPS, all formats, and reproducible GMT scripts.
- 支持 macOS 和 Windows 打包分发。
- Build distributable macOS and Windows desktop packages.
- 本地 v1.2.x 开发分支支持按勘探方法分组样式、经纬轴互换、指定测点标注和原生中文图例；这些功能尚未进入公开 `main`。
- The local v1.2.x development branch adds method-based station styling, swapped geographic axes, explicit label selection, and native Chinese legends; these features are not yet on public `main`.

## 正式版下载 / Stable Release

当前 GitHub `main` 与最新公开安装包版本为 **v1.1.3**。本地 `codex/method-colored-stations` 开发分支已推进到 **v1.2.3**，尚未上传；普通用户应从 GitHub Releases 下载公开稳定版。

GitHub `main` and the latest public installer release are **v1.1.3**. The local `codex/method-colored-stations` development branch is **v1.2.3** and has not been published; end users should use the stable GitHub Release.

[打开 GitHub Releases / Open GitHub Releases](https://github.com/SC123667/mt-point-map-gmt/releases)

- macOS Apple Silicon: `.dmg`
- Windows x64: setup installer and portable package
- Windows ARM64: setup installer and portable package

## 图件类型 / Figure Types

- 点位图 / Station map
- 走向图 / Phase-tensor principal-axis or generalized electric-strike map
- 相位张量 / Phase tensor ellipse map
- 感应矢量 / Tipper or induction vector map
- 电阻率和相位曲线 / Apparent-resistivity and phase sounding curve

## 输入数据 / Input Data

### 点位表 / Station Table

推荐 CSV 格式 / Recommended CSV:

```csv
station,lon,lat,line,elevation
A01,101.23,36.45,L1,1850
A02,101.51,36.62,L1,1878
```

支持中文表头 / Chinese headers are supported:

```text
测点 经度 纬度 测线 高程
A01 101.23 36.45 L1 1850
A02 101.51 36.62 L1 1878
```

没有表头也可以导入，软件会根据数值范围自动推断坐标列。  
Tables without headers are also accepted. The app infers coordinate columns from numeric ranges.

### 高斯投影坐标 / Gauss Projected Coordinates

支持野外常见的 3 度带高斯投影米坐标，例如 / Common 3-degree Gauss projected field files are supported:

```text
点号 北向坐标/m 东向坐标/m
线距200 m点距20 m
L3401 38515597.72 4079993.372
L3402 38515597.72 4080013.372
```

类似 `38515597.72` 的数值会在合适情况下按带号前缀高斯坐标处理并自动转经纬度。  
Values such as `38515597.72` are interpreted as belt-prefixed Gauss coordinates when appropriate and converted to longitude/latitude.

### EDI 文件夹 / EDI Folder

通过左侧 `数据 > 导入 EDI 文件夹`（或系统菜单 `文件 > 导入`）选择目录，软件会扫描该目录及所有子目录下的 `.edi` 文件，读取坐标、频率/周期、阻抗张量、Tipper 等可用字段。

Use `Data > Import EDI Folder` in the left workflow menu (or `File > Import`) to scan every `.edi` file in a directory and its subfolders. The parser reads coordinates, frequency/period arrays, impedance tensors, Tipper data, and other available fields.

### 本地地形网格 / Local Terrain Grid

在地形底图模块中可以导入本地 GMT 网格文件 / In the terrain panel, local GMT grid files can be imported:

- `.grd`
- `.nc`

软件会直接调用 GMT `grdgradient` 和 `grdimage` 使用该网格，不需要联网下载地形数据。  
The app uses the selected grid directly with GMT `grdgradient` and `grdimage`, so no online terrain download is required.

## 运行要求 / Requirements

- 需要安装 GMT 6.x，预览和导出图件依赖本机 `gmt` 命令。
- GMT 6.x is required; preview and export rendering depend on the local `gmt` command.
- 桌面程序支持 macOS 和 Windows。
- The desktop app supports macOS and Windows.
- 从源码开发或打包需要 Node.js。
- Node.js is required for development and packaging from source.

软件可以自动检测 GMT，并在支持的平台提供安装/下载入口。没有 GMT 时仍可导入数据和保存 GMT 脚本，但不能生成预览和正式导出图。  
The app can detect GMT and provides installer/download entry points on supported platforms. Without GMT, data import and GMT script saving still work, but preview/export rendering is unavailable.

## 开发运行 / Development

```bash
npm install
npm start
```

## 测试 / Tests

```bash
npm run test:node
```

## 打包 / Build

macOS:

```bash
npm run dist:mac
```

Windows:

```bash
npm run dist:win
```

打包产物输出到 `release/`。  
Release artifacts are written to `release/`.

## 输出文件 / Output

默认输出目录 / Default output directory:

```text
~/Documents/MT点位图制作工具-GMT输出
```

常见输出 / Typical files:

- `mt_point_map.png`
- `mt_point_map.pdf`
- `mt_point_map.eps`
- `mt_point_map.gmt`
- 中间点位文件和地形文件 / intermediate station and terrain files
- 构造线叠加和图例中间文件 / structural-line overlay and legend intermediate files

## 技术栈 / Technology

- Electron 桌面程序 / Electron desktop app
- GMT 命令行制图 / GMT command-line rendering
- Node.js 数据解析 / Node.js data parsing
- Excel 表格导入 / XLSX table import
- EDI 坐标与响应数据解析 / EDI coordinate and response parsing
- 本地 GMT 地形网格支持 / Optional local GMT terrain grids

## GitHub 主题词 / Repository Topics

建议主题词 / Suggested topics:

`magnetotelluric`, `gmt`, `geophysics`, `edi`, `phase-tensor`, `tipper`, `apparent-resistivity`, `earth-science`, `electron`, `mapping`

## 许可证 / License

MIT License. See [LICENSE](LICENSE).
