const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { autodetectAndParse, buildFaultOverlay, recolorPen, summarizeFaultFile } = require("../electron/faults");
const { buildLegendEntries, buildLegendSpec, legendCommand, normalizeLegendConfig } = require("../electron/legend");
const { buildScript, terrainEstimate, terrainPaths } = require("../electron/gmt");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mt-gmt-fault-test-"));

try {
  const gmtFile = path.join(tmp, "faults.gmt");
  fs.writeFileSync(gmtFile, [
    "> -W1.2p,blue,- # F1",
    "101.0 35.0",
    "101.2 35.1",
    ">",
    "101.3 35.2",
    "101.5 35.3",
    ""
  ].join("\n"), "utf8");

  const blnFile = path.join(tmp, "faults.bln");
  fs.writeFileSync(blnFile, [
    "3,0",
    "102.0,36.0",
    "102.2,36.1",
    "102.4,36.2",
    ""
  ].join("\n"), "utf8");

  const gmtParsed = autodetectAndParse(gmtFile);
  assert.strictEqual(gmtParsed.sourceFormat, "gmt_multisegment");
  assert.strictEqual(gmtParsed.segments.length, 2);
  assert.strictEqual(gmtParsed.segments[0].style.pen, "1.2p,blue,-");
  assert.strictEqual(recolorPen("1.2p,blue,-", "#d7191c"), "1.2p,#d7191c,-");

  const blnParsed = autodetectAndParse(blnFile);
  assert.strictEqual(blnParsed.sourceFormat, "bln");
  assert.strictEqual(blnParsed.segments.length, 1);

  const summary = summarizeFaultFile(gmtFile, "#ff0000");
  assert.strictEqual(summary.segmentCount, 2);
  assert.strictEqual(summary.pointCount, 4);

  const overlay = buildFaultOverlay([{ path: gmtFile, name: "Faults", color: "#ff0000" }], tmp);
  const overlayText = fs.readFileSync(overlay.path, "utf8");
  assert(overlayText.includes("-W1.2p,#ff0000,-"));
  assert(overlayText.includes("101.00000000\t35.00000000"));

  const legend = buildLegendSpec([
    { label: "Station", symbol: "point", gmtSymbol: "t", fill: "#d7191c", pen: "0.35p,black", size: "0.22c" },
    { label: "Faults", symbol: "line", pen: "0.9p,#ff0000" }
  ]);
  assert(legend.includes("S 0.14c t 0.22c #d7191c 0.35p,black 0.45c Station"));
  assert(legend.includes("S 0.14c - 0.42c - 0.9p,#ff0000 0.45c Faults"));
  const reversedLegend = buildLegendSpec(buildLegendEntries({
    pointSymbol: "c",
    pointFill: "#d7191c",
    pointPenWidth: 0.35,
    pointPenColor: "black",
    pointSize: 0.22,
    faultLayers: [{ path: gmtFile, name: "Faults", color: "#ff0000" }],
    legend: { stationLabel: "Station", includeFaults: true, order: "overlay-first" }
  }));
  assert(reversedLegend.indexOf("Faults") < reversedLegend.indexOf("Station"));

  const styledLegend = normalizeLegendConfig({
    width: "5.6c",
    titleFontSize: 13,
    labelFontSize: 10,
    textColor: "#222222",
    backgroundColor: "#f4f1ea",
    backgroundTransparency: 20,
    borderColor: "#335577",
    borderWidth: 0.8,
    position: "n0.250/0.700+jTL"
  });
  assert.strictEqual(styledLegend.titleFont, "13.0p,Helvetica-Bold,#222222");
  assert.strictEqual(styledLegend.labelFont, "10.0p,Helvetica,#222222");
  assert.strictEqual(styledLegend.frame, "+p0.80p,#335577+g#f4f1ea@20+r2p");
  assert(legendCommand("map_legend.txt", "100/101/35/36", "M16c", "sh", styledLegend).includes("-Dn0.250/0.700+jTL+w5.6c -F+p0.80p,#335577+g#f4f1ea@20+r2p+c0.12c"));

  const scriptDir = path.join(tmp, "script-output");
  const script = buildScript([
    { name: "A01", lon: 101.0, lat: 35.0 },
    { name: "A02", lon: 101.2, lat: 35.1 }
  ], {
    title: "MT Survey Stations",
    plotType: "stationMap",
    region: "100.9/101.3/34.9/35.2",
    projection: "M16c",
    frame: "af",
    showGrid: true,
    showLabels: true,
    labelMode: "everyN",
    labelEvery: 2,
    showScale: true,
    scalePosition: "BL",
    showNorthArrow: true,
    northPosition: "TL",
    pointSymbol: "c",
    pointSize: 0.22,
    pointFill: "#d7191c",
    pointPenWidth: 0.35,
    pointPenColor: "black",
    labelFontSize: 8,
    labelColor: "black",
    labelDX: 0.08,
    labelDY: 0.08,
    showTerrain: false,
    outputName: "mt_point_map",
    faultLayers: [{ path: gmtFile, name: "Faults", color: "#ff0000" }],
    legend: { show: true, title: "Legend", stationLabel: "Site", position: "n0.98/0.98+jTR", includeFaults: true }
  }, scriptDir, ["png"]);

  assert(script.includes("Structural line overlays"));
  assert(script.includes("export GMT_DATA_SERVER=https://mirrors.ustc.edu.cn/gmtdata"));
  assert(script.includes("gmt begin"));
  assert(script.includes("png E300"));
  assert(script.includes("gmt plot"));
  assert(script.includes("-LjBL"));
  assert(script.includes("-TdjTL"));
  assert(script.includes("gmt legend"));
  assert(!script.includes("...(config"));
  assert.strictEqual(fs.readFileSync(path.join(scriptDir, "stations_labels.tsv"), "utf8").trim().split(/\n/).length, 1);
  assert(fs.existsSync(path.join(scriptDir, "fault_overlays.tsv")));
  assert(fs.existsSync(path.join(scriptDir, "map_legend.txt")));
  assert(fs.readFileSync(path.join(scriptDir, "map_legend.txt"), "utf8").includes("0.45c Site"));

  const strikeScriptDir = path.join(tmp, "strike-script-output");
  const strikeScript = buildScript([
    { name: "S01", lon: 101.0, lat: 35.0, mtResponses: [{ period: 1, z: { xy: { re: 1, im: 2 }, yx: { re: -2, im: -1 } }, provided: { strike: 35 } }] },
    { name: "S02", lon: 101.2, lat: 35.1, mtResponses: [{ period: 1, z: { xy: { re: 1, im: 1 }, yx: { re: -1, im: -1 } }, provided: { strike: 65 } }] }
  ], {
    title: "MT Strike",
    plotType: "strikeMap",
    mtPeriod: 1,
    region: "100.9/101.3/34.9/35.2",
    projection: "M16c",
    frame: "af",
    showGrid: true,
    showLabels: false,
    showScale: false,
    showNorthArrow: false,
    pointSymbol: "s",
    pointSize: 0.24,
    pointFill: "#2b83ba",
    pointPenWidth: 0.5,
    pointPenColor: "#333333",
    labelFontSize: 8,
    labelColor: "black",
    labelDX: 0.08,
    labelDY: 0.08,
    showTerrain: false,
    strikeColor: "#984ea3",
    strikeWidth: 1.6,
    outputName: "mt_strike_map",
    faultLayers: [],
    legend: { show: true, title: "Legend", stationLabel: "Site", overlayLabel: "Impedance strike", position: "n0.98/0.98+jTR", includeFaults: true }
  }, strikeScriptDir, ["png"]);
  const strikeLegend = fs.readFileSync(path.join(strikeScriptDir, "map_legend.txt"), "utf8");
  assert(strikeScript.includes("-W1.60p,#984ea3"));
  assert(strikeLegend.includes("S 0.14c s 0.24c #2b83ba 0.50p,#333333 0.45c Site"));
  assert(strikeLegend.includes("S 0.14c - 0.42c - 1.60p,#984ea3 0.45c Impedance strike"));

  const vectorScriptDir = path.join(tmp, "vector-script-output");
  const vectorScript = buildScript([
    { name: "V01", lon: 101.0, lat: 35.0 },
    { name: "V02", lon: 101.2, lat: 35.1 }
  ], {
    title: "矢量图测试",
    forceGMTTitle: true,
    plotType: "stationMap",
    region: "100.9/101.3/34.9/35.2",
    projection: "M16c",
    frame: "af",
    showGrid: true,
    showLabels: false,
    showScale: false,
    showNorthArrow: false,
    pointSymbol: "c",
    pointSize: 0.22,
    pointFill: "#d7191c",
    pointPenWidth: 0.35,
    pointPenColor: "black",
    labelFontSize: 8,
    labelColor: "black",
    labelDX: 0.08,
    labelDY: 0.08,
    showTerrain: true,
    terrainResolution: "06m",
    terrainIntensity: 0.65,
    terrainAllowDownload: true,
    terrainDataServer: "https://mirrors.ustc.edu.cn/gmtdata",
    outputName: "mt_vector_map",
    pngDpi: 450,
    faultLayers: [],
    legend: { show: false }
  }, vectorScriptDir, ["png", "pdf", "eps"]);
  assert(vectorScript.includes("gmt begin"));
  assert(vectorScript.includes("png,pdf,eps E450"));
  assert(vectorScript.includes("gmt set GMT_DATA_SERVER https://mirrors.ustc.edu.cn/gmtdata"));
  assert(vectorScript.includes("-B+"));

  const terrainConfigBase = {
    region: "100.9/101.3/34.9/35.2",
    terrainResolution: "06m",
    terrainIntensity: 0.65,
    terrainGridPath: path.join(tmp, "preview-temp-grid.nc")
  };
  const cacheA = terrainPaths(tmp, terrainConfigBase);
  const cacheB = terrainPaths(tmp, {
    ...terrainConfigBase,
    terrainGridPath: path.join(tmp, "other-temp-grid.nc")
  });
  const cacheLocal = terrainPaths(tmp, {
    ...terrainConfigBase,
    localTerrainGridPath: path.join(tmp, "local-terrain.grd")
  });
  assert.strictEqual(cacheA.key, cacheB.key);
  assert.notStrictEqual(cacheA.key, cacheLocal.key);

  const largeSrtmEstimate = terrainEstimate("112.209316/120.913323/42.650685/46.413555", "03s");
  assert.strictEqual(largeSrtmEstimate.blocked, false);
  assert(largeSrtmEstimate.warning.includes("处理会比较慢"));
  assert(!largeSrtmEstimate.warning.includes("安全上限"));
  assert(!largeSrtmEstimate.warning.includes("停止准备"));

  console.log("Fault overlay and legend tests passed");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
