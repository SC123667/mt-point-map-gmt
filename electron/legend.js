const fs = require("fs");
const path = require("path");

const DEFAULT_LEGEND_FILE = "map_legend.txt";

const DEFAULT_LEGEND_CONFIG = {
  title: "Legend",
  titleFont: "11p,Helvetica-Bold,black",
  labelFont: "8.5p,Helvetica,black",
  position: "n0.98/0.98+jTR",
  width: "4.2c",
  frame: "+p0.5p,gray40+gwhite@8+r2p",
  clearance: "0.12c"
};

function buildLegendEntries(config) {
  const entries = [];
  entries.push({
    label: "MT station",
    symbol: "point",
    fill: config.pointFill || "#d7191c",
    pen: `${Number(config.pointPenWidth || 0.35).toFixed(2)}p,${config.pointPenColor || "black"}`,
    size: `${Number(config.pointSize || 0.22).toFixed(2)}c`
  });
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
  const settings = { ...DEFAULT_LEGEND_CONFIG, ...config };
  const lines = [
    `H ${settings.titleFont} ${settings.title || "Legend"}`,
    `D ${settings.clearance} ${settings.delimiterPen || "0.35p,gray70"}`
  ];
  for (const entry of entries) {
    const label = String(entry.label || "").trim();
    if (!label) continue;
    if (entry.symbol === "point") {
      lines.push(`S 0.14c c ${entry.size || "0.22c"} ${entry.fill || "#d7191c"} ${entry.pen || "0.35p,black"} 0.45c ${label}`);
    } else {
      lines.push(`S 0.14c - 0.42c - ${entry.pen || "0.8p,black"} 0.45c ${label}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function writeLegendFile(entries, outputDirectory, config = {}) {
  const settings = { ...DEFAULT_LEGEND_CONFIG, ...config };
  const filename = settings.filename || DEFAULT_LEGEND_FILE;
  const legendPath = path.join(outputDirectory, filename);
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(legendPath, buildLegendSpec(entries, settings), "utf8");
  return { path: legendPath, filename, config: settings };
}

function legendCommand(legendPath, region, projection, shell, config = {}) {
  const settings = { ...DEFAULT_LEGEND_CONFIG, ...config };
  const prefix = shell === "bat" ? "" : "  ";
  const frame = settings.frame ? ` -F${settings.frame}+c${settings.clearance}` : "";
  return `${prefix}gmt legend ${quote(legendPath, shell)} -D${settings.position}+w${settings.width}${frame} -R${region} -J${projection}`;
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
  buildLegendEntries,
  buildLegendSpec,
  writeLegendFile,
  legendCommand
};
