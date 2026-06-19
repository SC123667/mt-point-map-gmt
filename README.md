# MT点位图制作工具—GMT

面向大地电磁测深野外工作的 GMT 点位图桌面工具。目标是把常见论文点位图流程做成图形界面：导入 TXT/CSV 点位文件，调整符号、标签、经纬网、比例尺、指北针等参数，然后一键预览、导出 PNG/PDF，并保存可复现的 GMT 脚本。

## 当前版本

`v0.1.0`

## 已实现

- 导入 TXT/CSV 点位文件。
- 自动识别测点名、经度、纬度列。
- 自动计算绘图范围并支持手动修改。
- 支持测点标签开关。
- 支持点大小、颜色、形状、边框调整。
- 支持标签字体大小、颜色、偏移量调整。
- 支持经纬网、比例尺、指北针。
- 支持 GMT PNG/PDF 预览与导出。
- 支持保存 GMT 脚本。

## 点位文件格式

推荐使用带表头的 CSV 或空格分隔 TXT：

```text
station,lon,lat,line,elevation
A01,101.23,36.45,L1,1850
A02,101.51,36.62,L1,1878
```

中文表头也支持，例如：

```text
测点 经度 纬度 测线 高程
A01 101.23 36.45 L1 1850
A02 101.51 36.62 L1 1878
```

没有表头时，程序会尝试从数值范围自动判断经纬度列，并自动生成测点名。

## 推荐运行方式：Electron 跨平台版

开发运行：

```bash
npm install
npm start
```

生成 macOS App：

```bash
npm run dist:mac
```

生成 Windows 包需要在 Windows 机器或 CI 上运行：

```bash
npm install
npm run dist:win
```

## Python 原型

仓库里仍保留 Python/Tk 原型，主要作为制图逻辑参考：

```bash
python3 run.py
```

如果你的 macOS 上 Tk 不可用，请使用 Electron 跨平台版。

## 旧版 macOS 原生实验

```bash
python3 scripts/build_mac_app.py
```

默认会生成并复制到：

```text
/Users/cwn/Desktop/所有文件夹/实用app/MT点位图制作工具—GMT.app
```

当前推荐使用 Electron 版作为对外分发版本。

## GMT 依赖

本工具通过调用本机 `gmt` 命令制图。请先安装 GMT 6：

```bash
brew install gmt
```

Electron 分发版会自动检测 GMT。没有安装时，点击软件里的安装按钮会直接下载当前系统对应的 GMT 官方安装包；如果网络不可用或 GitHub 下载失败，会提示具体错误。没有安装 GMT 时，软件仍可导入数据和保存 GMT 脚本，但无法生成预览图或导出正式图片。

## 输出

默认输出到：

```text
~/Documents/MT点位图制作工具—GMT输出
```

- `mt_point_map.png`
- `mt_point_map.pdf`
- `mt_point_map.gmt`
- 中间数据文件
