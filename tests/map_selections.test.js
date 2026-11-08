const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const s=require('../electron/map-selections'),c=require('../electron/cartography'),g=require('../electron/gmt'),legend=require('../electron/legend');
const records=[{name:'same',lon:1,lat:1},{name:'same',lon:2,lat:2},{name:'third',lon:3,lat:3},{name:'outside',lon:20,lat:20}];
const assignments={[s.stationKey(records[0])]:'LMT',[s.stationKey(records[1])]:'BMT',[s.stationKey(records[3])]:'AMT'};
const config={plotType:'stationMap',region:'0/4/0/4',projection:'M12c',frame:'af',showTitle:false,pointSymbol:'c',pointSize:.15,pointFill:'#222222',pointPenWidth:.3,pointPenColor:'#000000',cartography:{language:'en'},stationClasses:{enabled:true,assignments}};
const compiled=s.classifiedConfig(records,config);assert.deepEqual(compiled.stationGroups.map(g=>g.id),['LMT','BMT','unclassified']);assert(legend.buildLegendEntries(compiled).every(e=>!e.label.includes('AMT')));assert(legend.buildLegendEntries(compiled).some(e=>e.label.includes('Unclassified')));
assert.equal(s.classifiedConfig(records,{stationGroups:[{id:'old'}]}).stationGroups[0].id,'old');assert.deepEqual(s.classes(JSON.parse(JSON.stringify(config.stationClasses))).assignments,assignments);
const box=s.regionBox({name:'Study area',bounds:[1,3,1,3],style:{strokeOpacity:70,opacity:20,fill:'#abcdef'}});assert.equal(box.geometry.coordinates[0].length,129);assert.deepEqual(c.normalize({features:[box]}).features[0].properties.regionBox,[1,3,1,3]);assert.equal(c.style(box.style).opacity,20);assert.equal(c.style(box.style).strokeOpacity,70);
assert.deepEqual(s.bounds([170,-170,-10,10]),[170,190,-10,10]);for(const b of [[1,1,0,1],[1,2,3,2],['',2,0,1],[1,2,-91,1]])assert.throws(()=>s.bounds(b));
assert(s.boxGeometry([170,-170,-10,10]).coordinates[0].every(([lon])=>lon>=170&&lon<=190));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gmt-selections-'));try{const script=g.buildScript(records,{...config,cartography:{...config.cartography,features:[box]}},dir,['pdf']);assert(script.includes('-Ss0.180c'));assert(script.includes('-St0.180c'));assert(script.includes('#abcdef@80'));assert(script.includes('#ac4843@30'));
 const files=fs.readdirSync(dir);const first=fs.readFileSync(path.join(dir,files.find(n=>n.includes('_LMT.tsv'))),'utf8');const second=fs.readFileSync(path.join(dir,files.find(n=>n.includes('_BMT.tsv'))),'utf8');assert.deepEqual(first.trim().split(/\s+/).slice(0,2).map(Number),[1,1]);assert.deepEqual(second.trim().split(/\s+/).slice(0,2).map(Number),[2,2]);assert.equal(first.trim().split('\n').length,1);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log('Region boxes and station classes: bounds, date line, opacity, duplicate names, persistence and actual GMT script grouping passed');
