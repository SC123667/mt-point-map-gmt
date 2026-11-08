// GSHHG levels: 1 = coast, 2 = lakes/wide rivers, 3 = islands in lakes,
// 4 = ponds on those islands. Keep inland outlines separate from sea fill.
const DEFAULTS = Object.freeze({coast: false, inland: false, fillSea: true, seaColor: '#edf4f7'});

function settings(value = {}) {
  value = value || {};
  return {
    coast: typeof value.coast === 'boolean' ? value.coast : DEFAULTS.coast,
    inland: typeof value.inland === 'boolean' ? value.inland : DEFAULTS.inland,
    fillSea: typeof value.fillSea === 'boolean' ? value.fillSea : DEFAULTS.fillSea,
    seaColor: /^#[\da-f]{6}$/i.test(value.seaColor) ? value.seaColor : DEFAULTS.seaColor
  };
}

function commands(config, region, prefix = '', hasTerrain = false) {
  if (config.swapAxes) return [];
  const water = settings(config.shorelines);
  const bounds = String(region).split('/').map(Number);
  // Filter tiny islands on regional maps, retaining them in local maps.
  const span = bounds.length === 4 && bounds.every(Number.isFinite)
    ? Math.max(bounds[1] - bounds[0], bounds[3] - bounds[2]) : 0;
  const minArea = span >= 8 ? 10 : span >= 2 ? 1 : 0;
  const base = `${prefix}gmt coast -R${region} -J${config.projection} -Di`;
  const sea = [!hasTerrain ? '-Ggray97' : '', water.fillSea ? `-S${water.seaColor}` : '',
    water.coast ? '-W1/0.25p,gray60' : ''].filter(Boolean);
  const result = sea.length ? [`${base} -A${minArea}/0/1 ${sea.join(' ')}`] : [];
  if (water.inland) {
    result.push(`${base} -A${minArea}/2/4 -W2/0.18p,gray65 -W3/0.18p,gray65 -W4/0.18p,gray65`);
  }
  return result;
}

module.exports = {DEFAULTS, settings, commands};
