# MTpy-v2 analysis (v1.27.0)

## Scientific authority

This feature directly uses **MTpy-v2 2.1.4**, without copying its formulae into JavaScript.
Original EDI files are read by `mtpy.MT.read` (mt-metadata). `MT.interpolate`,
`Z.phase_tensor`, `Z.estimate_dimensionality`, and `Tipper` provide all scientific
values. Maps are rendered by the installed, unmodified
`mtpy.imaging.plot_phase_tensor_maps.PlotPhaseTensorMaps` class using Matplotlib.
The existing `electron/mt.js` and GMT phase-tensor/tipper plot code are not used.
The two old toolbar entries now open the MTpy workspace; main-process guards
prevent their old GMT exports. Station maps and response curves are unchanged.

## Workflow (v1.27.0)

Import original EDI files in the main workspace. Select **相位张量** or **感应矢量**;
**MTpy 参数** opens the existing workbench sidebar. There is no separate MTpy window.
Edit periods, components, convention, symbols, grid layout, dimensionality thresholds
and colorbar controls there. Use the existing terrain, contours, structures, labels and
map element panels; each render reads the current settings. Use the existing preview,
PNG/PDF/EPS/AI export and cancellation actions. Save/open the ordinary `.mtgmt` project
to preserve MTpy options together with all GMT settings.

The original fast-preview policy may reduce terrain resolution and PNG size; final
exports honor the selected terrain resolution and PNG DPI. MT figures share linear
longitude/latitude axes (unmodified MTpy conventions); GMT backgrounds are explicitly
rendered in that coordinate system for exact alignment. Arbitrary map projections,
axis swapping and interactive geographic picking on the multi-panel canvas are not
provided by this MTpy adapter. Edit geographic features through the original layer
panels or a standard map, then render the MTpy layout.

Real/Imag arrow legends stay inside the upper-right corner of each relevant subplot.
The phase-tensor colorbar is a separate
vector artifact: shared/individual/hidden, top/bottom/left/right, centered/start/end aligned,
with gap in millimetres. For horizontal bars start/end mean left/right; for vertical bars
they mean top/bottom and the UI updates its labels. Tipper-only plots have no phase colorbar.

Outputs live in the normal workspace preview/export region directories, under unique
`MTpy-*` run folders. They include individual maps, combined PNG/vector PDF, scientific
CSV, original EDI hashes, MTpy dependency versions, omissions, exact GMT/workbench
settings and layout metadata. Native AI retains editable MT/structure paths and text;
terrain is raster. AI Western characters are explicitly verified as Times New Roman.
Poppler generates previews and SVG/EPS derivatives; it does not rasterize the vector PDF.

## Data policy

Exact source periods are retained. Other periods use MTpy's `slinear` interpolation
in period coordinates, only within source coverage and the chosen maximum gap.
No endpoint substitution or extrapolation. Singular/ill-conditioned real impedance
matrices and nonfinite tensors are not classified. MTpy's default classification
thresholds (5 degrees, 0.1) are adjustable. Threshold classification does not
incorporate parameter uncertainties as a confidence test; error columns remain
available for scientific assessment. MTpy's own ellipse and arrow conventions
are retained. Tipper azimuth columns are MTpy native angles before the selected
plot direction reversal. MTpy online basemaps are disabled. Optional GMT terrain and
structural layers reuse the main application pipeline, configuration and cache.
Original EDI files must remain available; coordinate-only tables or precomputed
JavaScript parameters are not substituted as scientific input.

## Runtime

On this Mac the dedicated environment is outside the application:

`~/Library/Application Support/MTPointMapGMT/mtpy-v2.1.4/bin/python`

It is isolated from the system Python. The application includes the worker using
`asarUnpack` and finds this stable runtime location. A copied app on another
computer requires its own environment; this is not a self-contained Python bundle.
`MT_GMT_MTPY_PYTHON` can explicitly select a compatible Python executable.

Example setup (macOS):

```sh
python3.11 -m venv "$HOME/Library/Application Support/MTPointMapGMT/mtpy-v2.1.4"
"$HOME/Library/Application Support/MTPointMapGMT/mtpy-v2.1.4/bin/python" -m pip install mtpy-v2==2.1.4
```

Windows default runtime: `%LOCALAPPDATA%/MTPointMapGMT/mtpy-v2.1.4/Scripts/python.exe`.
No missing-runtime or scientific failure falls back to the old maths.

Upstream: https://github.com/MTgeophysics/mtpy-v2 (MIT).
Scientific citation: https://doi.org/10.21105/joss.01358

## Validation

Run `tests/mtpy_backend_test.py` in the dedicated Python environment, then
`node tests/mtpy_export.test.js`. The Electron integration check exercises the
actual UI/IPC with original EDI input, vector PDF output, and installed-app worker
resolution. Direct AI validation also opens the generated figure in Illustrator,
records vector object counts and saves through the app's existing bridge.

MTpy 2.1.4 compatibility: arrow-only maps use its existing `wedges` branch with
`plot_pt=False`, because its `ellipses` branch leaves a coordinate variable unset
in that mode. Both branches call the same official arrow plotting function; no
scientific computation or arrow geometry has been rewritten. EPS does not support
partial transparency; PDF/SVG/AI should be used to preserve that appearance.

UI policy: keep controls, units, actionable status and errors. Explanatory prose
belongs in this document rather than the analysis window.


## v1.28.0 可读性与末行排版

- 椭圆大小和箭头比例分别控制 MTpy 官方绘图属性。新图默认 0.70 / 0.85；旧工程的统一 symbolScale 迁移为其 0.70 / 0.85 倍，明确保存后使用新独立值。改变显示比例不改变阻抗、相位张量、Tipper 数值或维性结果。
- 末行对齐只移动未排满的最后一行，不改变单图大小、数据坐标或共用色标设置。默认居中。
- 构造文字从 GMT 背景分离，按 MTpy 实际 artist 包围范围避让。长名称自动换行，点位及构造名称可在附近移位并添加细引线；引线在 MT 符号下方、文字在上方；手工固定的标注保留位置。无法找到空间的名称在逐周期“标注_*s.json”记录中列出，不修改源名称或源坐标。文字层保留矢量和可编辑文字。
- 柔和底图将主界面阴影强度乘以 0.7，未标注的次要构造线宽乘以 0.8、描边不透明度上限 70%；命名主构造、缝合带、点符号与面填色保留。选择“原样”直接使用原设置。


## v1.28.2 共用标注与定量箭头标尺

- 同一地图范围下，先合并所有周期的实际 MTpy 障碍物，再求一次标注布局。各子图复用相同文字与引线 PDF，保持源名称、编号和地理锚点；所有逐周期标注 JSON 的 labels/leaders 一致。
- 右上角图例以官方 Tipper 和 `_get_tipper_patch` 绘制实部/虚部参考箭头，默认幅值 0.5。若超出图宽的 22%，参考幅值连续减半并显示实际值；数据箭头不变。官方箭头长度不包括箭头头部，参考键沿用同一规则。
- `arrowReference` 记录幅值、分量、杆长和含箭头头部的可见长度，全部以物理点计量；相位张量单独模式不显示箭头标尺。方向约定仍存于设置，由作者在论文图注中说明。


## v1.28.3 AI 独立对象与地理比例尺

AI 导出时，将同一批官方 Matplotlib artist 按椭圆、实部箭头、虚部箭头、坐标、幅值图例分别保存透明矢量页，复用组图的实际裁剪、位移、色标和标题变换。Illustrator 按周期建立图层，并按用途建立子图层。地形仍是独立影像；其余矢量与文字保留。分类图层中箭头位于椭圆上方，数据坐标、形状和数值不变。

拆除无必要的编组和完整包围对象的矩形剪切蒙版；跨边界对象保留逐对象裁剪，透明编组与复合路径孔洞保留。仅对相邻、路径节点和裁剪完全相同的填色/描边进行合并，保证每支箭头是一个独立对象。AI-layer-proof.json 的各周期椭圆/箭头对象数必须与官方 artist 数完全一致。tests/mtpy_ai_editability.cjs 在保存后的 AI 副本中逐周期验证单个路径选择、移动不影响邻居、改色和文字编辑，再丢弃测试修改。

GMT 底图使用 -JX宽度cd/高度cd，两个坐标轴都明确为经纬度。普通 -JX宽度c/高度c 会把 +w50k 误作 50 个直角坐标单位，造成超长且单位缺失的比例尺。经纬度位置仍为线性映射，现由 GMT 根据地理坐标生成真实公里标尺。
