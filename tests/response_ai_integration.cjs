// Hidden Electron + real EDI/GMT. Illustrator itself is never opened.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module');
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
 const edi=process.env.QA_EDI;assert(edi,'QA_EDI must identify a real EDI file');
 const station=require(path.join(root,'electron/parser')).parseEdiStationText(fs.readFileSync(edi,'utf8'),edi);assert(station.mtResponses.length>10);
 const records=[station,{...station,name:'中文测点',mtResponses:station.mtResponses.slice(3)}],before=JSON.stringify(records);
 await js(`window.alert=()=>{};refreshPreviewAutomatically=async()=>{};loadParsed({records:${JSON.stringify(records)},rows:[],columns:['name','lon','lat'],mapping:{coordinateType:'geographic',name:'name',lon:'lon',lat:'lat'},region:'86/96/28/32'});applyConfigToUI({plotType:'responseCurve',curveStation:${JSON.stringify(station.name)},title:'MT Survey Stations',showTitle:true,outputName:'curve_real_edi',pngDpi:150,showTerrain:true,showScale:true,showNorthArrow:true,swapAxes:true,legend:{show:true},cartography:{contours:{show:true},localLibrary:{enabled:true},features:[]}});setPlotType('responseCurve');clearTimeout(state.preview.autoTimer);openSettingsPanel('mtParams');`);
 for(const id of ['curveExportAiBtn','curveExportPackageBtn'])assert(await js(`(()=>{const b=document.getElementById('${id}');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return b.checkVisibility()&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;})()`),id+' visible/hit');
 fs.writeFileSync(path.join(out,'曲线AI导出面板.png'),(await win.webContents.capturePage()).toPNG());
 const args=await js(`(()=>{const original=exportMap;let captured;try{exportMap=(...a)=>captured=a;document.getElementById('curveExportAiBtn').click();return captured;}finally{exportMap=original;}})()`);assert.deepEqual(args,[['ai'],true]);
 const packageArgs=await js(`(()=>{const original=exportMap;let captured;try{exportMap=(...a)=>captured=a;document.getElementById('curveExportPackageBtn').click();return captured;}finally{exportMap=original;}})()`);assert.deepEqual(packageArgs,[['pdf'],true,{illustrator:true}]);
 const cfg=await js('readConfig()');assert(!cfg.showTerrain&&!cfg.cartography.contours.show);
 const {PDFDocument,PDFName}=require(path.join(root,'node_modules/pdf-lib'));
 const results=[];
 async function check(config){
  const r=await js(`window.mtApp.exportMap({records:${JSON.stringify(records)},config:${JSON.stringify({...config,illustratorPackage:true})},formats:['png','pdf','eps']})`);assert(r.ok&&r.illustratorScript);
  const dir=path.dirname(r.illustratorScript),pdf=fs.readFileSync(path.join(dir,'base-map.pdf')),doc=await PDFDocument.load(pdf);let images=0;
  for(const [,obj] of doc.context.enumerateIndirectObjects())if(obj.dict?.get(PDFName.of('Subtype'))?.toString()==='/Image')images++;
  assert.equal(images,0,'Response PDF must not flatten to raster');assert.equal(doc.getPageCount(),1);
  const text=require('child_process').execFileSync('/opt/homebrew/bin/pdftotext',[path.join(dir,'base-map.pdf'),'-'],{encoding:'utf8'});assert(text.includes('Phase')&&text.includes('resistivity')&&text.includes('Period')&&text.includes('XY')&&text.includes('YX'),'Editable axis text');
  const svg=fs.readFileSync(path.join(dir,'labels.svg'),'utf8');assert(!svg.includes('native-scale'),'No map scale');
  const jsx=fs.readFileSync(r.illustratorScript,'utf8');assert(jsx.includes('"plotType":"responseCurve"'));
  if(config.showTitle!==false)assert(svg.includes(config.title&&config.title!=='MT Survey Stations'?config.title:config.curveStation+' MT response'));
  else assert(!svg.includes('MT response'));
  assert(!r.nativeLegend&&!r.inset);results.push({files:r.files,curveStation:config.curveStation,vectorImages:images});return r;
 }
 const r=await check(cfg);
 assert(await js(`renderPreview(${JSON.stringify(r.files.find(f=>f.endsWith('.png')))},state.preview.revision,state.plotType,{config:${JSON.stringify(cfg)}})`));await pause(200);assert(await js('state.preview.hasImage'));fs.copyFileSync(r.files.find(f=>f.endsWith('.png')),path.join(out,'曲线输出.png'));
 await js('closeSettingsDialog();renderCurveContext();');await pause(150);
 for(const width of [1000,1280]){
  win.setSize(width,820);await pause(80);
  assert(await js(`(()=>{const b=document.getElementById('canvasCurveStation'),r=b.getBoundingClientRect();return b.checkVisibility()&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b&&b.value===el.curveStationInput.value;})()`),'Visible station selector');
  assert(await js(`getComputedStyle(el.mtPeriodInput.closest('label')).display==='none'`),'Single period does not apply to full response curves');
 }
 await js('resetProjectHistory();document.getElementById("canvasCurveNext").click();');
 assert(await js(`el.curveStationInput.value==='中文测点'&&document.getElementById('canvasCurveStation').value==='中文测点'&&el.canvasDataMeta.textContent.includes('图中：')&&el.canvasDataMeta.textContent.includes('待更新：中文测点')`),'Do not misidentify old preview as the newly selected station');
 await js('undoProjectEdit();clearTimeout(state.preview.autoTimer);');assert.equal(await js('el.curveStationInput.value'),station.name);
 await js(`renderPreview(${JSON.stringify(r.files.find(f=>f.endsWith('.png')))},state.preview.revision,state.plotType,{config:${JSON.stringify(cfg)}})`);await pause(100);
 fs.writeFileSync(path.join(out,'曲线预览.png'),(await win.webContents.capturePage()).toPNG());
 await check({...cfg,curveStation:'中文测点',title:'',outputName:'curve_chinese'});
 await check({...cfg,showTitle:false,outputName:'curve_no_title'});
 // Full direct-AI IPC branch with only the external Illustrator bridge substituted.
 const bridge=require(path.join(root,'electron/illustrator-direct'));bridge.findIllustrator=async()=>({qa:true});bridge.exportNativeAI=async(script,target)=>{assert(fs.existsSync(script));assert(fs.readFileSync(script,'utf8').includes('"plotType":"responseCurve"'));fs.copyFileSync(path.join(path.dirname(script),'base-map.pdf'),target);return target;};
 const direct=await js(`window.mtApp.exportMap({records:${JSON.stringify(records)},config:${JSON.stringify(cfg)},formats:['ai']})`);assert(direct.files.length===1&&direct.files[0].endsWith('.ai'));
 assert.equal(JSON.stringify(records),before);assert(BrowserWindow.getAllWindows().every(w=>!w.isVisible()));
 fs.writeFileSync(path.join(out,'验证结果.json'),JSON.stringify({edi,results,directBridge:'simulated; real Illustrator not operated',hidden:true},null,2));
 console.log('RESPONSE_AI_OK: real EDI, visible controls, selected station, bilingual/no title, vector axes and no image, PNG/PDF/EPS/package, direct IPC mock');app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
