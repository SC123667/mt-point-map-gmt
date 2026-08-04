const fs = require("fs");
const https = require("https");
const path = require("path");
const { fork, spawn } = require("child_process");
const { pathToFileURL } = require("url");
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage, net, protocol, shell } = require("electron");
const { buildLegendEntries, normalizeLegendConfig } = require("./legend");
const {
  DEFAULT_LEGEND_FILE,
  DEFAULT_OVERLAY_FILE,
  autoRegion,
  buildScript,
  defaultOutputDirectory,
  gmtAvailable,
  installPlan,
  needsNativeTextRendering,
  openDownloadedInstaller,
  resolveGMT,
  terrainEstimate,
  terrainDataServer,
  terrainIntensity,
  terrainPaths,
  terrainRemoteName,
  terrainSource
} = require("./gmt");

const APP_TITLE = "MT点位图制作工具—GMT";
let currentInstallerDownload = null;
let currentTerrainTask = null;
let currentGMTRenderTask = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "mt-preview",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    title: APP_TITLE,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false
    }
  });
  wireWindowControls(win);
  configureMenu(win);
  loadRenderer(win);
}

function wireWindowControls(win) {
  const publishState = () => sendWindowState(win);
  win.on("enter-full-screen", publishState);
  win.on("leave-full-screen", publishState);
  win.on("maximize", publishState);
  win.on("unmaximize", publishState);
  win.on("restore", publishState);
  win.webContents.once("did-finish-load", publishState);
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") {
      toggleFullScreen(win);
      event.preventDefault();
      return;
    }
    if (input.key === "Escape" && win.isFullScreen()) {
      win.setFullScreen(false);
      event.preventDefault();
      return;
    }
    if ((input.control || input.meta) && input.key.toLowerCase() === "w") {
      win.close();
      event.preventDefault();
    }
  });
}

function currentWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function windowState(win) {
  return {
    isFullScreen: Boolean(win?.isFullScreen()),
    platform: process.platform
  };
}

function sendWindowState(win) {
  if (win && !win.isDestroyed()) win.webContents.send("window:state", windowState(win));
}

function toggleFullScreen(win) {
  if (win && !win.isDestroyed()) win.setFullScreen(!win.isFullScreen());
}

function configureMenu(win) {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{
      label: APP_TITLE,
      submenu: [
        { role: "about", label: `关于 ${APP_TITLE}` },
        { type: "separator" },
        { role: "hide", label: "隐藏" },
        { role: "hideOthers", label: "隐藏其他" },
        { role: "unhide", label: "全部显示" },
        { type: "separator" },
        { role: "quit", label: "退出" }
      ]
    }] : []),
    {
      label: "文件",
      submenu: [
        {
          label: "打开工程...",
          accelerator: "CmdOrCtrl+Alt+O",
          click: () => sendMenuAction(win, "menu:openProject")
        },
        {
          label: "保存工程...",
          accelerator: "CmdOrCtrl+S",
          click: () => sendMenuAction(win, "menu:saveProject")
        },
        { type: "separator" },
        {
          label: "导入",
          submenu: [
            {
              label: "TXT/CSV/Excel 点位或 MT 表格...",
              accelerator: "CmdOrCtrl+O",
              click: () => sendMenuAction(win, "menu:openFile")
            },
            {
              label: "EDI 文件夹...",
              accelerator: "CmdOrCtrl+Shift+O",
              click: () => sendMenuAction(win, "menu:openEdiDirectory")
            }
          ]
        },
        {
          label: "打开示例数据",
          click: () => sendMenuAction(win, "menu:loadSample")
        },
        { type: "separator" },
        {
          label: "导出",
          submenu: [
            {
              label: "导出 PNG...",
              accelerator: "CmdOrCtrl+E",
              click: () => sendMenuAction(win, "menu:exportPng")
            },
            {
              label: "导出 PDF...",
              click: () => sendMenuAction(win, "menu:exportPdf")
            },
            {
              label: "导出 EPS 矢量图...",
              click: () => sendMenuAction(win, "menu:exportEps")
            },
            {
              label: "导出 PNG + PDF...",
              accelerator: "CmdOrCtrl+Shift+E",
              click: () => sendMenuAction(win, "menu:exportBoth")
            },
            {
              label: "导出 PNG + PDF + EPS...",
              click: () => sendMenuAction(win, "menu:exportAll")
            },
            {
              label: "保存 GMT 脚本...",
              click: () => sendMenuAction(win, "menu:saveScript")
            },
            { type: "separator" },
            {
              label: "选择导出目录...",
              click: () => sendMenuAction(win, "menu:chooseOutputDirectory")
            },
            {
              label: "删除当前图件...",
              click: () => sendMenuAction(win, "menu:deleteOutputs")
            }
          ]
        },
        { type: "separator" },
        isMac
          ? { role: "close", label: "关闭窗口" }
          : { label: "关闭窗口", accelerator: "Ctrl+W", click: () => win.close() },
        ...(!isMac ? [{ role: "quit", label: "退出" }] : [])
      ]
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" }
      ]
    },
    {
      label: "设置",
      submenu: [
        { label: "数据", click: () => sendMenuAction(win, "menu:openSettingsPanel", "data") },
        { label: "字段识别", click: () => sendMenuAction(win, "menu:openSettingsPanel", "fields") },
        { label: "MT 响应字段", click: () => sendMenuAction(win, "menu:openSettingsPanel", "mtFields") },
        { type: "separator" },
        { label: "图幅", click: () => sendMenuAction(win, "menu:openSettingsPanel", "frame") },
        { label: "地形底图", click: () => sendMenuAction(win, "menu:openSettingsPanel", "terrain") },
        { label: "叠加层与图例", click: () => sendMenuAction(win, "menu:openSettingsPanel", "overlay") },
        { label: "点位符号", click: () => sendMenuAction(win, "menu:openSettingsPanel", "symbol") },
        { label: "测点标签", click: () => sendMenuAction(win, "menu:openSettingsPanel", "labels") },
        { label: "图件元素", click: () => sendMenuAction(win, "menu:openSettingsPanel", "elements") },
        { label: "MT 图件参数", click: () => sendMenuAction(win, "menu:openSettingsPanel", "mtParams") }
      ]
    },
    {
      label: "GMT",
      submenu: [
        {
          label: "重新检测 GMT",
          click: () => sendMenuAction(win, "menu:recheckGMT")
        },
        {
          label: "下载并安装 GMT",
          click: () => sendMenuAction(win, "menu:installGMT")
        },
        { type: "separator" },
        {
          label: "地形缓存管理...",
          click: () => sendMenuAction(win, "menu:openSettingsPanel", "terrain")
        },
        { type: "separator" },
        {
          label: "GMT 中文手册安装页",
          click: () => shell.openExternal("https://docs.gmt-china.org/latest/install/")
        },
        {
          label: "GMT 官方下载页",
          click: () => shell.openExternal("https://www.generic-mapping-tools.org/download/")
        }
      ]
    },
    {
      label: "视图",
      submenu: [
        { role: "reload", label: "重新载入" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { label: "切换全屏", accelerator: "F11", click: () => toggleFullScreen(win) },
        { label: "退出全屏", click: () => win.setFullScreen(false) }
      ]
    },
    {
      label: "窗口",
      submenu: [
        { label: "退出全屏", accelerator: "Esc", click: () => win.setFullScreen(false) },
        { label: "重置工作台布局", click: () => sendMenuAction(win, "menu:resetLayout") },
        { type: "separator" },
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "缩放" },
        ...(isMac ? [{ type: "separator" }, { role: "front", label: "全部置于前台" }] : [])
      ]
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "表格格式说明",
          click: () => sendMenuAction(win, "menu:showTableHelp")
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendMenuAction(win, action, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(action, payload);
}

app.whenReady().then(() => {
  registerPreviewProtocol();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("app:status", () => ({
  platform: process.platform,
  gmtInfo: resolveGMT(),
  gmtAvailable: gmtAvailable(),
  installPlan: installPlan(),
  outputDirectory: savedOutputDirectory(),
  version: app.getVersion()
}));

ipcMain.handle("window:getState", (event) => windowState(currentWindow(event)));
ipcMain.handle("window:minimize", (event) => {
  currentWindow(event)?.minimize();
});
ipcMain.handle("window:close", (event) => {
  currentWindow(event)?.close();
});
ipcMain.handle("window:toggleFullscreen", (event) => {
  toggleFullScreen(currentWindow(event));
});
ipcMain.handle("window:exitFullscreen", (event) => {
  currentWindow(event)?.setFullScreen(false);
});

ipcMain.handle("file:open", async (event) => {
  const result = await dialog.showOpenDialog({
    title: "选择点位或 MT 响应表格",
    properties: ["openFile"],
    filters: [
      { name: "表格文件", extensions: ["txt", "csv", "dat", "tsv", "xlsx", "xls"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return runImportWorker(event.sender, { mode: "stationFile", filePath: result.filePaths[0] });
});

ipcMain.handle("edi:openDirectory", async (event) => {
  const result = await dialog.showOpenDialog({
    title: "选择 EDI 文件夹",
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return runImportWorker(event.sender, { mode: "ediDirectory", directory: result.filePaths[0] });
});

ipcMain.handle("file:sample", async (event) => {
  const candidates = [
    path.join(process.resourcesPath || "", "sample_points.csv"),
    path.join(app.getAppPath(), "sample_points.csv"),
    path.join(__dirname, "..", "sample_points.csv")
  ];
  const samplePath = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!samplePath) throw new Error("未找到示例数据 sample_points.csv。");
  return runImportWorker(event.sender, { mode: "stationFile", filePath: samplePath });
});

ipcMain.handle("data:applyMapping", (event, payload) => {
  return runImportWorker(event.sender, { mode: "applyMapping", rows: payload.rows, mapping: payload.mapping });
});

ipcMain.handle("project:saveAs", async (_event, payload) => {
  const suggested = String(payload?.suggestedName || "mt_gmt_project").replace(/[\\/:*?"<>|]+/g, "_");
  const result = await dialog.showSaveDialog({
    title: "保存 MT-GMT 工程",
    defaultPath: `${suggested}.mtgmt`,
    filters: [
      { name: "MT-GMT 工程", extensions: ["mtgmt"] },
      { name: "JSON", extensions: ["json"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, JSON.stringify(payload.project, null, 2), "utf8");
  return result.filePath;
});

ipcMain.handle("project:open", async () => {
  const result = await dialog.showOpenDialog({
    title: "打开 MT-GMT 工程",
    properties: ["openFile"],
    filters: [
      { name: "MT-GMT 工程", extensions: ["mtgmt", "json"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const project = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return { filePath, project };
});

ipcMain.handle("file:saveText", async (_event, payload) => {
  const defaultPath = String(payload?.defaultPath || "mt_gmt_export.txt").replace(/[\\/:*?"<>|]+/g, "_");
  const result = await dialog.showSaveDialog({
    title: payload?.title || "保存文本文件",
    defaultPath,
    filters: payload?.filters || [
      { name: "文本文件", extensions: ["txt", "tsv", "csv"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, String(payload?.content || ""), "utf8");
  return result.filePath;
});

ipcMain.handle("gmt:buildScript", (_event, payload) => {
  return buildScript(payload.records, payload.config, outputDirectoryFromPayload(payload), payload.formats || ["png", "pdf", "eps"]);
});

ipcMain.handle("gmt:saveScript", async (event, payload) => {
  const result = await dialog.showSaveDialog({
    title: "保存 GMT 脚本",
    defaultPath: path.join(outputDirectoryFromPayload(payload), `${payload.config.outputName || "mt_point_map"}.${process.platform === "win32" ? "bat" : "gmt"}`),
    filters: [
      { name: "GMT 脚本", extensions: [process.platform === "win32" ? "bat" : "gmt"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePath) return null;
  await runGMTWorker(event.sender, {
    mode: "saveScript",
    records: payload.records,
    config: payload.config,
    outputDirectory: path.dirname(result.filePath),
    formats: payload.formats || ["png", "pdf", "eps"],
    scriptPath: result.filePath
  });
  return result.filePath;
});

ipcMain.handle("gmt:export", async (event, payload) => {
  const outputDirectory = outputDirectoryFromPayload(payload);
  saveOutputDirectory(outputDirectory);
  const formats = payload.formats || ["png"];
  const outputName = payload.config?.outputName || "mt_point_map";
  const result = await runGMTWorker(event.sender, {
    mode: "export",
    records: payload.records,
    config: payload.config,
    formats,
    outputDirectory
  });
  if (result.ok && result.needsNativeDecorations) {
    await overlayNativeDecorations(result, payload.config, outputName, formats);
  }
  return result;
});

ipcMain.handle("output:chooseDirectory", async (_event, currentDirectory) => {
  const result = await dialog.showOpenDialog({
    title: "选择导出目录",
    defaultPath: currentDirectory || defaultOutputDirectory(app),
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  saveOutputDirectory(result.filePaths[0]);
  return result.filePaths[0];
});

ipcMain.handle("output:deleteCurrent", (_event, payload) => {
  const outputDirectory = outputDirectoryFromPayload(payload);
  const outputName = String(payload?.outputName || "mt_point_map").trim() || "mt_point_map";
  return deleteCurrentOutputs(outputDirectory, outputName);
});

ipcMain.handle("terrain:estimate", (_event, payload) => {
  const outputDirectory = outputDirectoryFromPayload(payload);
  const config = normalizeTerrainConfig(payload);
  const paths = terrainPaths(outputDirectory, config);
  return {
    ...terrainEstimate(config.region, config.terrainResolution),
    ...paths,
    cacheReady: fs.existsSync(paths.gridPath) && fs.existsSync(paths.shadePath)
  };
});

ipcMain.handle("terrain:chooseLocalGrid", async () => {
  const result = await dialog.showOpenDialog({
    title: "选择本地 GRD 地形图",
    properties: ["openFile"],
    filters: [
      { name: "GMT 网格文件", extensions: ["grd", "nc"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle("fault:openFiles", async (event, payload) => {
  const result = await dialog.showOpenDialog({
    title: "选择构造线或断层线文件",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "构造线文件", extensions: ["txt", "csv", "dat", "tsv", "xy", "gmt", "bln"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const color = String(payload?.color || "#d7191c");
  return runImportWorker(event.sender, { mode: "faultFiles", filePaths: result.filePaths, color });
});

ipcMain.handle("terrain:prepare", (event, payload) => startTerrainTask(event.sender, payload));
ipcMain.handle("terrain:pause", () => {
  if (!currentTerrainTask) return { ok: false, message: "当前没有正在准备的地形底图。" };
  currentTerrainTask.pause();
  return { ok: true };
});
ipcMain.handle("terrain:resume", () => {
  if (!currentTerrainTask) return { ok: false, message: "当前没有可继续的地形底图任务。" };
  currentTerrainTask.resume();
  return { ok: true };
});
ipcMain.handle("terrain:cancel", () => {
  if (!currentTerrainTask) return { ok: false, message: "当前没有可取消的地形底图任务。" };
  currentTerrainTask.cancel();
  return { ok: true };
});
ipcMain.handle("terrain:deleteLocal", (_event, payload) => {
  const outputDirectory = outputDirectoryFromPayload(payload);
  const directory = path.join(outputDirectory, "terrain_cache");
  fs.rmSync(directory, { recursive: true, force: true });
  return { ok: true, message: `已删除本地地形底图：${directory}`, directory };
});
ipcMain.handle("terrain:clearCache", () => clearTerrainCache());
ipcMain.handle("terrain:cacheSummary", (_event, payload) => terrainCacheSummary(outputDirectoryFromPayload(payload)));
ipcMain.handle("terrain:deleteCurrentCache", (_event, payload) => deleteCurrentTerrainCache(outputDirectoryFromPayload(payload), payload));
ipcMain.handle("terrain:deleteCacheResolution", (_event, payload) => deleteTerrainCacheResolution(outputDirectoryFromPayload(payload), payload?.resolution));

ipcMain.handle("preview:imageDataUrl", (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) throw new Error(`预览图片不存在：${filePath || ""}`);
  return previewUrlForFile(filePath);
});

ipcMain.handle("gmt:install", (event) => startInstallerDownload(event.sender));
ipcMain.handle("gmt:downloadPause", () => {
  if (!currentInstallerDownload) return { ok: false, message: "当前没有正在下载的 GMT 安装包。" };
  currentInstallerDownload.pause();
  return { ok: true };
});
ipcMain.handle("gmt:downloadResume", () => {
  if (!currentInstallerDownload) return { ok: false, message: "当前没有可继续的 GMT 下载任务。" };
  currentInstallerDownload.resume();
  return { ok: true };
});
ipcMain.handle("gmt:downloadCancel", () => {
  if (!currentInstallerDownload) return { ok: false, message: "当前没有可取消的 GMT 下载任务。" };
  currentInstallerDownload.cancel();
  return { ok: true };
});
ipcMain.handle("gmt:cancelRender", () => {
  if (!currentGMTRenderTask?.child || currentGMTRenderTask.child.killed) return { ok: false, message: "当前没有正在运行的 GMT 绘图任务。" };
  try {
    currentGMTRenderTask.child.send({ type: "cancel" });
  } catch {
    // Fall through to a direct kill below.
  }
  setTimeout(() => {
    if (currentGMTRenderTask?.child && !currentGMTRenderTask.child.killed) currentGMTRenderTask.child.kill();
  }, 1200);
  return { ok: true, message: "已请求取消当前 GMT 绘图任务。" };
});
ipcMain.handle("gmt:recheck", () => ({
  gmtInfo: resolveGMT(),
  gmtAvailable: gmtAvailable(),
  installPlan: installPlan()
}));
ipcMain.handle("shell:openExternal", (_event, url) => shell.openExternal(url));
ipcMain.handle("shell:openPath", (_event, targetPath) => shell.openPath(targetPath));

function runImportWorker(webContents, payload) {
  return runForkWorker("import-worker.js", payload, webContents, "import");
}

function runGMTWorker(webContents, payload) {
  return runForkWorker("gmt-worker.js", payload, webContents, "gmt", { track: "gmt" });
}

function runForkWorker(scriptName, payload, webContents, progressChannel, options = {}) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, scriptName), [], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      serialization: "advanced"
    });
    if (options.track === "gmt") currentGMTRenderTask = { child, startedAt: Date.now() };
    let settled = false;
    let stderr = "";
    let stdout = "";
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      if (options.track === "gmt" && currentGMTRenderTask?.child === child) currentGMTRenderTask = null;
      callback(value);
    };
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("message", (message) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "progress" && progressChannel && webContents && !webContents.isDestroyed()) {
        webContents.send(`${progressChannel}:progress`, message.progress);
        return;
      }
      if (message.type === "result") {
        settle(resolve, message.result);
        return;
      }
      if (message.type === "error") {
        const error = new Error(message.message || `${scriptName} 执行失败。`);
        error.stack = message.stack || error.stack;
        settle(reject, error);
      }
    });
    child.on("error", (error) => settle(reject, error));
    child.on("exit", (code) => {
      if (settled) return;
      const details = stderr || stdout || (code === 0 ? "worker 已退出但主进程没有收到结果消息" : `退出码 ${code}`);
      settle(reject, new Error(`${scriptName} 后台任务异常结束：${details}`));
    });
    child.send({ type: "start", payload });
  });
}

function registerPreviewProtocol() {
  protocol.handle("mt-preview", async (request) => {
    const targetPath = previewPathFromUrl(request.url);
    if (!targetPath || !fs.existsSync(targetPath)) {
      return new Response("Preview image not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(targetPath).toString());
  });
}

function previewUrlForFile(filePath) {
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  const token = Buffer.from(resolved, "utf8").toString("base64url");
  return `mt-preview://image/${token}?v=${Math.round(stat.mtimeMs)}-${stat.size}`;
}

function previewPathFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const token = parsed.pathname.replace(/^\/+/, "");
    return Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function outputDirectoryFromPayload(payload) {
  const candidate = String(payload?.outputDirectory || "").trim();
  return candidate || savedOutputDirectory();
}

function savedOutputDirectory() {
  const settings = readSettings();
  return settings.outputDirectory || defaultOutputDirectory(app);
}

function saveOutputDirectory(outputDirectory) {
  const directory = String(outputDirectory || "").trim();
  if (!directory) return;
  writeSettings({ ...readSettings(), outputDirectory: directory });
}

function settingsFilePath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function readSettings() {
  try {
    const filePath = settingsFilePath();
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  try {
    const filePath = settingsFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), "utf8");
  } catch {
    // Settings persistence is helpful but should never block plotting.
  }
}

async function overlayNativeDecorations(result, config, outputName, requestedFormats) {
  const pngPath = path.join(result.outputDirectory, `${outputName}.png`);
  if (!fs.existsSync(pngPath)) throw new Error(`中文图名/图例叠加失败：未找到 PNG 底图 ${pngPath}`);
  const rendered = await renderDecoratedMap(pngPath, config);
  fs.writeFileSync(pngPath, rendered.pngBuffer);
  if (requestedFormats.includes("pdf")) {
    fs.writeFileSync(path.join(result.outputDirectory, `${outputName}.pdf`), rendered.pdfBuffer);
  }
  if (!requestedFormats.includes("png")) {
    try {
      fs.unlinkSync(pngPath);
    } catch {
      // Leaving the intermediate PNG is harmless if the file is locked by the OS.
    }
  }
}

async function renderDecoratedMap(pngPath, config = {}) {
  const image = nativeImage.createFromPath(pngPath);
  const size = image.getSize();
  if (!size.width || !size.height) throw new Error("中文图名/图例叠加失败：无法读取 GMT PNG 尺寸。");
  const title = String(config.title || "").trim();
  const titleHeight = title ? Math.max(72, Math.round(size.height * 0.085)) : 0;
  const titleSize = Math.max(26, Math.min(54, Math.round(size.width * 0.032)));
  const totalHeight = size.height + titleHeight;
  const imageUrl = image.toDataURL();
  const legend = nativeLegendMarkup(config, size);
  const mapElements = nativeMapElementsMarkup(config, size);
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: ${size.width}px ${totalHeight}px; margin: 0; }
    html, body {
      width: ${size.width}px;
      height: ${totalHeight}px;
      margin: 0;
      overflow: hidden;
      background: white;
    }
    .title {
      width: ${size.width}px;
      height: ${titleHeight}px;
      display: flex;
      align-items: end;
      justify-content: center;
      padding-bottom: ${Math.max(10, Math.round(titleHeight * 0.16))}px;
      box-sizing: border-box;
      color: #111;
      font: 700 ${titleSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "SimHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif;
      line-height: 1.08;
      white-space: nowrap;
    }
    .map-wrap {
      position: relative;
      width: ${size.width}px;
      height: ${size.height}px;
    }
    .map-wrap > img {
      display: block;
      width: ${size.width}px;
      height: ${size.height}px;
    }
    .native-legend {
      position: absolute;
      z-index: 2;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "SimHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif;
    }
    .native-legend-title { font-weight: 700; line-height: 1.25; }
    .native-legend-rule { height: 1px; background: rgba(90, 100, 110, 0.42); }
    .native-legend-entry { display: flex; align-items: center; line-height: 1.25; }
    .native-legend-symbol-wrap { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; }
    .native-legend-symbol { display: inline-block; box-sizing: border-box; }
    .native-legend-symbol.circle { border-radius: 50%; }
    .native-legend-symbol.diamond { transform: rotate(45deg) scale(0.78); }
    .native-legend-symbol.triangle { width: 0 !important; height: 0 !important; background: transparent !important; border-left-color: transparent !important; border-right-color: transparent !important; border-top: 0 !important; }
    .native-legend-line { height: 0; }
    .native-scale,
    .native-compass {
      position: absolute;
      z-index: 3;
      box-sizing: border-box;
      color: #17212b;
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
      filter: drop-shadow(0 1px 1px rgba(255,255,255,0.9));
    }
    .native-scale-label { text-align: center; font-weight: 700; line-height: 1.15; }
    .native-scale-bar {
      display: flex;
      height: 13px;
      border: 2px solid #111;
      background: #fff;
      box-sizing: border-box;
    }
    .native-scale-bar > span { flex: 1 1 50%; }
    .native-scale-bar > span:first-child { background: #111; }
    .native-scale-ticks { position: relative; height: 1.35em; line-height: 1.25; }
    .native-scale-ticks span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
    .native-scale-ticks .start { left: 0; transform: none; }
    .native-scale-ticks .middle { left: 50%; }
    .native-scale-ticks .end { left: 100%; transform: translateX(-100%); }
    .native-compass {
      width: 112px;
      height: 112px;
      border-radius: 50%;
      background: rgba(255,255,255,0.90);
      border: 1px solid rgba(65,76,88,0.48);
      box-shadow: 0 3px 12px rgba(22,31,45,0.13);
    }
    .native-compass svg { display: block; width: 100%; height: 100%; overflow: visible; }
  </style>
</head>
<body>
  ${title ? `<div class="title">${escapeHTML(title)}</div>` : ""}
  <div class="map-wrap">
    <img src="${escapeHTML(imageUrl)}" />
    ${legend}
    ${mapElements}
  </div>
</body>
</html>`;
  const win = new BrowserWindow({
    show: false,
    width: size.width,
    height: totalHeight,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      sandbox: true
    }
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await win.webContents.executeJavaScript(`
      Promise.all([
        Promise.resolve(document.fonts && document.fonts.ready),
        ...Array.from(document.images).map((image) => image.decode ? image.decode() : Promise.resolve())
      ]).then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    `);
    const pngBuffer = win.webContents.capturePage().then((captured) => captured.toPNG());
    const pdfBuffer = win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: "none" }
    });
    const [png, pdf] = await Promise.all([pngBuffer, pdfBuffer]);
    return { pngBuffer: png, pdfBuffer: pdf };
  } finally {
    win.destroy();
  }
}

function nativeMapElementsMarkup(config, imageSize) {
  if (!config?.swapAxes) return "";
  const scale = config.showScale ? nativeScaleMarkup(config, imageSize) : "";
  const compass = config.showNorthArrow ? nativeCompassMarkup(config) : "";
  return `${scale}${compass}`;
}

function nativeScaleMarkup(config, imageSize) {
  const region = String(config.region || "").split("/").map(Number);
  if (region.length !== 4 || region.some((value) => !Number.isFinite(value))) return "";
  const latitudeSpan = Math.abs(region[3] - region[2]);
  const midLatitude = (region[2] + region[3]) / 2;
  const metersPerDegree = latitudeDegreeLength(midLatitude);
  const mapMeters = latitudeSpan * metersPerDegree;
  if (!(mapMeters > 0)) return "";
  const scaleMeters = niceScaleDistance(mapMeters * 0.20);
  const projectionWidth = projectionWidthCm(config.projection);
  const dpi = clampNative(Number(config.pngDpi) || 300, 72, 1200);
  const width = clampNative(Math.round((projectionWidth * dpi / 2.54) * (scaleMeters / mapMeters)), 110, Math.round(imageSize.width * 0.34));
  const fontSize = clampNative(Math.round(imageSize.width * 0.0085), 18, 30);
  const position = nativeCornerStyle(config.scalePosition, "BL", { x: 0.083, y: 0.105 });
  const half = formatScaleDistance(scaleMeters / 2);
  const full = formatScaleDistance(scaleMeters);
  return `<div class="native-scale" style="${position};width:${width}px;font-size:${fontSize}px"><div class="native-scale-label">Scale</div><div class="native-scale-bar"><span></span><span></span></div><div class="native-scale-ticks"><span class="start">0</span><span class="middle">${half}</span><span class="end">${full}</span></div></div>`;
}

function nativeCompassMarkup(config) {
  let position = nativeCornerStyle(config.northPosition, "TR", { x: 0.075, y: 0.085 });
  const legendPosition = String(config?.legend?.position || "").toUpperCase();
  if (config?.legend?.show && String(config.northPosition || "TR").toUpperCase() === "TR" && legendPosition.includes("+JTR")) {
    position = "left:63%;top:8.5%;transform:translateX(-50%)";
  }
  return `<div class="native-compass" style="${position}" title="Axis orientation: north is right, east is up"><svg viewBox="0 0 112 112" role="img" aria-label="North points right; east points up"><circle cx="56" cy="56" r="31" fill="none" stroke="#56616d" stroke-width="1.5"/><line x1="21" y1="56" x2="91" y2="56" stroke="#34404c" stroke-width="2"/><line x1="56" y1="91" x2="56" y2="21" stroke="#34404c" stroke-width="2"/><path d="M91 56 L72 48 L76 56 L72 64 Z" fill="#d62828"/><path d="M56 21 L50 38 L56 35 L62 38 Z" fill="#34404c"/><circle cx="56" cy="56" r="4" fill="#17212b"/><text x="99" y="62" text-anchor="middle" font-size="17" font-weight="800" fill="#d62828">N</text><text x="56" y="16" text-anchor="middle" font-size="14" font-weight="700">E</text><text x="13" y="61" text-anchor="middle" font-size="12" font-weight="600">S</text><text x="56" y="107" text-anchor="middle" font-size="12" font-weight="600">W</text></svg></div>`;
}

function nativeCornerStyle(value, fallback, inset) {
  const corner = String(value || fallback).toUpperCase();
  const x = `${(inset.x * 100).toFixed(2)}%`;
  const y = `${(inset.y * 100).toFixed(2)}%`;
  return {
    TL: `left:${x};top:${y}`,
    TR: `right:${x};top:${y}`,
    BL: `left:${x};bottom:${y}`,
    BR: `right:${x};bottom:${y}`
  }[corner] || `left:${x};bottom:${y}`;
}

function latitudeDegreeLength(latitude) {
  const radians = Number(latitude) * Math.PI / 180;
  return 111132.92 - 559.82 * Math.cos(2 * radians) + 1.175 * Math.cos(4 * radians) - 0.0023 * Math.cos(6 * radians);
}

function niceScaleDistance(targetMeters) {
  if (!(targetMeters > 0)) return 100;
  const power = 10 ** Math.floor(Math.log10(targetMeters));
  const normalized = targetMeters / power;
  const step = [1, 2, 2.5, 5, 10].filter((candidate) => candidate <= normalized).pop() || 1;
  return step * power;
}

function formatScaleDistance(meters) {
  if (meters >= 1000) return `${Number((meters / 1000).toFixed(2))} km`;
  return `${Number(meters.toFixed(meters < 10 ? 1 : 0))} m`;
}

function nativeLegendMarkup(config, imageSize) {
  if (!config?.legend?.show) return "";
  const entries = buildLegendEntries(config);
  if (!entries.length) return "";
  const settings = normalizeLegendConfig(config.legend);
  const position = parseNativeLegendPosition(settings.position);
  const projectionWidth = projectionWidthCm(config.projection);
  const pxPerCm = imageSize.width / projectionWidth;
  const widthCm = Number.parseFloat(settings.width) || 4.2;
  const width = clampNative(Math.round(widthCm * pxPerCm), 260, Math.round(imageSize.width * 0.38));
  const titleSize = clampNative(Math.round(settings.titleFontSize * pxPerCm / 28.346), 22, 52);
  const labelSize = clampNative(Math.round(settings.labelFontSize * pxPerCm / 28.346), 18, 44);
  const symbolBox = clampNative(Math.round(0.52 * pxPerCm), 28, 58);
  const padding = clampNative(Math.round(0.18 * pxPerCm), 14, 28);
  const gap = clampNative(Math.round(0.10 * pxPerCm), 8, 18);
  const alpha = 1 - clampNative(Number(settings.backgroundTransparency) || 0, 0, 100) / 100;
  const transform = nativeLegendTransform(position.justify);
  const rows = entries.map((entry) => nativeLegendEntryMarkup(entry, symbolBox, labelSize, gap)).join("");
  return `<div class="native-legend" style="left:${(position.x * 100).toFixed(3)}%;top:${((1 - position.y) * 100).toFixed(3)}%;transform:${transform};width:${width}px;padding:${padding}px;background:${escapeHTML(settings.backgroundColor)};background-color:${colorWithAlpha(settings.backgroundColor, alpha)};border:${settings.borderWidth}px solid ${escapeHTML(settings.borderColor)};border-radius:${settings.cornerRadius}px;color:${escapeHTML(settings.textColor)};box-shadow:0 3px 14px rgba(22,31,45,0.12)"><div class="native-legend-title" style="font-size:${titleSize}px">${escapeHTML(settings.title || "图例")}</div><div class="native-legend-rule" style="margin:${gap}px 0"></div>${rows}</div>`;
}

function nativeLegendEntryMarkup(entry, symbolBox, labelSize, gap) {
  const penColor = String(entry.pen || "").split(",").pop() || "black";
  const fill = entry.fill || "#d7191c";
  let symbol;
  if (entry.symbol === "line") {
    symbol = `<span class="native-legend-line" style="width:${Math.round(symbolBox * 0.78)}px;border-top:${Math.max(2, Math.round(symbolBox * 0.08))}px solid ${escapeHTML(penColor)}"></span>`;
  } else {
    const gmtSymbol = entry.gmtSymbol || "c";
    const size = Math.round(symbolBox * 0.48);
    if (gmtSymbol === "t") {
      symbol = `<span class="native-legend-symbol triangle" style="border-left:${Math.round(size * 0.55)}px solid transparent;border-right:${Math.round(size * 0.55)}px solid transparent;border-bottom:${size}px solid ${escapeHTML(fill)}"></span>`;
    } else {
      const shape = gmtSymbol === "d" ? "diamond" : (gmtSymbol === "c" ? "circle" : "square");
      symbol = `<span class="native-legend-symbol ${shape}" style="width:${size}px;height:${size}px;background:${escapeHTML(fill)};border:${Math.max(1, Math.round(symbolBox * 0.04))}px solid ${escapeHTML(penColor)}"></span>`;
    }
  }
  return `<div class="native-legend-entry" style="font-size:${labelSize}px;margin-top:${gap}px"><span class="native-legend-symbol-wrap" style="width:${symbolBox}px;height:${symbolBox}px;margin-right:${gap}px">${symbol}</span><span>${escapeHTML(entry.label)}</span></div>`;
}

function parseNativeLegendPosition(value) {
  const match = String(value || "").match(/^n([0-9.]+)\/([0-9.]+)(?:\+j(TL|TR|BL|BR))?$/i);
  if (!match) return { x: 0.98, y: 0.98, justify: "TR" };
  return {
    x: clampNative(Number(match[1]), 0, 1),
    y: clampNative(Number(match[2]), 0, 1),
    justify: String(match[3] || "TR").toUpperCase()
  };
}

function nativeLegendTransform(justify) {
  return {
    TL: "translate(0,0)",
    TR: "translate(-100%,0)",
    BL: "translate(0,-100%)",
    BR: "translate(-100%,-100%)"
  }[justify] || "translate(-100%,0)";
}

function projectionWidthCm(value) {
  const match = String(value || "").match(/^[A-Za-z]([0-9.]+)c/i);
  const width = match ? Number(match[1]) : 16;
  return Number.isFinite(width) && width > 0 ? width : 16;
}

function colorWithAlpha(color, alpha) {
  const hex = String(color || "").match(/^#([0-9a-f]{6})$/i);
  if (!hex) return color;
  const value = Number.parseInt(hex[1], 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha.toFixed(3)})`;
}

function clampNative(value, min, max) {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : min));
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loadRenderer(win) {
  const rendererDir = path.join(__dirname, "renderer");
  const htmlPath = path.join(rendererDir, "index.html");
  const cssPath = path.join(rendererDir, "styles.css");
  const jsPath = path.join(rendererDir, "renderer.js");
  const bridge = `
    const { ipcRenderer } = require("electron");
    window.mtApp = {
      status: () => ipcRenderer.invoke("app:status"),
      openFile: () => ipcRenderer.invoke("file:open"),
      openEdiDirectory: () => ipcRenderer.invoke("edi:openDirectory"),
      loadSample: () => ipcRenderer.invoke("file:sample"),
      saveProject: (payload) => ipcRenderer.invoke("project:saveAs", payload),
      openProject: () => ipcRenderer.invoke("project:open"),
      saveTextFile: (payload) => ipcRenderer.invoke("file:saveText", payload),
      applyMapping: (payload) => ipcRenderer.invoke("data:applyMapping", payload),
      buildScript: (payload) => ipcRenderer.invoke("gmt:buildScript", payload),
      saveScript: (payload) => ipcRenderer.invoke("gmt:saveScript", payload),
      exportMap: (payload) => ipcRenderer.invoke("gmt:export", payload),
      chooseOutputDirectory: (currentDirectory) => ipcRenderer.invoke("output:chooseDirectory", currentDirectory),
      deleteCurrentOutputs: (payload) => ipcRenderer.invoke("output:deleteCurrent", payload),
      estimateTerrain: (payload) => ipcRenderer.invoke("terrain:estimate", payload),
      prepareTerrain: (payload) => ipcRenderer.invoke("terrain:prepare", payload),
      chooseLocalTerrainGrid: () => ipcRenderer.invoke("terrain:chooseLocalGrid"),
      pauseTerrain: () => ipcRenderer.invoke("terrain:pause"),
      resumeTerrain: () => ipcRenderer.invoke("terrain:resume"),
      cancelTerrain: () => ipcRenderer.invoke("terrain:cancel"),
      deleteLocalTerrain: (payload) => ipcRenderer.invoke("terrain:deleteLocal", payload),
      clearTerrainCache: () => ipcRenderer.invoke("terrain:clearCache"),
      terrainCacheSummary: (payload) => ipcRenderer.invoke("terrain:cacheSummary", payload),
      deleteCurrentTerrainCache: (payload) => ipcRenderer.invoke("terrain:deleteCurrentCache", payload),
      deleteTerrainCacheResolution: (payload) => ipcRenderer.invoke("terrain:deleteCacheResolution", payload),
      onTerrainProgress: (handler) => ipcRenderer.on("terrain:progress", (_event, payload) => handler(payload)),
      openFaultFiles: (payload) => ipcRenderer.invoke("fault:openFiles", payload),
      imageDataUrl: (filePath) => ipcRenderer.invoke("preview:imageDataUrl", filePath),
      installGMT: () => ipcRenderer.invoke("gmt:install"),
      pauseGMTDownload: () => ipcRenderer.invoke("gmt:downloadPause"),
      resumeGMTDownload: () => ipcRenderer.invoke("gmt:downloadResume"),
      cancelGMTDownload: () => ipcRenderer.invoke("gmt:downloadCancel"),
      onGMTDownloadProgress: (handler) => ipcRenderer.on("gmt:downloadProgress", (_event, payload) => handler(payload)),
      cancelGMTRender: () => ipcRenderer.invoke("gmt:cancelRender"),
      onMenuOpenFile: (handler) => ipcRenderer.on("menu:openFile", handler),
      onMenuOpenEdiDirectory: (handler) => ipcRenderer.on("menu:openEdiDirectory", handler),
      onMenuOpenProject: (handler) => ipcRenderer.on("menu:openProject", handler),
      onMenuSaveProject: (handler) => ipcRenderer.on("menu:saveProject", handler),
      onMenuLoadSample: (handler) => ipcRenderer.on("menu:loadSample", handler),
      onMenuChooseOutputDirectory: (handler) => ipcRenderer.on("menu:chooseOutputDirectory", handler),
      onMenuExportPng: (handler) => ipcRenderer.on("menu:exportPng", handler),
      onMenuExportPdf: (handler) => ipcRenderer.on("menu:exportPdf", handler),
      onMenuExportBoth: (handler) => ipcRenderer.on("menu:exportBoth", handler),
      onMenuExportEps: (handler) => ipcRenderer.on("menu:exportEps", handler),
      onMenuExportAll: (handler) => ipcRenderer.on("menu:exportAll", handler),
      onMenuSaveScript: (handler) => ipcRenderer.on("menu:saveScript", handler),
      onMenuDeleteOutputs: (handler) => ipcRenderer.on("menu:deleteOutputs", handler),
      onMenuShowTableHelp: (handler) => ipcRenderer.on("menu:showTableHelp", handler),
      onMenuOpenSettingsPanel: (handler) => ipcRenderer.on("menu:openSettingsPanel", (_event, panel) => handler(panel)),
      onMenuResetLayout: (handler) => ipcRenderer.on("menu:resetLayout", handler),
      onMenuRecheckGMT: (handler) => ipcRenderer.on("menu:recheckGMT", handler),
      onMenuInstallGMT: (handler) => ipcRenderer.on("menu:installGMT", handler),
      getWindowState: () => ipcRenderer.invoke("window:getState"),
      minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
      closeWindow: () => ipcRenderer.invoke("window:close"),
      toggleWindowFullscreen: () => ipcRenderer.invoke("window:toggleFullscreen"),
      exitWindowFullscreen: () => ipcRenderer.invoke("window:exitFullscreen"),
      onWindowState: (handler) => ipcRenderer.on("window:state", (_event, payload) => handler(payload)),
      onImportProgress: (handler) => ipcRenderer.on("import:progress", (_event, payload) => handler(payload)),
      onGMTRenderProgress: (handler) => ipcRenderer.on("gmt:progress", (_event, payload) => handler(payload)),
      recheckGMT: () => ipcRenderer.invoke("gmt:recheck"),
      openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
      openPath: (targetPath) => ipcRenderer.invoke("shell:openPath", targetPath)
    };
  `;

  let html = fs.readFileSync(htmlPath, "utf8");
  const css = fs.readFileSync(cssPath, "utf8");
  const renderer = fs.readFileSync(jsPath, "utf8");
  html = html
    .replace('<link rel="stylesheet" href="styles.css" />', `<style>\n${css}\n</style>`)
    .replace('<script src="renderer.js"></script>', `<script>\n${bridge}\n${renderer}\n</script>`);
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function normalizeTerrainConfig(payload) {
  const config = { ...(payload?.config || {}) };
  if (!String(config.region || "").trim() && Array.isArray(payload?.records) && payload.records.length) {
    config.region = autoRegion(payload.records);
  }
  config.terrainResolution = config.terrainResolution || "06m";
  config.terrainIntensity = terrainIntensity(config.terrainIntensity);
  config.terrainDataServer = terrainDataServer(config.terrainDataServer);
  return config;
}

function deleteCurrentOutputs(outputDirectory, outputName) {
  const extensions = process.platform === "win32" ? ["png", "pdf", "eps", "bat"] : ["png", "pdf", "eps", "gmt"];
  const candidates = [
    ...extensions.map((extension) => path.join(outputDirectory, `${outputName}.${extension}`)),
    path.join(outputDirectory, "stations_points.tsv"),
    path.join(outputDirectory, "stations_labels.tsv"),
    path.join(outputDirectory, DEFAULT_OVERLAY_FILE),
    path.join(outputDirectory, DEFAULT_LEGEND_FILE)
  ];
  const deleted = [];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    fs.rmSync(filePath, { force: true });
    deleted.push(filePath);
  }
  return {
    ok: true,
    deleted,
    message: deleted.length ? `已删除 ${deleted.length} 个当前图件文件。` : "没有找到可删除的当前图件文件。"
  };
}

function terrainCacheSummary(outputDirectory) {
  const directory = path.join(outputDirectory, "terrain_cache");
  const files = [];
  collectCacheFiles(directory, files);
  const groups = new Map();
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.size;
    const resolution = terrainCacheResolution(file.path) || "other";
    const group = groups.get(resolution) || { resolution, files: 0, bytes: 0 };
    group.files += 1;
    group.bytes += file.size;
    groups.set(resolution, group);
  }
  return {
    directory,
    exists: fs.existsSync(directory),
    totalBytes,
    totalFiles: files.length,
    groups: Array.from(groups.values()).sort((a, b) => a.resolution.localeCompare(b.resolution))
  };
}

function deleteCurrentTerrainCache(outputDirectory, payload) {
  const config = normalizeTerrainConfig(payload);
  const paths = terrainPaths(outputDirectory, config);
  const targets = [paths.gridPath, paths.shadePath];
  let bytes = 0;
  const deleted = [];
  for (const filePath of targets) {
    if (!fs.existsSync(filePath)) continue;
    try {
      bytes += fs.statSync(filePath).size;
    } catch {
      // The file may disappear between existence and stat checks.
    }
    fs.rmSync(filePath, { force: true });
    deleted.push(filePath);
  }
  removeEmptyDirectories(paths.directory);
  return {
    ok: true,
    deleted,
    bytes,
    message: deleted.length
      ? `已删除当前范围 ${config.terrainResolution} 地形缓存 ${deleted.length} 个文件，释放 ${formatBytesLocal(bytes)}。`
      : `当前范围 ${config.terrainResolution} 没有可删除的本地地形缓存。`
  };
}

function deleteTerrainCacheResolution(outputDirectory, resolution) {
  const targetResolution = String(resolution || "").trim();
  if (!targetResolution) return { ok: false, message: "请选择要删除的地形缓存分辨率。" };
  const directory = path.join(outputDirectory, "terrain_cache");
  const files = [];
  collectCacheFiles(directory, files);
  const targets = files.filter((file) => terrainCacheResolution(file.path) === targetResolution);
  let bytes = 0;
  for (const file of targets) {
    bytes += file.size;
    fs.rmSync(file.path, { force: true });
  }
  removeEmptyDirectories(directory);
  return {
    ok: true,
    deleted: targets.length,
    bytes,
    message: targets.length
      ? `已删除 ${targetResolution} 地形缓存 ${targets.length} 个文件，释放 ${formatBytesLocal(bytes)}。`
      : `没有找到 ${targetResolution} 地形缓存文件。`
  };
}

function collectCacheFiles(directory, files) {
  if (!directory || !fs.existsSync(directory)) return;
  let entries = [];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectCacheFiles(fullPath, files);
    else if (entry.isFile()) {
      try {
        files.push({ path: fullPath, size: fs.statSync(fullPath).size });
      } catch {
        // Ignore files removed while scanning.
      }
    }
  }
}

function terrainCacheResolution(filePath) {
  const name = path.basename(filePath);
  const relief = /^earth_relief_([0-9]{2}[ms])_/i.exec(name);
  if (relief) return relief[1];
  if (/\.hgt$|\.hgt\.gz$/i.test(name)) return "srtm";
  if (/srtm_points_([0-9]{2}[ms])_/i.test(name)) return RegExp.$1;
  return "";
}

function removeEmptyDirectories(directory) {
  if (!directory || !fs.existsSync(directory)) return false;
  let entries = [];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) removeEmptyDirectories(path.join(directory, entry.name));
  }
  try {
    if (directory.endsWith("terrain_cache")) return false;
    if (!fs.readdirSync(directory).length) {
      fs.rmdirSync(directory);
      return true;
    }
  } catch {
    // Directory may be in use.
  }
  return false;
}

function formatBytesLocal(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = Math.max(0, Number(bytes) || 0);
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function startTerrainTask(webContents, payload) {
  const outputDirectory = outputDirectoryFromPayload(payload);
  saveOutputDirectory(outputDirectory);
  const config = normalizeTerrainConfig(payload);
  const estimate = terrainEstimate(config.region, config.terrainResolution);
  if (estimate.blocked) {
    return { ok: false, message: estimate.warning, status: null, estimate };
  }
  const gmtInfo = resolveGMT();
  if (!gmtInfo.available) {
    return { ok: false, message: "未找到 GMT，无法下载或准备地形底图。", status: null };
  }
  if (currentTerrainTask && !currentTerrainTask.done) {
    return { ok: true, message: "地形底图任务正在进行。", status: currentTerrainTask.statusPayload() };
  }
  const TaskClass = terrainSource(config.terrainResolution) === "srtm" ? SrtmTerrainWorkerTask : TerrainPrepareTask;
  currentTerrainTask = new TaskClass({
    gmtInfo,
    outputDirectory,
    config,
    webContents,
    onDone: () => {
      currentTerrainTask = null;
    }
  });
  currentTerrainTask.start();
  return { ok: true, message: "开始准备地形底图。", status: currentTerrainTask.statusPayload() };
}

function clearTerrainCache() {
  const gmtInfo = resolveGMT();
  if (!gmtInfo.available) return { ok: false, message: "未找到 GMT，无法清理地形缓存。" };
  return new Promise((resolve) => {
    const child = spawn(gmtInfo.path, ["clear", "data=earth"], {
      cwd: savedOutputDirectory(),
      env: gmtChildEnv(gmtInfo)
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ ok: false, message: error.message || String(error) });
    });
    child.on("close", (code) => {
      const message = stderr || stdout || "已清理 GMT 地形数据缓存。";
      resolve(code === 0 ? { ok: true, message } : { ok: false, message: message || "GMT 地形缓存清理失败。" });
    });
  });
}

function gmtChildEnv(gmtInfo, config = {}) {
  const env = {
    ...process.env,
    PATH: `${gmtInfo.binDir}${path.delimiter}${process.env.PATH || ""}`,
    GMT_DATA_SERVER: terrainDataServer(config.terrainDataServer || process.env.GMT_DATA_SERVER)
  };
  if (gmtInfo.gsLib) env.GS_LIB = gmtInfo.gsLib;
  return env;
}

function startInstallerDownload(webContents) {
  const gmtInfo = resolveGMT();
  if (gmtInfo.available) {
    return { ok: false, message: `GMT 已安装，无需下载。\n${gmtInfo.path}`, status: null };
  }
  if (currentInstallerDownload && !currentInstallerDownload.done) {
    return { ok: true, message: "GMT 安装包正在下载。", status: currentInstallerDownload.statusPayload() };
  }

  const plan = installPlan();
  if (!plan.canAutoInstall || !plan.download) {
    return { ok: false, message: plan.message, status: null };
  }

  const targetDir = app.getPath("downloads");
  const targetPath = path.join(targetDir, plan.download.fileName);
  currentInstallerDownload = new InstallerDownloadTask(plan.download, targetPath, webContents, () => {
    currentInstallerDownload = null;
  });
  currentInstallerDownload.start();
  return { ok: true, message: `开始下载：${plan.download.fileName}`, status: currentInstallerDownload.statusPayload() };
}

class TerrainPrepareTask {
  constructor({ gmtInfo, outputDirectory, config, webContents, onDone }) {
    this.gmtInfo = gmtInfo;
    this.outputDirectory = outputDirectory;
    this.config = config;
    this.webContents = webContents;
    this.onDone = onDone;
    this.paths = terrainPaths(outputDirectory, config);
    this.estimate = terrainEstimate(config.region, config.terrainResolution);
    this.child = null;
    this.currentStep = "starting";
    this.state = "starting";
    this.message = "准备地形底图任务...";
    this.percent = 0;
    this.startedAt = Date.now();
    this.done = false;
    this.cancelled = false;
    this.pausing = false;
    this.pausedBySignal = false;
    this.lastOutput = "";
    this.lastEmitAt = 0;
  }

  start() {
    fs.mkdirSync(this.paths.directory, { recursive: true });
    if (this.estimate.blocked) {
      this.fail(this.estimate.warning);
      return;
    }
    if (fs.existsSync(this.paths.gridPath) && fs.existsSync(this.paths.shadePath)) {
      this.state = "completed";
      this.message = "地形底图已存在，可直接绘图。";
      this.percent = 100;
      this.done = true;
      this.emit();
      this.finishSoon();
      return;
    }
    this.runSetDownloadMode();
  }

  runSetDownloadMode() {
    this.runGMTStep({
      step: "offline",
      args: ["set", "GMT_DATA_UPDATE_INTERVAL", this.config.terrainAllowDownload ? "1d" : "off"],
      message: this.config.terrainAllowDownload ? "已允许 GMT 联网获取缺失地形数据。" : "已关闭 GMT 在线下载，只使用本地缓存。",
      basePercent: 5,
      next: () => this.runCut()
    });
  }

  runCut() {
    this.runGMTStep({
      step: "cut",
      args: ["grdcut", terrainRemoteName(this.config.terrainResolution), `-R${this.config.region}`, `-G${this.paths.gridPath}`, "-V"],
      message: `正在获取并裁剪 ${terrainRemoteName(this.config.terrainResolution)}...`,
      basePercent: 12,
      next: () => this.runGradient()
    });
  }

  runGradient() {
    this.runGMTStep({
      step: "gradient",
      args: ["grdgradient", this.paths.gridPath, "-A315", `-Ne${terrainIntensity(this.config.terrainIntensity)}`, `-G${this.paths.shadePath}`],
      message: "正在生成地形阴影...",
      basePercent: 80,
      next: () => this.complete()
    });
  }

  runGMTStep({ step, args, message, basePercent, next }) {
    this.currentStep = step;
    this.state = "running";
    this.message = message;
    this.percent = Math.max(this.percent, basePercent);
    this.pausing = false;
    this.pausedBySignal = false;
    this.emit();
    this.child = spawn(this.gmtInfo.path, args, {
      cwd: this.outputDirectory,
      encoding: "utf8",
      env: gmtChildEnv(this.gmtInfo, this.config)
    });
    const onData = (chunk) => {
      this.lastOutput = String(chunk).trim() || this.lastOutput;
      this.message = this.lastOutput || message;
      if (step === "cut") this.percent = Math.min(75, this.percent + 1.8);
      if (step === "gradient") this.percent = Math.min(96, this.percent + 3);
      this.emitThrottled();
    };
    this.child.stdout.on("data", onData);
    this.child.stderr.on("data", onData);
    this.child.on("error", (error) => {
      if (!this.done && !this.pausing) this.fail(error.message || String(error));
    });
    this.child.on("close", (code, signal) => {
      this.child = null;
      if (this.cancelled || this.done) return;
      if (this.pausing) {
        this.state = "paused";
        this.message = "地形底图任务已暂停，继续后会复用已缓存数据重新准备。";
        this.emit();
        return;
      }
      if (code === 0) {
        if (step === "cut" && !fs.existsSync(this.paths.gridPath)) {
          this.fail("GMT 没有生成地形网格文件。请尝试更低分辨率，或检查 GMT 数据服务器/GDAL OpenJPEG 支持。");
          return;
        }
        if (step === "gradient" && !fs.existsSync(this.paths.shadePath)) {
          this.fail("GMT 没有生成地形阴影文件。请尝试更低分辨率或重新准备底图。");
          return;
        }
        next();
      } else {
        this.fail(this.lastOutput || `GMT ${step} 执行失败：${signal || code}`);
      }
    });
  }

  pause() {
    if (this.done || this.state !== "running") return;
    if (this.child && process.platform !== "win32") {
      this.child.kill("SIGSTOP");
      this.state = "paused";
      this.pausedBySignal = true;
      this.message = "地形底图任务已暂停。";
      this.emit();
      return;
    }
    this.pausing = true;
    if (this.child) this.child.kill();
    this.state = "paused";
    this.message = "地形底图任务已暂停，继续后会重新启动当前步骤。";
    this.emit();
  }

  resume() {
    if (this.done || this.state !== "paused") return;
    if (this.child && this.pausedBySignal && process.platform !== "win32") {
      this.child.kill("SIGCONT");
      this.state = "running";
      this.pausedBySignal = false;
      this.message = "继续准备地形底图...";
      this.emit();
      return;
    }
    this.message = "继续准备地形底图...";
    if (this.currentStep === "gradient" && fs.existsSync(this.paths.gridPath)) {
      this.runGradient();
    } else if (this.currentStep === "offline") {
      this.runSetDownloadMode();
    } else {
      this.runCut();
    }
  }

  cancel() {
    if (this.done) return;
    this.cancelled = true;
    this.done = true;
    this.state = "cancelled";
    this.message = "地形底图任务已取消。";
    if (this.child) this.child.kill();
    fs.rmSync(this.paths.gridPath, { force: true });
    fs.rmSync(this.paths.shadePath, { force: true });
    this.emit();
    this.finishSoon();
  }

  complete() {
    this.state = "completed";
    this.message = "地形底图准备完成。";
    this.percent = 100;
    this.done = true;
    this.emit();
    this.finishSoon();
  }

  fail(message) {
    if (this.done) return;
    this.state = "failed";
    this.message = `地形底图准备失败：${message}`;
    this.done = true;
    this.emit();
    this.finishSoon();
  }

  statusPayload() {
    const elapsedSeconds = Math.max((Date.now() - this.startedAt) / 1000, 0.1);
    const total = this.estimate.workingBytes || 0;
    const downloaded = total ? Math.round(total * (this.percent / 100)) : 0;
    return {
      state: this.state,
      message: this.message,
      step: this.currentStep,
      key: this.paths.key,
      gridPath: this.paths.gridPath,
      shadePath: this.paths.shadePath,
      directory: this.paths.directory,
      estimatedBytes: total,
      downloaded,
      total,
      percent: this.percent,
      speed: downloaded / elapsedSeconds,
      resolution: this.config.terrainResolution,
      region: this.config.region
    };
  }

  emit() {
    if (!this.webContents || this.webContents.isDestroyed()) return;
    this.lastEmitAt = Date.now();
    this.webContents.send("terrain:progress", this.statusPayload());
  }

  emitThrottled() {
    if (Date.now() - this.lastEmitAt < 250) return;
    this.emit();
  }

  finishSoon() {
    setTimeout(() => {
      if (currentTerrainTask === this && this.onDone) this.onDone();
    }, 1500);
  }
}

class SrtmTerrainWorkerTask {
  constructor({ gmtInfo, outputDirectory, config, webContents, onDone }) {
    this.gmtInfo = gmtInfo;
    this.outputDirectory = outputDirectory;
    this.config = config;
    this.webContents = webContents;
    this.onDone = onDone;
    this.paths = terrainPaths(outputDirectory, config);
    this.estimate = terrainEstimate(config.region, config.terrainResolution);
    this.worker = null;
    this.currentStep = "starting";
    this.state = "starting";
    this.message = "准备 SRTM 高分辨率地形底图...";
    this.percent = 0;
    this.downloaded = 0;
    this.total = this.estimate.workingBytes || 0;
    this.startedAt = Date.now();
    this.done = false;
    this.cancelled = false;
    this.lastOutput = "";
    this.lastEmitAt = 0;
    this.killTimer = null;
  }

  start() {
    fs.mkdirSync(this.paths.directory, { recursive: true });
    if (this.estimate.blocked) {
      this.fail(this.estimate.warning);
      return;
    }
    if (fs.existsSync(this.paths.gridPath) && fs.existsSync(this.paths.shadePath)) {
      this.state = "completed";
      this.message = "SRTM 地形底图已存在，可直接绘图。";
      this.percent = 100;
      this.done = true;
      this.emit();
      this.finishSoon();
      return;
    }
    this.spawnWorker();
  }

  spawnWorker() {
    this.currentStep = "worker";
    this.state = "running";
    this.message = "正在启动独立 SRTM 地形处理进程...";
    this.percent = Math.max(this.percent, 1);
    this.emit();
    try {
      const workerPath = path.join(__dirname, "srtm-worker.js");
      this.worker = fork(workerPath, [], {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1"
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"]
      });
    } catch (error) {
      this.fail(error.message || String(error));
      return;
    }
    const onOutput = (chunk) => {
      this.lastOutput = tailText(`${this.lastOutput}\n${String(chunk).trim()}`, 4000);
    };
    this.worker.stdout?.on("data", onOutput);
    this.worker.stderr?.on("data", onOutput);
    this.worker.on("message", (message) => {
      if (message?.type === "status") this.applyWorkerStatus(message.status || {});
    });
    this.worker.on("error", (error) => {
      if (!this.done) this.fail(error.message || String(error));
    });
    this.worker.on("exit", (code, signal) => {
      this.worker = null;
      if (this.done) return;
      const detail = this.lastOutput || signal || code;
      this.fail(`SRTM 地形处理进程异常退出：${detail}`);
    });
    this.worker.send({
      type: "start",
      payload: {
        gmtInfo: {
          path: this.gmtInfo.path,
          binDir: this.gmtInfo.binDir,
          gsLib: this.gmtInfo.gsLib
        },
        outputDirectory: this.outputDirectory,
        config: this.config
      }
    });
  }

  applyWorkerStatus(status) {
    this.state = status.state || this.state;
    this.message = status.message || this.message;
    this.currentStep = status.step || this.currentStep;
    this.percent = Number.isFinite(status.percent) ? status.percent : this.percent;
    this.downloaded = Number.isFinite(status.downloaded) ? status.downloaded : this.downloaded;
    this.total = Number.isFinite(status.total) ? status.total : this.total;
    this.emit();
    if (["completed", "failed", "cancelled"].includes(this.state)) {
      this.done = true;
      if (this.killTimer) {
        clearTimeout(this.killTimer);
        this.killTimer = null;
      }
      this.finishSoon();
    }
  }

  pause() {
    if (this.done || !this.worker || this.state !== "running") return;
    this.worker.send({ type: "pause" });
  }

  resume() {
    if (this.done || !this.worker || this.state !== "paused") return;
    this.worker.send({ type: "resume" });
  }

  cancel() {
    if (this.done) return;
    this.cancelled = true;
    this.state = "cancelled";
    this.message = "SRTM 地形底图任务已取消。";
    this.done = true;
    if (this.worker?.connected) this.worker.send({ type: "cancel" });
    this.killTimer = setTimeout(() => {
      if (this.worker) this.worker.kill();
    }, 4000);
    this.emit();
    this.finishSoon();
  }

  fail(message) {
    if (this.done) return;
    this.state = "failed";
    this.message = `SRTM 地形底图准备失败：${message}`;
    this.done = true;
    if (this.worker) this.worker.kill();
    this.emit();
    this.finishSoon();
  }

  statusPayload() {
    const elapsedSeconds = Math.max((Date.now() - this.startedAt) / 1000, 0.1);
    return {
      state: this.state,
      message: this.message,
      step: this.currentStep,
      key: this.paths.key,
      gridPath: this.paths.gridPath,
      shadePath: this.paths.shadePath,
      directory: this.paths.directory,
      estimatedBytes: this.total,
      downloaded: this.downloaded,
      total: this.total,
      percent: this.percent,
      speed: this.downloaded / elapsedSeconds,
      resolution: this.config.terrainResolution,
      region: this.config.region
    };
  }

  emit() {
    if (!this.webContents || this.webContents.isDestroyed()) return;
    this.lastEmitAt = Date.now();
    this.webContents.send("terrain:progress", this.statusPayload());
  }

  finishSoon() {
    setTimeout(() => {
      if (currentTerrainTask === this && this.onDone) this.onDone();
    }, 1500);
  }
}

function tailText(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? text.slice(text.length - maxLength) : text;
}

class InstallerDownloadTask {
  constructor(download, targetPath, webContents, onDone) {
    this.download = download;
    this.targetPath = targetPath;
    this.tempPath = `${targetPath}.download`;
    this.webContents = webContents;
    this.onDone = onDone;
    this.request = null;
    this.response = null;
    this.file = null;
    this.downloaded = 0;
    this.total = 0;
    this.startedAt = Date.now();
    this.state = "starting";
    this.message = "准备下载 GMT 安装包...";
    this.done = false;
    this.cancelled = false;
    this.lastEmitAt = 0;
  }

  start() {
    fs.mkdirSync(path.dirname(this.targetPath), { recursive: true });
    if (fs.existsSync(this.targetPath)) {
      this.state = "completed";
      this.message = "安装包已存在，正在打开。";
      this.done = true;
      this.emit();
      openDownloadedInstaller(this.targetPath);
      this.finishSoon();
      return;
    }
    fs.rmSync(this.tempPath, { force: true });
    this.beginRequest(this.download.url, 0);
  }

  beginRequest(url, redirectCount) {
    if (redirectCount > 5) {
      this.fail("下载重定向次数过多，请检查网络或手动打开 GMT 官网。");
      return;
    }
    this.state = "downloading";
    this.message = "正在连接 GMT 官方下载源...";
    this.emit();

    this.request = https.get(url, { headers: { "User-Agent": "MT-Point-Map-GMT" }, timeout: 30000 }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        const location = response.headers.location;
        if (!location) {
          this.fail("下载地址重定向无效。");
          return;
        }
        this.beginRequest(new URL(location, url).toString(), redirectCount + 1);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        this.fail(`服务器返回 HTTP ${response.statusCode}`);
        return;
      }

      this.response = response;
      this.total = Number(response.headers["content-length"] || 0);
      this.file = fs.createWriteStream(this.tempPath);
      this.message = "正在下载 GMT 安装包...";
      this.emit();

      response.on("data", (chunk) => {
        if (this.cancelled) return;
        this.downloaded += chunk.length;
        if (!this.file.write(chunk)) {
          response.pause();
          this.file.once("drain", () => {
            if (this.state === "downloading" && !this.cancelled) response.resume();
          });
        }
        this.emitThrottled();
      });

      response.on("end", () => {
        if (this.cancelled) return;
        this.file.end(() => {
          fs.renameSync(this.tempPath, this.targetPath);
          this.state = "completed";
          this.message = "GMT 安装包下载完成，正在打开安装包。";
          this.done = true;
          this.emit();
          openDownloadedInstaller(this.targetPath);
          this.finishSoon();
        });
      });

      response.on("error", (error) => {
        if (!this.cancelled) this.fail(error.message || String(error));
      });

      this.file.on("error", (error) => {
        if (!this.cancelled) this.fail(error.message || String(error));
      });
    });

    this.request.on("timeout", () => {
      this.request.destroy(new Error("下载超时，请检查网络连接。"));
    });
    this.request.on("error", (error) => {
      if (!this.cancelled) this.fail(error.message || String(error));
    });
  }

  pause() {
    if (this.state !== "downloading" || !this.response) return;
    this.response.pause();
    this.state = "paused";
    this.message = "下载已暂停。";
    this.emit();
  }

  resume() {
    if (this.state !== "paused" || !this.response) return;
    this.state = "downloading";
    this.message = "继续下载 GMT 安装包...";
    this.response.resume();
    this.emit();
  }

  cancel() {
    if (this.done) return;
    this.cancelled = true;
    this.state = "cancelled";
    this.message = "下载已取消。";
    this.done = true;
    if (this.request) this.request.destroy();
    if (this.response) this.response.destroy();
    if (this.file) this.file.destroy();
    fs.rmSync(this.tempPath, { force: true });
    this.emit();
    this.finishSoon();
  }

  fail(message) {
    if (this.done) return;
    this.state = "failed";
    this.message = `GMT 安装包下载失败：${message}`;
    this.done = true;
    if (this.file) this.file.destroy();
    fs.rmSync(this.tempPath, { force: true });
    this.emit();
    this.finishSoon();
  }

  statusPayload() {
    const elapsedSeconds = Math.max((Date.now() - this.startedAt) / 1000, 0.1);
    const percent = this.total > 0 ? Math.min(100, (this.downloaded / this.total) * 100) : 0;
    return {
      state: this.state,
      message: this.message,
      fileName: this.download.fileName,
      filePath: this.targetPath,
      downloaded: this.downloaded,
      total: this.total,
      percent,
      speed: this.downloaded / elapsedSeconds
    };
  }

  emit() {
    if (!this.webContents || this.webContents.isDestroyed()) return;
    this.lastEmitAt = Date.now();
    this.webContents.send("gmt:downloadProgress", this.statusPayload());
  }

  emitThrottled() {
    if (Date.now() - this.lastEmitAt < 180) return;
    this.emit();
  }

  finishSoon() {
    setTimeout(() => {
      if (currentInstallerDownload === this && this.onDone) this.onDone();
    }, 1200);
  }
}
