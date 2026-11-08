const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const {buildScript,resolveGMT}=require('../electron/gmt');
const engine=resolveGMT();
if(process.platform==='win32'||!engine.available){console.log('GMT long-path regression skipped: needs POSIX GMT');process.exit(0);}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gmt-long-cache-'));
try{
 const long=path.join(root,'中文地形缓存目录'.repeat(3),'中文运行验证目录'.repeat(3));fs.mkdirSync(long,{recursive:true});
 const input=path.join(root,'source.nc'),dir=path.join(long,'map');fs.mkdirSync(dir);
 cp.execFileSync(engine.path,['grdmath','-R87/90/28/31','-I0.01','X','Y','ADD','=',input]);
 const config={plotType:'baseMap',region:'87.82/89.2/28.8/30.1',projection:'X10c/9c',frame:'0',outputName:'map',showTerrain:true,showTitle:false,localTerrainGridPath:input,terrainPreview:true,terrainResolution:'01m',terrainIntensity:.25,terrainCpt:'gray',terrainCacheDirectory:path.join(long,'cache'),pngDpi:72,legend:{show:false},cartography:{features:[]}};
 // Isolate the NetCDF cache-path regression from GMT's separate session-name limit.
 const runtime=path.join(root,'runtime');fs.mkdirSync(runtime);
 const script=buildScript([],config,dir,['pdf']).replace(/^export GMT_USERDIR=.*$/m,'export GMT_USERDIR='+runtime);const file=path.join(dir,'test.gmt');fs.writeFileSync(file,script);
 const log=cp.spawnSync('/bin/bash',[file],{encoding:'utf8'});assert.equal(log.status,0,log.stderr);assert(fs.existsSync(path.join(dir,'map.pdf')),log.stderr);
 assert(fs.statSync(path.join(dir,'map.pdf')).size>1000);
 const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
 const shade=walk(path.join(long,'cache')).find(f=>f.includes('阴影')&&f.endsWith('.nc'));assert(shade&&Buffer.byteLength(shade)>255);
 cp.execFileSync(engine.path,['grdinfo',path.basename(shade)],{cwd:path.dirname(shade),stdio:'pipe'});
 console.log('GMT_LONG_UTF8_CACHE_OK: real NetCDF grid/shade and PDF beyond 255-byte absolute paths');
}finally{fs.rmSync(root,{recursive:true,force:true});}
