const state = {
  parsed: null,
  records: [],
  columns: [],
  mapping: null,
  plotType: "stationMap",
  outputDirectory: "",
  terrain: {
    key: "",
    gridPath: "",
    shadePath: "",
    region: "",
    resolution: ""
  },
  terrainWaiter: null
};

const CUSTOM_COLOR_VALUE = "__custom__";
const COLOR_OPTIONS = [
  ["#d7191c", "红色 #d7191c"],
  ["#2b83ba", "蓝色 #2b83ba"],
  ["#1a9641", "绿色 #1a9641"],
  ["#fdae61", "橙色 #fdae61"],
  ["#984ea3", "紫色 #984ea3"],
  ["#4d4d4d", "深灰 #4d4d4d"],
  ["black", "黑色 black"],
  ["white", "白色 white"],
  ["gray50", "灰色 gray50"],
  ["yellow", "黄色 yellow"],
  ["cyan", "青色 cyan"],
  ["magenta", "品红 magenta"],
  [CUSTOM_COLOR_VALUE, "自定义 RGB/HEX"]
];
const TERRAIN_SAFE_CELL_LIMIT = 2_500_000;
const TERRAIN_WARNING_CELL_LIMIT = 1_000_000;
const TERRAIN_RESOLUTIONS = {
  "20m": { seconds: 1200, label: "20 分，约 37 km", source: "gmt" },
  "10m": { seconds: 600, label: "10 分，约 18 km", source: "gmt" },
  "06m": { seconds: 360, label: "6 分，约 10 km", source: "gmt" },
  "01m": { seconds: 60, label: "1 分，约 1.9 km", source: "srtm" },
  "30s": { seconds: 30, label: "30 秒，约 900 m", source: "srtm" },
  "15s": { seconds: 15, label: "15 秒，约 450 m", source: "srtm" },
  "03s": { seconds: 3, label: "3 秒，约 90 m", source: "srtm" },
  "01s": { seconds: 1, label: "1 秒，约 30 m", source: "srtm" }
};
const TERRAIN_RECOMMENDATION_ORDER = ["01s", "03s", "15s", "30s", "01m", "06m", "10m", "20m"];

const ids = [
  "appStatus", "dataSummary", "nameColumn", "lonColumn", "latColumn",
  "lineColumn", "elevationColumn", "applyMappingBtn", "stationRows", "previewBtn", "previewBox",
  "periodColumn", "frequencyColumn", "zxxrColumn", "zxxiColumn", "zxyrColumn", "zxyiColumn", "zyxrColumn", "zyxiColumn",
  "zyyrColumn", "zyyiColumn", "txrColumn", "txiColumn", "tyrColumn", "tyiColumn", "strikeColumn", "ptAzimuthColumn",
  "ptMaxColumn", "ptMinColumn", "betaColumn", "mtPeriodInput", "curveStationInput", "tableHelpBtn", "tableHelpDialog", "closeTableHelpBtn",
  "exportPngBtn", "exportPdfBtn", "exportBothBtn", "saveScriptBtn", "installBtn", "recheckBtn",
  "downloadPanel", "downloadTitle", "downloadStatus", "downloadProgress", "downloadBytes", "downloadPercent",
  "downloadSpeed", "pauseDownloadBtn", "resumeDownloadBtn", "cancelDownloadBtn",
  "installPlanText", "outputPath", "chooseOutputBtn", "titleInput", "regionInput", "projectionInput", "frameInput",
  "autoRegionBtn", "showTerrainInput", "terrainResolutionInput", "terrainCptInput", "terrainIntensityInput",
  "inspectorTitle", "plotTypeHint", "strikeLengthInput", "strikeColorInput", "tensorScaleInput", "tensorPenColorInput",
  "tipperComponentInput", "tipperConventionInput", "tipperScaleInput",
  "terrainAllowDownloadInput", "terrainEstimateText", "prepareTerrainBtn", "pauseTerrainBtn", "resumeTerrainBtn",
  "cancelTerrainBtn", "terrainProgressPanel", "terrainProgress", "terrainProgressText", "terrainProgressPercent",
  "deleteTerrainBtn", "clearTerrainCacheBtn", "terrainDocsBtn", "symbolInput", "pointSizeInput", "pointFillInput", "pointFillPicker", "penWidthInput",
  "penColorInput", "penColorPicker", "showLabelsInput", "labelSizeInput", "labelColorInput", "labelColorPicker",
  "labelDXInput", "labelDYInput",
  "showGridInput", "showScaleInput", "showNorthInput", "outputNameInput", "deleteOutputBtn"
];
const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

window.addEventListener("DOMContentLoaded", async () => {
  populateColorControls();
  wireEvents();
  setPlotType("stationMap");
  await refreshStatus();
});

function wireEvents() {
  window.mtApp.onMenuOpenFile(openPointFile);
  window.mtApp.onMenuOpenEdiDirectory(openEdiDirectory);
  window.mtApp.onMenuLoadSample(loadSampleData);
  window.mtApp.onMenuChooseOutputDirectory(chooseOutputDirectory);
  window.mtApp.onMenuShowTableHelp(showTableHelp);
  document.querySelectorAll(".tool-tab").forEach((button) => {
    button.addEventListener("click", () => setPlotType(button.dataset.plotType));
  });
  el.tableHelpBtn.addEventListener("click", showTableHelp);
  el.closeTableHelpBtn.addEventListener("click", () => el.tableHelpDialog.close());
  el.applyMappingBtn.addEventListener("click", applyMapping);
  el.autoRegionBtn.addEventListener("click", () => {
    if (!state.records.length) return notify("请先导入点位文件。");
    el.regionInput.value = autoRegionClient(state.records);
  });
  el.previewBtn.addEventListener("click", () => exportMap(["png"], false));
  el.exportPngBtn.addEventListener("click", () => exportMap(["png"], true));
  el.exportPdfBtn.addEventListener("click", () => exportMap(["pdf"], true));
  el.exportBothBtn.addEventListener("click", () => exportMap(["png", "pdf"], true));
  el.saveScriptBtn.addEventListener("click", saveScript);
  el.deleteOutputBtn.addEventListener("click", deleteCurrentOutputs);
  el.chooseOutputBtn.addEventListener("click", chooseOutputDirectory);
  el.prepareTerrainBtn.addEventListener("click", () => prepareTerrain(false));
  el.pauseTerrainBtn.addEventListener("click", () => window.mtApp.pauseTerrain());
  el.resumeTerrainBtn.addEventListener("click", () => window.mtApp.resumeTerrain());
  el.cancelTerrainBtn.addEventListener("click", () => window.mtApp.cancelTerrain());
  el.deleteTerrainBtn.addEventListener("click", deleteLocalTerrain);
  el.clearTerrainCacheBtn.addEventListener("click", clearTerrainCache);
  el.terrainDocsBtn.addEventListener("click", () => window.mtApp.openExternal("https://docs.generic-mapping-tools.org/6.6/datasets/remote-data.html"));
  [el.showTerrainInput, el.terrainResolutionInput, el.terrainIntensityInput, el.regionInput].forEach((control) => {
    control.addEventListener("input", updateTerrainEstimate);
    control.addEventListener("change", updateTerrainEstimate);
  });
  el.recheckBtn.addEventListener("click", recheckGMT);
  el.installBtn.addEventListener("click", installGMT);
  el.pauseDownloadBtn.addEventListener("click", () => window.mtApp.pauseGMTDownload());
  el.resumeDownloadBtn.addEventListener("click", () => window.mtApp.resumeGMTDownload());
  el.cancelDownloadBtn.addEventListener("click", () => window.mtApp.cancelGMTDownload());
  window.mtApp.onGMTDownloadProgress(renderDownloadProgress);
  window.mtApp.onTerrainProgress(renderTerrainProgress);
  document.querySelectorAll("[data-link]").forEach((button) => {
    button.addEventListener("click", () => window.mtApp.openExternal(button.dataset.link));
  });
}

function setPlotType(plotType) {
  state.plotType = plotType || "stationMap";
  document.querySelectorAll(".tool-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.plotType === state.plotType);
  });
  document.body.dataset.plotType = state.plotType;
  const labels = {
    stationMap: ["绘图参数", "点位图模式"],
    strikeMap: ["电性主轴 / 阻抗张量走向", "按选定周期叠加走向线段"],
    phaseTensorMap: ["相位张量椭圆", "按选定周期叠加相位张量椭圆"],
    tipperMap: ["感应矢量 / Tipper", "按选定周期叠加实部或虚部箭头"],
    responseCurve: ["视电阻率和相位曲线", "选择单个测点绘制 rho/phase 曲线"]
  };
  const [title, hint] = labels[state.plotType] || labels.stationMap;
  el.inspectorTitle.textContent = title;
  el.plotTypeHint.textContent = hint;
  el.outputNameInput.value = defaultOutputNameForPlot(state.plotType);
  renderPlaceholder();
}

function defaultOutputNameForPlot(plotType) {
  return {
    stationMap: "mt_point_map",
    strikeMap: "mt_strike_map",
    phaseTensorMap: "mt_phase_tensor_map",
    tipperMap: "mt_tipper_map",
    responseCurve: "mt_response_curve"
  }[plotType] || "mt_point_map";
}

function showTableHelp() {
  if (typeof el.tableHelpDialog.showModal === "function") el.tableHelpDialog.showModal();
  else notify("表格格式：基础列为测点名、经度、纬度；MT 列为 period/freq、ZXXR/ZXXI、ZXYR/ZXYI、ZYXR/ZYXI、ZYYR/ZYYI、TXR/TXI、TYR/TYI。");
}

async function openPointFile() {
  try {
    const parsed = await window.mtApp.openFile();
    if (parsed) loadParsed(parsed);
  } catch (error) {
    notify(error.message || String(error));
  }
}

async function openEdiDirectory() {
  try {
    const parsed = await window.mtApp.openEdiDirectory();
    if (parsed) loadParsed(parsed);
  } catch (error) {
    notify(error.message || String(error));
  }
}

async function loadSampleData() {
  try {
    loadParsed(await window.mtApp.loadSample());
  } catch (error) {
    notify(error.message || String(error));
  }
}

async function refreshStatus() {
  const status = await window.mtApp.status();
  state.outputDirectory = status.outputDirectory;
  renderOutputDirectory();
  renderGMTStatus(status.gmtAvailable, status.installPlan, status.gmtInfo);
  updateTerrainEstimate();
}

function renderOutputDirectory() {
  el.outputPath.textContent = `输出目录：${state.outputDirectory}`;
}

async function chooseOutputDirectory() {
  const selected = await window.mtApp.chooseOutputDirectory(state.outputDirectory);
  if (!selected) return;
  state.outputDirectory = selected;
  renderOutputDirectory();
  updateTerrainEstimate();
}

async function recheckGMT() {
  el.recheckBtn.disabled = true;
  el.recheckBtn.textContent = "检测中...";
  el.appStatus.textContent = "正在重新检测 GMT...";
  try {
    const status = await window.mtApp.recheckGMT();
    renderGMTStatus(status.gmtAvailable, status.installPlan, status.gmtInfo);
    notify(status.gmtAvailable ? `已检测到 GMT：\n${status.gmtInfo.path}` : `仍未检测到 GMT。\n${status.installPlan.message}`);
  } finally {
    el.recheckBtn.disabled = false;
    el.recheckBtn.textContent = "重新检测 GMT";
  }
}

function renderGMTStatus(available, plan, gmtInfo) {
  el.appStatus.textContent = available
    ? `GMT 已就绪：${gmtInfo.version || "未知版本"}，路径：${gmtInfo.path}`
    : `未检测到 GMT。${plan.message}`;
  const downloadText = plan.download ? `将下载：${plan.download.fileName}` : "请参考官方安装文档";
  el.installPlanText.textContent = `${plan.platform}：${downloadText}`;
  el.installBtn.disabled = available || !plan.canAutoInstall;
  el.installBtn.textContent = available ? "GMT 已安装" : "下载并安装 GMT";
}

async function installGMT() {
  el.installBtn.disabled = true;
  el.installBtn.textContent = "正在准备下载...";
  el.downloadPanel.classList.remove("hidden");
  const result = await window.mtApp.installGMT();
  if (result.status) renderDownloadProgress(result.status);
  if (!result.ok) {
    el.installBtn.disabled = false;
    el.installBtn.textContent = "下载并安装 GMT";
    notify(result.message);
  }
  await refreshStatus();
  if (result.status && ["starting", "downloading", "paused"].includes(result.status.state)) {
    renderDownloadProgress(result.status);
  }
}

function renderDownloadProgress(status) {
  el.downloadPanel.classList.remove("hidden");
  const percent = Number.isFinite(status.percent) ? status.percent : 0;
  const active = ["starting", "downloading", "paused"].includes(status.state);
  el.downloadTitle.textContent = status.fileName || "GMT 安装包下载";
  el.downloadStatus.textContent = status.message || "正在下载...";
  el.downloadProgress.value = percent;
  el.downloadBytes.textContent = `${formatBytes(status.downloaded || 0)} / ${status.total ? formatBytes(status.total) : "未知大小"}`;
  el.downloadPercent.textContent = status.total ? `${percent.toFixed(percent < 10 ? 1 : 0)}%` : "等待大小";
  el.downloadSpeed.textContent = status.state === "downloading" ? `${formatBytes(status.speed || 0)}/s` : readableDownloadState(status.state);
  el.pauseDownloadBtn.disabled = status.state !== "downloading";
  el.resumeDownloadBtn.disabled = status.state !== "paused";
  el.cancelDownloadBtn.disabled = !active;
  el.installBtn.disabled = active;
  el.installBtn.textContent = active ? "正在下载 GMT..." : "下载并安装 GMT";
}

function loadParsed(parsed) {
  state.parsed = parsed;
  state.records = parsed.records;
  state.columns = parsed.columns;
  state.mapping = parsed.mapping;
  el.regionInput.value = parsed.region;
  const coordinateText = parsed.mapping.coordinateType === "projected" ? "高斯投影坐标点位，已自动转经纬度" : "点位";
  if (parsed.sourceType === "ediDirectory") {
    const skipped = parsed.skippedEdiFiles?.length || 0;
    const total = parsed.totalEdiFiles || parsed.records.length + skipped;
    el.dataSummary.textContent = `${fileName(parsed.filePath)}\n扫描 ${total} 个 EDI，已读取 ${parsed.records.length} 个坐标${skipped ? `，跳过 ${skipped} 个无效坐标` : ""}`;
  } else {
    el.dataSummary.textContent = `${fileName(parsed.filePath)}\n已识别 ${parsed.records.length} 个${coordinateText}`;
  }
  if (parsed.mapping.coordinateType === "projected" && parsed.records.length > 50) {
    el.showLabelsInput.checked = false;
  }
  populateColumnSelects();
  populateMTControls();
  renderStationRows();
  renderPlaceholder();
  resetTerrainPaths();
  updateTerrainEstimate();
}

function populateColumnSelects() {
  const selects = [
    el.nameColumn, el.lonColumn, el.latColumn, el.lineColumn, el.elevationColumn,
    el.periodColumn, el.frequencyColumn, el.zxxrColumn, el.zxxiColumn, el.zxyrColumn, el.zxyiColumn,
    el.zyxrColumn, el.zyxiColumn, el.zyyrColumn, el.zyyiColumn, el.txrColumn, el.txiColumn, el.tyrColumn, el.tyiColumn,
    el.strikeColumn, el.ptAzimuthColumn, el.ptMaxColumn, el.ptMinColumn, el.betaColumn
  ];
  for (const select of selects) {
    select.innerHTML = "";
    select.append(new Option("无", ""));
    for (const column of state.columns) select.append(new Option(column, column));
  }
  el.nameColumn.value = state.mapping.name || "";
  el.lonColumn.value = state.mapping.lon || state.mapping.easting || "";
  el.latColumn.value = state.mapping.lat || state.mapping.northing || "";
  el.lineColumn.value = state.mapping.line || "";
  el.elevationColumn.value = state.mapping.elevation || "";
  setMTColumnValues(state.mapping.mt || {});
}

function setMTColumnValues(mapping) {
  const map = {
    periodColumn: "period",
    frequencyColumn: "frequency",
    zxxrColumn: "zxxr",
    zxxiColumn: "zxxi",
    zxyrColumn: "zxyr",
    zxyiColumn: "zxyi",
    zyxrColumn: "zyxr",
    zyxiColumn: "zyxi",
    zyyrColumn: "zyyr",
    zyyiColumn: "zyyi",
    txrColumn: "txr",
    txiColumn: "txi",
    tyrColumn: "tyr",
    tyiColumn: "tyi",
    strikeColumn: "strike",
    ptAzimuthColumn: "ptAzimuth",
    ptMaxColumn: "ptMax",
    ptMinColumn: "ptMin",
    betaColumn: "beta"
  };
  for (const [id, key] of Object.entries(map)) {
    if (el[id]) el[id].value = mapping[key] || "";
  }
}

async function applyMapping() {
  if (!state.parsed) return notify("请先导入点位文件。");
  const mapping = readMapping();
  if (mapping.coordinateType === "projected") {
    if (!mapping.easting || !mapping.northing) return notify("投影坐标列必须选择。");
  } else if (!mapping.lon || !mapping.lat) {
    return notify("经度和纬度列必须选择。");
  }
  try {
    const result = await window.mtApp.applyMapping({ rows: state.parsed.rows, mapping });
    state.mapping = mapping;
    state.records = result.records;
    el.regionInput.value = result.region;
    renderStationRows();
    populateMTControls();
    resetTerrainPaths();
    updateTerrainEstimate();
    notify("字段映射已更新。");
  } catch (error) {
    notify(error.message);
  }
}

function readMapping() {
  const base = {
    name: el.nameColumn.value,
    line: el.lineColumn.value,
    elevation: el.elevationColumn.value,
    mt: readMTMapping()
  };
  if (state.mapping && state.mapping.coordinateType === "projected") {
    return {
      ...base,
      coordinateType: "projected",
      easting: el.lonColumn.value,
      northing: el.latColumn.value,
      projectedSystem: state.mapping.projectedSystem
    };
  }
  return {
    ...base,
    coordinateType: "geographic",
    lon: el.lonColumn.value,
    lat: el.latColumn.value
  };
}

function readMTMapping() {
  return {
    period: el.periodColumn.value,
    frequency: el.frequencyColumn.value,
    zxxr: el.zxxrColumn.value,
    zxxi: el.zxxiColumn.value,
    zxyr: el.zxyrColumn.value,
    zxyi: el.zxyiColumn.value,
    zyxr: el.zyxrColumn.value,
    zyxi: el.zyxiColumn.value,
    zyyr: el.zyyrColumn.value,
    zyyi: el.zyyiColumn.value,
    txr: el.txrColumn.value,
    txi: el.txiColumn.value,
    tyr: el.tyrColumn.value,
    tyi: el.tyiColumn.value,
    strike: el.strikeColumn.value,
    ptAzimuth: el.ptAzimuthColumn.value,
    ptMax: el.ptMaxColumn.value,
    ptMin: el.ptMinColumn.value,
    beta: el.betaColumn.value
  };
}

function readConfig() {
  const config = {
    title: el.titleInput.value,
    plotType: state.plotType,
    mtPeriod: Number(el.mtPeriodInput.value),
    curveStation: el.curveStationInput.value,
    strikeLength: Number(el.strikeLengthInput.value),
    strikeColor: el.strikeColorInput.value,
    tensorScale: Number(el.tensorScaleInput.value),
    tensorPenColor: el.tensorPenColorInput.value,
    tipperComponent: el.tipperComponentInput.value,
    tipperConvention: el.tipperConventionInput.value,
    tipperScale: Number(el.tipperScaleInput.value),
    region: el.regionInput.value,
    projection: el.projectionInput.value,
    frame: el.frameInput.value,
    showGrid: el.showGridInput.checked,
    showLabels: el.showLabelsInput.checked,
    showScale: el.showScaleInput.checked,
    showNorthArrow: el.showNorthInput.checked,
    pointSymbol: el.symbolInput.value,
    pointSize: Number(el.pointSizeInput.value),
    pointFill: readColor("pointFill"),
    pointPenWidth: Number(el.penWidthInput.value),
    pointPenColor: readColor("penColor"),
    labelFontSize: Number(el.labelSizeInput.value),
    labelColor: readColor("labelColor"),
    labelDX: Number(el.labelDXInput.value),
    labelDY: Number(el.labelDYInput.value),
    showTerrain: el.showTerrainInput.checked,
    terrainResolution: el.terrainResolutionInput.value,
    terrainCpt: el.terrainCptInput.value,
    terrainIntensity: Number(el.terrainIntensityInput.value),
    terrainAllowDownload: el.terrainAllowDownloadInput.checked,
    terrainGridPath: state.terrain.gridPath,
    terrainShadePath: state.terrain.shadePath,
    outputName: el.outputNameInput.value.trim() || "mt_point_map"
  };
  if (state.plotType === "responseCurve") config.showTerrain = false;
  return config;
}

async function exportMap(formats, showAlert) {
  if (!state.records.length) return notify("请先导入点位数据。");
  const config = readConfig();
  if (!validatePlotReadiness(config)) return;
  if (config.showTerrain) {
    const ready = await ensureTerrainReady(config);
    if (!ready) return;
    config.terrainGridPath = state.terrain.gridPath;
    config.terrainShadePath = state.terrain.shadePath;
  }
  let result;
  try {
    result = await window.mtApp.exportMap({ records: state.records, config, formats, outputDirectory: state.outputDirectory });
  } catch (error) {
    notify(error.message || String(error));
    return;
  }
  if (!result.ok) {
    await refreshStatus();
    return notify(`${result.message}\n脚本已保存：${result.scriptPath}`);
  }
  state.outputDirectory = result.outputDirectory;
  renderOutputDirectory();
  if (formats.includes("png")) {
    const png = result.files.find((file) => file.toLowerCase().endsWith(".png"));
    if (png) await renderPreview(png);
  }
  if (showAlert) notify(`导出完成：\n${result.files.join("\n")}`);
}

async function deleteCurrentOutputs() {
  const result = await window.mtApp.deleteCurrentOutputs({
    outputDirectory: state.outputDirectory,
    outputName: el.outputNameInput.value.trim() || "mt_point_map"
  });
  renderPlaceholder();
  notify(result.message);
}

async function ensureTerrainReady(config) {
  const key = terrainKeyClient(config);
  if (state.terrain.key === key && state.terrain.gridPath && state.terrain.shadePath) return true;
  if (!config.terrainAllowDownload) {
    const confirmed = confirm("当前未准备本地地形底图，并且关闭了联网下载。是否仍然尝试只使用 GMT 本地缓存准备底图？");
    if (!confirmed) return false;
  }
  try {
    await prepareTerrain(true);
    return Boolean(state.terrain.gridPath && state.terrain.shadePath);
  } catch (error) {
    notify(error.message || String(error));
    return false;
  }
}

async function prepareTerrain(waitForCompletion) {
  if (!state.records.length) return notify("请先导入点位文件。");
  const config = readConfig();
  if (!config.region) config.region = autoRegionClient(state.records);
  const estimate = estimateTerrainClient(config.region, config.terrainResolution);
  if (estimate.blocked) {
    el.terrainEstimateText.textContent = estimate.label;
    notify(estimate.warning);
    return false;
  }
  resetTerrainPaths();
  el.terrainProgressPanel.classList.remove("hidden");
  const waiting = waitForCompletion ? waitForTerrainCompletion() : null;
  const result = await window.mtApp.prepareTerrain({ records: state.records, config, outputDirectory: state.outputDirectory });
  if (result.status) renderTerrainProgress(result.status);
  if (!result.ok) {
    if (state.terrainWaiter) state.terrainWaiter.reject(new Error(result.message || "地形底图任务无法启动。"));
    state.terrainWaiter = null;
    notify(result.message);
    return false;
  }
  if (!waitForCompletion) return true;
  return waiting;
}

function waitForTerrainCompletion() {
  if (state.terrainWaiter) return state.terrainWaiter.promise;
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  state.terrainWaiter = { promise, resolve, reject };
  return promise;
}

function renderTerrainProgress(status) {
  el.terrainProgressPanel.classList.remove("hidden");
  const percent = Number.isFinite(status.percent) ? Math.max(0, Math.min(100, status.percent)) : 0;
  el.terrainProgress.value = percent;
  el.terrainProgressText.textContent = status.message || readableTerrainState(status.state);
  el.terrainProgressText.dataset.state = status.state || "";
  el.terrainProgressPercent.textContent = `${percent.toFixed(percent < 10 ? 1 : 0)}%`;
  el.pauseTerrainBtn.disabled = status.state !== "running";
  el.resumeTerrainBtn.disabled = status.state !== "paused";
  el.cancelTerrainBtn.disabled = !["starting", "running", "paused"].includes(status.state);
  el.prepareTerrainBtn.disabled = ["starting", "running", "paused"].includes(status.state);
  if (status.state === "completed") {
    state.terrain = {
      key: terrainKeyClient(readConfig()),
      gridPath: status.gridPath,
      shadePath: status.shadePath,
      region: status.region,
      resolution: status.resolution
    };
    if (state.terrainWaiter) state.terrainWaiter.resolve(true);
    state.terrainWaiter = null;
  }
  if (["failed", "cancelled"].includes(status.state)) {
    resetTerrainPaths();
    if (state.terrainWaiter) state.terrainWaiter.reject(new Error(status.message || "地形底图任务未完成。"));
    state.terrainWaiter = null;
  }
}

async function updateTerrainEstimate() {
  const region = el.regionInput.value.trim();
  if (!region) {
    el.terrainEstimateText.textContent = "导入点位后显示预计大小";
    return;
  }
  const estimate = estimateTerrainClient(region, el.terrainResolutionInput.value);
  el.terrainEstimateText.textContent = estimate.label;
  if (!["starting", "running", "paused"].includes(el.terrainProgressText.dataset.state || "")) {
    el.prepareTerrainBtn.disabled = Boolean(estimate.blocked);
  }
}

function estimateTerrainClient(region, resolution) {
  const values = region.split("/").map((value) => Number(value));
  const info = TERRAIN_RESOLUTIONS[resolution] || TERRAIN_RESOLUTIONS["06m"];
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return { label: "范围无效，无法估算底图大小", blocked: false, warning: "" };
  }
  const lonSpan = Math.max(0, values[1] - values[0]);
  const latSpan = Math.max(0, values[3] - values[2]);
  const cells = Math.max(2, Math.ceil(lonSpan * 3600 / info.seconds)) * Math.max(2, Math.ceil(latSpan * 3600 / info.seconds));
  const bytes = cells * 2 * 2;
  const safety = terrainSafetyClient(values, resolution, cells);
  if (info.source === "srtm") {
    const westTile = Math.floor(values[0]);
    const eastTile = Math.floor(values[1] - Number.EPSILON);
    const southTile = Math.floor(values[2]);
    const northTile = Math.floor(values[3] - Number.EPSILON);
    const tileCount = Math.max(1, eastTile - westTile + 1) * Math.max(1, northTile - southTile + 1);
    const baseLabel = `预计下载约 ${formatBytes(tileCount * 8 * 1024 * 1024)} SRTM 高程瓦片，解压缓存约 ${formatBytes(tileCount * 26 * 1024 * 1024)}，本地网格约 ${formatBytes(bytes)}`;
    return {
      ...safety,
      label: [baseLabel, safety.warning].filter(Boolean).join("。")
    };
  }
  const baseLabel = `预计本地工作文件约 ${formatBytes(bytes)}，实际联网下载量取决于 GMT 分块缓存`;
  return {
    ...safety,
    label: [baseLabel, safety.warning].filter(Boolean).join("。")
  };
}

function terrainSafetyClient(values, resolution, cells) {
  if (cells <= TERRAIN_WARNING_CELL_LIMIT) return { blocked: false, warning: "", recommendedResolution: "", recommendedLabel: "" };
  const recommendedResolution = recommendedTerrainResolutionClient(values);
  const recommendedLabel = recommendedResolution ? TERRAIN_RESOLUTIONS[recommendedResolution].label : "";
  const detail = `当前范围在 ${(TERRAIN_RESOLUTIONS[resolution] || TERRAIN_RESOLUTIONS["06m"]).label} 下约 ${formatCount(cells)} 个地形格点`;
  if (cells > TERRAIN_SAFE_CELL_LIMIT) {
    const advice = recommendedLabel ? `建议改用 ${recommendedLabel}，或先缩小范围后再用高分辨率` : "建议先缩小范围后再使用高分辨率";
    return {
      blocked: true,
      warning: `${detail}，超过安全上限 ${formatCount(TERRAIN_SAFE_CELL_LIMIT)}，为避免软件卡死已停止准备。${advice}`,
      recommendedResolution,
      recommendedLabel
    };
  }
  return {
    blocked: false,
    warning: `${detail}，处理可能较慢；若软件变慢，建议改用 ${coarserRecommendedLabelClient(values, resolution) || "更低分辨率"} 或缩小范围`,
    recommendedResolution,
    recommendedLabel
  };
}

function recommendedTerrainResolutionClient(values) {
  return TERRAIN_RECOMMENDATION_ORDER.find((resolution) => {
    const info = TERRAIN_RESOLUTIONS[resolution] || TERRAIN_RESOLUTIONS["06m"];
    const lonSpan = Math.max(0, values[1] - values[0]);
    const latSpan = Math.max(0, values[3] - values[2]);
    const cells = Math.max(2, Math.ceil(lonSpan * 3600 / info.seconds)) * Math.max(2, Math.ceil(latSpan * 3600 / info.seconds));
    return cells <= TERRAIN_SAFE_CELL_LIMIT;
  }) || "";
}

function coarserRecommendedLabelClient(values, currentResolution) {
  const currentInfo = TERRAIN_RESOLUTIONS[currentResolution] || TERRAIN_RESOLUTIONS["06m"];
  const resolution = TERRAIN_RECOMMENDATION_ORDER.find((candidate) => {
    const info = TERRAIN_RESOLUTIONS[candidate] || TERRAIN_RESOLUTIONS["06m"];
    if (info.seconds <= currentInfo.seconds) return false;
    const lonSpan = Math.max(0, values[1] - values[0]);
    const latSpan = Math.max(0, values[3] - values[2]);
    const cells = Math.max(2, Math.ceil(lonSpan * 3600 / info.seconds)) * Math.max(2, Math.ceil(latSpan * 3600 / info.seconds));
    return cells <= TERRAIN_SAFE_CELL_LIMIT;
  });
  return resolution ? TERRAIN_RESOLUTIONS[resolution].label : "";
}

function terrainKeyClient(config) {
  return [
    state.outputDirectory,
    config.region,
    config.terrainResolution,
    config.terrainIntensity
  ].join("|");
}

function resetTerrainPaths() {
  state.terrain = { key: "", gridPath: "", shadePath: "", region: "", resolution: "" };
}

async function deleteLocalTerrain() {
  const result = await window.mtApp.deleteLocalTerrain({ outputDirectory: state.outputDirectory });
  resetTerrainPaths();
  el.terrainProgressPanel.classList.add("hidden");
  notify(result.message);
}

async function clearTerrainCache() {
  if (!confirm("这会清理 GMT 下载过的 earth_relief 地形缓存。以后再用地形底图可能需要重新联网下载。确定继续吗？")) return;
  const result = await window.mtApp.clearTerrainCache();
  notify(result.message);
}

async function saveScript() {
  if (!state.records.length) return notify("请先导入点位数据。");
  const config = readConfig();
  if (!validatePlotReadiness(config)) return;
  if (config.showTerrain) {
    const ready = await ensureTerrainReady(config);
    if (!ready) return;
    config.terrainGridPath = state.terrain.gridPath;
    config.terrainShadePath = state.terrain.shadePath;
  }
  let saved;
  try {
    saved = await window.mtApp.saveScript({ records: state.records, config, outputDirectory: state.outputDirectory });
  } catch (error) {
    notify(error.message || String(error));
    return;
  }
  if (saved) notify(`GMT 脚本已保存：${saved}`);
}

function validatePlotReadiness(config) {
  if (["strikeMap", "phaseTensorMap", "tipperMap", "responseCurve"].includes(config.plotType)) {
    const hasMT = state.records.some((record) => record.mtResponses?.length);
    if (!hasMT) {
      notify("当前数据只有点位坐标，没有可用于走向、相位张量、Tipper 或曲线图的 MT 响应数据。请导入 EDI 文件夹，或在表格中提供周期/频率与阻抗张量列。");
      return false;
    }
  }
  if (config.plotType === "responseCurve" && !config.curveStation) {
    notify("请选择一个包含 MT 响应数据的测点。");
    return false;
  }
  return true;
}

function populateColorControls() {
  setupColorControl("pointFill", "#d7191c");
  setupColorControl("penColor", "black");
  setupColorControl("labelColor", "black");
}

function setupColorControl(key, initialValue) {
  const select = el[`${key}Input`];
  const picker = el[`${key}Picker`];
  select.innerHTML = "";
  for (const [value, label] of COLOR_OPTIONS) {
    select.append(new Option(label, value));
  }
  setColorControlValue(key, initialValue);
  select.addEventListener("change", () => {
    if (select.value === CUSTOM_COLOR_VALUE) {
      picker.disabled = false;
      picker.click();
    } else {
      picker.disabled = true;
      picker.value = colorToHex(select.value);
    }
  });
  picker.addEventListener("input", () => {
    select.value = CUSTOM_COLOR_VALUE;
    picker.disabled = false;
  });
}

function setColorControlValue(key, value) {
  const select = el[`${key}Input`];
  const picker = el[`${key}Picker`];
  const known = COLOR_OPTIONS.some(([optionValue]) => optionValue === value);
  select.value = known ? value : CUSTOM_COLOR_VALUE;
  picker.value = colorToHex(value);
  picker.disabled = known;
}

function readColor(key) {
  const select = el[`${key}Input`];
  if (select.value === CUSTOM_COLOR_VALUE) return el[`${key}Picker`].value;
  return select.value;
}

function colorToHex(value) {
  const named = {
    black: "#000000",
    white: "#ffffff",
    gray50: "#808080",
    yellow: "#ffff00",
    cyan: "#00ffff",
    magenta: "#ff00ff"
  };
  const text = String(value || "").trim();
  return named[text] || (/^#[0-9a-f]{6}$/i.test(text) ? text : "#000000");
}

function renderStationRows() {
  el.stationRows.innerHTML = "";
  for (const record of state.records.slice(0, 200)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHTML(record.name)}</td><td>${record.lon.toFixed(6)}</td><td>${record.lat.toFixed(6)}</td>`;
    el.stationRows.append(tr);
  }
}

function populateMTControls() {
  const periods = availablePeriodsClient();
  el.mtPeriodInput.innerHTML = "";
  if (!periods.length) {
    el.mtPeriodInput.append(new Option("无 MT 周期数据", ""));
  } else {
    for (const period of periods) {
      el.mtPeriodInput.append(new Option(`${formatPeriod(period)} s`, String(period)));
    }
    el.mtPeriodInput.value = String(periods[Math.floor(periods.length / 2)] || periods[0]);
  }
  el.curveStationInput.innerHTML = "";
  const curveRecords = state.records.filter((record) => record.mtResponses?.length);
  for (const record of curveRecords) el.curveStationInput.append(new Option(record.name, record.name));
}

function availablePeriodsClient() {
  const values = [];
  for (const record of state.records) {
    for (const response of record.mtResponses || []) {
      if (Number.isFinite(response.period) && response.period > 0) values.push(Number(response.period.toPrecision(8)));
    }
  }
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function formatPeriod(period) {
  if (period >= 1000) return period.toExponential(2);
  if (period >= 1) return period.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return period.toExponential(2);
}

async function renderPreview(filePath) {
  try {
    const url = await window.mtApp.imageDataUrl(filePath);
    el.previewBox.innerHTML = `<img src="${url}" alt="GMT 点位图预览" />`;
  } catch (error) {
    el.previewBox.innerHTML = `<span>预览图读取失败：${escapeHTML(error.message || String(error))}</span>`;
  }
}

function renderPlaceholder() {
  const labels = {
    stationMap: "点击“生成预览”绘制点位图",
    strikeMap: "选择周期后生成走向图",
    phaseTensorMap: "选择周期后生成相位张量椭圆图",
    tipperMap: "选择周期和分量后生成感应矢量图",
    responseCurve: "选择测点后生成视电阻率和相位曲线"
  };
  el.previewBox.innerHTML = `<span>${labels[state.plotType] || labels.stationMap}</span>`;
}

function autoRegionClient(records) {
  const lons = records.map((record) => record.lon);
  const lats = records.map((record) => record.lat);
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const lonPad = Math.max((east - west) * 0.12, 0.001);
  const latPad = Math.max((north - south) * 0.12, 0.001);
  return `${(west - lonPad).toFixed(6)}/${(east + lonPad).toFixed(6)}/${(south - latPad).toFixed(6)}/${(north + latPad).toFixed(6)}`;
}

function fileName(filePath) {
  return String(filePath || "").split(/[\\/]/).pop() || "点位文件";
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function notify(message) {
  alert(message);
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatCount(value) {
  const count = Math.max(0, Number(value) || 0);
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(Math.round(count));
}

function readableDownloadState(state) {
  return {
    starting: "准备中",
    downloading: "下载中",
    paused: "已暂停",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消"
  }[state] || "";
}

function readableTerrainState(state) {
  return {
    starting: "准备中",
    running: "处理中",
    paused: "已暂停",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消"
  }[state] || "等待准备";
}
