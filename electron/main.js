const fs = require("fs");
const https = require("https");
const path = require("path");
const zlib = require("zlib");
const { spawn, spawnSync } = require("child_process");
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage, shell } = require("electron");
const { parseStationText, parseEdiStationText, buildEdiParsedResult, buildRecords } = require("./parser");
const {
  autoRegion,
  buildScript,
  defaultOutputDirectory,
  gmtAvailable,
  installPlan,
  needsNativeTextRendering,
  openDownloadedInstaller,
  resolveGMT,
  runGMT,
  saveScript,
  terrainEstimate,
  terrainIntensity,
  terrainPaths,
  terrainRemoteName,
  terrainResolutionSeconds,
  terrainSource
} = require("./gmt");

const APP_TITLE = "MT点位图制作工具—GMT";
let currentInstallerDownload = null;
let currentTerrainTask = null;

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
  configureMenu(win);
  loadRenderer(win);
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
          label: "导入",
          submenu: [
            {
              label: "TXT/CSV 点位文件...",
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
          label: "选择导出目录...",
          click: () => sendMenuAction(win, "menu:chooseOutputDirectory")
        },
        { type: "separator" },
        isMac ? { role: "close", label: "关闭窗口" } : { role: "quit", label: "退出" }
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
      label: "视图",
      submenu: [
        { role: "reload", label: "重新载入" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "进入全屏" }
      ]
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "缩放" },
        ...(isMac ? [{ type: "separator" }, { role: "front", label: "全部置于前台" }] : [])
      ]
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "GMT 中文手册安装页",
          click: () => shell.openExternal("https://docs.gmt-china.org/latest/install/")
        },
        {
          label: "GMT 官方下载页",
          click: () => shell.openExternal("https://www.generic-mapping-tools.org/download/")
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendMenuAction(win, action) {
  if (win && !win.isDestroyed()) win.webContents.send(action);
}

app.whenReady().then(() => {
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

ipcMain.handle("file:open", async () => {
  const result = await dialog.showOpenDialog({
    title: "选择点位 TXT/CSV 文件",
    properties: ["openFile"],
    filters: [
      { name: "点位文件", extensions: ["txt", "csv", "dat", "tsv"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return loadStationFile(result.filePaths[0]);
});

ipcMain.handle("edi:openDirectory", async () => {
  const result = await dialog.showOpenDialog({
    title: "选择 EDI 文件夹",
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return loadEdiDirectory(result.filePaths[0]);
});

ipcMain.handle("file:sample", () => {
  const candidates = [
    path.join(process.resourcesPath || "", "sample_points.csv"),
    path.join(app.getAppPath(), "sample_points.csv"),
    path.join(__dirname, "..", "sample_points.csv")
  ];
  const samplePath = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!samplePath) throw new Error("未找到示例数据 sample_points.csv。");
  return loadStationFile(samplePath);
});

ipcMain.handle("data:applyMapping", (_event, payload) => {
  const records = buildRecords(payload.rows, payload.mapping);
  if (!records.length) throw new Error("当前字段映射没有解析出有效点位。");
  return { records, region: autoRegion(records) };
});

ipcMain.handle("gmt:buildScript", (_event, payload) => {
  return buildScript(payload.records, payload.config, outputDirectoryFromPayload(payload), payload.formats || ["png", "pdf"]);
});

ipcMain.handle("gmt:saveScript", async (_event, payload) => {
  const result = await dialog.showSaveDialog({
    title: "保存 GMT 脚本",
    defaultPath: path.join(outputDirectoryFromPayload(payload), `${payload.config.outputName || "mt_point_map"}.${process.platform === "win32" ? "bat" : "gmt"}`),
    filters: [
      { name: "GMT 脚本", extensions: [process.platform === "win32" ? "bat" : "gmt"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePath) return null;
  const script = buildScript(payload.records, payload.config, path.dirname(result.filePath), ["png", "pdf"]);
  fs.writeFileSync(result.filePath, script, "utf8");
  if (process.platform !== "win32") fs.chmodSync(result.filePath, 0o755);
  return result.filePath;
});

ipcMain.handle("gmt:export", async (_event, payload) => {
  const outputDirectory = outputDirectoryFromPayload(payload);
  saveOutputDirectory(outputDirectory);
  const formats = payload.formats || ["png"];
  const needsTitleOverlay = shouldOverlayTitle(payload.config);
  const gmtFormats = needsTitleOverlay && !formats.includes("png") ? [...formats, "png"] : formats;
  const outputName = payload.config.outputName || "mt_point_map";
  const script = buildScript(payload.records, payload.config, outputDirectory, gmtFormats);
  const result = runGMT(script, outputDirectory, outputName, gmtFormats);
  if (result.ok && needsTitleOverlay) {
    await overlayNativeTitle(result, payload.config, outputName, formats);
  }
  if (result.ok) {
    result.files = formats.map((format) => path.join(outputDirectory, `${outputName}.${format}`));
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
  return {
    ...terrainEstimate(config.region, config.terrainResolution),
    ...terrainPaths(outputDirectory, config)
  };
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

ipcMain.handle("preview:imageDataUrl", (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) throw new Error(`预览图片不存在：${filePath || ""}`);
  const extension = path.extname(filePath).toLowerCase();
  const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
  const data = fs.readFileSync(filePath).toString("base64");
  return `data:${mime};base64,${data}`;
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
ipcMain.handle("gmt:recheck", () => ({
  gmtInfo: resolveGMT(),
  gmtAvailable: gmtAvailable(),
  installPlan: installPlan()
}));
ipcMain.handle("shell:openExternal", (_event, url) => shell.openExternal(url));
ipcMain.handle("shell:openPath", (_event, targetPath) => shell.openPath(targetPath));

function loadStationFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const text = decodeText(buffer);
  const parsed = parseStationText(text, filePath);
  return { ...parsed, region: autoRegion(parsed.records) };
}

function loadEdiDirectory(directory) {
  const ediFiles = findEdiFiles(directory);
  if (!ediFiles.length) throw new Error("该目录及子文件夹中没有找到 .edi 文件。");
  const records = [];
  const skipped = [];
  for (const filePath of ediFiles) {
    try {
      const text = decodeText(fs.readFileSync(filePath));
      records.push(parseEdiStationText(text, filePath));
    } catch (error) {
      skipped.push({
        filePath,
        reason: error.message || String(error)
      });
    }
  }
  if (!records.length) {
    const sample = skipped.slice(0, 5).map((item) => `${path.basename(item.filePath)}：${item.reason}`).join("\n");
    throw new Error(`扫描到 ${ediFiles.length} 个 EDI，但没有解析出有效坐标。\n${sample}`);
  }
  const parsed = buildEdiParsedResult(records, skipped, directory);
  return { ...parsed, region: autoRegion(records), totalEdiFiles: ediFiles.length };
}

function findEdiFiles(directory) {
  const files = [];
  const visit = (current) => {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && /\.edi$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }
  };
  visit(directory);
  return files.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
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

function shouldOverlayTitle(config) {
  const title = String(config?.title || "").trim();
  return title && needsNativeTextRendering(title);
}

async function overlayNativeTitle(result, config, outputName, requestedFormats) {
  const pngPath = path.join(result.outputDirectory, `${outputName}.png`);
  if (!fs.existsSync(pngPath)) throw new Error(`中文标题叠加失败：未找到 PNG 底图 ${pngPath}`);
  const rendered = await renderTitledMap(pngPath, String(config.title || "").trim());
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

async function renderTitledMap(pngPath, title) {
  const image = nativeImage.createFromPath(pngPath);
  const size = image.getSize();
  if (!size.width || !size.height) throw new Error("中文标题叠加失败：无法读取 GMT PNG 尺寸。");
  const titleHeight = Math.max(72, Math.round(size.height * 0.085));
  const titleSize = Math.max(26, Math.min(54, Math.round(size.width * 0.032)));
  const totalHeight = size.height + titleHeight;
  const imageData = fs.readFileSync(pngPath).toString("base64");
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
    img {
      display: block;
      width: ${size.width}px;
      height: ${size.height}px;
    }
  </style>
</head>
<body>
  <div class="title">${escapeHTML(title)}</div>
  <img src="data:image/png;base64,${imageData}" />
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
      Promise.resolve(document.fonts && document.fonts.ready)
        .then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
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

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeText(buffer) {
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;
  for (const encoding of ["gb18030", "gbk"]) {
    try {
      const decoded = new TextDecoder(encoding).decode(buffer);
      if (decoded && !decoded.includes("\uFFFD")) return decoded;
    } catch {
      // Fall through to latin1 as a last resort.
    }
  }
  return buffer.toString("latin1");
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
      applyMapping: (payload) => ipcRenderer.invoke("data:applyMapping", payload),
      buildScript: (payload) => ipcRenderer.invoke("gmt:buildScript", payload),
      saveScript: (payload) => ipcRenderer.invoke("gmt:saveScript", payload),
      exportMap: (payload) => ipcRenderer.invoke("gmt:export", payload),
      chooseOutputDirectory: (currentDirectory) => ipcRenderer.invoke("output:chooseDirectory", currentDirectory),
      deleteCurrentOutputs: (payload) => ipcRenderer.invoke("output:deleteCurrent", payload),
      estimateTerrain: (payload) => ipcRenderer.invoke("terrain:estimate", payload),
      prepareTerrain: (payload) => ipcRenderer.invoke("terrain:prepare", payload),
      pauseTerrain: () => ipcRenderer.invoke("terrain:pause"),
      resumeTerrain: () => ipcRenderer.invoke("terrain:resume"),
      cancelTerrain: () => ipcRenderer.invoke("terrain:cancel"),
      deleteLocalTerrain: (payload) => ipcRenderer.invoke("terrain:deleteLocal", payload),
      clearTerrainCache: () => ipcRenderer.invoke("terrain:clearCache"),
      onTerrainProgress: (handler) => ipcRenderer.on("terrain:progress", (_event, payload) => handler(payload)),
      imageDataUrl: (filePath) => ipcRenderer.invoke("preview:imageDataUrl", filePath),
      installGMT: () => ipcRenderer.invoke("gmt:install"),
      pauseGMTDownload: () => ipcRenderer.invoke("gmt:downloadPause"),
      resumeGMTDownload: () => ipcRenderer.invoke("gmt:downloadResume"),
      cancelGMTDownload: () => ipcRenderer.invoke("gmt:downloadCancel"),
      onGMTDownloadProgress: (handler) => ipcRenderer.on("gmt:downloadProgress", (_event, payload) => handler(payload)),
      onMenuOpenFile: (handler) => ipcRenderer.on("menu:openFile", handler),
      onMenuOpenEdiDirectory: (handler) => ipcRenderer.on("menu:openEdiDirectory", handler),
      onMenuLoadSample: (handler) => ipcRenderer.on("menu:loadSample", handler),
      onMenuChooseOutputDirectory: (handler) => ipcRenderer.on("menu:chooseOutputDirectory", handler),
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
  return config;
}

function deleteCurrentOutputs(outputDirectory, outputName) {
  const extensions = process.platform === "win32" ? ["png", "pdf", "bat"] : ["png", "pdf", "gmt"];
  const candidates = [
    ...extensions.map((extension) => path.join(outputDirectory, `${outputName}.${extension}`)),
    path.join(outputDirectory, "stations_points.tsv"),
    path.join(outputDirectory, "stations_labels.tsv")
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

function startTerrainTask(webContents, payload) {
  const outputDirectory = outputDirectoryFromPayload(payload);
  saveOutputDirectory(outputDirectory);
  const config = normalizeTerrainConfig(payload);
  const gmtInfo = resolveGMT();
  if (!gmtInfo.available) {
    return { ok: false, message: "未找到 GMT，无法下载或准备地形底图。", status: null };
  }
  if (currentTerrainTask && !currentTerrainTask.done) {
    return { ok: true, message: "地形底图任务正在进行。", status: currentTerrainTask.statusPayload() };
  }
  const TaskClass = terrainSource(config.terrainResolution) === "srtm" ? SrtmTerrainPrepareTask : TerrainPrepareTask;
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
  const result = spawnSync(gmtInfo.path, ["clear", "data=earth"], {
    cwd: savedOutputDirectory(),
    encoding: "utf8",
    env: gmtChildEnv(gmtInfo)
  });
  if (result.status !== 0) {
    return { ok: false, message: result.stderr || result.stdout || "GMT 地形缓存清理失败。" };
  }
  return { ok: true, message: result.stderr || result.stdout || "已清理 GMT 地形数据缓存。" };
}

function gmtChildEnv(gmtInfo) {
  const env = {
    ...process.env,
    PATH: `${gmtInfo.binDir}${path.delimiter}${process.env.PATH || ""}`,
    GMT_DATA_SERVER: process.env.GMT_DATA_SERVER || "oceania"
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
      env: gmtChildEnv(this.gmtInfo)
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

class SrtmTerrainPrepareTask {
  constructor({ gmtInfo, outputDirectory, config, webContents, onDone }) {
    this.gmtInfo = gmtInfo;
    this.outputDirectory = outputDirectory;
    this.config = config;
    this.webContents = webContents;
    this.onDone = onDone;
    this.paths = terrainPaths(outputDirectory, config);
    this.estimate = terrainEstimate(config.region, config.terrainResolution);
    this.tiles = srtmTilesForRegion(config.region, this.paths.directory);
    this.tileIndex = 0;
    this.request = null;
    this.response = null;
    this.file = null;
    this.child = null;
    this.currentStep = "starting";
    this.state = "starting";
    this.message = "准备 SRTM 高分辨率地形底图...";
    this.percent = 0;
    this.downloaded = 0;
    this.total = this.estimate.workingBytes || 0;
    this.startedAt = Date.now();
    this.done = false;
    this.cancelled = false;
    this.pausedBySignal = false;
    this.lastOutput = "";
    this.lastEmitAt = 0;
    this.currentTempPath = "";
    this.xyzPath = path.join(this.paths.directory, `srtm_points_${this.config.terrainResolution}_${this.paths.key}.xyz`);
  }

  start() {
    fs.mkdirSync(this.paths.directory, { recursive: true });
    if (fs.existsSync(this.paths.gridPath) && fs.existsSync(this.paths.shadePath)) {
      this.state = "completed";
      this.message = "SRTM 地形底图已存在，可直接绘图。";
      this.percent = 100;
      this.done = true;
      this.emit();
      this.finishSoon();
      return;
    }
    if (!this.tiles.length) {
      this.fail("当前范围超出 SRTM 常用覆盖区，无法自动下载高分辨率地形。");
      return;
    }
    if (!this.config.terrainAllowDownload) {
      const missing = this.tiles.filter((tile) => !fs.existsSync(tile.hgtPath));
      if (missing.length) {
        this.fail("当前关闭了联网下载，并且本地缺少 SRTM 高程瓦片。请允许联网下载后再准备底图。");
        return;
      }
    }
    this.downloadNextTile();
  }

  downloadNextTile() {
    if (this.cancelled || this.done) return;
    while (this.tileIndex < this.tiles.length && fs.existsSync(this.tiles[this.tileIndex].hgtPath)) {
      this.downloaded += this.tiles[this.tileIndex].estimatedGzipBytes;
      this.tileIndex += 1;
    }
    if (this.tileIndex >= this.tiles.length) {
      this.convertTiles();
      return;
    }
    const tile = this.tiles[this.tileIndex];
    this.currentStep = "download";
    this.state = "running";
    this.message = `正在下载 SRTM 高程瓦片 ${tile.name}...`;
    this.percent = Math.max(this.percent, 5 + (this.tileIndex / this.tiles.length) * 58);
    this.emit();
    this.beginTileDownload(tile, tile.url, 0);
  }

  beginTileDownload(tile, url, redirectCount) {
    if (redirectCount > 5) {
      this.fail("SRTM 下载重定向次数过多，请检查网络。");
      return;
    }
    fs.mkdirSync(path.dirname(tile.gzPath), { recursive: true });
    this.currentTempPath = `${tile.gzPath}.download`;
    fs.rmSync(this.currentTempPath, { force: true });
    let tileDownloaded = 0;
    let tileTotal = tile.estimatedGzipBytes;

    this.request = https.get(url, { headers: { "User-Agent": "MT-Point-Map-GMT" }, timeout: 30000 }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        const location = response.headers.location;
        if (!location) {
          this.fail("SRTM 下载地址重定向无效。");
          return;
        }
        this.beginTileDownload(tile, new URL(location, url).toString(), redirectCount + 1);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        this.fail(`SRTM 瓦片 ${tile.name} 下载失败：HTTP ${response.statusCode}`);
        return;
      }

      this.response = response;
      tileTotal = Number(response.headers["content-length"] || tile.estimatedGzipBytes);
      this.file = fs.createWriteStream(this.currentTempPath);
      this.message = `正在下载 SRTM 高程瓦片 ${tile.name}...`;
      this.emit();

      response.on("data", (chunk) => {
        if (this.cancelled) return;
        tileDownloaded += chunk.length;
        this.downloaded += chunk.length;
        const tileBase = 5 + (this.tileIndex / this.tiles.length) * 58;
        const tileShare = Math.min(1, tileDownloaded / Math.max(tileTotal, 1)) * (58 / this.tiles.length);
        this.percent = Math.min(63, tileBase + tileShare);
        if (!this.file.write(chunk)) {
          response.pause();
          this.file.once("drain", () => {
            if (this.state === "running" && !this.cancelled) response.resume();
          });
        }
        this.emitThrottled();
      });

      response.on("end", () => {
        if (this.cancelled) return;
        this.file.end(() => {
          try {
            fs.renameSync(this.currentTempPath, tile.gzPath);
            const gz = fs.readFileSync(tile.gzPath);
            fs.writeFileSync(tile.hgtPath, zlib.gunzipSync(gz));
            this.tileIndex += 1;
            this.response = null;
            this.request = null;
            this.file = null;
            this.downloadNextTile();
          } catch (error) {
            this.fail(`SRTM 瓦片 ${tile.name} 解压失败：${error.message || error}`);
          }
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
      this.request.destroy(new Error("SRTM 下载超时，请检查网络连接。"));
    });
    this.request.on("error", (error) => {
      if (!this.cancelled) this.fail(error.message || String(error));
    });
  }

  async convertTiles() {
    if (this.cancelled || this.done) return;
    this.currentStep = "convert";
    this.state = "running";
    this.message = "正在裁剪 SRTM 高程并生成 GMT 输入点...";
    this.percent = Math.max(this.percent, 68);
    this.emit();
    try {
      await writeSrtmXYZ(this.tiles, this.config.region, terrainResolutionSeconds(this.config.terrainResolution), this.xyzPath);
      this.runXYZToGrid();
    } catch (error) {
      this.fail(error.message || String(error));
    }
  }

  runXYZToGrid() {
    this.runGMTStep({
      step: "xyz2grd",
      args: ["xyz2grd", this.xyzPath, `-R${this.config.region}`, `-I${terrainResolutionSeconds(this.config.terrainResolution)}s`, `-G${this.paths.gridPath}`, "-V"],
      message: "正在生成 GMT 地形网格...",
      basePercent: 76,
      next: () => this.runGradient()
    });
  }

  runGradient() {
    this.runGMTStep({
      step: "gradient",
      args: ["grdgradient", this.paths.gridPath, "-A315", `-Ne${terrainIntensity(this.config.terrainIntensity)}`, `-G${this.paths.shadePath}`],
      message: "正在生成地形阴影...",
      basePercent: 90,
      next: () => this.complete()
    });
  }

  runGMTStep({ step, args, message, basePercent, next }) {
    this.currentStep = step;
    this.state = "running";
    this.message = message;
    this.percent = Math.max(this.percent, basePercent);
    this.pausedBySignal = false;
    this.emit();
    this.child = spawn(this.gmtInfo.path, args, {
      cwd: this.outputDirectory,
      encoding: "utf8",
      env: gmtChildEnv(this.gmtInfo)
    });
    const onData = (chunk) => {
      this.lastOutput = String(chunk).trim() || this.lastOutput;
      this.message = this.lastOutput || message;
      if (step === "xyz2grd") this.percent = Math.min(88, this.percent + 2.5);
      if (step === "gradient") this.percent = Math.min(98, this.percent + 3);
      this.emitThrottled();
    };
    this.child.stdout.on("data", onData);
    this.child.stderr.on("data", onData);
    this.child.on("error", (error) => {
      if (!this.done) this.fail(error.message || String(error));
    });
    this.child.on("close", (code, signal) => {
      this.child = null;
      if (this.cancelled || this.done) return;
      if (code === 0) {
        if (step === "xyz2grd" && !fs.existsSync(this.paths.gridPath)) {
          this.fail("GMT 没有生成 SRTM 地形网格文件。");
          return;
        }
        if (step === "gradient" && !fs.existsSync(this.paths.shadePath)) {
          this.fail("GMT 没有生成 SRTM 地形阴影文件。");
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
    if (this.response && this.currentStep === "download") {
      this.response.pause();
      this.state = "paused";
      this.message = "SRTM 下载已暂停。";
      this.emit();
      return;
    }
    if (this.child && process.platform !== "win32") {
      this.child.kill("SIGSTOP");
      this.state = "paused";
      this.pausedBySignal = true;
      this.message = "SRTM 地形处理已暂停。";
      this.emit();
    }
  }

  resume() {
    if (this.done || this.state !== "paused") return;
    if (this.response && this.currentStep === "download") {
      this.state = "running";
      this.message = "继续下载 SRTM 高程瓦片...";
      this.response.resume();
      this.emit();
      return;
    }
    if (this.child && this.pausedBySignal && process.platform !== "win32") {
      this.child.kill("SIGCONT");
      this.state = "running";
      this.pausedBySignal = false;
      this.message = "继续处理 SRTM 地形底图...";
      this.emit();
    }
  }

  cancel() {
    if (this.done) return;
    this.cancelled = true;
    this.done = true;
    this.state = "cancelled";
    this.message = "SRTM 地形底图任务已取消。";
    if (this.request) this.request.destroy();
    if (this.response) this.response.destroy();
    if (this.file) this.file.destroy();
    if (this.child) this.child.kill();
    fs.rmSync(this.currentTempPath, { force: true });
    fs.rmSync(this.xyzPath, { force: true });
    fs.rmSync(this.paths.gridPath, { force: true });
    fs.rmSync(this.paths.shadePath, { force: true });
    this.emit();
    this.finishSoon();
  }

  complete() {
    this.state = "completed";
    this.message = "SRTM 高分辨率地形底图准备完成。";
    this.percent = 100;
    this.done = true;
    this.emit();
    this.finishSoon();
  }

  fail(message) {
    if (this.done) return;
    this.state = "failed";
    this.message = `SRTM 地形底图准备失败：${message}`;
    this.done = true;
    if (this.file) this.file.destroy();
    fs.rmSync(this.currentTempPath, { force: true });
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

function srtmTilesForRegion(regionText, cacheRoot) {
  const values = String(regionText || "").split("/").map((value) => Number(value));
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return [];
  const [west, east, south, north] = values;
  if (south < -56 || north > 60) return [];
  const westTile = Math.floor(west);
  const eastTile = Math.floor(east - Number.EPSILON);
  const southTile = Math.floor(south);
  const northTile = Math.floor(north - Number.EPSILON);
  const tiles = [];
  for (let lat = southTile; lat <= northTile; lat += 1) {
    for (let lon = westTile; lon <= eastTile; lon += 1) {
      const name = srtmTileName(lat, lon);
      const latBand = name.slice(0, 3);
      const directory = path.join(cacheRoot, "srtm_hgt", latBand);
      tiles.push({
        name,
        lat,
        lon,
        url: `https://s3.amazonaws.com/elevation-tiles-prod/skadi/${latBand}/${name}.hgt.gz`,
        gzPath: path.join(directory, `${name}.hgt.gz`),
        hgtPath: path.join(directory, `${name}.hgt`),
        estimatedGzipBytes: 8 * 1024 * 1024
      });
    }
  }
  return tiles;
}

function srtmTileName(lat, lon) {
  const latPrefix = lat >= 0 ? "N" : "S";
  const lonPrefix = lon >= 0 ? "E" : "W";
  return `${latPrefix}${String(Math.abs(lat)).padStart(2, "0")}${lonPrefix}${String(Math.abs(lon)).padStart(3, "0")}`;
}

async function writeSrtmXYZ(tiles, regionText, seconds, outputPath) {
  const values = String(regionText || "").split("/").map((value) => Number(value));
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) throw new Error("地形范围无效，无法裁剪 SRTM。");
  const [west, east, south, north] = values;
  const margin = Math.max(seconds / 3600, 1 / 3600);
  const stride = Math.max(1, Math.round(seconds));
  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(outputPath);
    stream.on("error", reject);
    stream.on("finish", resolve);
    let points = 0;
    try {
      for (const tile of tiles) {
        const buffer = fs.readFileSync(tile.hgtPath);
        const dimension = Math.sqrt(buffer.length / 2);
        if (!Number.isInteger(dimension)) throw new Error(`SRTM 瓦片 ${tile.name} 尺寸异常。`);
        const tileWest = tile.lon;
        const tileNorth = tile.lat + 1;
        for (let row = 0; row < dimension; row += stride) {
          const lat = tileNorth - row / 3600;
          if (lat < south - margin || lat > north + margin) continue;
          for (let col = 0; col < dimension; col += stride) {
            const lon = tileWest + col / 3600;
            if (lon < west - margin || lon > east + margin) continue;
            const elevation = buffer.readInt16BE((row * dimension + col) * 2);
            if (elevation <= -32768) continue;
            stream.write(`${lon.toFixed(8)}\t${lat.toFixed(8)}\t${elevation}\n`);
            points += 1;
          }
        }
      }
      if (!points) throw new Error("SRTM 裁剪后没有得到有效高程点。");
      stream.end();
    } catch (error) {
      stream.destroy();
      reject(error);
    }
  });
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
