const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module'),{execFileSync}=require('child_process');
const out=process.env.MT_GMT_WORKSPACE,root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..');assert(out&&out.includes('/验证/'));fs.mkdirSync(out,{recursive:true});app.setActivationPolicy('prohibited');app.dock.hide();
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms));const timer=setTimeout(()=>{console.error('Colorbar UI timeout');app.exit(1);},240000);
app.whenReady().then(async()=>{try{
 let win;for(let n=0;n<120;n++){win=BrowserWindow.getAllWindows()[0];if(win&&await win.webContents.executeJavaScript('typeof projectHistory!=="undefined"&&!!projectHistory.current').catch(()=>false))break;await pause(100);}
 const js=s=>win.webContents.executeJavaScript(s);
 const project=JSON.parse(fs.readFileSync('/Volumes/MacBook Pro SSD/GMT-缓存/工程文件/edi_更新v1.29.1前_20261103.mtgmt'));
 await js(`window.qaAlerts=[];window.alert=m=>qaAlerts.push(m);restoreProjectSnapshot(${JSON.stringify(project)});clearTimeout(state.preview.autoTimer);state.outputDirectory='';setPlotType('phaseTensorMap');clearTimeout(state.preview.autoTimer);resetProjectHistory();true;`);
 assert.equal(await js('readTerrainColorbar().autoRange'),true);
 assert.equal(await js('readTerrainColorbar().max'),2500);
 assert.equal(await js('readTerrainColorbar().step'),500);
 await js("document.getElementById('terrainColorbar-max').value='4000';document.getElementById('terrainColorbar-max').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('terrainColorbar-max').dispatchEvent(new Event('change',{bubbles:true}));true;");
 await pause(150);assert.equal(await js('readTerrainColorbar().autoRange'),false);assert.equal(await js('readTerrainColorbar().max'),4000);assert.equal(await js('state.preview.autoTimer'),null);
 const saved=await js('createProjectSnapshot()');await js('undoProjectEdit();');assert.equal(await js('readTerrainColorbar().autoRange'),true);assert.equal(await js('readTerrainColorbar().max'),2500);
 await js(`restoreProjectSnapshot(${JSON.stringify(saved)});clearTimeout(state.preview.autoTimer);true;`);assert.equal(await js('readTerrainColorbar().autoRange'),false);assert.equal(await js('readTerrainColorbar().max'),4000);
 await js("document.getElementById('terrainColorbar-autoRange').checked=true;document.getElementById('terrainColorbar-autoRange').dispatchEvent(new Event('change',{bubbles:true}));true;");assert.equal(await js('readTerrainColorbar().max'),2500);
 await js('scheduleAutoPreview=()=>{};true;');
 const manifest=JSON.parse(fs.readFileSync('/Volumes/MacBook Pro SSD/GMT-缓存/配色预览/地形配色对比_20261103/manifest.json'));
 const grid=manifest.sources[0].path,shade=manifest.sources[1].path;
 const config=await js('readConfig()'),base={...config,showTerrain:true,terrainCpt:'terrainF',terrainGridPath:grid,terrainShadePath:shade,terrainAllowDownload:false,pngDpi:100,interactiveMap:true};
 const results=[];
 for(const variant of ['baseMap','stationMap','manual']){
  const c={...base,plotType:variant==='stationMap'?'stationMap':'baseMap',outputName:'自动高程_'+variant,terrainColorbar:variant==='manual'?{...config.terrainColorbar,autoRange:false,max:4000,step:1000}:config.terrainColorbar};
  const r=await js(`window.mtApp.exportMap({records:${variant==='stationMap'?'state.records':'[]'},terrainRecords:state.allRecords,config:${JSON.stringify(c)},formats:['png','pdf']})`);assert(r.ok,r.message);
  assert.equal(r.terrainScale.settings.max,variant==='manual'?4000:3500);assert.equal(r.terrainScale.settings.step,variant==='manual'?1000:500);
  if(variant!=='manual'){assert.equal(r.terrainScale.ediMax,2454);assert.equal(r.terrainScale.terrainMax,3042);}
  const pdf=r.files.find(f=>f.endsWith('.pdf')),text=execFileSync('/opt/homebrew/bin/pdftotext',[pdf,'-'],{encoding:'utf8'});assert.equal(text.includes('Elevation'),variant!=='stationMap');
  const cpt=fs.readFileSync(path.join(r.outputDirectory,'terrain_terrainF.cpt'),'utf8');assert(cpt.includes(String(r.terrainScale.settings.max)));
  if(variant==='baseMap'){
   await js(`applyTerrainScale(${JSON.stringify(r.terrainScale)});true;`);assert.equal(await js('readTerrainColorbar().max'),3500);
   await js("document.getElementById('terrainColorbar-unit').value='km';true;");assert.equal(await js('readTerrainColorbar().max'),3500);
   const script=await js(`window.mtApp.buildScript({records:[],terrainRecords:state.allRecords,config:${JSON.stringify(c)},formats:['pdf']})`);assert(script.includes('-Bxa500'));
   await js(`renderPreview(${JSON.stringify(r.preview||r.files.find(f=>f.endsWith('.png')))})`);await js("openSettingsPanel('terrain');document.getElementById('terrainColorbar-autoRange').scrollIntoView({block:'start'});true;");await pause(150);fs.writeFileSync(path.join(out,'自动高程工作台.png'),(await win.webContents.capturePage()).toPNG());
  }
  results.push({variant,...r});console.log('VERIFIED',variant,r.terrainScale);
 }
 assert.deepEqual(await js('state.allRecords'),project.allRecords);
 fs.writeFileSync(path.join(out,'verified.json'),JSON.stringify({root,autoEDI:true,demChecked:true,manualOverride:true,persistence:true,undo:true,hidden:true,recordsUnchanged:true,results},null,2));clearTimeout(timer);app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
