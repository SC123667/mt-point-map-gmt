const NAME_HINTS = ["station", "site", "name", "point", "id", "no", "测点", "点号", "站点", "编号", "名称"];
const LON_HINTS = ["lon", "lng", "long", "longitude", "x", "经度", "东经"];
const LAT_HINTS = ["lat", "latitude", "y", "纬度", "北纬"];
const LINE_HINTS = ["line", "profile", "surveyline", "测线", "剖面", "线号"];
const ELEVATION_HINTS = ["elev", "alt", "height", "z", "高程", "海拔"];

function parseStationText(text, filePath = "") {
  const rawRows = splitRows(text);
  if (!rawRows.length) throw new Error("文件为空，未读取到点位数据。");

  const hasHeader = looksLikeHeader(rawRows);
  let columns;
  let dataRows;
  if (hasHeader) {
    columns = dedupeColumns(rawRows[0].map((cell, index) => cell.trim() || `col${index + 1}`));
    dataRows = rawRows.slice(1);
  } else {
    const width = Math.max(...rawRows.map((row) => row.length));
    columns = Array.from({ length: width }, (_, index) => `col${index + 1}`);
    dataRows = rawRows;
  }

  const rows = dataRows
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => rowToObject(columns, row));
  const mapping = detectMapping(columns, rows, hasHeader);
  const records = buildRecords(rows, mapping);
  if (!records.length) throw new Error("未能从文件中解析出有效经纬度点位。");
  return { filePath, columns, rows, mapping, records, hasHeader };
}

function detectMapping(columns, rows, hasHeader = true) {
  let lon = hasHeader ? firstHint(columns, LON_HINTS) : "";
  let lat = hasHeader ? firstHint(columns, LAT_HINTS) : "";
  const name = hasHeader ? firstHint(columns, NAME_HINTS) : "";
  const line = hasHeader ? firstHint(columns, LINE_HINTS) : "";
  const elevation = hasHeader ? firstHint(columns, ELEVATION_HINTS) : "";
  if (!lon || !lat) {
    const guessed = guessLonLat(numericColumns(columns, rows), rows);
    lon = guessed.lon;
    lat = guessed.lat;
  }
  if (!lon || !lat) throw new Error("无法自动识别经度和纬度列，请检查表头或数据列顺序。");
  return {
    name: name || guessNameColumn(columns, rows, lon, lat),
    lon,
    lat,
    line,
    elevation
  };
}

function buildRecords(rows, mapping) {
  return rows.map((row, index) => {
    const lon = toNumber(row[mapping.lon]);
    const lat = toNumber(row[mapping.lat]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
    const rawName = mapping.name ? String(row[mapping.name] || "").trim() : "";
    return {
      name: rawName || `MT${String(index + 1).padStart(3, "0")}`,
      lon,
      lat,
      line: mapping.line ? String(row[mapping.line] || "").trim() : "",
      elevation: mapping.elevation ? toNumber(row[mapping.elevation]) : null
    };
  }).filter(Boolean);
}

function splitRows(text) {
  const lines = text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("//") && !line.startsWith(";"));
  if (!lines.length) return [];
  const sample = lines.slice(0, 20).join("\n");
  if (sample.includes(",") || sample.includes("\t") || sample.includes(";")) {
    const delimiter = sample.includes(",") ? "," : (sample.includes("\t") ? "\t" : ";");
    return lines.map((line) => parseDelimitedLine(line, delimiter));
  }
  return lines.map((line) => line.split(/\s+/));
}

function parseDelimitedLine(line, delimiter) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (const char of line) {
    if (char === "\"") quoted = !quoted;
    else if (char === delimiter && !quoted) {
      fields.push(field.trim());
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field.trim());
  return fields;
}

function looksLikeHeader(rows) {
  const firstNumeric = rows[0].filter((cell) => Number.isFinite(toNumber(cell))).length;
  if (rows.length === 1) return firstNumeric < Math.max(2, Math.floor(rows[0].length / 2));
  const secondNumeric = rows[1].filter((cell) => Number.isFinite(toNumber(cell))).length;
  return firstNumeric < 2 && secondNumeric >= 2;
}

function dedupeColumns(columns) {
  const seen = new Map();
  return columns.map((column) => {
    const count = (seen.get(column) || 0) + 1;
    seen.set(column, count);
    return count === 1 ? column : `${column}_${count}`;
  });
}

function rowToObject(columns, row) {
  const output = {};
  columns.forEach((column, index) => {
    output[column] = (row[index] || "").trim();
  });
  return output;
}

function normalize(value) {
  return String(value).toLowerCase().replace(/[\s_\-()（）/\\]+/g, "");
}

function firstHint(columns, hints) {
  const normalizedHints = hints.map(normalize);
  return columns.find((column) => {
    const normalized = normalize(column);
    return normalizedHints.some((hint) => normalized === hint || normalized.includes(hint));
  }) || "";
}

function numericColumns(columns, rows) {
  return columns.filter((column) => {
    const values = rows.slice(0, 20).map((row) => toNumber(row[column])).filter(Number.isFinite);
    return values.length >= Math.max(2, Math.floor(Math.min(rows.length, 20) / 2));
  });
}

function guessLonLat(columns, rows) {
  let best = { score: -1, lon: "", lat: "" };
  for (const lon of columns) {
    for (const lat of columns) {
      if (lon === lat) continue;
      let score = 0;
      for (const row of rows) {
        const lonValue = toNumber(row[lon]);
        const latValue = toNumber(row[lat]);
        if (!Number.isFinite(lonValue) || !Number.isFinite(latValue)) continue;
        if (lonValue >= -180 && lonValue <= 180) score += 2;
        if (latValue >= -90 && latValue <= 90) score += 2;
        if (Math.abs(lonValue) > Math.abs(latValue)) score += 1;
      }
      if (score > best.score) best = { score, lon, lat };
    }
  }
  return best;
}

function guessNameColumn(columns, rows, lon, lat) {
  return columns.find((column) => {
    if (column === lon || column === lat) return false;
    const values = rows.slice(0, 20).map((row) => String(row[column] || ""));
    const nonNumeric = values.filter((value) => value && !Number.isFinite(toNumber(value))).length;
    return nonNumeric >= Math.max(1, Math.floor(values.length / 2));
  }) || "";
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  return Number(String(value).trim().replace(/,/g, "").replace(/°/g, ""));
}

module.exports = {
  parseStationText,
  detectMapping,
  buildRecords
};
