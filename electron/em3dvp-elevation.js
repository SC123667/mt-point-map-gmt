// EM3DVP src/add_topobathy.m -> readmatrix -> interpolate_topography_grid.m:
// headerless longitude(degrees), latitude(degrees), elevation(metres), all finite.
const fs=require('fs'),fsp=fs.promises,path=require('path'),readline=require('readline');
const {spawn}=require('child_process'),{randomUUID}=require('crypto');
const {workspaceDirectory,asciiWorkspaceRoot}=require('./workspace');
const {safeName,placeName,regionLabel}=require('./terrain-cache');
function region(value){
 const raw=Array.isArray(value)?value:String(value||'').split('/');
 const r=raw.map(v=>v===null||v===undefined||String(v).trim()===''?NaN:Number(v));
 if(r.length!==4||!r.every(Number.isFinite)||r[0]<-180||r[1]>180||r[2]<-90||r[3]>90||r[0]>=r[1]||r[2]>=r[3])throw Error('请输入有效的西/东/南/北边界：经度 -180～180，纬度 -90～90，西小于东、南小于北；跨日期变更线请分区导出。');
 return r;
}
function gridInfo(text){
 const v=String(text).trim().split(/\s+/).map(Number);
 if(v.length!==12||![...v.slice(0,4),...v.slice(6)].every(Number.isFinite)||v[6]<=0||v[7]<=0||v[8]<2||v[9]<2||!Number.isInteger(v[8])||!Number.isInteger(v[9])||![0,1].includes(v[10])||![0,1].includes(v[11])||v[0]>=v[1]||v[2]>=v[3])throw Error('无法识别二维 GRD 网格信息，或网格不足两行两列。');
 return {west:v[0],east:v[1],south:v[2],north:v[3],min:v[4],max:v[5],dx:v[6],dy:v[7],nx:v[8],ny:v[9],registration:v[10],geographic:v[11]===1};
}
function sourceRegion(r,g){
 const tolerance=1e-7;
 if(r[2]<g.south-tolerance||r[3]>g.north+tolerance)throw Error('指定纬度范围超出 GRD 覆盖范围，请缩小范围或准备覆盖更大的地形缓存。');
 if(g.east-g.west>=360-tolerance)return r;
 for(const shift of [0,360,-360])if(r[0]+shift>=g.west-tolerance&&r[1]+shift<=g.east+tolerance)return [r[0]+shift,r[1]+shift,r[2],r[3]];
 throw Error('指定经度范围超出 GRD 覆盖范围，请缩小范围或准备覆盖更大的地形缓存。');
}
function abort(signal){if(signal?.aborted)throw Error('已取消高程导出。');}
function command(engine,args,cwd,signal,stream=false){
 abort(signal);
 const child=spawn(engine,args,{cwd,windowsHide:true,env:{...process.env,GMT_USERDIR:cwd,GMT_CACHEDIR:cwd,GMT_DATA_SERVER_LIMIT:'0'},stdio:['ignore','pipe','pipe']});
 let stderr='',stdout='';child.stderr.on('data',v=>stderr=(stderr+v.toString()).slice(-12000));
 if(!stream)child.stdout.on('data',v=>stdout=(stdout+v.toString()).slice(-100000));
 const kill=()=>child.kill();signal?.addEventListener('abort',kill,{once:true});
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{signal?.removeEventListener('abort',kill);if(signal?.aborted)reject(Error('已取消高程导出。'));else if(code!==0)reject(Error(stderr||'GMT 高程读取失败。'));else resolve(stdout);});});
 done.catch(()=>{});return {child,done};
}
async function writeXYZ(lines,file,{r,g,stride,factor,skipMissing,signal,onProgress=()=>{}}){
 const output=await fsp.open(file,'wx');let buffer='',rows=0,visited=0,missing=0,decimated=0,outside=0,first,second,noncollinear=false;
 const extent=[Infinity,-Infinity,Infinity,-Infinity,Infinity,-Infinity];
 try{for await(const line of lines){
  abort(signal);if(!line.trim())continue;
  const values=line.trim().split(/\s+/).map(Number);if(values.length!==3)throw Error('GMT 输出不是三列 XYZ，已停止导出。');
  let [lon,lat,z]=values;visited++;
  if(!Number.isFinite(lon)||!Number.isFinite(lat))throw Error('GRD 含无效经纬度。');
  const rawLon=lon+360*Math.ceil((g.west-lon-1e-8)/360);
  if(lon>180||lon< -180)lon=((lon+180)%360+360)%360-180;
  if(lon<r[0]-1e-8||lon>r[1]+1e-8||lat<r[2]-1e-8||lat>r[3]+1e-8){outside++;continue;}
  const col=Math.round((rawLon-g.west)/g.dx-g.registration/2),row=Math.round((g.north-lat)/g.dy-g.registration/2);
  if(col%stride!==0||row%stride!==0){decimated++;continue;}
  z*=factor;
  if(!Number.isFinite(z)){missing++;if(!skipMissing)throw Error('范围内含 NaN/无效高程，EM3DVP 无法读取。可选择“跳过无效格点”后重试；不会自动补零。');continue;}
  if(!first)first=[lon,lat];else if(!second&&(lon!==first[0]||lat!==first[1]))second=[lon,lat];else if(second&&Math.abs((second[0]-first[0])*(lat-first[1])-(second[1]-first[1])*(lon-first[0]))>1e-16)noncollinear=true;
  extent[0]=Math.min(extent[0],lon);extent[1]=Math.max(extent[1],lon);extent[2]=Math.min(extent[2],lat);extent[3]=Math.max(extent[3],lat);extent[4]=Math.min(extent[4],z);extent[5]=Math.max(extent[5],z);
  rows++;if(rows>5e6)throw Error('导出超过 500 万个高程点，请增加抽样步长或缩小范围。');
  buffer+=`${lon.toFixed(10)}\t${lat.toFixed(10)}\t${z.toFixed(6)}\n`;
  if(buffer.length>262144){await output.writeFile(buffer);buffer='';onProgress({percent:80,message:`正在写入高程：${rows.toLocaleString()} 点…`});}
 }
 if(rows<3||!noncollinear)throw Error('有效高程点不足或共线，请扩大范围、减小抽样步长或使用有效 GRD。');
 if(buffer)await output.writeFile(buffer);await output.sync();return {rows,visited,missing,decimated,outside,actualRegion:extent.slice(0,4),elevationRangeMeters:extent.slice(4)};
 }finally{await output.close();}
}
async function exportElevation(payload={},options={}){
 const {signal,onProgress=()=>{}}=options,r=region(payload.region);
 const stride=Number(payload.stride??1);if(!Number.isInteger(stride)||stride<1||stride>1000)throw Error('抽样步长必须为 1～1000 的整数。');
 const factor={m:1,km:1000,ft:.3048}[payload.unit||'m'];if(!factor)throw Error('请选择源高程单位：米、千米或英尺。');
 const source=path.resolve(String(payload.gridPath||''));
 if(!payload.gridPath||!['.grd','.nc'].includes(path.extname(source).toLowerCase()))throw Error('未获取到有效 GRD 或 NC 高程网格。');
 const stat=await fsp.stat(source).catch(()=>{throw Error('找不到地形缓存文件，请接入硬盘后重新获取地形。');});if(!stat.isFile())throw Error('GRD 路径不是文件。');
 abort(signal);
 const root=workspaceDirectory('导出高程/EM3DVP'),temporaryRoot=path.join(asciiWorkspaceRoot(),'tmp','em3dvp');await fsp.mkdir(temporaryRoot,{recursive:true});
 const temporary=await fsp.mkdtemp(path.join(temporaryRoot,'job-'));
 let stage;
 try{
  const engine=require('./gmt').resolveGMT();if(!engine.available)throw Error('未找到 GMT 引擎，请先在 GMT 设置中选择已安装引擎。');
  const input=path.join(temporary,'input.grd');
  // Safe ASCII input name also prevents GMT interpreting modifiers in a filename.
  try{await fsp.symlink(source,input);}catch{await fsp.copyFile(source,input);}
  onProgress({percent:52,message:'正在检查 GRD 坐标、范围与分辨率…'});
  const g=gridInfo(await command(engine.path,['grdinfo',input,'-Cn','--FORMAT_FLOAT_OUT=%.15g'],temporary,signal).done);
  if(!g.geographic&&!payload.confirmGeographic)throw Error('GRD 未声明经纬度坐标。若为投影坐标网格，请先重投影；仅在确认横纵坐标确为经度/纬度时勾选确认项。');
  const sourceBounds=sourceRegion(r,g),readCount=(Math.ceil((r[1]-r[0])/g.dx)+2)*(Math.ceil((r[3]-r[2])/g.dy)+2);
  if(readCount>25e6)throw Error('读取区域超过 2500 万个原始格点，请缩小范围或改用较粗的地形分辨率，避免高内存占用。');
  const infoText=await command(engine.path,['grdinfo',input],temporary,signal).done;
  const unitText=infoText.match(/(?:z|v)_units:\s*([^\r\n]*)/)?.[1]||'未声明';
  const knownUnit=/\b(km|kilomet)/i.test(unitText)?'km':/\b(ft|feet|foot)\b/i.test(unitText)?'ft':/\b(m|meter|metre|meters|metres)\b/i.test(unitText)?'m':null;
  if(knownUnit&&knownUnit!==(payload.unit||'m'))throw Error(`GRD 元数据高程单位为 ${knownUnit}，与所选单位不同，请修正后重试。`);
  abort(signal);
  const area=safeName(payload.areaName||placeName(r.join('/'))),id=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'')+'_'+randomUUID().slice(0,8);
  const destination=path.join(root,`${area}__${regionLabel(r.join('/'))}__${id}`);
  stage=path.join(root,'.generating-'+id);await fsp.mkdir(stage);
  const file=path.join(stage,'elevation_lonlat.xyz');
  onProgress({percent:60,message:'正在读取区域高程并生成 EM3DVP XYZ…'});
  const args=['grd2xyz',input,`-R${sourceBounds.join('/')}`,'-fog','--FORMAT_GEO_OUT=D','--FORMAT_FLOAT_OUT=%.15g'];
  const run=command(engine.path,args,temporary,signal,true),lines=readline.createInterface({input:run.child.stdout,crlfDelay:Infinity});
  let statistics;
  try{statistics=await writeXYZ(lines,file,{r,g,stride,factor,skipMissing:payload.skipMissing===true,signal,onProgress});await run.done;}
  catch(error){lines.close();run.child.kill();await run.done.catch(()=>{});throw error;}
  const end=await fsp.stat(source);if(end.size!==stat.size||end.mtimeMs!==stat.mtimeMs)throw Error('GRD 在读取期间发生变化，请重试。');
  const metadata={format:'EM3DVP longitude latitude elevation XYZ',columns:['longitude_degrees','latitude_degrees','elevation_meters'],source,sourceBytes:stat.size,sourceMtime:stat.mtime.toISOString(),sourceGrid:g,sourceUnits:unitText,inputUnit:payload.unit||'m',verticalDatum:'沿用源 GRD；未进行高程基准转换',requestedRegion:r,sampling:{stride,method:'原始格点抽取；不插值、不平滑',effectiveSpacingDegrees:[g.dx*stride,g.dy*stride]},skipMissing:payload.skipMissing===true,...statistics,gmt:engine.version,createdAt:new Date().toISOString()};
  await fsp.writeFile(path.join(stage,'来源与高程信息.json'),JSON.stringify(metadata,null,2)+'\n');
  await fsp.writeFile(path.join(stage,'EM3DVP导入说明.txt'),`导入文件：elevation_lonlat.xyz\n无表头、制表符分隔：经度（度） 纬度（度） 高程（米）。\n在 EM3DVP 先加载 EDI 并生成模型，再通过“添加地形/水深”（add_topobathy）选择此 XYZ 文件；也可在精细地形设置中选择它。\n不要选择 GRD、JSON 或原始投影坐标文件。保留海拔正负值，未转为模型深度。\n请求范围：${r.join('/')}\n实际格点范围：${statistics.actualRegion.join('/')}\n有效点数：${statistics.rows}；跳过无效点：${statistics.missing}。\n抽样步长：${stride}；不是重采样插值。实际覆盖以来源与高程信息.json 为准。\n地形应覆盖核心模型范围；缺测孔洞/范围之外的地形不会在此文件中补造，EM3DVP 自己的插值与扩边可能填补它们。\n源高程基准未改变，海水深度为负值时照原值导出。\n`);
  abort(signal);await fsp.rename(stage,destination);stage=null;
  onProgress({percent:100,message:`高程导出完成：${statistics.rows.toLocaleString()} 点。`});
  return {ok:true,filePath:path.join(destination,'elevation_lonlat.xyz'),directory:destination,...metadata};
 }finally{if(stage)await fsp.rm(stage,{recursive:true,force:true}).catch(()=>{});await fsp.rm(temporary,{recursive:true,force:true}).catch(()=>{});}
}
// Match the same terrain cache used by the map. Never use hillshade or a
// display-preview grid as elevation, and never silently choose coarser data.
async function findCachedGrid(config={}, {signal}={}) {
 const r=region(config.region),root=workspaceDirectory('地形缓存');
 if(config.localTerrainGridPath){
  let tmp;
  try{
   if((await fsp.stat(config.localTerrainGridPath)).isFile()){
    const engine=require('./gmt').resolveGMT();
    const base=path.join(asciiWorkspaceRoot(),'tmp','em3dvp');await fsp.mkdir(base,{recursive:true});tmp=await fsp.mkdtemp(path.join(base,'probe-'));
    const input=path.join(tmp,'input.grd');try{await fsp.symlink(path.resolve(config.localTerrainGridPath),input);}catch{await fsp.copyFile(config.localTerrainGridPath,input);}
    const g=gridInfo(await command(engine.path,['grdinfo',input,'-Cn','--FORMAT_FLOAT_OUT=%.15g'],tmp,signal).done);
    sourceRegion(r,g);return {gridPath:config.localTerrainGridPath,source:'当前已导入且覆盖范围的本地地形'};
   }
  }catch{abort(signal);}finally{if(tmp)await fsp.rm(tmp,{recursive:true,force:true});}
 }
 const resolution=config.terrainResolution||'06m';
 const exact=require('./gmt').terrainPaths(root,{...config,terrainCacheDirectory:root,terrainPreview:false,localTerrainGridPath:''});
 try{if((await fsp.stat(exact.gridPath)).isFile())return {gridPath:exact.gridPath,source:'当前范围地形缓存'};}catch{}
 const parent=path.join(root,'区域地形'),candidates=[];
 for(const entry of await fsp.readdir(parent,{withFileTypes:true}).catch(()=>[])){
  abort(signal);if(!entry.isDirectory())continue;const dir=path.join(parent,entry.name);
  let bounds;try{bounds=region(JSON.parse(await fsp.readFile(path.join(dir,'区域说明.json'),'utf8')).region);}catch{continue;}
  if(bounds[0]>r[0]||bounds[1]<r[1]||bounds[2]>r[2]||bounds[3]<r[3])continue;
  for(const name of await fsp.readdir(dir))if(name.startsWith('earth_relief_'+resolution+'_')&&name.endsWith('.nc')&&!name.includes('_阴影')&&!name.includes('_本地')&&!name.includes('_处理中'))candidates.push({gridPath:path.join(dir,name),source:'覆盖指定范围的地形缓存',area:(bounds[1]-bounds[0])*(bounds[3]-bounds[2])});
 }
 candidates.sort((a,b)=>a.area-b.area);return candidates[0]||null;
}
module.exports={region,gridInfo,sourceRegion,writeXYZ,exportElevation,findCachedGrid};
