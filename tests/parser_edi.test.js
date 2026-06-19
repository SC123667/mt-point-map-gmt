const assert = require("assert");
const { parseEdiStationText } = require("../electron/parser");

const station = parseEdiStationText(`
>HEAD
DATAID="merged_20251102_20251112"
LAT=45:00:12.18
LONG=116:01:19.23
ELEV=123.4
`, "/tmp/L1160450.edi");

assert.strictEqual(station.name, "L1160450");
assert.strictEqual(station.elevation, 123.4);
assert.ok(Math.abs(station.lat - 45.00338333333333) < 1e-10);
assert.ok(Math.abs(station.lon - 116.02200833333334) < 1e-10);

assert.throws(() => parseEdiStationText(`
>HEAD
LAT=0:00:0.0
LONG=0:00:0.0
`, "/tmp/bad.edi"), /0\/0/);

console.log("EDI parser tests passed");
