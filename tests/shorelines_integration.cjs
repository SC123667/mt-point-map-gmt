// Hidden real workbench: settings persistence, independent water controls,
// GMT vector/raster export and the existing MTpy manual-preview contract.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module');
const root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..'),out=process.env.MT_GMT_WORKSPACE;
assert(out&&/验证|qa/.test(out));assert(process.env.QA_COAST_CONFIG);
fs.mkdirSync(out,{recursive:true});
app.setActivationPolicy('prohibited');app.dock.hide();
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);
mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));
mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){if(await fn())return;await pause(100);}throw Error('Initialization timed out');}
app.whenReady().then(async()=>{try{
  let win;await until(async()=>{win=BrowserWindow.getAllWindows()[0];return win&&await win.webContents.executeJavaScript('typeof projectHistory!=="undefined"&&!!projectHistory.current').catch(()=>false);});
  const js=s=>win.webContents.executeJavaScript(s);
  const source=JSON.parse(fs.readFileSync(process.env.QA_COAST_CONFIG));
  const defaults=require(path.join(root,'electron/shorelines')).settings();
  const config={...source,shorelines:undefined,terrainCacheDirectory:path.join(out,'地形缓存'),terrainAllowDownload:false,interactiveMap:true};
  await js(`window.qaAlerts=[];window.alert=m=>qaAlerts.push(m);applyConfigToUI(${JSON.stringify(config)});clearTimeout(state.preview.autoTimer);openSettingsPanel('terrain');resetProjectHistory();`);
  assert.deepEqual(await js('readConfig().shorelines'),defaults,'Old projects must start with the new defaults');
  for(const id of ['showCoastInput','showInlandWaterInput','fillSeaInput','seaColorInput']){
    assert(await js(`document.getElementById('${id}').getBoundingClientRect().width>0`),id+' visible in existing panel');
  }
  await js("el.fillSeaInput.click();clearTimeout(state.preview.autoTimer)");
  assert(await js('el.seaColorInput.disabled'));
  await js('undoProjectEdit();clearTimeout(state.preview.autoTimer)');
  assert.deepEqual(await js('readConfig().shorelines'),defaults,'Undo restores water settings');
  assert.deepEqual(await js('qaAlerts.splice(0)'),['已撤销上一步，剩余 0 步可撤销。']);
  const terrain=await js('readConfig()');
  assert.equal(terrain.terrainCpt,config.terrainCpt,'Water controls preserve the terrain palette');
  assert.equal(terrain.terrainIntensity,config.terrainIntensity,'Water controls preserve shading');
  const selected={coast:false,inland:true,fillSea:false,seaColor:'#e6f0f4'};
  await js(`applyConfigToUI({...readConfig(),shorelines:${JSON.stringify(selected)}});clearTimeout(state.preview.autoTimer)`);
  const project=await js('createProjectSnapshot()');
  const projectPath=path.join(out,'海岸设置工程.json');fs.writeFileSync(projectPath,JSON.stringify(project,null,2));
  await js(`applyConfigToUI({shorelines:null});restoreProjectSnapshot(${fs.readFileSync(projectPath,'utf8')});clearTimeout(state.preview.autoTimer)`);
  assert.deepEqual(await js('readConfig().shorelines'),selected,'Settings survive saving and reopening');
  assert(await js('el.seaColorInput.disabled'));
  await js("setPlotType('phaseTensorMap');el.showCoastInput.click()");
  assert.equal(await js('state.preview.autoTimer'),null,'Shared controls must not auto-render MTpy');
  assert.match(await js('el.previewStatus.textContent'),/尚未绘制/);
  const results=[];
  const cases=process.env.QA_COAST_SMOKE ? [['默认',defaults]] : [
    ['默认',defaults],['海岸与河湖',{...defaults,coast:true,inland:true}],
    ['仅河湖',{...defaults,coast:false,inland:true}],
    ['纯地形',{coast:false,inland:false,fillSea:false,seaColor:defaults.seaColor}]
  ];
  for(const [name,shorelines] of cases){
    const c={...config,shorelines,outputName:'海岸优化_'+name};
    await js(`applyConfigToUI(${JSON.stringify(c)});clearTimeout(state.preview.autoTimer)`);
    const formats=['png','pdf','eps'];if(name==='默认'&&process.env.QA_COAST_AI)formats.push('ai');
    const r=await js(`window.mtApp.exportMap(${JSON.stringify({records:[],config:c,formats})})`);
    assert(r.ok,r.message);for(const f of r.files)assert(fs.statSync(f).size>100,f);
    const script=fs.readFileSync(path.join(r.outputDirectory,c.outputName+'.gmt'),'utf8');
    assert.equal(script.includes('-W1/'),shorelines.coast,'Independent coast outlines');
    assert.equal(script.includes('-W2/'),shorelines.inland,'Independent inland outlines');
    assert.equal(script.includes('-S'+shorelines.seaColor),shorelines.fillSea,'Independent sea fill');
    if(!shorelines.inland)assert(!script.includes('-W2/')&&!script.includes('-W3/')&&!script.includes('-W4/'));
    results.push({name,shorelines,files:r.files,engine:r.gmtEngine,mapFrame:r.mapFrame});
  }
  await js(`applyConfigToUI(${JSON.stringify({...config,shorelines:defaults})});clearTimeout(state.preview.autoTimer);openSettingsPanel('terrain')`);
  const preview=results[0].files.find(f=>f.endsWith('.png'));
  await js(`renderPreview(${JSON.stringify(preview)})`);await pause(400);
  fs.writeFileSync(path.join(out,'地形底图设置.png'),(await win.webContents.capturePage()).toPNG());
  assert.deepEqual(await js('qaAlerts'),[]);assert(!win.isVisible());
  fs.writeFileSync(path.join(out,'海岸验证结果.json'),JSON.stringify({persistence:true,undo:true,terrainStylePreserved:true,mtpyManual:true,results},null,2));
  console.log('SHORELINES_WORKBENCH_OK',JSON.stringify(results.map(r=>({name:r.name,files:r.files,engine:r.engine}))));
  app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
