// Offline tectonic library. Call only in a background worker.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const model=require('./cartography'),names=require('./map-names');
const {workspaceDirectory}=require('./workspace');
const {readTextAutoEncoding,parseBLN}=require('./faults');
const {safeName}=require('./terrain-cache');
const SCHEMA=3;
const CATEGORIES={'正断层':'#946335','逆冲断层':'#a44538','左旋断层':'#7354a0','右旋断层':'#42699a','缝合带':'#365d61','背斜':'#79634f','向斜':'#8c738b','火山岩':'#bc7870','构造边界':'#59666e','断层':'#555555'};
const root=()=>path.join(workspaceDirectory('构造数据'),'本地构造库');
const atomic=(f,data)=>{fs.mkdirSync(path.dirname(f),{recursive:true});const t=f+'.'+process.pid+'.tmp';try{fs.writeFileSync(t,data);fs.renameSync(t,f);}finally{fs.rmSync(t,{force:true});}};
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function settings(v={}){return {enabled:!!v.enabled,categories:Array.isArray(v.categories)?v.categories.filter(c=>Object.hasOwn(CATEGORIES,c)):Object.keys(CATEGORIES),excludedSources:Array.isArray(v.excludedSources)?v.excludedSources.map(String):[],showLabels:!!v.showLabels,styles:v.styles&&typeof v.styles==='object'?v.styles:{}};}
function check(signal){if(signal?.aborted)throw new Error('本地构造库任务已取消。');}
const tick=()=>new Promise(r=>setImmediate(r));
function walk(dir){if(!fs.existsSync(dir))return [];const out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith('.'))continue;const f=path.join(dir,e.name);if(e.isDirectory())out.push(...walk(f));else if(e.isFile())out.push(f);}return out.sort();}
function candidate(file){const s=(file.includes('原始文件')?file.split('原始文件').at(-1).split(path.sep).slice(2).join('/'):file).toLowerCase().replaceAll('\\','/'),b=path.basename(s);if(/\/(backup|参考文献)\//.test(s)||/readme|changelog/.test(b))return false;
 if(/\.(geojson|json|shp|kml)$/.test(s))return !/来源|样式|manifest|package/.test(b);
 if(!/\.(gmt|xy|dat|txt|bln|cn)$/.test(s))return false;
 return /fault|suture|tectonic|thrust|anticline|syncline|volcanic|cn-block|boudanry|断裂|断层|构造|缝合/.test(s)||/\.xy$/.test(s);
}
function category(file,p={}){const t=(String(p.Type||p.type||'')+' '+path.basename(file)).toLowerCase();
 for(const [re,c]of [[/suture|缝合/,'缝合带'],[/sinistral|左旋/,'左旋断层'],[/dextral|右旋/,'右旋断层'],[/normal|extendfault|正断/,'正断层'],[/thrust|逆冲/,'逆冲断层'],[/anticline/,'背斜'],[/syncline/,'向斜'],[/volcanic|火山/,'火山岩'],[/tectonic|cn-block|boudanry|构造边界/,'构造边界']])if(re.test(t))return c;return '断层';}
function gmtFeatures(file,source){const text=readTextAutoEncoding(file),features=[],issues=[];let fields=[],props={},coords=[],header='',segment=0;
 if(/@Jp|@Jw/.test(text)&&!/(longlat|WGS.?84|4326)/i.test(text.slice(0,3000)))throw new Error('坐标系不是 WGS84 经纬度，请先转换。');
 const unquote=s=>s.trim().replace(/^"|"$/g,'');
 const flush=()=>{if(coords.length>=2){segment++;const c=category(file,props),name=props.Name||props.NAME||props.FAU_NAME||props.name||header||`${path.basename(file,path.extname(file))} ${segment}`;
 try{const isArea=c==='火山岩'||/@GPOLYGON/.test(text.slice(0,1000));features.push(model.feature({name,category:c,geometry:{type:isArea?'Polygon':'LineString',coordinates:isArea?[coords]:coords},properties:{...props,segment},style:{color:CATEGORIES[c],fill:CATEGORIES[c],showLabel:false}},segment,source));}catch(e){issues.push(`段 ${segment}：${e.message}`);}}coords=[];props={};header='';};
 if(/^\s*\d+\s*,\s*[01](?:\s*,.*)?$/m.test(text.split('\n').find(l=>l.trim()&&!l.startsWith('#'))||'')){
  const r=parseBLN(text,file);for(const [i,s]of r.segments.entries()){const c=category(file);features.push(model.feature({name:s.name||`${path.basename(file)} ${i+1}`,category:c,geometry:{type:s.style.closed?'Polygon':'LineString',coordinates:s.style.closed?[s.points.map(p=>[p.lon,p.lat])]:s.points.map(p=>[p.lon,p.lat])},style:{showLabel:false,color:CATEGORIES[c]}},i,source));}return {features,issues};
 }
 for(const raw of text.split(/\r?\n/)){const line=raw.trim();if(line.startsWith('# @N')){fields=line.slice(4).split('|');continue;}if(line.startsWith('# @D')){const vals=line.slice(4).split('|').map(unquote);props=Object.fromEntries(fields.map((k,i)=>[k,vals[i]||'']));continue;}
 if(line.startsWith('>')){flush();header=unquote((/-L("[^"]*"|\S+)/.exec(line)||[])[1]||line.slice(1).replace(/-[WGZ]\S+/g,'').trim());continue;}if(!line||line.startsWith('#'))continue;
 if(/^(long?\.?|经度)[\s,]+(lat\.?|纬度)/i.test(line))continue;
 const a=line.split(/[\s,]+/);const x=Number(a[0]),y=Number(a[1]);if(a.length<2||!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>180||Math.abs(y)>90){if(coords.length)flush();issues.push(`无效坐标行：${line.slice(0,70)}`);continue;}coords.push([x,y]);}flush();return {features,issues};
}
async function parseFile(file,source){const ext=path.extname(file).toLowerCase();if(ext==='.kml'){
 const {XMLParser}=require('fast-xml-parser'),doc=new XMLParser({removeNSPrefix:true,ignoreAttributes:false}).parse(readTextAutoEncoding(file)),features=[],issues=[];
 const list=x=>x?(Array.isArray(x)?x:[x]):[],coord=x=>String(x||'').trim().split(/\s+/).map(a=>a.split(',').slice(0,2).map(Number));
 const visit=(obj,name='')=>{if(!obj||typeof obj!=='object')return;for(const pm of list(obj.Placemark)){const geometry=g=>{if(g.LineString)for(const l of list(g.LineString))add({type:'LineString',coordinates:coord(l.coordinates)},pm);if(g.Polygon)for(const p of list(g.Polygon))add({type:'Polygon',coordinates:[coord(p.outerBoundaryIs?.LinearRing?.coordinates),...list(p.innerBoundaryIs).map(h=>coord(h.LinearRing?.coordinates))]},pm);for(const m of list(g.MultiGeometry))geometry(m);};geometry(pm);}for(const key of ['kml','Document','Folder'])for(const x of list(obj[key]))visit(x,obj.name||name);};
 const add=(g,p)=>{if(category(file)==='火山岩'&&g.type==='LineString')g={type:'Polygon',coordinates:[g.coordinates]};try{features.push(model.feature({name:String(p.name||path.basename(file)),category:category(file),geometry:g,style:{showLabel:false}},features.length,source));}catch(e){issues.push(e.message);}};visit(doc);return {features,issues};
 }if(['.json','.geojson','.shp'].includes(ext)){const r=await require('./geodata-worker').importFile(file,source);return {...r,features:r.features.filter(f=>!f.geometry.type.includes('Point')).map(f=>({...f,category:Object.hasOwn(CATEGORIES,f.category)?f.category:category(file,f.properties),style:{...f.style,showLabel:false}}))};}
 return gmtFeatures(file,source);
}
function bounds(g){return model.vertices(g).reduce((b,[x,y])=>[Math.min(b[0],x),Math.max(b[1],x),Math.min(b[2],y),Math.max(b[3],y)],[Infinity,-Infinity,Infinity,-Infinity]);}
function geometryKey(g){
 const point=p=>p.map(x=>+x.toFixed(7));
 const line=coords=>{const v=coords.map(point),a=JSON.stringify(v),b=JSON.stringify([...v].reverse());return a<b?a:b;};
 const ring=coords=>{let v=coords.map(point);if(JSON.stringify(v[0])===JSON.stringify(v.at(-1)))v=v.slice(0,-1);const canonical=a=>{let start=0;for(let i=1;i<a.length;i++)if(a[i][0]<a[start][0]||(a[i][0]===a[start][0]&&a[i][1]<a[start][1]))start=i;return JSON.stringify([...a.slice(start),...a.slice(0,start)]);};const a=canonical(v),b=canonical([...v].reverse());return a<b?a:b;};
 const poly=rings=>JSON.stringify([ring(rings[0]),...rings.slice(1).map(ring).sort()]);
 const value=g.type==='LineString'?line(g.coordinates):g.type==='Polygon'?poly(g.coordinates):g.type==='MultiLineString'?JSON.stringify(g.coordinates.map(line).sort()):g.type==='MultiPolygon'?JSON.stringify(g.coordinates.map(poly).sort()):JSON.stringify(g.coordinates);
 return digest(g.type+'|'+value);
}
function readIndex(){try{return JSON.parse(fs.readFileSync(path.join(root(),'空间索引.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw new Error('构造库索引损坏，请点击“更新缓存索引”重新建立。');}}
function summary(idx){return {ready:!!idx,root:root(),builtAt:idx?.builtAt,total:idx?.entries.length||0,categories:Object.entries(CATEGORIES).map(([name,color])=>({name,color,count:idx?.entries.filter(e=>e.category===name).length||0})),sources:idx?.sources||[],issues:idx?.issues||[],duplicateFiles:idx?.duplicateFiles||0,duplicateFeatures:idx?.duplicateFeatures||0,copy:idx?.copy||null};}
async function locked(fn){fs.mkdirSync(root(),{recursive:true});const lock=path.join(root(),'更新.lock');try{fs.writeFileSync(lock,String(process.pid),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;let alive=true;try{process.kill(Number(fs.readFileSync(lock)),0);}catch{alive=false;}if(alive)throw new Error('构造库正在更新，请稍后重试。');fs.rmSync(lock,{force:true});fs.writeFileSync(lock,String(process.pid),{flag:'wx'});}try{return await fn();}finally{fs.rmSync(lock,{force:true});}}
async function importDirectory(dir,progress=()=>{},signal){return locked(async()=>{const src=fs.realpathSync(dir),dest=path.join(root(),'原始文件',safeName(path.basename(src)));if(!fs.statSync(src).isDirectory())throw new Error('请选择构造文件夹。');if(src===root()||src.startsWith(root()+path.sep)||root().startsWith(src+path.sep))throw new Error('请选择缓存目录之外的原始构造文件夹。');const files=walk(src),manifest=[];let copied=0;
 for(const [i,f]of files.entries()){check(signal);const rel=path.relative(src,f),to=path.join(dest,rel),bytes=await fs.promises.readFile(f),hash=digest(bytes);if(!fs.existsSync(to)||digest(await fs.promises.readFile(to))!==hash){if(fs.existsSync(to)){const oldHash=digest(fs.readFileSync(to));const backup=path.join(root(),'历史文件',oldHash,rel);if(!fs.existsSync(backup))atomic(backup,fs.readFileSync(to));}atomic(to,bytes);copied++;}if(digest(await fs.promises.readFile(to))!==hash)throw new Error('复制校验失败：'+rel);manifest.push({file:rel,bytes:bytes.length,sha256:hash});if(i%10===0){progress(`正在校验复制构造库 ${i+1}/${files.length}…`);await tick();}}
 const copy={source:src,destination:dest,fileCount:manifest.length,copied,bytes:manifest.reduce((n,f)=>n+f.bytes,0),verifiedAt:new Date().toISOString()};atomic(path.join(root(),'复制校验清单.json'),JSON.stringify({copy,files:manifest},null,2));return buildIndex(progress,signal,copy);
 });}
function inventory(){return walk(path.join(root(),'原始文件')).filter(candidate).sort((a,b)=>Number(a.endsWith('.kml'))-Number(b.endsWith('.kml'))||a.localeCompare(b,'en'));}
function fingerprint(files){return digest(JSON.stringify(files.map(f=>{const s=fs.statSync(f);return [path.relative(root(),f),s.size,s.mtimeMs];})));}
async function buildIndex(progress=()=>{},signal,copy){const files=inventory(),previous=readIndex(),entries=[],sources=[],issues=[],seenFiles=new Set(),seenGeometry=new Set();let duplicateFiles=0,duplicateFeatures=0;const grid={};
 for(const [i,file]of files.entries()){check(signal);const bytes=fs.readFileSync(file),hash=digest(bytes),rel=path.relative(root(),file);if(seenFiles.has(hash)){duplicateFiles++;continue;}seenFiles.add(hash);const source={id:'local-library-'+hash,name:path.basename(file),relativePath:rel,sha256:hash,origin:'用户本地构造库'};
 const dataRel=path.join('标准化数据','v'+SCHEMA,safeName(path.basename(file,path.extname(file)))+'_'+hash.slice(0,16)+'.ndjson'),dataFile=path.join(root(),dataRel),metaFile=dataFile+'.index.json';let rows;
 try{if(fs.existsSync(dataFile)&&fs.existsSync(metaFile)){const m=JSON.parse(fs.readFileSync(metaFile));rows=m.rows;issues.push(...m.issues);}else{const r=await parseFile(file,source);const chunks=[];rows=[];let offset=0;for(const f of r.features){const buf=Buffer.from(JSON.stringify(f)+'\n');rows.push({offset,length:buf.length,category:f.category,bbox:bounds(f.geometry),key:geometryKey(f.geometry)});chunks.push(buf);offset+=buf.length;}const fileIssues=r.issues.slice(0,20).map(x=>rel+'：'+x);atomic(dataFile,Buffer.concat(chunks));atomic(metaFile,JSON.stringify({rows,issues:fileIssues}));issues.push(...fileIssues);}
 let count=0;for(const row of rows){if(seenGeometry.has(row.key)){duplicateFeatures++;continue;}seenGeometry.add(row.key);const id=entries.length;entries.push({...row,file:dataRel,sourceId:source.id});const [w,e,s,n]=row.bbox;const cells=(Math.floor(e/2)-Math.floor(w/2)+1)*(Math.floor(n/2)-Math.floor(s/2)+1);if(cells>5000){(grid.global??=[]).push(id);}else for(let x=Math.floor(w/2);x<=Math.floor(e/2);x++)for(let y=Math.floor(s/2);y<=Math.floor(n/2);y++)(grid[x+','+y]??=[]).push(id);count++;}sources.push({...source,count});
 }catch(e){issues.push(rel+'：'+e.message);}if(i%5===0){progress(`正在建立构造空间索引 ${i+1}/${files.length}…`);await tick();}}
 check(signal);const idx={schema:SCHEMA,fingerprint:fingerprint(files),builtAt:new Date().toISOString(),entries,grid,sources,issues,duplicateFiles,duplicateFeatures,copy:copy||previous?.copy};atomic(path.join(root(),'空间索引.json'),JSON.stringify(idx));atomic(path.join(root(),'构造库说明.json'),JSON.stringify(summary(idx),null,2));return summary(idx);
}
async function refresh(progress,signal){return locked(()=>buildIndex(progress,signal));}
// Liang-Barsky retains crossing segments even when both endpoints are outside.
function segmentClip(a,b,r){const [w,e,s,n]=r,[x,y]=a,dx=b[0]-x,dy=b[1]-y;let lo=0,hi=1;for(const [p,q]of [[-dx,x-w],[dx,e-x],[-dy,y-s],[dy,n-y]]){if(p===0){if(q<0)return null;}else if(p<0)lo=Math.max(lo,q/p);else hi=Math.min(hi,q/p);}return lo<=hi?[[x+lo*dx,y+lo*dy],[x+hi*dx,y+hi*dy]]:null;}
function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function intersect(g,r){const [w,e,s,n]=r,center=(w+e)/2;const wrap=line=>{let last=center;return line.map(([x,y])=>{x+=360*Math.round((last-x)/360);last=x;return [x,y];});};
 const lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:null;
 if(lines){const parts=[];for(const raw of lines){const line=wrap(raw);let current=[];for(let i=1;i<line.length;i++){const c=segmentClip(line[i-1],line[i],r);if(c){if(current.length&&Math.hypot(current.at(-1)[0]-c[0][0],current.at(-1)[1]-c[0][1])<1e-8)current.push(c[1]);else {if(current.length>1)parts.push(current);current=c;}}else if(current.length){parts.push(current);current=[];}}if(current.length>1)parts.push(current);}return parts.length?{type:parts.length===1?'LineString':'MultiLineString',coordinates:parts.length===1?parts[0]:parts}:null;}
 const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];const selected=[];
 for(const p of polys){const rings=p.map(wrap),edge=rings.some(line=>line.slice(1).some((b,i)=>segmentClip(line[i],b,r))),contains=[[w,s],[e,s],[e,n],[w,n]].some(c=>inside(c,rings[0])&&!rings.slice(1).some(h=>inside(c,h)));if(edge||contains)selected.push(rings);}
 return selected.length?{type:selected.length===1?'Polygon':'MultiPolygon',coordinates:selected.length===1?selected[0]:selected}:null;
}
async function query(region,value={},progress=()=>{},signal){const cfg=settings(value);const r=String(region).split('/').map(Number);if(r.length!==4||!r.every(Number.isFinite)||r[0]>=r[1]||r[2]>=r[3]||r[1]-r[0]>360||r[2]<-90||r[3]>90)throw new Error('请先设置有效的地图经纬度范围。');
 let idx=readIndex();if(!idx)throw new Error('尚未建立本地构造库，请先在“本地构造库”选择文件夹。');
 if(!fs.existsSync(path.join(root(),'更新.lock'))&&(idx.schema!==SCHEMA||idx.fingerprint!==fingerprint(inventory()))){await refresh(progress,signal);idx=readIndex();}
 const start=Date.now(),ids=new Set(idx.grid.global||[]);for(const shift of [-360,0,360]){const w=Math.max(-180,r[0]+shift),e=Math.min(180,r[1]+shift);if(w>e)continue;for(let x=Math.floor(w/2);x<=Math.floor(e/2);x++)for(let y=Math.floor(r[2]/2);y<=Math.floor(r[3]/2);y++)for(const id of idx.grid[x+','+y]||[])ids.add(id);}
 const features=[],fds=new Map();let dictionary={};try{dictionary=JSON.parse(fs.readFileSync(path.join(workspaceDirectory('名称词典'),'用户中英文名称.json'),'utf8'));}catch{}
 try{for(const id of ids){check(signal);const row=idx.entries[id];if(!cfg.categories.includes(row.category)||cfg.excludedSources.includes(row.sourceId))continue;let fd=fds.get(row.file);if(fd===undefined){fd=fs.openSync(path.join(root(),row.file),'r');fds.set(row.file,fd);}const b=Buffer.alloc(row.length);fs.readSync(fd,b,0,row.length,row.offset);const f=JSON.parse(b.toString()),g=intersect(f.geometry,r);if(g){f.geometry=g;f.source.library=true;f.style={...f.style,...cfg.styles[f.category],showLabel:cfg.showLabels};features.push(names.applyDictionary(f,dictionary));}if(features.length%200===0)await tick();}}finally{for(const fd of fds.values())fs.closeSync(fd);}
 return {features,total:features.length,candidates:ids.size,elapsedMs:Date.now()-start,builtAt:idx.builtAt,root:root(),issues:idx.issues};
}
module.exports={settings,CATEGORIES,root,candidate,gmtFeatures,intersect,segmentClip,geometryKey,summary,readIndex,importDirectory,refresh,query};
