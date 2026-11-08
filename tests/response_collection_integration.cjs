// Hidden real Electron / GMT checks. Never launch or manipulate Illustrator.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module'),cp=require('child_process');
const root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..'),out=process.env.MT_GMT_WORKSPACE;
assert(out&&/验证|qa/.test(out));fs.mkdirSync(out,{recursive:true});
app.setActivationPolicy('prohibited');app.dock.hide();
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));
mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{try{
 let win;for(let i=0;i<160;i++){win=BrowserWindow.getAllWindows()[0];if(win&&await win.webContents.executeJavaScript('typeof projectHistory!=="undefined"&&!!projectHistory.current').catch(()=>false))break;await pause(200);}
 const js=s=>win.webContents.executeJavaScript(s);
 const paths=JSON.parse(process.env.QA_EDIS),parse=require(path.join(root,'electron/parser')).parseEdiStationText;
 const records=paths.map(p=>parse(fs.readFileSync(p,'utf8'),p));assert(records.length>=3);assert(records.every(r=>r.mtResponses.length>10));
 // Add a Unicode display alias; real impedances remain unchanged.
 records[1]={...records[1],name:'中文站 '+records[1].name};const before=JSON.stringify(records);
 await js(`window.alert=()=>{};refreshPreviewAutomatically=async()=>{};loadParsed({records:${JSON.stringify(records)},rows:[],columns:['name','lon','lat'],mapping:{coordinateType:'geographic',name:'name',lon:'lon',lat:'lat'},region:'86/96/28/32'});applyConfigToUI({plotType:'responseCurve',curveStation:${JSON.stringify(records[0].name)},title:'MT Survey Stations',showTitle:false,outputName:'collection',pngDpi:120});setPlotType('responseCurve');clearTimeout(state.preview.autoTimer);openSettingsPanel('curveCollection');`);
 assert.equal(await js('readConfig().curveCollection.mode'),'single','Existing project defaults unchanged');
 await js(`rcEl('mode').value='panels';rcEl('mode').dispatchEvent(new Event('change',{bubbles:true}));clearTimeout(state.preview.autoTimer);`);
 assert.equal(await js('readConfig().curveCollection.keys.length'),records.length);
 for(const width of [1000,1280]){
  win.setSize(width,850);await pause(120);
  for(const id of ['rc-mode','rc-layout','rc-all','rc-ai'])assert(await js(`(()=>{const b=document.getElementById('${id}');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return b.checkVisibility()&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;})()`),id+' visible/hit');
 }
 await js(`resetProjectHistory();(()=>{const d=new DataTransfer(),rows=rcEl('selected').children;rows[0].dispatchEvent(new DragEvent('dragstart',{dataTransfer:d,bubbles:true}));rows[2].dispatchEvent(new DragEvent('drop',{dataTransfer:d,bubbles:true,cancelable:true}));})();clearTimeout(state.preview.autoTimer);`);await pause(20);
 let names=await js('window.ResponseCollection.selected(state.records,readConfig()).map(r=>r.name)');assert.deepEqual(names,[records[1].name,records[2].name,records[0].name]);
 await js('undoProjectEdit();clearTimeout(state.preview.autoTimer);');assert.deepEqual(await js('window.ResponseCollection.selected(state.records,readConfig()).map(r=>r.name)'),records.map(r=>r.name));
 await js(`rcEl('layout').value='columns';rcEl('count').value=2;rcEl('layout').dispatchEvent(new Event('change',{bubbles:true}));moveResponseStation(0,2);clearTimeout(state.preview.autoTimer);`);
 const saved=await js('createProjectSnapshot()');
 await js(`restoreProjectSnapshot(${JSON.stringify(saved)});clearTimeout(state.preview.autoTimer);openSettingsPanel('curveCollection');`);
 assert.equal(await js('readConfig().curveCollection.layout'),'columns');assert.equal(await js('window.ResponseCollection.selected(state.records,readConfig())[0].name'),records[1].name);
 const config=await js('readConfig()');
 // Export controls route the entire mode, not the old single-station input.
 for(const [id,expected]of [['rc-ai',[['ai'],true]],['rc-package',[['pdf'],true,{illustrator:true}]]]){
  const captured=await js(`(()=>{const old=exportMap;let captured;try{exportMap=(...a)=>captured=a;rcEl('${id.slice(3)}').click();return captured;}finally{exportMap=old;}})()`);assert.deepEqual(captured,expected);
 }
 const {PDFDocument,PDFName}=require(path.join(root,'node_modules/pdf-lib')),results=[];
 for(const [mode,layout]of [['panels','rows'],['panels','horizontal'],['panels','vertical'],['panels','columns'],['overlay','rows']]){
  const cfg={...config,curveCollection:{...config.curveCollection,mode,layout,count:2,...(layout==='columns'?{axisMode:'individual',showGrid:true,cellWidth:8,fontSize:7.5}:{})},outputName:mode+'_'+layout,illustratorPackage:true};
  const r=await js(`window.mtApp.exportMap({records:${JSON.stringify(records)},config:${JSON.stringify(cfg)},formats:['png','pdf','eps']})`);assert(r.ok,JSON.stringify(r));
  const dir=path.dirname(r.illustratorScript),doc=await PDFDocument.load(fs.readFileSync(path.join(dir,'base-map.pdf')));assert.equal(doc.getPageCount(),1);
  let images=0;for(const [,o]of doc.context.enumerateIndirectObjects())if(o.dict?.get(PDFName.of('Subtype'))?.toString()==='/Image')images++;assert.equal(images,0,'No rasterized curves');
  const svg=fs.readFileSync(path.join(dir,'labels.svg'),'utf8');for(const station of records)assert(svg.includes(station.name),'Each selected station has editable name');
  const text=cp.execFileSync('/opt/homebrew/bin/pdftotext',[path.join(dir,'base-map.pdf'),'-'],{encoding:'utf8'});assert(text.includes('Period')&&text.includes('Phase')&&text.includes('resistivity'));
  const meta=JSON.parse(fs.readFileSync(path.join(r.outputDirectory,'curve_collection_labels.json')));assert.equal(meta.layout.cells.length,mode==='overlay'?1:3);
  const png=r.files.find(f=>f.endsWith('.png'));
  // Each panel must actually contain the coloured curves, not just empty axes.
  const image=require('electron').nativeImage.createFromPath(png),size=image.getSize(),bitmap=image.toBitmap(),frame=r.annotationLayout,scale=size.width/frame.width,pt=72/2.54;
  for(const cell of meta.layout.cells)for(const metric of ['rho','phase']){
   const y=cell.y+(metric==='rho'?meta.layout.phaseHeight+meta.layout.panelGap:0),height=metric==='rho'?meta.layout.rhoHeight:meta.layout.phaseHeight;
   const x0=Math.ceil((frame.ox+cell.x*pt)*scale),x1=Math.floor((frame.ox+(cell.x+meta.layout.plotWidth)*pt)*scale),y0=Math.ceil((frame.height-frame.oy-(y+height)*pt)*scale),y1=Math.floor((frame.height-frame.oy-y*pt)*scale);
   let colored=0;for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){const k=(yy*size.width+xx)*4,b=bitmap[k],g=bitmap[k+1],red=bitmap[k+2];if(Math.max(b,g,red)-Math.min(b,g,red)>35&&Math.min(b,g,red)<170)colored++;}
   assert(colored>30,`${mode}/${layout} ${metric} panel contains response paths (${colored})`);
  }
  fs.copyFileSync(png,path.join(out,cfg.outputName+'.png'));
  results.push({mode,layout,page:doc.getPage(0).getSize(),files:r.files,images});
  if(mode==='panels'&&layout==='rows'){
   await js(`applyConfigToUI(${JSON.stringify(cfg)});renderPreview(${JSON.stringify(png)},state.preview.revision,'responseCurve',{config:${JSON.stringify(cfg)}});openSettingsPanel('curveCollection');rcEl('mode').scrollIntoView({block:'start'});`);await pause(100);
   fs.writeFileSync(path.join(out,'组图设置.png'),(await win.webContents.capturePage()).toPNG());
  }
 }
 const noLegend={...config,showTitle:true,title:'多测点响应组图',outputName:'without_legend',illustratorPackage:true,curveCollection:{...config.curveCollection,showLegend:false}};
 const extra=await js(`window.mtApp.exportMap({records:${JSON.stringify(records)},config:${JSON.stringify(noLegend)},formats:['png','pdf']})`);assert(extra.ok);
 const extraSvg=fs.readFileSync(path.join(path.dirname(extra.illustratorScript),'labels.svg'),'utf8');assert(extraSvg.includes('多测点响应组图')&&!extraSvg.includes('Ex / Hy'));
 const bridge=require(path.join(root,'electron/illustrator-direct'));bridge.findIllustrator=async()=>({qa:true});bridge.exportNativeAI=async(script,target)=>{assert(fs.readFileSync(path.join(path.dirname(script),'labels.svg'),'utf8').includes(records[1].name));fs.copyFileSync(path.join(path.dirname(script),'base-map.pdf'),target);return target;};
 const direct=await js(`window.mtApp.exportMap({records:${JSON.stringify(records)},config:${JSON.stringify({...config,showTitle:true,title:'多测点响应组图'})},formats:['ai']})`);assert(direct.files.some(f=>f.endsWith('.ai')));
 assert.equal(JSON.stringify(records),before);assert(BrowserWindow.getAllWindows().every(w=>!w.isVisible()));
 fs.writeFileSync(path.join(out,'验证结果.json'),JSON.stringify({sources:paths,results,hidden:true,directBridge:'simulated; Illustrator not operated'},null,2));
 console.log('RESPONSE_COLLECTION_OK: real EDI/GMT, four layouts + overlay, names, editable vectors, UI reorder/undo/persistence, direct AI IPC');app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
