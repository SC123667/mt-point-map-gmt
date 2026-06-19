const fs = require("fs");
const https = require("https");
const path = require("path");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { parseStationText, buildRecords } = require("./parser");
const {
  autoRegion,
  buildScript,
  defaultOutputDirectory,
  gmtAvailable,
  installPlan,
  openDownloadedInstaller,
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
  if (gmtAvailable()) {
    return { ok: false, message: "GMT 已安装，无需下载。", status: null };
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
