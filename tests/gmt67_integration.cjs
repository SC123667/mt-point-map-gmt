// Run with Electron and an isolated MT_GMT_WORKSPACE. No focus or input automation.
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module');
assert(process.env.MT_GMT_WORKSPACE,'Set an isolated QA workspace');
app.setActivationPolicy('prohibited');app.dock.hide();
const root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..'),out=process.env.MT_GMT_WORKSPACE;
const entry=path.join(root,'electron/main.js'),source=fs.readFileSync(entry,'utf8');assert(source.includes('width: 1280,'));
const mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));mod._compile(source.replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
async function wait(fn){for(let i=0;i<240;i++){if(await fn())return;await new Promise(r=>setTimeout(r,250));}throw Error('UI initialization timeout');}
app.whenReady().then(async()=>{try{
 let win;await wait(()=>win=BrowserWindow.getAllWindows()[0]);
 const js=s=>win.webContents.executeJavaScript(s);
 await wait(()=>js('typeof state!=="undefined" && !!state.gmtInfo').catch(()=>false));
 const status=await js('window.mtApp.recheckGMT()');assert(status.gmtInfo.version.startsWith('6.7.'));
 assert.equal(await js('document.querySelectorAll("#installBtn").length'),1);
 await js('openSettingsPanel("gmt")');assert(await js('document.getElementById("gmtEngineSelect").options.length>=2 && el.settingsDialog.open'));
 await new Promise(r=>setTimeout(r,500));
 fs.writeFileSync(path.join(out,'GMT设置.png'),(await win.webContents.capturePage()).toPNG());await js('closeSettingsDialog()');
 const legacy=status.engines.find(e=>e.version==='6.5.0');
 if(legacy){const r=await js(`window.mtApp.selectGMTEngine(${JSON.stringify(legacy.path)})`);assert.equal(r.gmtInfo.version,'6.5.0');}
 assert((await js('window.mtApp.selectGMTEngine("")')).gmtInfo.version.startsWith('6.7.'));
 const cases=[
  ['europe_mercator','-10/30/35/60','M16c'],['europe_lambert','-10/30/35/60','L10/45/35/55/16c'],
  ['global_robinson','-180/180/-90/90','N0/16c'],['north_pole','-180/180/60/90','S0/90/16c'],
  ['south_pole','-180/180/-90/-60','S0/-90/16c'],['date_line','170/190/-30/0','M180/16c']
 ];
 const results=[];
 for(const [name,region,projection] of cases){
  const [w,e,s,n]=region.split('/').map(Number),cx=(w+e)/2,cy=(s+n)/2;
  const features=[{name:'Test site',nameEn:'Test site',nameZh:'测试地点',category:'地点',geometry:{type:'Point',coordinates:[cx,cy]},style:{showLabel:true}},
   {name:'Test line',nameEn:'Test line',nameZh:'测试构造线',category:'断层',geometry:{type:'LineString',coordinates:[[w+(e-w)*.3,s+(n-s)*.35],[w+(e-w)*.6,s+(n-s)*.55]]},style:{showLabel:true}}];
  for(const language of ['zh','en']){
   const config={plotType:'baseMap',region,projection,showTerrain:false,showTitle:false,showScale:name.startsWith('europe'),showNorthArrow:false,showGrid:true,frame:'af',pngDpi:120,terrainAllowDownload:false,interactiveMap:true,outputName:name+'_'+language,cartography:{language,features,localLibrary:{enabled:false},contours:{show:false}}};
   const r=await js(`(async()=>{applyConfigToUI(${JSON.stringify(config)});clearTimeout(state.preview.autoTimer);const c=readConfig();c.interactiveMap=true;return window.mtApp.exportMap({records:[],config:c,formats:['png','pdf','eps']});})()`);
   assert(r.ok,name+': '+r.message);assert(r.gmtEngine.version.startsWith('6.7.'));assert(r.mapFrame);
   assert(fs.readFileSync(path.join(r.outputDirectory,config.outputName+'.gmt'),'utf8').includes('-J'+projection),name+' actual projection');
   for(const file of r.files)assert(fs.statSync(file).size>100,file);
   assert(r.annotationLayout?.labels.length,name+' labels');assert(!win.isVisible());
   results.push({name,language,files:r.files,engine:r.gmtEngine,labels:r.annotationLayout.labels.length});
  }
 }
 const responses=[.1,1,10].map(period=>({period,frequency:1/period,z:{xx:{re:1,im:1},xy:{re:2,im:3},yx:{re:-2,im:-3},yy:{re:1,im:2}},tipper:{x:{re:.1,im:.05},y:{re:.2,im:.1}},provided:{}}));
 const records=[{name:'S01',lon:10,lat:45,mtResponses:responses}];
 for(const plotType of ['stationMap','strikeMap','phaseTensorMap','tipperMap','responseCurve']){
  const config={plotType,region:'9/11/44/46',projection:'M16c',showTerrain:false,showScale:false,showTitle:false,showGrid:true,frame:'af',outputName:plotType,mtPeriod:1,curveStation:'S01',pngDpi:120,cartography:{features:[],localLibrary:{enabled:false}}};
  const r=await js(`(async()=>{applyConfigToUI(${JSON.stringify(config)});clearTimeout(state.preview.autoTimer);const c=readConfig();c.curveStation='S01';return window.mtApp.exportMap({records:${JSON.stringify(records)},config:c,formats:['png','pdf']});})()`);
  assert(r.ok,plotType+': '+r.message);
  const script=fs.readFileSync(path.join(r.outputDirectory,plotType+'.gmt'),'utf8');
  const marker={stationMap:'stations_points',strikeMap:'mt_strike',phaseTensorMap:'mt_phase_tensor',tipperMap:'mt_tipper',responseCurve:'curve_rho_xy'}[plotType];
  assert(script.includes(marker),plotType+' actual plot commands');
  results.push({name:plotType,files:r.files,engine:r.gmtEngine});
 }
 if(process.env.GMT_QA_TERRAIN_GRID){
  const grid=process.env.GMT_QA_TERRAIN_GRID;assert(fs.existsSync(grid));
  const config={plotType:'baseMap',region:'88/90/29/30',projection:'M16c',showTerrain:true,showScale:false,showTitle:false,outputName:'terrain_contours',terrainResolution:'30s',terrainPreview:true,terrainAllowDownload:false,terrainGridPath:grid,localTerrainGridPath:grid,pngDpi:120,cartography:{features:[],localLibrary:{enabled:false},contours:{show:true,interval:500,major:2000,labels:true}}};
  const r=await js(`(async()=>{applyConfigToUI(${JSON.stringify(config)});clearTimeout(state.preview.autoTimer);const c=readConfig();c.localTerrainGridPath=${JSON.stringify(grid)};c.terrainGridPath=c.localTerrainGridPath;c.terrainPreview=true;return window.mtApp.exportMap({records:[],config:c,formats:['png','pdf','eps']});})()`);
  assert(r.ok,r.message);assert(fs.readFileSync(path.join(r.outputDirectory,'terrain_contours.gmt'),'utf8').includes('grdcontour'));
  results.push({name:'terrain_contours',files:r.files,engine:r.gmtEngine});
 }
 await js('recheckGMT(false)');const snapshot=await js('createProjectSnapshot()');assert(snapshot.gmtEngine.version.startsWith('6.7.'));
 fs.writeFileSync(path.join(out,'gmt67-verified.json'),JSON.stringify({hiddenWindow:!win.isVisible(),inputAutomation:false,results},null,2));
 console.log('GMT67_INTEGRATION_OK',results.length,'map exports; engine selection and project version record');app.exit(0);
}catch(error){console.error(error);app.exit(1);}});
