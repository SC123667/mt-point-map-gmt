const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {writeSrtmRaster,gridLayout}=require('../electron/srtm-grid');
const tc=require('../electron/terrain-cache');
const {workspaceFile,areaOutputDirectory}=require('../electron/workspace');
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'workspace-terrain-'));
 const old=process.env.MT_GMT_WORKSPACE;process.env.MT_GMT_WORKSPACE=tmp;
 try{
  const config={region:'86/96/28/32',terrainResolution:'01s',terrainIntensity:.65,showTerrain:true,terrainCacheDirectory:path.join(tmp,'cache')};
  const p=tc.cachePaths('/one',config),q=tc.cachePaths('/two',config);
  assert.strictEqual(p.key,q.key);assert.strictEqual(p.gridPath,q.gridPath);
  assert(p.gridPath.includes('拉萨-林芝-日喀则'));
  const other=tc.cachePaths('/two',{...config,terrainIntensity:.9});assert.strictEqual(p.gridPath,other.gridPath);assert.notStrictEqual(p.shadePath,other.shadePath);
  const preview=tc.previewConfig(config);assert.strictEqual(config.terrainResolution,'01s');assert.strictEqual(preview.terrainResolution,'30s');assert.notStrictEqual(tc.cachePaths(tmp,preview).gridPath,p.gridPath);
  assert(areaOutputDirectory(preview).startsWith(path.join(tmp,'预览文件')));assert(areaOutputDirectory(config).startsWith(path.join(tmp,'导出图件')));
  assert.throws(()=>workspaceFile(path.join(tmp,'../escape.txt')),/全局工作目录/);
  const script=require('../electron/gmt').buildScript([],{...config,plotType:'baseMap',projection:'M20c',frame:'af',outputName:'map',showLabels:false},tmp);
  assert(script.indexOf('export GMT_USERDIR')<script.indexOf('gmt begin'),'cache environment must precede modern GMT session');
  assert(script.includes('gmt begin map '),'output prefix must not contain a directory with spaces');
  assert(script.includes('cd '));
  assert.throws(()=>tc.ensureCacheRoot('/Volumes/MT-GMT-missing-test-volume/cache'),/未连接/);
  assert(Buffer.byteLength(path.basename(tc.cachePaths(tmp,{...config,terrainRegionName:'中'.repeat(90)}).shadePath))<255);
  const tilePath=path.join(tmp,'tile.hgt'),data=Buffer.alloc(3601*3601*2);
  // A sloping surface catches row reversal, column reversal and incorrect coarse strides.
  for(let row=0;row<3601;row++)for(let col=0;col<3601;col++)data.writeInt16BE(row-col,(row*3601+col)*2);
  data.writeInt16BE(-32768,0);data.writeInt16BE(32767,2);fs.writeFileSync(tilePath,data);
  const tiles=[{name:'N00E000',lat:0,lon:0,hgtPath:tilePath}];
  for(const step of [1,3,30]){
   const region=`0/${90/3600}/${1-90/3600}/1`,out=path.join(tmp,step+'.bin');
   const layout=await writeSrtmRaster(tiles,region,step,out);const raster=fs.readFileSync(out);
   assert.strictEqual(raster.length,layout.width*layout.height*2);
   for(let row=0;row<layout.height;row++)for(let col=0;col<layout.width;col++)assert.strictEqual(raster.readInt16BE((row*layout.width+col)*2),data.readInt16BE((row*step*3601+col*step)*2));
  }
  const layout=gridLayout('0.0001/0.001/0.999/0.9999',3);assert(layout.west<=.0001*3600&&layout.east>=.001*3600);
  // Adjacent latitude bands: the north edge must come from the north tile.
  const north=Buffer.alloc(data.length);for(let i=0;i<north.length;i+=2)north.writeInt16BE(900,i);
  const northPath=path.join(tmp,'north.hgt');fs.writeFileSync(northPath,north);
  const seam=path.join(tmp,'seam.bin');await writeSrtmRaster([...tiles,{name:'N01E000',lat:1,lon:0,hgtPath:northPath}],'0/0.001/0.999/1.001',1,seam);
  assert.strictEqual(fs.readFileSync(seam).readInt16BE(0),900);
  let paused=false;await assert.rejects(writeSrtmRaster(tiles,'0/0.1/0.9/1',1,path.join(tmp,'cancel.bin'),{waitIfPaused:()=>{paused=true;},shouldCancel:()=>paused}),/取消/);
  console.log('Global workspace, shared cache, preview isolation and binary SRTM tests passed');
 }finally{if(old===undefined)delete process.env.MT_GMT_WORKSPACE;else process.env.MT_GMT_WORKSPACE=old;fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
