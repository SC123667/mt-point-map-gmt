const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const palettes=require('../electron/terrain-palettes'),gmt=require('../electron/gmt');
const ref='/Volumes/MacBook Pro SSD/GMT-缓存/配色预览/地形配色对比_20261103';
for(const id of ['B','C','F'])assert.equal(palettes.terrainCPT('terrain'+id,{min:0,max:3500,step:500}),fs.readFileSync(path.join(ref,id+'.cpt'),'utf8'),'Match user-selected preview '+id);
const rows=palettes.terrainCPT('terrainF',{min:-100,max:2100,step:500}).split('\n').filter(l=>/^-?\d/.test(l)).map(l=>l.split(' '));
assert.equal(rows.length,5);assert.equal(rows[0][0],'-100');assert.equal(rows.at(-1)[2],'2100');assert(rows.every(r=>r[1]===r[3]));
for(let i=1;i<rows.length;i++)assert.equal(rows[i-1][2],rows[i][0]);
assert.throws(()=>palettes.terrainCPT('terrainF',{min:0,max:3500,step:1}),/分级过密/);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'terrain-palettes-'));
try{
 const base={plotType:'baseMap',region:'110/115/38/42',projection:'M16c',showTerrain:true,terrainResolution:'15s',terrainGridPath:path.join(dir,'grid.nc'),terrainShadePath:path.join(dir,'shade.nc'),terrainColorbar:{min:0,max:3500,step:500},frame:'af'};
 fs.writeFileSync(base.terrainGridPath,'test');fs.writeFileSync(base.terrainShadePath,'test');
 for(const id of ['B','C','F']){
  const c={...base,terrainCpt:'terrain'+id},before=JSON.stringify(c),script=gmt.buildScript([],c,dir,['pdf']);
  assert.equal(JSON.stringify(c),before);assert(!script.includes('makecpt -Cterrain'));assert.equal((script.match(new RegExp('terrain_terrain'+id+'\\.cpt','g'))||[]).length,2);assert(script.includes('COLOR_HSV_MIN_S 0'));
  assert(!gmt.buildScript([],{...c,plotType:'stationMap'},dir,['pdf']).includes('gmt colorbar'));
 }
 console.log('BCF palettes match approved previews; custom ranges, discrete intervals, shared CPT and visibility passed');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
