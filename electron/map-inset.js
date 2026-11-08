// A magnified view of the already rendered map, never a second data query.
const {PDFDocument,rgb,pushGraphicsState,popGraphicsState,moveTo,lineTo,closePath,clip,endPath}=require('pdf-lib');
function settings(v={}){v=v||{};const n=(x,a,b,d)=>Number.isFinite(Number(x))?Math.max(a,Math.min(b,Number(x))):d;return {enabled:!!v.enabled,x:n(v.x,0,1,0),y:n(v.y,0,1,1),width:n(v.width,15,70,35),borderWidth:n(v.borderWidth,0,5,.8),borderColor:/^#[\da-f]{6}$/i.test(v.borderColor)?v.borderColor:'#39454d'};}
function active(config){if(config.plotType==='responseCurve')return null;return [...(config.cartography?.features||[])].reverse().find(f=>f.visible!==false&&f.properties?.regionBox&&settings(f.properties.inset).enabled)||null;}
function extent(points){return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];}
function layout(feature,projected,mapPoints,frame){
 const style=settings(feature.properties.inset),points=projected.map(([x,y])=>[x*frame.width,y*frame.height]);
 const [sx,sy,ex,ey]=extent(points),[l,t,r,b]=extent(mapPoints.map(([x,y])=>[x*frame.width,y*frame.height]));
 if(points.some(([x,y])=>!Number.isFinite(x+y))||ex-sx<.01||ey-sy<.01)throw Error('框选区不能在当前投影中生成局部放大图。');
 if(sx<l-.05||sy<t-.05||ex>r+.05||ey>b+.05)throw Error('局部放大区域必须完整位于主图范围内。');
 const scale=Math.min((r-l)*style.width/100/(ex-sx),(b-t)*Math.min(style.width,60)/100/(ey-sy));
 if(scale<=1.01)throw Error('框选范围较大，当前尺寸无法放大；请缩小框选范围或增大放大图尺寸。');
 const width=(ex-sx)*scale,height=(ey-sy)*scale,placement={x:l+6,y:t+6,width:Math.max(0,r-l-12-width),height:Math.max(0,b-t-12-height)};
 return {source:{x:sx,y:sy,width:ex-sx,height:ey-sy,points},target:{x:placement.x+placement.width*style.x,y:placement.y+placement.height*style.y,width,height},placement,scale,...style,name:feature.name};
}
function shifted(v,title){return {...v,...(v.placement?{placement:{...v.placement,y:v.placement.y+title}}:{}),source:{...v.source,y:v.source.y+title,points:v.source.points.map(([x,y])=>[x,y+title])},target:{...v.target,y:v.target.y+title}};}
function polygon(v){return v.source.points.map(([x,y])=>[v.target.x+(x-v.source.x)*v.scale,v.target.y+(y-v.source.y)*v.scale]);}
async function compose(bytes,v){
 const source=await PDFDocument.load(bytes),doc=await PDFDocument.create(),original=source.getPage(0),{width,height}=original.getSize();
 const [map]=await doc.embedPages([original]),page=doc.addPage([width,height]),d=v.target;
 page.drawPage(map);page.drawRectangle({x:d.x,y:height-d.y-d.height,width:d.width,height:d.height,color:rgb(1,1,1)});
 const ring=polygon(v);page.pushOperators(pushGraphicsState(),moveTo(ring[0][0],height-ring[0][1]),...ring.slice(1).map(([x,y])=>lineTo(x,height-y)),closePath(),clip(),endPath());
 page.drawPage(map,{x:d.x-v.source.x*v.scale,y:height-d.y-(height-v.source.y)*v.scale,width:width*v.scale,height:height*v.scale});
 page.pushOperators(popGraphicsState());
 const color=v.borderColor.slice(1).match(/../g).map(x=>parseInt(x,16)/255);
 if(v.borderWidth>0)page.drawRectangle({x:d.x,y:height-d.y-d.height,width:d.width,height:d.height,borderColor:rgb(...color),borderWidth:v.borderWidth});
 return Buffer.from(await doc.save());
}
// Executed in an isolated renderer. SVG transforms keep complete editable text.
function decorateSVG(svgText,v){
 const ns='http://www.w3.org/2000/svg',doc=new DOMParser().parseFromString(svgText,'image/svg+xml'),svg=doc.documentElement;
 document.body.appendChild(svg);const rect=svg.getBoundingClientRect();
 const width=Number(svg.viewBox.baseVal.width),height=Number(svg.viewBox.baseVal.height),d=v.target,s=v.source;
 const make=(tag,attrs={})=>{const n=doc.createElementNS(ns,tag);for(const [k,val]of Object.entries(attrs))n.setAttribute(k,val);return n;};
 const defs=make('defs'),main=make('clipPath',{id:'inset-main-clip'}),crop=make('clipPath',{id:'inset-source-clip'});
 main.appendChild(make('path',{d:`M0 0H${width}V${height}H0Z M${d.x} ${d.y}v${d.height}h${d.width}v-${d.height}Z`,'clip-rule':'evenodd'}));
 crop.appendChild(make('polygon',{points:s.points.map(p=>p.join(',')).join(' ')}));defs.append(main,crop);svg.insertBefore(defs,svg.firstChild);
 const inset=make('g',{id:'GMT_inset'}),transform=make('g',{transform:`translate(${d.x} ${d.y}) scale(${v.scale}) translate(${-s.x} ${-s.y})`}),clipped=make('g',{'clip-path':'url(#inset-source-clip)'});
 for(const group of [...svg.children].filter(g=>g.tagName==='g')){
  const touches=[...group.querySelectorAll('text,path,polygon,line,rect,circle')].some(el=>{const b=el.getBoundingClientRect(),x=(b.left-rect.left)*width/rect.width,y=(b.top-rect.top)*height/rect.height;return x<s.x+s.width&&x+b.width*width/rect.width>s.x&&y<s.y+s.height&&y+b.height*height/rect.height>s.y;});
  if(touches){const copy=group.cloneNode(true);copy.removeAttribute('id');clipped.appendChild(copy);}
  group.setAttribute('clip-path','url(#inset-main-clip)');
 }
 const hasInset=!!clipped.childNodes.length;
 if(hasInset){transform.appendChild(clipped);inset.appendChild(transform);svg.appendChild(inset);}
 return {svg:new XMLSerializer().serializeToString(svg),hasInset};
}
// Browser preview duplicates the completed image, including native labels.
function previewHTML(url,width,height,v){const d=v.target,s=v.source,ring=polygon(v).map(([x,y])=>`${x-d.x}px ${y-d.y}px`).join(',');return `<!doctype html><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:white}img{position:absolute;display:block;max-width:none}</style><img src="${url}" width="${width}" height="${height}"><div style="position:absolute;left:${d.x}px;top:${d.y}px;width:${d.width}px;height:${d.height}px;background:white"><div style="position:absolute;inset:0;overflow:hidden;clip-path:polygon(${ring})"><img src="${url}" style="width:${width*v.scale}px;height:${height*v.scale}px;left:${-s.x*v.scale}px;top:${-s.y*v.scale}px"></div><div style="position:absolute;inset:0;outline:${v.borderWidth}px solid ${v.borderColor};pointer-events:none"></div></div>`;}
module.exports={settings,active,layout,shifted,polygon,compose,decorateSVG,previewHTML};
