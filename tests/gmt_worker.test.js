const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { fork } = require("child_process");

if (process.platform === "win32") {
  console.log("GMT worker smoke test skipped on Windows");
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mt-gmt-worker-"));

function cleanup() {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const mockGmt = path.join(tmp, "gmt");
fs.writeFileSync(mockGmt, [
  "#!/bin/sh",
  "if [ \"$1\" = \"--version\" ]; then echo \"6.6.0\"; exit 0; fi",
  "state=\"$PWD/.mock-gmt-state\"",
  "case \"$1\" in",
  "  begin)",
  "    printf '%s\\n%s\\n' \"$2\" \"$3\" > \"$state\"",
  "    ;;",
  "  end)",
  "    prefix=$(sed -n '1p' \"$state\" 2>/dev/null)",
  "    formats=$(sed -n '2p' \"$state\" 2>/dev/null)",
  "    oldifs=\"$IFS\"",
  "    IFS=,",
  "    for fmt in $formats; do",
  "      base=${fmt%%+*}",
  "      [ -n \"$prefix\" ] && [ -n \"$base\" ] && printf 'mock %s\\n' \"$base\" > \"$prefix.$base\"",
  "    done",
  "    IFS=\"$oldifs\"",
  "    ;;",
  "esac",
  "exit 0",
  ""
].join("\n"), { mode: 0o755 });

function runTask(payload) {
  return new Promise((resolve, reject) => {
    const worker = fork(path.join(__dirname, "..", "electron", "gmt-worker.js"), [], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      serialization: "advanced",
      env: {
        ...process.env,
        PATH: `${tmp}${path.delimiter}${process.env.PATH || ""}`
      }
    });
    let settled = false;
    let stderr = "";
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    worker.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    worker.on("message", (message) => {
      if (message.type === "result") finish(resolve, message.result);
      if (message.type === "error") finish(reject, new Error(message.message));
    });
    worker.on("exit", (code) => {
      if (!settled) reject(new Error(`gmt worker exited with ${code}: ${stderr}`));
    });
    worker.send({ type: "start", payload });
  });
}

(async () => {
  try {
    const records = Array.from({ length: 2500 }, (_, index) => ({
      name: `S${String(index + 1).padStart(4, "0")}`,
      lon: 101 + index * 0.0001,
      lat: 35 + index * 0.00005
    }));
    const outputDirectory = path.join(tmp, "out");
    const result = await runTask({
      mode: "export",
      records,
      formats: ["png"],
      outputDirectory,
      config: {
        title: "MT Survey Stations",
        plotType: "stationMap",
        region: "100.9/101.4/34.9/35.2",
        projection: "M16c",
        frame: "af",
        showGrid: true,
        showLabels: false,
        showScale: true,
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
        outputName: "mt_perf_map",
        pngDpi: 300,
        faultLayers: [],
        legend: { show: false }
      }
    });
    assert.strictEqual(result.ok, true);
    assert(fs.existsSync(path.join(outputDirectory, "mt_perf_map.png")), "PNG output missing");
    const stationLines = fs.readFileSync(path.join(outputDirectory, "stations_points.tsv"), "utf8").trim().split(/\n/);
    assert.strictEqual(stationLines.length, records.length);

    const hiddenTitleDirectory = path.join(tmp, "hidden-title-out");
    const hiddenTitleResult = await runTask({
      mode: "export",
      records: records.slice(0, 1),
      formats: ["png"],
      outputDirectory: hiddenTitleDirectory,
      config: {
        showTitle: false,
        title: "不应触发原生标题",
        plotType: "stationMap",
        region: "100.9/101.4/34.9/35.2",
        projection: "M16c",
        frame: "af",
        showGrid: false,
        showLabels: false,
        showScale: false,
        showNorthArrow: false,
        pointSymbol: "c",
        pointSize: 0.18,
        pointFill: "#2f6f8f",
        pointPenWidth: 0.45,
        pointPenColor: "#263238",
        labelFontSize: 7.5,
        labelColor: "#263238",
        labelDX: 0.07,
        labelDY: 0.07,
        showTerrain: false,
        outputName: "hidden_native_title",
        pngDpi: 300,
        faultLayers: [],
        legend: { show: false }
      }
    });
    assert.strictEqual(hiddenTitleResult.ok, true);
    assert.strictEqual(hiddenTitleResult.needsNativeDecorations, false, "hidden Chinese titles must not invoke native decoration rendering");

    console.log("GMT worker smoke test passed");
  } finally {
    cleanup();
  }
})().catch((error) => {
  cleanup();
  throw error;
});
