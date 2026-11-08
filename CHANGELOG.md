# Changelog

## v1.33.2 — 2026-11-08

- 整理 macOS Apple Silicon / Intel 和 Windows x64 / ARM64 源码构建步骤，说明锁定依赖、安装版/便携版产物、签名以及 GMT、MTpy 和 Illustrator 运行要求。
- 更新 README 源码版本和构建入口，集中展示历史版本记录。
- 完善依赖链接与输出目录的 Git 忽略规则，准备现有 GitHub 仓库的累积源码更新。

## v1.33.1 — 2026-11-05

- 修复关闭“名称避让”时“隐藏未命名标签”失效的问题。勾选后仅隐藏未命名或文件编号文字，构造线和具名标注保留。MTpy 组图也读取工程的未命名标签设置。
- 点位图增加独立的高程色标开关，新旧工程默认关闭。启用后按当前地形色带和高程范围在图框下方绘制，可随工程保存和撤销。

## v1.33.0 — 2026-11-03

- 高程上限和刻度间隔默认按当前图幅内 EDI 测点高程自动设置，并以已准备的测区地形峰值校核，避免测点之间的山峰超出色带。
- 上限向上取整，间隔从易读的整数序列选择，优先约 6–8 个色阶；无高程时保留现有范围，不自动下载地形。
- 手动修改上限或间隔自动切换为手动，开关与数值随工程保存、支持撤销。F 分级配色、普通地图和 MTpy 地形背景共用结果；高程色标仍仅在区域底图显示。
- 地形峰值读取使用短路径、异步执行和缓存，仅统计当前图幅；预览优先复用已缓存的正式分辨率地形以保持范围一致。

## v1.32.1 — 2026-11-03

- 将新工作台默认地形色带设为 F · 分级设色，默认每 500 m 一级；保留已保存工程的明确配色。
- 配色菜单、可调参数和高程色标显示规则不变。

## v1.32.0 — 2026-11-03

- 地形色带菜单增加 B · 增强绿褐、C · 经典分层地形、F · 分级设色，默认 0–3500 m 时精确复现已选预览。
- B / C 连续渐变，F 按高程色标刻度间隔分级，默认 500 m；修改上下限时覆盖完整范围。
- 沿用工程保存、撤销、普通地图自动预览及 MTpy 手动预览；不覆盖当前工程配色。
- 普通地图与 MTpy 地形背景、PNG / PDF / EPS / AI 编辑包共用同一色带，高程色标仍仅在区域底图显示。

## v1.31.1 — 2026-11-03

- 高程色标仅在“区域底图”启用，其他图件无论旧工程是否勾选高程色标均不显示；底图配色与高程范围保留。
- MTpy 内部 GMT 背景明确关闭高程色标，单图、组图和 AI 不再附加高程色标或对应留白，保留相位张量自身色标。
- 同步界面说明，回归区域底图 / 点位图、真实相位张量预览与分层导出。

## v1.31.0 — 2026-11-03

- 相位张量“椭圆着色量”增加最大相位 φmax 与 Φ₂ 等效相位（°），保留 β / φmin。
- Φ₂ = √det(Φ)，等效相位为 arctan(Φ₂) × 180/π；图中注明定义，负行列式标记无效，不取绝对值、不填 0°。
- 三种相位共用色带与色标范围；参数随工程保存，支持撤销，保持手动预览。
- 同步单图、组图、PDF/PNG/EPS/SVG 与 AI 编辑包；记录 Φ₂ 原值、等效相位及无效原因。
- 后台验证真实 EDI、实际椭圆颜色、原始数据和几何不变；测试不启动 Illustrator。

## v1.30.0 — 2026-11-03

- 新增高程色标，默认放在地图正下方、图框外居中；多周期组图在整组下方使用一条共用色标。
- “地形底图”中可直接修改范围、刻度、米/千米、尺寸、字号、对齐和间距，随工程保存并支持撤销。
- 底图和色标共用同一 CPT；范围默认 0–3500 m、刻度 500 m，可按区域修改，原始高程不变。
- 同步 PNG、PDF、EPS 与 AI 导出；MTpy AI 增加独立高程色标图层。
- 真实 81 测点地图验证图外位置、单位切换、隐藏、工程恢复和撤销；MTpy 两周期检查共用色标，保持原手动预览行为。

## v1.29.1 — 2026-11-03

- 修复 SRTM 在长中文缓存路径中生成阴影失败：网格转换与阴影处理均在区域缓存目录内使用相对输入 / 输出文件名，避免 GMT 6.7 的长路径读取错误。
- 同步修复普通地形准备及快速预览流程的裁剪 / 阴影路径，保留已下载瓦片与已有高程网格。
- 绘图阶段为仍然过长的相对网格 / 阴影路径建立短文件名入口，防止任务成功但底图空白；PDF 验证包含实际地形影像。
- GMT 返回成功但未生成有效文件时保留具体诊断，拒绝发布空文件；不再将路径错误误提示为分辨率问题。
- 新增长 UTF-8 路径下真实 GMT 回归，覆盖完整 SRTM 转换、已有网格续做阴影和零退出码空输出；使用当前 81 个测点工程验证 3 秒 / 15 秒地形准备和预览。

## v1.29.0 — 2026-11-03

- 将论文参考风格落实为可编辑的默认参数：黑白交替边框、低饱和地形、较弱阴影、构造线与填色倍率；不新增风格预设。
- 在原有面板开放边框宽度、字体、字号、MTpy 组图物理宽度、周期和编号位置、椭圆描边，以及 β / φmin 着色和色标范围；随工程保存并支持撤销。
- 普通地图使用 GMT fancy 边框；MTpy 以独立矢量对象绘制分段边框。保留 MTpy 手动更新预览和旧工程明确保存的设置。
- 同步 PDF、PNG 和分层 AI 的组图尺寸；AI 支持所选 Times New Roman / Arial，保留独立椭圆、箭头和文字。MTpy 官方计算与原始 EDI 不变。
- 验证范围与备份说明见 docs/PAPER_PARAMETERS.md。

## v1.28.5 — 2026-10-14

- 修复文件选择窗口的归属与重入：导入和保存对话框统一绑定发起操作的主窗口，同一时间只打开一个原生文件窗口。
- “地点与构造”和本地构造库从选择文件 / 文件夹开始禁用重复导入；取消、原生窗口报错或数据解析失败后自动恢复按钮，可直接重试。
- 回归覆盖反复打开 / 取消、文件夹浏览、真实 GeoJSON 与构造库导入，以及后台绘图窗口创建、关闭期间的文件选择。

## v1.28.4 — 2026-09-30

- 优化海岸与水体：默认用浅蓝灰色填充海面，关闭海岸及河湖轮廓描线，减少三角洲与宽河道的碎线干扰；保留当前地形色带、阴影强度和分辨率。
- 在原“地形底图”面板增加海岸线、河湖边界、海面填色和海面颜色，支持独立开关、工程保存与撤销；海岸与河湖使用不同粗细，区域图过滤极小水体轮廓。
- 区域图、点位图及 MTpy 叠加底图共用这些设置，MTpy 继续手动更新预览；PNG、PDF、EPS 与原生 AI 同步输出，海面填色和边界保留矢量。

## v1.28.3 — 2026-09-21

- MTpy AI 按周期分层，分别组织椭圆、实部箭头、虚部箭头、坐标、幅值图例、构造、地形和标注；拆开无必要的嵌套编组，保留越界对象的必要裁剪。
- 将 PDF 导入后分离但完全重合的箭头填色和描边恢复为同一对象，单支箭头可整体选择、移动和修改；新增保存后重开 AI 的独立选择、移动、改色与文字编辑验证。
- 修复 GMT 底图比例尺：线性经纬度的两个轴均明确使用地理坐标，公里不再被解释为普通 XY 单位，保留原比例尺开关和位置。
- 参考箭头的幅值直接标在各自的 Real / Imag 后方，不再悬空显示一个共用数字。
- 修复 MTpy 大结果跨进程分块读取时中文路径可能乱码的问题；使用连续 UTF-8 解码。科学计算、统一矿床标注及手动预览行为保持不变。

## v1.28.2 — 2026-09-21

- 多周期图共用一套构造标注布局，联合避让各周期的椭圆、箭头及图例；雄村Ⅰ—Ⅲ等名称、位置和引线在全部子图中一致，原编号与地理锚点不变。
- 标注引线适度加深并保留白色衬边，不添加箭头尖，避免与感应矢量混淆。
- 子图右上角增加带数值的感应箭头幅值标尺，常规设置为 0.5；参考箭头调用 MTpy 官方绘图函数，与数据箭头保持相同缩放及箭头头部尺寸。方向约定由正文图注说明，图内不追加说明文字。
- 保留 v1.28.1 的手动预览流程、GMT 图层、末行对齐、共用色标及可编辑 AI 导出。

## v1.28.1 — 2026-09-21

- MTpy 相位张量与感应矢量改为手动预览：参数修改只保留待绘制状态，点击“更新预览”后统一绘制。
- 同时拦截 MTpy 共用地形、标题、图例等设置的自动预览；绘制期间继续修改不会自动排队重绘，旧定时器不会触发 MTpy。
- 画布新增常驻“更新预览”按钮，显示“手动预览”和待绘制提示；其它图件继续沿用原有自动预览行为。
- 增加真实 Electron 界面事件回归测试，验证批量修改、明确提交、绘制中编辑、重复点击及图件切换。

## v1.28.0 — 2026-09-21

- 构造标注独立叠加在 MT 图件上层，增加白色描边；按各周期实际椭圆、箭头及图例位置避让，点标注必要时使用细引线。
- 椭圆大小与箭头比例独立调整；默认分别为原统一比例的 70% 和 85%，各周期使用同一比例，官方 MTpy 科学计算保持不变。
- 增加末行左/中/右对齐；五周期组图可采用 2+2+1 居中，所有图幅保持同样尺寸。
- 修复 Illustrator 导入混合来源 PDF 时逐字符字体访问的 MRAP 异常；统一文本框整体设字，混合字体保留分段样式，再逐字验证 Times New Roman。
- 增加柔和/原样底图层次，柔和模式减弱阴影及次要构造线，保留原数据和主工作台设置。新参数随工程保存，预览和矢量 AI 导出一致。

## v1.27.0 — 2026-09-17

- 修复 GMT 6.7 在较长中文缓存路径下生成地形/阴影失败的问题：使用缓存目录内的相对输出文件名，并校验文件确已生成。
- MTpy 融入主工作台：参数在原侧栏编辑，图件在原画布预览，直接使用原预览、导出、取消和工程保存流程；移除独立 MTpy 窗口。
- 实时复用原地形分辨率、色带、阴影强度、缓存及数据源、地图范围、构造/断层/等高线样式、标题、测站名、网格、比例尺、指北针与 PNG 导出精度；预览沿用原快速预览策略，正式导出使用所选精度。
- 实部/虚部箭头图例固定在各子图内右上角，与相位张量色标分离。色标支持共用/独立/隐藏、四边位置、居中或两端对齐，以及毫米级间距。
- 紧凑与分散排版、子图间距、水平经纬度和原生 AI 保留；AI 西文仍统一 Times New Roman。MT 计算和符号绘制继续调用未修改的官方 MTpy。

## v1.26.0 — 2026-09-17

- MTpy 图件可叠加主工作台配置的 GMT 地形、断层和构造图层；使用一致的经纬度范围和线性投影精确叠加，构造线、相位张量和箭头保留矢量。
- 增加共用/独立图例及上、下、左、右位置。新增紧凑拼图与分散排版，图间距按毫米调整；紧凑共用图例模式可零间距拼接，仅在外侧显示经纬度。
- 经纬度刻度采用度数及 E/W、N/S 方向标记，全部水平显示。AI 导出自动使用 Times New Roman 西文字体，保留中文字体和原生可编辑路径。
- 保存分析设置时同时保存 GMT 图层快照。真实 EDI、GMT 本地地形、构造线、组图和单图原生 AI 已通过运行验证。

## v1.25.0 — 2026-09-17

- 新增 MTpy 维性与多周期分析窗口，原始 EDI 由 MTpy-v2 2.1.4 直接读取，计算和椭圆、箭头绘制均调用官方接口。原相位张量及感应矢量入口改为打开新窗口，停止使用旧 GMT 算法导出。
- 支持最多 12 个周期、椭圆与实部/虚部感应箭头叠加、Parkinson/Wiese 约定、统一图幅和色标、多周期组图、参数与误差表及来源校验记录。禁止范围外外推，缺测和无效张量明确记录。
- 直接导出单周期及组图原生 AI，通过 Illustrator 保存矢量 PDF；保留 AI 编辑包及原有替换备份机制。分析设置可单独保存/恢复。
- 本机使用独立 Python 环境，应用携带解包后的 Python worker；其他电脑需要配置对应环境。MTpy 图件使用独立离线地图，未叠加原 GMT 地形/构造图层。

## v1.24.0 — 2026-09-17

- 新增参考图曲线样式：红蓝实心点、图内测点名与 XY/YX 图例、虚线网格、向内刻度和紧凑组图。保留单测点、横竖排和同轴叠加，旧工程可一键应用。
- 按用户要求默认保留误差棒；连线独立控制。可选择原始有符号相位或原 0–180° 折叠显示，不修改 EDI、阻抗和误差计算。
- AI 编辑版响应图西文统一为 Times New Roman，保留粗体/斜体与中文字体回退；缺字体时明确提示。

## v1.23.0 — 2026-09-16

- 新增“EM3DVP 高程导出”：按指定经纬度和分辨率自动匹配地形底图缓存，缺少时复用相同下载源和后台准备流程，无需手动选择 GRD。
- 导出无表头经度、纬度、高程米三列 XYZ，保存到全局目录的“导出高程/EM3DVP”，按区域和时间分类，附来源说明，重复导出保留独立结果。
- 支持原始格点抽样、单位转换、缺测检查/明确跳过、取消及工程保存。磁盘断开时提示接入；不修改当前图幅或 EM3DVP 源码。
- 当前完成源码、合成 GRD/GMT 和隐藏界面验证；外置盘真实缓存/下载及 EM3DVP 导入待接盘后验证，本版尚未打包安装或上传。

## v1.22.0 — 2026-09-16

- 新增“曲线组图与排版”：多选 EDI 测点，默认组图方式为独立面板；每格上视电阻率、下相位。保留旧工程单测点模式。
- 支持全部横排、全部竖排、每行/每列指定数量；拖动或上移/下移调整顺序，设置图格宽度、行列间距、字号、统一/独立坐标范围、公共图例和弱网格。选择与排版随工程保存并支持撤销。
- 新增同轴叠加模式，颜色区分测点，XY 空心方块实线、YX 空心圆虚线；图外列出测点图例。独立面板最多 100 站、叠加最多 20 站；过大的页面/像素量明确提示。
- 整张组图或叠加图可导出 PNG、PDF、EPS、直接 AI 及 AI 编辑包。中文测点名保留可编辑 SVG 文字，响应曲线和误差棒保持矢量，不修改或平滑原始响应。GMT 运算保留后台 worker。

## v1.21.0 — 2026-09-14

- 响应曲线增加画布上方常驻测点选择、上一个/下一个与分量说明；显示当前预览测点和待更新测点，避免快速切换时认错曲线。隐藏对此类图件无效的单周期控件。
- 默认论文曲线样式：XY 红色空心方块、YX 蓝色空心圆，细连接线和误差棒、图外分量图例、白底细边框和可开关的弱网格；(a) 视电阻率、(b) 相位，使用共享周期轴与紧凑排版。
- 周期及电阻率刻度用 10 的幂表示，标出 Period (s)、Apparent resistivity (Ω m)、Phase (degree)，字号按 16 cm 图宽设为 9–11 pt，外围保留 2 mm 空白。标题关闭不隐藏分量图例。
- 原曲线和误差棒数据不变，沿用现有相位与误差算法；新样式同步 PNG/PDF/EPS/AI 编辑包。参考依据见 docs/RESPONSE_CURVE_STYLE.md。

## v1.20.0 — 2026-09-14

- EDI 响应曲线面板新增“导出当前曲线 AI（.ai）”和“AI 编辑包”，导出所选测点的视电阻率与相位两幅曲线。直接 AI 需本机 Illustrator，编辑包可在其他电脑运行脚本。
- 响应曲线导出独立于地图的地形、等高线、比例尺、指北针、构造与图例设置；保留所选测点名称、自定义中英文标题及标题开关。
- AI 编辑包使用“响应曲线与坐标轴”图层，曲线、数据符号、误差棒与坐标轴保留 GMT 矢量，标题可编辑；不改变 EDI 阻抗和 MT 数学。

## v1.19.0 — 2026-09-13

- 局部放大图支持在主图内拖动位置：拖动时显示位置框，松手后更新，Esc 可取消；一次拖动对应一步撤销。缩放和平移预览后仍可准确定位。
- 区域框面板新增水平/垂直位置百分比，以及四角、居中预设；位置随工程保存，旧工程仍默认左下角。
- PNG、PDF、EPS 和 AI 编辑包同步新位置，保留原框选范围、内容与放大比例；绘图中、预览过期或正在选择/编辑地理要素时暂停拖动。

## v1.18.0 — 2026-09-13

- 区域框新增“显示局部放大图（左下角）”，可调整尺寸和边框；勾选新框时替换当前放大图，隐藏或取消后移除。开关、大小及边框随工程保存并支持撤销。
- 按主图真实 GMT 投影裁取框内已绘制内容，地形、构造、测点分类、符号、文字及透明度一同放大；无需另行查询数据或下载地形。
- PNG 预览、PDF、EPS、直接 AI 及编辑包均包含局部放大图。PDF 使用矢量页面裁剪与复用，AI 标注保留独立的局部放大标注层，原图文字在放大窗口下被遮挡。
- 框选区须完整位于主图且小于放大图可用尺寸；绘制节点或选择测点时阻止将放大图点击误当主图坐标。地形与 PNG 本身仍是影像，放大不会产生额外地形细节。

## v1.17.0 — 2026-09-13

- 新增顶部“撤销”按钮和编辑菜单，支持 Command+Z / Ctrl+Z，最多保留当前会话最近 20 步工程修改；涵盖参数、区域框、测点分类、导入和图层修改，撤销后自动更新预览。
- 输入框保留文字原生撤销；连续输入合并为一步。打开工程会清空撤销历史；保存/导出和缓存文件操作不回滚，测点及 EDI 原始数组共享引用，避免重复复制大数据。
- 修复 AI 图例 BMT/LMT 的右括号错误换行：按浏览器真实行位置生成可编辑文字，不再用 Canvas 字宽猜测换行；保留真正的多行和中英文字体回退。旧 AI 文件需要重新导出。

## v1.16.0 — 2026-09-13

- 新增“区域框”：按东西南北经纬度输入或在预览中拖拽创建，支持移动、四角缩放、命名、显示/隐藏与删除；独立设置边框颜色、线宽、虚实、不透明度和内部填充。
- 新增“测点分类”：地图点选/框选、列表搜索与分页多选，手动标记长周期 LMT、宽频 BMT、AMT；各类符号、大小、填色与边框可独立设置，图例只显示图幅内出现的类别。
- 区域框几何与测点分类随工程保存，预览和矢量导出一致；未分类测点沿用默认样式，关闭分类后恢复原分组。原始坐标和 MT 响应不变。
- 选择操作沿用 GMT 后台坐标投影，支持投影后的地图及跨日期变更线边界；列表分页避免大量测点同时生成界面节点。

## v1.15.1 — 2026-09-13

- 直接 AI 导出现在更新原文件名：先生成并验证新文件，备份旧文件后替换，失败保留旧导出；备份位于全局目录/版本备份/导出图件。手动 AI 编辑包仍保留另存规则。
- 预览绘制期间点击导出会排队，在预览结束后执行；重复点击正在执行的导出会明确提示，取消绘图同时清除待执行导出。
- 增加重复导出 PNG/PDF/EPS 内容刷新、AI 文件替换与备份、工作台实际点击及队列取消回归。

## v1.15.0 — 2026-09-12

- 构造线新增 0–100% 不透明度，支持逐对象和本地构造库分类设置；区域填色不透明度仍独立保留。
- 图例默认同步图中线条，可单独设置图例线条不透明度，并随工程保存；图例文字不受影响。
- 新增“区分构造类别线型”，通过颜色、线宽和虚实区分缝合带、普通断层、正断层、逆冲断层及构造边界，保留矿床符号与原始几何。
- 修复渲染阶段覆盖用户线型的问题；图例按实际线宽、不透明度和虚线绘制，同类别不同符号或样式分别列出。
- 增加隐藏工作台操作、工程恢复、真实 GMT 和 AI 编辑包矢量属性回归。

## v1.14.1 — 2026-09-11

- 修复工作台“导出图件”面板未显示“直接导出 AI（.ai）”及“AI 编辑包”：将现有按钮移入实际面板，保留原点击逻辑。
- 直接 AI 按钮置于首位并突出显示，补充 Illustrator 依赖说明；“全部格式”明确标为 PNG + PDF + EPS。
- 补充隐藏 Electron 实际面板回归：从顶部、侧栏和搜索命令打开，检查不同窗口尺寸下按钮归属、可见性和点击位置，再执行真实 AI 导出。


## v1.14.0 — 2026-09-11

- 新增“直接导出 AI（.ai）”：自动调用本机 Illustrator，将 GMT 矢量底图、完整文字与图例保存为原生分层 AI；保留手动 AI 编辑包。
- AI 文件归入全局目录的区域导出文件夹，同名文件追加时间标记，不覆盖已有 AI。转换中间包单独归入临时文件，失败时提供其位置。
- 后台调用不主动激活 Illustrator，转换后关闭本次文档并恢复原文档及导入设置。支持协作式取消，不终止用户 Illustrator 进程。
- 增加 macOS 自动化用途说明及签名权限；Windows COM 桥接已实现，尚未实机验证。缺少 Illustrator 或自动化权限时给出明确提示。


## v1.13.0 — 2026-09-11

- 新增 AI 编辑包：GMT 矢量底图、完整文字 SVG 与 Illustrator 分层脚本；名称、图例可修改文字，构造线与符号可独立编辑，保留必要裁剪。地形影像独立成层。
- 编辑包文字不加白色描边，避免 Illustrator 将文字拆成重复对象；普通 PDF/PNG 外观保持原设置。
- PDF 转 EPS 优先使用 pdftocairo，保留前景矢量；未安装该工具且 PDF 含透明内容时明确停止 EPS 转换，防止 Ghostscript 将整页变成图片。PDF 导出不再依赖 EPS 转换成功。
- EPS 同时规范 BoundingBox 与 HiResBoundingBox，兼容 Cairo 只声明整数边界的文件。
- 更正此前可编辑性说明：v1.12.0 验证了 EPS 画板，未发现透明度导致整页栅格化；其 EPS 不应当作可独立编辑的矢量成果。

## v1.12.0 — 2026-09-11

- 图例新增图外下方两列排版，作为新建工程默认位置；按实际内容扩展画板，保存和打开工程保留位置，旧工程原位置不变。
- 修复 PDF 转 EPS 时被裁剪路径造成的巨大 DSC 画板声明，按最终单页 PDF 尺寸导出；底图和文字保留矢量合成。
- 地点与构造支持文字加粗和可调白色描边宽度；纯文字对象不再生成虚假的点符号图例，五角星图例与地图对应。
- 论文样式增加 2 mm 外边距；按 GMT 实际比例尺刻度位置补充缺失中点数字，不改变地理长度。
- 增加图外双语图例、高 DPI、页面尺寸、EPS 回读、标注样式和真实论文工程导出验证。

## v1.11.1 — 2026-09-11

- 修复高分辨率地形图导出 ERR_INVALID_URL：原生文字与图例叠加改为本地临时 HTML 和图片文件，成功或失败均回收临时文件，保留矢量 PDF 合成。
- 地点名称冲突时先尝试其他方位，避免驱龙与甲玛等邻近地点被过早隐藏；保留地理坐标、手动锚点和避让开关。
- 长英文构造名称根据旋转后的文字高度增加图框避让距离，修复班公湖—怒江缝合带英文名称在图幅上缘消失。
- 增加大 PNG、临时文件清理、邻近点位、英文长名称及真实工程双语 PNG/PDF/EPS 的后台回归验证。

## v1.11.0 — 2026-09-09

- 重排全部 23 个功能入口：左侧分组导航、中央画布、右侧常驻参数面板。面板可展开加宽，更新预览后保持打开。
- 增加 ⌘/Ctrl + K 功能搜索，原生设置菜单与侧栏共用目录；名称与语言、目录与缓存、导出图件均有独立入口。
- 构造编辑拆成“对象 / 样式 / 来源与锚点”，补全译名直接进入对应对象；复杂参数折叠，常驻操作说明集中到使用帮助。
- 统一控件尺寸、字体、间距与色彩，移除大面积装饰、模糊和重复标题；保留原有控件及事件绑定、工程格式、后台 worker 和 GMT 6.7 引擎支持。
- 新增隐藏窗口 UI 集成验证入口，覆盖窗口尺寸、功能搜索、构造编辑、工程恢复及真实 GMT 预览和导出。

## v1.10.0 — 2026-09-09

- 默认推荐 GMT 6.7：macOS 通过 Homebrew 安装 GMT 与 Ghostscript，并核对 6.7 版本；Windows 默认官方 6.7.0 x64 安装器。
- 新增左下角 GMT 设置：自动优先选择 6.7、手动选择旧版或指定程序路径，后台检测版本，切换前检查活动绘图和地形任务。
- 引擎设置、安装下载和日志继续归入全局目录；导出记录实际引擎版本与路径，脚本注明 GMT 版本，工程保存引擎信息。
- 增加引擎选择与安装目标测试，以及不抢焦点的真实 GMT 多地区、多投影、双语和 MT 导出验证入口。保留 GMT 6.5 回退，不更改 MT 数学与 worker 边界。

## v1.9.0 — 2026-09-09

- 新增“论文构造地形图”和“论文浅灰底图”预设：低饱和度地形、中性弱阴影、细图框与较短比例尺，构造按类别采用主次线宽与有限配色。所选高程分辨率与原始几何不变。
- 构造名称按真实投影和图幅尺寸沿线排布，自动去重、避让、限制密度并避开图框；默认不印制未命名对象、文件名和线段编号，保留全部构造几何与来源。
- 中英文设置继续独立保存；应用论文预设时，原始名称模式转为统一中文，已有中文/英文选择保持。原生文字、构造线与等高线继续以矢量导出。
- 增加名称排布开关、遗漏原因报告及投影、重复、边缘、手动锚点和工程恢复回归测试。

## v1.8.1 — 2026-09-09

- 发布 v1.2.0–v1.8.0 累积功能：区域底图、可编辑矢量导出、地形加速、构造编辑、双语名称与本地构造库自动叠加。
- 修复 macOS 工作区写死开发者外接盘的问题；新用户默认使用自己的 Documents/GMT工作区，支持 MT_GMT_WORKSPACE 与目录链接，外接盘断开时不静默回退。
- 增加可复现的 macOS ARM64 与 Windows x64/ARM64 发布打包脚本，更新安装、数据来源和验证边界说明。
- Public cumulative release with a portable per-user workspace; custom external workspaces remain supported.

## v1.8.0 — 2026-09-08

- 新增本地构造库：文件夹复制与 SHA-256 校验、GMT/DAT/BLN/GeoJSON/SHP/KML 解析、GB18030 中文处理、重复文件/几何去重、背景增量空间索引。
- 预览、PNG/PDF/EPS 导出和 GMT 脚本按图幅自动匹配构造；相交线段裁剪，跨图幅长线不遗漏，多边形孔洞与跨日期变更线回归验证。
- “图层 → 本地构造库”提供叠加开关、类别/来源选择、颜色、线宽、名称开关与当前范围查询；支持转为可编辑对象，沿用双语名称和节点编辑。
- 全局缓存分类保存原始文件、标准化数据、空间索引、复制校验和历史文件；保留原目录。工程保存配置，不累积自动查询结果。
- 修复关闭全部图层后残留旧 GeoJSON/来源输出，以及取消绘图延迟计时器可能影响后续任务的问题。
- 新增 local_structures worker/几何/缓存回归；MT 数学和地形分辨率逻辑保持原有实现。


All notable changes to this project are recorded in this file.

## v1.7.0 — 2026-09-07

- 新增地图直接绘制构造线、闭合区域；支持节点拖动、在线段旁插入节点、删除节点、撤销与取消，多段线、多面和孔洞保持独立几何。使用后台 GMT 正反投影，支持画布缩放、平移与交换坐标轴。
- 新增统一中文/英文和完整名称/简称/名称加简称，保留原始名称、双语字段及用户换行。来源双语字段优先，常用地名/构造名由离线词表整理；缺少译名的可见标签明确列入待补全，不混用原文。
- 双语名称、类别图例译名、语言设置和完整几何随工程保存；GeoJSON 保留对象名称与几何，配套样式 JSON 保留语言设置；用户修订保存于全局名称词典，再次导入同一来源对象时复用。
- 新增公开构造联合查询、形状筛选和中英文/简称检索；结果明确区分实际线、区域与地点。手工描绘/调整记录在来源属性中。
- 自动图例包含自定义构造类别，并跟随绘图语言；修复英文图例与原生标注同时导出时的重复图例及虚线图例颜色。
- 增加名称持久化、GeoJSON 往返、真实 GMT 正反投影测试；真实应用验证画线、画面、缩放拖点、撤销、源数据简称查询、中英文 PDF/EPS 和工程恢复。Windows 验证界面布局，未做实机运行。

## v1.6.0 — 2026-09-07

- 新增“图层 → 地点与构造”：按经纬度添加城市、地点、断层线、缝合带和闭合研究区域；支持 Excel 多行粘贴、GeoJSON、SHP/ZIP、GMT/XY 和地点表导入。
- 名称、简称、自定义多行文字、字体、字号、颜色、白色描边、偏移、旋转及手动标注锚点可编辑；类别统一样式与单对象覆盖、图层显隐、线型、符号、区域填色及透明度随 `.mtgmt` 保存。
- 接入 HimaTibetMap 断层/缝合带/火山岩、GEM 全球活动断层、PB2002 板块边界/区域六组公开矢量数据；提供离线城市搜索、真实 SARIG 地质 WFS 及通用 WFS/GeoJSON 连接。
- 中国活动断层中心和地质云保留官网查询、申请后文件导入入口；OneGeology 支持门户发现与 WFS 连接。没有匿名矢量接口或需要授权的数据不宣称已自动下载。
- 构造数据按来源、地名和经纬度分类缓存到全局目录；保留许可、引用、下载时间、SHA-256 和原始属性，已缓存公开数据与服务结果可离线复用。
- 新增独立等高线图层，可设置普通/主等高距、线宽、颜色、高程数字、最小标注间隔和短线过滤；采用实际高程网格，预览继续自动降采样，导出保留所选分辨率。
- GMT 按样式批量绘制构造，1000 条同样式线只调用一次绘图模块。下载、解析、SHP 重投影、查询和 GMT 制图保持在后台 worker。
- 中文地图标注使用 GMT 投影坐标和 EPS 裁边信息精确定位，PDF 保留矢量文字/图形，并输出可编辑 SVG 标注及 GeoJSON；EPS 包含原生中文叠加。
- 验证：13 组 Node 测试；真实青藏高程与缝合带组合出图；中文矢量 PDF、EPS、交换坐标轴、工程恢复和 macOS/Windows 界面布局。Windows 实机未在本轮运行。

## v1.5.0 — 2026-09-07

- 全局工作目录统一为 `/Volumes/MacBook Pro SSD/GMT-缓存`（macOS 本机）；地形、图件、预览、工程、表格、脚本、安装包、日志和临时文件分类保存。磁盘未连接时明确提示，不回退写入内置磁盘。
- 地形按离线 GeoNames 城镇名称、经纬度范围、分辨率和阴影强度命名，支持自定义区域名称；跨导出目录共享原始瓦片和区域高程。
- SRTM 最多 3 块并行下载，支持暂停、继续和取消；二进制高程拼接替代巨型 XYZ 文本，正确保留负值和无效值。
- 预览按图幅适配较小的地形网格，正式导出继续使用选择的分辨率；地形影像按输出 DPI 投影，减小 PDF/EPS 体积。标题、图框等仍为可编辑矢量，地形晕渲本身为影像。
- 提供校验迁移脚本：复制后逐个 SHA-256 核对，再将旧文件路径替换为兼容链接；已存在的不同内容保留历史副本。
- 增加共享缓存、全局目录、二进制方向/步长/边界和并行暂停回归测试。离线地名仅用于定位文件，不声明精确行政边界。

## Unreleased

## v1.4.1 - 2026-09-07

- Fixed the high-resolution terrain source selector: 1m/30s/15s/3s/1s SRTM preparation now offers USTC (recommended) and AWS, independently of the lower-resolution GMT server selector.
- Bundled an OpenJPEG WebAssembly decoder inside the SRTM worker so USTC JP2 tiles work even when installed GDAL lacks JPEG2000 support; preserved signed 16-bit elevations and void values.
- Persisted the source in project files, displayed the actual download source, and retained reuse of completed HGT caches across source changes. Missing/corrupt downloads fail explicitly without silently switching servers.
- Preserved pause/resume/cancel across download and decode stages; incomplete downloads and decoded files never become valid tile caches.
- Corrected extra tile downloads at integer east/north boundaries and wrapped longitude tile names across the date line.
- Added offline source/control/cache/error regression tests, signed-elevation fixtures, and real USTC/GMT/Electron export validation.

## v1.4.0 - 2026-09-07

- Added a region-only basemap workflow with explicit west/east/south/north inputs, coordinate validation, automatic preview, and PNG/PDF/EPS/GMT-script export without importing stations.
- Added save/open support for empty-station basemap projects while retaining imported stations when switching plot types.
- Added a direct vector PDF (Illustrator editing) export label and an EPS action, with clear raster-terrain and EPS Chinese-annotation limitations.
- Preserved GMT paths and fonts when composing native Chinese titles/legends into PDF, replacing the previous PNG-backed PDF composition with vector PDF layers in the GMT worker.
- Added geographic-range, station-free plotting, PDF vector-composition, and UI regression coverage.

## v1.3.0 - 2026-09-04

- Added independent title and legend visibility controls in both the full settings and quick inspector, with project-file persistence and backward-compatible restoration for older projects.
- Made response-curve titles respect the same visibility control and accept a user-defined title.
- Reworked the default and `论文点位图` preset around common MT-journal figure conventions: restrained blue station symbols, dark keylines, opt-in station labels, no redundant single-category legend, no repeated in-figure title, and fewer decorative map elements.
- Refined GMT map typography, frame/grid hierarchy, background ordering, coastline weight, title scale, and white label halos for clearer output over both plain and terrain backgrounds.
- Added title-visibility, quick-control, publication-default, worker-decoration, response-curve, label-halo, and layer-ordering regression coverage, plus real-GMT visual checks with nine EDI stations.

## v1.2.3 - 2026-09-02

- Prevented completed renders for an older plot type or parameter state from replacing the current preview during rapid plot switching.
- Corrected phase-tensor calculations to use the Caldwell alpha-minus-beta orientation and principal tensor values for ellipse axes, and used that axis for computed strike maps.
- Corrected EDI Tipper component orientation, Parkinson/Wiese reversal, projection-aware GMT arrow rendering, and physical scaling for narrow or elongated survey layouts.
- Added plot-specific data checks so EDI files without complete TX/TY data report that no induction vector can be drawn instead of showing a station-only result.
- Added previous/next response-curve station controls, left/right keyboard navigation, automatic redraw on station selection, period-oriented curve axes, connected curves, and conventional XY/YX phase display.
- Added focused MT-math, plot-isolation, Tipper-direction, curve-convention, UI-navigation, and stale-preview regression coverage, plus real-GMT checks with EDI data.

## v1.2.2 - 2026-09-02

- Added a complete bilingual project handoff guide covering architecture, modules, data flows, UI constraints, testing, packaging, releases, local/remote version state, and known technical debt.
- Corrected README and distribution guidance so the local v1.2.x development branch is clearly separated from the public v1.1.3 release.
- Documented the Electron application as the official product line and the Python/Tkinter implementation as a retained legacy prototype.

## v1.2.1 - 2026-08-04

- Restored terrain overlays for latitude-X/longitude-Y maps by transposing elevation and illumination grids without modifying their source files.
- Fixed native scale and compass decorations so custom positions created by preview dragging are honored in the rendered PNG/PDF.

## v1.2.0 - 2026-08-04

- Added project-embedded station groups so different survey methods can use independent colors, symbols, sizes, and legend entries.
- Added landscape axis-swapped station maps that plot latitude on X and longitude on Y without changing the stored source coordinates.
- Added native Chinese legend rendering alongside the existing native Chinese title path, avoiding GMT PostScript font limitations in PNG/PDF output.
- Added scientifically oriented Cartesian scale bars and compass roses for swapped-axis maps, including north-right/east-up orientation and document-ready landscape layouts.
- Added explicit label-name selection for uncluttered endpoint and electrode annotations.

## v1.1.3 - 2026-07-11

- Refreshed the bilingual GitHub README around the current canvas-first workbench, direct Data-menu imports, worker-based performance design, and scrollable quick inspector.
- Replaced outdated v1.1.0 interface images with current v1.1.3 screenshots covering the main workbench, Data import menu, and expanded quick inspector.
- Updated repository-facing version and download guidance for the v1.1.3 public installer release.

## v1.1.2 - 2026-07-11

- Made the expanded right-side quick-parameter inspector independently scrollable when its controls exceed the available window height.
- Kept the inspector title and bottom actions visible while the middle parameter content scrolls, with keyboard focus support and no horizontal overflow.
- Added UI regression checks for the scroll region and its overflow containment rules.

## v1.1.1 - 2026-07-11

- Restored direct TXT/CSV/Excel, EDI-folder, and sample-data import actions inside the persistent left-side Data menu.
- Kept the existing native File menu import commands and shortcuts while making the sidebar workflow label match the actions users can actually find there.
- Extended UI regression coverage so the three sidebar import actions and their renderer bindings cannot disappear unnoticed.

## v1.1.0 - 2026-07-11

- Rebuilt the Electron workbench around a premium canvas-first layout with persistent left-side workflow navigation and clearer project/export actions.
- Added a contextual quick-parameter inspector for station symbols, point size and color, label visibility, terrain visibility, data quality, and layer status.
- Kept the quick inspector closed by default so the map preview receives the maximum available width, with a single toolbar control to expand or collapse it.
- Added platform-specific macOS glass and Windows Fluent-style treatments while preserving the same information architecture and functionality on both platforms.
- Preserved the existing settings dialogs, import workers, GMT/SRTM workers, project files, automatic previews, and export workflows behind the redesigned interface.
- Added UI regression coverage for DOM IDs, default inspector state, platform styling, and canvas-first layout wiring.

## v1.0.0 - 2026-07-03

- Promoted the MT/GMT desktop application to its first formal 1.0 release.
- Includes stable station maps, strike maps, phase tensor maps, tipper maps, and MT response curve workflows.
- Includes CSV/Excel/EDI import, EDI directory parsing, field mapping, MT response field mapping, project save/open, data quality checks, large-dataset filters, and skipped-EDI export.
- Includes terrain basemaps with online SRTM preparation, local GRD/NC terrain import, terrain cache management, and high-resolution worker isolation.
- Includes structural-line overlays, editable legends, draggable legend/scale/north-arrow placement, vector PDF/EPS export, PNG DPI control, GMT script export, and cross-platform Windows/macOS packaging.
- Finalizes the 1.0 UI direction with compact overlay command menus, professional scientific-tool colors, platform-specific macOS/Windows chrome, preview-first layout, and bottom runtime status.

## v0.9.15 - 2026-07-03

- Unified the UI visual system around a deeper navy primary color, geologic teal accent, cool gray background, and tokenized borders, radii, shadows, and focus states.
- Refined buttons into consistent normal, primary, and danger styles, reducing mixed gradients and glass effects across the workspace.
- Added small line icons to the six overlay toolbar entries and polished menu sizing, selected states, hover states, and menu shadows.
- Made the preview area more paper-like, reduced grid dominance, and clarified the bottom status bar hierarchy.
- Tightened macOS and Windows platform styling so glass is limited to lightweight chrome on macOS while Windows uses solid Fluent-style surfaces.

## v0.9.14 - 2026-07-03

- Reworked the workbench toolbar into overlay command menus so future features can be added under Data, Mapping, Layers, Labels, Export, or Tools without crowding the main interface.
- Kept MT plot selection and period selection visible while moving secondary commands into lightweight floating menus with outside-click and Escape dismissal.

## v0.9.13 - 2026-07-03

- Reworked the main UI into a grouped MT/GMT workbench toolbar for Data, Mapping, Layers, Labels, Export, and Tools while keeping the preview as the primary workspace.
- Added platform-specific UI polish: lighter macOS glass-style chrome and steadier Windows/Fluent-style controls with clearer focus and hover states.
- Added status-bar runtime feedback for GMT detection, terrain preparation, preview/export progress, cache operations, and output location.
- Added GMT cache management and workbench layout reset menu entries, plus consistent weak-danger styling for destructive cleanup actions.

## v0.9.12 - 2026-07-03

- Fixed EDI directory imports that could fail with `import-worker.js 后台任务异常结束：退出码 0` when the worker exited before a large IPC result finished transferring.
- Added bulk EDI import worker coverage so large multi-period EDI results are returned before the worker disconnects.

## v0.9.11 - 2026-07-03

- Added original table-row coordinate validation so the quality panel can count mapped source rows with invalid, placeholder, or out-of-range coordinates.
- Added terrain cache deletion for the current map range and resolution while keeping the existing resolution-wide cache cleanup.
- Added draggable preview handles for the scale bar and north arrow, with custom positions written into GMT scripts and project files.
- Added regression coverage for custom scale-bar and north-arrow GMT positions.

## v0.9.10 - 2026-07-03

- Added a legend item order control so station symbols can appear before or after MT/structural overlay entries.
- Added regression coverage for overlay-first legend generation.

## v0.9.9 - 2026-07-03

- Added `.mtgmt` project save/open support for restoring imported data, filters, terrain settings, structural overlays, legend settings, and plotting parameters.
- Added a data quality panel with counts for duplicate station names, duplicate coordinates, invalid coordinates, missing MT responses, out-of-frame stations, and exportable skipped-EDI lists.
- Added large-dataset plotting filters by survey line, station-name prefix, current map region, and MT-response availability while preserving the full imported dataset.
- Added cancellable GMT preview/export rendering with stage progress messages surfaced in the preview area.
- Added terrain cache management by cached resolution, plus first-pass plotting presets for paper, field, terrain, structural-line, and phase-tensor workflows.
- Added finer label and map-element controls, including MT-only/prefix/every-N station labels and selectable scale-bar/north-arrow corners.

## v0.9.8 - 2026-07-03

- Moved large point/Excel/EDI imports, field remapping, and structural-line summaries into an isolated import worker so thousand-file datasets do not block the Electron main process.
- Moved GMT preview/export rendering into an isolated worker, including large station table generation, overlay file generation, and Windows ASCII workspace handling.
- Added reusable Windows terrain input caching so large local GRD/shade files are not copied again for every preview/export when the source file has not changed.
- Replaced Base64 preview image transfer and native-title image embedding with local file URL loading to reduce high-DPI PNG memory pressure.
- Added worker smoke tests for large station rendering and background import paths, and adjusted auto-preview debounce timing for multi-thousand-station datasets.

## v0.9.7 - 2026-07-03

- Moved high-resolution SRTM terrain preparation into an isolated worker process so large basemap jobs no longer run inside the Electron main process.
- Reworked SRTM XYZ generation to stream buffered chunks with backpressure instead of pushing very large text output through uncontrolled writes.
- Added SRTM worker smoke coverage to verify terrain worker startup, grid generation handoff, and shade generation handoff.

## v0.9.6 - 2026-07-03

- Removed the hard terrain-size safety stop so large SRTM basemap preparation can continue after showing a performance warning.
- Restored basemap previews to the selected terrain resolution instead of silently downgrading preview terrain.
- Removed the SRTM XYZ point cap that could stop high-resolution terrain preparation after downloads had started.

## v0.9.5 - 2026-07-03

- Added fast low-resolution PNG previews while keeping high-resolution terrain and DPI settings for formal exports.
- Reused existing terrain grid and shade cache files before starting another GMT terrain download/preparation task.
- Added a PNG export DPI dialog so manual PNG exports can set raster resolution before running GMT.

## v0.9.4 - 2026-07-03

- Added Windows/Linux in-app window controls for minimize, close, and exiting fullscreen when native window chrome is hidden.
- Added fullscreen-safe shortcuts: `F11` toggles fullscreen, `Esc` exits fullscreen, and `Ctrl+W` closes the window on Windows.
- Synced renderer window-control visibility with Electron fullscreen state so the escape control appears only when needed.

## v0.9.3 - 2026-07-03

- Replaced the Windows setup install section with a safe legacy-cleanup path that does not call the old installed uninstaller during updates.
- Added installer-side removal of stale per-user install directories and uninstall registry entries before extracting the new app.
- Strengthened the Windows install-repair batch file so it can remove stale install folders and matching uninstall entries before launching setup.

## v0.9.2 - 2026-07-03

- Strengthened the Windows installer update path so hidden residual processes are closed by executable name, executable path, and command-line match before installing.
- Added an early installer cleanup hook to reduce false "please close the app" failures when no app window is visible.
- Updated the Windows install-repair batch file to use the same broader cleanup before launching the setup program.

## v0.9.1 - 2026-07-03

- Fixed Windows update installs by adding an installer hook that closes old `MTPointMapGMT.exe` processes before overwriting the app.
- Added compatibility handling for older Windows builds that may still use the Chinese executable name during updates.

## v0.9.0 - 2026-07-03

- Added a terrain download-source selector with the USTC China GMT mirror as the default, plus official and custom server options.
- Added EPS vector export and an all-formats export path for PNG, vector PDF, and EPS.
- Kept PDF/EPS export on the GMT vector pipeline instead of rasterizing the rendered PNG into vector files.
- Added configurable PNG DPI for GMT raster export.
- Updated saved GMT scripts so they can generate PNG, PDF, and EPS outputs with the selected PNG DPI and terrain data server.

## v0.8.1 - 2026-07-03

- Refined the preview-first workspace with macOS-style translucent glass panels, softer depth, and a more polished toolbar.
- Added clearer hover, active, and keyboard-focus states for compact plot tabs, module buttons, forms, dialogs, and preview controls.
- Improved the preview canvas, status bar, table styling, and scrollbars while keeping the workflow and control density unchanged.

## v0.8.0 - 2026-07-03

- Redesigned the workspace around a large preview-first canvas with compact Photoshop-style module buttons in the top toolbar.
- Moved data, field mapping, MT response fields, frame, terrain, overlay/legend, symbol, label, element, and MT plot settings into separate confirmation dialogs.
- Moved all export actions and output-directory selection out of the main UI and into `File > Export`.
- Added automatic preview rendering after data import, plot-type switching, and confirmed settings changes, removing the main `Generate Preview` button.
- Moved the output directory and app version into a bottom status bar, and moved GMT detection/install controls into a dedicated desktop `GMT` menu.
- Added internal preview padding so rendered maps do not sit too close to the preview frame.

## v0.7.2 - 2026-07-02

- Replaced the visible text legend drag handle with a small unlabeled control point so the preview no longer appears to contain a second legend box.
- Kept the drag handle as preview-only UI; exported GMT maps are unchanged.

## v0.7.1 - 2026-07-02

- Fixed legend entries so station symbols follow the selected point shape, size, fill color, and border color instead of always using a red circle.
- Added plot-type legend entries for strike, phase tensor, and tipper maps, with strike legend color matching the plotted strike line.
- Added editable legend entry labels for the station item and the active MT overlay item.

## v0.7.0 - 2026-07-02

- Added editable legend styling for width, title size, label size, text color, background color, background transparency, border color, and border width.
- Added an in-preview draggable legend handle that writes back to GMT normalized legend coordinates.
- Added debounced automatic PNG preview regeneration for legend and structural-line overlay changes, with queued refreshes when GMT is already rendering.

## v0.6.1 - 2026-07-02

- Mark the current preview as stale when overlay or legend settings change, so users know to regenerate the map before expecting the legend to appear.

## v0.6.0 - 2026-07-02

- Added compact structural-line overlays for GMT multi-segment, BLN, and simple longitude/latitude files, with per-file color control.
- Added optional GMT legend generation for station points and imported structural-line layers.
- Kept the interface compact by placing overlays and legend controls inside a collapsible parameter section instead of adding another top-level plot tab.
- Added regression coverage for fault parsing, overlay data generation, legend specs, and generated GMT script wiring.
- Prepared the project for public GitHub distribution with a bilingual README, repository metadata, and an explicit MIT license file.
- Added Chinese/English parallel public documentation and package description for GitHub exposure.

## v0.5.8 - 2026-07-01

- Added local `.grd` terrain import in the terrain basemap panel, with controls to choose or clear a local GMT grid file.
- Routed local terrain grids directly into GMT `grdgradient`/`grdimage`, avoiding online terrain downloads while still producing shaded relief.
- Preserved Windows export reliability by copying local terrain grids into the ASCII temporary GMT workspace before rendering.

## v0.5.7 - 2026-06-29

- Added drag-to-pan behavior after a preview has been zoomed, so enlarged maps and MT curves can be moved left, right, up, and down inside the preview area.
- Reduced mouse-wheel zoom sensitivity for smoother preview zooming while keeping Shift-drag available for additional box zooming after a view is already enlarged.

## v0.5.6 - 2026-06-29

- Added interactive preview zooming: when the pointer is over the preview area, mouse-wheel scrolling zooms the generated map or MT curve without rerunning GMT.
- Added drag-box local magnification in the preview area, plus an in-preview zoom readout and fit-reset control.

## v0.5.5 - 2026-06-28

- Fixed the MT apparent-resistivity/phase curve layout by drawing the phase panel at the page base and placing the resistivity panel above it, preventing GMT from clipping the lower phase subplot.
- Kept the discrete square-marker rho/phase style and error-bar overlays unchanged while giving the two panels a stable vertical layout.

## v0.5.4 - 2026-06-28

- Reworked the in-app preview renderer to place generated PNGs as a contained preview-panel background, avoiding Electron image-element clipping when MT sounding-curve figures are taller than the viewport.
- Cleared stale preview backgrounds whenever placeholders or read errors are shown, so switching plot types cannot leave an old image behind.

## v0.5.3 - 2026-06-28

- Strengthened preview image fitting by making the rendered PNG fill the preview viewport with `object-fit: contain`, preventing MT curve previews from being displayed by width only.
- Replaced the previously copied app after quitting any running old instance, so reopening the app loads the updated preview code.

## v0.5.2 - 2026-06-28

- Fixed in-app preview scaling so tall MT sounding-curve figures fit completely inside the preview panel instead of being clipped vertically.
- Kept exported PNG/PDF resolution unchanged; only the renderer preview sizing was adjusted.

## v0.5.1 - 2026-06-28

- Changed MT sounding curves from connected lines to discrete red/green square markers matching common MT apparent-resistivity and phase curve style.
- Switched the response-curve x axis to reversed `log10 frequency (Hz)` instead of `log10 Period (s)`.
- Parsed EDI `ZXY.VAR` and `ZYX.VAR` arrays and used them to draw approximate black vertical error bars when available.
- Added light grid lines and adjusted curve plot margins so axis labels are not clipped.
- Made the in-app preview area scrollable so tall curve figures display fully inside the software.

## v0.5.0 - 2026-06-28

- Redesigned the app into a professional workbench layout with top analysis tabs for station maps, impedance strike, phase tensor ellipses, tipper vectors, and apparent-resistivity/phase curves.
- Added EDI impedance/tipper response parsing across all periods, including `ZXX/ZXY/ZYX/ZYY` real/imaginary arrays and `TX/TY` tipper arrays.
- Added Excel `.xlsx/.xls` table import and manual MT column mapping for period/frequency, impedance tensor, tipper, provided strike, phase-tensor axes, and beta/skew columns.
- Added GMT overlay generation for electric/impedance strike segments, phase tensor ellipses colored by beta, Parkinson/Wiese tipper arrows, and single-station rho/phase curves.
- Added in-app table-format help and clearer messages when MT-specific plots are requested from coordinate-only data.

## v0.4.6 - 2026-06-28

- Changed the Windows internal executable name to `MTPointMapGMT.exe` while keeping the Chinese app title, avoiding NSIS installer close-detection problems with the previous Chinese executable name.
- Added a Windows install-repair batch file that closes old MT Point Map GMT processes before starting the x64 installer.
- Kept installer and portable build names unchanged for user-facing distribution.

## v0.4.5 - 2026-06-28

- Fixed Windows GMT export failures when the output directory contains Chinese characters by running GMT in an ASCII temporary workspace and copying completed files back afterward.
- Changed generated Windows GMT scripts to use relative station files and output names, avoiding Ghostscript failures on non-ASCII absolute paths.
- Made saved Windows `.bat` scripts switch to their own folder before running so double-click execution is more reliable.

## v0.4.4 - 2026-06-20

- Added a terrain-resolution safety guard that blocks oversized high-resolution SRTM basemaps before they can freeze or crash the app.
- Added clearer terrain-size warnings with recommended coarser resolutions when the selected map range is too large.
- Added a defensive SRTM conversion limit so very large grids stop with an explanation instead of locking the Electron main process.

## v0.4.3 - 2026-06-20

- Moved data import actions into the desktop menu under `文件 > 导入`, with separate TXT/CSV and EDI-folder import entries.
- Removed the crowded import buttons from the left data panel for a cleaner professional layout.
- Added menu entries for opening sample data and choosing the export directory.
- Generalized no-data prompts so they apply to both table imports and EDI folder imports.

## v0.4.2 - 2026-06-20

- Added EDI folder import with recursive scanning of subfolders for `.edi` files.
- Extracted station coordinates from `LAT/LONG` or fallback `REFLAT/REFLONG` fields, including degree-minute-second values.
- Used EDI file names as station names and skipped placeholder `0/0` coordinates with a visible import summary.
- Added a Node regression test for EDI coordinate parsing and invalid-coordinate rejection.

## v0.4.1 - 2026-06-20

- Switched 1m, 30s, 15s, 3s, and 1s terrain basemap preparation to direct SRTM HGT downloads, avoiding the GMT App JP2/OpenJPEG failure path on high-resolution earth-relief data.
- Added SRTM tile download, pause, resume, cancel, decompression, cropping, GMT grid generation, and shaded-relief generation inside the existing terrain workflow.
- Updated terrain resolution labels and size estimates so high-resolution options show realistic SRTM download and cache sizes.
- Made GMT script saving prepare the local terrain grid first when a terrain basemap is enabled.

## v0.4.0 - 2026-06-20

- Added an optional GMT earth-relief terrain basemap workflow with selectable 30s, 15s, 03s, and 01s resolutions.
- Added estimated local terrain working-file size before download/preparation so large resolutions are easier to avoid.
- Added terrain preparation progress, pause, resume, cancel, local terrain deletion, GMT earth data cache cleanup, and a remote-data documentation link.
- Added deletion for the current exported map files from inside the app.

## v0.3.9 - 2026-06-20

- Replaced manual color text boxes with preset color dropdowns plus native color pickers for point fill, point border, and station label text.
- Added a selectable export directory that is used by preview, PNG/PDF export, and the GMT script save dialog.
- Remembered the selected export directory across app launches.

## v0.3.8 - 2026-06-19

- Fixed Chinese map titles rendering as mojibake in GMT output by drawing non-ASCII titles with Electron's native font renderer after GMT creates the base map.
- Kept ASCII titles in the pure GMT script path while avoiding GMT title rendering for Chinese text.

## v0.3.7 - 2026-06-19

- Fixed broken in-app preview images by loading generated PNG files through an Electron IPC data URL instead of a `file://` URL.
- Added a visible preview loading error message if the generated image cannot be read.

## v0.3.6 - 2026-06-19

- Stopped generated GMT preview/export scripts from using `gmt end show`, so macOS Preview no longer opens automatically.
- Tightened automatic map regions for small survey lines so station maps do not get excessive empty margins.
- Made the scale bar length adapt to the map width instead of always drawing a 20 km scale bar.
- Matched scale bar unit labels to the adaptive scale length, using meters for small survey maps.
- Defaulted dense projected-coordinate imports to hide station labels for a cleaner first preview while keeping the label toggle available.

## v0.3.5 - 2026-06-19

- Added support for field-survey TXT files with point name plus 3-degree Gauss-Kruger meter coordinates with zone prefixes, such as `点号 北向坐标/m 东向坐标/m`.
- Added GB18030/GBK decoding for Chinese TXT coordinate files.
- Improved whitespace parsing so mixed spaces and tabs are handled as one TXT-style delimiter.
- Improved header detection so descriptive lines like `线距200 m点距20 m` are ignored instead of breaking column recognition.

## v0.3.4 - 2026-06-19

- Fixed GMT detection on macOS when GMT is installed as the official `/Applications/GMT-*.app` bundle.
- Added the detected GMT bin directory to generated scripts and export runs so map output works even when GUI apps do not inherit terminal PATH.
- Added visible feedback for the "重新检测 GMT" button, including the detected version and executable path.
- Fixed GMT 6.5 basemap frame/title syntax by writing the title as a separate `-B+t...` option.
- Replaced modern-mode shorthand `-R -J` with full region/projection options in generated scripts.
- Added `GS_LIB` setup for the Ghostscript bundled inside the official GMT macOS app.

## v0.3.3 - 2026-06-19

- Added visible GMT installer download progress with transferred size, total size, speed, and status.
- Added pause, resume, and cancel controls for GMT installer downloads.
- Changed GMT installer download IPC so the UI receives progress events instead of waiting silently.

## v0.3.2 - 2026-06-19

- Fixed the packaged app rendering bug where JavaScript source text could appear above the interface.
- Changed the Electron renderer loading path to inline CSS and renderer code from the main process.
- Removed the runtime dependency on the preload bridge for the visible UI.

## v0.3.1 - 2026-06-19

- Changed the GMT install button to directly download the official GMT installer for the current system.
- Added download failure handling so network or GitHub access problems show a clear message.
- Kept official GMT documentation links as secondary help instead of relying on them for the main install action.

## v0.3.0 - 2026-06-19

- Added a cross-platform Electron implementation for macOS and Windows distribution.
- Added native file import, station parsing, GMT script generation, preview/export commands, and cross-platform output path handling in the Electron app.
- Added packaging configuration for macOS `.app`/DMG and Windows portable/installer builds.
- Kept the Python prototype for development reference, but made Electron the recommended distributable app route.

## v0.2.0 - 2026-06-19

- Replaced the distributable macOS app runtime with a native SwiftUI implementation.
- Removed Tk from the delivered `.app` launch path so the app can run on Macs where Tk fails.
- Kept GMT script generation, TXT/CSV import, station labels, point styling, grid, scale bar, north arrow, and PNG/PDF export in the native app.

## v0.1.1 - 2026-06-19

- Added a repeatable macOS `.app` bundle builder.
- Adjusted runtime paths so exported maps go to `~/Documents/MT点位图制作工具—GMT输出`.
- Prepared the tool for double-click launch from a copied app bundle.

## v0.1.0 - 2026-06-19

- Initial tracked release of `MT点位图制作工具—GMT`.
- Added TXT/CSV station import with automatic station, longitude, and latitude detection.
- Added GMT script generation, preview/export workflow, label controls, point styling, grid, scale bar, and north arrow options.
- Added sample station data and Chinese usage documentation.
