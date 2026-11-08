const fs = require("fs");
const path = require("path");

const DEFAULT_LEGEND_FILE = "map_legend.txt";

const DEFAULT_LEGEND_CONFIG = {
  title: "Legend",
  titleFontSize: 11,
  labelFontSize: 8.5,
  textColor: "black",
  position: "JBC",
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
  const stationEntries = buildStationLegendEntries(config);
  const overlayEntries = [];
  const mtOverlayEntry = buildMTOverlayLegendEntry(config);
  if (mtOverlayEntry) overlayEntries.push(mtOverlayEntry);
  if (config.legend?.includeFaults !== false) {
    for (const layer of config.faultLayers || []) {
      overlayEntries.push({
        label: layer.name || path.basename(layer.path || "Fault"),
        symbol: "line",
        pen: `0.9p,${layer.color || "#d7191c"}`
      });
    }
  }
  const names = require('./map-names'), cart = require('./cartography');
  // A category may contain different symbols (e.g. Cu-Au stars and Au diamonds).
  // Keep each distinct visual style instead of silently using its first feature.
  const groups = new Map(), categoryCounts = new Map();
  for(const f of config.cartography?.features||[]){
    if(f.visible===false||!cart.inRegion(f,config.region))continue;
    const style=cart.effectiveStyle(f,config.cartography);
    const symbol=f.geometry.type.includes('Point')?'point':f.geometry.type.includes('Polygon')?'area':'line';
    if(symbol==='point'&&style.symbol==='none')continue;
    const entry={label:f.category,category:f.category,symbol,opacity:style.opacity,gmtSymbol:style.symbol,fill:style.fill,size:`${style.size}c`,pen:cart.strokePen(style)};
    const key=JSON.stringify([f.category,symbol,entry.pen,symbol==='point'?[entry.gmtSymbol,entry.fill,entry.size]:symbol==='area'?[entry.fill,entry.opacity]:null]);
    if(!groups.has(key)){groups.set(key,{entry,features:[]});categoryCounts.set(f.category,(categoryCounts.get(f.category)||0)+1);}
    groups.get(key).features.push(f);
  }
  const language=config.cartography?.language;
  const sequence=new Map();
  for(const {entry,features} of groups.values()){
    entry.label=names.categoryLabel(entry.category,config.cartography);
    if((categoryCounts.get(entry.category)||0)>1&&entry.label){
      const n=(sequence.get(entry.category)||0)+1;sequence.set(entry.category,n);
      const labels=[...new Set(features.map(f=>names.label(f,{}, {...config.cartography,nameFormat:'abbreviation'})).filter(v=>v&&!require('./label-layout').genericName(v)))];
      const suffix=labels.length&&labels.length<=3?labels.join(' / '):`${language==='en'?'Style':'样式'} ${n}`;
      entry.label+=` · ${suffix}`;
    }
    overlayEntries.push(entry);
  }
  for(const entry of [...stationEntries,...overlayEntries]){
    if(!entry.category)entry.label=names.translated(entry.label,language);
    if(entry.symbol==='line'||entry.symbol==='area')entry.pen=legendPen(entry.pen,config.legend);
  }
  return (config.legend?.order === "overlay-first" ? [...overlayEntries, ...stationEntries] : [...stationEntries, ...overlayEntries]).filter(e=>e.label);
}

function buildStationLegendEntries(config = {}) {
  if (config.plotType === "baseMap") return [];
  const groups = Array.isArray(config.stationGroups) ? config.stationGroups.filter(Boolean) : [];
  if(config.stationClasses?.enabled&&!groups.length)return [];
  if (groups.length) {
    return groups.map((group, index) => ({
      label: group.label || group.id || `Group ${index + 1}`,
      symbol: "point",
      gmtSymbol: safePointSymbol(group.symbol || config.pointSymbol),
      fill: group.fill || config.pointFill || "#2f6f8f",
      pen: `${Number(group.penWidth ?? config.pointPenWidth ?? 0.45).toFixed(2)}p,${group.penColor || config.pointPenColor || "#263238"}`,
      size: `${Number(group.size ?? config.pointSize ?? 0.20).toFixed(2)}c`
    }));
  }
  return [{
    label: config.legend?.stationLabel || "Station",
    symbol: "point",
    gmtSymbol: safePointSymbol(config.pointSymbol),
    fill: config.pointFill || "#2f6f8f",
    pen: `${Number(config.pointPenWidth || 0.45).toFixed(2)}p,${config.pointPenColor || "#263238"}`,
    size: `${Number(config.pointSize || 0.20).toFixed(2)}c`
  }];
}

function buildLegendSpec(entries, config = {}) {
  const settings = normalizeLegendConfig(config);
  const lines = [
    `H ${settings.titleFont} ${settings.title || "Legend"}`,
    `D ${settings.clearance} ${settings.delimiterPen || "0.35p,gray70"}`
  ];
  for (const raw of entries) {
    const entry={...raw,pen:(raw.symbol==='line'||raw.symbol==='area')?legendPen(raw.pen,settings):raw.pen};
    const label = String(entry.label || "").trim();
    if (!label) continue;
    if (entry.symbol === "point") {
      lines.push(`S 0.14c ${entry.gmtSymbol || "c"} ${entry.size || "0.20c"} ${entry.fill || "#2f6f8f"} ${entry.pen || "0.45p,#263238"} 0.45c ${label}`);
    } else if (entry.symbol === "area") {
      lines.push(`S 0.14c r 0.42c/0.18c ${entry.fill || "white"}@${100-Number(entry.opacity??100)} ${entry.pen || "0.5p,black"} 0.45c ${label}`);
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
  return `${prefix}gmt legend ${quote(legendPath, shell)} -D${settings.position}+w${settings.width}${frame} -R${region} -J${projection} --FONT_ANNOT_PRIMARY=${settings.labelFont}`;
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
    lineOpacity:settings.lineOpacity==null?null:clampNumber(settings.lineOpacity,0,100,100),
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

// null follows the map; an explicit zero must remain fully transparent.
function legendPen(pen='0.8p,black',settings={}){
  if(settings?.lineOpacity==null)return pen;
  const parts=String(pen).split(',');
  const opacity=clampNumber(settings.lineOpacity,0,100,100);
  parts[1]=(parts[1]||'black').replace(/@[\d.]+$/,'')+(opacity<100?'@'+(100-opacity):'');
  return parts.join(',');
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
  buildStationLegendEntries,
  buildLegendEntries,
  buildLegendSpec,
  normalizeLegendConfig,
  legendPen,
  writeLegendFile,
  legendCommand
};
