// Real hidden workbench; original EDI and terrain read only; isolated outputs.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module');
const root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..'),out=process.env.MT_GMT_WORKSPACE;
assert(out&&/验证|qa/.test(out));fs.mkdirSync(out,{recursive:true});app.setActivationPolicy('prohibited');app.dock.hide();
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));
mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{try{
 let win;for(let i=0;i<160;i++){win=BrowserWindow.getAllWindows()[0];if(win&&await win.webContents.executeJavaScript('typeof projectHistory!=="undefined"&&!!projectHistory.current').catch(()=>false))break;await pause(200);}
 const js=s=>win.webContents.executeJavaScript(s);
 assert(await js('!!projectHistory.current'),'Workbench initialized');
 const base='/Volumes/MacBook Pro SSD/GMT-缓存/导出图件/MTpy_独立编辑与比例尺修正_v1.28.3';
 const config=JSON.parse(fs.readFileSync(path.join(base,'工作台设置.json'))),original=JSON.parse(fs.readFileSync(path.join(base,'MTpy分析记录.json')));
 const availablePaths=JSON.parse(fs.readFileSync('/tmp/gmt-readable-edi.json'));
 const available=original.sources.filter(s=>availablePaths.includes(s.path));
 const records=available.map(s=>({name:s.station,lon:s.longitude,lat:s.latitude,sourcePath:s.path,mtResponses:[]}));
 const defaults=await js('readPresentation()');assert.equal(defaults.frameStyle,'fancy');
 await js(`window.qaAlerts=[];window.alert=m=>qaAlerts.push(m);state.records=${JSON.stringify(records)};state.allRecords=state.records;applyConfigToUI(${JSON.stringify({...config,plotType:'phaseTensorMap',pngDpi:180})});state.terrain.localGridPath=${JSON.stringify(config.terrainGridPath)};clearTimeout(state.preview.autoTimer);resetProjectHistory();openSettingsPanel('mtParams');`);
 assert.equal(await js('readConfig().mtpy.maxGap'),config.mtpy.maxGap,'Preserve science settings');
 await js("document.getElementById('presentation-frameWidth').value='3';document.getElementById('presentation-frameWidth').dispatchEvent(new Event('change',{bubbles:true}));");
 await pause(100);assert.equal(await js('state.preview.autoTimer'),null);assert.match(await js('el.previewStatus.textContent'),/尚未绘制/);
 await js('undoProjectEdit();');assert.equal(await js('readPresentation().frameWidth'),2);
 await js("document.getElementById('presentation-fontFamily').value='Arial';document.getElementById('presentation-fontFamily').dispatchEvent(new Event('change',{bubbles:true}));");
 const snapshot=await js('createProjectSnapshot()');await js(`applyConfigToUI({presentation:{frameStyle:'plain'}});restoreProjectSnapshot(${JSON.stringify(snapshot)});clearTimeout(state.preview.autoTimer);`);
 assert.equal(await js('readPresentation().fontFamily'),'Arial');assert.equal(await js('readPresentation().frameStyle'),'fancy');
 await js("restorePresentation({...readPresentation(),fontFamily:'Times New Roman',labelFormat:'abbreviation'});document.getElementById('mtpyPanelGap').value='3';");
 const results=[];
 if(process.env.QA_MAP==='1'){
  const c=await js('readConfig()');const result=await js(`window.mtApp.exportMap({records:[],config:${JSON.stringify({...c,plotType:'baseMap',terrainAllowDownload:false,outputName:'默认黑白边框地图'})},formats:['png','pdf','eps']})`);
  assert(result.ok,result.message);const script=fs.readFileSync(path.join(result.outputDirectory,'默认黑白边框地图.gmt'),'utf8');assert(script.includes('MAP_FRAME_TYPE fancy'));assert(script.includes('MAP_FRAME_WIDTH 2p'));console.log('GMT_FANCY_MAP_OK',result.files);fs.writeFileSync(path.join(out,'base-map.json'),JSON.stringify(result,null,2));
 }

 for(const colorBy of process.env.QA_QUICK?['phimin']:['beta','phimin']){
  await js(`restorePresentation({...readPresentation(),colorBy:${JSON.stringify(colorBy)},fontFamily:${JSON.stringify(colorBy==='phimin'?'Arial':'Times New Roman')}});`);
  if(colorBy==='phimin')await js("document.getElementById('mtpyPeriods').value='1,100';document.getElementById('mtpyMode').value='phase';");
  const formats=['png','pdf'];if(process.env.QA_AI==='1')formats.push('ai');
  const result=await js(`window.mtApp.exportMap({records:state.records,config:{...readConfig(),terrainAllowDownload:false,outputName:'论文参数_${colorBy}'},formats:${JSON.stringify(formats)}})`);
  assert(result.ok,result.message);assert.equal(result.mtpy.presentation.colorBy,colorBy);
  const {PDFDocument}=require('pdf-lib');const doc=await PDFDocument.load(fs.readFileSync(result.mtpy.pdf));assert(Math.abs(doc.getPage(0).getWidth()-180*72/25.4)<1e-6);
  const periods=result.mtpy.panels.map(p=>p.period);assert.deepEqual(result.mtpy.rows.map(r=>Object.fromEntries(Object.keys(original.rows[0]).map(k=>[k,r[k]]))),original.rows.filter(r=>periods.includes(r.period_s)&&availablePaths.includes(r.source)),'Scientific rows unchanged from recorded originals');
  const text=require('child_process').execFileSync('/opt/homebrew/bin/pdftotext',[result.mtpy.pdf,'-'],{encoding:'utf8'});assert(text.includes('(a)'));assert(text.includes(colorBy==='beta'?'β':'φmin'));
  if(colorBy==='beta')assert.equal(result.mtpy.panels.length,5);
  results.push(result);assert(await js(`renderPreview(${JSON.stringify(result.preview)})`),'Preview image loaded');await js("openSettingsPanel('mtParams')");
  console.log('VERIFIED',colorBy,result.mtpy.panels.map(p=>[p.period,p.stations]),result.mtpy.pdf);
 }
 assert(await js("exportMap(['png'],false)"),'Actual manual preview workflow');assert(await js('state.preview.hasImage && state.preview.imageWidth>100'),'Preview displayed');await pause(400);
 for(const key of ['outputWidthMM','frameSegments','colorBy','phaseMin','ellipsePen'])assert(await js(`(()=>{const e=document.getElementById('presentation-${key}');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.width>30&&r.left>=0&&r.right<=innerWidth})()`),key+' visible');
 await js("document.getElementById('presentation-colorBy').scrollIntoView({block:'center'})");
 await pause(500);
 fs.writeFileSync(path.join(out,'参数面板.png'),(await win.webContents.capturePage()).toPNG());
 fs.writeFileSync(path.join(out,'verified.json'),JSON.stringify({root,persistence:true,undo:true,manualPreview:true,scientificRowsUnchanged:true,availableStations:available.length,unavailableSources:original.sources.filter(s=>!availablePaths.includes(s.path)).map(s=>s.path),results},null,2));app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
