const fs = require("fs");
const path = require("path");
const { TextDecoder } = require("util");

const DEFAULT_FAULT_PEN = "0.8p,black";
const DEFAULT_OVERLAY_FILE = "fault_overlays.tsv";

function parsePen(pen) {
  const text = String(pen || "").trim();
  const match = /^(\d+\.?\d*[pPcCiI]?)(?:,([^,]+))?(?:,(.+))?$/.exec(text);
  if (!match) return { width: text || "0.8p", color: "", style: "" };
  return { width: match[1], color: match[2] || "", style: match[3] || "" };
}

function buildPen(width, color, style) {
  const base = color ? `${width},${color}` : width;
  return style ? `${base},${style}` : base;
}

function recolorPen(originalPen, color) {
  const nextColor = normalizeColor(color);
  if (!nextColor) return originalPen;
  const parsed = parsePen(originalPen);
  return buildPen(parsed.width, nextColor, parsed.style);
}

function normalizeColor(color) {
  const text = String(color || "").trim();
  if (!text) return "";
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  if (/^[0-9a-f]{6}$/i.test(text)) return `#${text}`;
  if (/^[A-Za-z][A-Za-z0-9_+-]*$/.test(text)) return text;
  return "";
}

function autodetectAndParse(filePath) {
  const text = readTextAutoEncoding(filePath);
  const first = firstContentLine(text);
  if (!first) {
    throw new Error("文件为空，未解析出构造线。");
  }
  if (/^\d+\s*,\s*[01](?:\s*,.*)?$/.test(first)) {
    return parseBLN(text, filePath);
  }
  if (first.startsWith(">")) {
    return parseGMTMultiSegment(text, filePath);
  }
  return parseSimpleXY(text, filePath);
}

function parseGMTMultiSegment(text, filePath) {
  const segments = [];
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith(">")) {
      if (current && current.points.length >= 2) segments.push(current);
      current = parseGMTHeader(line);
      continue;
    }
    const point = parsePoint(line);
    if (!point) continue;
    if (!current) current = newSegment();
    current.points.push(point);
  }
  if (current && current.points.length >= 2) segments.push(current);
  return parsedCollection(segments, filePath, "gmt_multisegment");
}

function parseGMTHeader(line) {
  const segment = newSegment();
  const pen = /(?:^|\s)-W(\S+)/.exec(line);
  const fill = /(?:^|\s)-G(\S+)/.exec(line);
  const name = /#\s*(.+)$/.exec(line);
  if (pen) segment.style.pen = pen[1];
  if (fill) segment.style.fill = fill[1];
  if (name) segment.name = name[1].trim();
  return segment;
}

function parseBLN(text, filePath) {
  const lines = text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const segments = [];
  let index = 0;
  while (index < lines.length) {
    const header = /^(\d+)\s*,\s*([01])(?:\s*,.*)?$/.exec(lines[index]);
    if (!header) {
      index += 1;
      continue;
    }
    const count = Number(header[1]);
    const closed = header[2] === "1";
    index += 1;
    const segment = newSegment();
    segment.style.closed = closed;
    for (let i = 0; i < count && index < lines.length; i += 1, index += 1) {
      const point = parsePoint(lines[index]);
      if (point) segment.points.push(point);
    }
    if (segment.points.length >= 2) segments.push(segment);
  }
  return parsedCollection(segments, filePath, "bln");
}

function parseSimpleXY(text, filePath) {
  const segments = [];
  let segment = newSegment();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      if (segment.points.length >= 2) segments.push(segment);
      segment = newSegment();
      continue;
    }
    if (line.startsWith("#")) continue;
    const point = parsePoint(line);
    if (point) segment.points.push(point);
  }
  if (segment.points.length >= 2) segments.push(segment);
  return parsedCollection(segments, filePath, "simple_xy");
}

function parsePoint(line) {
  const parts = String(line || "").trim().split(/[,\s\t]+/);
  const lon = Number(parts[0]);
  const lat = Number(parts[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lon, lat };
}

function newSegment() {
  return {
    points: [],
    style: { pen: DEFAULT_FAULT_PEN, fill: "", closed: false },
    name: ""
  };
}

function parsedCollection(segments, filePath, sourceFormat) {
  if (!segments.length) {
    throw new Error("未解析出有效构造线，请检查文件是否包含经度和纬度坐标。");
  }
  return {
    segments,
    sourcePath: filePath || "",
    sourceFormat
  };
}

function summarizeFaultFile(filePath, color) {
  const collection = autodetectAndParse(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    color: normalizeColor(color) || "#d7191c",
    segmentCount: collection.segments.length,
    pointCount: collection.segments.reduce((sum, segment) => sum + segment.points.length, 0),
    sourceFormat: collection.sourceFormat
  };
}

function buildFaultOverlay(collections, outputDirectory, options = {}) {
  const filename = options.filename || DEFAULT_OVERLAY_FILE;
  const outputPath = path.join(outputDirectory, filename);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const lines = [];
  for (const item of collections) {
    const collection = item.collection || autodetectAndParse(item.path);
    const color = normalizeColor(item.color);
    for (const segment of collection.segments) {
      if (!segment.points || segment.points.length < 2) continue;
      const sourcePen = segment.style?.pen || DEFAULT_FAULT_PEN;
      const pen = color ? recolorPen(sourcePen, color) : sourcePen;
      const fill = segment.style?.fill || "";
      const label = segment.name || item.name || path.basename(collection.sourcePath || "");
      const header = [">", `-W${pen}`, fill ? `-G${fill}` : "", label ? `# ${label}` : ""].filter(Boolean).join(" ");
      lines.push(header);
      for (const point of segment.points) {
        lines.push(`${point.lon.toFixed(8)}\t${point.lat.toFixed(8)}`);
      }
    }
  }
  fs.writeFileSync(outputPath, `${lines.join("\n")}${lines.length ? "\n" : ""}`, "utf8");
  return {
    path: outputPath,
    filename,
    empty: lines.length === 0
  };
}

function readTextAutoEncoding(filePath) {
  const buffer = fs.readFileSync(filePath);
  for (const encoding of ["utf-8", "gb18030", "gbk", "latin1"]) {
    try {
      const text = new TextDecoder(encoding).decode(buffer).replace(/^\uFEFF/, "");
      if (text && !text.includes("\uFFFD")) return text;
    } catch {
      // Try the next decoder.
    }
  }
  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}

function firstContentLine(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#")) || "";
}

module.exports = {
  DEFAULT_FAULT_PEN,
  DEFAULT_OVERLAY_FILE,
  parsePen,
  buildPen,
  recolorPen,
  normalizeColor,
  autodetectAndParse,
  parseGMTMultiSegment,
  parseBLN,
  parseSimpleXY,
  summarizeFaultFile,
  buildFaultOverlay,
  readTextAutoEncoding
};
