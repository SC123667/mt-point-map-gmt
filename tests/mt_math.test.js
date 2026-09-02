const assert = require("assert");

const {
  availablePeriods,
  nearestResponse,
  metricsForResponse,
  computeImpedance,
  computePhaseTensor,
  computeTipper
} = require("../electron/mt");

function approx(actual, expected, tolerance = 1e-9, label = "value") {
  assert(Number.isFinite(actual), `${label} must be finite`);
  assert(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

const tensorResponse = {
  period: 1,
  frequency: 1,
  z: {
    xx: { re: 1, im: 1 },
    xy: { re: 0, im: 2 },
    yx: { re: 0, im: 0 },
    yy: { re: 1, im: 1 }
  },
  provided: {}
};

const tensor = computePhaseTensor(tensorResponse);
assert.deepStrictEqual(tensor.matrix, [[1, 2], [0, 1]]);
approx(tensor.alpha, 45, 1e-10, "phase-tensor alpha");
approx(tensor.beta, 22.5, 1e-10, "phase-tensor beta");
approx(tensor.azimuth, 22.5, 1e-10, "phase-tensor major-axis azimuth");
approx(tensor.phiMax, 1 + Math.SQRT2, 1e-10, "phase-tensor maximum principal value");
approx(tensor.phiMin, Math.SQRT2 - 1, 1e-10, "phase-tensor minimum principal value");
approx(tensor.phaseMax, 67.5, 1e-10, "phase-tensor maximum phase");
approx(tensor.phaseMin, 22.5, 1e-10, "phase-tensor minimum phase");

const tensorMetrics = metricsForResponse(tensorResponse);
approx(tensorMetrics.impedance.strike, 22.5, 1e-10, "strike fallback to phase-tensor azimuth");

const conventionalResponse = {
  period: 2,
  frequency: 0.5,
  z: {
    xy: { re: 1, im: 1 },
    yx: { re: -1, im: -1 }
  },
  provided: { strike: 135 }
};
const impedance = computeImpedance(conventionalResponse, null);
approx(impedance.phaseXY, 45, 1e-10, "raw XY phase");
approx(impedance.phaseYX, -135, 1e-10, "raw YX phase");
approx(impedance.phaseXYPlot, 45, 1e-10, "plotted XY phase");
approx(impedance.phaseYXPlot, 45, 1e-10, "plotted YX phase after convention correction");
approx(impedance.strike, -45, 1e-10, "provided strike normalization");
approx(impedance.rhoXY, 0.8, 1e-10, "XY apparent resistivity");

const tipper = computeTipper({
  tipper: {
    x: { re: 1, im: 0 },
    y: { re: 0, im: 1 }
  }
});
approx(tipper.real.azimuth, 0, 1e-10, "Tx north azimuth");
approx(tipper.imag.azimuth, 90, 1e-10, "Ty east azimuth");
assert.deepStrictEqual(
  { north: tipper.real.north, east: tipper.real.east },
  { north: 1, east: 0 }
);

const records = [{ mtResponses: [{ period: 10 }, { period: 0.1 }, { period: 1 }] }];
assert.deepStrictEqual(availablePeriods(records), [0.1, 1, 10]);
assert.strictEqual(nearestResponse(records[0], 0.8).period, 1);

console.log("MT math tests passed");
