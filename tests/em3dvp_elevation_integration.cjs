// Isolated hidden Electron + real GMT; no production disk, EM3DVP or foreground apps.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module'),cp=require('child_process'),crypto=require('crypto');
const root=path.join(__dirname,'..'),out=process.env.MT_GMT_WORKSPACE;assert(out&&/qa/.test(out));fs.mkdirSync(out,{recursive:true});
app.setActivationPolicy('prohibited');app.dock.hide();app.setPath('userData',path.join(out,'electron-userdata'));
const gmt='/opt/homebrew/bin/gmt',source=path.join(out,'已知高程.grd');
cp.execFileSync(gmt,['grdmath','-R87/89/28/30','-I0.25','-fg','X','100','MUL','Y','2','MUL','ADD','8858','SUB','=',source],{cwd:out,env:{...process.env,GMT_USERDIR:out}});
const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),before=hash();
const cfg={region:'87/89/28/30',terrainResolution:'03s',terrainAllowDownload:false,terrainSrtmSource:'ustc',terrainCacheDirectory:path.join(out,'地形缓存')};
const cache=require('../electron/terrain-cache'),p=cache.cachePaths(out,cfg);cache.initializeArea(p,cfg);fs.copyFileSync(source,p.gridPath);
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));
mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,').replace("const Task=terrainSource(config.terrainResolution)==='srtm'?SrtmTerrainWorkerTask:TerrainPrepareTask;","const Task=global.__terrainQATask||(terrainSource(config.terrainResolution)==='srtm'?SrtmTerrainWorkerTask:TerrainPrepareTask);"),entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{try{
 let win;for(let i=0;i<160;i++){win=BrowserWindow.getAllWindows()[0];if(win&&await win.webContents.executeJavaScript('typeof projectHistory!=="undefined"&&!!projectHistory.current').catch(()=>false))break;await pause(200);}
 const js=s=>win.webContents.executeJavaScript(s);
 await js(`window.alert=()=>{};refreshPreviewAutomatically=async()=>{};applyConfigToUI(${JSON.stringify({...cfg,plotType:'baseMap'})});clearTimeout(state.preview.autoTimer);openSettingsPanel('elevation');`);
 assert.equal(await js('readConfig().elevationExport.region'),cfg.region);
 assert.equal(await js('readConfig().elevationExport.resolution'),'03s');
 for(const width of [1000,1280]){win.setSize(width,850);await pause(100);for(const id of ['elevation-current','elevation-west','elevation-resolution','elevation-export'])assert(await js(`(()=>{const b=document.getElementById('${id}');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return b.checkVisibility()&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;})()`),id+' visible/hit');}
 const initialRegion=await js('readConfig().region');
 await js('resetProjectHistory();');
 await js("ee('stride').value=2;ee('stride').dispatchEvent(new Event('change',{bubbles:true}));");await pause(30);
 await js('undoProjectEdit();clearTimeout(state.preview.autoTimer);');assert.equal(await js('readElevationSettings().stride'),1);
 await js(`ee('west').value=87.5;ee('east').value=88.5;ee('south').value=28.5;ee('north').value=29.5;ee('west').dispatchEvent(new Event('change',{bubbles:true}));`);
 const saved=await js('createProjectSnapshot()');await js(`restoreProjectSnapshot(${JSON.stringify(saved)});clearTimeout(state.preview.autoTimer);openSettingsPanel('elevation');`);
 assert.equal(await js('readConfig().elevationExport.region'),'87.5/88.5/28.5/29.5');assert.equal(await js('readConfig().region'),initialRegion);
 const payload={region:'87.5/88.5/28.5/29.5',stride:1,unit:'m',config:cfg};
 const results=[];
 for(let i=0;i<2;i++){
  const r=await js(`window.mtApp.exportElevation(${JSON.stringify(payload)})`);assert(r.ok);results.push(r);
  const rows=fs.readFileSync(r.filePath,'utf8').trim().split('\n').map(l=>l.split(/\s+/).map(Number));assert.equal(rows.length,25);assert(rows.every(row=>row.length===3&&row.every(Number.isFinite)));for(const [lon,lat,z]of rows)assert(Math.abs(z-(lon*100+lat*2-8858))<1e-6);
  assert.equal(r.terrainSource,'覆盖指定范围的地形缓存');assert.deepEqual(r.requestedRegion,[87.5,88.5,28.5,29.5]);
 }
 assert.notEqual(results[0].filePath,results[1].filePath);assert(fs.existsSync(results[0].filePath));
 await js('exportEM3DVPElevation()');assert.match(await js("ee('status').textContent"),/已导出 25 个/);assert.equal(await js('readConfig().region'),initialRegion);
 // Native-source cache reuse and rejecting insufficient coverage.
 const elevation=require('../electron/em3dvp-elevation');assert.equal((await elevation.findCachedGrid({...cfg,localTerrainGridPath:source})).gridPath,source);
 assert.equal(await elevation.findCachedGrid({...cfg,region:'86/90/28/30',localTerrainGridPath:source}),null);
 const direct=await elevation.exportElevation({gridPath:source,region:cfg.region,stride:2,unit:'m'});assert.equal(direct.rows,25);assert.deepEqual(direct.elevationRangeMeters,[-102,102]);
 const ac=new AbortController();ac.abort();await assert.rejects(elevation.exportElevation({gridPath:source,region:cfg.region},{signal:ac.signal}),/取消/);
 await assert.rejects(elevation.exportElevation({gridPath:source,region:'86/89/28/30'}),/超出/);
 const nan=path.join(out,'missing.nc');cp.execFileSync(gmt,['grdmath',source,'0','DIV','=',nan],{cwd:out,env:{...process.env,GMT_USERDIR:out}});
 await assert.rejects(elevation.exportElevation({gridPath:nan,region:cfg.region}),/NaN|无效高程/);
 // Preparation routing is simulated; real network/disk data is intentionally deferred.
 let prepared,slow=false;
 global.__terrainQATask=class{
  constructor(options){prepared=options.config;this.w=options.webContents;this.done=false;}
  start(){if(!slow)this.finish('completed');}
  finish(state){this.done=true;this.w.send('terrain:progress',{state,percent:100,gridPath:source,message:state==='completed'?'prepared':'已取消'});}
  cancel(){this.finish('cancelled');}
 };
 const miss={...payload,config:{...cfg,terrainResolution:'01s',terrainAllowDownload:true,terrainSrtmSource:'aws'}};
 const preparedResult=await js(`window.mtApp.exportElevation(${JSON.stringify(miss)})`);assert.match(preparedResult.terrainSource,/自动准备/);assert.equal(prepared.region,payload.region);assert.equal(prepared.terrainResolution,'01s');assert.equal(prepared.terrainSrtmSource,'aws');assert.equal(prepared.terrainAllowDownload,true);
 slow=true;await js(`window.pendingElevation=window.mtApp.exportElevation(${JSON.stringify(miss)}).then(()=> 'unexpected',e=>e.message);void 0;`);
 await pause(500);await js('window.mtApp.cancelElevation()');assert.match(await js('window.pendingElevation'),/取消/);
 global.__terrainQATask=null;
 assert.equal(hash(),before);assert(!fs.readdirSync(path.join(out,'导出高程/EM3DVP')).some(n=>n.startsWith('.generating')));
 assert.equal(await js('el.settingsConfirmBtn.textContent'),'完成');
 await js("clearTimeout(state.preview.autoTimer);window.qaPreviews=0;scheduleAutoPreview=()=>window.qaPreviews++;confirmSettingsDialog();");assert.equal(await js('window.qaPreviews'),0);await js("openSettingsPanel('elevation');");
 assert(BrowserWindow.getAllWindows().every(w=>!w.isVisible()));
 fs.writeFileSync(path.join(out,'高程导出界面.png'),(await win.webContents.capturePage()).toPNG());
 fs.writeFileSync(path.join(out,'验证结果.json'),JSON.stringify({gmt:cp.execFileSync(gmt,['--version'],{encoding:'utf8'}).trim(),sourceSHA256:before,results,hidden:true},null,2));
 console.log('EM3DVP_INTEGRATION_OK: hidden UI, persistence, real GMT crop/cache/XYZ values, repeated export, native source, missing/cancel/cleanup');app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
