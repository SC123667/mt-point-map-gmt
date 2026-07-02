const state = {
  parsed: null,
  allRecords: [],
  records: [],
  columns: [],
  mapping: null,
  plotType: "stationMap",
  outputDirectory: "",
  projectPath: "",
  filters: {
    line: "",
    prefix: "",
    regionOnly: false,
    mtOnly: false
  },
  terrain: {
    key: "",
    pendingKey: "",
    gridPath: "",
    shadePath: "",
    region: "",
    resolution: "",
    localGridPath: ""
  },
  preview: {
    hasImage: false,
    imageWidth: 0,
    imageHeight: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    selecting: false,
    panning: false,
    rendering: false,
    queuedAuto: false,
    autoTimer: null,
    selectionStart: null,
    selectionEnd: null,
    dragStart: null,
    dragPanStart: null
  },
  terrainWaiter: null,
  faultLayers: [],
  window: {
    platform: "",
    isFullScreen: false
  },
  legendPosition: {
    x: 0.98,
    y: 0.98,
    justify: "TR",
    dragging: false
  },
  elementPositions: {
    scale: {
      x: 0.92,
      y: 0.08,
      justify: "BR",
      dragging: false
    },
    north: {
      x: 0.92,
      y: 0.92,
      justify: "TR",
      dragging: false
    }
  },
  legendLabels: {
    stationTouched: false,
    overlayTouched: false
  },
  settingsDialog: {
    panel: "",
    items: []
  }
};

const PREVIEW_MIN_ZOOM = 1;
const PREVIEW_MAX_ZOOM = 16;
const PREVIEW_WHEEL_SENSITIVITY = 0.00075;
const AUTO_PREVIEW_DELAY_MS = 700;
const CUSTOM_COLOR_VALUE = "__custom__";
const CUSTOM_TERRAIN_SERVER_VALUE = "__custom__";
const DEFAULT_TERRAIN_DATA_SERVER = "https://mirrors.ustc.edu.cn/gmtdata";
const ELEMENT_POSITION_DEFAULTS = {
  TL: { x: 0.08, y: 0.92, justify: "TL" },
  TR: { x: 0.92, y: 0.92, justify: "TR" },
  BL: { x: 0.08, y: 0.08, justify: "BL" },
  BR: { x: 0.92, y: 0.08, justify: "BR" }
};
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
const SETTINGS_PANELS = {
  data: "数据",
  quality: "数据质检",
  filters: "筛选/分组绘图",
  fields: "字段识别",
  mtFields: "MT 响应字段",
  frame: "图幅",
  terrain: "地形底图",
  overlay: "叠加层与图例",
  symbol: "点位符号",
  labels: "测点标签",
  elements: "图件元素",
  mtParams: "MT 图件参数",
  presets: "绘图模板/预设"
};

const ids = [
  "appStatus", "dataSummary", "qualitySummary", "qualityIssueList", "exportSkippedEdiBtn",
  "filterLineInput", "filterPrefixInput", "filterRegionOnlyInput", "filterMtOnlyInput", "filterSummary", "applyFilterBtn", "clearFilterBtn",
  "nameColumn", "lonColumn", "latColumn",
  "lineColumn", "elevationColumn", "applyMappingBtn", "stationRows", "previewBtn", "previewBox",
  "previewImageLayer", "previewSelection", "previewZoomControls", "previewZoomLabel", "previewFitBtn", "previewPlaceholder",
  "previewStatus", "cancelRenderBtn", "legendDragHandle", "scaleDragHandle", "northDragHandle",
  "periodColumn", "frequencyColumn", "zxxrColumn", "zxxiColumn", "zxyrColumn", "zxyiColumn", "zyxrColumn", "zyxiColumn",
  "zyyrColumn", "zyyiColumn", "txrColumn", "txiColumn", "tyrColumn", "tyiColumn", "strikeColumn", "ptAzimuthColumn",
  "ptMaxColumn", "ptMinColumn", "betaColumn", "mtPeriodInput", "curveStationInput", "tableHelpBtn", "tableHelpDialog", "closeTableHelpBtn",
  "exportPngBtn", "exportPdfBtn", "exportBothBtn", "exportAllBtn", "saveScriptBtn", "installBtn", "recheckBtn",
  "downloadPanel", "downloadTitle", "downloadStatus", "downloadProgress", "downloadBytes", "downloadPercent",
  "downloadSpeed", "pauseDownloadBtn", "resumeDownloadBtn", "cancelDownloadBtn",
  "settingsDialog", "settingsDialogTitle", "settingsDialogBody", "settingsCloseBtn", "settingsCancelBtn", "settingsConfirmBtn",
  "pngDpiDialog", "pngDpiDialogInput", "pngDpiCancelBtn", "pngDpiDialogCancelBtn", "pngDpiConfirmBtn",
  "windowControls", "exitFullscreenBtn", "minimizeWindowBtn", "closeWindowBtn",
  "installPlanText", "outputPath", "chooseOutputBtn", "titleInput", "regionInput", "projectionInput", "frameInput",
	  "autoRegionBtn", "showTerrainInput", "terrainResolutionInput", "terrainCptInput", "terrainIntensityInput",
	  "inspectorTitle", "plotTypeHint", "strikeLengthInput", "strikeColorInput", "tensorScaleInput", "tensorPenColorInput",
	  "tipperComponentInput", "tipperConventionInput", "tipperScaleInput",
	  "terrainAllowDownloadInput", "terrainDataServerInput", "terrainDataServerCustomRow", "terrainDataServerCustomInput",
    "terrainEstimateText", "prepareTerrainBtn", "pauseTerrainBtn", "resumeTerrainBtn",
	  "cancelTerrainBtn", "terrainProgressPanel", "terrainProgress", "terrainProgressText", "terrainProgressPercent",
	  "deleteTerrainBtn", "clearTerrainCacheBtn", "terrainDocsBtn", "chooseLocalTerrainBtn", "clearLocalTerrainBtn", "localTerrainText",
    "terrainCacheSummaryText", "terrainCacheResolutionInput", "refreshTerrainCacheBtn", "deleteTerrainCurrentCacheBtn", "deleteTerrainCacheResolutionBtn",
  "symbolInput", "pointSizeInput", "pointFillInput", "pointFillPicker", "penWidthInput",
  "penColorInput", "penColorPicker", "showLabelsInput", "labelSizeInput", "labelColorInput", "labelColorPicker",
  "labelModeInput", "labelPrefixInput", "labelEveryInput", "labelDXInput", "labelDYInput",
	  "showGridInput", "showScaleInput", "scalePositionInput", "showNorthInput", "northPositionInput", "pngDpiInput", "outputNameInput",
  "faultColorInput", "importFaultBtn", "clearFaultsBtn", "faultFileList", "faultOverlaySummary",
  "showLegendInput", "legendTitleInput", "legendPositionInput", "legendIncludeFaultsInput", "legendPositionHint",
  "legendOrderInput", "legendStationLabelInput", "legendOverlayLabelInput",
  "legendWidthInput", "legendTitleSizeInput", "legendLabelSizeInput", "legendTextColorInput", "legendTextColorPicker",
  "legendBackgroundInput", "legendBackgroundPicker", "legendBackgroundAlphaInput", "legendBorderColorInput",
  "legendBorderColorPicker", "legendBorderWidthInput",
  "deleteOutputBtn", "runtimeStatus", "gmtStatusText", "versionText"
];
const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

window.addEventListener("DOMContentLoaded", async () => {
  populateColorControls();
  wireEvents();
  renderLocalTerrainGrid();
  renderTerrainDataServerCustom();
  renderFaultLayers();
  setPlotType("stationMap");
  await refreshStatus();
});

function bind(control, eventName, handler, options) {
  if (control) control.addEventListener(eventName, handler, options);
}

function wireEvents() {
  initWindowControls();
  window.mtApp.onMenuOpenFile(openPointFile);
  window.mtApp.onMenuOpenEdiDirectory(openEdiDirectory);
  window.mtApp.onMenuOpenProject?.(openProjectFile);
  window.mtApp.onMenuSaveProject?.(saveProjectFile);
  window.mtApp.onMenuLoadSample(loadSampleData);
  window.mtApp.onMenuChooseOutputDirectory(chooseOutputDirectory);
  window.mtApp.onMenuShowTableHelp?.(showTableHelp);
  window.mtApp.onMenuExportPng?.(() => exportMap(["png"], true));
  window.mtApp.onMenuExportPdf?.(() => exportMap(["pdf"], true));
  window.mtApp.onMenuExportBoth?.(() => exportMap(["png", "pdf"], true));
  window.mtApp.onMenuExportEps?.(() => exportMap(["eps"], true));
  window.mtApp.onMenuExportAll?.(() => exportMap(["png", "pdf", "eps"], true));
  window.mtApp.onMenuSaveScript?.(saveScript);
  window.mtApp.onMenuDeleteOutputs?.(deleteCurrentOutputs);
  window.mtApp.onMenuOpenSettingsPanel?.((panel) => openSettingsPanel(panel));
  window.mtApp.onMenuResetLayout?.(resetWorkbenchLayout);
  window.mtApp.onMenuRecheckGMT?.(recheckGMT);
  window.mtApp.onMenuInstallGMT?.(installGMT);
  document.querySelectorAll(".tool-tab").forEach((button) => {
    button.addEventListener("click", () => setPlotType(button.dataset.plotType));
  });
  document.querySelectorAll(".settings-tool[data-settings-panel]").forEach((button) => {
    button.addEventListener("click", () => openSettingsPanel(button.dataset.settingsPanel));
  });
  bind(el.tableHelpBtn, "click", showTableHelp);
  bind(el.mtPeriodInput, "change", () => scheduleAutoPreview("周期已切换，正在自动绘制预览...", { delay: 120 }));
  bind(el.closeTableHelpBtn, "click", () => el.tableHelpDialog.close());
  bind(el.applyMappingBtn, "click", () => applyMapping({ autoPreview: true }));
  bind(el.exportSkippedEdiBtn, "click", exportSkippedEdiList);
  bind(el.applyFilterBtn, "click", () => applyFiltersFromUI({ autoPreview: true }));
  bind(el.clearFilterBtn, "click", () => clearFilters({ autoPreview: true }));
  bind(el.settingsCloseBtn, "click", closeSettingsDialog);
  bind(el.settingsCancelBtn, "click", closeSettingsDialog);
  bind(el.settingsConfirmBtn, "click", confirmSettingsDialog);
  bind(el.settingsDialog, "cancel", (event) => {
    event.preventDefault();
    closeSettingsDialog();
  });
  bind(el.autoRegionBtn, "click", () => {
    if (!state.records.length) return notify("请先导入点位文件。");
    el.regionInput.value = autoRegionClient(state.records);
    scheduleAutoPreview("图幅范围已更新，正在自动绘制预览...", { delay: 100 });
  });
  bind(el.previewBtn, "click", () => exportMap(["png"], false));
  bind(el.cancelRenderBtn, "click", cancelCurrentRender);
  bind(el.exportPngBtn, "click", () => exportMap(["png"], true));
  bind(el.exportPdfBtn, "click", () => exportMap(["pdf"], true));
  bind(el.exportBothBtn, "click", () => exportMap(["png", "pdf"], true));
  bind(el.exportAllBtn, "click", () => exportMap(["png", "pdf", "eps"], true));
  bind(el.saveScriptBtn, "click", saveScript);
  bind(el.deleteOutputBtn, "click", deleteCurrentOutputs);
  bind(el.chooseOutputBtn, "click", chooseOutputDirectory);
  bind(el.importFaultBtn, "click", importFaultLayers);
  bind(el.clearFaultsBtn, "click", clearFaultLayers);
  wireLegendControls();
  bind(el.previewFitBtn, "click", () => resetPreviewView());
  bind(el.previewBox, "wheel", handlePreviewWheel, { passive: false });
  bind(el.previewBox, "pointerdown", handlePreviewPointerDown);
  bind(el.previewBox, "pointermove", handlePreviewPointerMove);
  bind(el.previewBox, "pointerup", handlePreviewPointerUp);
  bind(el.previewBox, "pointercancel", cancelPreviewInteraction);
  bind(el.legendDragHandle, "pointerdown", handleLegendPointerDown);
  bind(el.legendDragHandle, "pointermove", handleLegendPointerMove);
  bind(el.legendDragHandle, "pointerup", handleLegendPointerUp);
  bind(el.legendDragHandle, "pointercancel", cancelLegendDrag);
  bind(el.scaleDragHandle, "pointerdown", (event) => handleElementPointerDown(event, "scale"));
  bind(el.scaleDragHandle, "pointermove", (event) => handleElementPointerMove(event, "scale"));
  bind(el.scaleDragHandle, "pointerup", (event) => handleElementPointerUp(event, "scale"));
  bind(el.scaleDragHandle, "pointercancel", () => cancelElementDrag("scale"));
  bind(el.northDragHandle, "pointerdown", (event) => handleElementPointerDown(event, "north"));
  bind(el.northDragHandle, "pointermove", (event) => handleElementPointerMove(event, "north"));
  bind(el.northDragHandle, "pointerup", (event) => handleElementPointerUp(event, "north"));
  bind(el.northDragHandle, "pointercancel", () => cancelElementDrag("north"));
  bind(el.prepareTerrainBtn, "click", () => prepareTerrain(false));
  bind(el.pauseTerrainBtn, "click", () => window.mtApp.pauseTerrain());
  bind(el.resumeTerrainBtn, "click", () => window.mtApp.resumeTerrain());
  bind(el.cancelTerrainBtn, "click", () => window.mtApp.cancelTerrain());
  bind(el.deleteTerrainBtn, "click", deleteLocalTerrain);
  bind(el.clearTerrainCacheBtn, "click", clearTerrainCache);
  bind(el.refreshTerrainCacheBtn, "click", refreshTerrainCacheSummary);
  bind(el.deleteTerrainCurrentCacheBtn, "click", deleteCurrentTerrainCache);
  bind(el.deleteTerrainCacheResolutionBtn, "click", deleteTerrainCacheResolution);
  bind(el.chooseLocalTerrainBtn, "click", chooseLocalTerrainGrid);
  bind(el.clearLocalTerrainBtn, "click", clearLocalTerrainGrid);
  bind(el.terrainDocsBtn, "click", () => window.mtApp.openExternal("https://docs.generic-mapping-tools.org/6.6/datasets/remote-data.html"));
  [el.showTerrainInput, el.terrainResolutionInput, el.terrainIntensityInput, el.regionInput, el.terrainDataServerInput, el.terrainDataServerCustomInput].forEach((control) => {
    bind(control, "input", updateTerrainEstimate);
    bind(control, "change", updateTerrainEstimate);
  });
  bind(el.terrainDataServerInput, "change", renderTerrainDataServerCustom);
  bind(el.showScaleInput, "change", () => {
    renderDraggableMapElements();
    scheduleAutoPreview("比例尺显示状态已更改，正在自动更新预览...");
  });
  bind(el.scalePositionInput, "change", () => {
    syncElementPositionFromSelect("scale");
    renderDraggableMapElements();
    scheduleAutoPreview("比例尺位置已更改，正在自动更新预览...");
  });
  bind(el.showNorthInput, "change", () => {
    renderDraggableMapElements();
    scheduleAutoPreview("指北针显示状态已更改，正在自动更新预览...");
  });
  bind(el.northPositionInput, "change", () => {
    syncElementPositionFromSelect("north");
    renderDraggableMapElements();
    scheduleAutoPreview("指北针位置已更改，正在自动更新预览...");
  });
  bind(el.recheckBtn, "click", recheckGMT);
  bind(el.installBtn, "click", installGMT);
  bind(el.pauseDownloadBtn, "click", () => window.mtApp.pauseGMTDownload());
  bind(el.resumeDownloadBtn, "click", () => window.mtApp.resumeGMTDownload());
  bind(el.cancelDownloadBtn, "click", () => window.mtApp.cancelGMTDownload());
  window.mtApp.onGMTDownloadProgress(renderDownloadProgress);
  window.mtApp.onTerrainProgress(renderTerrainProgress);
  window.mtApp.onGMTRenderProgress?.(renderGMTRenderProgress);
  document.querySelectorAll(".preset-button").forEach((button) => {
    button.addEventListener("click", () => applyPlotPreset(button.dataset.preset));
  });
  document.querySelectorAll("[data-link]").forEach((button) => {
    button.addEventListener("click", () => window.mtApp.openExternal(button.dataset.link));
  });
}

async function initWindowControls() {
  bind(el.exitFullscreenBtn, "click", () => window.mtApp.exitWindowFullscreen?.());
  bind(el.minimizeWindowBtn, "click", () => window.mtApp.minimizeWindow?.());
  bind(el.closeWindowBtn, "click", () => window.mtApp.closeWindow?.());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.window.isFullScreen) {
      event.preventDefault();
      window.mtApp.exitWindowFullscreen?.();
    } else if (event.key === "F11") {
      event.preventDefault();
      window.mtApp.toggleWindowFullscreen?.();
    }
  });
  window.mtApp.onWindowState?.(renderWindowControls);
  try {
    const snapshot = await window.mtApp.getWindowState?.();
    renderWindowControls(snapshot || {});
  } catch (_error) {
    renderWindowControls({ platform: "" });
  }
}

function renderWindowControls(snapshot = {}) {
  state.window = {
    platform: snapshot.platform || state.window.platform || "",
    isFullScreen: Boolean(snapshot.isFullScreen)
  };
  document.body.dataset.platform = state.window.platform;
  document.body.classList.toggle("is-fullscreen", state.window.isFullScreen);
  const shouldShowControls = state.window.platform && state.window.platform !== "darwin";
  el.windowControls?.classList.toggle("hidden", !shouldShowControls);
  el.exitFullscreenBtn?.classList.toggle("hidden", !state.window.isFullScreen);
}

function resetWorkbenchLayout() {
  closeSettingsDialog();
  resetPreviewView();
  hidePreviewStatus();
  renderDraggableMapElements();
  setRuntimeStatus("工作台布局已重置");
}

function wireLegendControls() {
  const queueLegendPreview = (message = "图例设置已更改，正在自动更新预览...") => {
    renderFaultLayers();
    renderLegendDragHandle();
    scheduleAutoPreview(message);
  };
  el.showLegendInput.addEventListener("change", () => queueLegendPreview("图例显示状态已更改，正在自动更新预览..."));
  el.legendIncludeFaultsInput.addEventListener("change", () => queueLegendPreview("图例内容已更改，正在自动更新预览..."));
  el.legendOrderInput.addEventListener("change", () => queueLegendPreview("图例顺序已更改，正在自动更新预览..."));
  el.legendTitleInput.addEventListener("input", () => queueLegendPreview("图例标题已更改，正在自动更新预览..."));
  el.legendStationLabelInput.addEventListener("input", () => {
    state.legendLabels.stationTouched = true;
    queueLegendPreview("图例文字已更改，正在自动更新预览...");
  });
  el.legendOverlayLabelInput.addEventListener("input", () => {
    state.legendLabels.overlayTouched = true;
    queueLegendPreview("图例文字已更改，正在自动更新预览...");
  });
  el.legendPositionInput.addEventListener("change", () => {
    const next = parseLegendPosition(el.legendPositionInput.value);
    if (next) state.legendPosition = { ...state.legendPosition, ...next, dragging: false };
    queueLegendPreview("图例位置已更改，正在自动更新预览...");
  });
  [
    el.legendWidthInput,
    el.legendTitleSizeInput,
    el.legendLabelSizeInput,
    el.legendBackgroundAlphaInput,
    el.legendBorderWidthInput
  ].forEach((control) => {
    control.addEventListener("input", () => queueLegendPreview("图例样式已更改，正在自动更新预览..."));
  });
  [
    el.symbolInput,
    el.pointSizeInput,
    el.penWidthInput,
    el.strikeColorInput,
    el.tensorPenColorInput
  ].forEach((control) => {
    control.addEventListener("input", () => queueLegendPreview("图件符号已更改，正在自动更新预览..."));
    control.addEventListener("change", () => queueLegendPreview("图件符号已更改，正在自动更新预览..."));
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
  syncLegendLabelDefaults();
  el.outputNameInput.value = defaultOutputNameForPlot(state.plotType);
  renderPlaceholder();
  scheduleAutoPreview("图件类型已切换，正在自动绘制预览...", { delay: 120 });
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

function syncLegendLabelDefaults() {
  if (!state.legendLabels.stationTouched) el.legendStationLabelInput.value = "Station";
  if (!state.legendLabels.overlayTouched) el.legendOverlayLabelInput.value = defaultLegendOverlayLabel(state.plotType);
}

function defaultLegendOverlayLabel(plotType) {
  return {
    strikeMap: "Strike",
    phaseTensorMap: "Phase tensor",
    tipperMap: "Tipper"
  }[plotType] || "Overlay";
}

function showTableHelp() {
  if (typeof el.tableHelpDialog.showModal === "function") el.tableHelpDialog.showModal();
  else notify("表格格式：基础列为测点名、经度、纬度；MT 列为 period/freq、ZXXR/ZXXI、ZXYR/ZXYI、ZYXR/ZYXI、ZYYR/ZYYI、TXR/TXI、TYR/TYI。");
}

function openSettingsPanel(panel) {
  const panelKey = SETTINGS_PANELS[panel] ? panel : "frame";
  closeSettingsDialog();
  const nodes = Array.from(document.querySelectorAll(`[data-settings-panel="${panelKey}"]`));
  if (!nodes.length) return notify("这个设置面板还没有可编辑内容。");
  el.settingsDialogTitle.textContent = SETTINGS_PANELS[panelKey];
  el.settingsDialogBody.replaceChildren();
  state.settingsDialog.panel = panelKey;
  state.settingsDialog.items = nodes.map((node) => {
    const placeholder = document.createComment(`settings:${panelKey}`);
    node.parentNode.insertBefore(placeholder, node);
    if (node.tagName === "DETAILS") node.open = true;
    el.settingsDialogBody.append(node);
    return { node, placeholder };
  });
  if (typeof el.settingsDialog.showModal === "function") el.settingsDialog.showModal();
  else el.settingsDialog.setAttribute("open", "");
}

function closeSettingsDialog(options = {}) {
  restoreSettingsDialogNodes();
  state.settingsDialog.panel = "";
  if (!options.keepClosed && el.settingsDialog?.open) el.settingsDialog.close();
}

function restoreSettingsDialogNodes() {
  for (const item of state.settingsDialog.items) {
    if (!item.placeholder?.parentNode) continue;
    item.placeholder.parentNode.insertBefore(item.node, item.placeholder);
    item.placeholder.remove();
  }
  state.settingsDialog.items = [];
  el.settingsDialogBody?.replaceChildren();
}

async function confirmSettingsDialog() {
  const panel = state.settingsDialog.panel;
  if (panel === "fields" || panel === "mtFields") {
    const applied = await applyMapping({ silent: true });
    if (!applied) return;
  }
  closeSettingsDialog();
  scheduleAutoPreview(`${SETTINGS_PANELS[panel] || "设置"}已更新，正在自动绘制预览...`, { delay: 120 });
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

async function saveProjectFile() {
  if (!state.parsed || !state.allRecords.length) return notify("请先导入数据后再保存工程。");
  const project = createProjectSnapshot();
  try {
    const saved = await window.mtApp.saveProject({
      suggestedName: project.config?.outputName || "mt_gmt_project",
      project
    });
    if (!saved) return;
    state.projectPath = saved;
    notify(`工程已保存：${saved}`);
  } catch (error) {
    notify(error.message || String(error));
  }
}

async function openProjectFile() {
  try {
    const opened = await window.mtApp.openProject();
    if (!opened?.project) return;
    restoreProjectSnapshot(opened.project, opened.filePath);
    notify(`工程已打开：${opened.filePath}`);
  } catch (error) {
    notify(`工程打开失败：${error.message || String(error)}`);
  }
}

function createProjectSnapshot() {
  const parsed = state.parsed ? { ...state.parsed, records: state.allRecords } : null;
  return {
    schema: "mt-point-map-gmt-project",
    schemaVersion: 1,
    appVersion: el.versionText?.textContent?.replace(/^v/, "") || "",
    savedAt: new Date().toISOString(),
    parsed,
    allRecords: state.allRecords,
    filters: { ...state.filters },
    plotType: state.plotType,
    outputDirectory: state.outputDirectory,
    terrain: { ...state.terrain },
    faultLayers: state.faultLayers.map((layer) => ({ ...layer })),
    legendPosition: { ...state.legendPosition, dragging: false },
    elementPositions: {
      scale: { ...state.elementPositions.scale, dragging: false },
      north: { ...state.elementPositions.north, dragging: false }
    },
    legendLabels: { ...state.legendLabels },
    config: readConfig()
  };
}

function restoreProjectSnapshot(project, filePath = "") {
  if (project?.schema !== "mt-point-map-gmt-project") throw new Error("这不是有效的 MT-GMT 工程文件。");
  state.projectPath = filePath;
  state.filters = { ...(project.filters || state.filters) };
  state.outputDirectory = project.outputDirectory || state.outputDirectory;
  renderOutputDirectory();
  const parsed = project.parsed || {};
  parsed.records = project.allRecords || parsed.records || [];
  if (!parsed.columns) parsed.columns = project.columns || [];
  if (!parsed.mapping) parsed.mapping = project.mapping || { coordinateType: "geographic" };
  if (!parsed.region && project.config?.region) parsed.region = project.config.region;
  loadParsed(parsed, { autoPreview: false, keepFilters: true, keepRegion: true });
  applyConfigToUI(project.config || {});
  state.faultLayers = (project.faultLayers || []).map((layer) => ({ ...layer }));
  state.terrain = { ...state.terrain, ...(project.terrain || {}) };
  state.legendPosition = { ...state.legendPosition, ...(project.legendPosition || {}), dragging: false };
  state.elementPositions = {
    scale: { ...state.elementPositions.scale, ...(project.elementPositions?.scale || {}), dragging: false },
    north: { ...state.elementPositions.north, ...(project.elementPositions?.north || {}), dragging: false }
  };
  state.legendLabels = { ...state.legendLabels, ...(project.legendLabels || {}) };
  populateFilterControls();
  applyRecordFilters({ updateOnly: true });
  renderDataSummary();
  renderStationRows();
  populateMTControls();
  renderQualityPanel();
  renderFaultLayers();
  renderLocalTerrainGrid();
  renderLegendDragHandle();
  renderDraggableMapElements();
  updateTerrainEstimate();
  scheduleAutoPreview("工程已打开，正在自动绘制预览...", { delay: 200 });
}

function applyConfigToUI(config) {
  if (!config) return;
  if (config.plotType) setPlotType(config.plotType);
  setInputValue(el.titleInput, config.title);
  setInputValue(el.regionInput, config.region);
  setInputValue(el.projectionInput, config.projection);
  setInputValue(el.frameInput, config.frame);
  setChecked(el.showGridInput, config.showGrid);
  setChecked(el.showLabelsInput, config.showLabels);
  setInputValue(el.labelModeInput, config.labelMode);
  setInputValue(el.labelPrefixInput, config.labelPrefix);
  setInputValue(el.labelEveryInput, config.labelEvery);
  setChecked(el.showScaleInput, config.showScale);
  setElementPositionFromConfig("scale", config.scalePosition);
  setChecked(el.showNorthInput, config.showNorthArrow);
  setElementPositionFromConfig("north", config.northPosition);
  setInputValue(el.symbolInput, config.pointSymbol);
  setInputValue(el.pointSizeInput, config.pointSize);
  setColorControlValue("pointFill", config.pointFill || "#d7191c");
  setInputValue(el.penWidthInput, config.pointPenWidth);
  setColorControlValue("penColor", config.pointPenColor || "black");
  setInputValue(el.labelSizeInput, config.labelFontSize);
  setColorControlValue("labelColor", config.labelColor || "black");
  setInputValue(el.labelDXInput, config.labelDX);
  setInputValue(el.labelDYInput, config.labelDY);
  setChecked(el.showTerrainInput, config.showTerrain);
  setInputValue(el.terrainResolutionInput, config.terrainResolution);
  setInputValue(el.terrainCptInput, config.terrainCpt);
  setInputValue(el.terrainIntensityInput, config.terrainIntensity);
  setChecked(el.terrainAllowDownloadInput, config.terrainAllowDownload);
  setTerrainDataServerValue(config.terrainDataServer);
  setInputValue(el.outputNameInput, config.outputName);
  setInputValue(el.pngDpiInput, config.pngDpi);
  setInputValue(el.mtPeriodInput, config.mtPeriod);
  setInputValue(el.curveStationInput, config.curveStation);
  setInputValue(el.strikeLengthInput, config.strikeLength);
  setInputValue(el.strikeColorInput, config.strikeColor);
  setInputValue(el.tensorScaleInput, config.tensorScale);
  setInputValue(el.tensorPenColorInput, config.tensorPenColor);
  setInputValue(el.tipperComponentInput, config.tipperComponent);
  setInputValue(el.tipperConventionInput, config.tipperConvention);
  setInputValue(el.tipperScaleInput, config.tipperScale);
  if (config.legend) {
    setChecked(el.showLegendInput, config.legend.show);
    setInputValue(el.legendTitleInput, config.legend.title);
    setInputValue(el.legendStationLabelInput, config.legend.stationLabel);
    setInputValue(el.legendOverlayLabelInput, config.legend.overlayLabel);
    if (config.legend.position) {
      const preset = Array.from(el.legendPositionInput.options).some((option) => option.value === config.legend.position);
      el.legendPositionInput.value = preset ? config.legend.position : "custom";
      const parsed = parseLegendPosition(config.legend.position);
      if (parsed) state.legendPosition = { ...state.legendPosition, ...parsed };
    }
    setChecked(el.legendIncludeFaultsInput, config.legend.includeFaults);
    setInputValue(el.legendOrderInput, config.legend.order);
    setInputValue(el.legendWidthInput, parseFloat(config.legend.width) || config.legend.width);
    setInputValue(el.legendTitleSizeInput, config.legend.titleFontSize);
    setInputValue(el.legendLabelSizeInput, config.legend.labelFontSize);
    setColorControlValue("legendTextColor", config.legend.textColor || "black");
    setColorControlValue("legendBackground", config.legend.backgroundColor || "white");
    setInputValue(el.legendBackgroundAlphaInput, config.legend.backgroundTransparency);
    setColorControlValue("legendBorderColor", config.legend.borderColor || "gray50");
    setInputValue(el.legendBorderWidthInput, config.legend.borderWidth);
  }
}

function setInputValue(input, value) {
  if (!input || value === undefined || value === null || value === "") return;
  input.value = String(value);
}

function setChecked(input, value) {
  if (!input || value === undefined || value === null) return;
  input.checked = Boolean(value);
}

function setTerrainDataServerValue(value) {
  if (!value) return;
  const known = Array.from(el.terrainDataServerInput.options).some((option) => option.value === value);
  if (known) {
    el.terrainDataServerInput.value = value;
  } else {
    el.terrainDataServerInput.value = CUSTOM_TERRAIN_SERVER_VALUE;
    el.terrainDataServerCustomInput.value = value;
  }
  renderTerrainDataServerCustom();
}

function resetFilterState() {
  state.filters = { line: "", prefix: "", regionOnly: false, mtOnly: false };
  if (el.filterLineInput) el.filterLineInput.value = "";
  if (el.filterPrefixInput) el.filterPrefixInput.value = "";
  if (el.filterRegionOnlyInput) el.filterRegionOnlyInput.checked = false;
  if (el.filterMtOnlyInput) el.filterMtOnlyInput.checked = false;
}

function populateFilterControls() {
  el.filterLineInput.innerHTML = "";
  el.filterLineInput.append(new Option("全部测线", ""));
  const lines = Array.from(new Set(state.allRecords.map((record) => String(record.line || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  for (const line of lines) el.filterLineInput.append(new Option(line, line));
  el.filterLineInput.value = state.filters.line || "";
  el.filterPrefixInput.value = state.filters.prefix || "";
  el.filterRegionOnlyInput.checked = Boolean(state.filters.regionOnly);
  el.filterMtOnlyInput.checked = Boolean(state.filters.mtOnly);
  renderFilterSummary();
}

function applyFiltersFromUI(options = {}) {
  state.filters = {
    line: el.filterLineInput.value || "",
    prefix: el.filterPrefixInput.value.trim(),
    regionOnly: el.filterRegionOnlyInput.checked,
    mtOnly: el.filterMtOnlyInput.checked
  };
  applyRecordFilters();
  renderFilterSummary();
  renderDataSummary();
  renderStationRows();
  populateMTControls();
  renderQualityPanel();
  resetTerrainPaths();
  updateTerrainEstimate();
  if (options.autoPreview) scheduleAutoPreview("筛选已应用，正在自动绘制预览...", { delay: 160 });
}

function clearFilters(options = {}) {
  resetFilterState();
  applyFiltersFromUI(options);
}

function applyRecordFilters(options = {}) {
  let records = [...state.allRecords];
  const filters = state.filters || {};
  if (filters.line) records = records.filter((record) => String(record.line || "") === filters.line);
  if (filters.prefix) records = records.filter((record) => String(record.name || "").startsWith(filters.prefix));
  if (filters.mtOnly) records = records.filter((record) => record.mtResponses?.length);
  if (filters.regionOnly) {
    const region = parseRegionClient(el.regionInput?.value || "");
    if (region) records = records.filter((record) => record.lon >= region.west && record.lon <= region.east && record.lat >= region.south && record.lat <= region.north);
  }
  state.records = records;
  if (!options.updateOnly && !records.length && state.allRecords.length) {
    setPreviewStatus("当前筛选没有匹配测点。", "pending");
  }
  return records;
}

function renderFilterSummary() {
  if (!state.allRecords.length) {
    el.filterSummary.textContent = "未导入数据";
    return;
  }
  const active = [];
  if (state.filters.line) active.push(`测线 ${state.filters.line}`);
  if (state.filters.prefix) active.push(`前缀 ${state.filters.prefix}`);
  if (state.filters.regionOnly) active.push("当前图幅范围");
  if (state.filters.mtOnly) active.push("有 MT 响应");
  const prefix = active.length ? active.join(" / ") : "未启用筛选";
  el.filterSummary.textContent = `${prefix}；当前绘图 ${state.records.length} / ${state.allRecords.length} 个测点`;
}

function renderDataSummary() {
  if (!state.parsed) {
    el.dataSummary.textContent = "未导入点位文件";
    return;
  }
  const parsed = state.parsed;
  const coordinateText = parsed.mapping.coordinateType === "projected" ? "高斯投影坐标点位，已自动转经纬度" : "点位";
  const filterText = state.records.length === state.allRecords.length ? "" : `；当前筛选绘制 ${state.records.length} 个`;
  if (parsed.sourceType === "ediDirectory") {
    const skipped = parsed.skippedEdiFiles?.length || 0;
    const total = parsed.totalEdiFiles || state.allRecords.length + skipped;
    el.dataSummary.textContent = `${fileName(parsed.filePath)}\n扫描 ${total} 个 EDI，已读取 ${state.allRecords.length} 个坐标${skipped ? `，跳过 ${skipped} 个无效坐标` : ""}${filterText}`;
  } else {
    el.dataSummary.textContent = `${fileName(parsed.filePath)}\n已识别 ${state.allRecords.length} 个${coordinateText}${filterText}`;
  }
}

function renderQualityPanel() {
  if (!state.allRecords.length) {
    el.qualitySummary.innerHTML = '<p class="field-note">导入数据后显示质检结果。</p>';
    el.qualityIssueList.innerHTML = "";
    el.exportSkippedEdiBtn.disabled = true;
    return;
  }
  const report = buildQualityReport();
  el.qualitySummary.innerHTML = [
    qualityMetric("总测点", report.total),
    qualityMetric("当前绘图", report.drawn),
    qualityMetric("重复测点名", report.duplicateNameCount),
    qualityMetric("重复坐标", report.duplicateCoordinateCount),
    qualityMetric("缺少 MT 响应", report.missingMTCount),
    qualityMetric("坐标异常", report.invalidCoordinateCount),
    qualityMetric("跳过 EDI", report.skippedCount)
  ].join("");
  const issues = [];
  if (report.duplicateNames.length) issues.push(`重复测点名：${report.duplicateNames.slice(0, 8).join("、")}${report.duplicateNames.length > 8 ? "..." : ""}`);
  if (report.duplicateCoordinates.length) issues.push(`重复坐标：${report.duplicateCoordinates.slice(0, 5).join("、")}${report.duplicateCoordinates.length > 5 ? "..." : ""}`);
  if (report.sourceInvalidCoordinateCount) issues.push(`原始数据无效坐标行：${report.sourceInvalidCoordinateCount} 行${report.sourceInvalidCoordinateSamples.length ? `，例如 ${report.sourceInvalidCoordinateSamples.join("、")}` : ""}`);
  if (report.outOfRegionCount) issues.push(`当前图幅外测点：${report.outOfRegionCount} 个`);
  if (report.skippedCount) issues.push(`被跳过 EDI：${report.skippedCount} 个，可导出列表检查原因。`);
  if (!issues.length) issues.push("未发现明显坐标、重复或 EDI 跳过问题。");
  el.qualityIssueList.innerHTML = issues.map((item) => `<p class="field-note">${escapeHTML(item)}</p>`).join("");
  el.exportSkippedEdiBtn.disabled = !report.skippedCount;
}

function qualityMetric(label, value) {
  return `<span class="quality-metric"><strong>${escapeHTML(value)}</strong><em>${escapeHTML(label)}</em></span>`;
}

function buildQualityReport() {
  const nameMap = new Map();
  const coordMap = new Map();
  let invalidCoordinateCount = 0;
  let missingMTCount = 0;
  let outOfRegionCount = 0;
  const region = parseRegionClient(el.regionInput?.value || "");
  const sourceCoordinateReport = buildSourceCoordinateReport();
  for (const record of state.allRecords) {
    const name = String(record.name || "").trim();
    if (name) nameMap.set(name, (nameMap.get(name) || 0) + 1);
    const coordKey = `${Number(record.lon).toFixed(6)},${Number(record.lat).toFixed(6)}`;
    coordMap.set(coordKey, (coordMap.get(coordKey) || 0) + 1);
    if (!Number.isFinite(record.lon) || !Number.isFinite(record.lat) || Math.abs(record.lon) > 180 || Math.abs(record.lat) > 90) invalidCoordinateCount += 1;
    if (!record.mtResponses?.length) missingMTCount += 1;
    if (region && (record.lon < region.west || record.lon > region.east || record.lat < region.south || record.lat > region.north)) outOfRegionCount += 1;
  }
  invalidCoordinateCount += sourceCoordinateReport.invalidRows;
  const duplicateNames = Array.from(nameMap.entries()).filter(([, count]) => count > 1).map(([name]) => name);
  const duplicateCoordinates = Array.from(coordMap.entries()).filter(([, count]) => count > 1).map(([coord]) => coord);
  return {
    total: state.allRecords.length,
    drawn: state.records.length,
    duplicateNames,
    duplicateNameCount: duplicateNames.length,
    duplicateCoordinates,
    duplicateCoordinateCount: duplicateCoordinates.length,
    invalidCoordinateCount,
    sourceInvalidCoordinateCount: sourceCoordinateReport.invalidRows,
    sourceInvalidCoordinateSamples: sourceCoordinateReport.samples,
    missingMTCount,
    outOfRegionCount,
    skippedCount: state.parsed?.skippedEdiFiles?.length || 0
  };
}

function buildSourceCoordinateReport() {
  if (state.parsed?.sourceType === "ediDirectory") return { invalidRows: 0, samples: [] };
  const rows = state.parsed?.rows || [];
  const mapping = state.mapping || state.parsed?.mapping || {};
  if (!rows.length || !mapping.coordinateType) return { invalidRows: 0, samples: [] };
  const invalid = [];
  rows.forEach((row, index) => {
    const result = validateSourceCoordinateRow(row, mapping);
    if (!result.valid) {
      const name = mapping.name ? String(row[mapping.name] || "").trim() : "";
      invalid.push(`${name || `第${index + 1}行`}(${result.reason})`);
    }
  });
  return {
    invalidRows: invalid.length,
    samples: invalid.slice(0, 5)
  };
}

function validateSourceCoordinateRow(row, mapping) {
  if (mapping.coordinateType === "projected") {
    const easting = parseCoordinateText(row[mapping.easting]);
    const northing = parseCoordinateText(row[mapping.northing]);
    if (!Number.isFinite(easting) || !Number.isFinite(northing)) return { valid: false, reason: "投影坐标无效" };
    return { valid: true, reason: "" };
  }
  const lon = parseCoordinateText(row[mapping.lon]);
  const lat = parseCoordinateText(row[mapping.lat]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return { valid: false, reason: "经纬度无效" };
  if (Math.abs(lon) < 1e-12 && Math.abs(lat) < 1e-12) return { valid: false, reason: "0/0占位" };
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return { valid: false, reason: "超出范围" };
  return { valid: true, reason: "" };
}

function parseCoordinateText(value) {
  const text = String(value ?? "").trim().replace(/^["']|["']$/g, "");
  if (!text) return NaN;
  const suffix = text.match(/[NSEW]$/i)?.[0].toUpperCase() || "";
  const cleaned = text.replace(/[NSEW]$/i, "").replace(/[°'"]/g, ":").trim();
  let sign = cleaned.startsWith("-") ? -1 : 1;
  if (suffix === "S" || suffix === "W") sign = -1;
  const unsigned = cleaned.replace(/^[+-]/, "");
  if (unsigned.includes(":")) {
    const parts = unsigned.split(":").filter(Boolean).map(Number);
    if (!parts.length || parts.some((part) => !Number.isFinite(part))) return NaN;
    return sign * ((parts[0] || 0) + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600);
  }
  const decimal = Number(unsigned);
  return Number.isFinite(decimal) ? sign * decimal : NaN;
}

async function exportSkippedEdiList() {
  const skipped = state.parsed?.skippedEdiFiles || [];
  if (!skipped.length) return notify("当前没有被跳过的 EDI。");
  const content = ["filePath\treason", ...skipped.map((item) => `${item.filePath || ""}\t${String(item.reason || "").replace(/\s+/g, " ")}`)].join("\n") + "\n";
  const saved = await window.mtApp.saveTextFile({
    title: "导出被跳过的 EDI 列表",
    defaultPath: "skipped_edi.tsv",
    content,
    filters: [
      { name: "TSV", extensions: ["tsv"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (saved) notify(`已导出：${saved}`);
}

async function refreshStatus() {
  const status = await window.mtApp.status();
  state.outputDirectory = status.outputDirectory;
  if (el.versionText) el.versionText.textContent = `v${status.version || ""}`;
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
  if (el.gmtStatusText) {
    el.gmtStatusText.textContent = available ? `GMT ${gmtInfo.version || "已就绪"}` : "GMT 未就绪";
    el.gmtStatusText.dataset.state = available ? "ready" : "error";
  }
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
  setRuntimeStatus(`${status.message || "GMT 下载"} ${status.total ? `${percent.toFixed(percent < 10 ? 1 : 0)}%` : ""}`.trim(), status.state === "failed" ? "error" : "busy");
}

function loadParsed(parsed, options = {}) {
  state.parsed = parsed;
  state.allRecords = parsed.records || [];
  state.columns = parsed.columns;
  state.mapping = parsed.mapping;
  if (!options.keepRegion) el.regionInput.value = parsed.region;
  if (!options.keepFilters) resetFilterState();
  applyRecordFilters({ updateOnly: true });
  renderDataSummary();
  if (parsed.mapping.coordinateType === "projected" && parsed.records.length > 50) {
    el.showLabelsInput.checked = false;
  }
  populateColumnSelects();
  populateFilterControls();
  populateMTControls();
  renderStationRows();
  renderQualityPanel();
  renderPlaceholder();
  resetTerrainPaths();
  updateTerrainEstimate();
  setRuntimeStatus(`已导入 ${state.allRecords.length} 个测点`);
  if (options.autoPreview !== false) scheduleAutoPreview(options.message || "数据已导入，正在自动绘制预览...", { delay: 150 });
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

async function applyMapping(options = {}) {
  if (!state.parsed) {
    notify("请先导入点位文件。");
    return false;
  }
  const mapping = readMapping();
  if (mapping.coordinateType === "projected") {
    if (!mapping.easting || !mapping.northing) {
      notify("投影坐标列必须选择。");
      return false;
    }
  } else if (!mapping.lon || !mapping.lat) {
    notify("经度和纬度列必须选择。");
    return false;
  }
  try {
    const result = await window.mtApp.applyMapping({ rows: state.parsed.rows, mapping });
    state.mapping = mapping;
    state.allRecords = result.records;
    state.parsed.records = result.records;
    state.parsed.region = result.region;
    applyRecordFilters({ updateOnly: true });
    el.regionInput.value = result.region;
    populateFilterControls();
    renderDataSummary();
    renderStationRows();
    populateMTControls();
    renderQualityPanel();
    resetTerrainPaths();
    updateTerrainEstimate();
    if (!options.silent) notify("字段映射已更新。");
    if (options.autoPreview) scheduleAutoPreview("字段映射已更新，正在自动绘制预览...", { delay: 120 });
    return true;
  } catch (error) {
    notify(error.message);
    return false;
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
    labelMode: el.labelModeInput.value,
    labelPrefix: el.labelPrefixInput.value.trim(),
    labelEvery: Number(el.labelEveryInput.value),
    showScale: el.showScaleInput.checked,
    scalePosition: elementPositionValue("scale"),
    showNorthArrow: el.showNorthInput.checked,
    northPosition: elementPositionValue("north"),
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
    terrainDataServer: readTerrainDataServer(),
    localTerrainGridPath: state.terrain.localGridPath,
    terrainGridPath: state.terrain.localGridPath || state.terrain.gridPath,
    terrainShadePath: state.terrain.shadePath,
    faultLayers: state.faultLayers.map((layer) => ({
      path: layer.path,
      name: layer.name,
      color: layer.color
    })),
    legend: {
      show: el.showLegendInput.checked,
      title: el.legendTitleInput.value.trim() || "Legend",
      stationLabel: el.legendStationLabelInput.value.trim() || "Station",
      overlayLabel: el.legendOverlayLabelInput.value.trim() || defaultLegendOverlayLabel(state.plotType),
      order: el.legendOrderInput.value,
      position: legendPositionValue(),
      includeFaults: el.legendIncludeFaultsInput.checked,
      width: `${clamp(Number(el.legendWidthInput.value), 2, 8).toFixed(2)}c`,
      titleFontSize: Number(el.legendTitleSizeInput.value),
      labelFontSize: Number(el.legendLabelSizeInput.value),
      textColor: readColor("legendTextColor"),
      backgroundColor: readColor("legendBackground"),
      backgroundTransparency: Number(el.legendBackgroundAlphaInput.value),
      borderColor: readColor("legendBorderColor"),
      borderWidth: Number(el.legendBorderWidthInput.value)
    },
    outputName: el.outputNameInput.value.trim() || "mt_point_map",
    pngDpi: clamp(Math.round(Number(el.pngDpiInput.value) || 300), 72, 1200)
  };
  if (state.plotType === "responseCurve") config.showTerrain = false;
  return config;
}

async function importFaultLayers() {
  try {
    const result = await window.mtApp.openFaultFiles({ color: el.faultColorInput.value || "#d7191c" });
    if (!result?.files?.length) return;
    let imported = 0;
    for (const file of result.files) {
      if (file.error) {
        notify(`${file.name}：${file.error}`);
        continue;
      }
      const existing = state.faultLayers.findIndex((layer) => layer.path === file.path);
      const layer = {
        path: file.path,
        name: file.name || baseName(file.path),
        color: file.color || el.faultColorInput.value || "#d7191c",
        segmentCount: file.segmentCount || 0,
        pointCount: file.pointCount || 0
      };
      if (existing >= 0) state.faultLayers.splice(existing, 1, layer);
      else state.faultLayers.push(layer);
      imported += 1;
    }
    renderFaultLayers();
    scheduleAutoPreview("构造线叠加层已更改，正在自动更新预览...");
    if (imported) notify(`已导入 ${imported} 个构造线文件。`);
  } catch (error) {
    notify(error.message || String(error));
  }
}

function clearFaultLayers() {
  if (!state.faultLayers.length) return;
  state.faultLayers = [];
  renderFaultLayers();
  scheduleAutoPreview("构造线叠加层已清空，正在自动更新预览...");
}

function removeFaultLayer(index) {
  state.faultLayers.splice(index, 1);
  renderFaultLayers();
  scheduleAutoPreview("构造线叠加层已更改，正在自动更新预览...");
}

function renderFaultLayers() {
  el.faultFileList.innerHTML = "";
  el.faultOverlaySummary.textContent = state.faultLayers.length ? `${state.faultLayers.length} 个叠加层` : "无叠加";
  el.clearFaultsBtn.disabled = !state.faultLayers.length;
  el.legendIncludeFaultsInput.disabled = !state.faultLayers.length;
  if (!state.faultLayers.length) {
    const empty = document.createElement("p");
    empty.className = "field-note layer-empty";
    empty.textContent = "未导入构造线";
    el.faultFileList.append(empty);
    return;
  }
  state.faultLayers.forEach((layer, index) => {
    const row = document.createElement("div");
    row.className = "layer-item";

    const swatch = document.createElement("span");
    swatch.className = "layer-swatch";
    swatch.style.background = layer.color || "#d7191c";

    const label = document.createElement("span");
    label.className = "layer-label";
    label.textContent = `${layer.name} · ${layer.segmentCount} 段`;
    label.title = layer.path;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "small-danger";
    remove.textContent = "移除";
    remove.addEventListener("click", () => removeFaultLayer(index));

    row.append(swatch, label, remove);
    el.faultFileList.append(row);
  });
}

function previewConfig(config) {
  return { ...config };
}

function sanitizePngDpi(value) {
  return clamp(Math.round(Number(value) || 300), 72, 1200);
}

function requestPngDpi(currentValue) {
  const current = sanitizePngDpi(currentValue);
  if (!formatsDialogAvailable()) {
    const value = prompt("PNG DPI", String(current));
    if (value === null) return Promise.resolve(null);
    return Promise.resolve(sanitizePngDpi(value));
  }
  return new Promise((resolve) => {
    const dialog = el.pngDpiDialog;
    const input = el.pngDpiDialogInput;
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      dialog.removeEventListener("cancel", onCancel);
      el.pngDpiCancelBtn.removeEventListener("click", onCancel);
      el.pngDpiDialogCancelBtn.removeEventListener("click", onCancel);
      el.pngDpiConfirmBtn.removeEventListener("click", onConfirm);
      input.removeEventListener("keydown", onKeyDown);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onCancel = (event) => {
      event?.preventDefault?.();
      done(null);
    };
    const onConfirm = () => done(sanitizePngDpi(input.value));
    const onKeyDown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onConfirm();
      }
    };
    input.value = String(current);
    dialog.addEventListener("cancel", onCancel);
    el.pngDpiCancelBtn.addEventListener("click", onCancel);
    el.pngDpiDialogCancelBtn.addEventListener("click", onCancel);
    el.pngDpiConfirmBtn.addEventListener("click", onConfirm);
    input.addEventListener("keydown", onKeyDown);
    dialog.showModal();
    input.focus();
    input.select();
  });
}

function formatsDialogAvailable() {
  return Boolean(el.pngDpiDialog?.showModal && el.pngDpiDialogInput && el.pngDpiConfirmBtn);
}

async function exportMap(formats, showAlert, options = {}) {
  if (!state.records.length) return notify("请先导入点位数据。");
  if (!options.auto && state.preview.autoTimer) {
    clearTimeout(state.preview.autoTimer);
    state.preview.autoTimer = null;
  }
  if (state.preview.rendering) {
    if (options.auto) state.preview.queuedAuto = true;
    return false;
  }
  state.preview.rendering = true;
  el.cancelRenderBtn.classList.remove("hidden");
  const isPreviewRender = !showAlert;
  setPreviewBusy(true, showAlert ? "正在导出图件..." : (options.auto ? "正在自动更新预览..." : "正在生成预览..."));
  const baseConfig = readConfig();
  const config = isPreviewRender ? previewConfig(baseConfig) : baseConfig;
  try {
    if (!validatePlotReadiness(config)) return false;
    if (showAlert && formats.includes("png")) {
      const dpi = await requestPngDpi(config.pngDpi);
      if (!dpi) return false;
      config.pngDpi = dpi;
      el.pngDpiInput.value = String(dpi);
    }
    if (config.showTerrain) {
      const ready = await ensureTerrainReady(config, { auto: Boolean(options.auto), preview: isPreviewRender });
      if (!ready) return false;
      if (config.localTerrainGridPath) {
        config.terrainGridPath = config.localTerrainGridPath;
        config.terrainShadePath = "";
      } else {
        config.terrainGridPath = state.terrain.gridPath;
        config.terrainShadePath = state.terrain.shadePath;
      }
    }
    let result;
    try {
      result = await window.mtApp.exportMap({ records: state.records, config, formats, outputDirectory: state.outputDirectory });
    } catch (error) {
      notify(error.message || String(error));
      return false;
    }
    if (!result.ok) {
      await refreshStatus();
      notify(`${result.message}\n脚本已保存：${result.scriptPath}`);
      return false;
    }
    state.outputDirectory = result.outputDirectory;
    renderOutputDirectory();
    if (formats.includes("png")) {
      const png = result.files.find((file) => file.toLowerCase().endsWith(".png"));
      if (png) await renderPreview(png);
    }
    setRuntimeStatus(showAlert ? `导出完成：${result.files.length} 个文件` : "预览已更新", "ready");
    if (showAlert) notify(`导出完成：\n${result.files.join("\n")}`);
    return true;
  } finally {
    state.preview.rendering = false;
    el.cancelRenderBtn.classList.add("hidden");
    setPreviewBusy(false);
    if (state.preview.queuedAuto) {
      state.preview.queuedAuto = false;
      scheduleAutoPreview("设置继续变化，正在自动更新预览...");
    }
  }
}

async function cancelCurrentRender() {
  const result = await window.mtApp.cancelGMTRender?.();
  setPreviewStatus(result?.message || "已请求取消绘图。", "pending");
}

function renderGMTRenderProgress(status) {
  if (!status) return;
  const percent = Number.isFinite(status.percent) ? ` ${Math.round(status.percent)}%` : "";
  setPreviewStatus(`${status.message || "GMT 正在绘图..."}${percent}`, status.step === "failed" ? "error" : "busy");
}

async function deleteCurrentOutputs() {
  const result = await window.mtApp.deleteCurrentOutputs({
    outputDirectory: state.outputDirectory,
    outputName: el.outputNameInput.value.trim() || "mt_point_map"
  });
  renderPlaceholder();
  setRuntimeStatus(result.message);
  notify(result.message);
}

async function ensureTerrainReady(config, options = {}) {
  if (config.localTerrainGridPath) return true;
  const key = terrainKeyClient(config);
  if (state.terrain.key === key && state.terrain.gridPath && state.terrain.shadePath) return true;
  const cached = await adoptTerrainCache(config, key);
  if (cached) return true;
  if (options.auto && !options.preview) {
    setPreviewStatus("地形底图尚未准备，先点“生成预览”或“下载/准备底图”后再自动更新。");
    return false;
  }
  if (!config.terrainAllowDownload) {
    if (options.auto) {
      setPreviewStatus("地形底图本地缓存未命中，且已关闭联网下载。");
      return false;
    }
    const confirmed = confirm("当前未准备本地地形底图，并且关闭了联网下载。是否仍然尝试只使用 GMT 本地缓存准备底图？");
    if (!confirmed) return false;
  }
  try {
    await prepareTerrain(true, config);
    return Boolean(state.terrain.gridPath && state.terrain.shadePath);
  } catch (error) {
    notify(error.message || String(error));
    return false;
  }
}

async function adoptTerrainCache(config, key = terrainKeyClient(config)) {
  try {
    const cache = await window.mtApp.estimateTerrain({ records: state.records, config, outputDirectory: state.outputDirectory });
    if (!cache?.cacheReady) return false;
    state.terrain = {
      ...state.terrain,
      key,
      pendingKey: "",
      gridPath: cache.gridPath,
      shadePath: cache.shadePath,
      region: config.region,
      resolution: config.terrainResolution
    };
    el.terrainProgressPanel.classList.remove("hidden");
    el.terrainProgress.value = 100;
    el.terrainProgressText.textContent = "已复用缓存地形底图。";
    el.terrainProgressText.dataset.state = "completed";
    el.terrainProgressPercent.textContent = "100%";
    return true;
  } catch (_error) {
    return false;
  }
}

async function prepareTerrain(waitForCompletion, configOverride = null) {
  if (!state.records.length) return notify("请先导入点位文件。");
  const config = configOverride ? { ...configOverride } : readConfig();
  if (!config.region) config.region = autoRegionClient(state.records);
  const estimate = estimateTerrainClient(config.region, config.terrainResolution);
  if (estimate.blocked) {
    el.terrainEstimateText.textContent = estimate.label;
    notify(estimate.warning);
    return false;
  }
  resetTerrainPaths();
  state.terrain.pendingKey = terrainKeyClient(config);
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
  setRuntimeStatus(`${status.message || readableTerrainState(status.state)} ${percent.toFixed(percent < 10 ? 1 : 0)}%`, ["failed", "cancelled"].includes(status.state) ? "error" : (status.state === "completed" ? "ready" : "busy"));
  if (status.state === "completed") {
    state.terrain = {
      key: state.terrain.pendingKey || terrainKeyClient(readConfig()),
      pendingKey: "",
      gridPath: status.gridPath,
      shadePath: status.shadePath,
      region: status.region,
      resolution: status.resolution,
      localGridPath: state.terrain.localGridPath
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
  if (state.terrain.localGridPath) {
    el.terrainEstimateText.textContent = "将使用本地 GRD 地形图，不需要联网下载。";
    el.prepareTerrainBtn.disabled = true;
    return;
  }
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
      blocked: false,
      warning: `${detail}，处理会比较慢，占用磁盘和内存也会更高；${advice}`,
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
    config.terrainIntensity,
    config.localTerrainGridPath || ""
  ].join("|");
}

function resetTerrainPaths() {
  state.terrain = { ...state.terrain, key: "", pendingKey: "", gridPath: "", shadePath: "", region: "", resolution: "" };
}

async function deleteLocalTerrain() {
  const result = await window.mtApp.deleteLocalTerrain({ outputDirectory: state.outputDirectory });
  resetTerrainPaths();
  el.terrainProgressPanel.classList.add("hidden");
  setRuntimeStatus(result.message);
  notify(result.message);
}

async function chooseLocalTerrainGrid() {
  const selected = await window.mtApp.chooseLocalTerrainGrid();
  if (!selected) return;
  state.terrain.localGridPath = selected;
  resetTerrainPaths();
  renderLocalTerrainGrid();
  el.showTerrainInput.checked = true;
  el.terrainProgressPanel.classList.add("hidden");
  updateTerrainEstimate();
  notify(`已导入本地 GRD 地形图：\n${selected}`);
}

function clearLocalTerrainGrid() {
  state.terrain.localGridPath = "";
  resetTerrainPaths();
  renderLocalTerrainGrid();
  updateTerrainEstimate();
}

function renderLocalTerrainGrid() {
  if (!state.terrain.localGridPath) {
    el.localTerrainText.textContent = "未导入本地 GRD 地形图";
    el.clearLocalTerrainBtn.disabled = true;
    return;
  }
  el.localTerrainText.textContent = `本地 GRD：${baseName(state.terrain.localGridPath)}`;
  el.clearLocalTerrainBtn.disabled = false;
}

function baseName(filePath) {
  return String(filePath || "").split(/[\\/]/).filter(Boolean).pop() || String(filePath || "");
}

async function clearTerrainCache() {
  if (!confirm("这会清理 GMT 下载过的 earth_relief 地形缓存。以后再用地形底图可能需要重新联网下载。确定继续吗？")) return;
  const result = await window.mtApp.clearTerrainCache();
  setRuntimeStatus(result.message);
  notify(result.message);
  refreshTerrainCacheSummary();
}

async function refreshTerrainCacheSummary() {
  try {
    const summary = await window.mtApp.terrainCacheSummary({ outputDirectory: state.outputDirectory });
    el.terrainCacheResolutionInput.innerHTML = "";
    if (!summary.totalFiles) {
      el.terrainCacheSummaryText.textContent = "当前输出目录没有地形缓存文件。";
      el.deleteTerrainCacheResolutionBtn.disabled = true;
      return;
    }
    el.terrainCacheSummaryText.textContent = `缓存目录：${summary.directory}；共 ${summary.totalFiles} 个文件，${formatBytes(summary.totalBytes)}`;
    for (const group of summary.groups) {
      el.terrainCacheResolutionInput.append(new Option(`${group.resolution} · ${group.files} 文件 · ${formatBytes(group.bytes)}`, group.resolution));
    }
    el.deleteTerrainCacheResolutionBtn.disabled = !summary.groups.length;
  } catch (error) {
    el.terrainCacheSummaryText.textContent = `缓存扫描失败：${error.message || String(error)}`;
    el.deleteTerrainCacheResolutionBtn.disabled = true;
  }
}

async function deleteTerrainCacheResolution() {
  const resolution = el.terrainCacheResolutionInput.value;
  if (!resolution) return notify("请选择要删除的缓存分辨率。");
  if (!confirm(`确定删除 ${resolution} 分辨率的地形缓存吗？`)) return;
  const result = await window.mtApp.deleteTerrainCacheResolution({ outputDirectory: state.outputDirectory, resolution });
  setRuntimeStatus(result.message);
  notify(result.message);
  refreshTerrainCacheSummary();
}

async function deleteCurrentTerrainCache() {
  if (!state.records.length) return notify("请先导入点位数据。");
  const config = readConfig();
  if (!config.region) config.region = autoRegionClient(state.records);
  if (!confirm(`确定删除当前范围 ${config.region} / ${config.terrainResolution} 的本地地形缓存吗？`)) return;
  const result = await window.mtApp.deleteCurrentTerrainCache?.({
    records: state.records,
    config,
    outputDirectory: state.outputDirectory
  });
  if (!result) return notify("当前版本没有可用的当前范围缓存删除接口。");
  resetTerrainPaths();
  setRuntimeStatus(result.message);
  notify(result.message);
  refreshTerrainCacheSummary();
  updateTerrainEstimate();
}

function applyPlotPreset(preset) {
  const presets = {
    paperMono: () => {
      setChecked(el.showTerrainInput, false);
      setColorControlValue("pointFill", "white");
      setColorControlValue("penColor", "black");
      setInputValue(el.penWidthInput, 0.55);
      setColorControlValue("labelColor", "black");
      setChecked(el.showGridInput, true);
      setChecked(el.showScaleInput, true);
      setChecked(el.showNorthInput, true);
      setChecked(el.showLegendInput, true);
      setColorControlValue("legendBackground", "white");
      setInputValue(el.legendBackgroundAlphaInput, 0);
    },
    fieldQuick: () => {
      setChecked(el.showTerrainInput, false);
      setChecked(el.showLabelsInput, false);
      setInputValue(el.pointSizeInput, 0.28);
      setColorControlValue("pointFill", "#d7191c");
      setChecked(el.showLegendInput, false);
      setInputValue(el.pngDpiInput, 220);
    },
    terrainColor: () => {
      setChecked(el.showTerrainInput, true);
      setInputValue(el.terrainResolutionInput, "06m");
      setInputValue(el.terrainCptInput, "geo");
      setInputValue(el.terrainIntensityInput, 0.65);
      setColorControlValue("pointFill", "#d7191c");
      setColorControlValue("penColor", "black");
      setChecked(el.showLegendInput, true);
    },
    faultMap: () => {
      setChecked(el.showTerrainInput, true);
      setInputValue(el.terrainCptInput, "dem2");
      setChecked(el.showLegendInput, true);
      setChecked(el.legendIncludeFaultsInput, true);
      setInputValue(el.legendOverlayLabelInput, "Fault / structure");
      setColorControlValue("pointFill", "#2b83ba");
    },
    phaseTensor: () => {
      setPlotType("phaseTensorMap");
      setInputValue(el.tensorScaleInput, 0.03);
      setColorControlValue("pointFill", "white");
      setChecked(el.showLegendInput, true);
      setInputValue(el.legendOverlayLabelInput, "Phase tensor");
    }
  };
  const apply = presets[preset];
  if (!apply) return;
  apply();
  renderLocalTerrainGrid();
  renderLegendDragHandle();
  renderDraggableMapElements();
  updateTerrainEstimate();
  scheduleAutoPreview("绘图预设已应用，正在自动更新预览...", { delay: 120 });
}

function readTerrainDataServer() {
  if (el.terrainDataServerInput.value === CUSTOM_TERRAIN_SERVER_VALUE) {
    return el.terrainDataServerCustomInput.value.trim() || DEFAULT_TERRAIN_DATA_SERVER;
  }
  return el.terrainDataServerInput.value || DEFAULT_TERRAIN_DATA_SERVER;
}

function renderTerrainDataServerCustom() {
  const isCustom = el.terrainDataServerInput.value === CUSTOM_TERRAIN_SERVER_VALUE;
  el.terrainDataServerCustomRow.classList.toggle("hidden", !isCustom);
}

async function saveScript() {
  if (!state.records.length) return notify("请先导入点位数据。");
  const config = readConfig();
  if (!validatePlotReadiness(config)) return;
  if (config.showTerrain) {
    const ready = await ensureTerrainReady(config);
    if (!ready) return;
    if (config.localTerrainGridPath) {
      config.terrainGridPath = config.localTerrainGridPath;
      config.terrainShadePath = "";
    } else {
      config.terrainGridPath = state.terrain.gridPath;
      config.terrainShadePath = state.terrain.shadePath;
    }
  }
  let saved;
  try {
    saved = await window.mtApp.saveScript({ records: state.records, config, outputDirectory: state.outputDirectory, formats: ["png", "pdf", "eps"] });
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
  setupColorControl("pointFill", "#d7191c", () => {
    scheduleAutoPreview("点位颜色已更改，正在自动更新预览...");
  });
  setupColorControl("penColor", "black", () => {
    scheduleAutoPreview("点位边框色已更改，正在自动更新预览...");
  });
  setupColorControl("labelColor", "black");
  setupColorControl("legendTextColor", "black", () => {
    renderLegendDragHandle();
    scheduleAutoPreview("图例文字色已更改，正在自动更新预览...");
  });
  setupColorControl("legendBackground", "white", () => {
    renderLegendDragHandle();
    scheduleAutoPreview("图例底色已更改，正在自动更新预览...");
  });
  setupColorControl("legendBorderColor", "gray50", () => {
    renderLegendDragHandle();
    scheduleAutoPreview("图例边框色已更改，正在自动更新预览...");
  });
}

function setupColorControl(key, initialValue, onChange) {
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
    if (onChange) onChange();
  });
  picker.addEventListener("input", () => {
    select.value = CUSTOM_COLOR_VALUE;
    picker.disabled = false;
    if (onChange) onChange();
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
    gray40: "#666666",
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
    const dimensions = await imageDimensions(url);
    state.preview.imageWidth = dimensions.width;
    state.preview.imageHeight = dimensions.height;
    el.previewImageLayer.style.backgroundImage = `url(${url})`;
    el.previewPlaceholder.hidden = true;
    hidePreviewStatus();
    el.previewZoomControls.classList.remove("hidden");
    el.previewBox.classList.add("has-preview");
    el.previewBox.setAttribute("aria-label", "GMT 点位图预览");
    state.preview.hasImage = true;
    resetPreviewView();
  } catch (error) {
    clearPreviewImage();
    el.previewPlaceholder.hidden = false;
    el.previewPlaceholder.textContent = `预览图读取失败：${error.message || String(error)}`;
  }
}

function clearPreviewImage() {
  state.preview.hasImage = false;
  state.preview.imageWidth = 0;
  state.preview.imageHeight = 0;
  state.preview.zoom = 1;
  state.preview.panX = 0;
  state.preview.panY = 0;
  state.preview.selecting = false;
  state.preview.panning = false;
  state.preview.selectionStart = null;
  state.preview.selectionEnd = null;
  state.preview.dragStart = null;
  state.preview.dragPanStart = null;
  el.previewImageLayer.style.backgroundImage = "";
  el.previewImageLayer.style.transform = "";
  el.previewSelection.classList.remove("active");
  el.previewSelection.style.cssText = "";
  el.legendDragHandle.classList.add("hidden");
  el.scaleDragHandle.classList.add("hidden");
  el.northDragHandle.classList.add("hidden");
  hidePreviewStatus();
  el.previewZoomControls.classList.add("hidden");
  el.previewZoomLabel.textContent = "100%";
  el.previewBox.classList.remove("has-preview", "is-zoomed", "is-panning");
  el.previewBox.removeAttribute("aria-label");
}

function renderPlaceholder() {
  const labels = {
    stationMap: "导入点位后自动绘制点位图",
    strikeMap: "导入 MT 数据并选择周期后自动绘制走向图",
    phaseTensorMap: "导入 MT 数据并选择周期后自动绘制相位张量椭圆图",
    tipperMap: "导入 MT 数据并选择周期后自动绘制感应矢量图",
    responseCurve: "导入 MT 数据并选择测点后自动绘制视电阻率和相位曲线"
  };
  clearPreviewImage();
  el.previewPlaceholder.hidden = false;
  el.previewPlaceholder.textContent = labels[state.plotType] || labels.stationMap;
}

function markPreviewStale(message) {
  if (!state.preview.hasImage) return;
  scheduleAutoPreview(message || "设置已更改，正在自动更新预览...");
}

function scheduleAutoPreview(message, options = {}) {
  if (state.preview.autoTimer) clearTimeout(state.preview.autoTimer);
  renderLegendDragHandle();
  if (!state.records.length) return;
  setPreviewStatus(message || "设置已更改，正在自动更新预览...", "pending");
  state.preview.autoTimer = setTimeout(() => {
    state.preview.autoTimer = null;
    refreshPreviewAutomatically();
  }, options.delay ?? autoPreviewDelay());
}

async function refreshPreviewAutomatically() {
  await exportMap(["png"], false, { auto: true });
}

function autoPreviewDelay() {
  const count = state.records.length;
  if (count >= 10000) return 1400;
  if (count >= 5000) return 1150;
  if (count >= 2000) return 900;
  return AUTO_PREVIEW_DELAY_MS;
}

function setPreviewBusy(active, message = "") {
  if (el.previewBtn) {
    el.previewBtn.disabled = active;
    el.previewBtn.textContent = active ? "生成中..." : "生成预览";
  }
  if (active) setPreviewStatus(message || "正在生成预览...", "busy");
  else if (el.previewStatus.dataset.kind === "busy") hidePreviewStatus();
}

function setPreviewStatus(message, kind = "info") {
  if (!message) return hidePreviewStatus();
  el.previewStatus.textContent = message;
  el.previewStatus.dataset.kind = kind;
  el.previewStatus.classList.remove("hidden");
  setRuntimeStatus(message, kind === "error" ? "error" : (kind === "busy" || kind === "pending" ? "busy" : "ready"));
}

function hidePreviewStatus() {
  el.previewStatus.textContent = "";
  el.previewStatus.dataset.kind = "";
  el.previewStatus.classList.add("hidden");
}

function setRuntimeStatus(message, kind = "ready") {
  if (!el.runtimeStatus) return;
  el.runtimeStatus.textContent = message || "就绪";
  el.runtimeStatus.dataset.state = kind;
}

function imageDimensions(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => reject(new Error("预览图尺寸读取失败"));
    image.src = url;
  });
}

function elementPositionControls(type) {
  if (type === "scale") {
    return {
      input: el.scalePositionInput,
      show: el.showScaleInput,
      handle: el.scaleDragHandle,
      label: "比例尺",
      fallback: "BR"
    };
  }
  return {
    input: el.northPositionInput,
    show: el.showNorthInput,
    handle: el.northDragHandle,
    label: "指北针",
    fallback: "TR"
  };
}

function elementPositionValue(type) {
  const controls = elementPositionControls(type);
  if (controls.input?.value !== "custom") {
    syncElementPositionFromSelect(type);
    return controls.input?.value || controls.fallback;
  }
  const position = state.elementPositions[type] || ELEMENT_POSITION_DEFAULTS[controls.fallback];
  return `n${clamp(position.x, 0.02, 0.98).toFixed(3)}/${clamp(position.y, 0.02, 0.98).toFixed(3)}+j${position.justify || controls.fallback}`;
}

function syncElementPositionFromSelect(type) {
  const controls = elementPositionControls(type);
  if (!controls.input || controls.input.value === "custom") return;
  const parsed = parseElementPosition(controls.input.value, controls.fallback);
  if (parsed) state.elementPositions[type] = { ...state.elementPositions[type], ...parsed, dragging: false };
}

function setElementPositionFromConfig(type, value) {
  const controls = elementPositionControls(type);
  if (!controls.input || value === undefined || value === null || value === "") return;
  const preset = Array.from(controls.input.options).some((option) => option.value === value && value !== "custom");
  controls.input.value = preset ? value : "custom";
  const parsed = parseElementPosition(value, controls.fallback);
  if (parsed) state.elementPositions[type] = { ...state.elementPositions[type], ...parsed, dragging: false };
}

function parseElementPosition(value, fallback = "BR") {
  const text = String(value || fallback || "").trim();
  const normalized = text.toUpperCase();
  const corner = normalized.replace(/^J/, "");
  if (ELEMENT_POSITION_DEFAULTS[corner]) return { ...ELEMENT_POSITION_DEFAULTS[corner] };
  const match = /^N([0-9.]+)\/([0-9.]+)(?:\+J([A-Z]{2}))?$/i.exec(text);
  if (!match) return { ...ELEMENT_POSITION_DEFAULTS[fallback] };
  const justify = (match[3] || fallback || "BR").toUpperCase();
  return {
    x: clamp(Number(match[1]), 0.02, 0.98),
    y: clamp(Number(match[2]), 0.02, 0.98),
    justify: ELEMENT_POSITION_DEFAULTS[justify] ? justify : fallback
  };
}

function legendPositionValue() {
  if (el.legendPositionInput.value !== "custom") {
    const selected = parseLegendPosition(el.legendPositionInput.value);
    if (selected) {
      state.legendPosition.x = selected.x;
      state.legendPosition.y = selected.y;
      state.legendPosition.justify = selected.justify;
    }
  }
  const { x, y, justify } = state.legendPosition;
  return `n${clamp(x, 0.02, 0.98).toFixed(3)}/${clamp(y, 0.02, 0.98).toFixed(3)}+j${justify || "TR"}`;
}

function parseLegendPosition(value) {
  const match = /^n([0-9.]+)\/([0-9.]+)\+j([A-Z]{2})$/.exec(String(value || ""));
  if (!match) return null;
  return {
    x: clamp(Number(match[1]), 0.02, 0.98),
    y: clamp(Number(match[2]), 0.02, 0.98),
    justify: match[3]
  };
}

function handleLegendPointerDown(event) {
  if (!state.preview.hasImage || !el.showLegendInput.checked || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  state.legendPosition.dragging = true;
  el.legendDragHandle.classList.add("dragging");
  el.legendDragHandle.setPointerCapture(event.pointerId);
}

function handleLegendPointerMove(event) {
  if (!state.legendPosition.dragging) return;
  event.preventDefault();
  event.stopPropagation();
  updateLegendPositionFromPreviewPoint(previewPoint(event));
  el.legendPositionInput.value = "custom";
  renderLegendDragHandle();
  setPreviewStatus(`图例位置：X ${state.legendPosition.x.toFixed(2)} / Y ${state.legendPosition.y.toFixed(2)}`, "pending");
}

function handleLegendPointerUp(event) {
  if (!state.legendPosition.dragging) return;
  event.preventDefault();
  event.stopPropagation();
  updateLegendPositionFromPreviewPoint(previewPoint(event));
  cancelLegendDrag();
  el.legendPositionInput.value = "custom";
  renderLegendDragHandle();
  scheduleAutoPreview("图例位置已调整，正在自动更新预览...", { delay: 300 });
}

function cancelLegendDrag() {
  state.legendPosition.dragging = false;
  el.legendDragHandle.classList.remove("dragging");
}

function handleElementPointerDown(event, type) {
  const controls = elementPositionControls(type);
  if (!state.preview.hasImage || !controls.show?.checked || state.plotType === "responseCurve" || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  state.elementPositions[type].dragging = true;
  controls.handle.classList.add("dragging");
  controls.handle.setPointerCapture(event.pointerId);
}

function handleElementPointerMove(event, type) {
  if (!state.elementPositions[type]?.dragging) return;
  const controls = elementPositionControls(type);
  event.preventDefault();
  event.stopPropagation();
  updateElementPositionFromPreviewPoint(type, previewPoint(event));
  controls.input.value = "custom";
  renderElementDragHandle(type);
  setPreviewStatus(`${controls.label}位置：X ${state.elementPositions[type].x.toFixed(2)} / Y ${state.elementPositions[type].y.toFixed(2)}`, "pending");
}

function handleElementPointerUp(event, type) {
  if (!state.elementPositions[type]?.dragging) return;
  const controls = elementPositionControls(type);
  event.preventDefault();
  event.stopPropagation();
  updateElementPositionFromPreviewPoint(type, previewPoint(event));
  cancelElementDrag(type);
  controls.input.value = "custom";
  renderElementDragHandle(type);
  scheduleAutoPreview(`${controls.label}位置已调整，正在自动更新预览...`, { delay: 300 });
}

function cancelElementDrag(type) {
  const controls = elementPositionControls(type);
  if (state.elementPositions[type]) state.elementPositions[type].dragging = false;
  controls.handle?.classList.remove("dragging");
}

function updateElementPositionFromPreviewPoint(type, point) {
  const fit = previewImageFitRect();
  if (!fit.width || !fit.height) return;
  const baseX = (point.x - state.preview.panX) / state.preview.zoom;
  const baseY = (point.y - state.preview.panY) / state.preview.zoom;
  const x = clamp((baseX - fit.left) / fit.width, 0.02, 0.98);
  const cssY = clamp((baseY - fit.top) / fit.height, 0.02, 0.98);
  const y = clamp(1 - cssY, 0.02, 0.98);
  state.elementPositions[type] = {
    ...state.elementPositions[type],
    x,
    y,
    justify: `${y >= 0.5 ? "T" : "B"}${x >= 0.5 ? "R" : "L"}`
  };
}

function updateLegendPositionFromPreviewPoint(point) {
  const fit = previewImageFitRect();
  if (!fit.width || !fit.height) return;
  const baseX = (point.x - state.preview.panX) / state.preview.zoom;
  const baseY = (point.y - state.preview.panY) / state.preview.zoom;
  const x = clamp((baseX - fit.left) / fit.width, 0.02, 0.98);
  const cssY = clamp((baseY - fit.top) / fit.height, 0.02, 0.98);
  const y = clamp(1 - cssY, 0.02, 0.98);
  state.legendPosition.x = x;
  state.legendPosition.y = y;
  state.legendPosition.justify = `${y >= 0.5 ? "T" : "B"}${x >= 0.5 ? "R" : "L"}`;
}

function renderLegendDragHandle() {
  if (!state.preview.hasImage || !el.showLegendInput.checked || state.plotType === "responseCurve") {
    el.legendDragHandle.classList.add("hidden");
    el.legendPositionHint.classList.add("hidden");
    return;
  }
  const fit = previewImageFitRect();
  if (!fit.width || !fit.height) {
    el.legendDragHandle.classList.add("hidden");
    el.legendPositionHint.classList.add("hidden");
    return;
  }
  const { x, y } = state.legendPosition;
  const baseX = fit.left + clamp(x, 0.02, 0.98) * fit.width;
  const baseY = fit.top + (1 - clamp(y, 0.02, 0.98)) * fit.height;
  const screenX = state.preview.panX + baseX * state.preview.zoom;
  const screenY = state.preview.panY + baseY * state.preview.zoom;
  el.legendDragHandle.style.left = `${screenX.toFixed(1)}px`;
  el.legendDragHandle.style.top = `${screenY.toFixed(1)}px`;
  el.legendDragHandle.style.transform = `translate(-50%, -50%)${state.legendPosition.dragging ? " scale(1.08)" : ""}`;
  el.legendPositionHint.textContent = `X ${x.toFixed(2)} / Y ${y.toFixed(2)}`;
  el.legendPositionHint.classList.remove("hidden");
  el.legendDragHandle.classList.remove("hidden");
}

function renderDraggableMapElements() {
  renderElementDragHandle("scale");
  renderElementDragHandle("north");
}

function renderElementDragHandle(type) {
  const controls = elementPositionControls(type);
  if (!state.preview.hasImage || !controls.show?.checked || state.plotType === "responseCurve") {
    controls.handle?.classList.add("hidden");
    return;
  }
  const fit = previewImageFitRect();
  if (!fit.width || !fit.height) {
    controls.handle?.classList.add("hidden");
    return;
  }
  const position = state.elementPositions[type] || ELEMENT_POSITION_DEFAULTS[controls.fallback];
  const baseX = fit.left + clamp(position.x, 0.02, 0.98) * fit.width;
  const baseY = fit.top + (1 - clamp(position.y, 0.02, 0.98)) * fit.height;
  const screenX = state.preview.panX + baseX * state.preview.zoom;
  const screenY = state.preview.panY + baseY * state.preview.zoom;
  controls.handle.style.left = `${screenX.toFixed(1)}px`;
  controls.handle.style.top = `${screenY.toFixed(1)}px`;
  controls.handle.style.transform = `translate(-50%, -50%)${position.dragging ? " scale(1.08)" : ""}`;
  controls.handle.classList.remove("hidden");
}

function previewImageFitRect() {
  const box = el.previewBox.getBoundingClientRect();
  const layerStyle = getComputedStyle(el.previewImageLayer);
  const padLeft = Number.parseFloat(layerStyle.paddingLeft) || 0;
  const padRight = Number.parseFloat(layerStyle.paddingRight) || 0;
  const padTop = Number.parseFloat(layerStyle.paddingTop) || 0;
  const padBottom = Number.parseFloat(layerStyle.paddingBottom) || 0;
  const contentWidth = Math.max(0, box.width - padLeft - padRight);
  const contentHeight = Math.max(0, box.height - padTop - padBottom);
  const imageWidth = state.preview.imageWidth || box.width;
  const imageHeight = state.preview.imageHeight || box.height;
  if (!contentWidth || !contentHeight || !imageWidth || !imageHeight) return { left: 0, top: 0, width: 0, height: 0 };
  const scale = Math.min(contentWidth / imageWidth, contentHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    left: padLeft + (contentWidth - width) / 2,
    top: padTop + (contentHeight - height) / 2,
    width,
    height
  };
}

function resetPreviewView() {
  state.preview.zoom = 1;
  state.preview.panX = 0;
  state.preview.panY = 0;
  updatePreviewTransform();
}

function updatePreviewTransform() {
  el.previewImageLayer.style.transform = `translate(${state.preview.panX.toFixed(2)}px, ${state.preview.panY.toFixed(2)}px) scale(${state.preview.zoom.toFixed(4)})`;
  el.previewZoomLabel.textContent = `${Math.round(state.preview.zoom * 100)}%`;
  el.previewBox.classList.toggle("is-zoomed", state.preview.zoom > PREVIEW_MIN_ZOOM + 0.001);
  renderLegendDragHandle();
  renderDraggableMapElements();
}

function handlePreviewWheel(event) {
  if (!state.preview.hasImage) return;
  event.preventDefault();
  el.previewBox.focus({ preventScroll: true });
  const point = previewPoint(event);
  const delta = clamp(-event.deltaY, -120, 120);
  const factor = Math.exp(delta * PREVIEW_WHEEL_SENSITIVITY);
  zoomPreviewAt(point, state.preview.zoom * factor);
}

function handlePreviewPointerDown(event) {
  if (!state.preview.hasImage || event.button !== 0 || event.target.closest(".preview-zoom-controls") || event.target.closest(".legend-drag-handle, .element-drag-handle")) return;
  event.preventDefault();
  el.previewBox.focus({ preventScroll: true });
  const point = previewPoint(event);
  if (state.preview.zoom > PREVIEW_MIN_ZOOM + 0.001 && !event.shiftKey) {
    state.preview.panning = true;
    state.preview.dragStart = point;
    state.preview.dragPanStart = { x: state.preview.panX, y: state.preview.panY };
    el.previewBox.classList.add("is-panning");
    el.previewBox.setPointerCapture(event.pointerId);
    return;
  }
  state.preview.selecting = true;
  state.preview.selectionStart = point;
  state.preview.selectionEnd = state.preview.selectionStart;
  el.previewBox.setPointerCapture(event.pointerId);
  updatePreviewSelection();
}

function handlePreviewPointerMove(event) {
  if (!state.preview.selecting && !state.preview.panning) return;
  event.preventDefault();
  if (state.preview.panning) {
    const point = previewPoint(event);
    state.preview.panX = state.preview.dragPanStart.x + point.x - state.preview.dragStart.x;
    state.preview.panY = state.preview.dragPanStart.y + point.y - state.preview.dragStart.y;
    clampPreviewPan();
    updatePreviewTransform();
    return;
  }
  state.preview.selectionEnd = previewPoint(event);
  updatePreviewSelection();
}

function handlePreviewPointerUp(event) {
  if (!state.preview.selecting && !state.preview.panning) return;
  event.preventDefault();
  if (state.preview.panning) {
    cancelPreviewPan();
    return;
  }
  state.preview.selectionEnd = previewPoint(event);
  const selection = previewSelectionRect();
  cancelPreviewSelection();
  if (selection.width < 12 || selection.height < 12) return;
  zoomPreviewToSelection(selection);
}

function cancelPreviewSelection() {
  state.preview.selecting = false;
  state.preview.selectionStart = null;
  state.preview.selectionEnd = null;
  el.previewSelection.classList.remove("active");
  el.previewSelection.style.cssText = "";
}

function cancelPreviewPan() {
  state.preview.panning = false;
  state.preview.dragStart = null;
  state.preview.dragPanStart = null;
  el.previewBox.classList.remove("is-panning");
}

function cancelPreviewInteraction() {
  cancelPreviewSelection();
  cancelPreviewPan();
}

function updatePreviewSelection() {
  const selection = previewSelectionRect();
  el.previewSelection.classList.add("active");
  el.previewSelection.style.left = `${selection.left}px`;
  el.previewSelection.style.top = `${selection.top}px`;
  el.previewSelection.style.width = `${selection.width}px`;
  el.previewSelection.style.height = `${selection.height}px`;
}

function previewSelectionRect() {
  const start = state.preview.selectionStart || { x: 0, y: 0 };
  const end = state.preview.selectionEnd || start;
  const box = el.previewBox.getBoundingClientRect();
  const x1 = clamp(Math.min(start.x, end.x), 0, box.width);
  const y1 = clamp(Math.min(start.y, end.y), 0, box.height);
  const x2 = clamp(Math.max(start.x, end.x), 0, box.width);
  const y2 = clamp(Math.max(start.y, end.y), 0, box.height);
  return { left: x1, top: y1, width: x2 - x1, height: y2 - y1 };
}

function zoomPreviewToSelection(selection) {
  const box = el.previewBox.getBoundingClientRect();
  const factor = Math.min(box.width / selection.width, box.height / selection.height);
  const center = { x: selection.left + selection.width / 2, y: selection.top + selection.height / 2 };
  zoomPreviewAt(center, state.preview.zoom * factor);
}

function zoomPreviewAt(point, targetZoom) {
  const box = el.previewBox.getBoundingClientRect();
  const oldZoom = state.preview.zoom;
  const newZoom = clamp(targetZoom, PREVIEW_MIN_ZOOM, PREVIEW_MAX_ZOOM);
  if (Math.abs(newZoom - oldZoom) < 0.001) return;
  const ratio = newZoom / oldZoom;
  state.preview.panX = point.x - ratio * (point.x - state.preview.panX);
  state.preview.panY = point.y - ratio * (point.y - state.preview.panY);
  state.preview.zoom = newZoom;
  if (newZoom <= PREVIEW_MIN_ZOOM + 0.001) {
    state.preview.panX = 0;
    state.preview.panY = 0;
  } else {
    clampPreviewPan(box);
  }
  updatePreviewTransform();
}

function clampPreviewPan(box = el.previewBox.getBoundingClientRect()) {
  if (state.preview.zoom <= PREVIEW_MIN_ZOOM + 0.001) {
    state.preview.panX = 0;
    state.preview.panY = 0;
    return;
  }
  const padX = box.width * 0.75;
  const padY = box.height * 0.75;
  state.preview.panX = clamp(state.preview.panX, box.width - box.width * state.preview.zoom - padX, padX);
  state.preview.panY = clamp(state.preview.panY, box.height - box.height * state.preview.zoom - padY, padY);
}

function previewPoint(event) {
  const box = el.previewBox.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function parseRegionClient(regionText) {
  const values = String(regionText || "").split("/").map((value) => Number(value));
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return null;
  return { west: values[0], east: values[1], south: values[2], north: values[3] };
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
  setRuntimeStatus(String(message || "").split(/\r?\n/)[0] || "就绪");
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
