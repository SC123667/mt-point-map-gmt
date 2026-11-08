const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {execFileSync}=require('child_process');
const bar=require('../electron/terrain-colorbar'),auto=require('../electron/terrain-autoscale');
async function main(){
 assert.deepEqual(bar.elevationSummary([{elevation:null},{elevation:''},{elevation:'bad'},{elevation:-9999},{elevation:1e32},{elevation:0},{elevation:2454}]),{count:2,max:2454});
 assert.deepEqual(bar.elevationSummary([{lon:110,lat:40,elevation:2454},{lon:100,lat:40,elevation:7000}], '109/111/39/41'),{count:1,max:2454});
 for(const [observed,max,step] of [[2454,2500,500],[3060,3500,500],[7800,8000,1000],[683,700,100],[1300,1400,200],[1660,1750,250]]){
  const actual=bar.autoScale({},observed);assert.equal(actual.max,max);assert.equal(actual.step,step);
 }
 for(let z=1;z<12000;z+=37){const actual=bar.autoScale({},z);assert(actual.max>=z);assert(Number.isInteger(actual.max)&&Number.isInteger(actual.step));}
 assert.equal(bar.autoScale({autoRange:false,max:9000,step:300},3060).max,9000);
 assert.equal(bar.autoScale({max:6000},null).max,6000);
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'terrain-auto-test-'));
 try{
  const gmt=require('../electron/gmt').resolveGMT();assert(gmt.available,'GMT is required for the crop/long-path regression');
  execFileSync(gmt.path,['grdmath','-R0/4/0/2','-I1','X','1000','MUL','=','grid.nc'],{cwd:tmp});
  const long=path.join(tmp,'地形长路径测试'.repeat(10),'中文图幅'.repeat(10));fs.mkdirSync(long,{recursive:true});
  const grid=path.join(long,'地形.nc');fs.copyFileSync(path.join(tmp,'grid.nc'),grid);assert(Buffer.byteLength(grid)>255);
  assert.equal(await auto.gridMaximum(grid,'0/4/0/2',gmt.path),4000);
  assert.equal(await auto.gridMaximum(grid,'0/1/0/2',gmt.path),1000,'Use only the current map footprint');
  const config={showTerrain:true,region:'0/1/0/2',localTerrainGridPath:grid,terrainColorbar:{}};
  const records=[{lon:.5,lat:1,elevation:1132}];
  const r=await auto.resolve(records,config,tmp);assert.equal(r.terrainMax,1000);assert.equal(r.ediMax,1132);assert.equal(r.settings.max,1200);assert.equal(r.settings.step,200);
  const manual=await auto.resolve(records,{...config,terrainColorbar:{autoRange:false,max:1900,step:100}},tmp);assert.equal(manual.settings.max,1900);assert.equal(manual.source,'manual');
  const missing=await auto.resolve(records,{...config,localTerrainGridPath:path.join(tmp,'missing')},tmp);assert.equal(missing.source,'stations');assert.equal(missing.settings.max,1200);
  const none=await auto.resolve([],{...config,localTerrainGridPath:path.join(tmp,'missing'),terrainColorbar:{max:6000}},tmp);assert.equal(none.source,'fallback');assert.equal(none.settings.max,6000);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
 console.log('Auto elevation: readable integer intervals, upward coverage, manual override, missing data, cropped DEM and long paths passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
