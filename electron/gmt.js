const fs = require("fs");
const https = require("https");
const path = require("path");
const { execFileSync, spawn, spawnSync } = require("child_process");

const GMT_MAC_VERSION = "6.5.0";
const GMT_WINDOWS_VERSION = "6.6.0";

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
  const lonPad = Math.max((east - west) * 0.12, 0.03);
  const latPad = Math.max((north - south) * 0.12, 0.03);
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
  const gridPrefix = config.showGrid ? "g" : "";
  const frameOption = `-B${gridPrefix}${config.frame}`;
  const titleOption = (config.title || "").trim() ? ` -B+t${quote(config.title)}` : "";
  const outputPrefix = path.join(outputDirectory, config.outputName || "mt_point_map");
  const labelFont = `${Number(config.labelFontSize).toFixed(1)}p,Helvetica,${config.labelColor}`;
  const offset = `${Number(config.labelDX).toFixed(3)}c/${Number(config.labelDY).toFixed(3)}c`;
  const shell = process.platform === "win32" ? "bat" : "sh";
  const gmt = resolveGMT();
  const environmentLines = gmtEnvironmentLines(gmt, shell);
  if (shell === "bat") {
    return [
      "@echo off",
      "setlocal enabledelayedexpansion",
      ...environmentLines,
      `gmt begin ${quote(outputPrefix)} ${quote(formats.join(","))}`,
      "gmt set MAP_FRAME_TYPE plain FONT_ANNOT_PRIMARY 9p FONT_LABEL 10p FORMAT_GEO_MAP ddd:mm:ssF",
      `gmt basemap -R${region} -J${config.projection} ${frameOption}${titleOption}`,
      `gmt coast -R${region} -J${config.projection} -Di -Ggray95 -Swhite -W0.25p,gray45`,
      `gmt plot ${quote(pointsPath)} -R${region} -J${config.projection} -S${config.pointSymbol}${Number(config.pointSize).toFixed(3)}c -G${quote(config.pointFill)} -W${Number(config.pointPenWidth).toFixed(3)}p,${config.pointPenColor}`,
      config.showLabels ? `gmt text ${quote(labelsPath)} -R${region} -J${config.projection} -F+f${quote(labelFont)}+jLB -D${offset}` : "",
      config.showScale ? `gmt basemap -R${region} -J${config.projection} -LjBR+w20k+o0.5c/0.5c+f+lkm` : "",
      config.showNorthArrow ? `gmt basemap -R${region} -J${config.projection} -TdjTR+w1.0c+o0.4c/0.4c` : "",
      "gmt end show",
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
    `  gmt basemap -R${region} -J${config.projection} ${frameOption}${titleOption}`,
    `  gmt coast -R${region} -J${config.projection} -Di -Ggray95 -Swhite -W0.25p,gray45`,
    `  gmt plot ${quote(pointsPath)} -R${region} -J${config.projection} -S${config.pointSymbol}${Number(config.pointSize).toFixed(3)}c -G${quote(config.pointFill)} -W${Number(config.pointPenWidth).toFixed(3)}p,${config.pointPenColor}`,
    config.showLabels ? `  gmt text ${quote(labelsPath)} -R${region} -J${config.projection} -F+f${quote(labelFont)}+jLB -D${offset}` : "",
    config.showScale ? `  gmt basemap -R${region} -J${config.projection} -LjBR+w20k+o0.5c/0.5c+f+lkm` : "",
    config.showNorthArrow ? `  gmt basemap -R${region} -J${config.projection} -TdjTR+w1.0c+o0.4c/0.4c` : "",
    "gmt end show",
    ""
  ].filter(Boolean).join("\n");
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
  saveScript,
  runGMT
};
