// Network, shapefile reprojection, indexing and filtering stay off the UI thread.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {SOURCES}=require('./geodata-sources'),model=require('./cartography');
const {workspaceDirectory}=require('./workspace');
const {safeName,placeName,regionLabel}=require('./terrain-cache');
const controller=new AbortController();
const progress=message=>process.connected&&process.send({type:'progress',progress:{message}});
async function download(url) {
 const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))throw new Error('请输入 HTTP 或 HTTPS 数据地址。');
 const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(90000)]);
 const response=await fetch(parsed,{signal,headers:{'User-Agent':'MT-GMT/1.6.0 (desktop geoscience mapping)'}});
 if(!response.ok)throw new Error(`数据服务返回 HTTP ${response.status}`);
 const reader=response.body.getReader(),chunks=[];let count=0;const total=Number(response.headers.get('content-length'));
 while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>150*1024*1024){await reader.cancel();throw new Error('单次下载超过 150 MB，请缩小区域或下载后从本地导入。');}chunks.push(Buffer.from(value));progress(`下载 ${(count/1048576).toFixed(1)} MB${total?' / '+(total/1048576).toFixed(1)+' MB':''}`);}
 return {bytes:Buffer.concat(chunks),etag:response.headers.get('etag')||'',url:response.url};
}
function cacheSource(s){return path.join(workspaceDirectory('构造数据'),safeName(s.name));}
function saveAtomic(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+`.${process.pid}.partial`;fs.writeFileSync(tmp,data);fs.renameSync(tmp,file);}
function sourceMetadata(source,bytes,extra={}){return {id:source.id,name:source.name,homepage:source.homepage||'',url:source.url||'',license:source.license||'以提供方授权为准',licenseUrl:source.licenseUrl||'',citation:source.citation||'',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),downloadedAt:new Date().toISOString(),...extra};}
async function sourceData(id,refresh=false) {
 const s=SOURCES.find(x=>x.id===id);if(!s?.url)throw new Error('该来源需要在官网获取数据，或填写它提供的 WFS 服务地址。');
 const root=cacheSource(s),file=path.join(root,safeName(s.name)+'_完整数据.geojson'),meta=file+'.来源.json';
 if(fs.existsSync(file)&&fs.existsSync(meta)&&!refresh){const source={...JSON.parse(fs.readFileSync(meta,'utf8')),license:s.license,licenseUrl:s.licenseUrl,citation:s.citation};saveAtomic(meta,JSON.stringify(source,null,2));return {data:JSON.parse(fs.readFileSync(file,'utf8')),source};}
 progress(`连接 ${s.name}…`);const r=await download(s.url),data=JSON.parse(r.bytes.toString('utf8'));model.collection(data,s); // Validate before replacing a usable cache.
 const source=sourceMetadata(s,r.bytes,{etag:r.etag,resolvedUrl:r.url});
 saveAtomic(file,r.bytes);saveAtomic(meta,JSON.stringify(source,null,2));
 return {data,source};
}
function search(features,query,region){const q=String(query||'').trim().toLowerCase();const aliases={'雅鲁藏布':'yarlung','班公':'bangong','怒江':'nujiang','喜马拉雅':'himalay','拉萨':'lhasa','日喀则':'xigaze','林芝':'nyingchi'};const qs=[q,...Object.entries(aliases).filter(([a])=>q.includes(a)).map(([,b])=>b)];return features.filter(f=>model.inRegion(f,region)&&(!q||qs.some(x=>[f.name,f.category,f.properties.Name,f.properties.name,f.properties.fz_name].join(' ').toLowerCase().includes(x))));}
function results(features,p,source,issues=[]) {
 const selected=search(features,p.query,p.region),limit=Math.max(1,Math.min(Number(p.limit)||1000,20000));
 return {features:selected.slice(0,limit),total:selected.length,source,issues,truncated:selected.length>limit};
}
async function importFile(file,source={}) {
 const ext=path.extname(file).toLowerCase(),bytes=fs.readFileSync(file);if(bytes.length>250*1048576)throw new Error('文件超过 250 MB，请先按研究区裁剪。');
 source=sourceMetadata({id:'local-'+crypto.createHash('sha1').update(file).digest('hex').slice(0,10),name:path.basename(file),...source},bytes,{originalPath:file});
 let data;
 if(['.shp','.zip'].includes(ext)){
  const shp=(await import('shpjs')).default;
  if(ext==='.zip')data=await shp(bytes);
  else {const obj={shp:bytes};for(const key of ['dbf','prj','cpg']){const f=file.slice(0,-4)+'.'+key;if(fs.existsSync(f))obj[key]=fs.readFileSync(f);}data=await shp(obj);}
 }else if(['.csv','.tsv','.txt','.xlsx','.xls'].includes(ext)){
  const XLSX=require('xlsx'),book=XLSX.read(bytes,{type:'buffer'}),rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1}).filter(r=>r.length);
  if(rows.length&&/经度|lon/i.test(rows[0].join(' ')))rows.shift();
  return {features:model.parsePaste(rows.map(r=>r.join('\t')).join('\n')),issues:[],source};
 }else if(['.gmt','.xy','.dat'].includes(ext)){
  let name=path.basename(file,ext),coords=[],features=[];
  const flush=()=>{if(coords.length>=2)features.push(model.feature({name,geometry:{type:'LineString',coordinates:coords}},features.length,source));coords=[];};
  for(const line of bytes.toString('utf8').split(/\r?\n/)){if(line.startsWith('>')){flush();name=line.slice(1).trim()||name;}else if(line.trim()&&!line.startsWith('#')){const c=line.trim().split(/[\s,]+/).slice(0,2).map(Number);coords.push(c);}}flush();return {features,issues:[],source};
 }else data=JSON.parse(bytes.toString('utf8'));
 const all=Array.isArray(data)?data:[data],features=[],issues=[];for(const d of all){const c=model.collection(d,source);features.push(...c.features);issues.push(...c.issues);}
 return {features,issues,source};
}
function wfsURL(p,request){const u=new URL(p.url);for(const k of [...u.searchParams.keys()])if(['service','request','version','typename','typenames','srsname','bbox','outputformat','count','maxfeatures','startindex'].includes(k.toLowerCase()))u.searchParams.delete(k);u.searchParams.set('service','WFS');u.searchParams.set('version',p.version||'2.0.0');u.searchParams.set('request',request);return u;}
async function handle(p){
 if(p.mode==='export'){const c=model.normalize(p.cartography),area=p.region?`${safeName(placeName(p.region))}__${regionLabel(p.region)}`:'自定义图层';const file=path.join(workspaceDirectory('导出图件'),area,'自定义构造与地点.geojson');saveAtomic(file,JSON.stringify(model.geoJSON(c.features),null,2));saveAtomic(file+'.样式.json',JSON.stringify(c,null,2));return {file};}
 if(p.mode==='catalog')return SOURCES.map(s=>({...s,cached:!!s.url&&fs.existsSync(path.join(cacheSource(s),safeName(s.name)+'_完整数据.geojson'))}));
 if(p.mode==='paste')return {features:model.parsePaste(p.text,p.type,p.name,p.category),issues:[]};
 if(p.mode==='normalize')return model.normalize(p.cartography);
 if(p.mode==='places'){const pts=require('./data/places.json').map((a,i)=>model.feature({id:'geonames-'+i,name:a[0],category:'城市',geometry:{type:'Point',coordinates:[a[1],a[2]]},properties:{population:a[3]}},i,{id:'geonames',name:'GeoNames cities',license:'CC BY 4.0',homepage:'https://www.geonames.org/'}));return results(pts,p,{name:'GeoNames · 离线城市库'});}
 if(p.mode==='source'){const r=await sourceData(p.id,p.refresh);const c=model.collection(r.data,{...r.source,category:SOURCES.find(s=>s.id===p.id).category});for(const f of c.features)f.style.showLabel=false;return results(c.features,p,r.source,c.issues);}
 if(p.mode==='import'){const r=await importFile(p.file,p.source);const root=cacheSource(r.source);saveAtomic(path.join(root,'已导入数据.geojson'),JSON.stringify(model.geoJSON(r.features)));saveAtomic(path.join(root,'来源.json'),JSON.stringify(r.source,null,2));return results(r.features,p,r.source,r.issues);}
 if(p.mode==='capabilities'){
  const r=await download(wfsURL(p,'GetCapabilities'));const {XMLParser}=require('fast-xml-parser'),xml=new XMLParser({removeNSPrefix:true,ignoreAttributes:false}).parse(r.bytes.toString());
  const caps=xml.WFS_Capabilities;if(!caps)throw new Error('地址未返回 WFS 能力文档；WMS 图片服务无法下载矢量。');const v=caps.FeatureTypeList?.FeatureType||[];
  return {version:caps['@_version']||'2.0.0',layers:(Array.isArray(v)?v:[v]).map(a=>({name:String(a.Name),title:String(a.Title||a.Name)}))};
 }
 if(p.mode==='service'){
  let u=p.direct?new URL(p.url):wfsURL(p,'GetFeature');
  if(!p.direct){if(!p.typeName)throw new Error('先查询服务并选择图层。');u.searchParams.set(p.version?.startsWith('1.')?'typeName':'typeNames',p.typeName);u.searchParams.set('srsName','urn:ogc:def:crs:OGC:1.3:CRS84');u.searchParams.set('outputFormat','application/json');u.searchParams.set('count','20000');u.searchParams.set('maxFeatures','20000');if(p.region){const [w,e,s,n]=p.region.split('/');u.searchParams.set('bbox',`${w},${s},${e},${n},urn:ogc:def:crs:OGC:1.3:CRS84`);}}
  const known=SOURCES.find(s=>s.id===p.sourceId)||{};
  const descriptor={...known,id:'service-'+crypto.createHash('sha1').update(String(u)).digest('hex').slice(0,12),name:p.typeName||'GeoJSON 服务',url:String(u)};
  const file=path.join(cacheSource(descriptor),safeName(p.region?placeName(p.region):descriptor.name)+'__'+(p.region?regionLabel(p.region):'完整区域')+'_'+descriptor.id.slice(-12)+'.geojson');
  const cached=fs.existsSync(file)&&fs.existsSync(file+'.来源.json')&&!p.refresh;
  const r=cached?{bytes:fs.readFileSync(file)}:await download(u);let data;try{data=JSON.parse(r.bytes.toString());}catch{throw new Error('服务未返回 GeoJSON。请确认支持 application/json 输出及 CRS84 坐标。');}
  const source=cached?JSON.parse(fs.readFileSync(file+'.来源.json','utf8')):sourceMetadata(descriptor,r.bytes);
  const c=model.collection(data,source);if(!cached){saveAtomic(file,r.bytes);saveAtomic(file+'.来源.json',JSON.stringify(source,null,2));}
  const out=results(c.features,p,source,c.issues);if(Number(data.numberMatched)>c.features.length||c.features.length>=20000)out.issues.push('服务返回上限为 20000 项；请缩小范围，避免遗漏。');return out;
 }
 throw new Error('未知地理数据任务。');
}
if(require.main===module){process.on('message',async m=>{if(m.type==='cancel'){controller.abort();return;}if(m.type!=='start')return;try{const result=await handle(m.payload||{});process.send({type:'result',result},()=>process.exit(0));}catch(e){process.send({type:'error',message:e.message,stack:e.stack},()=>process.exit(1));}});process.on('disconnect',()=>{controller.abort();process.exit(0);});}
module.exports={handle,sourceData,importFile,search,wfsURL};
