const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const bar=require('../electron/terrain-colorbar'),gmt=require('../electron/gmt');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'terrain-bar-'));
try{
 const base={plotType:'baseMap',region:'110/115/38/42',projection:'M16c',showTerrain:true,terrainCpt:'paper',terrainResolution:'15s',terrainGridPath:path.join(dir,'grid.nc'),terrainShadePath:path.join(dir,'shade.nc'),terrainColorbar:{min:0,max:3500,step:500},presentation:{},frame:'af'};
 fs.writeFileSync(base.terrainGridPath,'test');fs.writeFileSync(base.terrainShadePath,'test');
 for(const unit of ['m','km']){
  const config={...base,terrainColorbar:{...base.terrainColorbar,unit}},before=JSON.stringify(config),script=gmt.buildScript([],config,dir,['pdf']);assert.equal(JSON.stringify(config),before,'No config mutation');assert(script.includes('gmt colorbar'));assert(script.includes('-DJBC'));assert(script.includes('+h+jTC')); assert(script.includes('-Bxa'+(unit==='km'?.5:500)));assert(script.includes('-W'+(unit==='km'?.001:1)));
  const cpt=fs.readFileSync(path.join(dir,'terrain_paper.cpt'),'utf8');assert(cpt.includes('0 #dce7ea'));assert(cpt.includes('3500 #faf9f5'));assert.equal((script.match(/terrain_paper\.cpt/g)||[]).length,2,'Map and legend share exactly the same CPT');
 }
 assert(!gmt.buildScript([],{...base,terrainColorbar:{show:false}},dir,['pdf']).includes('gmt colorbar'));
 assert(!gmt.buildScript([],{...base,showTerrain:false},dir,['pdf']).includes('gmt colorbar'));
 for(const plotType of ['stationMap','phaseTensorMap','tipperMap','strike','responseCurve',undefined])assert.equal(bar.command({...base,plotType},'test.cpt',base.region,JSON.stringify),'',plotType+' must not show elevation bar');
 assert(!gmt.buildScript([],{...base,plotType:'stationMap'},dir,['pdf']).includes('gmt colorbar'));
 const optedIn={...base,terrainColorbar:{show:false,showStation:true}};
 assert(gmt.buildScript([],{...optedIn,plotType:'stationMap'},dir,['pdf']).includes('gmt colorbar'));
 assert(!gmt.buildScript([],optedIn,dir,['pdf']).includes('gmt colorbar'));
 for(const plotType of ['strikeMap','phaseTensorMap','tipperMap','responseCurve'])
  assert.equal(bar.command({...optedIn,plotType},'test.cpt',base.region,JSON.stringify),'');
 assert(!gmt.buildScript([],{...optedIn,showTerrain:false,plotType:'stationMap'},dir,['pdf']).includes('gmt colorbar'));
 assert.throws(()=>bar.validate({min:100,max:50}),/上限/);
 assert(gmt.buildScript([],{...base,terrainCpt:'geo'},dir,['pdf']).includes('gmt makecpt -Cgeo -T0/3500 -Z -H'));
 console.log('Elevation legend: shared CPT, units, persistence-safe rendering, visibility and range validation passed');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
