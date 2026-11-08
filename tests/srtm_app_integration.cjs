// Actual user's saved project, read-only input; all test products isolated.
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module'),{execFileSync}=require('child_process');
const out=process.env.MT_GMT_WORKSPACE,root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..');assert(out&&out.includes('/验证/'));fs.mkdirSync(out,{recursive:true});app.setActivationPolicy('prohibited');app.dock.hide();
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms));const timer=setTimeout(()=>{console.error('Workbench regression timeout');app.exit(1);},90000);
app.whenReady().then(async()=>{try{
 let win;for(let n=0;n<120;n++){win=BrowserWindow.getAllWindows()[0];if(win&&await win.webContents.executeJavaScript('typeof projectHistory!=="undefined"&&!!projectHistory.current').catch(()=>false))break;await pause(100);}
 const js=s=>win.webContents.executeJavaScript(s),task=JSON.parse(fs.readFileSync('/Volumes/MacBook Pro SSD/GMT-缓存/验证/v1.29.1/任务信息.json'));
 const snapshot=JSON.parse(fs.readFileSync(task.currentProject));snapshot.outputDirectory='';const config={...snapshot.config,terrainAllowDownload:false,terrainCacheDirectory:path.join(out,'地形缓存')};snapshot.config=config;
 const gmt=require(path.join(root,'electron/gmt')),cache=require(path.join(root,'electron/terrain-cache')),origin=gmt.terrainPaths(out,task.config),p3=gmt.terrainPaths(out,config);cache.initializeArea(p3,config);fs.copyFileSync(origin.gridPath,p3.gridPath);
 const p15=gmt.terrainPaths(out,{...config,terrainResolution:'15s',terrainPreview:true});cache.initializeArea(p15,config);execFileSync('/opt/homebrew/bin/gmt',['grdsample',path.basename(p3.gridPath),'-I15s+e','-G'+path.basename(p15.gridPath)],{cwd:p3.directory});
 await js(`window.qaAlerts=[];window.alert=m=>qaAlerts.push(m);restoreProjectSnapshot(${JSON.stringify(snapshot)});clearTimeout(state.preview.autoTimer);state.outputDirectory='';scheduleAutoPreview=()=>{};true;`);
 for(const c of [config,{...config,terrainResolution:'15s',terrainPreview:true}]){await js(`prepareTerrain(true,${JSON.stringify(c)})`);assert(await js('!!state.terrain.shadePath'),'Prepared shade');}
 assert(await js("exportMap(['png'],false)"),'Real preview workflow');assert(await js('state.preview.hasImage&&state.records.length===81'),'81-station preview displayed');
 const exported=await js("window.mtApp.exportMap({records:state.records,config:{...readConfig(),terrainGridPath:state.terrain.gridPath,terrainShadePath:state.terrain.shadePath,terrainAllowDownload:false},formats:['pdf']})");assert(exported.ok,exported.message);
 const pdf=exported.files.find(f=>f.endsWith('.pdf'));const images=execFileSync('/opt/homebrew/bin/pdfimages',['-list',pdf],{encoding:'utf8'});assert(/\simage\s/.test(images),'Terrain raster actually embedded, not merely successful empty basemap');
 await js("openSettingsPanel('terrain')");await pause(400);
 const state=await js('({terrain:state.terrain,config:readConfig(),preview:state.preview.hasImage,status:el.terrainProgressText.textContent,alerts:qaAlerts})');assert(!state.alerts.length,JSON.stringify(state.alerts));
 fs.writeFileSync(path.join(out,'verified.json'),JSON.stringify(state,null,2));fs.writeFileSync(path.join(out,'修复后工作台.png'),(await win.webContents.capturePage()).toPNG());console.log('SRTM_APP_OK: 03s and 15s shade + 81-station manual preview');clearTimeout(timer);app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
