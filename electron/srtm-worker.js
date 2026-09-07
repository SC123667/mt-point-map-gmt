const os = require("os");
const { initializeArea, gmtCacheEnv } = require("./terrain-cache");
const { gridLayout, writeSrtmRaster } = require("./srtm-grid");
const fs = require("fs");
const https = require("https");
const path = require("path");
const zlib = require("zlib");
const { srtmSource, srtmTilesForRegion } = require("./srtm-source");
const { decodeSrtmJp2 } = require("./srtm-jp2");
const { once } = require("events");
const { setImmediate: waitTurn } = require("timers/promises");
const { spawn } = require("child_process");
const {
  terrainDataServer,
  terrainEstimate,
  terrainIntensity,
  terrainPaths,
  terrainResolutionSeconds
} = require("./gmt");

let task = null;

process.on("message", (message) => {
  if (!message || typeof message !== "object") return;
  if (message.type === "start") {
    task = new SrtmWorkerTask(message.payload || {});
    task.start();
  } else if (message.type === "pause") {
    task?.pause();
  } else if (message.type === "resume") {
    task?.resume();
  } else if (message.type === "cancel") {
    task?.cancel();
  }
});

process.on("disconnect", () => {
  task?.cancel({ silent: true });
});

process.on("uncaughtException", (error) => {
  if (task && !task.done) {
    task.fail(error.message || String(error));
  } else {
    sendStatus({ state: "failed", message: `SRTM 地形底图准备失败：${error.message || String(error)}` });
  }
});

process.on("unhandledRejection", (error) => {
  if (task && !task.done) {
    task.fail(error?.message || String(error));
  } else {
    sendStatus({ state: "failed", message: `SRTM 地形底图准备失败：${error?.message || String(error)}` });
  }
});

class SrtmWorkerTask {
  constructor({ gmtInfo, outputDirectory, config }) {
    this.gmtInfo = gmtInfo || {};
    this.outputDirectory = outputDirectory || process.cwd();
    this.config = config || {};
    this.paths = terrainPaths(this.outputDirectory, this.config);
    this.config.terrainCacheDirectory = this.paths.root;
    this.estimate = terrainEstimate(this.config.region, this.config.terrainResolution);
    this.source = srtmSource(this.config);
    this.tiles = srtmTilesForRegion(gridLayout(this.config.region, terrainResolutionSeconds(this.config.terrainResolution)).region, this.paths.root, this.source);
    this.tileIndex = 0;
    this.transfers = new Set();
    this.finishedTiles = 0;
    this.downloadFractions = new Map();
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
    this.paused = false;
    this.pausedBySignal = false;
    this.pauseWaiters = [];
    this.lastOutput = "";
    this.lastEmitAt = 0;
    this.currentTempPath = "";
    this.hgtTempPath = "";
    this.xyzPath = this.paths.gridPath.replace(/\.nc$/, "_高程.int16");
    this.gridTempPath = this.paths.gridPath.replace(/\.nc$/, "_处理中.nc");
    this.shadeTempPath = this.paths.shadePath.replace(/\.nc$/, "_处理中.nc");
    this.layout = gridLayout(this.config.region, terrainResolutionSeconds(this.config.terrainResolution));
  }

  start() {
    initializeArea(this.paths, this.config);
    if (fs.existsSync(this.paths.gridPath) && fs.existsSync(this.paths.shadePath)) {
      this.complete("SRTM 地形底图已存在，可直接绘图。");
      return;
    }
    if (fs.existsSync(this.paths.gridPath)) { this.runGradient(); return; }
    if (!this.tiles.length) {
      this.fail("当前范围超出 SRTM 常用覆盖区，无法自动下载高分辨率地形。");
      return;
    }
    if (!this.config.terrainAllowDownload) {
      const missing = this.tiles.filter((tile) => !fs.existsSync(tile.hgtPath) && !fs.existsSync(tile.downloadPath));
      if (missing.length) {
        this.fail("当前关闭了联网下载，并且本地缺少 SRTM 高程瓦片。请允许联网下载后再准备底图。");
        return;
      }
    }
    this.downloadNextTile().catch((error) => this.fail(error.message || String(error)));
  }

  async downloadNextTile() {
    let cursor = 0;
    const consume = async () => {
      while (cursor < this.tiles.length) {
        if (this.cancelled || this.done) return;
        await this.waitIfPaused();
        if (this.cancelled || this.done) return;
        const index = cursor++;
        if (index >= this.tiles.length) return;
        const tile = this.tiles[index];
        await this.prepareTile(tile);
        this.finishedTiles += 1;
        this.downloadFractions.delete(tile.name);
      }
    };
    await Promise.all(Array.from({length: Math.min(3, this.tiles.length)}, consume));
    if (!this.cancelled && !this.done) await this.convertTiles();
  }

  async prepareTile(tile) {
    if (fs.existsSync(tile.hgtPath)) return;
    this.currentStep = "download";
    this.state = "running";
    this.message = `正在从 ${tile.sourceLabel} 下载 ${tile.name}（最多 3 块并行）...`;
    this.emit();
    if (!fs.existsSync(tile.downloadPath)) {
      if (!this.config.terrainAllowDownload) throw new Error("已关闭联网下载，本地缺少 SRTM 瓦片。");
      await this.downloadTile(tile, tile.url);
    }
    await this.waitIfPaused();
    if (this.cancelled || this.done) return;
    this.currentStep = "decode";
    this.message = `正在解码 ${tile.sourceLabel} 高程瓦片 ${tile.name}...`;
    this.emit();
    await waitTurn();
    await this.waitIfPaused();
    if (this.cancelled || this.done) return;
    const temp = `${tile.hgtPath}.decode`;
    try {
      const compressed = fs.readFileSync(tile.downloadPath);
      const hgt = tile.format === "jp2" ? await decodeSrtmJp2(compressed) : zlib.gunzipSync(compressed, { maxOutputLength: 3601 * 3601 * 2 });
      if (hgt.length !== 3601 * 3601 * 2) throw new Error("不是 3601×3601 的 1 秒高程瓦片。");
      await waitTurn();
      await this.waitIfPaused();
      if (this.cancelled || this.done) return;
      fs.writeFileSync(temp, hgt);
      fs.renameSync(temp, tile.hgtPath);
    } catch (error) {
      fs.rmSync(temp, { force: true });
      fs.rmSync(tile.downloadPath, { force: true });
      throw new Error(`${tile.sourceLabel} 瓦片 ${tile.name} 解码失败：${error.message || error}。可重试或切换下载源。`);
    }
  }

  downloadTile(tile, url, redirectCount = 0) {
    const transfer = {};
    this.transfers.add(transfer);
    return new Promise((resolve, reject) => {
      if (this.cancelled || this.done) return reject(new Error("下载已取消。"));
      if (redirectCount > 5 || new URL(url).protocol !== "https:") return reject(new Error("SRTM 下载重定向无效。"));
      fs.mkdirSync(path.dirname(tile.downloadPath), { recursive: true });
      transfer.currentTempPath = `${tile.downloadPath}.download`;
      const maxBytes = 64 * 1024 * 1024;
      let tileDownloaded = 0;
      const request = https.get(url, { headers: { "User-Agent": "MT-Point-Map-GMT" }, timeout: this.paused ? 0 : 30000 }, (response) => {
        if (this.cancelled || this.done) { response.destroy(); reject(new Error("下载已取消。")); return; }
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          response.resume();
          try {
            if (!response.headers.location) throw new Error("SRTM 下载重定向缺少地址。");
            resolve(this.downloadTile(tile, new URL(response.headers.location, url).toString(), redirectCount + 1));
          } catch (error) { reject(error); }
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`${tile.sourceLabel} 瓦片 ${tile.name} 下载失败：HTTP ${response.statusCode}。可重试或切换下载源。`));
          return;
        }
        transfer.response = response;
        const contentLength = Number(response.headers["content-length"] || 0);
        if (contentLength > maxBytes) { response.destroy(); reject(new Error("SRTM 瓦片文件过大。")); return; }
        const tileTotal = contentLength || tile.estimatedGzipBytes;
        const file = fs.createWriteStream(transfer.currentTempPath);
        transfer.file = file;
        response.on("data", (chunk) => {
          tileDownloaded += chunk.length;
          this.downloaded += chunk.length;
          if (tileDownloaded > maxBytes) { response.destroy(new Error("SRTM 瓦片文件过大。")); return; }
          this.downloadFractions.set(tile.name, Math.min(1, tileDownloaded / Math.max(tileTotal, 1)));
          const total = this.finishedTiles + [...this.downloadFractions.values()].reduce((a,b)=>a+b,0);
          this.percent = Math.max(this.percent, Math.min(63, 5 + total/this.tiles.length*58));
          if (!file.write(chunk)) {
            response.pause();
            file.once("drain", () => {
              if (!this.paused && !this.done && !this.cancelled) response.resume();
            });
          }
          this.emitThrottled();
        });
        response.on("error", reject);
        response.on("aborted", () => reject(new Error("SRTM 瓦片下载连接中断。")));
        response.on("close", () => {
          if (!response.readableEnded) reject(new Error("SRTM 瓦片下载不完整。"));
        });
        response.on("end", () => file.end());
        file.on("error", reject);
        file.on("finish", () => {
          transfer.response = null;
          transfer.file = null;
          transfer.request = null;
          if (this.cancelled || this.done) { reject(new Error("下载已取消。")); return; }
          if (!tileDownloaded || (contentLength && tileDownloaded !== contentLength)) { reject(new Error("SRTM 瓦片下载不完整。")); return; }
          try {
            fs.renameSync(transfer.currentTempPath, tile.downloadPath);
            transfer.currentTempPath = "";
            resolve();
          } catch (error) { reject(error); }
        });
        if (this.paused) response.pause();
      });
      transfer.request = request;
      request.on("timeout", () => { if (!this.paused) request.destroy(new Error("SRTM 下载超时，请重试或切换下载源。")); });
      request.on("error", reject);
    }).finally(() => {
      transfer.request?.destroy(); transfer.response?.destroy(); transfer.file?.destroy();
      if (transfer.currentTempPath) fs.rmSync(transfer.currentTempPath, { force:true });
      this.transfers.delete(transfer);
    });
  }

  async convertTiles() {
    if (this.cancelled || this.done) return;
    this.currentStep = "convert";
    this.state = "running";
    this.message = "正在直接拼接二进制高程网格...";
    this.percent = Math.max(this.percent, 68);
    this.emit();
    try {
      await writeSrtmRaster(this.tiles, this.config.region, terrainResolutionSeconds(this.config.terrainResolution), this.xyzPath, {
        shouldCancel: () => this.cancelled,
        waitIfPaused: () => this.waitIfPaused(),
        onProgress: ({row,totalRows}) => {
          this.message = `正在直接拼接二进制高程网格... ${row}/${totalRows} 行`;
          this.percent = Math.max(this.percent, Math.min(75, 68 + row/totalRows*7));
          this.emitThrottled();
        }
      });
      await this.waitIfPaused();
      if (!this.done && !this.cancelled) this.runXYZToGrid();
    } catch (error) {
      if (!this.cancelled) this.fail(error.message || String(error));
    }
  }

  runXYZToGrid() {
    this.runGMTStep({
      step: "xyz2grd",
      args: ["xyz2grd", this.xyzPath, `-R${this.layout.region}`, `-I${terrainResolutionSeconds(this.config.terrainResolution)}s`, `-G${this.gridTempPath}`, os.endianness() === "LE" ? "-ZTLhw" : "-ZTLh", "-di-32768", "-V"],
      message: "正在生成 GMT 地形网格...",
      basePercent: 76,
      next: () => { fs.rmSync(this.xyzPath, { force: true }); this.runGradient(); }
    });
  }

  runGradient() {
    this.runGMTStep({
      step: "gradient",
      args: ["grdgradient", this.paths.gridPath, "-A315", `-Ne${terrainIntensity(this.config.terrainIntensity)}`, `-G${this.shadeTempPath}`],
      message: "正在生成地形阴影...",
      basePercent: 90,
      next: () => this.complete("SRTM 高分辨率地形底图准备完成。")
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
      env: gmtChildEnv(this.gmtInfo, this.config)
    });
    const onData = (chunk) => {
      this.lastOutput = tailText(`${this.lastOutput}\n${String(chunk).trim()}`, 4000);
      this.message = tailText(String(chunk).trim(), 500) || message;
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
        if (step === "xyz2grd" && !fs.existsSync(this.gridTempPath)) {
          this.fail("GMT 没有生成 SRTM 地形网格文件。");
          return;
        }
        if (step === "gradient" && !fs.existsSync(this.shadeTempPath)) {
          this.fail("GMT 没有生成 SRTM 地形阴影文件。");
          return;
        }
        if (step === "xyz2grd") fs.renameSync(this.gridTempPath, this.paths.gridPath);
        if (step === "gradient") fs.renameSync(this.shadeTempPath, this.paths.shadePath);
        next();
      } else {
        this.fail(this.lastOutput || `GMT ${step} 执行失败：${signal || code}`);
      }
    });
  }

  pause() {
    if (this.done || this.state !== "running") return;
    if (this.transfers.size || this.currentStep === "download") {
      this.paused = true;
      for (const transfer of this.transfers) { transfer.request?.setTimeout(0); transfer.response?.pause(); }
      this.state = "paused";
      this.message = "SRTM 下载已暂停。";
      this.emit();
      return;
    }
    if (["convert", "decode"].includes(this.currentStep)) {
      this.paused = true;
      this.state = "paused";
      this.message = "SRTM 裁剪已暂停。";
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
    if (this.transfers.size || this.currentStep === "download") {
      this.paused = false;
      this.releasePause();
      for (const transfer of this.transfers) { transfer.request?.setTimeout(30000); transfer.response?.resume(); }
      this.state = "running";
      this.message = `继续从 ${this.source.toUpperCase()} 下载 SRTM 高程瓦片...`;
      this.response?.resume();
      this.emit();
      return;
    }
    if (["convert", "decode"].includes(this.currentStep)) {
      this.paused = false;
      this.state = "running";
      this.message = "继续裁剪 SRTM 高程...";
      this.releasePause();
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

  cancel(options = {}) {
    if (this.done) return;
    this.cancelled = true;
    this.done = true;
    this.state = "cancelled";
    this.message = "SRTM 地形底图任务已取消。";
    this.releasePause();
    for (const transfer of this.transfers) { transfer.request?.destroy(); transfer.response?.destroy(); transfer.file?.destroy(); if(transfer.currentTempPath)fs.rmSync(transfer.currentTempPath,{force:true}); }
    if (this.request) this.request.destroy();
    if (this.response) this.response.destroy();
    if (this.file) this.file.destroy();
    if (this.child) {
      if (this.pausedBySignal && process.platform !== "win32") this.child.kill("SIGCONT");
      this.child.kill();
    }
    if (this.currentTempPath) fs.rmSync(this.currentTempPath, { force: true });
    if (this.hgtTempPath) fs.rmSync(this.hgtTempPath, { force: true });
    fs.rmSync(this.xyzPath, { force: true });
    fs.rmSync(this.gridTempPath, { force: true });
    fs.rmSync(this.shadeTempPath, { force: true });
    if (!options.silent) this.emit();
    setTimeout(() => process.exit(0), 50);
  }

  complete(message) {
    this.state = "completed";
    this.message = message;
    this.percent = 100;
    this.done = true;
    this.emit();
    setTimeout(() => process.exit(0), 50);
  }

  fail(message) {
    if (this.done) return;
    this.state = "failed";
    this.message = `SRTM 地形底图准备失败：${message}`;
    this.done = true;
    this.releasePause();
    for (const transfer of this.transfers) { transfer.request?.destroy(); transfer.response?.destroy(); transfer.file?.destroy(); if(transfer.currentTempPath)fs.rmSync(transfer.currentTempPath,{force:true}); }
    if (this.request) this.request.destroy();
    if (this.response) this.response.destroy();
    if (this.child) {
      if (this.pausedBySignal && process.platform !== "win32") this.child.kill("SIGCONT");
      this.child.kill();
    }
    if (this.file) this.file.destroy();
    if (this.currentTempPath) fs.rmSync(this.currentTempPath, { force: true });
    if (this.hgtTempPath) fs.rmSync(this.hgtTempPath, { force: true });
    fs.rmSync(this.xyzPath, { force: true });
    fs.rmSync(this.gridTempPath, { force: true });
    fs.rmSync(this.shadeTempPath, { force: true });
    this.emit();
    setTimeout(() => process.exit(1), 50);
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
      source: this.source,
      resolution: this.config.terrainResolution,
      region: this.config.region
    };
  }

  emit() {
    this.lastEmitAt = Date.now();
    sendStatus(this.statusPayload());
  }

  emitThrottled() {
    if (Date.now() - this.lastEmitAt < 250) return;
    this.emit();
  }

  releasePause() { for (const resolve of this.pauseWaiters.splice(0)) resolve(); }

  async waitIfPaused() {
    while (this.paused && !this.cancelled && !this.done) {
      await new Promise((resolve) => {
        this.pauseWaiters.push(resolve);
      });
    }
  }
}

function gmtChildEnv(gmtInfo, config = {}) {
  const env = {
    ...process.env,
    ...gmtCacheEnv(process.cwd(), config),
    PATH: `${gmtInfo.binDir}${path.delimiter}${process.env.PATH || ""}`,
    GMT_DATA_SERVER: terrainDataServer(config.terrainDataServer || process.env.GMT_DATA_SERVER)
  };
  if (gmtInfo.gsLib) env.GS_LIB = gmtInfo.gsLib;
  return env;
}

function sendStatus(status) {
  if (process.send) process.send({ type: "status", status });
}

function formatCount(value) {
  const count = Math.max(0, Number(value) || 0);
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(Math.round(count));
}

function tailText(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? text.slice(text.length - maxLength) : text;
}
