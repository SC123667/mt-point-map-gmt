const NAME_HINTS = ["station", "site", "name", "point", "id", "no", "测点", "点号", "站点", "编号", "名称"];
const LON_HINTS = ["lon", "lng", "long", "longitude", "x", "经度", "东经"];
const LAT_HINTS = ["lat", "latitude", "y", "纬度", "北纬"];
const LINE_HINTS = ["line", "profile", "surveyline", "测线", "剖面", "线号"];
const ELEVATION_HINTS = ["elev", "alt", "height", "z", "高程", "海拔"];
const EASTING_HINTS = ["easting", "east", "xcoord", "xcoordinate", "x坐标", "东向", "东坐标", "横坐标"];
const NORTHING_HINTS = ["northing", "north", "ycoord", "ycoordinate", "y坐标", "北向", "北坐标", "纵坐标"];
const MT_HINTS = {
  frequency: ["freq", "frequency", "频率", "hz"],
  period: ["period", "t", "周期", "秒"],
  zxxr: ["zxxr", "zxxreal", "zxx_re", "zxx实部"],
  zxxi: ["zxxi", "zxximag", "zxx_im", "zxx虚部"],
  zxyr: ["zxyr", "zxyreal", "zxy_re", "zxy实部"],
  zxyi: ["zxyi", "zxyimag", "zxy_im", "zxy虚部"],
  zyxr: ["zyxr", "zyxreal", "zyx_re", "zyx实部"],
  zyxi: ["zyxi", "zyximag", "zyx_im", "zyx虚部"],
  zyyr: ["zyyr", "zyyreal", "zyy_re", "zyy实部"],
  zyyi: ["zyyi", "zyyimag", "zyy_im", "zyy虚部"],
  txr: ["txr", "txreal", "tx_re", "tipperxr", "tx实部"],
  txi: ["txi", "tximag", "tx_im", "tipperxi", "tx虚部"],
  tyr: ["tyr", "tyreal", "ty_re", "tipperyr", "ty实部"],
  tyi: ["tyi", "tyimag", "ty_im", "tipperyi", "ty虚部"],
  strike: ["strike", "azimuth", "走向", "方位"],
  ptAzimuth: ["ptazimuth", "phaseazimuth", "tensorazimuth", "相位张量方位"],
  ptMax: ["phimax", "ptmax", "相位最大"],
  ptMin: ["phimin", "ptmin", "相位最小"],
  beta: ["beta", "skew", "β", "偏斜"]
};

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

function parseEdiStationText(text, filePath = "") {
  const lat = firstEdiCoordinate(text, ["LAT", "REFLAT"]);
  const lon = firstEdiCoordinate(text, ["LONG", "LON", "REFLONG", "REFLON"]);
  const elevation = firstEdiNumber(text, ["ELEV", "REFELEV"]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error("未找到有效 LAT/LONG 或 REFLAT/REFLONG 坐标。");
  }
  if (Math.abs(lon) < 1e-12 && Math.abs(lat) < 1e-12) {
    throw new Error("EDI 坐标为 0/0，占位坐标已跳过。");
  }
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    throw new Error(`EDI 坐标超出范围：${lon}, ${lat}`);
  }
  const stationName = ediStationName(text, filePath);
  return {
    name: stationName,
    lon,
    lat,
    line: "",
    elevation: Number.isFinite(elevation) ? elevation : null,
    mtResponses: parseEdiResponses(text),
    sourcePath: filePath
  };
}

function buildEdiParsedResult(records, skipped = [], directory = "") {
  const columns = ["测点名", "经度", "纬度", "高程", "EDI文件"];
  const rows = records.map((record) => ({
    "测点名": record.name,
    "经度": String(record.lon),
    "纬度": String(record.lat),
    "高程": record.elevation === null || record.elevation === undefined ? "" : String(record.elevation),
    "EDI文件": record.sourcePath || ""
  }));
  return {
    filePath: directory,
    columns,
    rows,
    mapping: {
      coordinateType: "geographic",
      name: "测点名",
      lon: "经度",
      lat: "纬度",
      line: "",
      elevation: "高程"
      ,
      mt: {}
    },
    records,
    hasHeader: true,
    sourceType: "ediDirectory",
    skippedEdiFiles: skipped
  };
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
  if (lon && lat && countValidGeographicRows(rows, lon, lat) > 0) {
    return {
      coordinateType: "geographic",
      name: name || guessNameColumn(columns, rows, lon, lat),
      lon,
      lat,
      line,
      elevation,
      mt: detectMTMapping(columns, rows, hasHeader)
    };
  }

  const projected = detectProjectedMapping(columns, rows, hasHeader);
  if (projected) {
    return {
      coordinateType: "projected",
      name: name || guessNameColumn(columns, rows, projected.easting, projected.northing),
      easting: projected.easting,
      northing: projected.northing,
      projectedSystem: projected.system,
      line,
      elevation,
      mt: detectMTMapping(columns, rows, hasHeader)
    };
  }

  throw new Error("无法自动识别经纬度或高斯投影坐标列，请检查表头或数据列顺序。");
}

function countValidGeographicRows(rows, lon, lat) {
  return rows.filter((row) => {
    const lonValue = toNumber(row[lon]);
    const latValue = toNumber(row[lat]);
    return Number.isFinite(lonValue) && Number.isFinite(latValue) && lonValue >= -180 && lonValue <= 180 && latValue >= -90 && latValue <= 90;
  }).length;
}

function detectProjectedMapping(columns, rows, hasHeader) {
  const numeric = numericColumns(columns, rows);
  if (numeric.length < 2) return null;

  const hintedEast = hasHeader ? firstHint(columns, EASTING_HINTS) : "";
  const hintedNorth = hasHeader ? firstHint(columns, NORTHING_HINTS) : "";
  const candidates = [];
  const add = (easting, northing, hintBonus = 0) => {
    if (!easting || !northing || easting === northing) return;
    candidates.push({ easting, northing, hintBonus });
  };

  add(hintedEast, hintedNorth, 12);
  add(hintedNorth, hintedEast, 8);
  for (const easting of numeric) {
    for (const northing of numeric) add(easting, northing, 0);
  }

  let best = null;
  for (const candidate of candidates) {
    const tested = scoreProjectedCandidate(candidate, rows);
    if (!best || tested.score > best.score) best = tested;
  }
  return best && best.score > 0 ? best : null;
}

function scoreProjectedCandidate(candidate, rows) {
  let score = candidate.hintBonus || 0;
  let system = null;
  for (const row of rows.slice(0, 50)) {
    const easting = toNumber(row[candidate.easting]);
    const northing = toNumber(row[candidate.northing]);
    if (!Number.isFinite(easting) || !Number.isFinite(northing)) continue;
    const converted = convertGaussKruger3Degree(easting, northing);
    if (!converted) continue;
    if (converted.lon >= 70 && converted.lon <= 140 && converted.lat >= 15 && converted.lat <= 55) {
      score += 4;
      system = converted.system;
    } else if (converted.lon >= -180 && converted.lon <= 180 && converted.lat >= -90 && converted.lat <= 90) {
      score += 1;
      system = converted.system;
    }
  }
  return { ...candidate, score, system };
}

function convertGaussKruger3Degree(rawEasting, rawNorthing) {
  const zone = Math.floor(Math.abs(rawEasting) / 1000000);
  if (zone < 20 || zone > 60) return null;
  const easting = Math.abs(rawEasting) - zone * 1000000;
  const northing = rawNorthing;
  if (easting < 100000 || easting > 900000 || northing < 0) return null;
  const converted = inverseTransverseMercator(easting, northing, zone * 3);
  return {
    ...converted,
    system: {
      type: "gaussKruger3Degree",
      zone,
      centralMeridian: zone * 3
    }
  };
}

function inverseTransverseMercator(easting, northing, centralMeridian) {
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const x = easting - 500000.0;
  const y = northing;
  const m = y;
  const mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sinPhi = Math.sin(phi1);
  const cosPhi = Math.cos(phi1);
  const tanPhi = Math.tan(phi1);
  const n1 = a / Math.sqrt(1 - e2 * sinPhi ** 2);
  const r1 = a * (1 - e2) / (1 - e2 * sinPhi ** 2) ** 1.5;
  const t1 = tanPhi ** 2;
  const c1 = ep2 * cosPhi ** 2;
  const d = x / n1;
  const lat = phi1 - (n1 * tanPhi / r1) * (
    d ** 2 / 2
    - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720
  );
  const lon = toRadians(centralMeridian) + (
    d
    - (1 + 2 * t1 + c1) * d ** 3 / 6
    + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120
  ) / cosPhi;
  return {
    lon: toDegrees(lon),
    lat: toDegrees(lat)
  };
}

function buildRecords(rows, mapping) {
  if (mapping?.mt && (mapping.mt.period || mapping.mt.frequency)) {
    const grouped = buildMTTableRecords(rows, mapping);
    if (grouped.length) return grouped;
  }
  return rows.map((row, index) => {
    const coordinate = readCoordinate(row, mapping);
    if (!coordinate) return null;
    const { lon, lat } = coordinate;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
    const rawName = mapping.name ? String(row[mapping.name] || "").trim() : "";
    return {
      name: rawName || `MT${String(index + 1).padStart(3, "0")}`,
      lon,
      lat,
      line: mapping.line ? String(row[mapping.line] || "").trim() : "",
      elevation: mapping.elevation ? toNumber(row[mapping.elevation]) : null,
      mtResponses: buildMTResponsesFromRow(row, mapping.mt)
    };
  }).filter(Boolean);
}

function buildMTTableRecords(rows, mapping) {
  const groups = new Map();
  rows.forEach((row, index) => {
    const coordinate = readCoordinate(row, mapping);
    if (!coordinate) return;
    const response = buildMTResponseFromRow(row, mapping.mt);
    if (!response) return;
    const rawName = mapping.name ? String(row[mapping.name] || "").trim() : "";
    const name = rawName || `MT${String(index + 1).padStart(3, "0")}`;
    if (!groups.has(name)) {
      groups.set(name, {
        name,
        lon: coordinate.lon,
        lat: coordinate.lat,
        line: mapping.line ? String(row[mapping.line] || "").trim() : "",
        elevation: mapping.elevation ? toNumber(row[mapping.elevation]) : null,
        mtResponses: []
      });
    }
    groups.get(name).mtResponses.push(response);
  });
  return Array.from(groups.values()).map((record) => ({
    ...record,
    mtResponses: record.mtResponses.sort((a, b) => a.period - b.period)
  }));
}

function detectMTMapping(columns, rows, hasHeader) {
  if (!hasHeader) return {};
  const mapping = {};
  for (const [key, hints] of Object.entries(MT_HINTS)) {
    mapping[key] = firstHint(columns, hints);
  }
  if (!mapping.frequency && !mapping.period) return {};
  const numericCount = Object.values(mapping).filter(Boolean).filter((column) => numericColumns([column], rows).length).length;
  return numericCount >= 1 ? mapping : {};
}

function buildMTResponsesFromRow(row, mtMapping) {
  const response = buildMTResponseFromRow(row, mtMapping);
  return response ? [response] : [];
}

function buildMTResponseFromRow(row, mtMapping = {}) {
  if (!mtMapping || (!mtMapping.period && !mtMapping.frequency)) return null;
  const period = mtMapping.period ? toNumber(row[mtMapping.period]) : 1 / toNumber(row[mtMapping.frequency]);
  if (!Number.isFinite(period) || period <= 0) return null;
  const response = {
    period,
    frequency: 1 / period,
    z: {
      xx: complexFromRow(row, mtMapping.zxxr, mtMapping.zxxi),
      xy: complexFromRow(row, mtMapping.zxyr, mtMapping.zxyi),
      yx: complexFromRow(row, mtMapping.zyxr, mtMapping.zyxi),
      yy: complexFromRow(row, mtMapping.zyyr, mtMapping.zyyi)
    },
    tipper: {
      x: complexFromRow(row, mtMapping.txr, mtMapping.txi),
      y: complexFromRow(row, mtMapping.tyr, mtMapping.tyi)
    },
    provided: {
      strike: mtMapping.strike ? toNumber(row[mtMapping.strike]) : NaN,
      ptAzimuth: mtMapping.ptAzimuth ? toNumber(row[mtMapping.ptAzimuth]) : NaN,
      ptMax: mtMapping.ptMax ? toNumber(row[mtMapping.ptMax]) : NaN,
      ptMin: mtMapping.ptMin ? toNumber(row[mtMapping.ptMin]) : NaN,
      beta: mtMapping.beta ? toNumber(row[mtMapping.beta]) : NaN
    }
  };
  return responseHasData(response) ? response : null;
}

function complexFromRow(row, realColumn, imagColumn) {
  const re = realColumn ? toNumber(row[realColumn]) : NaN;
  const im = imagColumn ? toNumber(row[imagColumn]) : NaN;
  return {
    re: Number.isFinite(re) ? re : NaN,
    im: Number.isFinite(im) ? im : NaN
  };
}

function responseHasData(response) {
  return Object.values(response.z).some(hasComplex)
    || Object.values(response.tipper).some(hasComplex)
    || Object.values(response.provided).some(Number.isFinite);
}

function hasComplex(value) {
  return Number.isFinite(value?.re) || Number.isFinite(value?.im);
}

function readCoordinate(row, mapping) {
  if (mapping.coordinateType === "projected") {
    const converted = convertGaussKruger3Degree(toNumber(row[mapping.easting]), toNumber(row[mapping.northing]));
    if (!converted) return null;
    return { lon: converted.lon, lat: converted.lat };
  }
  return {
    lon: toNumber(row[mapping.lon]),
    lat: toNumber(row[mapping.lat])
  };
}

function splitRows(text) {
  const lines = text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("//") && !line.startsWith(";"));
  if (!lines.length) return [];
  const sample = lines.slice(0, 20).join("\n");
  if (sample.includes(",") || sample.includes(";")) {
    const delimiter = sample.includes(",") ? "," : ";";
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
  const nextDataLike = rows.slice(1, 8).some((row) => {
    const numeric = row.filter((cell) => Number.isFinite(toNumber(cell))).length;
    const text = row.filter((cell) => cell && !Number.isFinite(toNumber(cell))).length;
    return numeric >= 2 && text >= 1;
  });
  return firstNumeric < 2 && nextDataLike;
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

function firstEdiCoordinate(text, keys) {
  for (const key of keys) {
    const value = firstEdiValue(text, key);
    if (!value) continue;
    const parsed = parseEdiCoordinate(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function firstEdiNumber(text, keys) {
  for (const key of keys) {
    const value = firstEdiValue(text, key);
    if (!value) continue;
    const parsed = toNumber(unquote(value));
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function firstEdiValue(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text || "").match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*=\\s*([^\\r\\n]+)`, "i"));
  return match ? match[1].trim() : "";
}

function parseEdiResponses(text) {
  const arrays = {
    frequency: readEdiArray(text, "FREQ"),
    zxxr: readEdiArray(text, "ZXXR"),
    zxxi: readEdiArray(text, "ZXXI"),
    zxyr: readEdiArray(text, "ZXYR"),
    zxyi: readEdiArray(text, "ZXYI"),
    zyxr: readEdiArray(text, "ZYXR"),
    zyxi: readEdiArray(text, "ZYXI"),
    zyyr: readEdiArray(text, "ZYYR"),
    zyyi: readEdiArray(text, "ZYYI"),
    txr: readEdiArray(text, "TXR"),
    txi: readEdiArray(text, "TXI"),
    tyr: readEdiArray(text, "TYR"),
    tyi: readEdiArray(text, "TYI")
  };
  const count = arrays.frequency.length;
  if (!count) return [];
  const responses = [];
  for (let index = 0; index < count; index += 1) {
    const frequency = arrays.frequency[index];
    if (!Number.isFinite(frequency) || frequency <= 0) continue;
    const response = {
      period: 1 / frequency,
      frequency,
      z: {
        xx: complexAt(arrays.zxxr, arrays.zxxi, index),
        xy: complexAt(arrays.zxyr, arrays.zxyi, index),
        yx: complexAt(arrays.zyxr, arrays.zyxi, index),
        yy: complexAt(arrays.zyyr, arrays.zyyi, index)
      },
      tipper: {
        x: complexAt(arrays.txr, arrays.txi, index),
        y: complexAt(arrays.tyr, arrays.tyi, index)
      },
      provided: {}
    };
    if (responseHasData(response)) responses.push(response);
  }
  return responses.sort((a, b) => a.period - b.period);
}

function readEdiArray(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text || "").match(new RegExp(`>\\s*${escaped}(?:[.A-Z0-9_+-]+)?(?:\\s+[^\\r\\n]*)?//\\s*(\\d+)([\\s\\S]*?)(?=\\n\\s*>|\\n\\s*$)`, "i"));
  if (!match) return [];
  const expected = Number(match[1]);
  const values = (match[2].match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[Ee][+-]?\d+)?/g) || []).map(Number).filter(Number.isFinite);
  return values.slice(0, Number.isFinite(expected) && expected > 0 ? expected : values.length);
}

function complexAt(realValues, imagValues, index) {
  return {
    re: Number.isFinite(realValues[index]) ? realValues[index] : NaN,
    im: Number.isFinite(imagValues[index]) ? imagValues[index] : NaN
  };
}

function parseEdiCoordinate(value) {
  const text = unquote(value).trim();
  const suffix = text.match(/[NSEW]$/i)?.[0].toUpperCase() || "";
  const cleaned = text.replace(/[NSEW]$/i, "").replace(/[°'"]/g, ":").trim();
  let sign = cleaned.startsWith("-") ? -1 : 1;
  if (suffix === "S" || suffix === "W") sign = -1;
  const unsigned = cleaned.replace(/^[+-]/, "");
  if (unsigned.includes(":")) {
    const parts = unsigned.split(":").filter((part) => part !== "").map(Number);
    if (!parts.length || parts.some((part) => !Number.isFinite(part))) return NaN;
    const degrees = parts[0] || 0;
    const minutes = parts[1] || 0;
    const seconds = parts[2] || 0;
    return sign * (degrees + minutes / 60 + seconds / 3600);
  }
  const decimal = Number(unsigned);
  return Number.isFinite(decimal) ? sign * decimal : NaN;
}

function ediStationName(text, filePath) {
  const base = String(filePath || "").split(/[\\/]/).pop() || "";
  const fileName = base.replace(/\.[Ee][Dd][Ii]$/, "");
  if (fileName) return fileName;
  const dataId = unquote(firstEdiValue(text, "DATAID"));
  if (dataId && !/^unknown$/i.test(dataId)) return dataId;
  return "EDI站点";
}

function unquote(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function toDegrees(radians) {
  return radians * 180 / Math.PI;
}

module.exports = {
  parseStationText,
  parseEdiStationText,
  buildEdiParsedResult,
  detectMapping,
  buildRecords,
  parseEdiResponses
};
