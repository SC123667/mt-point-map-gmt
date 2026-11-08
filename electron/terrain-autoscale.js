const fs=require('fs'),os=require('os'),path=require('path');
const {promisify}=require('util'),execFile=promisify(require('child_process').execFile);
const bar=require('./terrain-colorbar');
const cache=new Map();
async function gridMaximum(file,region,gmtPath){
 const stat=fs.statSync(file),real=fs.realpathSync(file),key=JSON.stringify([real,stat.size,stat.mtimeMs,region,gmtPath]);
 if(cache.has(key))return cache.get(key);
 const pending=(async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mt-elevation-'));
  try{
   // GMT may silently fail on long UTF-8 paths. Use a short, private alias.
   const input=path.join(temp,'grid.nc');
   if(process.platform==='win32')fs.copyFileSync(real,input);else fs.symlinkSync(real,input);
   const args=['grdinfo','grid.nc','-Cn','-L0','--FORMAT_FLOAT_OUT=%.15g'];
   if(region)args.push('-R'+region);
   const {stdout}=await execFile(gmtPath,args,{cwd:temp,timeout:30000,maxBuffer:1024*1024,windowsHide:true,env:{...process.env,OMP_NUM_THREADS:'1',GMT_AUTO_DOWNLOAD:'off'}});
   const columns=stdout.trim().split(/\s+/).map(Number),max=columns[5];
   if(columns.length<10||!Number.isFinite(max)||max < -12000||max>12000)throw Error('无法读取图幅地形峰值');
   return max;
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
 })();
 cache.set(key,pending);if(cache.size>32)cache.delete(cache.keys().next().value);
 try{return await pending;}catch(error){cache.delete(key);throw error;}
}
async function resolve(records,config,outputDirectory){
 const p=bar.settings(config.terrainColorbar);if(!p.autoRange)return {settings:p,source:'manual'};
 const edi=bar.elevationSummary(records,config.region);let terrainMax=null,warning='';
 if(config.showTerrain){
  try{
   const gmt=require('./gmt'),paths=[];
   if(config.localTerrainGridPath)paths.push(config.localTerrainGridPath);
   else{
    paths.push(gmt.terrainPaths(outputDirectory,{...config,terrainPreview:false,terrainResolution:config.terrainRequestedResolution||config.terrainResolution}).gridPath);
    paths.push(config.terrainGridPath,gmt.terrainPaths(outputDirectory,config).gridPath);
   }
   const file=paths.find(p=>p&&fs.existsSync(p));
   if(file){const engine=gmt.resolveGMT();if(!engine.available)throw Error('GMT 不可用');terrainMax=await gridMaximum(file,config.region,engine.path);}
   else warning='地形尚未准备，暂按测点高程估算';
  }catch(error){warning='地形峰值校核失败，暂按测点高程估算';}
 }
 const maxima=[edi.max,terrainMax].filter(v=>v!=null),observedMax=maxima.length?Math.max(...maxima):null;
 return {settings:bar.autoScale(p,observedMax),source:terrainMax!=null?'terrain':edi.count?'stations':'fallback',ediCount:edi.count,ediMax:edi.max,terrainMax,observedMax,warning};
}
module.exports={resolve,gridMaximum};
