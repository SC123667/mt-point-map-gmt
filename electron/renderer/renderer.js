const state = {
  parsed: null,
  records: [],
  columns: [],
  mapping: null,
  outputDirectory: ""
};

const ids = [
  "appStatus", "dataSummary", "openBtn", "sampleBtn", "nameColumn", "lonColumn", "latColumn",
  "lineColumn", "elevationColumn", "applyMappingBtn", "stationRows", "previewBtn", "previewBox",
  "exportPngBtn", "exportPdfBtn", "exportBothBtn", "saveScriptBtn", "installBtn", "recheckBtn",
  "downloadPanel", "downloadTitle", "downloadStatus", "downloadProgress", "downloadBytes", "downloadPercent",
  "downloadSpeed", "pauseDownloadBtn", "resumeDownloadBtn", "cancelDownloadBtn",
  "installPlanText", "outputPath", "titleInput", "regionInput", "projectionInput", "frameInput",
  "autoRegionBtn", "symbolInput", "pointSizeInput", "pointFillInput", "penWidthInput", "penColorInput",
  "showLabelsInput", "labelSizeInput", "labelColorInput", "labelDXInput", "labelDYInput",
  "showGridInput", "showScaleInput", "showNorthInput", "outputNameInput"
];
const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

window.addEventListener("DOMContentLoaded", async () => {
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
  el.recheckBtn.addEventListener("click", recheckGMT);
  el.installBtn.addEventListener("click", installGMT);
  el.pauseDownloadBtn.addEventListener("click", () => window.mtApp.pauseGMTDownload());
  el.resumeDownloadBtn.addEventListener("click", () => window.mtApp.resumeGMTDownload());
  el.cancelDownloadBtn.addEventListener("click", () => window.mtApp.cancelGMTDownload());
  window.mtApp.onGMTDownloadProgress(renderDownloadProgress);
  document.querySelectorAll("[data-link]").forEach((button) => {
    button.addEventListener("click", () => window.mtApp.openExternal(button.dataset.link));
  });
}

async function refreshStatus() {
  const status = await window.mtApp.status();
  state.outputDirectory = status.outputDirectory;
  el.outputPath.textContent = `输出目录：${state.outputDirectory}`;
  renderGMTStatus(status.gmtAvailable, status.installPlan, status.gmtInfo);
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
  el.dataSummary.textContent = `${fileName(parsed.filePath)}\n已识别 ${parsed.records.length} 个点位`;
  populateColumnSelects();
  renderStationRows();
  renderPlaceholder();
}

function populateColumnSelects() {
  const selects = [el.nameColumn, el.lonColumn, el.latColumn, el.lineColumn, el.elevationColumn];
  for (const select of selects) {
    select.innerHTML = "";
    select.append(new Option("无", ""));
    for (const column of state.columns) select.append(new Option(column, column));
  }
  el.nameColumn.value = state.mapping.name || "";
  el.lonColumn.value = state.mapping.lon || "";
  el.latColumn.value = state.mapping.lat || "";
  el.lineColumn.value = state.mapping.line || "";
  el.elevationColumn.value = state.mapping.elevation || "";
}

async function applyMapping() {
  if (!state.parsed) return notify("请先导入点位文件。");
  const mapping = readMapping();
  if (!mapping.lon || !mapping.lat) return notify("经度和纬度列必须选择。");
  try {
    const result = await window.mtApp.applyMapping({ rows: state.parsed.rows, mapping });
    state.mapping = mapping;
    state.records = result.records;
    el.regionInput.value = result.region;
    renderStationRows();
    notify("字段映射已更新。");
  } catch (error) {
    notify(error.message);
  }
}

function readMapping() {
  return {
    name: el.nameColumn.value,
    lon: el.lonColumn.value,
    lat: el.latColumn.value,
    line: el.lineColumn.value,
    elevation: el.elevationColumn.value
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
    pointFill: el.pointFillInput.value,
    pointPenWidth: Number(el.penWidthInput.value),
    pointPenColor: el.penColorInput.value,
    labelFontSize: Number(el.labelSizeInput.value),
    labelColor: el.labelColorInput.value,
    labelDX: Number(el.labelDXInput.value),
    labelDY: Number(el.labelDYInput.value),
    outputName: el.outputNameInput.value.trim() || "mt_point_map"
  };
}

async function exportMap(formats, showAlert) {
  if (!state.records.length) return notify("请先导入 TXT/CSV 点位文件。");
  const config = readConfig();
  const result = await window.mtApp.exportMap({ records: state.records, config, formats });
  if (!result.ok) {
    await refreshStatus();
    return notify(`${result.message}\n脚本已保存：${result.scriptPath}`);
  }
  el.outputPath.textContent = `输出目录：${result.outputDirectory}`;
  if (formats.includes("png")) {
    const png = result.files.find((file) => file.toLowerCase().endsWith(".png"));
    if (png) renderPreview(png);
  }
  if (showAlert) notify(`导出完成：\n${result.files.join("\n")}`);
}

async function saveScript() {
  if (!state.records.length) return notify("请先导入 TXT/CSV 点位文件。");
  const saved = await window.mtApp.saveScript({ records: state.records, config: readConfig() });
  if (saved) notify(`GMT 脚本已保存：${saved}`);
}

function renderStationRows() {
  el.stationRows.innerHTML = "";
  for (const record of state.records.slice(0, 200)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHTML(record.name)}</td><td>${record.lon.toFixed(6)}</td><td>${record.lat.toFixed(6)}</td>`;
    el.stationRows.append(tr);
  }
}

function renderPreview(filePath) {
  const url = `file://${encodeURI(filePath.replace(/\\/g, "/"))}?t=${Date.now()}`;
  el.previewBox.innerHTML = `<img src="${url}" alt="GMT 点位图预览" />`;
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
  const lonPad = Math.max((east - west) * 0.12, 0.03);
  const latPad = Math.max((north - south) * 0.12, 0.03);
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
