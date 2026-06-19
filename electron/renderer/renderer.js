const state = {
  parsed: null,
  records: [],
  columns: [],
  mapping: null,
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

const ids = [
  "appStatus", "dataSummary", "openBtn", "sampleBtn", "nameColumn", "lonColumn", "latColumn",
  "lineColumn", "elevationColumn", "applyMappingBtn", "stationRows", "previewBtn", "previewBox",
  "exportPngBtn", "exportPdfBtn", "exportBothBtn", "saveScriptBtn", "installBtn", "recheckBtn",
  "downloadPanel", "downloadTitle", "downloadStatus", "downloadProgress", "downloadBytes", "downloadPercent",
  "downloadSpeed", "pauseDownloadBtn", "resumeDownloadBtn", "cancelDownloadBtn",
  "installPlanText", "outputPath", "chooseOutputBtn", "titleInput", "regionInput", "projectionInput", "frameInput",
  "autoRegionBtn", "showTerrainInput", "terrainResolutionInput", "terrainCptInput", "terrainIntensityInput",
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
  await refreshStatus();
});

function wireEvents() {
  el.openBtn.addEventListener("click", async () => {
    const parsed = await window.mtApp.openFile();
    if (parsed) loadParsed(parsed);
  });
  el.sampleBtn.addEventListener("click", async () => loadParsed(await window.mtApp.loadSample()));
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
  el.dataSummary.textContent = `${fileName(parsed.filePath)}\n已识别 ${parsed.records.length} 个${coordinateText}`;
  if (parsed.mapping.coordinateType === "projected" && parsed.records.length > 50) {
    el.showLabelsInput.checked = false;
  }
  populateColumnSelects();
  renderStationRows();
  renderPlaceholder();
  resetTerrainPaths();
  updateTerrainEstimate();
}

function populateColumnSelects() {
  const selects = [el.nameColumn, el.lonColumn, el.latColumn, el.lineColumn, el.elevationColumn];
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
    elevation: el.elevationColumn.value
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

function readConfig() {
  return {
    title: el.titleInput.value,
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
}

async function exportMap(formats, showAlert) {
  if (!state.records.length) return notify("请先导入 TXT/CSV 点位文件。");
  const config = readConfig();
  if (config.showTerrain) {
    const ready = await ensureTerrainReady(config);
    if (!ready) return;
    config.terrainGridPath = state.terrain.gridPath;
    config.terrainShadePath = state.terrain.shadePath;
  }
  const result = await window.mtApp.exportMap({ records: state.records, config, formats, outputDirectory: state.outputDirectory });
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
}

function estimateTerrainClient(region, resolution) {
  const secondsByResolution = { "20m": 1200, "10m": 600, "06m": 360, "01m": 60, "30s": 30, "15s": 15, "03s": 3, "01s": 1 };
  const srtmResolutions = new Set(["01m", "30s", "15s", "03s", "01s"]);
  const values = region.split("/").map((value) => Number(value));
  const seconds = secondsByResolution[resolution] || 360;
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return { label: "范围无效，无法估算底图大小" };
  }
  const lonSpan = Math.max(0, values[1] - values[0]);
  const latSpan = Math.max(0, values[3] - values[2]);
  const cells = Math.max(2, Math.ceil(lonSpan * 3600 / seconds)) * Math.max(2, Math.ceil(latSpan * 3600 / seconds));
  const bytes = cells * 2 * 2;
  if (srtmResolutions.has(resolution)) {
    const westTile = Math.floor(values[0]);
    const eastTile = Math.floor(values[1] - Number.EPSILON);
    const southTile = Math.floor(values[2]);
    const northTile = Math.floor(values[3] - Number.EPSILON);
    const tileCount = Math.max(1, eastTile - westTile + 1) * Math.max(1, northTile - southTile + 1);
    return {
      label: `预计下载约 ${formatBytes(tileCount * 8 * 1024 * 1024)} SRTM 高程瓦片，解压缓存约 ${formatBytes(tileCount * 26 * 1024 * 1024)}，本地网格约 ${formatBytes(bytes)}`
    };
  }
  return { label: `预计本地工作文件约 ${formatBytes(bytes)}，实际联网下载量取决于 GMT 分块缓存` };
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
  if (!state.records.length) return notify("请先导入 TXT/CSV 点位文件。");
  const config = readConfig();
  if (config.showTerrain) {
    const ready = await ensureTerrainReady(config);
    if (!ready) return;
    config.terrainGridPath = state.terrain.gridPath;
    config.terrainShadePath = state.terrain.shadePath;
  }
  const saved = await window.mtApp.saveScript({ records: state.records, config, outputDirectory: state.outputDirectory });
  if (saved) notify(`GMT 脚本已保存：${saved}`);
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

async function renderPreview(filePath) {
  try {
    const url = await window.mtApp.imageDataUrl(filePath);
    el.previewBox.innerHTML = `<img src="${url}" alt="GMT 点位图预览" />`;
  } catch (error) {
    el.previewBox.innerHTML = `<span>预览图读取失败：${escapeHTML(error.message || String(error))}</span>`;
  }
}

function renderPlaceholder() {
  el.previewBox.innerHTML = "<span>点击“生成预览”绘制点位图</span>";
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
