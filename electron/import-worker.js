const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { TextDecoder } = require("util");
const { parseStationText, parseEdiStationText, buildEdiParsedResult, buildRecords } = require("./parser");
const { autoRegion } = require("./gmt");
const { summarizeFaultFile } = require("./faults");

process.on("message", async (message) => {
  if (!message || message.type !== "start") return;
  try {
    const result = await handleTask(message.payload || {});
    await send({ type: "result", result });
    finish(0);
  } catch (error) {
    try {
      await send({ type: "error", message: error.message || String(error), stack: error.stack || "" });
    } finally {
      finish(1);
    }
  }
});

process.on("disconnect", () => process.exit(process.exitCode || 0));

function send(payload) {
  if (!process.connected) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    process.send(payload, (error) => {
      if (error) reject(error);
      else resolve(true);
    });
  });
}

function sendProgress(payload) {
  void send(payload).catch(() => {});
}

function finish(code) {
  process.exitCode = code;
  if (process.connected) {
    process.disconnect();
    return;
  }
  setImmediate(() => process.exit(code));
}

async function handleTask(payload) {
  const mode = payload.mode;
  if (mode === "stationFile") return loadStationFile(payload.filePath);
  if (mode === "ediDirectory") return loadEdiDirectory(payload.directory);
  if (mode === "applyMapping") return applyMapping(payload.rows, payload.mapping);
  if (mode === "faultFiles") return summarizeFaultFiles(payload.filePaths, payload.color);
  throw new Error(`未知导入任务：${mode || ""}`);
}

function loadStationFile(filePath) {
  const text = spreadsheetText(filePath);
  const parsed = parseStationText(text, filePath);
  return { ...parsed, region: autoRegion(parsed.records) };
}

function spreadsheetText(filePath) {
  if (/\.(xlsx|xls)$/i.test(filePath)) {
    const workbook = XLSX.readFile(filePath, { cellDates: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("Excel 文件中没有可读取的工作表。");
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
    return rows.map((row) => row.map((cell) => String(cell ?? "").replace(/\t/g, " ")).join("\t")).join("\n");
  }
  return decodeText(fs.readFileSync(filePath));
}

function applyMapping(rows, mapping) {
  const records = buildRecords(rows, mapping);
  if (!records.length) throw new Error("当前字段映射没有解析出有效点位。");
  return { records, region: autoRegion(records) };
}

function loadEdiDirectory(directory) {
  const ediFiles = findEdiFiles(directory);
  if (!ediFiles.length) throw new Error("该目录及子文件夹中没有找到 .edi 文件。");
  const records = [];
  const skipped = [];
  for (let index = 0; index < ediFiles.length; index += 1) {
    const filePath = ediFiles[index];
    try {
      const text = decodeText(fs.readFileSync(filePath));
      records.push(parseEdiStationText(text, filePath));
    } catch (error) {
      skipped.push({
        filePath,
        reason: error.message || String(error)
      });
    }
    if (index % 25 === 0 || index === ediFiles.length - 1) {
      sendProgress({
        type: "progress",
        progress: {
          mode: "ediDirectory",
          done: index + 1,
          total: ediFiles.length,
          message: `正在解析 EDI：${index + 1}/${ediFiles.length}`
        }
      });
    }
  }
  if (!records.length) {
    const sample = skipped.slice(0, 5).map((item) => `${path.basename(item.filePath)}：${item.reason}`).join("\n");
    throw new Error(`扫描到 ${ediFiles.length} 个 EDI，但没有解析出有效坐标。\n${sample}`);
  }
  const parsed = buildEdiParsedResult(records, skipped, directory);
  return { ...parsed, region: autoRegion(records), totalEdiFiles: ediFiles.length };
}

function findEdiFiles(directory) {
  const files = [];
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && /\.edi$/i.test(entry.name)) files.push(fullPath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

function summarizeFaultFiles(filePaths, color) {
  const faultColor = String(color || "#d7191c");
  return {
    files: (filePaths || []).map((filePath, index) => {
      try {
        const summary = summarizeFaultFile(filePath, faultColor);
        if (index % 5 === 0 || index === filePaths.length - 1) {
          sendProgress({
            type: "progress",
            progress: {
              mode: "faultFiles",
              done: index + 1,
              total: filePaths.length,
              message: `正在解析构造线：${index + 1}/${filePaths.length}`
            }
          });
        }
        return summary;
      } catch (error) {
        return {
          path: filePath,
          name: path.basename(filePath),
          color: faultColor,
          error: error.message || String(error)
        };
      }
    })
  };
}

function decodeText(buffer) {
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;
  for (const encoding of ["gb18030", "gbk"]) {
    try {
      const decoded = new TextDecoder(encoding).decode(buffer);
      if (decoded && !decoded.includes("\uFFFD")) return decoded;
    } catch {
      // Try the next decoder.
    }
  }
  return buffer.toString("latin1");
}
