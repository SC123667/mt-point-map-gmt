const { gmtCacheEnv } = require("./terrain-cache");
const { buildLegendEntries } = require("./legend");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const {
  DEFAULT_LEGEND_FILE,
  DEFAULT_OVERLAY_FILE,
  buildScript,
  needsNativeTextRendering,
  resolveGMT,
  saveScript
} = require("./gmt");

let currentChild = null;
let cancelled = false;

process.on("message", async (message) => {
  if (!message) return;
  if (message.type === "cancel") {
    cancelled = true;
    stopCurrentChild();
    return;
  }
  if (message.type !== "start") return;
  try {
    const result = await handleTask(message.payload || {});
    await send({ type: "result", result });
    setImmediate(() => process.exit(0));
  } catch (error) {
    await send({ type: "error", message: error.message || String(error), stack: error.stack || "" });
    setImmediate(() => process.exit(1));
  }
});

process.on("disconnect", () => {
  cancelled = true;
  stopCurrentChild();
  process.exit(0);
});

function send(payload) {
  return new Promise((resolve, reject) => {
    if (!process.connected) return resolve();
    process.send(payload, (error) => error ? reject(error) : resolve());
  });
}

async function handleTask(payload) {
  if (payload.mode === "composeVectorPDF") {
    const { composeVectorPDF } = require("./vector-pdf");
    return composeVectorPDF(payload.baseBytes, payload.overlayBytes, payload.imageSize, payload.titleHeight);
  }
  if (payload.mode === "saveScript") return saveGMTScript(payload);
  return exportGMTMap(payload);
}

async function exportGMTMap(payload) {
  const outputDirectory = payload.outputDirectory;
  const formats = payload.formats || ["png"];
  const outputName = payload.config?.outputName || "mt_point_map";
  const includesVector = formats.some(isVectorFormat);
  const nativeTitle = shouldOverlayTitle(payload.config);
  const nativeLegend = shouldOverlayLegend(payload.config);
  const nativeCartesianElements = Boolean(payload.config?.swapAxes && (payload.config?.showScale || payload.config?.showNorthArrow));
  const needsNativeDecorations = formats.some((format) => ["png", "pdf"].includes(String(format).toLowerCase())) && (nativeTitle || nativeLegend || nativeCartesianElements);
  const gmtFormats = needsNativeDecorations && !formats.includes("png") ? [...formats, "png"] : formats;
  sendProgress("workspace", 8, "正在准备 GMT 工作区...");
  const gmtWorkspace = await createGMTWorkspace(outputDirectory, payload.config, payload.cacheDirectory);
  const config = {
    ...gmtWorkspace.config,
    legend: nativeLegend ? { ...(gmtWorkspace.config.legend || {}), show: false } : gmtWorkspace.config.legend,
    forceGMTTitle: includesVector && nativeTitle && !needsNativeDecorations
  };
  sendProgress("script", 22, `正在生成 GMT 脚本和 ${payload.records?.length || 0} 个测点数据文件...`);
  const script = buildScript(payload.records || [], config, gmtWorkspace.directory, gmtFormats);
  const result = await runGMTAsync(script, gmtWorkspace.directory, outputName, gmtFormats, config);
  sendProgress("finalize", 88, "正在整理输出文件...");
  finalizeGMTWorkspace(result, gmtWorkspace, outputDirectory, outputName, formats);
  if (result.ok) {
    result.files = formats.map((format) => path.join(outputDirectory, `${outputName}.${format}`));
    result.outputDirectory = outputDirectory;
    result.needsNativeDecorations = needsNativeDecorations;
  }
  sendProgress(result.ok ? "completed" : "failed", result.ok ? 100 : 90, result.ok ? "GMT 绘图完成。" : (result.message || "GMT 绘图失败。"));
  return result;
}

function saveGMTScript(payload) {
  const outputDirectory = payload.outputDirectory;
  const scriptPath = payload.scriptPath;
  const outputName = payload.config?.outputName || "mt_point_map";
  const script = buildScript(payload.records || [], payload.config || {}, outputDirectory, payload.formats || ["png", "pdf", "eps"]);
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, script, "utf8");
  if (process.platform !== "win32") fs.chmodSync(scriptPath, 0o755);
  return { ok: true, scriptPath, outputDirectory, outputName };
}

function runGMTAsync(script, outputDirectory, outputName, formats, config = {}) {
  const scriptPath = saveScript(script, outputDirectory, outputName);
  const gmt = resolveGMT();
  if (!gmt.available) {
    return Promise.resolve({
      ok: false,
      scriptPath,
      message: "未找到 GMT 命令。请先安装 GMT 6；macOS 可安装 GMT 官方 App 或 brew install gmt，Windows 请安装 GMT 官方 Windows 版。"
    });
  }
  if (cancelled) return Promise.resolve({ ok: false, scriptPath, message: "GMT 绘图已取消。" });
  const command = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
  const args = process.platform === "win32" ? ["/c", scriptPath] : [scriptPath];
  const env = {
    ...process.env,
    ...gmtCacheEnv(outputDirectory, config),
    PATH: `${gmt.binDir}${path.delimiter}${process.env.PATH || ""}`
  };
  if (gmt.gsLib) env.GS_LIB = gmt.gsLib;
  sendProgress("running", 42, "正在运行 GMT 绘图命令...");
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    currentChild = spawn(command, args, { cwd: outputDirectory, env });
    currentChild.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      sendProgress("running", 58, tailMessage(stdout, "GMT 正在输出图件..."));
    });
    currentChild.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      sendProgress("running", 58, tailMessage(stderr, "GMT 正在输出图件..."));
    });
    currentChild.on("error", (error) => {
      currentChild = null;
      resolve({ ok: false, scriptPath, message: error.message || String(error) });
    });
    currentChild.on("close", (code) => {
      currentChild = null;
      if (cancelled) {
        resolve({ ok: false, scriptPath, message: "GMT 绘图已取消。" });
        return;
      }
      if (code !== 0) {
        resolve({ ok: false, scriptPath, message: stderr || stdout || "GMT 执行失败。" });
        return;
      }
      resolve({
        ok: true,
        scriptPath,
        outputDirectory,
        files: formats.map((format) => path.join(outputDirectory, `${outputName}.${format}`))
      });
    });
  });
}

function stopCurrentChild() {
  if (!currentChild || currentChild.killed) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(currentChild.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      currentChild.kill("SIGTERM");
    }
  } catch {
    try {
      currentChild.kill();
    } catch {
      // Already stopped.
    }
  }
}

function sendProgress(step, percent, message) {
  void send({ type: "progress", progress: { step, percent, message } }).catch(() => {});
}

function tailMessage(output, fallback) {
  const line = String(output || "").trim().split(/\r?\n/).filter(Boolean).slice(-1)[0];
  return line ? `GMT：${line.slice(0, 160)}` : fallback;
}

async function createGMTWorkspace(outputDirectory, config, cacheDirectory) {
  if (process.platform !== "win32") {
    return { temporary: false, directory: outputDirectory, config };
  }
  const directory = createAsciiTempDirectory();
  return {
    temporary: true,
    directory,
    config: {
      ...await cacheTerrainInputs(config, cacheDirectory || terrainInputCacheRoot()),
      terrainCacheDirectory: path.join(require('./workspace').asciiWorkspaceRoot(),'Runtime','GMT-cache')
    }
  };
}

function createAsciiTempDirectory() {
  const root=path.join(require('./workspace').asciiWorkspaceRoot(),'Runtime','GMT-runs');
  fs.mkdirSync(root,{recursive:true});return fs.mkdtempSync(path.join(root,'run-'));
}

function terrainInputCacheRoot() {
  const root=path.join(require('./workspace').asciiWorkspaceRoot(),'Runtime','Terrain-inputs');
  fs.mkdirSync(root,{recursive:true});return root;
}

function isAsciiPath(targetPath) {
  return /^[\x00-\x7F]+$/.test(String(targetPath || ""));
}

async function cacheTerrainInputs(config, cacheRoot) {
  const nextConfig = { ...(config || {}) };
  if (!nextConfig.showTerrain) return nextConfig;
  if (nextConfig.terrainGridPath && fs.existsSync(nextConfig.terrainGridPath)) {
    const cached = await cachedCopy(nextConfig.terrainGridPath, cacheRoot, "terrain_grid", path.extname(nextConfig.terrainGridPath) || ".grd");
    nextConfig.terrainGridPath = cached;
    if (nextConfig.localTerrainGridPath) nextConfig.localTerrainGridPath = cached;
  }
  if (nextConfig.terrainShadePath && fs.existsSync(nextConfig.terrainShadePath)) {
    nextConfig.terrainShadePath = await cachedCopy(nextConfig.terrainShadePath, cacheRoot, "terrain_shade", ".nc");
  }
  return nextConfig;
}

async function cachedCopy(sourcePath, cacheRoot, baseName, extension) {
  const stat = await fs.promises.stat(sourcePath);
  const hash = crypto
    .createHash("sha1")
    .update([path.resolve(sourcePath), stat.size, Math.round(stat.mtimeMs)].join("|"))
    .digest("hex")
    .slice(0, 16);
  const directory = path.join(cacheRoot, hash);
  const target = path.join(directory, `${baseName}${extension}`);
  try {
    const targetStat = await fs.promises.stat(target);
    if (targetStat.size === stat.size) return target;
  } catch {
    // Cache miss.
  }
  await fs.promises.mkdir(directory, { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  await fs.promises.rm(temp, { force: true });
  try {
    await fs.promises.link(sourcePath, temp);
  } catch {
    await fs.promises.copyFile(sourcePath, temp);
  }
  await fs.promises.rename(temp, target);
  return target;
}

function finalizeGMTWorkspace(result, workspace, outputDirectory, outputName, formats) {
  if (!workspace.temporary) return;
  fs.mkdirSync(outputDirectory, { recursive: true });
  const scriptExtension = process.platform === "win32" ? "bat" : "gmt";
  const finalScriptPath = path.join(outputDirectory, `${outputName}.${scriptExtension}`);
  copyIfExists(result.scriptPath, finalScriptPath);
  result.scriptPath = finalScriptPath;

  if (result.ok) {
    for (const format of formats) {
      copyIfExists(path.join(workspace.directory, `${outputName}.${format}`), path.join(outputDirectory, `${outputName}.${format}`));
    }
    copyIfExists(path.join(workspace.directory, "stations_points.tsv"), path.join(outputDirectory, "stations_points.tsv"));
    copyIfExists(path.join(workspace.directory, "stations_labels.tsv"), path.join(outputDirectory, "stations_labels.tsv"));
    copyIfExists(path.join(workspace.directory, DEFAULT_OVERLAY_FILE), path.join(outputDirectory, DEFAULT_OVERLAY_FILE));
    copyIfExists(path.join(workspace.directory, DEFAULT_LEGEND_FILE), path.join(outputDirectory, DEFAULT_LEGEND_FILE));
    fs.rmSync(workspace.directory, { recursive: true, force: true });
  }
}

function copyIfExists(source, target) {
  if (!source || !target || !fs.existsSync(source)) return;
  if (path.resolve(source) === path.resolve(target)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function shouldOverlayTitle(config) {
  if (config?.showTitle === false) return false;
  const title = String(config?.title || "").trim();
  return title && needsNativeTextRendering(title);
}

function shouldOverlayLegend(config) {
  if (!config?.legend?.show) return false;
  const entries = buildLegendEntries(config);
  if (!entries.length) return false;
  const labels = [config.legend.title, ...entries.map((entry) => entry.label)];
  return labels.some((label) => needsNativeTextRendering(label));
}

function isVectorFormat(format) {
  return ["pdf", "eps", "ps"].includes(String(format || "").toLowerCase());
}
