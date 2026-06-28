function availablePeriods(records) {
  const values = [];
  for (const record of records || []) {
    for (const response of record.mtResponses || []) {
      if (Number.isFinite(response.period) && response.period > 0) values.push(response.period);
    }
  }
  return Array.from(new Set(values.map((value) => Number(value.toPrecision(8)))))
    .sort((a, b) => a - b);
}

function nearestResponse(record, targetPeriod) {
  const responses = (record?.mtResponses || []).filter((response) => Number.isFinite(response.period) && response.period > 0);
  if (!responses.length) return null;
  const target = Number(targetPeriod);
  if (!Number.isFinite(target) || target <= 0) return responses[0];
  return responses.reduce((best, response) => {
    const current = Math.abs(Math.log10(response.period) - Math.log10(target));
    const previous = Math.abs(Math.log10(best.period) - Math.log10(target));
    return current < previous ? response : best;
  }, responses[0]);
}

function metricsForResponse(response) {
  if (!response) return null;
  const phaseTensor = computePhaseTensor(response);
  const tipper = computeTipper(response);
  const impedance = computeImpedance(response);
  return {
    period: response.period,
    frequency: response.frequency,
    phaseTensor,
    tipper,
    impedance,
    provided: response.provided || {}
  };
}

function computeImpedance(response) {
  const z = response.z || {};
  const zxy = z.xy || {};
  const zyx = z.yx || {};
  const period = response.period;
  const rhoXY = apparentResistivity(zxy, period);
  const rhoYX = apparentResistivity(zyx, period);
  const phaseXY = phaseDegrees(zxy);
  const phaseYX = phaseDegrees(zyx);
  const strike = Number.isFinite(response.provided?.strike) ? response.provided.strike : impedanceStrike(response);
  return { rhoXY, rhoYX, phaseXY, phaseYX, strike };
}

function apparentResistivity(z, period) {
  if (!Number.isFinite(z?.re) || !Number.isFinite(z?.im) || !Number.isFinite(period)) return NaN;
  return 0.2 * period * (z.re ** 2 + z.im ** 2);
}

function phaseDegrees(z) {
  if (!Number.isFinite(z?.re) || !Number.isFinite(z?.im)) return NaN;
  return toDegrees(Math.atan2(z.im, z.re));
}

function impedanceStrike(response) {
  const x = realMatrix(response);
  if (!x) return NaN;
  const a = x[0][0] ** 2 + x[1][0] ** 2;
  const b = x[0][0] * x[0][1] + x[1][0] * x[1][1];
  const d = x[0][1] ** 2 + x[1][1] ** 2;
  return normalizeAngle180(0.5 * toDegrees(Math.atan2(2 * b, a - d)));
}

function computePhaseTensor(response) {
  const provided = response.provided || {};
  const providedUsable = [provided.ptAzimuth, provided.ptMax, provided.ptMin].every(Number.isFinite);
  if (providedUsable) {
    return {
      azimuth: normalizeAngle180(provided.ptAzimuth),
      phiMax: Math.abs(provided.ptMax),
      phiMin: Math.abs(provided.ptMin),
      beta: Number.isFinite(provided.beta) ? provided.beta : NaN,
      matrix: null
    };
  }
  const x = realMatrix(response);
  const y = imagMatrix(response);
  if (!x || !y) return null;
  const det = x[0][0] * x[1][1] - x[0][1] * x[1][0];
  if (Math.abs(det) < 1e-12) return null;
  const inv = [
    [x[1][1] / det, -x[0][1] / det],
    [-x[1][0] / det, x[0][0] / det]
  ];
  const phi = multiply2(inv, y);
  const svd = svd2(phi);
  const beta = 0.5 * toDegrees(Math.atan2(phi[0][1] - phi[1][0], phi[0][0] + phi[1][1]));
  return {
    azimuth: normalizeAngle180(svd.angle),
    phiMax: svd.s1,
    phiMin: svd.s2,
    beta,
    matrix: phi
  };
}

function computeTipper(response) {
  const tipper = response.tipper || {};
  const real = vectorMetric(tipper.x?.re, tipper.y?.re);
  const imag = vectorMetric(tipper.x?.im, tipper.y?.im);
  return { real, imag };
}

function vectorMetric(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x,
    y,
    magnitude: Math.hypot(x, y),
    azimuth: normalizeAngle360(toDegrees(Math.atan2(x, y)))
  };
}

function realMatrix(response) {
  const z = response.z || {};
  const matrix = [
    [z.xx?.re, z.xy?.re],
    [z.yx?.re, z.yy?.re]
  ];
  return matrix.flat().every(Number.isFinite) ? matrix : null;
}

function imagMatrix(response) {
  const z = response.z || {};
  const matrix = [
    [z.xx?.im, z.xy?.im],
    [z.yx?.im, z.yy?.im]
  ];
  return matrix.flat().every(Number.isFinite) ? matrix : null;
}

function multiply2(a, b) {
  return [
    [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
    [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]]
  ];
}

function svd2(matrix) {
  const a = matrix[0][0];
  const b = matrix[0][1];
  const c = matrix[1][0];
  const d = matrix[1][1];
  const sxx = a * a + c * c;
  const sxy = a * b + c * d;
  const syy = b * b + d * d;
  const trace = sxx + syy;
  const delta = Math.sqrt(Math.max(0, (sxx - syy) ** 2 + 4 * sxy ** 2));
  const l1 = Math.max(0, (trace + delta) / 2);
  const l2 = Math.max(0, (trace - delta) / 2);
  const angle = 0.5 * toDegrees(Math.atan2(2 * sxy, sxx - syy));
  return {
    s1: Math.sqrt(l1),
    s2: Math.sqrt(l2),
    angle: normalizeAngle180(angle)
  };
}

function normalizeAngle180(value) {
  if (!Number.isFinite(value)) return NaN;
  let angle = ((value + 180) % 180 + 180) % 180;
  if (angle >= 90) angle -= 180;
  return angle;
}

function normalizeAngle360(value) {
  if (!Number.isFinite(value)) return NaN;
  return ((value % 360) + 360) % 360;
}

function toDegrees(radians) {
  return radians * 180 / Math.PI;
}

module.exports = {
  availablePeriods,
  nearestResponse,
  metricsForResponse,
  computeImpedance,
  computePhaseTensor,
  computeTipper
};
