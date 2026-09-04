const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { buildScript } = require("../electron/gmt");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mt-gmt-plots-test-"));

function config(plotType, outputName, extra = {}) {
  return {
    title: "MT plot test",
    plotType,
    mtPeriod: 1,
    curveStation: "S01",
    region: "100.9/101.1/34.9/35.1",
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
    showTerrain: false,
    strikeLength: 0.04,
    strikeColor: "blue",
    tensorScale: 0.04,
    tensorPenColor: "black",
    tipperComponent: "real",
    tipperConvention: "wiese",
    tipperScale: 0.055,
    tipperColor: "purple",
    outputName,
    faultLayers: [],
    legend: { show: false },
    ...extra
  };
}

function response(period, multiplier = 1) {
  return {
    period,
    frequency: 1 / period,
    z: {
      xx: { re: 1 * multiplier, im: 1 * multiplier },
      xy: { re: 0, im: 2 * multiplier },
      yx: { re: 0, im: 0 },
      yy: { re: 1 * multiplier, im: 1 * multiplier }
    },
    tipper: {
      x: { re: 1, im: 0 },
      y: { re: 0, im: 1 }
    },
    provided: {}
  };
}

function conventionalResponse(period, scale) {
  return {
    period,
    frequency: 1 / period,
    z: {
      xy: { re: scale, im: scale },
      yx: { re: -scale, im: -scale }
    },
    provided: {}
  };
}

function azimuthBetween(a, b, latitude) {
  const east = (b[0] - a[0]) * Math.cos(latitude * Math.PI / 180);
  const north = b[1] - a[1];
  return ((Math.atan2(east, north) * 180 / Math.PI) % 180 + 180) % 180;
}

try {
  const station = {
    name: "S01",
    lon: 101,
    lat: 35,
    mtResponses: [response(1)]
  };

  const strikeDir = path.join(tmp, "strike");
  const strikeScript = buildScript([station], config("strikeMap", "strike"), strikeDir, ["png"]);
  const strikeRows = fs.readFileSync(path.join(strikeDir, "mt_strike_segments.tsv"), "utf8").trim().split(/\n/);
  const strikeA = strikeRows[1].split(/\s+/).map(Number);
  const strikeB = strikeRows[2].split(/\s+/).map(Number);
  assert(Math.abs(azimuthBetween(strikeA, strikeB, 35) - 22.5) < 0.001, "strike must follow phase-tensor alpha-beta azimuth");
  assert(strikeScript.includes("mt_strike_segments.tsv"));
  assert(!strikeScript.includes("mt_phase_tensor_ellipses.tsv"));
  assert(!strikeScript.includes("mt_tipper_arrows.tsv"));

  const tensorDir = path.join(tmp, "tensor");
  const tensorScript = buildScript([station], config("phaseTensorMap", "tensor"), tensorDir, ["png"]);
  const tensorRows = fs.readFileSync(path.join(tensorDir, "mt_phase_tensor_ellipses.tsv"), "utf8").trim().split(/\n/);
  const firstEllipsePoint = tensorRows[1].split(/\s+/).map(Number);
  const quarterEllipsePoint = tensorRows[13].split(/\s+/).map(Number);
  assert(Math.abs(azimuthBetween([101, 35], firstEllipsePoint, 35) - 22.5) < 0.001, "phase-tensor ellipse major axis must use alpha-beta azimuth");
  const distance = (point) => Math.hypot((point[0] - 101) * Math.cos(35 * Math.PI / 180), point[1] - 35);
  const ellipseRatio = distance(quarterEllipsePoint) / distance(firstEllipsePoint);
  assert(Math.abs(ellipseRatio - (Math.SQRT2 - 1) / (Math.SQRT2 + 1)) < 1e-5, "phase-tensor ellipse axes must use principal tensor values, not phase-angle ratios");
  assert(tensorScript.includes("mt_phase_tensor_ellipses.tsv"));
  assert(!tensorScript.includes("mt_strike_segments.tsv"));
  assert(!tensorScript.includes("mt_tipper_arrows.tsv"));

  const tipperDir = path.join(tmp, "tipper-wiese");
  const tipperScript = buildScript([station], config("tipperMap", "tipper_wiese"), tipperDir, ["png"]);
  const tipperRow = fs.readFileSync(path.join(tipperDir, "mt_tipper_arrows.tsv"), "utf8").trim().split(/\s+/);
  assert.strictEqual(tipperRow.length, 4);
  assert.strictEqual(Number(tipperRow[2]), 0, "positive Tx must point north under the Wiese convention");
  assert.strictEqual(tipperRow[3], "2.6400c");
  assert(tipperScript.includes("-SV0.18c+e+a30+h0.5"));
  assert(!tipperScript.includes("mt_strike_segments.tsv"));
  assert(!tipperScript.includes("mt_phase_tensor_ellipses.tsv"));

  const parkinsonDir = path.join(tmp, "tipper-parkinson");
  buildScript([station], config("tipperMap", "tipper_parkinson", { tipperConvention: "parkinson" }), parkinsonDir, ["png"]);
  const parkinsonRow = fs.readFileSync(path.join(parkinsonDir, "mt_tipper_arrows.tsv"), "utf8").trim().split(/\s+/);
  assert.strictEqual(Number(parkinsonRow[2]), 180, "Parkinson arrow must reverse the Wiese direction");

  const emptyTipperDir = path.join(tmp, "tipper-empty");
  const noTipper = { ...station, mtResponses: [{ ...response(1), tipper: {} }] };
  const emptyTipperScript = buildScript([noTipper], config("tipperMap", "tipper_empty"), emptyTipperDir, ["png"]);
  assert.strictEqual(fs.readFileSync(path.join(emptyTipperDir, "mt_tipper_arrows.tsv"), "utf8"), "");
  assert(!emptyTipperScript.includes("mt_tipper_arrows.tsv"), "empty Tipper data must not emit a misleading arrow command");

  const curveDir = path.join(tmp, "curve");
  const curveStation = {
    name: "S01",
    lon: 101,
    lat: 35,
    mtResponses: [conventionalResponse(0.1, 1), conventionalResponse(1, 2), conventionalResponse(10, 3)]
  };
  const curveScript = buildScript([curveStation], config("responseCurve", "curve"), curveDir, ["png"]);
  const xyPhase = fs.readFileSync(path.join(curveDir, "curve_phase_xy.tsv"), "utf8").trim().split(/\n/).map((line) => line.split(/\s+/).map(Number));
  const yxPhase = fs.readFileSync(path.join(curveDir, "curve_phase_yx.tsv"), "utf8").trim().split(/\n/).map((line) => line.split(/\s+/).map(Number));
  assert.deepStrictEqual(xyPhase.map((row) => row[0]), [-1, 0, 1]);
  assert(xyPhase.every((row) => Math.abs(row[1] - 45) < 1e-9));
  assert(yxPhase.every((row) => Math.abs(row[1] - 45) < 1e-9), "YX phases must be shown in the same quadrant as XY");
  assert(curveScript.includes("log10 period (s)"));
  assert(curveScript.includes("-JX16c/5.0c"));
  assert(curveScript.includes("curve_phase_xy.tsv -W1.1p,red"));
  assert(curveScript.includes("MT plot test"), "response curve must accept the user-defined title");
  const hiddenCurveScript = buildScript([curveStation], config("responseCurve", "curve_hidden", {
    showTitle: false,
    title: "HIDDEN CURVE TITLE"
  }), path.join(tmp, "curve-hidden"), ["png"]);
  assert(!hiddenCurveScript.includes("HIDDEN CURVE TITLE"), "showTitle=false must suppress response-curve titles");
  assert(!hiddenCurveScript.includes("-BWSen+t"), "hidden response-curve titles must not leave an empty GMT title option");

  console.log("MT plot tests passed");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
