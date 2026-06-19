const fs = require("fs");
const https = require("https");
const path = require("path");
const { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } = require("electron");
const { parseStationText, buildRecords } = require("./parser");
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
  saveScript
} = require("./gmt");

const APP_TITLE = "MT点位图制作工具—GMT";
let currentInstallerDownload = null;

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
  gmtInfo: resolveGMT(),
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

ipcMain.handle("gmt:export", async (_event, payload) => {
  const outputDirectory = defaultOutputDirectory(app);
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
      loadSample: () => ipcRenderer.invoke("file:sample"),
      applyMapping: (payload) => ipcRenderer.invoke("data:applyMapping", payload),
      buildScript: (payload) => ipcRenderer.invoke("gmt:buildScript", payload),
      saveScript: (payload) => ipcRenderer.invoke("gmt:saveScript", payload),
      exportMap: (payload) => ipcRenderer.invoke("gmt:export", payload),
      imageDataUrl: (filePath) => ipcRenderer.invoke("preview:imageDataUrl", filePath),
      installGMT: () => ipcRenderer.invoke("gmt:install"),
      pauseGMTDownload: () => ipcRenderer.invoke("gmt:downloadPause"),
      resumeGMTDownload: () => ipcRenderer.invoke("gmt:downloadResume"),
      cancelGMTDownload: () => ipcRenderer.invoke("gmt:downloadCancel"),
      onGMTDownloadProgress: (handler) => ipcRenderer.on("gmt:downloadProgress", (_event, payload) => handler(payload)),
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
