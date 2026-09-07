const { tileCachePaths } = require("./terrain-cache");
const path = require("path");

const SOURCES = {
  ustc: { label: "USTC 中国镜像", format: "jp2" },
  aws: { label: "AWS 全球源", format: "gzip" }
};

function srtmSource(config = {}) {
  if (["ustc", "aws"].includes(config.terrainSrtmSource)) return config.terrainSrtmSource;
  // Old projects used the GMT selector for all resolutions. Honour its intent.
  const server = String(config.terrainDataServer || "").replace(/\/+$/, "");
  return !server || server === "https://mirrors.ustc.edu.cn/gmtdata" ? "ustc" : "aws";
}

function srtmTilesForRegion(regionText, cacheRoot, source = "ustc") {
  const parts = String(regionText || "").split("/");
  const values = parts.map(Number);
  if (parts.length !== 4 || parts.some((s) => !s.trim()) || values.some((v) => !Number.isFinite(v))) return [];
  const [west, east, south, north] = values;
  if (east <= west || north <= south || east - west > 360 || south < -56 || north > 60) return [];
  const info = SOURCES[source];
  if (!info) throw new Error("无效的 SRTM 下载源。");
  const tiles = [];
  for (let lat = Math.floor(south); lat < Math.ceil(north); lat += 1) {
    for (let lon = Math.floor(west); lon < Math.ceil(east); lon += 1) {
      // Tile URLs use -180..179 even when the map crosses the date line.
      const tileLon = ((lon + 180) % 360 + 360) % 360 - 180;
      const name = `${lat >= 0 ? "N" : "S"}${String(Math.abs(lat)).padStart(2, "0")}${tileLon >= 0 ? "E" : "W"}${String(Math.abs(tileLon)).padStart(3, "0")}`;
      const latBand = name.slice(0, 3);
      const cached = tileCachePaths(cacheRoot, lat, tileLon, name);
      const filename = source === "ustc" ? `${name}.SRTMGL1.jp2` : `${name}.hgt.gz`;
      tiles.push({
        name, lat, lon, source, sourceLabel: info.label, format: info.format,
        url: source === "ustc"
          ? `https://mirrors.ustc.edu.cn/gmtdata/server/earth/earth_relief/earth_relief_01s_g/${filename}`
          : `https://s3.amazonaws.com/elevation-tiles-prod/skadi/${latBand}/${filename}`,
        downloadPath: source === "ustc" ? cached.jp2Path : cached.gzPath,
        hgtPath: cached.hgtPath,
        estimatedGzipBytes: 8 * 1024 * 1024
      });
    }
  }
  return tiles;
}

module.exports = { srtmSource, srtmTilesForRegion };
