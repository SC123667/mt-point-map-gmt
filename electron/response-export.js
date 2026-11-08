// Keep response plots independent of the map settings retained in the project.
// This only selects presentation options; impedance values are never changed.
function responseConfig(records, config = {}) {
  if (config.plotType !== 'responseCurve') return config;
  const station = records.find(r => r.name === config.curveStation) || records.find(r => r.mtResponses?.length);
  const custom = String(config.title || '').trim();
  return {...config,
    title: custom && custom !== 'MT Survey Stations' ? custom : (require("./response-collection").normalize(config.curveCollection).mode === 'single' ? `${station?.name || ''} MT response` : 'MT response curves'),
    showTerrain: false, showScale: false, showNorthArrow: false, swapAxes: false,
    interactiveMap: false, faultLayers: [], legend: {...config.legend, show: false},
    cartography: {...config.cartography, features: [],
      localLibrary: {...config.cartography?.localLibrary, enabled: false},
      contours: {...config.cartography?.contours, show: false}}
  };
}
module.exports = {responseConfig};
