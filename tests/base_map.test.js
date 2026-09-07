const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { geographicRegionIssue } = require("../electron/map-region");
const { buildScript } = require("../electron/gmt");
const { buildLegendEntries } = require("../electron/legend");

for (const value of ["100/110/25/35", "-125/-115/-45/-30", "170/190/-10/10", "0/360/-80/80"]) {
  assert.strictEqual(geographicRegionIssue(value, "M16c"), "", value);
}
for (const value of ["", "100//25/35", "110/100/25/35", "100/100/25/35", "100/110/35/25", "100/110/-91/30", "-181/20/10/20", "0/361/10/20", "-180/190/10/20", "100/110/25/NaN", "100/110/25/35;echo bad"]) {
  assert(geographicRegionIssue(value), value);
}
assert(geographicRegionIssue("100/110/-90/90", "M16c"));
assert.strictEqual(geographicRegionIssue("0/360/-90/90", "H16c"), "");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gmt-base-map-test-"));
try {
  const config = {
    plotType: "baseMap", region: "115/125/20/30", projection: "M16c", frame: "af",
    outputName: "region_basemap", showGrid: true, showTitle: true, title: "Regional map",
    showScale: true, showNorthArrow: true, showLabels: true, legend: { show: true },
    stationGroups: [{ label: "Hidden stations" }]
  };
  // A region-only map must ignore even previously imported records/groups.
  const script = buildScript([{ name: "SHOULD_NOT_DRAW", lon: 120, lat: 25 }], config, tmp, ["png", "pdf", "eps"]);
  assert(script.includes("png,pdf,eps"));
  assert(script.includes("gmt coast -R115/125/20/30"));
  assert(script.includes("gmt basemap -R115/125/20/30"));
  assert(!/gmt (plot|text|legend) /.test(script));
  assert.strictEqual(fs.readFileSync(path.join(tmp, "stations_points.tsv"), "utf8").trim(), "");
  assert.deepStrictEqual(buildLegendEntries(config), []);
  const faults = { ...config, faultLayers: [{ path: "fault.xy", name: "Fault", color: "red" }] };
  assert.deepStrictEqual(buildLegendEntries(faults).map((entry) => entry.label), ["Fault"]);
  assert.throws(() => buildScript([], { ...config, region: "" }, tmp), /边界/);
  assert.throws(() => buildScript([], { ...config, region: "125/115/20/30" }, tmp), /经度/);
  console.log("Base map tests passed");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
