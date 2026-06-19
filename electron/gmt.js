const fs = require("fs");
const crypto = require("crypto");
const https = require("https");
const path = require("path");
const { execFileSync, spawn, spawnSync } = require("child_process");

const GMT_MAC_VERSION = "6.5.0";
const GMT_WINDOWS_VERSION = "6.6.0";
const TERRAIN_RESOLUTIONS = {
  "20m": { seconds: 1200, remote: "@earth_relief_20m", label: "20 分，约 37 km", source: "gmt" },
  "10m": { seconds: 600, remote: "@earth_relief_10m", label: "10 分，约 18 km", source: "gmt" },
  "06m": { seconds: 360, remote: "@earth_relief_06m", label: "6 分，约 10 km", source: "gmt" },
  "01m": { seconds: 60, remote: "@earth_relief_01m", label: "1 分，约 1.9 km", source: "srtm" },
  "30s": { seconds: 30, remote: "@earth_relief_30s", label: "30 秒，约 900 m", source: "srtm" },
  "15s": { seconds: 15, remote: "@earth_relief_15s", label: "15 秒，约 450 m", source: "srtm" },
  "03s": { seconds: 3, remote: "@earth_relief_03s", label: "3 秒，约 90 m", source: "srtm" },
  "01s": { seconds: 1, remote: "@earth_relief_01s", label: "1 秒，约 30 m", source: "srtm" }
};

function gmtAvailable() {
  return resolveGMT().available;
}

function resolveGMT() {
  const pathCandidates = gmtPathCandidates();
  for (const candidate of pathCandidates) {
    const resolved = testGMTCandidate(candidate.path, candidate.source);
    if (resolved.available) return resolved;
  }
  return {
    available: false,
    path: "",
    binDir: "",
    version: "",
    source: "",
    message: "未找到 GMT 命令。"
  };
}

function gmtPathCandidates() {
  const candidates = [];
  const seen = new Set();
  const add = (candidate, source) => {
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    candidates.push({ path: candidate, source });
  };

  for (const binDir of String(process.env.PATH || "").split(path.delimiter)) {
    if (!binDir) continue;
    add(path.join(binDir, process.platform === "win32" ? "gmt.exe" : "gmt"), "PATH");
  }

  if (process.platform === "darwin") {
    add("/opt/homebrew/bin/gmt", "Homebrew Apple Silicon");
    add("/usr/local/bin/gmt", "Homebrew Intel");
    add("/opt/local/bin/gmt", "MacPorts");
    add("/Applications/GMT-6.5.0.app/Contents/Resources/bin/gmt", "GMT macOS App");
    add("/Applications/GMT-6.6.0.app/Contents/Resources/bin/gmt", "GMT macOS App");
    try {
      const appNames = fs.readdirSync("/Applications").filter((name) => /^GMT-.*\.app$/i.test(name));
      for (const appName of appNames) {
        add(path.join("/Applications", appName, "Contents", "Resources", "bin", "gmt"), "GMT macOS App");
      }
    } catch {
      // /Applications can be unavailable on unusual systems.
    }
  }

  if (process.platform === "win32") {
    const roots = [
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs") : ""
    ].filter(Boolean);
    for (const root of roots) {
      try {
        const names = fs.readdirSync(root).filter((name) => /^GMT/i.test(name));
        for (const name of names) add(path.join(root, name, "bin", "gmt.exe"), "Windows install directory");
      } catch {
        // Ignore inaccessible system folders.
      }
    }
  }

  return candidates;
}

function testGMTCandidate(candidatePath, source) {
  if (!fs.existsSync(candidatePath)) {
    return { available: false };
  }
  try {
    const version = execFileSync(candidatePath, ["--version"], {
      encoding: "utf8",
      timeout: 8000,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return {
      available: true,
      path: candidatePath,
      binDir: path.dirname(candidatePath),
      version,
      gsLib: ghostscriptLibraryPath(path.dirname(candidatePath)),
      source,
      message: `已找到 GMT ${version}：${candidatePath}`
    };
  } catch {
    return { available: false };
  }
}

function commandAvailable(name) {
  const command = process.platform === "win32" ? "where" : "which";
  try {
    execFileSync(command, [name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function installPlan() {
  const download = installerDownloadPlan();
  if (process.platform === "darwin") {
    return {
      platform: "macOS",
      canAutoInstall: true,
      autoCommand: "brew install gmt",
      manualCommand: "brew install gmt",
      download,
      message: `可直接下载 GMT ${GMT_MAC_VERSION} 官方 macOS 安装包。`
    };
  }
  if (process.platform === "win32") {
    return {
      platform: "Windows",
      canAutoInstall: true,
      autoCommand: "winget install --id GenericMappingTools.gmt --exact --accept-package-agreements --accept-source-agreements",
      manualCommand: "winget install --id GenericMappingTools.gmt --exact",
      download,
      message: `可直接下载 GMT ${GMT_WINDOWS_VERSION} 官方 Windows 64 位安装器。`
    };
  }
  return {
    platform: process.platform,
    canAutoInstall: false,
    autoCommand: "",
    manualCommand: "",
    message: "当前系统暂不支持自动安装，请参考 GMT 官方安装文档。"
  };
}

function installerDownloadPlan() {
  if (process.platform === "darwin") {
    const base = `https://github.com/GenericMappingTools/gmt/releases/download/${GMT_MAC_VERSION}`;
    const arch = process.arch === "arm64" ? "arm64" : "x86_64";
    const fileName = `gmt-${GMT_MAC_VERSION}-darwin-${arch}.dmg`;
    return {
      version: GMT_MAC_VERSION,
      fileName,
      url: `${base}/${fileName}`,
      kind: "dmg"
    };
  }
  if (process.platform === "win32") {
    const base = `https://github.com/GenericMappingTools/gmt/releases/download/${GMT_WINDOWS_VERSION}`;
    const fileName = `gmt-${GMT_WINDOWS_VERSION}-win64.exe`;
    return {
      version: GMT_WINDOWS_VERSION,
      fileName,
      url: `${base}/${fileName}`,
      kind: "exe"
    };
  }
  return null;
}

async function startGMTInstall(downloadDirectory) {
  const plan = installPlan();
  if (!plan.canAutoInstall || !plan.download) {
    return { ok: false, message: plan.message, plan };
  }
  try {
    const filePath = await downloadInstaller(plan.download, downloadDirectory);
    openDownloadedInstaller(filePath);
    return {
      ok: true,
      message: `GMT 安装包已下载并打开：${filePath}`,
      filePath,
      plan
    };
  } catch (error) {
    return {
      ok: false,
      message: `GMT 安装包下载失败：${error.message || error}`,
      plan
    };
  }
}

function downloadInstaller(download, downloadDirectory) {
  fs.mkdirSync(downloadDirectory, { recursive: true });
  const filePath = path.join(downloadDirectory, download.fileName);
  return downloadFile(download.url, filePath, 0);
}

function downloadFile(url, filePath, redirectCount) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error("下载重定向次数过多，请检查网络或手动打开 GMT 官网。"));
      return;
    }

    const request = https.get(url, { headers: { "User-Agent": "MT-Point-Map-GMT" }, timeout: 30000 }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        const location = response.headers.location;
        if (!location) {
          reject(new Error("下载地址重定向无效。"));
          return;
        }
        const nextUrl = new URL(location, url).toString();
        downloadFile(nextUrl, filePath, redirectCount + 1).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`服务器返回 HTTP ${response.statusCode}`));
        return;
      }

      const tempPath = `${filePath}.download`;
      const file = fs.createWriteStream(tempPath);
      response.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          fs.renameSync(tempPath, filePath);
          resolve(filePath);
        });
      });
      file.on("error", (error) => {
        fs.rmSync(tempPath, { force: true });
        reject(error);
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error("下载超时，请检查网络连接。"));
    });
    request.on("error", reject);
  });
}

function openDownloadedInstaller(filePath) {
  if (process.platform === "darwin") {
    spawn("open", [filePath], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (process.platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "", filePath], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    }).unref();
  }
}

function defaultOutputDirectory(app) {
  return path.join(app.getPath("documents"), "MT点位图制作工具—GMT输出");
}

function autoRegion(records) {
  const lons = records.map((record) => record.lon);
  const lats = records.map((record) => record.lat);
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const lonSpan = east - west;
  const latSpan = north - south;
  const lonPad = Math.max(lonSpan * 0.12, 0.001);
  const latPad = Math.max(latSpan * 0.12, 0.001);
  return `${(west - lonPad).toFixed(6)}/${(east + lonPad).toFixed(6)}/${(south - latPad).toFixed(6)}/${(north + latPad).toFixed(6)}`;
}

function buildScript(records, config, outputDirectory, formats = ["png"]) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const pointsPath = path.join(outputDirectory, "stations_points.tsv");
  const labelsPath = path.join(outputDirectory, "stations_labels.tsv");
  const pointLines = records.map((record) => `${record.lon.toFixed(8)}\t${record.lat.toFixed(8)}\t${record.name}`).join("\n") + "\n";
  fs.writeFileSync(pointsPath, pointLines, "utf8");
  fs.writeFileSync(labelsPath, pointLines, "utf8");

  const region = (config.region || "").trim() || autoRegion(records);
  const regionValues = parseRegion(region);
  const gridPrefix = config.showGrid ? "g" : "";
  const frameOption = `-B${gridPrefix}${config.frame}`;
  const title = (config.title || "").trim();
  const titleOption = title && !needsNativeTextRendering(title) ? ` -B+t${quote(title)}` : "";
  const outputPrefix = path.join(outputDirectory, config.outputName || "mt_point_map");
  const labelFont = `${Number(config.labelFontSize).toFixed(1)}p,Helvetica,${config.labelColor}`;
  const offset = `${Number(config.labelDX).toFixed(3)}c/${Number(config.labelDY).toFixed(3)}c`;
  const scale = scaleForRegion(regionValues);
  const shell = process.platform === "win32" ? "bat" : "sh";
  const gmt = resolveGMT();
  const environmentLines = gmtEnvironmentLines(gmt, shell);
  const terrain = terrainScriptParts(config, region, outputDirectory, shell);
  if (shell === "bat") {
    return [
      "@echo off",
      "setlocal enabledelayedexpansion",
      ...environmentLines,
      `gmt begin ${quote(outputPrefix)} ${quote(formats.join(","))}`,
      "gmt set MAP_FRAME_TYPE plain FONT_ANNOT_PRIMARY 9p FONT_LABEL 10p FORMAT_GEO_MAP ddd:mm:ssF",
      ...terrain.preCommands,
      `gmt basemap -R${region} -J${config.projection} ${frameOption}${titleOption}`,
      terrain.imageCommand || `gmt coast -R${region} -J${config.projection} -Di -Ggray95 -Swhite -W0.25p,gray45`,
      `gmt plot ${quote(pointsPath)} -R${region} -J${config.projection} -S${config.pointSymbol}${Number(config.pointSize).toFixed(3)}c -G${quote(config.pointFill)} -W${Number(config.pointPenWidth).toFixed(3)}p,${config.pointPenColor}`,
      config.showLabels ? `gmt text ${quote(labelsPath)} -R${region} -J${config.projection} -F+f${quote(labelFont)}+jLB -D${offset}` : "",
      config.showScale ? `gmt basemap -R${region} -J${config.projection} -LjBR+w${scale.length}+o0.5c/0.5c+f+l${scale.label}` : "",
      config.showNorthArrow ? `gmt basemap -R${region} -J${config.projection} -TdjTR+w1.0c+o0.4c/0.4c` : "",
      "gmt end",
      ""
    ].filter(Boolean).join("\r\n");
  }
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    ...environmentLines,
    "",
    `gmt begin ${quote(outputPrefix)} ${quote(formats.join(","))}`,
    "  gmt set MAP_FRAME_TYPE plain FONT_ANNOT_PRIMARY 9p FONT_LABEL 10p FORMAT_GEO_MAP ddd:mm:ssF",
    ...terrain.preCommands,
    `  gmt basemap -R${region} -J${config.projection} ${frameOption}${titleOption}`,
    terrain.imageCommand || `  gmt coast -R${region} -J${config.projection} -Di -Ggray95 -Swhite -W0.25p,gray45`,
    `  gmt plot ${quote(pointsPath)} -R${region} -J${config.projection} -S${config.pointSymbol}${Number(config.pointSize).toFixed(3)}c -G${quote(config.pointFill)} -W${Number(config.pointPenWidth).toFixed(3)}p,${config.pointPenColor}`,
    config.showLabels ? `  gmt text ${quote(labelsPath)} -R${region} -J${config.projection} -F+f${quote(labelFont)}+jLB -D${offset}` : "",
    config.showScale ? `  gmt basemap -R${region} -J${config.projection} -LjBR+w${scale.length}+o0.5c/0.5c+f+l${scale.label}` : "",
    config.showNorthArrow ? `  gmt basemap -R${region} -J${config.projection} -TdjTR+w1.0c+o0.4c/0.4c` : "",
    "gmt end",
    ""
  ].filter(Boolean).join("\n");
}

function terrainScriptParts(config, region, outputDirectory, shell) {
  if (!config.showTerrain) return { preCommands: [], imageCommand: "" };
  const paths = terrainPaths(outputDirectory, config, region);
  const grid = config.terrainGridPath && fs.existsSync(config.terrainGridPath) ? config.terrainGridPath : paths.gridPath;
  const shade = config.terrainShadePath && fs.existsSync(config.terrainShadePath) ? config.terrainShadePath : paths.shadePath;
  const remote = terrainRemoteName(config.terrainResolution);
  const intensity = terrainIntensity(config.terrainIntensity);
  const cpt = terrainCpt(config.terrainCpt);
  const prefix = shell === "bat" ? "" : "  ";
  const preCommands = [];
  preCommands.push(`${prefix}gmt set GMT_DATA_SERVER oceania`);
  preCommands.push(`${prefix}gmt set GMT_DATA_UPDATE_INTERVAL ${config.terrainAllowDownload ? "1d" : "off"}`);
  if (!fs.existsSync(grid) || !fs.existsSync(shade)) {
    preCommands.push(`${prefix}gmt grdcut ${remote} -R${region} -G${quote(grid)} -V`);
    preCommands.push(`${prefix}gmt grdgradient ${quote(grid)} -A315 -Ne${intensity} -G${quote(shade)}`);
  }
  return {
    preCommands,
    imageCommand: `${prefix}gmt grdimage ${quote(grid)} -R${region} -J${config.projection} -I${quote(shade)} -C${cpt}`
  };
}

function saveScript(script, outputDirectory, outputName = "mt_point_map") {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const ext = process.platform === "win32" ? "bat" : "gmt";
  const scriptPath = path.join(outputDirectory, `${outputName}.${ext}`);
  fs.writeFileSync(scriptPath, script, "utf8");
  if (process.platform !== "win32") fs.chmodSync(scriptPath, 0o755);
  return scriptPath;
}

function runGMT(script, outputDirectory, outputName, formats) {
  const scriptPath = saveScript(script, outputDirectory, outputName);
  const gmt = resolveGMT();
  if (!gmt.available) {
    return {
      ok: false,
      scriptPath,
      message: "未找到 GMT 命令。请先安装 GMT 6；macOS 可安装 GMT 官方 App 或 brew install gmt，Windows 请安装 GMT 官方 Windows 版。"
    };
  }
  const command = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
  const args = process.platform === "win32" ? ["/c", scriptPath] : [scriptPath];
  const env = {
    ...process.env,
    PATH: `${gmt.binDir}${path.delimiter}${process.env.PATH || ""}`
  };
  if (gmt.gsLib) env.GS_LIB = gmt.gsLib;
  const result = spawnSync(command, args, { cwd: outputDirectory, encoding: "utf8", env });
  if (result.status !== 0) {
    return { ok: false, scriptPath, message: result.stderr || result.stdout || "GMT 执行失败。" };
  }
  return {
    ok: true,
    scriptPath,
    outputDirectory,
    files: formats.map((format) => path.join(outputDirectory, `${outputName}.${format}`))
  };
}

function quote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_+\-./:=,#]+$/.test(text)) return text;
  if (process.platform === "win32") return `"${text.replace(/"/g, "\"\"")}"`;
  return `'${text.replace(/'/g, "'\"'\"'")}'`;
}

function needsNativeTextRendering(value) {
  return /[^\x00-\x7F]/.test(String(value || ""));
}

function parseRegion(region) {
  const values = String(region || "").split("/").map((value) => Number(value));
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return null;
  return {
    west: values[0],
    east: values[1],
    south: values[2],
    north: values[3]
  };
}

function terrainRemoteName(resolution) {
  return (TERRAIN_RESOLUTIONS[resolution] || TERRAIN_RESOLUTIONS["06m"]).remote;
}

function terrainResolutionSeconds(resolution) {
  return (TERRAIN_RESOLUTIONS[resolution] || TERRAIN_RESOLUTIONS["06m"]).seconds;
}

function terrainResolutionInfo(resolution) {
  return TERRAIN_RESOLUTIONS[resolution] || TERRAIN_RESOLUTIONS["06m"];
}

function terrainSource(resolution) {
  return terrainResolutionInfo(resolution).source || "gmt";
}

function terrainCpt(value) {
  return /^[A-Za-z0-9_+\-./]+$/.test(String(value || "")) ? String(value) : "geo";
}

function terrainIntensity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.65;
  return Math.max(0.1, Math.min(1.5, numeric));
}

function terrainEstimate(region, resolution) {
  const parsed = parseRegion(region);
  const seconds = terrainResolutionSeconds(resolution);
  if (!parsed || parsed.east <= parsed.west || parsed.north <= parsed.south) {
    return {
      cells: 0,
      gridBytes: 0,
      workingBytes: 0,
      label: "请先导入点位或设置有效范围"
    };
  }
  const xCells = Math.max(2, Math.ceil((parsed.east - parsed.west) * 3600 / seconds));
  const yCells = Math.max(2, Math.ceil((parsed.north - parsed.south) * 3600 / seconds));
  const cells = xCells * yCells;
  const gridBytes = cells * 2;
  const workingBytes = gridBytes * 2;
  if (terrainSource(resolution) === "srtm") {
    const tileCount = srtmTileCount(parsed);
    const downloadBytes = tileCount * 8 * 1024 * 1024;
    const cacheBytes = tileCount * 26 * 1024 * 1024;
    return {
      cells,
      gridBytes,
      workingBytes: workingBytes + downloadBytes,
      downloadBytes,
      cacheBytes,
      tileCount,
      label: `预计下载约 ${formatBytes(downloadBytes)} SRTM 高程瓦片，解压缓存约 ${formatBytes(cacheBytes)}，本地网格约 ${formatBytes(workingBytes)}`
    };
  }
  return {
    cells,
    gridBytes,
    workingBytes,
    label: `${formatBytes(workingBytes)} 本地工作文件，GMT 实际下载量取决于分块缓存`
  };
}

function srtmTileCount(region) {
  const west = Math.floor(region.west);
  const east = Math.floor(region.east - Number.EPSILON);
  const south = Math.floor(region.south);
  const north = Math.floor(region.north - Number.EPSILON);
  return Math.max(1, east - west + 1) * Math.max(1, north - south + 1);
}

function terrainPaths(outputDirectory, config, region = config.region) {
  const resolution = config.terrainResolution || "06m";
  const key = terrainKey(outputDirectory, config, region);
  const directory = path.join(outputDirectory, "terrain_cache");
  return {
    key,
    directory,
    gridPath: path.join(directory, `earth_relief_${resolution}_${key}.nc`),
    shadePath: path.join(directory, `earth_relief_${resolution}_${key}_shade.nc`)
  };
}

function terrainKey(outputDirectory, config, region = config.region) {
  return crypto
    .createHash("sha1")
    .update([
      path.resolve(outputDirectory || "."),
      String(region || ""),
      String(config.terrainResolution || "06m"),
      String(config.terrainIntensity || "0.65")
    ].join("|"))
    .digest("hex")
    .slice(0, 12);
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = Math.max(0, Number(bytes) || 0);
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function scaleForRegion(region) {
  if (!region) return { length: "1k", label: "km" };
  const midLat = (region.south + region.north) / 2;
  const widthKm = Math.max(0.001, (region.east - region.west) * 111.32 * Math.cos(toRadians(midLat)));
  const targetKm = widthKm / 4;
  if (targetKm < 1) return { length: `${niceDistanceMeters(targetKm * 1000)}e`, label: "m" };
  return { length: `${niceDistanceKm(targetKm)}k`, label: "km" };
}

function niceDistanceMeters(value) {
  const options = [20, 50, 100, 200, 500, 1000];
  return options.find((option) => option >= value) || 1000;
}

function niceDistanceKm(value) {
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const normalized = value / base;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return Number((step * base).toPrecision(6));
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function ghostscriptLibraryPath(binDir) {
  const resourceRoot = path.resolve(binDir, "..");
  const initDir = path.join(resourceRoot, "share", "ghostscript", "Resource", "Init");
  const libDir = path.join(resourceRoot, "share", "ghostscript", "lib");
  const parts = [initDir, libDir].filter((candidate) => fs.existsSync(candidate));
  return parts.join(path.delimiter);
}

function gmtEnvironmentLines(gmt, shell) {
  if (!gmt.available || !gmt.binDir) return [];
  if (shell === "bat") {
    return [
      `set "PATH=${gmt.binDir};%PATH%"`,
      gmt.gsLib ? `set "GS_LIB=${gmt.gsLib}"` : ""
    ].filter(Boolean);
  }
  return [
    `export PATH=${quote(gmt.binDir)}:"$PATH"`,
    gmt.gsLib ? `export GS_LIB=${gmt.gsLib.split(path.delimiter).map(quote).join(":")}` : ""
  ].filter(Boolean);
}

module.exports = {
  gmtAvailable,
  resolveGMT,
  installPlan,
  installerDownloadPlan,
  startGMTInstall,
  openDownloadedInstaller,
  defaultOutputDirectory,
  autoRegion,
  buildScript,
  formatBytes,
  saveScript,
  runGMT,
  terrainEstimate,
  terrainPaths,
  terrainResolutionInfo,
  terrainRemoteName,
  terrainResolutionSeconds,
  terrainSource,
  terrainIntensity,
  needsNativeTextRendering
};
