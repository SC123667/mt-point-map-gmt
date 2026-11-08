// Deterministic placement in physical PostScript points, independent of PNG DPI.
const nameKey=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s_–—-]+/g,' ').trim();
function settings(v={}){return {enabled:v.enabled!==false,hideGeneric:v.hideGeneric!==false,maxLabels:Math.max(1,Math.min(250,Number(v.maxLabels)||60))};}
function genericName(name){
 const text=String(name||'').trim();
 return /^(?:未命名|无名|未知|unnamed\b|unknown\b|untitled\b)/i.test(text)
  || /^(?:suturezone|tectonic|China[_ -]tectonic|faults?(?:_china)?|CN[-_ ](?:block(?:[-_ ]L\d+)?|faults?)|(?:major|usual|normal|sinistral|dextral|thrust|reverse)[-_ ]?faults?|cenozoic[_ -]volcanics|HM_Front_thrust|thrusts|line|segment|构造线段)[\s_.-]*\d+(?:\D.*)?$/i.test(text)
  || /^(?:[!?#>]+|[A-Z]{2,8})[\s_.-]+\d+$/.test(text);
}
function genericLabel(feature,label){
 if(genericName(label))return true;
 // Local parsers synthesize “source filename + segment number” when no name
 // exists. Detect that provenance, including future datasets with other stems.
 const stem=String(feature.source?.relativePath||feature.source?.name||'').split(/[\\/]/).at(-1).replace(/\.[^.]+$/,'');
 const segment=feature.properties?.segment;
 return !!stem&&segment!==undefined&&nameKey(label)===nameKey(`${stem} ${segment}`);
}
function meaningful(f,label){
 // An explicit proper name can replace a generic source identifier.
 return !!String(label||'').trim()&&!genericName(label);
}
function candidates(f,region,fallback){
 if(f.labelAnchor||!f.geometry.type.includes('Line'))return fallback?[{anchor:fallback}]:[];
 const clipped=require('./local-structures').intersect(f.geometry,String(region).split('/').map(Number));
 if(!clipped)return [];
 const lines=clipped.type==='LineString'?[clipped.coordinates]:clipped.coordinates;
 const paths=lines.map(line=>{const ds=[0];for(let i=1;i<line.length;i++)ds.push(ds.at(-1)+Math.hypot((line[i][0]-line[i-1][0])*Math.cos((line[i][1]+line[i-1][1])*Math.PI/360),line[i][1]-line[i-1][1]));return {line,ds,length:ds.at(-1)};}).filter(p=>p.length>0).sort((a,b)=>b.length-a.length);
 const at=(p,d)=>{let i=1;while(i<p.ds.length-1&&p.ds[i]<d)i++;const t=(d-p.ds[i-1])/(p.ds[i]-p.ds[i-1]||1);return p.line[i-1].map((v,j)=>v+(p.line[i][j]-v)*t);};
 return paths.slice(0,3).flatMap(p=>[.5,.3,.7,.15,.85].map(t=>({anchor:at(p,p.length*t),before:at(p,p.length*Math.max(0,t-.035)),after:at(p,p.length*Math.min(1,t+.035)),length:p.length})));
}
function textSize(name,fontSize,bold=false){const lines=String(name).split(/\n|\\n/);return {width:Math.max(...lines.map(line=>[...line].reduce((n,c)=>n+(/[\u2e80-\uffff]/.test(c)?1:/[MW@%]/.test(c)?.9:/[ilI.,' ]/.test(c)?.32:.62),0)))*fontSize*(bold?1.08:1)+4,height:lines.length*fontSize*1.22+3};}
function overlaps(a,b){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
function place(layout,options={}){
 const cfg=settings(options),hidden=[];
 const visible=cfg.hideGeneric?layout.labels.filter(label=>{
  if(!label.generic&&!genericName(label.name))return true;
  hidden.push({id:label.id,name:label.name,reason:'generic'});
  return false;
 }):layout.labels;
 if(!cfg.enabled)return {...layout,labels:visible,placement:{enabled:false,shown:visible.length,hidden}};
 const frame=layout.frame||{x:0,y:0,width:layout.width,height:layout.height};
 const used=[...(layout.obstacles||[])],seen=new Set(),labels=[];
 // Reserve actual point symbols so a neighbour's name cannot cover them.
 const symbols=layout.labels.filter(l=>l.point&&!l.pinned&&l.style.symbol!=='none').map(l=>{const r=l.style.size*72/2.54/2+1;return {id:l.id,x:l.x-r,y:l.y-r,width:r*2,height:r*2};});
 const ordered=[...visible].sort((a,b)=>(Number(b.pinned)-Number(a.pinned))||((b.priority||0)-(a.priority||0))||String(a.id).localeCompare(String(b.id)));
 for(const l of ordered){
  const key=nameKey(l.name);
  if(!l.pinned&&seen.has(key)){hidden.push({id:l.id,name:l.name,reason:'duplicate'});continue;}
  if(!l.pinned&&labels.length>=cfg.maxLabels){hidden.push({id:l.id,name:l.name,reason:'density'});continue;}
  const s=l.style,box=textSize(l.name,s.fontSize,s.bold),candidates=l.candidates?.length?l.candidates:[{x:l.x,y:l.y}];let placed;
  for(const p of candidates){
   const angle=l.pinned?-s.rotation:(p.angle??-s.rotation),r=angle*Math.PI/180;
   const width=Math.abs(box.width*Math.cos(r))+Math.abs(box.height*Math.sin(r)),height=Math.abs(box.width*Math.sin(r))+Math.abs(box.height*Math.cos(r));
   // Keep short cartographic ticks from acquiring a long fault-name label.
   if(!l.pinned&&p.span!==undefined&&p.span<box.width*.65)continue;
   // Long rotated names need more frame clearance than a short Chinese name.
   // A final bounded offset uses their actual rotated height, preserving text.
   const clearance=Math.max(s.fontSize*2+4,height/2+s.fontSize+4);
   const shifts=l.line&&!l.pinned?[s.fontSize+3,-s.fontSize-3,s.fontSize*2+4,-s.fontSize*2-4,clearance,-clearance]:[0];
   const positions=l.point&&!l.pinned?[...new Set([s.position,'right','left','above','below','upper-right','upper-left','lower-right','lower-left'])]:[s.position];
   for(const position of positions){for(const shift of shifts){
    let x=p.x+s.dx*72/25.4-shift*Math.sin(r),y=p.y-s.dy*72/25.4+shift*Math.cos(r);
    if(!l.line||l.pinned){const pad=s.size*72/2.54/2+3;if(position.includes('right'))x+=box.width/2+pad;if(position.includes('left'))x-=box.width/2+pad;if(position==='above'||position.startsWith('upper'))y-=box.height/2+pad;if(position==='below'||position.startsWith('lower'))y+=box.height/2+pad;}
    const bounds={x:x-width/2-2,y:y-height/2-2,width:width+4,height:height+4};
    if(bounds.x<frame.x+4||bounds.y<frame.y+4||bounds.x+bounds.width>frame.x+frame.width-4||bounds.y+bounds.height>frame.y+frame.height-4)continue;
    if(!l.pinned&&used.some(b=>overlaps(bounds,b)))continue;
    if(!l.pinned&&symbols.some(b=>b.id!==l.id&&overlaps(bounds,b)))continue;
    placed={...l,placed:{x,y,angle,bounds}};break;
   }if(placed)break;}if(placed)break;
  }
  if(placed){labels.push(placed);seen.add(key);used.push(placed.placed.bounds);}else hidden.push({id:l.id,name:l.name,reason:'collision-or-edge'});
 }
 return {...layout,labels,placement:{enabled:true,shown:labels.length,hidden}};
}
module.exports={settings,genericName,genericLabel,meaningful,candidates,textSize,overlaps,place};
