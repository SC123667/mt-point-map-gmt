// Geographic region boxes and explicit station classifications; no MT inference.
const cart=require('./cartography');
const TYPES={LMT:{label:'长周期',symbol:'s',fill:'#b74c45'},BMT:{label:'宽频',symbol:'t',fill:'#2f6f8f'},AMT:{label:'音频大地电磁',symbol:'c',fill:'#c38b32'}};
function stationKey(r){return JSON.stringify([String(r.name||''),Number(r.lon),Number(r.lat)]);}
function classes(v={}){return {enabled:!!v.enabled,assignments:Object.fromEntries(Object.entries(v.assignments||{}).filter(([,x])=>Object.hasOwn(TYPES,x))),styles:Object.fromEntries(Object.entries(TYPES).map(([k,d])=>{const s=v.styles?.[k]||{},n=(x,min,max,f)=>Number.isFinite(Number(x))?Math.max(min,Math.min(max,Number(x))):f,c=(x,f)=>/^#[\da-f]{6}$/i.test(x)?x:f;return [k,{symbol:['c','s','t','d'].includes(s.symbol)?s.symbol:d.symbol,fill:c(s.fill,d.fill),size:n(s.size,.03,2,.18),penColor:c(s.penColor,'#30383c'),penWidth:n(s.penWidth,0,5,.35)}];}))};}
function classifiedConfig(records,c){
 if(!c.stationClasses?.enabled)return c;
 const data=classes(c.stationClasses),en=c.cartography?.language==='en',groups=new Map();
 const region=String(c.region||'').split('/').map(Number);
 for(const r of records){
  if(region.length===4&&region.every(Number.isFinite)){let lon=Number(r.lon);lon+=360*Math.round(((region[0]+region[1])/2-lon)/360);if(lon<region[0]||lon>region[1]||r.lat<region[2]||r.lat>region[3])continue;}
  const type=data.assignments[stationKey(r)]||'unclassified';
  if(!groups.has(type))groups.set(type,{id:type,label:type==='unclassified'?(en?'Unclassified stations':'未分类测点'):(en?{LMT:'Long-period MT (LMT)',BMT:'Broadband MT (BMT)',AMT:'Audio-frequency MT (AMT)'}[type]:`${TYPES[type].label} (${type})`),...(data.styles[type]||{symbol:c.pointSymbol,fill:c.pointFill,size:c.pointSize,penColor:c.pointPenColor,penWidth:c.pointPenWidth}),keys:[]});
  groups.get(type).keys.push(stationKey(r));
 }
 return {...c,stationGroups:[...groups.values()]};
}
function bounds(values){
 if(values.length!==4||values.some(v=>String(v).trim()===''||!Number.isFinite(Number(v))))throw Error('请填写西、东、南、北四个经纬度边界。');
 let [w,e,s,n]=values.map(Number);if(e<w)e+=360;
 if(w< -180||w>360||e>360||e<=w||e-w>360||s< -90||n>90||s>=n)throw Error('边界无效：南纬度须小于北纬度；跨日期变更线可填写西 170、东 -170。');
 return [w,e,s,n];
}
function boxGeometry(values){const [w,e,s,n]=bounds(values),ring=[];const corners=[[w,s],[e,s],[e,n],[w,n],[w,s]];for(let j=0;j<4;j++)for(let i=0;i<32;i++){const a=corners[j],b=corners[j+1];ring.push([a[0]+(b[0]-a[0])*i/32,a[1]+(b[1]-a[1])*i/32]);}ring.push([...ring[0]]);return {type:'Polygon',coordinates:[ring]};}
function regionBox(v,old={}){const b=bounds(v.bounds);return cart.feature({...old,id:old.id||'box-'+require('crypto').randomUUID(),name:v.name||old.name||'区域框',nameZh:v.name||old.name||'区域框',nameEn:v.name||old.name||'Region box',category:'区域框',visible:v.visible!==false,geometry:boxGeometry(b),properties:{...old.properties,regionBox:b,inset:require('./map-inset').settings(v.inset||old.properties?.inset)},style:{color:'#ac4843',width:1,dash:'dash',fill:'#d9a59d',opacity:0,strokeOpacity:100,showLabel:false,...old.style,...v.style},source:{...old.source,id:'user-region-box',name:'用户定义区域框'}});}
module.exports={TYPES,stationKey,classes,classifiedConfig,bounds,boxGeometry,regionBox};
