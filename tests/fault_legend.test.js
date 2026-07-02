const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { autodetectAndParse, buildFaultOverlay, recolorPen, summarizeFaultFile } = require("../electron/faults");
const { buildLegendSpec, legendCommand, normalizeLegendConfig } = require("../electron/legend");
const { buildScript } = require("../electron/gmt");

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
    { label: "MT station", symbol: "point", fill: "#d7191c", pen: "0.35p,black", size: "0.22c" },
    { label: "Faults", symbol: "line", pen: "0.9p,#ff0000" }
  ]);
  assert(legend.includes("S 0.14c c 0.22c #d7191c 0.35p,black 0.45c MT station"));
  assert(legend.includes("S 0.14c - 0.42c - 0.9p,#ff0000 0.45c Faults"));

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
    showScale: true,
    showNorthArrow: true,
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
    legend: { show: true, title: "Legend", position: "n0.98/0.98+jTR", includeFaults: true }
  }, scriptDir, ["png"]);

  assert(script.includes("Structural line overlays"));
  assert(script.includes("gmt plot"));
  assert(script.includes("gmt legend"));
  assert(!script.includes("...(config"));
  assert(fs.existsSync(path.join(scriptDir, "fault_overlays.tsv")));
  assert(fs.existsSync(path.join(scriptDir, "map_legend.txt")));

  console.log("Fault overlay and legend tests passed");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
