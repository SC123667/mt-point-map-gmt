const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const {
  DEFAULT_LEGEND_FILE,
  DEFAULT_OVERLAY_FILE,
  buildScript,
  needsNativeTextRendering,
  runGMT
} = require("./gmt");

process.on("message", async (message) => {
  if (!message || message.type !== "start") return;
  try {
    const result = await handleTask(message.payload || {});
    send({ type: "result", result });
    setImmediate(() => process.exit(0));
  } catch (error) {
    send({ type: "error", message: error.message || String(error), stack: error.stack || "" });
    setImmediate(() => process.exit(1));
  }
});

process.on("disconnect", () => process.exit(0));

function send(payload) {
  if (process.connected) process.send(payload);
}

async function handleTask(payload) {
  if (payload.mode === "saveScript") return saveGMTScript(payload);
  return exportGMTMap(payload);
}

async function exportGMTMap(payload) {
  const outputDirectory = payload.outputDirectory;
  const formats = payload.formats || ["png"];
  const outputName = payload.config?.outputName || "mt_point_map";
  const includesVector = formats.some(isVectorFormat);
  const needsTitleOverlay = !includesVector && formats.includes("png") && shouldOverlayTitle(payload.config);
  const gmtFormats = needsTitleOverlay && !formats.includes("png") ? [...formats, "png"] : formats;
  const gmtWorkspace = await createGMTWorkspace(outputDirectory, payload.config, payload.cacheDirectory);
  const config = {
    ...gmtWorkspace.config,
    forceGMTTitle: includesVector && shouldOverlayTitle(payload.config)
  };
  const script = buildScript(payload.records || [], config, gmtWorkspace.directory, gmtFormats);
  const result = runGMT(script, gmtWorkspace.directory, outputName, gmtFormats);
  finalizeGMTWorkspace(result, gmtWorkspace, outputDirectory, outputName, formats);
  if (result.ok) {
    result.files = formats.map((format) => path.join(outputDirectory, `${outputName}.${format}`));
    result.outputDirectory = outputDirectory;
    result.needsTitleOverlay = needsTitleOverlay;
  }
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

async function createGMTWorkspace(outputDirectory, config, cacheDirectory) {
  if (process.platform !== "win32") {
    return { temporary: false, directory: outputDirectory, config };
  }
  const directory = createAsciiTempDirectory();
  return {
    temporary: true,
    directory,
    config: await cacheTerrainInputs(config, cacheDirectory || terrainInputCacheRoot())
  };
}

function createAsciiTempDirectory() {
  const roots = [
    process.env.PUBLIC ? path.join(process.env.PUBLIC, "MTPointMapGMT") : "",
    process.env.ProgramData ? path.join(process.env.ProgramData, "MTPointMapGMT") : "",
    path.join(os.tmpdir(), "MTPointMapGMT")
  ].filter(Boolean);
  for (const root of roots) {
    if (!isAsciiPath(root)) continue;
    try {
      fs.mkdirSync(root, { recursive: true });
      return fs.mkdtempSync(path.join(root, "run-"));
    } catch {
      // Try the next writable ASCII path.
    }
  }
  const fallbackRoot = path.join(os.tmpdir(), "MTPointMapGMT");
  fs.mkdirSync(fallbackRoot, { recursive: true });
  return fs.mkdtempSync(path.join(fallbackRoot, "run-"));
}

function terrainInputCacheRoot() {
  const roots = [
    process.env.PUBLIC ? path.join(process.env.PUBLIC, "MTPointMapGMT", "terrain-input-cache") : "",
    process.env.ProgramData ? path.join(process.env.ProgramData, "MTPointMapGMT", "terrain-input-cache") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "MTPointMapGMT", "terrain-input-cache") : "",
    path.join(os.tmpdir(), "MTPointMapGMT", "terrain-input-cache")
  ].filter(Boolean);
  for (const root of roots) {
    if (!isAsciiPath(root)) continue;
    try {
      fs.mkdirSync(root, { recursive: true });
      return root;
    } catch {
      // Try the next writable ASCII cache root.
    }
  }
  const fallback = path.join(os.tmpdir(), "MTPointMapGMT", "terrain-input-cache");
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
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
  const title = String(config?.title || "").trim();
  return title && needsNativeTextRendering(title);
}

function isVectorFormat(format) {
  return ["pdf", "eps", "ps"].includes(String(format || "").toLowerCase());
}
