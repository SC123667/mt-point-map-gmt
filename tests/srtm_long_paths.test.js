const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {fork,spawnSync}=require('child_process');
const gmt=require('../electron/gmt'),cache=require('../electron/terrain-cache'),source=require('../electron/srtm-source');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'srtm-path-regression-'));
function run(config,gmtInfo,worker=path.join(__dirname,'../electron/srtm-worker.js')){
 return new Promise((resolve,reject)=>{const states=[],child=fork(worker,[],{stdio:['ignore','ignore','pipe','ipc']});let stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('SRTM worker timeout'));},30000);
 child.stderr.on('data',c=>stderr+=c);child.on('error',reject);child.on('message',m=>{if(m.type==='status')states.push(m.status);});child.on('exit',code=>{clearTimeout(timer);resolve({code,status:states.at(-1),states,stderr});});child.send({type:'start',payload:{gmtInfo,config,outputDirectory:tmp}});});
}
(async()=>{try{
 const info=gmt.resolveGMT();assert(info.path,'Installed GMT required for real NetCDF path regression');
 const config={region:'0/0.01/0.99/1',terrainResolution:'03s',terrainIntensity:.25,terrainAllowDownload:false,terrainCacheDirectory:path.join(tmp,'含空格的中文地形目录'.repeat(5),'区域缓存'.repeat(8))};
 const paths=gmt.terrainPaths(tmp,config);cache.initializeArea(paths,config);assert(Buffer.byteLength(paths.shadePath)>255);
 const tile=source.srtmTilesForRegion(config.region,paths.root,source.srtmSource(config))[0];fs.mkdirSync(path.dirname(tile.hgtPath),{recursive:true});const data=Buffer.alloc(3601*3601*2);
 for(let y=0;y<=36;y++)for(let x=0;x<=36;x++)data.writeInt16BE(100+y*y+x*3,(y*3601+x)*2);fs.writeFileSync(tile.hgtPath,data);
 const first=await run(config,info);assert.equal(first.code,0,JSON.stringify(first));assert.equal(first.status.state,'completed');
 const check=spawnSync(info.path,['grdinfo',path.basename(paths.shadePath),'-Cn','-L2'],{cwd:paths.directory,encoding:'utf8'});assert.equal(check.status,0,check.stderr);const values=check.stdout.trim().split(/\s+/).map(Number);assert(values[4]<values[5],'Nonconstant numeric shade grid');
 const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(paths.gridPath)).digest('hex'),before=hash();fs.unlinkSync(paths.shadePath);
 const resumed=await run(config,info);assert.equal(resumed.code,0,JSON.stringify(resumed));assert.equal(hash(),before,'Existing elevation unchanged');assert(!resumed.states.some(s=>['download','convert','xyz2grd'].includes(s.step)),'Reuse cached grid without downloading or rebuilding');
 if(process.platform!=='win32'){
  const bad=path.join(tmp,'zero-exit-gmt.sh');fs.writeFileSync(bad,'#!/bin/sh\necho "specific NetCDF failure" >&2\nfor arg in "$@"; do case "$arg" in -G*) : > "${arg#-G}";; esac; done\nexit 0\n',{mode:0o755});fs.unlinkSync(paths.shadePath);
  const failed=await run(config,{path:bad,binDir:tmp});assert.equal(failed.code,1);assert.match(failed.status.message,/specific NetCDF failure/);assert(!fs.existsSync(paths.shadePath),'Empty output must not be published');
 }
 console.log('SRTM long UTF-8 paths: real xyz2grd + grdgradient, cached-grid resume, valid shade and zero-exit error details passed');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
