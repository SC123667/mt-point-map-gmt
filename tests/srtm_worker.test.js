const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { fork } = require("child_process");

if (process.platform === "win32") {
  console.log("SRTM worker smoke test skipped on Windows");
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "srtm-worker-smoke-"));

function cleanup() {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const mockGmt = path.join(tmp, "mock-gmt.sh");
fs.writeFileSync(mockGmt, [
  "#!/bin/sh",
  "out=\"\"",
  "for arg in \"$@\"; do",
  "  case \"$arg\" in",
  "    -G*) out=\"${arg#-G}\" ;;",
  "  esac",
  "done",
  "if [ -n \"$out\" ]; then",
  "  mkdir -p \"$(dirname \"$out\")\"",
  "  printf 'mock grid\\n' > \"$out\"",
  "fi",
  "exit 0",
  ""
].join("\n"), { mode: 0o755 });

const tile = require("../electron/srtm-source").srtmTilesForRegion("0/0.001/0.999/1", path.join(tmp,"terrain_cache"))[0];
const cache = path.dirname(tile.hgtPath);
fs.mkdirSync(cache, { recursive: true });
const hgt = tile.hgtPath;
const buffer = Buffer.alloc(3601*3601*2);
[100, 110, 120, 130].forEach((value, index) => buffer.writeInt16BE(value, index * 2));
fs.writeFileSync(hgt, buffer);

const worker = fork(path.join(__dirname, "..", "electron", "srtm-worker.js"), [], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
let lastStatus = null;
const timeout = setTimeout(() => {
  worker.kill();
  cleanup();
  throw new Error(`SRTM worker smoke test timed out: ${JSON.stringify(lastStatus)}`);
}, 7000);

worker.on("message", (message) => {
  if (message.type === "status") lastStatus = message.status;
});

worker.stderr.on("data", (chunk) => process.stderr.write(chunk));

worker.on("exit", (code) => {
  clearTimeout(timeout);
  try {
    assert.strictEqual(code, 0, `worker exited with ${code}: ${JSON.stringify(lastStatus)}`);
    assert(lastStatus, "worker did not emit a status");
    assert.strictEqual(lastStatus.state, "completed");
    assert(fs.existsSync(lastStatus.gridPath), "mock grid output missing");
    assert(fs.existsSync(lastStatus.shadePath), "mock shade output missing");
    console.log("SRTM worker smoke test passed");
  } finally {
    cleanup();
  }
});

worker.send({
  type: "start",
  payload: {
    gmtInfo: { path: mockGmt, binDir: tmp },
    outputDirectory: tmp,
    config: {
      region: "0/0.001/0.999/1",
      terrainResolution: "01s",
      terrainIntensity: 0.65,
      terrainAllowDownload: false,
      terrainDataServer: "https://mirrors.ustc.edu.cn/gmtdata"
    }
  }
});
