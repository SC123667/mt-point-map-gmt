const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { fork } = require("child_process");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mt-gmt-import-worker-"));

function cleanup() {
  fs.rmSync(tmp, { recursive: true, force: true });
}

function runTask(payload) {
  return new Promise((resolve, reject) => {
    const worker = fork(path.join(__dirname, "..", "electron", "import-worker.js"), [], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      serialization: "advanced"
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
      if (!settled) reject(new Error(`import worker exited with ${code}: ${stderr}`));
    });
    worker.send({ type: "start", payload });
  });
}

(async () => {
  try {
    const csv = path.join(tmp, "points.csv");
    fs.writeFileSync(csv, [
      "测点名,经度,纬度,高程",
      "A001,101.1,35.1,120",
      "A002,101.2,35.2,130",
      ""
    ].join("\n"), "utf8");
    const station = await runTask({ mode: "stationFile", filePath: csv });
    assert.strictEqual(station.records.length, 2);
    assert.strictEqual(station.mapping.lon, "经度");

    const remapped = await runTask({ mode: "applyMapping", rows: station.rows, mapping: station.mapping });
    assert.strictEqual(remapped.records.length, 2);
    assert(remapped.region.includes("/"));

    const ediDir = path.join(tmp, "edi");
    fs.mkdirSync(ediDir);
    fs.writeFileSync(path.join(ediDir, "L001.edi"), [
      ">HEAD",
      "DATAID=L001",
      "LAT=35:00:00",
      "LONG=101:00:00",
      "ELEV=100",
      ""
    ].join("\n"), "utf8");
    fs.writeFileSync(path.join(ediDir, "bad.edi"), [
      ">HEAD",
      "LAT=0:00:00",
      "LONG=0:00:00",
      ""
    ].join("\n"), "utf8");
    const edi = await runTask({ mode: "ediDirectory", directory: ediDir });
    assert.strictEqual(edi.records.length, 1);
    assert.strictEqual(edi.totalEdiFiles, 2);
    assert.strictEqual(edi.skippedEdiFiles.length, 1);

    console.log("Import worker tests passed");
  } finally {
    cleanup();
  }
})().catch((error) => {
  cleanup();
  throw error;
});
