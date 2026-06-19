const fs = require("fs");
const path = require("path");
const { execFileSync, spawn, spawnSync } = require("child_process");

function gmtAvailable() {
  const command = process.platform === "win32" ? "where" : "which";
  try {
    execFileSync(command, ["gmt"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
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
  if (process.platform === "darwin") {
    return {
      platform: "macOS",
      canAutoInstall: commandAvailable("brew"),
      autoCommand: "brew install gmt",
      manualCommand: "brew install gmt",
      message: commandAvailable("brew")
        ? "可以调用 Homebrew 安装 GMT。"
        : "未检测到 Homebrew，请先安装 Homebrew，或打开 GMT 官方下载页手动安装。"
    };
  }
  if (process.platform === "win32") {
    return {
      platform: "Windows",
      canAutoInstall: commandAvailable("winget"),
      autoCommand: "winget install --id GenericMappingTools.gmt --exact --accept-package-agreements --accept-source-agreements",
      manualCommand: "winget install --id GenericMappingTools.gmt --exact",
      message: commandAvailable("winget")
        ? "可以调用 winget 安装 GMT 官方 Windows 包。"
        : "未检测到 winget，请打开 GMT 官方下载页手动下载安装包。"
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

function startGMTInstall() {
  const plan = installPlan();
  if (!plan.canAutoInstall) {
    return { ok: false, message: plan.message, plan };
  }
  if (process.platform === "darwin") {
    const script = `${plan.autoCommand}; echo; echo "GMT 安装流程结束。可以关闭此窗口。"; read -n 1 -s -r -p "按任意键关闭"`;
    spawn("osascript", ["-e", `tell application "Terminal" to do script ${JSON.stringify(script)}`], {
      detached: true,
      stdio: "ignore"
    }).unref();
    return { ok: true, message: "已在终端中启动 Homebrew 安装 GMT。", plan };
  }
  if (process.platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "cmd.exe", "/k", plan.autoCommand], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    }).unref();
    return { ok: true, message: "已打开命令行并启动 winget 安装 GMT。", plan };
  }
  return { ok: false, message: "当前系统暂不支持自动安装。", plan };
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
  const outputPrefix = path.join(outputDirectory, config.outputName || "mt_point_map");
  const labelFont = `${Number(config.labelFontSize).toFixed(1)}p,Helvetica,${config.labelColor}`;
  const offset = `${Number(config.labelDX).toFixed(3)}c/${Number(config.labelDY).toFixed(3)}c`;
  const shell = process.platform === "win32" ? "bat" : "sh";
  if (shell === "bat") {
    return [
      "@echo off",
      "setlocal enabledelayedexpansion",
      `gmt begin ${quote(outputPrefix)} ${quote(formats.join(","))}`,
      "gmt set MAP_FRAME_TYPE plain FONT_ANNOT_PRIMARY 9p FONT_LABEL 10p FORMAT_GEO_MAP ddd:mm:ssF",
      `gmt basemap -R${region} -J${config.projection} -B${gridPrefix}${config.frame}+t${quote(config.title)}`,
      "gmt coast -R -J -Di -Ggray95 -Swhite -W0.25p,gray45",
      `gmt plot ${quote(pointsPath)} -R -J -S${config.pointSymbol}${Number(config.pointSize).toFixed(3)}c -G${quote(config.pointFill)} -W${Number(config.pointPenWidth).toFixed(3)}p,${config.pointPenColor}`,
      config.showLabels ? `gmt text ${quote(labelsPath)} -R -J -F+f${quote(labelFont)}+jLB -D${offset}` : "",
      config.showScale ? "gmt basemap -R -J -LjBR+w20k+o0.5c/0.5c+f+lkm" : "",
      config.showNorthArrow ? "gmt basemap -R -J -TdjTR+w1.0c+o0.4c/0.4c" : "",
      "gmt end show",
      ""
    ].filter(Boolean).join("\r\n");
  }
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    `gmt begin ${quote(outputPrefix)} ${quote(formats.join(","))}`,
    "  gmt set MAP_FRAME_TYPE plain FONT_ANNOT_PRIMARY 9p FONT_LABEL 10p FORMAT_GEO_MAP ddd:mm:ssF",
    `  gmt basemap -R${region} -J${config.projection} -B${gridPrefix}${config.frame}+t${quote(config.title)}`,
    "  gmt coast -R -J -Di -Ggray95 -Swhite -W0.25p,gray45",
    `  gmt plot ${quote(pointsPath)} -R -J -S${config.pointSymbol}${Number(config.pointSize).toFixed(3)}c -G${quote(config.pointFill)} -W${Number(config.pointPenWidth).toFixed(3)}p,${config.pointPenColor}`,
    config.showLabels ? `  gmt text ${quote(labelsPath)} -R -J -F+f${quote(labelFont)}+jLB -D${offset}` : "",
    config.showScale ? "  gmt basemap -R -J -LjBR+w20k+o0.5c/0.5c+f+lkm" : "",
    config.showNorthArrow ? "  gmt basemap -R -J -TdjTR+w1.0c+o0.4c/0.4c" : "",
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
  if (!gmtAvailable()) {
    return {
      ok: false,
      scriptPath,
      message: "未找到 GMT 命令。请先安装 GMT 6；macOS 可用 brew install gmt，Windows 请安装 GMT 官方 Windows 版并加入 PATH。"
    };
  }
  const command = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
  const args = process.platform === "win32" ? ["/c", scriptPath] : [scriptPath];
  const result = spawnSync(command, args, { cwd: outputDirectory, encoding: "utf8" });
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

module.exports = {
  gmtAvailable,
  installPlan,
  startGMTInstall,
  defaultOutputDirectory,
  autoRegion,
  buildScript,
  saveScript,
  runGMT
};
