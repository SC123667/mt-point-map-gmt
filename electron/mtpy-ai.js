// Semantic AI pages reuse exactly the PDF compositor's transforms and clipping.
const fs=require('fs'),path=require('path');
const {PDFDocument}=require('pdf-lib');
const names={background:'构造与底图',leaders:'标注引线',ellipses:'相位张量椭圆',real:'感应箭头·实部',imag:'感应箭头·虚部',axes:'坐标与周期',legend:'箭头幅值图例',labels:'构造与矿床标注',colorbar:'相位张量色标',title:'标题',elevation:'高程色标'};
async function blank(w,h){const d=await PDFDocument.create();const p=d.addPage([w,h]);p.pushOperators(require('pdf-lib').pushGraphicsState(),require('pdf-lib').popGraphicsState());return d.save();}
async function titlePage(bytes,result,titleOnly=false){
 if(!result.titlePDF)return bytes;
 const base=await PDFDocument.load(bytes),title=await PDFDocument.load(fs.readFileSync(result.titlePDF)),a=base.getPage(0).getSize(),b=title.getPage(0).getSize();
 const q=Math.min(1,(a.width-20)/b.width),h=b.height*q,d=await PDFDocument.create(),p=d.addPage([a.width,a.height+h+12]);
 if(!titleOnly)p.drawPage(await d.embedPage(base.getPage(0)));
 else p.drawPage(await d.embedPage(title.getPage(0)),{x:(a.width-b.width*q)/2,y:a.height+6,width:b.width*q,height:h});
 return d.save();
}
async function composeLayers(result){
 const {withColorbar,withElevationColorbar,finalSize}=require('./mtpy-export'),grid=result.aiGrid;
 if(!grid||result.panels.some(p=>!p.aiArtwork))throw Error('缺少 MTpy 分层对象，请重新导出 AI。');
 const mode=result.colorbarMode||'shared',combined=await PDFDocument.create(),entries=[];
 const append=async(bytes,entry)=>{const d=await PDFDocument.load(await finalSize(await withElevationColorbar(bytes,result,{transparent:true,map:entry.role!=='elevation',showBar:entry.role==='elevation'}),result)),[page]=await combined.copyPages(d,[0]);combined.addPage(page);entries.push({...entry,name:names[entry.role],page:entries.length+1});};
 const finish=async(bytes,bar=false)=>titlePage(await withColorbar(bytes,result,mode==='shared',{transparent:true,showBar:bar}),result);
 for(const [index,panel]of result.panels.entries()){
  const parts=[];
  if(result.background){
   const b=result.background,axis=panel.groupAxis||panel.axis,d=await PDFDocument.create(),p=d.addPage([504,432]);
   const source=await PDFDocument.load(fs.readFileSync(b.pdf));
   p.drawPage(await d.embedPage(source.getPage(0),b.box),{x:axis[0]*504,y:axis[1]*432,width:axis[2]*504,height:axis[3]*432});
   parts.push({role:'background',bytes:await d.save()});
  }
  if(panel.leaderPDF)parts.push({role:'leaders',file:panel.leaderPDF});
  parts.push(...panel.aiArtwork);
  if(panel.annotationPDF)parts.push({role:'labels',file:panel.annotationPDF});
  if(mode==='individual'&&result.colorbar)parts.push({role:'colorbar',bytes:await blank(504,432)});
  for(const part of parts){
   let bytes=part.bytes||fs.readFileSync(part.file);
   bytes=await withColorbar(bytes,result,mode==='individual',{transparent:true,map:part.role!=='colorbar',showBar:part.role==='colorbar'});
   const tile=await PDFDocument.load(bytes),d=await PDFDocument.create(),p=d.addPage([grid.width,grid.height]),placement=grid.panels[index];
   p.drawPage(await d.embedPage(tile.getPage(0),placement.clip),placement.draw);
   await append(await finish(await d.save()),{period:panel.period,role:part.role,artists:part.artists||0});
  }
 }
 if(mode==='shared'&&result.colorbar)await append(await finish(await blank(grid.width,grid.height),true),{role:'colorbar'});
 if(result.titlePDF){
  const base=await withColorbar(await blank(grid.width,grid.height),result,mode==='shared',{transparent:true,map:false,showBar:false});
  await append(await titlePage(base,result,true),{role:'title'});
 }
 if(result.background?.elevationLegend)await append(await finish(await blank(grid.width,grid.height)),{role:'elevation'});
 const file=path.join(result.output,'AI分层对象.pdf');fs.writeFileSync(file,await combined.save());
 fs.writeFileSync(path.join(result.output,'AI图层清单.json'),JSON.stringify(entries,null,2));
 return {file,entries};
}
function illustratorLayers(entries){
 return fs.readFileSync(path.join(__dirname,'mtpy-ai-layers.jsx'),'utf8').replace('/*MTPY_LAYERS*/',JSON.stringify(entries));
}
module.exports={composeLayers,illustratorLayers};
