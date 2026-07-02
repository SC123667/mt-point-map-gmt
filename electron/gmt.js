const fs = require("fs");
const crypto = require("crypto");
const https = require("https");
const path = require("path");
const { execFileSync, spawn, spawnSync } = require("child_process");
const { nearestResponse, metricsForResponse } = require("./mt");
const { DEFAULT_OVERLAY_FILE, buildFaultOverlay } = require("./faults");
const { DEFAULT_LEGEND_FILE, buildLegendEntries, legendCommand, writeLegendFile } = require("./legend");

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
const TERRAIN_SAFE_CELL_LIMIT = 2_500_000;
const TERRAIN_WARNING_CELL_LIMIT = 1_000_000;
const TERRAIN_RECOMMENDATION_ORDER = ["01s", "03s", "15s", "30s", "01m", "06m", "10m", "20m"];

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
  if (config.plotType === "responseCurve") {
    return buildResponseCurveScript(records, config, outputDirectory, formats);
  }
  const pointsPath = path.join(outputDirectory, "stations_points.tsv");
  const labelsPath = path.join(outputDirectory, "stations_labels.tsv");
  const pointLines = records.map((record) => `${record.lon.toFixed(8)}\t${record.lat.toFixed(8)}\t${record.name}`).join("\n") + "\n";
  fs.writeFileSync(pointsPath, pointLines, "utf8");
  fs.writeFileSync(labelsPath, pointLines, "utf8");

  const region = (config.region || "").trim() || autoRegion(records);
  const regionValues = parseRegion(region);
  const shell = process.platform === "win32" ? "bat" : "sh";
  const gridPrefix = config.showGrid ? "g" : "";
  const frameOption = `-B${gridPrefix}${config.frame}`;
  const title = (config.title || "").trim();
  const titleOption = title && !needsNativeTextRendering(title) ? ` -B+t${quote(title)}` : "";
  const outputPrefix = shell === "bat" ? config.outputName || "mt_point_map" : path.join(outputDirectory, config.outputName || "mt_point_map");
  const pointsPathForScript = shell === "bat" ? "stations_points.tsv" : pointsPath;
  const labelsPathForScript = shell === "bat" ? "stations_labels.tsv" : labelsPath;
  const labelFont = `${Number(config.labelFontSize).toFixed(1)}p,Helvetica,${config.labelColor}`;
  const offset = `${Number(config.labelDX).toFixed(3)}c/${Number(config.labelDY).toFixed(3)}c`;
  const scale = scaleForRegion(regionValues);
  const gmt = resolveGMT();
  const environmentLines = gmtEnvironmentLines(gmt, shell);
  const terrain = terrainScriptParts(config, region, outputDirectory, shell);
  const mtOverlay = mtOverlayScriptParts(records, config, outputDirectory, region, regionValues, shell);
  const faultOverlay = faultOverlayScriptParts(config, outputDirectory, region, shell);
  const legend = legendScriptPart(config, outputDirectory, region, shell);
  if (shell === "bat") {
    return [
      "@echo off",
      "setlocal enabledelayedexpansion",
      "cd /d \"%~dp0\"",
      ...environmentLines,
      `gmt begin ${quote(outputPrefix)} ${quote(formats.join(","))}`,
      "gmt set MAP_FRAME_TYPE plain FONT_ANNOT_PRIMARY 9p FONT_LABEL 10p FORMAT_GEO_MAP ddd:mm:ssF",
      ...terrain.preCommands,
      `gmt basemap -R${region} -J${config.projection} ${frameOption}${titleOption}`,
      terrain.imageCommand || `gmt coast -R${region} -J${config.projection} -Di -Ggray95 -Swhite -W0.25p,gray45`,
      ...faultOverlay.commands,
      `gmt plot ${quote(pointsPathForScript)} -R${region} -J${config.projection} -S${config.pointSymbol}${Number(config.pointSize).toFixed(3)}c -G${quote(config.pointFill)} -W${Number(config.pointPenWidth).toFixed(3)}p,${config.pointPenColor}`,
      ...mtOverlay.commands,
      config.showLabels ? `gmt text ${quote(labelsPathForScript)} -R${region} -J${config.projection} -F+f${quote(labelFont)}+jLB -D${offset}` : "",
      config.showScale ? `gmt basemap -R${region} -J${config.projection} -LjBR+w${scale.length}+o0.5c/0.5c+f+l${scale.label}` : "",
      config.showNorthArrow ? `gmt basemap -R${region} -J${config.projection} -TdjTR+w1.0c+o0.4c/0.4c` : "",
      legend.command,
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
    ...faultOverlay.commands,
    `  gmt plot ${quote(pointsPathForScript)} -R${region} -J${config.projection} -S${config.pointSymbol}${Number(config.pointSize).toFixed(3)}c -G${quote(config.pointFill)} -W${Number(config.pointPenWidth).toFixed(3)}p,${config.pointPenColor}`,
    ...mtOverlay.commands,
    config.showLabels ? `  gmt text ${quote(labelsPathForScript)} -R${region} -J${config.projection} -F+f${quote(labelFont)}+jLB -D${offset}` : "",
    config.showScale ? `  gmt basemap -R${region} -J${config.projection} -LjBR+w${scale.length}+o0.5c/0.5c+f+l${scale.label}` : "",
    config.showNorthArrow ? `  gmt basemap -R${region} -J${config.projection} -TdjTR+w1.0c+o0.4c/0.4c` : "",
    legend.command,
    "gmt end",
    ""
  ].filter(Boolean).join("\n");
}

function faultOverlayScriptParts(config, outputDirectory, region, shell) {
  const layers = (config.faultLayers || [])
    .filter((layer) => layer && layer.path)
    .map((layer) => ({
      path: String(layer.path),
      name: String(layer.name || path.basename(layer.path)),
      color: String(layer.color || "#d7191c")
    }));
  if (!layers.length) return { commands: [] };
  const overlay = buildFaultOverlay(layers, outputDirectory, { filename: DEFAULT_OVERLAY_FILE });
  if (overlay.empty) return { commands: [] };
  const prefix = shell === "bat" ? "" : "  ";
  const dataPath = shell === "bat" ? overlay.filename : overlay.path;
  return {
    commands: [
      `${prefix}# Structural line overlays`,
      `${prefix}gmt plot ${quote(dataPath)} -R${region} -J${config.projection}`
    ]
  };
}

function legendScriptPart(config, outputDirectory, region, shell) {
  if (!config.legend?.show) return { command: "" };
  const entries = buildLegendEntries(config);
  if (!entries.length) return { command: "" };
  const legend = writeLegendFile(entries, outputDirectory, {
    ...config.legend,
    filename: DEFAULT_LEGEND_FILE
  });
  const legendPath = shell === "bat" ? legend.filename : legend.path;
  return {
    command: legendCommand(legendPath, region, config.projection, shell, legend.config)
  };
}

function mtOverlayScriptParts(records, config, outputDirectory, regionText, region, shell) {
  const plotType = config.plotType || "stationMap";
  if (!["strikeMap", "phaseTensorMap", "tipperMap"].includes(plotType)) return { commands: [] };
  const prefix = shell === "bat" ? "" : "  ";
  const scriptPath = (name) => shell === "bat" ? name : path.join(outputDirectory, name);
  if (plotType === "strikeMap") {
    const fileName = "mt_strike_segments.tsv";
    const rows = buildStrikeSegments(records, config, region);
    fs.writeFileSync(path.join(outputDirectory, fileName), rows, "utf8");
    return { commands: rows.trim() ? [`${prefix}gmt plot ${quote(scriptPath(fileName))} -R${regionText} -J${config.projection} -W${Number(config.strikeWidth || 1.2).toFixed(2)}p,${config.strikeColor || "blue"}`] : [] };
  }
  if (plotType === "tipperMap") {
    const fileName = "mt_tipper_arrows.tsv";
    const rows = buildTipperArrows(records, config, region);
    fs.writeFileSync(path.join(outputDirectory, fileName), rows, "utf8");
    return { commands: rows.trim() ? [`${prefix}gmt plot ${quote(scriptPath(fileName))} -R${regionText} -J${config.projection} -W${Number(config.tipperWidth || 1).toFixed(2)}p,${config.tipperColor || "purple"}`] : [] };
  }
  const fileName = "mt_phase_tensor_ellipses.tsv";
  const rows = buildPhaseTensorEllipses(records, config, region);
  fs.writeFileSync(path.join(outputDirectory, fileName), rows, "utf8");
  return { commands: rows.trim() ? [`${prefix}gmt plot ${quote(scriptPath(fileName))} -R${regionText} -J${config.projection}`] : [] };
}

function buildStrikeSegments(records, config, region) {
  const length = mapLengthDegrees(region, Number(config.strikeLength || 0.025));
  const period = Number(config.mtPeriod);
  const lines = [];
  for (const record of records) {
    const metrics = metricsForResponse(nearestResponse(record, period));
    const angle = Number.isFinite(metrics?.impedance?.strike) ? metrics.impedance.strike : Number(metrics?.phaseTensor?.azimuth);
    if (!Number.isFinite(angle)) continue;
    const [a, b] = segmentEndpoints(record.lon, record.lat, angle, length);
    lines.push(">", `${a.lon.toFixed(8)}\t${a.lat.toFixed(8)}`, `${b.lon.toFixed(8)}\t${b.lat.toFixed(8)}`);
  }
  return lines.join("\n") + (lines.length ? "\n" : "");
}

function buildTipperArrows(records, config, region) {
  const base = mapLengthDegrees(region, Number(config.tipperScale || 0.04));
  const period = Number(config.mtPeriod);
  const component = config.tipperComponent || "real";
  const convention = config.tipperConvention || "parkinson";
  const lines = [];
  for (const record of records) {
    const metrics = metricsForResponse(nearestResponse(record, period));
    const vector = metrics?.tipper?.[component];
    if (!vector || !Number.isFinite(vector.magnitude) || vector.magnitude <= 0) continue;
    const sign = convention === "wiese" ? 1 : -1;
    const dx = sign * vector.x * base;
    const dy = sign * vector.y * base;
    appendArrow(lines, record.lon, record.lat, record.lon + dx / Math.max(Math.cos(toRadians(record.lat)), 0.2), record.lat + dy);
  }
  return lines.join("\n") + (lines.length ? "\n" : "");
}

function buildPhaseTensorEllipses(records, config, region) {
  const base = mapLengthDegrees(region, Number(config.tensorScale || 0.022));
  const period = Number(config.mtPeriod);
  const lines = [];
  for (const record of records) {
    const metrics = metricsForResponse(nearestResponse(record, period));
    const tensor = metrics?.phaseTensor;
    if (!tensor || !Number.isFinite(tensor.phiMax) || !Number.isFinite(tensor.phiMin) || tensor.phiMax <= 0) continue;
    const major = base;
    const minor = base * Math.max(0.12, Math.min(1, Math.abs(tensor.phiMin / tensor.phiMax)));
    const color = tensorColor(tensor.beta);
    lines.push(`> -G${color} -W${Number(config.tensorPenWidth || 0.35).toFixed(2)}p,${config.tensorPenColor || "black"}`);
    for (let index = 0; index <= 48; index += 1) {
      const t = (Math.PI * 2 * index) / 48;
      const point = ellipsePoint(record.lon, record.lat, tensor.azimuth, major, minor, t);
      lines.push(`${point.lon.toFixed(8)}\t${point.lat.toFixed(8)}`);
    }
  }
  return lines.join("\n") + (lines.length ? "\n" : "");
}

function appendArrow(lines, lon1, lat1, lon2, lat2) {
  lines.push(">", `${lon1.toFixed(8)}\t${lat1.toFixed(8)}`, `${lon2.toFixed(8)}\t${lat2.toFixed(8)}`);
  const angle = Math.atan2(lat2 - lat1, (lon2 - lon1) * Math.max(Math.cos(toRadians((lat1 + lat2) / 2)), 0.2));
  const head = Math.hypot(lat2 - lat1, lon2 - lon1) * 0.22;
  for (const turn of [2.55, -2.55]) {
    const a = angle + turn;
    lines.push(">", `${lon2.toFixed(8)}\t${lat2.toFixed(8)}`, `${(lon2 + head * Math.cos(a)).toFixed(8)}\t${(lat2 + head * Math.sin(a)).toFixed(8)}`);
  }
}

function ellipsePoint(lon, lat, azimuth, major, minor, t) {
  const angle = toRadians(azimuth);
  const x = major * Math.cos(t);
  const y = minor * Math.sin(t);
  const east = x * Math.sin(angle) + y * Math.cos(angle);
  const north = x * Math.cos(angle) - y * Math.sin(angle);
  return { lon: lon + east / Math.max(Math.cos(toRadians(lat)), 0.2), lat: lat + north };
}

function segmentEndpoints(lon, lat, azimuth, length) {
  const angle = toRadians(azimuth);
  const east = Math.sin(angle) * length / 2;
  const north = Math.cos(angle) * length / 2;
  const lonScale = Math.max(Math.cos(toRadians(lat)), 0.2);
  return [
    { lon: lon - east / lonScale, lat: lat - north },
    { lon: lon + east / lonScale, lat: lat + north }
  ];
}

function mapLengthDegrees(region, fraction) {
  const width = Math.max(0.001, region.east - region.west);
  const height = Math.max(0.001, region.north - region.south);
  return Math.min(width, height) * Math.max(0.002, fraction);
}

function tensorColor(beta) {
  if (!Number.isFinite(beta)) return "#bdbdbd";
  const value = Math.max(-12, Math.min(12, beta));
  if (value < -6) return "#2b83ba";
  if (value < -2) return "#abdda4";
  if (value <= 2) return "#ffffbf";
  if (value <= 6) return "#fdae61";
  return "#d7191c";
}

function buildResponseCurveScript(records, config, outputDirectory, formats = ["png"]) {
  const station = records.find((record) => record.name === config.curveStation) || records.find((record) => record.mtResponses?.length);
  if (!station || !station.mtResponses?.length) throw new Error("当前数据没有可绘制的阻抗曲线。");
  const shell = process.platform === "win32" ? "bat" : "sh";
  const outputPrefix = shell === "bat" ? config.outputName || "mt_response_curve" : path.join(outputDirectory, config.outputName || "mt_response_curve");
  const gmt = resolveGMT();
  const environmentLines = gmtEnvironmentLines(gmt, shell);
  const curve = buildCurveFiles(station, outputDirectory);
  const q = (value) => quote(value);
  const f = (name) => shell === "bat" ? name : path.join(outputDirectory, name);
  const p = shell === "bat" ? "" : "  ";
  const topRegion = `${curve.xMin}/${curve.xMax}/${curve.rhoMin}/${curve.rhoMax}`;
  const bottomRegion = `${curve.xMin}/${curve.xMax}/-180/180`;
  const topFrame = `-Bxa0.5f0.1g0.5+l${q("log10 frequency (Hz)")} -Bya1f0.5g1+l${q("log10 rho_s (Ohm m)")} -BWSen+t${q(`${station.name} site: sounding curve`)}`;
  const bottomFrame = `-Bxa0.5f0.1g0.5+l${q("log10 frequency (Hz)")} -Bya45f15g45+l${q("phase (degree)")} -BWSen`;
  const plotWidth = "16c";
  const plotHeight = "5.0c";
  const topOffset = "7.0c";
  const pointSize = "0.16c";
  const commands = [
    `${p}gmt basemap -R${bottomRegion} -JX-${plotWidth}/${plotHeight} ${bottomFrame} -X1.6c -Y1.5c`,
    curve.hasPhaseXYError ? `${p}gmt plot ${q(f("curve_phase_xy_err.tsv"))} -W0.7p,black` : "",
    curve.hasPhaseYXError ? `${p}gmt plot ${q(f("curve_phase_yx_err.tsv"))} -W0.7p,black` : "",
    curve.hasPhaseXY ? `${p}gmt plot ${q(f("curve_phase_xy.tsv"))} -Ss${pointSize} -Gred -W0.45p,black` : "",
    curve.hasPhaseYX ? `${p}gmt plot ${q(f("curve_phase_yx.tsv"))} -Ss${pointSize} -Glimegreen -W0.45p,black` : "",
    `${p}gmt basemap -R${topRegion} -JX-${plotWidth}/${plotHeight} ${topFrame} -Y${topOffset}`,
    curve.hasRhoXYError ? `${p}gmt plot ${q(f("curve_rho_xy_err.tsv"))} -W0.7p,black` : "",
    curve.hasRhoYXError ? `${p}gmt plot ${q(f("curve_rho_yx_err.tsv"))} -W0.7p,black` : "",
    curve.hasRhoXY ? `${p}gmt plot ${q(f("curve_rho_xy.tsv"))} -Ss${pointSize} -Gred -W0.45p,black` : "",
    curve.hasRhoYX ? `${p}gmt plot ${q(f("curve_rho_yx.tsv"))} -Ss${pointSize} -Glimegreen -W0.45p,black` : ""
  ].filter(Boolean);
  if (shell === "bat") {
    return ["@echo off", "setlocal enabledelayedexpansion", "cd /d \"%~dp0\"", ...environmentLines,
      `gmt begin ${q(config.outputName || "mt_response_curve")} ${q(formats.join(","))}`,
      "gmt set MAP_FRAME_TYPE plain FONT_TITLE 18p FONT_LABEL 15p FONT_ANNOT_PRIMARY 11p MAP_GRID_PEN_PRIMARY 0.25p,gray80 MAP_FRAME_PEN 0.8p",
      ...commands,
      "gmt end", ""].filter((line) => line !== "-").join("\r\n");
  }
  return ["#!/usr/bin/env bash", "set -euo pipefail", ...environmentLines, "",
    `gmt begin ${q(outputPrefix)} ${q(formats.join(","))}`,
    "  gmt set MAP_FRAME_TYPE plain FONT_TITLE 18p FONT_LABEL 15p FONT_ANNOT_PRIMARY 11p MAP_GRID_PEN_PRIMARY 0.25p,gray80 MAP_FRAME_PEN 0.8p",
    ...commands,
    "gmt end", ""].join("\n");
}

function buildCurveFiles(station, outputDirectory) {
  const rows = station.mtResponses.map((response) => ({ response, metrics: metricsForResponse(response) }))
    .filter((item) => item.metrics?.impedance)
    .sort((a, b) => a.response.period - b.response.period);
  const series = {
    rhoXY: [],
    rhoYX: [],
    rhoXYError: [],
    rhoYXError: [],
    phaseXY: [],
    phaseYX: [],
    phaseXYError: [],
    phaseYXError: []
  };
  for (const item of rows) {
    const x = Math.log10(item.response.frequency);
    const impedance = item.metrics.impedance;
    const xyError = impedanceErrors(item.response.z?.xy, item.response.variance?.xy, item.response.period, impedance.rhoXY);
    const yxError = impedanceErrors(item.response.z?.yx, item.response.variance?.yx, item.response.period, impedance.rhoYX);
    if (Number.isFinite(impedance.rhoXY) && impedance.rhoXY > 0) {
      const value = Math.log10(impedance.rhoXY);
      series.rhoXY.push([x, value]);
      if (xyError.logRho) series.rhoXYError.push([x, value, xyError.logRho]);
    }
    if (Number.isFinite(impedance.rhoYX) && impedance.rhoYX > 0) {
      const value = Math.log10(impedance.rhoYX);
      series.rhoYX.push([x, value]);
      if (yxError.logRho) series.rhoYXError.push([x, value, yxError.logRho]);
    }
    if (Number.isFinite(impedance.phaseXY)) {
      series.phaseXY.push([x, impedance.phaseXY]);
      if (xyError.phase) series.phaseXYError.push([x, impedance.phaseXY, xyError.phase]);
    }
    if (Number.isFinite(impedance.phaseYX)) {
      series.phaseYX.push([x, impedance.phaseYX]);
      if (yxError.phase) series.phaseYXError.push([x, impedance.phaseYX, yxError.phase]);
    }
  }
  writeXY(path.join(outputDirectory, "curve_rho_xy.tsv"), series.rhoXY);
  writeXY(path.join(outputDirectory, "curve_rho_yx.tsv"), series.rhoYX);
  writeErrorSegments(path.join(outputDirectory, "curve_rho_xy_err.tsv"), series.rhoXYError);
  writeErrorSegments(path.join(outputDirectory, "curve_rho_yx_err.tsv"), series.rhoYXError);
  writeXY(path.join(outputDirectory, "curve_phase_xy.tsv"), series.phaseXY);
  writeXY(path.join(outputDirectory, "curve_phase_yx.tsv"), series.phaseYX);
  writeErrorSegments(path.join(outputDirectory, "curve_phase_xy_err.tsv"), series.phaseXYError);
  writeErrorSegments(path.join(outputDirectory, "curve_phase_yx_err.tsv"), series.phaseYXError);
  const xs = Object.values(series).flat().map((row) => row[0]);
  const rhos = [...series.rhoXY, ...series.rhoYX, ...errorExtents(series.rhoXYError), ...errorExtents(series.rhoYXError)].map((row) => row[1]);
  return {
    xMin: floorPad(Math.min(...xs), 0.2),
    xMax: ceilPad(Math.max(...xs), 0.2),
    rhoMin: floorPad(Math.min(...rhos), 0.5),
    rhoMax: ceilPad(Math.max(...rhos), 0.5),
    hasRhoXY: series.rhoXY.length > 0,
    hasRhoYX: series.rhoYX.length > 0,
    hasRhoXYError: series.rhoXYError.length > 0,
    hasRhoYXError: series.rhoYXError.length > 0,
    hasPhaseXY: series.phaseXY.length > 0,
    hasPhaseYX: series.phaseYX.length > 0,
    hasPhaseXYError: series.phaseXYError.length > 0,
    hasPhaseYXError: series.phaseYXError.length > 0
  };
}

function writeXY(filePath, rows) {
  fs.writeFileSync(filePath, rows.map((row) => `${row[0].toFixed(6)}\t${row[1].toFixed(6)}`).join("\n") + "\n", "utf8");
}

function writeErrorSegments(filePath, rows) {
  const lines = [];
  for (const [x, y, error] of rows) {
    lines.push(">", `${x.toFixed(6)}\t${(y - error).toFixed(6)}`, `${x.toFixed(6)}\t${(y + error).toFixed(6)}`);
  }
  fs.writeFileSync(filePath, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
}

function errorExtents(rows) {
  return rows.flatMap(([x, y, error]) => [[x, y - error], [x, y + error]]);
}

function impedanceErrors(z, variance, period, rho) {
  if (!Number.isFinite(variance) || variance <= 0 || !Number.isFinite(z?.re) || !Number.isFinite(z?.im)) return {};
  const amplitude = Math.hypot(z.re, z.im);
  if (!Number.isFinite(amplitude) || amplitude <= 0) return {};
  const sigma = Math.sqrt(variance);
  const rhoSigma = Number.isFinite(period) && Number.isFinite(rho) && rho > 0 ? 0.4 * period * amplitude * sigma : NaN;
  return {
    logRho: Number.isFinite(rhoSigma) ? Math.min(1.2, Math.max(0.02, rhoSigma / Math.max(rho, 1e-12) / Math.log(10))) : 0,
    phase: Math.min(90, Math.max(2, toDegrees(Math.atan2(sigma, amplitude))))
  };
}

function floorPad(value, pad) {
  return Number.isFinite(value) ? Math.floor((value - pad) * 10) / 10 : -1;
}

function ceilPad(value, pad) {
  return Number.isFinite(value) ? Math.ceil((value + pad) * 10) / 10 : 1;
}

function terrainScriptParts(config, region, outputDirectory, shell) {
  if (!config.showTerrain) return { preCommands: [], imageCommand: "" };
  const paths = terrainPaths(outputDirectory, config, region);
  fs.mkdirSync(paths.directory, { recursive: true });
  const configuredGrid = config.terrainGridPath && fs.existsSync(config.terrainGridPath) ? config.terrainGridPath : "";
  const localGrid = config.localTerrainGridPath && fs.existsSync(config.localTerrainGridPath) ? config.localTerrainGridPath : configuredGrid;
  const grid = localGrid || paths.gridPath;
  const shade = config.terrainShadePath && fs.existsSync(config.terrainShadePath) ? config.terrainShadePath : paths.shadePath;
  const remote = terrainRemoteName(config.terrainResolution);
  const intensity = terrainIntensity(config.terrainIntensity);
  const cpt = terrainCpt(config.terrainCpt);
  const prefix = shell === "bat" ? "" : "  ";
  const preCommands = [];
  preCommands.push(`${prefix}gmt set GMT_DATA_SERVER oceania`);
  preCommands.push(`${prefix}gmt set GMT_DATA_UPDATE_INTERVAL ${config.terrainAllowDownload ? "1d" : "off"}`);
  if (localGrid) {
    if (!fs.existsSync(shade)) preCommands.push(`${prefix}gmt grdgradient ${quote(grid)} -A315 -Ne${intensity} -G${quote(shade)}`);
  } else if (!fs.existsSync(grid) || !fs.existsSync(shade)) {
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
  if (!parsed || parsed.east <= parsed.west || parsed.north <= parsed.south) {
    return {
      cells: 0,
      xCells: 0,
      yCells: 0,
      gridBytes: 0,
      workingBytes: 0,
      blocked: false,
      warning: "",
      recommendedResolution: "",
      recommendedLabel: "",
      label: "请先导入点位或设置有效范围"
    };
  }
  const { xCells, yCells, cells } = terrainCellStats(parsed, resolution);
  const gridBytes = cells * 2;
  const workingBytes = gridBytes * 2;
  const safety = terrainSafety(parsed, resolution, cells);
  if (terrainSource(resolution) === "srtm") {
    const tileCount = srtmTileCount(parsed);
    const downloadBytes = tileCount * 8 * 1024 * 1024;
    const cacheBytes = tileCount * 26 * 1024 * 1024;
    const baseLabel = `预计下载约 ${formatBytes(downloadBytes)} SRTM 高程瓦片，解压缓存约 ${formatBytes(cacheBytes)}，本地网格约 ${formatBytes(workingBytes)}`;
    return {
      cells,
      xCells,
      yCells,
      gridBytes,
      workingBytes: workingBytes + downloadBytes,
      downloadBytes,
      cacheBytes,
      tileCount,
      ...safety,
      label: [baseLabel, safety.warning].filter(Boolean).join("。")
    };
  }
  const baseLabel = `${formatBytes(workingBytes)} 本地工作文件，GMT 实际下载量取决于分块缓存`;
  return {
    cells,
    xCells,
    yCells,
    gridBytes,
    workingBytes,
    ...safety,
    label: [baseLabel, safety.warning].filter(Boolean).join("。")
  };
}

function terrainCellStats(region, resolution) {
  const seconds = terrainResolutionSeconds(resolution);
  const xCells = Math.max(2, Math.ceil((region.east - region.west) * 3600 / seconds));
  const yCells = Math.max(2, Math.ceil((region.north - region.south) * 3600 / seconds));
  return { xCells, yCells, cells: xCells * yCells };
}

function terrainSafety(region, resolution, cells) {
  if (cells <= TERRAIN_WARNING_CELL_LIMIT) {
    return { blocked: false, warning: "", recommendedResolution: "", recommendedLabel: "" };
  }
  const recommendedResolution = recommendedTerrainResolution(region);
  const recommendedLabel = recommendedResolution ? terrainResolutionInfo(recommendedResolution).label : "";
  const detail = `当前范围在 ${terrainResolutionInfo(resolution).label} 下约 ${formatCount(cells)} 个地形格点`;
  if (cells > TERRAIN_SAFE_CELL_LIMIT) {
    const advice = recommendedLabel ? `建议改用 ${recommendedLabel}，或先缩小范围后再用高分辨率` : "建议先缩小范围后再使用高分辨率";
    return {
      blocked: true,
      warning: `${detail}，超过安全上限 ${formatCount(TERRAIN_SAFE_CELL_LIMIT)}，为避免软件卡死已停止准备。${advice}`,
      recommendedResolution,
      recommendedLabel
    };
  }
  return {
    blocked: false,
    warning: `${detail}，处理可能较慢；若软件变慢，建议改用 ${coarserRecommendedLabel(region, resolution) || "更低分辨率"} 或缩小范围`,
    recommendedResolution,
    recommendedLabel
  };
}

function recommendedTerrainResolution(region) {
  return TERRAIN_RECOMMENDATION_ORDER.find((resolution) => {
    return terrainCellStats(region, resolution).cells <= TERRAIN_SAFE_CELL_LIMIT;
  }) || "";
}

function coarserRecommendedLabel(region, currentResolution) {
  const currentSeconds = terrainResolutionSeconds(currentResolution);
  const resolution = TERRAIN_RECOMMENDATION_ORDER.find((candidate) => {
    return terrainResolutionSeconds(candidate) > currentSeconds && terrainCellStats(region, candidate).cells <= TERRAIN_SAFE_CELL_LIMIT;
  });
  return resolution ? terrainResolutionInfo(resolution).label : "";
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
      String(config.terrainIntensity || "0.65"),
      String(config.localTerrainGridPath || config.terrainGridPath || "")
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

function formatCount(value) {
  const count = Math.max(0, Number(value) || 0);
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(Math.round(count));
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

function toDegrees(radians) {
  return radians * 180 / Math.PI;
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
  DEFAULT_OVERLAY_FILE,
  DEFAULT_LEGEND_FILE,
  needsNativeTextRendering
};
