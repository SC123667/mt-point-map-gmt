const fs = require("fs");
const path = require("path");

const DEFAULT_LEGEND_FILE = "map_legend.txt";

const DEFAULT_LEGEND_CONFIG = {
  title: "Legend",
  titleFontSize: 11,
  labelFontSize: 8.5,
  textColor: "black",
  position: "n0.98/0.98+jTR",
  width: "4.2c",
  borderWidth: 0.5,
  borderColor: "gray40",
  backgroundColor: "white",
  backgroundTransparency: 8,
  cornerRadius: 2,
  clearance: "0.12c",
  delimiterPen: "0.35p,gray70"
};

function buildLegendEntries(config) {
  const entries = [];
  entries.push({
    label: config.legend?.stationLabel || "Station",
    symbol: "point",
    gmtSymbol: safePointSymbol(config.pointSymbol),
    fill: config.pointFill || "#d7191c",
    pen: `${Number(config.pointPenWidth || 0.35).toFixed(2)}p,${config.pointPenColor || "black"}`,
    size: `${Number(config.pointSize || 0.22).toFixed(2)}c`
  });
  const mtOverlayEntry = buildMTOverlayLegendEntry(config);
  if (mtOverlayEntry) entries.push(mtOverlayEntry);
  if (config.legend?.includeFaults !== false) {
    for (const layer of config.faultLayers || []) {
      entries.push({
        label: layer.name || path.basename(layer.path || "Fault"),
        symbol: "line",
        pen: `0.9p,${layer.color || "#d7191c"}`
      });
    }
  }
  return entries;
}

function buildLegendSpec(entries, config = {}) {
  const settings = normalizeLegendConfig(config);
  const lines = [
    `H ${settings.titleFont} ${settings.title || "Legend"}`,
    `D ${settings.clearance} ${settings.delimiterPen || "0.35p,gray70"}`
  ];
  for (const entry of entries) {
    const label = String(entry.label || "").trim();
    if (!label) continue;
    if (entry.symbol === "point") {
      lines.push(`S 0.14c ${entry.gmtSymbol || "c"} ${entry.size || "0.22c"} ${entry.fill || "#d7191c"} ${entry.pen || "0.35p,black"} 0.45c ${label}`);
    } else {
      lines.push(`S 0.14c - 0.42c - ${entry.pen || "0.8p,black"} 0.45c ${label}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function writeLegendFile(entries, outputDirectory, config = {}) {
  const settings = normalizeLegendConfig(config);
  const filename = settings.filename || DEFAULT_LEGEND_FILE;
  const legendPath = path.join(outputDirectory, filename);
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(legendPath, buildLegendSpec(entries, settings), "utf8");
  return { path: legendPath, filename, config: settings };
}

function legendCommand(legendPath, region, projection, shell, config = {}) {
  const settings = normalizeLegendConfig(config);
  const prefix = shell === "bat" ? "" : "  ";
  const frame = settings.frame ? ` -F${settings.frame}+c${settings.clearance}` : "";
  return `${prefix}gmt legend ${quote(legendPath, shell)} -D${settings.position}+w${settings.width}${frame} -R${region} -J${projection}`;
}

function normalizeLegendConfig(config = {}) {
  const settings = { ...DEFAULT_LEGEND_CONFIG, ...config };
  const titleFontSize = clampNumber(settings.titleFontSize, 6, 28, DEFAULT_LEGEND_CONFIG.titleFontSize);
  const labelFontSize = clampNumber(settings.labelFontSize, 5, 24, DEFAULT_LEGEND_CONFIG.labelFontSize);
  const borderWidth = clampNumber(settings.borderWidth, 0, 5, DEFAULT_LEGEND_CONFIG.borderWidth);
  const backgroundTransparency = clampNumber(settings.backgroundTransparency, 0, 100, DEFAULT_LEGEND_CONFIG.backgroundTransparency);
  const cornerRadius = clampNumber(settings.cornerRadius, 0, 12, DEFAULT_LEGEND_CONFIG.cornerRadius);
  const clearance = normalizeLength(settings.clearance, DEFAULT_LEGEND_CONFIG.clearance);
  const width = normalizeLength(settings.width, DEFAULT_LEGEND_CONFIG.width);
  const textColor = sanitizeColor(settings.textColor, DEFAULT_LEGEND_CONFIG.textColor);
  const borderColor = sanitizeColor(settings.borderColor, DEFAULT_LEGEND_CONFIG.borderColor);
  const backgroundColor = sanitizeColor(settings.backgroundColor, DEFAULT_LEGEND_CONFIG.backgroundColor);
  return {
    ...settings,
    titleFontSize,
    labelFontSize,
    borderWidth,
    backgroundTransparency,
    cornerRadius,
    clearance,
    width,
    textColor,
    borderColor,
    backgroundColor,
    titleFont: settings.titleFont || `${titleFontSize.toFixed(1)}p,Helvetica-Bold,${textColor}`,
    labelFont: settings.labelFont || `${labelFontSize.toFixed(1)}p,Helvetica,${textColor}`,
    frame: settings.frame || `+p${borderWidth.toFixed(2)}p,${borderColor}+g${backgroundColor}@${backgroundTransparency.toFixed(0)}+r${cornerRadius.toFixed(0)}p`
  };
}

function buildMTOverlayLegendEntry(config = {}) {
  const plotType = config.plotType || "stationMap";
  if (plotType === "strikeMap") {
    return {
      label: config.legend?.overlayLabel || "Strike",
      symbol: "line",
      pen: `${Number(config.strikeWidth || 1.2).toFixed(2)}p,${config.strikeColor || "blue"}`
    };
  }
  if (plotType === "phaseTensorMap") {
    return {
      label: config.legend?.overlayLabel || "Phase tensor",
      symbol: "line",
      pen: `${Number(config.tensorPenWidth || 0.35).toFixed(2)}p,${config.tensorPenColor || "black"}`
    };
  }
  if (plotType === "tipperMap") {
    return {
      label: config.legend?.overlayLabel || "Tipper",
      symbol: "line",
      pen: `${Number(config.tipperWidth || 1).toFixed(2)}p,${config.tipperColor || "purple"}`
    };
  }
  return null;
}

function safePointSymbol(symbol) {
  return new Set(["c", "t", "s", "d"]).has(symbol) ? symbol : "c";
}

function normalizeLength(value, fallback) {
  const text = String(value || "").trim();
  if (/^\d+(\.\d+)?[cip]$/.test(text)) return text;
  const number = Number(text);
  if (Number.isFinite(number) && number > 0) return `${number.toFixed(2)}c`;
  return fallback;
}

function sanitizeColor(value, fallback) {
  const text = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(text) || /^[A-Za-z][A-Za-z0-9_]*([0-9]+)?$/.test(text)) return text;
  return fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function quote(value, shell) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_+\-./:=,#@]+$/.test(text)) return text;
  if (shell === "bat") return `"${text.replace(/"/g, "\"\"")}"`;
  return `'${text.replace(/'/g, "'\"'\"'")}'`;
}

module.exports = {
  DEFAULT_LEGEND_FILE,
  DEFAULT_LEGEND_CONFIG,
  buildMTOverlayLegendEntry,
  buildLegendEntries,
  buildLegendSpec,
  normalizeLegendConfig,
  writeLegendFile,
  legendCommand
};
