// Cartographic labels remain editable, above official MTpy artists. Geometry is
// mapped from GMT's measured frame; obstacles come from the actual MTpy artists.
const fs=require('fs'),path=require('path');
const placement=require('./label-layout');
function buildLayout(background,panel){
 const source=background.annotationLayout;if(!source)return null;
 const box=background.box,axis=panel.groupAxis||panel.axis;
 const frame={x:axis[0]*504,y:(1-axis[1]-axis[3])*432,width:axis[2]*504,height:axis[3]*432};
 const scale=frame.width/(box.right-box.left),sy=frame.height/(box.top-box.bottom);
 const point=p=>({...p,x:frame.x+(p.x-box.left)*scale,y:frame.y+(p.y-(source.height-box.top))*sy,...(p.span?{span:p.span*scale}:{})});
 const rect=b=>({...point(b),width:b.width*scale,height:b.height*sy});
 const labels=(source.sourceLabels||source.labels).map(l=>{
  const label={...l,...point(l),style:{...l.style,font:background.presentation?.fontFamily||'Times New Roman',fontSize:l.style.fontSize*scale/(background.displayScale||1),size:l.style.size*scale,dx:l.style.dx*scale,dy:l.style.dy*sy,halo:true,haloWidth:Math.max(.8,(l.style.haloWidth||.7)*scale)}};
  if((l.point||l.line)&&placement.textSize(label.name,label.style.fontSize).width>65){
   const words=label.name.split(/\s+/);if(words.length>2){let best=1;for(let i=1;i<words.length;i++)if(Math.abs(words.slice(0,i).join(' ').length-words.slice(i).join(' ').length)<Math.abs(words.slice(0,best).join(' ').length-words.slice(best).join(' ').length))best=i;label.originalName=label.name;label.name=words.slice(0,best).join(' ')+'\n'+words.slice(best).join(' ');}
  }
  if(l.line)label.priority=40;
  delete label.placed;label.candidates=(l.candidates||[l]).map(point);
  if(l.point&&!l.pinned){const anchor=label.candidates[0];for(const radius of [12,24,36,54,72,90])for(const [dx,dy]of [[1,0],[-1,0],[0,-1],[0,1],[1,-1],[-1,-1],[1,1],[-1,1]])label.candidates.push({...anchor,x:anchor.x+dx*radius,y:anchor.y+dy*radius});}
  if(l.line&&!l.pinned){
   const originals=[...label.candidates];label.lineAnchors=originals;
   // When the immediate line corridor is occupied, find the nearest free label
   // slot and connect it back to a measured anchor on the original structure.
   const extra=[];
   for(let x=frame.x+20;x<frame.x+frame.width-20;x+=8)for(let y=frame.y+20;y<frame.y+frame.height-20;y+=8){
    const distance=Math.min(...originals.map(p=>Math.hypot(x-p.x,y-p.y)));
    if(distance<=72)extra.push({x,y,angle:0,distance});
   }
   extra.sort((a,b)=>a.distance-b.distance);label.candidates.push(...extra);
  }
  return label;
 });
 const obstacles=[...(source.obstacles||[]).map(rect),...(panel.obstacles||[]).map(b=>({x:frame.x+b.x*frame.width,y:frame.y+b.y*frame.height,width:b.width*frame.width,height:b.height*frame.height}))];
 if(background.showScale)obstacles.push({x:frame.x,y:frame.y+frame.height-28,width:frame.width,height:28});
 const result=placement.place({width:504,height:432,frame,obstacles,labels},{enabled:true,hideGeneric:source.hideGeneric,maxLabels:250});
 result.leaders=result.labels.flatMap(l=>{
  if(!l.point&&!l.line)return [];
  const anchor=l.lineAnchors?[...l.lineAnchors].sort((a,b)=>Math.hypot(a.x-l.placed.x,a.y-l.placed.y)-Math.hypot(b.x-l.placed.x,b.y-l.placed.y))[0]:l;
  if(Math.hypot(l.placed.x-anchor.x,l.placed.y-anchor.y)<=18)return [];
  const b=l.placed.bounds;return [{id:l.id,x1:anchor.x,y1:anchor.y,x2:Math.max(b.x,Math.min(b.x+b.width,anchor.x)),y2:Math.max(b.y,Math.min(b.y+b.height,anchor.y))}];
 });
 return result;
}
async function renderPDF(layout,file,leadersOnly=false){
 const {BrowserWindow}=require('electron');
 let svg=require('./cartography-gmt').labelSVG(leadersOnly?{...layout,labels:[]}:layout);
 const lines=(layout.leaders||[]).map(l=>`<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="white" stroke-width="1.6"/><line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#555555" stroke-width="0.6"/>`).join('');
 if(leadersOnly)svg=svg.replace(/(<svg[^>]*>)/,'$1'+lines);
 fs.writeFileSync(file.replace(/\.pdf$/,'.svg'),svg);
 const html=`<!doctype html><meta charset="utf-8"><style>@page{size:504pt 432pt;margin:0}html,body{margin:0;width:504pt;height:432pt;background:transparent}svg{display:block}</style>${svg}`;
 const win=new BrowserWindow({show:false,focusable:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true}});
 try{await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));await win.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
  fs.writeFileSync(file,await win.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,margins:{marginType:'none'}}));
 }finally{win.destroy();}
}
function buildSharedLayout(background,panels){
 if(!panels.length)return null;
 const axis=panels[0].groupAxis||panels[0].axis;
 if(panels.some(p=>(p.groupAxis||p.axis).some((v,i)=>Math.abs(v-axis[i])>1e-8)))throw Error('组图坐标框不一致，无法共用构造标注。');
 // One placement against the union, not a placement independently per period.
 const unique=new Map();
 for(const p of panels)for(const b of p.obstacles||[]){const key=[b.x,b.y,b.width,b.height].map(n=>n.toFixed(6)).join(',');unique.set(key,b);}
 const layout=buildLayout(background,{...panels[0],obstacles:[...unique.values()]});
 if(layout)layout.sharedPeriods=panels.map(p=>p.period);
 return layout;
}
async function prepare(result){
 const layout=buildSharedLayout(result.background,result.panels);if(!layout)return;
 const stem=path.join(result.output,'共用构造标注');
 fs.writeFileSync(stem+'.json',JSON.stringify(layout,null,2));
 let annotationPDF,leaderPDF;
 if(layout.labels.length){annotationPDF=stem+'.pdf';await renderPDF(layout,annotationPDF);
  if(layout.leaders.length){leaderPDF=stem+'_引线.pdf';await renderPDF(layout,leaderPDF,true);}}
 for(const panel of result.panels){
  fs.writeFileSync(path.join(result.output,`标注_${panel.period}s.json`),JSON.stringify(layout,null,2));
  panel.annotationPlacement=layout.placement;panel.annotationPDF=annotationPDF;panel.leaderPDF=leaderPDF;
 }
}
module.exports={buildLayout,buildSharedLayout,prepare};
