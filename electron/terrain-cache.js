const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { geographicRegionIssue } = require('./map-region');
let places;
const labels = new Map();
function safeName(value) {
  return String(value || '').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/^[. ]+|[. ]+$/g, '').slice(0, 28) || '区域';
}
function normalizedRegion(region) {
  if (geographicRegionIssue(region)) throw new Error('地形缓存范围无效。');
  return String(region).split('/').map(v => Number(Number(v).toFixed(8))).join('/');
}
function regionLabel(region) {
  const [w,e,s,n] = normalizedRegion(region).split('/');
  return `经度${w}至${e}_纬度${s}至${n}`;
}
function placeName(region) {
  const key = normalizedRegion(region);
  if (labels.has(key)) return labels.get(key);
  places ||= require('./data/places.json');
  const [w,e,s,n] = key.split('/').map(Number), x=(w+e)/2, y=(s+n)/2;
  const dx = (a,b) => Math.abs(((a-b+540)%360)-180);
  const distance = (lon,lat) => Math.hypot(dx(lon,x)*Math.cos(y*Math.PI/180),lat-y)*111;
  const inside = places.filter(p => p[2]>=s && p[2]<=n && ((p[1]-w+360)%360)<=e-w).sort((a,b)=>b[3]-a[3]);
  const selected=[];
  for (const p of inside) {
    if (selected.every(q=>Math.hypot(dx(q[1],p[1])*Math.cos(y*Math.PI/180),q[2]-p[2])*111>100)) selected.push(p);
    if (selected.length===3) break;
  }
  let label;
  if (selected.length) label=selected.map(p=>p[0]==='Nyingchi'?'林芝':p[0]).join('-')+(selected.length>1?'区域':'周边');
  else {
    let nearest=null, km=Infinity;
    for (const p of places) { const d=distance(p[1],p[2]); if(d<km){nearest=p;km=d;} }
    label=km<250?`${nearest[0]}周边`:'远离城镇区域';
  }
  label=safeName(label); labels.set(key,label); return label;
}
function cacheRoot(outputDirectory, config={}) {
  return path.resolve(config.terrainCacheDirectory || process.env.MT_GMT_TERRAIN_CACHE || path.join(outputDirectory,'terrain_cache'));
}
function ensureCacheRoot(root) {
  const match=/^(\/Volumes\/[^/]+)(?:\/|$)/.exec(root);
  if(match && !fs.existsSync(match[1])) throw new Error(`地形缓存磁盘未连接：${match[1]}。请连接磁盘后重试。`);
  fs.mkdirSync(root,{recursive:true});
  fs.accessSync(root,fs.constants.R_OK|fs.constants.W_OK);
  return root;
}
function cachePaths(outputDirectory, config={}, region=config.region) {
  const root=cacheRoot(outputDirectory,config);
  const area=regionLabel(region), normalized=normalizedRegion(region);
  const name=safeName(config.terrainRegionName || placeName(normalized));
  const parent=path.join(root,'区域地形');
  const suffix=`__${area}`;
  // Identity comes from coordinates, never from an editable place label or export directory.
  const existing=fs.existsSync(parent)?fs.readdirSync(parent,{withFileTypes:true}).find(e=>e.isDirectory()&&e.name.endsWith(suffix)):null;
  const directory=path.join(parent,existing?.name || `${name}${suffix}`);
  const stem=path.basename(directory);
  const resolution=config.terrainResolution || '06m';
  const preview=config.terrainPreview?'预览_':'';
  const intensity=String(Number(config.terrainIntensity ?? .65));
  let sourceTag='';
  if(config.localTerrainGridPath && fs.existsSync(config.localTerrainGridPath)) {
    const stat=fs.statSync(config.localTerrainGridPath);
    sourceTag='_本地'+crypto.createHash('sha1').update([fs.realpathSync(config.localTerrainGridPath),stat.size,stat.mtimeMs].join('|')).digest('hex').slice(0,8);
  }
  const gridStem=`${preview}earth_relief_${resolution}_${stem}${sourceTag}`;
  const key=crypto.createHash('sha1').update([root,normalized,resolution,intensity,preview,config.localTerrainGridPath||''].join('|')).digest('hex').slice(0,12);
  return {root,key,directory,region:normalized,placeName:existing?existing.name.slice(0,-suffix.length):name,
    gridPath:path.join(directory,`${gridStem}.nc`),
    shadePath:path.join(directory,`${gridStem}_阴影${intensity}.nc`),
    metadataPath:path.join(directory,'区域说明.json')};
}
function initializeArea(paths,config={}) {
  ensureCacheRoot(paths.root); fs.mkdirSync(paths.directory,{recursive:true});
  if(!fs.existsSync(paths.metadataPath)) fs.writeFileSync(paths.metadataPath,JSON.stringify({placeName:paths.placeName,region:paths.region,labelBasis:config.terrainRegionName?'用户命名':'GeoNames 区域内或邻近城镇，仅供查找，不代表行政边界',createdAt:new Date().toISOString()},null,2));
}
function tileCachePaths(root,lat,lon,name) {
  const region=`${lon}/${lon+1}/${lat}/${lat+1}`, stem=`${placeName(region)}__${regionLabel(region)}__01s__${name}`;
  const directory=path.join(root,'原始高程瓦片',stem);
  return {directory,hgtPath:path.join(directory,`${stem}.hgt`),jp2Path:path.join(directory,`${stem}.jp2`),gzPath:path.join(directory,`${stem}.hgt.gz`)};
}
function gmtCacheEnv(outputDirectory,config={}) {
  const root=ensureCacheRoot(cacheRoot(outputDirectory,config));
  const user=path.join(root,'GMT运行缓存'); fs.mkdirSync(user,{recursive:true});
  const cachedir=path.join(user,'cache');fs.mkdirSync(cachedir,{recursive:true});
  const server=path.join(user,'server');fs.mkdirSync(server,{recursive:true});
  return {GMT_USERDIR:user,GMT_CACHEDIR:cachedir,GMT_DATADIR:server};
}
function previewConfig(config) {
  const next={...config,terrainPreview:true,pngDpi:150};
  if(!config.showTerrain || !config.region) return next;
  const [w,e,s,n]=config.region.split('/').map(Number);
  const seconds={"01s":1,"03s":3,"15s":15,"30s":30,"01m":60,"06m":360,"10m":600,"20m":1200};
  const requested=seconds[config.terrainResolution]||360;
  const needed=Math.max(requested,Math.max(e-w,n-s)*3600/1600);
  const choice=Object.entries(seconds).find(([,v])=>v>=needed);
  if(choice)next.terrainResolution=choice[0];
  next.terrainRequestedResolution=config.terrainResolution;
  return next;
}
module.exports={safeName,normalizedRegion,regionLabel,placeName,cacheRoot,ensureCacheRoot,cachePaths,initializeArea,tileCachePaths,gmtCacheEnv,previewConfig};
