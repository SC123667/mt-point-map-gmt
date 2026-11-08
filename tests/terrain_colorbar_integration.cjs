const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module'),{execFileSync}=require('child_process');
const out=process.env.MT_GMT_WORKSPACE,root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..');assert(out&&out.includes('/验证/'));fs.mkdirSync(out,{recursive:true});app.setActivationPolicy('prohibited');app.dock.hide();
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms));const timer=setTimeout(()=>{console.error('Colorbar UI timeout');app.exit(1);},240000);
app.whenReady().then(async()=>{try{
 let win;for(let n=0;n<120;n++){win=BrowserWindow.getAllWindows()[0];if(win&&await win.webContents.executeJavaScript('typeof projectHistory!=="undefined"&&!!projectHistory.current').catch(()=>false))break;await pause(100);}
 const js=s=>win.webContents.executeJavaScript(s),file='/Volumes/MacBook Pro SSD/GMT-缓存/工程文件/edi_更新v1.29.1前_20261103.mtgmt',project=JSON.parse(fs.readFileSync(file));project.outputDirectory='';
 await js(`window.qaAlerts=[];window.alert=m=>qaAlerts.push(m);restoreProjectSnapshot(${JSON.stringify(project)});clearTimeout(state.preview.autoTimer);state.outputDirectory='';setPlotType('phaseTensorMap');clearTimeout(state.preview.autoTimer);resetProjectHistory();true;`);
 assert.equal(await js('readTerrainColorbar().show'),true);
 await js("document.getElementById('terrainColorbar-widthMM').value='55';document.getElementById('terrainColorbar-widthMM').dispatchEvent(new Event('change',{bubbles:true}));");await pause(100);await js('undoProjectEdit();');assert.equal(await js('readTerrainColorbar().widthMM'),45);
 await js("restoreTerrainColorbar({...readTerrainColorbar(),unit:'km',align:'right',widthMM:50});");const snapshot=await js('createProjectSnapshot()');await js(`restoreTerrainColorbar({});restoreProjectSnapshot(${JSON.stringify(snapshot)});clearTimeout(state.preview.autoTimer);true;`);assert.equal(await js('readTerrainColorbar().unit'),'km');assert.equal(await js('readTerrainColorbar().align'),'right');
 await js("setPlotType('stationMap');clearTimeout(state.preview.autoTimer);scheduleAutoPreview=()=>{};restoreTerrainColorbar({});true;");
 const config=await js('readConfig()'),source=require(path.join(root,'electron/gmt')).terrainPaths(out,{...config,terrainResolution:'15s',terrainPreview:true,terrainCacheDirectory:'/Volumes/MacBook Pro SSD/GMT-缓存/地形缓存'});
 assert(fs.existsSync(source.gridPath));const base={...config,interactiveMap:true,terrainGridPath:source.gridPath,terrainShadePath:source.shadePath,terrainAllowDownload:false,pngDpi:150};const results=[];
 for(const variant of ['m','km','hidden','plain','station']){
  const c={...base,plotType:variant==='station'?'stationMap':'baseMap',outputName:'高程色标_'+variant,showTerrain:variant!=='plain',terrainColorbar:{...config.terrainColorbar,show:variant!=='hidden',unit:variant==='km'?'km':'m'}};
  const formats=['png','pdf','eps'];if(variant==='m'&&process.env.QA_AI==='1')formats.push('ai');
  const r=await js(`window.mtApp.exportMap({records:state.records,config:${JSON.stringify(c)},formats:${JSON.stringify(formats)}})`);assert(r.ok,r.message);const pdf=r.files.find(f=>f.endsWith('.pdf'));const text=execFileSync('/opt/homebrew/bin/pdftotext',[pdf,'-'],{encoding:'utf8'});
  assert.equal(text.includes('Elevation'),['m','km'].includes(variant));if(['m','km'].includes(variant)){assert(r.mapFrame,'Interactive map frame');const bbox=execFileSync('/opt/homebrew/bin/pdftotext',['-bbox',pdf,'-'],{encoding:'utf8'}),height=Number(bbox.match(/<page[^>]*height="([^"]+)"/)[1]),y=Number(bbox.match(/<word[^>]*yMin="([^"]+)"[^>]*>Elevation<\/word>/)[1]);assert(y>height-r.mapFrame.oy,'Legend must be below map frame');}if(variant==='m')assert(text.includes('3500'));if(variant==='km')assert(text.includes('3.5'));
  const images=execFileSync('/opt/homebrew/bin/pdfimages',['-list',pdf],{encoding:'utf8'});assert.equal(/\simage\s/.test(images),variant!=='plain');
  if(variant==='m'){assert(await js(`renderPreview(${JSON.stringify(r.preview||r.files.find(f=>f.endsWith('.png')))})`));await js("openSettingsPanel('terrain');document.getElementById('terrainColorbar-show').scrollIntoView({block:'start'});");await pause(400);fs.writeFileSync(path.join(out,'高程色标工作台.png'),(await win.webContents.capturePage()).toPNG());}
  results.push({variant,...r});console.log('VERIFIED',variant,pdf);
 }
 assert.deepEqual(await js('state.allRecords'),project.allRecords,'Source records unchanged');
 fs.writeFileSync(path.join(out,'verified.json'),JSON.stringify({root,persistence:true,undo:true,units:true,visibility:true,recordsUnchanged:true,results},null,2));clearTimeout(timer);app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
