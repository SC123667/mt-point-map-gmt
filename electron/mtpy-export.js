const fs=require('fs'),path=require('path');
const {PDFDocument,rgb}=require('pdf-lib');
const {execFile}=require('child_process');
const mm=value=>Math.max(0,Math.min(100,Number(value)||0))*72/25.4;
async function withColorbar(bytes,result,enabled,{transparent=false,map=true,showBar=true}={}){
 if(!enabled||!result.colorbar)return bytes;
 const base=await PDFDocument.load(bytes),bar=await PDFDocument.load(fs.readFileSync(result.colorbar.file));
 const b=base.getPage(0).getSize(),c=bar.getPage(0).getSize();
 const position=result.colorbarPosition||'bottom',vertical=['left','right'].includes(position),gap=mm(result.colorbarGap);
 const factor=Math.min(1,(vertical?b.height:b.width)/(vertical?c.height:c.width)),bw=c.width*factor,bh=c.height*factor;
 const width=b.width+(vertical?bw+gap:0),height=b.height+(vertical?0:bh+gap);
 const doc=await PDFDocument.create(),page=doc.addPage([width,height]);
 if(!transparent)page.drawRectangle({x:0,y:0,width,height,color:rgb(1,1,1)});
 const embeddedMap=await doc.embedPage(base.getPage(0)),cb=await doc.embedPage(bar.getPage(0));
 if(map)page.drawPage(embeddedMap,{x:position==='left'?bw+gap:0,y:position==='bottom'?bh+gap:0});
 const align=result.colorbarAlign||'center',free=vertical?b.height-bh:b.width-bw;
 // start/end follow the direction of the available edge: left/right or top/bottom.
 const offset=align==='start'?(vertical?free:0):align==='end'?(vertical?0:free):free/2;
 if(showBar)page.drawPage(cb,{x:vertical?(position==='left'?0:b.width+gap):offset,y:vertical?offset:(position==='bottom'?0:b.height+gap),width:bw,height:bh});
 return doc.save();
}
async function withElevationColorbar(bytes,result,{transparent=false,map=true,showBar=true}={}){
 const bar=result.background?.elevationLegend;if(!bar)return bytes;
 const src=await PDFDocument.load(bytes),legend=await PDFDocument.load(fs.readFileSync(bar.file)),size=src.getPage(0).getSize(),b=legend.getPage(0).getSize();
 // Keep legend dimensions in final output millimetres, independent of panel count.
 const target=Number(result.presentation?.outputWidthMM)*72/25.4,scale=target?size.width/target:1;
 const bw=b.width*scale,bh=b.height*scale,gap=bar.settings.offsetYMM*72/25.4*scale,doc=await PDFDocument.create(),p=doc.addPage([size.width,size.height+bh+gap]);
 if(!transparent)p.drawRectangle({x:0,y:0,width:p.getWidth(),height:p.getHeight(),color:rgb(1,1,1)});
 if(map)p.drawPage(await doc.embedPage(src.getPage(0)),{x:0,y:bh+gap});
 const align=bar.settings.align,offset=bar.settings.offsetXMM*72/25.4*scale;
 const x=(align==='left'?0:align==='right'?size.width-bw:(size.width-bw)/2)+offset;
 if(x < -0.01 || x+bw > size.width+0.01)throw Error('高程色标超出图幅，请缩短色标、减小水平偏移或增大组图宽度。');
 if(showBar)p.drawPage(await doc.embedPage(legend.getPage(0)),{x,y:0,width:bw,height:bh});
 return doc.save();
}
async function finalSize(bytes,result){
 const width=Number(result.presentation?.outputWidthMM)*72/25.4;
 if(!width)return bytes;
 const src=await PDFDocument.load(bytes),doc=await PDFDocument.create();
 for(const page of src.getPages()){const box=page.getSize(),factor=width/box.width,p=doc.addPage([width,box.height*factor]);p.drawPage(await doc.embedPage(page),{x:0,y:0,width,height:box.height*factor});}
 return doc.save();
}
async function composePDF(result) {
 const width=504,height=432,mode=result.colorbarMode||'shared',shared=mode==='shared',columns=result.columns;
 for(const panel of result.panels){
  const raw=panel.groupPDF||panel.files.pdf;
  let bytes=fs.readFileSync(raw);
  if(result.background){
   const doc=await PDFDocument.create(),page=doc.addPage([width,height]),bg=result.background;
   page.drawRectangle({x:0,y:0,width,height,color:rgb(1,1,1)});
   const source=await PDFDocument.load(fs.readFileSync(bg.pdf));const embedded=await doc.embedPage(source.getPage(0),bg.box),axis=panel.groupAxis||panel.axis;
   page.drawPage(embedded,{x:axis[0]*width,y:axis[1]*height,width:axis[2]*width,height:axis[3]*height});
   if(panel.leaderPDF){const [leaders]=await doc.embedPdf(fs.readFileSync(panel.leaderPDF),[0]);page.drawPage(leaders);}
   const [front]=await doc.embedPdf(bytes,[0]);page.drawPage(front);bytes=await doc.save();
  }
  if(panel.annotationPDF){
   const doc=await PDFDocument.load(bytes),[labels]=await doc.embedPdf(fs.readFileSync(panel.annotationPDF),[0]);
   doc.getPage(0).drawPage(labels);bytes=await doc.save();
  }
  panel.groupPDF=raw===panel.files.pdf?path.join(result.output,path.basename(raw,'.pdf')+'_map.pdf'):raw;
  fs.writeFileSync(panel.groupPDF,bytes);
  // Standalone figures always retain a colorbar unless explicitly disabled.
  fs.writeFileSync(panel.files.pdf,await withColorbar(bytes,result,mode!=='none'));
 }
 const compact=result.layout==='compact'&&mode!=='individual',gap=mm(result.panelGap),axis=result.panels[0].groupAxis;
 const crop=compact&&axis?{left:axis[0]*width,bottom:axis[1]*height,right:(axis[0]+axis[2])*width,top:(axis[1]+axis[3])*height}:null;
 const first=await PDFDocument.load(fs.readFileSync(mode==='individual'?result.panels[0].files.pdf:result.panels[0].groupPDF));
 const size=first.getPage(0).getSize(),cw=crop?crop.right-crop.left:size.width,ch=crop?crop.top-crop.bottom:size.height;
 const leftMargin=compact?54:0,bottomMargin=compact?28:0,topMargin=compact?8:0,rightMargin=compact?8:0,rows=Math.ceil(result.panels.length/columns);
 const gridW=cw*columns+gap*(columns-1)+leftMargin+rightMargin,gridH=ch*rows+gap*(rows-1)+bottomMargin+topMargin;
 const lastCount=result.panels.length%columns||columns,align=result.lastRowAlign||'center';
 const lastOffset=(columns-lastCount)*(cw+gap)*(align==='right'?1:align==='left'?0:.5);
 const document=await PDFDocument.create(),page=document.addPage([gridW,gridH]);
 result.panelPlacements=[];
 result.aiGrid={width:gridW,height:gridH,panels:[]};
 page.drawRectangle({x:0,y:0,width:gridW,height:gridH,color:rgb(1,1,1)});
 for(const [index,panel]of result.panels.entries()){
  const source=await PDFDocument.load(fs.readFileSync(mode==='individual'?panel.files.pdf:panel.groupPDF));
  const col=index%columns,row=Math.floor(index/columns),offset=row===rows-1?lastOffset:0,left=compact&&col===0?leftMargin:0,bottom=compact&&(row===rows-1||(row===rows-2&&lastCount<columns))?bottomMargin:0;
  const clip=crop?{...crop,left:crop.left-left,bottom:crop.bottom-bottom}:undefined;
  const embedded=await document.embedPage(source.getPage(0),clip);
  page.drawPage(embedded,{x:leftMargin+offset+col*(cw+gap)-left,y:gridH-topMargin-ch-row*(ch+gap)-bottom,width:cw+left,height:ch+bottom});
  result.aiGrid.panels.push({clip,draw:{x:leftMargin+offset+col*(cw+gap)-left,y:gridH-topMargin-ch-row*(ch+gap)-bottom,width:cw+left,height:ch+bottom}});
  result.panelPlacements.push({period:panel.period,x:leftMargin+offset+col*(cw+gap),y:gridH-topMargin-ch-row*(ch+gap),width:cw,height:ch});
 }
 document.setProducer('MTpy-v2 2.1.4 / GMT main workbench');
 const file=path.join(result.output,'多周期组图.pdf');let bytes=await withColorbar(await document.save(),result,shared);
 if(result.titlePDF){
  const base=await PDFDocument.load(bytes),title=await PDFDocument.load(fs.readFileSync(result.titlePDF)),a=base.getPage(0).getSize(),b=title.getPage(0).getSize();
  const q=Math.min(1,(a.width-20)/b.width),h=b.height*q;const doc=await PDFDocument.create(),p=doc.addPage([a.width,a.height+h+12]);
  p.drawRectangle({x:0,y:0,width:a.width,height:a.height+h+12,color:rgb(1,1,1)});p.drawPage(await doc.embedPage(base.getPage(0)));p.drawPage(await doc.embedPage(title.getPage(0)),{x:(a.width-b.width*q)/2,y:a.height+6,width:b.width*q,height:h});bytes=await doc.save();
 }
 fs.writeFileSync(file,await finalSize(await withElevationColorbar(bytes,result),result));
 if(result.background?.elevationLegend)for(const panel of result.panels)fs.writeFileSync(panel.files.pdf,await withElevationColorbar(fs.readFileSync(panel.files.pdf),{...result,presentation:null}));
 return file;
}
function command(name){
 const candidates=[path.join('/opt/homebrew/bin',name),path.join('/usr/local/bin',name),path.join(require('./gmt').resolveGMT().binDir||'',name)];
 return candidates.find(p=>fs.existsSync(p))||name;
}
function execute(name,args){return new Promise((resolve,reject)=>execFile(command(name),args,{timeout:180000,maxBuffer:4*1024*1024},(e,_o,err)=>e?reject(Error(`${name}: ${err||e.message}`)):resolve()));}
async function convert(pdf,destination,format){
 if(!['eps','svg'].includes(format))throw Error('无效图件格式');
 await execute('pdftocairo',['-'+format,pdf,destination]);
}
async function refreshOutputs(result){
 const png=path.join(result.output,'多周期组图.png');
 const dpi=String(Math.max(72,Math.min(1200,Number(result.pngDpi)||180)));
 await execute('pdftoppm',['-singlefile','-png',...(result.previewOnly?['-scale-to','2400']:['-r',dpi]),result.pdf,png.replace(/\.png$/,'')]);
 result.preview=png;
 if(!result.previewOnly)for(const panel of result.panels){
  await execute('pdftoppm',['-singlefile','-png','-r',dpi,panel.files.pdf,panel.files.png.replace(/\.png$/,'')]);
  await convert(panel.files.pdf,panel.files.svg,'svg');await convert(panel.files.pdf,panel.files.eps,'eps');
 }
 fs.writeFileSync(path.join(result.output,'组图排版记录.json'),JSON.stringify({bounds:result.bounds,background:result.background,colorbarMode:result.colorbarMode,colorbarPosition:result.colorbarPosition,colorbarAlign:result.colorbarAlign,colorbarGapMM:result.colorbarGap,layout:result.layout,panelGapMM:result.panelGap,lastRowAlign:result.lastRowAlign||'center',panels:result.panelPlacements,ellipseScale:result.ellipseScale,arrowScale:result.arrowScale,westernFont:result.presentation?.fontFamily||'Times New Roman',presentation:result.presentation,arrowLegend:'each panel, upper right'},null,2));
}
function makeAIJob(pdf,output,{allowRaster=false,layers=null,fontFamily='Times New Roman'}={}){
  const job=fs.mkdtempSync(path.join(output,'AI编辑包-'));
  fs.copyFileSync(pdf,path.join(job,'MTpy-vector.pdf'));
  if(layers){fs.copyFileSync(layers.file,path.join(job,'MTpy-layers.pdf'));fs.writeFileSync(path.join(job,'AI图层清单.json'),JSON.stringify(layers.entries,null,2));}
  const source=`#target illustrator
(function(){
 var automation=/*GMT_AUTOMATION*/null;
 var folder=new File($.fileName).parent,previous=app.documents.length?app.activeDocument:null;
 var interaction=app.userInteractionLevel,page=app.preferences.PDFFileOptions.pageToOpen,doc=null,stage=null;
 function check(){if(automation&&new File(automation.cancelPath).exists)throw new Error('AI export cancelled');}
 try{
  check();app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
  stage=new Folder(Folder.temp.fsName+'/mtpy-ai-'+new Date().getTime());
  if(!stage.create()||!new File(folder.fsName+'/MTpy-vector.pdf').copy(stage.fsName+'/map.pdf'))throw new Error('Cannot stage MTpy PDF');
  app.preferences.PDFFileOptions.pageToOpen=1;doc=app.open(new File(stage.fsName+'/map.pdf'));check();
  if(doc.layers.length)doc.layers[0].name='MTpy — phase tensor and induction vectors';
  ${layers?require('./mtpy-ai').illustratorLayers(layers.entries):''}
  var paths=doc.pathItems.length,texts=doc.textFrames.length,rasters=doc.rasterItems.length;
  if(paths===0||(!${allowRaster}&&rasters>0))throw new Error('Expected editable MTpy vector artwork');
  var names=${JSON.stringify(fontFamily==='Arial'?['ArialMT','Arial-BoldMT','Arial-ItalicMT','Arial-BoldItalicMT']:['TimesNewRomanPSMT','TimesNewRomanPS-BoldMT','TimesNewRomanPS-ItalicMT','TimesNewRomanPS-BoldItalicMT'])},fonts=[],converted=0;
  for(var f=0;f<names.length;f++){try{fonts.push(app.textFonts.getByName(names[f]));}catch(e){throw new Error('Missing selected western font: '+names[f]);}}
  // PDF imports can expose unreadable per-character font proxies (Illustrator MRAP).
  // Resolve styles first, then set uniform frames atomically and verify fresh ranges.
  function western(c){var code=c.charCodeAt(0);return code>=32&&(code<=0x024f||(code>=0x0370&&code<=0x03ff)||(code>=0x2000&&code<=0x22ff));}
  for(var t=0;t<doc.textFrames.length;t++){
   check();var frame=doc.textFrames[t],chars=frame.textRange.characters,plan=[],style=-1,uniform=true,allWestern=true,base='';
   try{base=frame.textRange.characterAttributes.textFont.name.toLowerCase();}catch(e){}
   for(var j=0;j<chars.length;j++){
    var c=chars[j],content=c.contents,n=base;
    if(!western(content)){plan.push(-1);if(content.charCodeAt(0)>=32)allWestern=false;continue;}
    try{n=c.characterAttributes.textFont.name.toLowerCase();}catch(e){}
    var index=(/bold|black|heavy/.test(n)?1:0)+(/italic|oblique/.test(n)?2:0);
    plan.push(index);if(style<0)style=index;else if(style!==index)uniform=false;
   }
   if(allWestern&&uniform&&style>=0)frame.textRange.characterAttributes.textFont=fonts[style];
   else for(var j=plan.length-1;j>=0;j--)if(plan[j]>=0)frame.textRange.characters[j].characterAttributes.textFont=fonts[plan[j]];
   for(var j=0;j<plan.length;j++)if(plan[j]>=0){
    if(frame.textRange.characters[j].characterAttributes.textFont.name.indexOf(${JSON.stringify(fontFamily==='Arial'?'Arial':'TimesNewRomanPS')})!==0)throw new Error('Font verification failed');converted++;
   }
  }
  var destination=new File(automation?automation.outputPath:folder.fsName+'/MTpy.ai');
  if(!automation&&destination.exists)throw new Error('MTpy.ai already exists. Rename it before exporting again.');
  var options=new IllustratorSaveOptions();options.pdfCompatible=true;options.compressed=true;
  doc.saveAs(destination,options);check();
  var proof=new File(folder.fsName+'/AI-vector-proof.txt');proof.open('w');proof.write('paths='+paths+'\\ntextFrames='+texts+'\\nrasterItems='+rasters+'\\nwesternFont=${fontFamily}\\nconvertedCharacters='+converted);proof.close();
  if(automation){var result=new File(automation.resultPath);result.encoding='UTF-8';result.open('w');result.write(destination.fsName);result.close();}
 }finally{
  if(doc)try{doc.close(SaveOptions.DONOTSAVECHANGES);}catch(e){}
  app.preferences.PDFFileOptions.pageToOpen=page;app.userInteractionLevel=interaction;
  if(previous)try{previous.activate();}catch(e){}
  if(stage){try{new File(stage.fsName+'/map.pdf').remove();stage.remove();}catch(e){}}
 }
})();`;
  const script=path.join(job,'生成可编辑AI.jsx');fs.writeFileSync(script,source);
  fs.writeFileSync(path.join(job,'说明.txt'),'在 Illustrator 中运行“生成可编辑AI.jsx”。PDF 来自 MTpy 官方绘图，保留矢量路径与文字。请保留整个文件夹。');
  return script;
}
module.exports={withElevationColorbar,finalSize,composePDF,makeAIJob,refreshOutputs,withColorbar,convert};
