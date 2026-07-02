const fs = require("fs");
const https = require("https");
const path = require("path");
const zlib = require("zlib");
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
    this.estimate = terrainEstimate(this.config.region, this.config.terrainResolution);
    this.tiles = srtmTilesForRegion(this.config.region, this.paths.directory);
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
    this.paused = false;
    this.pausedBySignal = false;
    this.pauseWaiter = null;
    this.lastOutput = "";
    this.lastEmitAt = 0;
    this.currentTempPath = "";
    this.xyzPath = path.join(this.paths.directory, `srtm_points_${this.config.terrainResolution}_${this.paths.key}.xyz`);
  }

  start() {
    fs.mkdirSync(this.paths.directory, { recursive: true });
    if (fs.existsSync(this.paths.gridPath) && fs.existsSync(this.paths.shadePath)) {
      this.complete("SRTM 地形底图已存在，可直接绘图。");
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
    this.message = "正在裁剪 SRTM 高程并流式生成 GMT 输入点...";
    this.percent = Math.max(this.percent, 68);
    this.emit();
    try {
      await writeSrtmXYZ(this.tiles, this.config.region, terrainResolutionSeconds(this.config.terrainResolution), this.xyzPath, {
        shouldCancel: () => this.cancelled,
        waitIfPaused: () => this.waitIfPaused(),
        onProgress: ({ tileIndex, totalTiles, points }) => {
          this.message = `正在裁剪 SRTM 高程并流式生成 GMT 输入点... 已写入 ${formatCount(points)} 点`;
          this.percent = Math.max(this.percent, Math.min(75, 68 + (tileIndex / Math.max(totalTiles, 1)) * 7));
          this.emitThrottled();
        }
      });
      this.runXYZToGrid();
    } catch (error) {
      if (!this.cancelled) this.fail(error.message || String(error));
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
    if (this.currentStep === "convert") {
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
    if (this.response && this.currentStep === "download") {
      this.state = "running";
      this.message = "继续下载 SRTM 高程瓦片...";
      this.response.resume();
      this.emit();
      return;
    }
    if (this.currentStep === "convert") {
      this.paused = false;
      this.state = "running";
      this.message = "继续裁剪 SRTM 高程...";
      if (this.pauseWaiter) {
        this.pauseWaiter();
        this.pauseWaiter = null;
      }
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
    if (this.pauseWaiter) {
      this.pauseWaiter();
      this.pauseWaiter = null;
    }
    if (this.request) this.request.destroy();
    if (this.response) this.response.destroy();
    if (this.file) this.file.destroy();
    if (this.child) this.child.kill();
    fs.rmSync(this.currentTempPath, { force: true });
    fs.rmSync(this.xyzPath, { force: true });
    fs.rmSync(this.paths.gridPath, { force: true });
    fs.rmSync(this.paths.shadePath, { force: true });
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
    if (this.file) this.file.destroy();
    fs.rmSync(this.currentTempPath, { force: true });
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

  async waitIfPaused() {
    while (this.paused && !this.cancelled) {
      await new Promise((resolve) => {
        this.pauseWaiter = resolve;
      });
    }
  }
}

async function writeSrtmXYZ(tiles, regionText, seconds, outputPath, hooks = {}) {
  const values = String(regionText || "").split("/").map((value) => Number(value));
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) throw new Error("地形范围无效，无法裁剪 SRTM。");
  const [west, east, south, north] = values;
  const margin = Math.max(seconds / 3600, 1 / 3600);
  const stride = Math.max(1, Math.round(seconds));
  const stream = fs.createWriteStream(outputPath, { highWaterMark: 1024 * 1024 });
  let streamError = null;
  let pending = "";
  let points = 0;
  stream.on("error", (error) => {
    streamError = error;
  });

  const flush = async () => {
    if (!pending) return;
    const chunk = pending;
    pending = "";
    if (!stream.write(chunk)) await once(stream, "drain");
    if (streamError) throw streamError;
  };

  try {
    for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
      if (hooks.shouldCancel?.()) throw new Error("SRTM 裁剪已取消。");
      await hooks.waitIfPaused?.();
      const tile = tiles[tileIndex];
      const buffer = fs.readFileSync(tile.hgtPath);
      const dimension = Math.sqrt(buffer.length / 2);
      if (!Number.isInteger(dimension)) throw new Error(`SRTM 瓦片 ${tile.name} 尺寸异常。`);
      const tileWest = tile.lon;
      const tileNorth = tile.lat + 1;
      for (let row = 0; row < dimension; row += stride) {
        if (hooks.shouldCancel?.()) throw new Error("SRTM 裁剪已取消。");
        if (row % Math.max(stride * 128, 128) === 0) {
          await hooks.waitIfPaused?.();
          await waitTurn();
        }
        const lat = tileNorth - row / 3600;
        if (lat < south - margin || lat > north + margin) continue;
        for (let col = 0; col < dimension; col += stride) {
          const lon = tileWest + col / 3600;
          if (lon < west - margin || lon > east + margin) continue;
          const elevation = buffer.readInt16BE((row * dimension + col) * 2);
          if (elevation <= -32768) continue;
          pending += `${lon.toFixed(8)}\t${lat.toFixed(8)}\t${elevation}\n`;
          points += 1;
          if (pending.length >= 1024 * 1024) await flush();
        }
      }
      hooks.onProgress?.({ tileIndex: tileIndex + 1, totalTiles: tiles.length, points });
    }
    await flush();
    if (!points) throw new Error("SRTM 裁剪后没有得到有效高程点。");
    stream.end();
    await once(stream, "finish");
    if (streamError) throw streamError;
  } catch (error) {
    stream.destroy();
    throw error;
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

function gmtChildEnv(gmtInfo, config = {}) {
  const env = {
    ...process.env,
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
