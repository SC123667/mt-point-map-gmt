const assert=require('assert');
const {responseConfig}=require('../electron/response-export');
const records=[{name:'A',mtResponses:[{period:1}]},{name:'中文站',mtResponses:[{period:2}]}];
const config={plotType:'responseCurve',curveStation:'中文站',title:'MT Survey Stations',showTitle:false,swapAxes:true,showTerrain:true,showScale:true,showNorthArrow:true,legend:{show:true},cartography:{features:[{id:'mine'}],localLibrary:{enabled:true},contours:{show:true}}};
const before=JSON.stringify({config,records}),result=responseConfig(records,config);
assert.equal(result.title,'中文站 MT response');
for(const key of ['showTitle','showTerrain','showScale','showNorthArrow','swapAxes','interactiveMap'])assert.equal(result[key],false,key);
assert(!result.legend.show&&!result.cartography.contours.show&&!result.cartography.localLibrary.enabled);assert.deepEqual(result.cartography.features,[]);
assert.equal(JSON.stringify({config,records}),before,'Map config and impedance data must not mutate');
assert.equal(responseConfig(records,{...config,title:'自定义标题'}).title,'自定义标题');
const map={plotType:'stationMap',showTerrain:true};assert.strictEqual(responseConfig(records,map),map);
console.log('Response export config: station title, map option isolation, bilingual/title off, unchanged data passed');

assert.equal(responseConfig(records,{...config,curveCollection:{mode:'panels'}}).title,'MT response curves');
