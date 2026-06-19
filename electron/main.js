const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { parseStationText, buildRecords } = require("./parser");
const {
  autoRegion,
  buildScript,
  defaultOutputDirectory,
  gmtAvailable,
  installPlan,
  runGMT,
  saveScript,
  startGMTInstall
} = require("./gmt");

const APP_TITLE = "MT点位图制作工具—GMT";

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
  loadRenderer(win);
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
  gmtAvailable: gmtAvailable(),
  installPlan: installPlan(),
  outputDirectory: defaultOutputDirectory(app),
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
  return buildScript(payload.records, payload.config, defaultOutputDirectory(app), payload.formats || ["png", "pdf"]);
});

ipcMain.handle("gmt:saveScript", async (_event, payload) => {
  const result = await dialog.showSaveDialog({
    title: "保存 GMT 脚本",
    defaultPath: `${payload.config.outputName || "mt_point_map"}.${process.platform === "win32" ? "bat" : "gmt"}`,
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

ipcMain.handle("gmt:export", (_event, payload) => {
  const outputDirectory = defaultOutputDirectory(app);
  const formats = payload.formats || ["png"];
  const script = buildScript(payload.records, payload.config, outputDirectory, formats);
  return runGMT(script, outputDirectory, payload.config.outputName || "mt_point_map", formats);
});

ipcMain.handle("gmt:install", () => startGMTInstall(app.getPath("downloads")));
ipcMain.handle("gmt:recheck", () => ({ gmtAvailable: gmtAvailable(), installPlan: installPlan() }));
ipcMain.handle("shell:openExternal", (_event, url) => shell.openExternal(url));
ipcMain.handle("shell:openPath", (_event, targetPath) => shell.openPath(targetPath));

function loadStationFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const text = decodeText(buffer);
  const parsed = parseStationText(text, filePath);
  return { ...parsed, region: autoRegion(parsed.records) };
}

function decodeText(buffer) {
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;
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
      loadSample: () => ipcRenderer.invoke("file:sample"),
      applyMapping: (payload) => ipcRenderer.invoke("data:applyMapping", payload),
      buildScript: (payload) => ipcRenderer.invoke("gmt:buildScript", payload),
      saveScript: (payload) => ipcRenderer.invoke("gmt:saveScript", payload),
      exportMap: (payload) => ipcRenderer.invoke("gmt:export", payload),
      installGMT: () => ipcRenderer.invoke("gmt:install"),
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
