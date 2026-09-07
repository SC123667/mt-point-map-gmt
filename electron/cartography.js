// Portable, pure map-feature model. GeoJSON coordinates always remain lon/lat.
const crypto = require('crypto');
const DEFAULT_STYLE = Object.freeze({ color:'#62494a', width:0.8, dash:'solid', fill:'#cfb8ab', opacity:35, symbol:'c', size:0.14, showLabel:true, labelColor:'#263238', font:'sans-serif', fontSize:9, halo:true, position:'right', dx:2, dy:0, rotation:0, labelMode:'name' });
const DEFAULT_CONTOURS = Object.freeze({ show:false, interval:500, major:2000, color:'#666666', width:0.25, majorWidth:0.65, labels:true, fontSize:8, minLength:0.4, labelSpacing:1.2 });
const num=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):fallback;
const color=(v,fallback)=>/^#[\da-f]{6}$/i.test(String(v))?v:fallback;
function style(value={}) {
  const d=DEFAULT_STYLE;
  return { color:color(value.color,d.color),width:num(value.width,0,8,d.width),dash:['solid','dash','dot'].includes(value.dash)?value.dash:d.dash,fill:color(value.fill,d.fill),opacity:num(value.opacity,0,100,d.opacity),symbol:['c','s','t','d','a','none'].includes(value.symbol)?value.symbol:d.symbol,size:num(value.size,0.01,3,d.size),showLabel:value.showLabel!==false,labelColor:color(value.labelColor,d.labelColor),font:['sans-serif','serif','monospace','PingFang SC','Microsoft YaHei','SimSun','Arial','Times New Roman'].includes(value.font)?value.font:d.font,fontSize:num(value.fontSize,4,72,d.fontSize),halo:value.halo!==false,position:['above','below','left','right','center'].includes(value.position)?value.position:d.position,dx:num(value.dx,-100,100,d.dx),dy:num(value.dy,-100,100,d.dy),rotation:num(value.rotation,-180,180,0),labelMode:['name','abbreviation','custom'].includes(value.labelMode)?value.labelMode:'name' };
}
function contours(v={}) { return {show:!!v.show,interval:num(v.interval,1,10000,500),major:num(v.major,0,20000,2000),color:color(v.color,'#666666'),width:num(v.width,0.05,4,0.25),majorWidth:num(v.majorWidth,0.05,8,0.65),labels:v.labels!==false,fontSize:num(v.fontSize,4,30,8),minLength:num(v.minLength,0,10,0.4),labelSpacing:num(v.labelSpacing,0.1,10,1.2)}; }
function coordinate(c) { if(!Array.isArray(c)||c.length<2||String(c[0]).trim()===''||String(c[1]).trim()===''||!Number.isFinite(Number(c[0]))||!Number.isFinite(Number(c[1]))||Math.abs(Number(c[0]))>360||Math.abs(Number(c[1]))>90)throw new Error('坐标无效：请使用 WGS84 经度、纬度（十进制度），不能直接使用投影米制坐标。'); return [Number(c[0]),Number(c[1])]; }
function geometry(g) {
  if(!g)throw new Error('缺少图层几何。');
  const line=(a,min=2)=>{if(!Array.isArray(a)||a.length<min)throw new Error(`至少需要 ${min} 个坐标。`);return a.map(coordinate);};
  const ring=a=>{const r=line(a,3);if(r[0][0]!==r.at(-1)[0]||r[0][1]!==r.at(-1)[1])r.push([...r[0]]);return r;};
  const poly=a=>{if(!Array.isArray(a)||!a.length)throw new Error('区域缺少边界。');return a.map(ring);};
  const f={Point:coordinate,MultiPoint:a=>line(a,1),LineString:line,MultiLineString:a=>a.map(v=>line(v)),Polygon:poly,MultiPolygon:a=>a.map(poly)}[g.type];
  if(!f)throw new Error(`暂不支持几何类型 ${g.type}。`);
  return {type:g.type,coordinates:f(g.coordinates)};
}
function feature(f,index=0,source={}) {
  const p=f.properties||{},g=geometry(f.geometry);
  const name=String(f.name??p.name??p.Name??p.NAME??p.fz_name??p.PlateName??`未命名 ${index+1}`).slice(0,200);
  const category=String(f.category||p.category||source.category||(g.type.includes('Polygon')?'构造区域':g.type.includes('Point')?'地点':'断层')).slice(0,60);
  return {id:String(f.id||crypto.createHash('sha1').update(JSON.stringify([source.id,name,g])).digest('hex').slice(0,20)),name,abbreviation:String(f.abbreviation||p.abbreviation||'').slice(0,100),label:String(f.label||p.label||'').slice(0,500),category,visible:f.visible!==false,geometry:g,style:{...(f.style||p.style||{})},labelAnchor:f.labelAnchor?coordinate(f.labelAnchor):null,properties:p,source:{...source,...p.source,...f.source}};
}
function collection(data,source={}) {
  if(data.crs && !/4326|CRS:*84|WGS.?84/i.test(JSON.stringify(data.crs)))throw new Error('数据不是 WGS84 经纬度，请先重投影为 EPSG:4326。');
  const list=data.type==='FeatureCollection'?data.features:data.type==='Feature'?[data]:Array.isArray(data)?data:[{geometry:data}];
  if(!Array.isArray(list))throw new Error('没有可用的 GeoJSON 要素。');
  const features=[],issues=[];
  list.forEach((f,i)=>{try {if(f.geometry?.type==='GeometryCollection')f.geometry.geometries.forEach((g,j)=>features.push(feature({...f,id:`${f.id||i}-${j}`,geometry:g},i,source)));else features.push(feature(f,i,source));}catch(e){issues.push(`第 ${i+1} 项：${e.message}`);}});
  if(!features.length&&issues.length)throw new Error(issues[0]);return {features,issues};
}
function vertices(g){const c=g.coordinates;if(g.type==='Point')return [c];if(['MultiPoint','LineString'].includes(g.type))return c;if(['Polygon','MultiLineString'].includes(g.type))return c.flat();return c.flat(2);}
function inRegion(f,region) {
  if(!region)return true;const [w,e,s,n]=String(region).split('/').map(Number);if(![w,e,s,n].every(Number.isFinite))return false;
  const points=vertices(f.geometry);let lo=Infinity,hi=-Infinity,bt=Infinity,tp=-Infinity;
  // Wrap to the requested map domain, preserving local line continuity at 180°.
  for(const [x,y]of points){const lon=x+360*Math.round(((w+e)/2-x)/360);lo=Math.min(lo,lon);hi=Math.max(hi,lon);bt=Math.min(bt,y);tp=Math.max(tp,y);}
  return hi>=w&&lo<=e&&tp>=s&&bt<=n;
}
function anchor(f,region) {
  if(f.labelAnchor)return f.labelAnchor;
  const pts=vertices(f.geometry);
  if(f.geometry.type==='Point')return pts[0];
  const [w,e,s,n]=String(region||'-180/180/-90/90').split('/').map(Number);
  const visible=pts.filter(([x,y])=>x>=w&&x<=e&&y>=s&&y<=n);
  // A vertex on the visible line is preferable to a centroid off the fault.
  if(!f.geometry.type.includes('Polygon')){
    if(visible.length)return visible[Math.floor(visible.length/2)];
    const lines=f.geometry.type==='MultiLineString'?f.geometry.coordinates:[pts];
    // A line may cross the map even when every supplied vertex is outside it.
    for(const line of lines)for(let i=1;i<line.length;i++){
      const [x,y]=line[i-1],dx=line[i][0]-x,dy=line[i][1]-y;let lo=0,hi=1,ok=true;
      for(const [p,q]of [[-dx,x-w],[dx,e-x],[-dy,y-s],[dy,n-y]]){if(p===0){if(q<0)ok=false;}else if(p<0)lo=Math.max(lo,q/p);else hi=Math.min(hi,q/p);}
      if(ok&&lo<=hi){const t=(lo+hi)/2;return [x+t*dx,y+t*dy];}
    }
    return null;
  }
  const bounds=pts.reduce((b,p)=>[Math.min(b[0],p[0]),Math.max(b[1],p[0]),Math.min(b[2],p[1]),Math.max(b[3],p[1])],[Infinity,-Infinity,Infinity,-Infinity]);
  return [(Math.max(w,bounds[0])+Math.min(e,bounds[1]))/2,(Math.max(s,bounds[2])+Math.min(n,bounds[3]))/2];
}
function effectiveStyle(f,c={}){return style({...c.categoryStyles?.[f.category],...f.style});}
function labelText(f,s){return (s.labelMode==='custom'?f.label:s.labelMode==='abbreviation'?f.abbreviation:f.name)||f.name;}
function normalize(value={}) {return {features:(value.features||[]).map((f,i)=>feature(f,i)),categoryStyles:{...(value.categoryStyles||{})},contours:contours(value.contours)};}
function parsePaste(text,type='Point',name='自定义构造',category='地点') {
  const rows=String(text).trim().split(/\r?\n/).filter(x=>x.trim()).map(x=>x.trim().split(/[\t,，;；]|\s{2,}/).map(s=>s.trim()));
  if(type==='Point')return rows.map((r,i)=>{if(r.length<3)throw new Error(`第 ${i+1} 行需要：名称、经度、纬度，可附类别。`);return feature({name:r[0],category:r[3]||category,geometry:{type:'Point',coordinates:[r[1],r[2]]}},i);});
  const coords=rows.map((r,i)=>{if(r.length!==2){r=r.join(' ').split(/\s+/);}if(r.length!==2)throw new Error(`第 ${i+1} 行需要经度和纬度。`);return coordinate(r);});
  return [feature({name,category,geometry:{type,coordinates:type==='Polygon'?[coords]:coords}})];
}
function geoJSON(features){return {type:'FeatureCollection',features:features.map(f=>({type:'Feature',id:f.id,geometry:f.geometry,properties:{...f.properties,name:f.name,category:f.category,abbreviation:f.abbreviation,label:f.label,source:f.source,style:f.style}}))};}
module.exports={DEFAULT_STYLE,DEFAULT_CONTOURS,style,contours,geometry,feature,collection,vertices,inRegion,anchor,effectiveStyle,labelText,normalize,parsePaste,geoJSON};
