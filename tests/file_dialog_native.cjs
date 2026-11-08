// Visible isolated macOS QA. A controller selects only this process's fixture files.
const {app,BrowserWindow,dialog}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module');
const root=process.env.QA_MODULE_ROOT||path.resolve(__dirname,'..'),out=process.env.MT_GMT_WORKSPACE;
assert(out&&/验证|qa/.test(out));fs.mkdirSync(out,{recursive:true});
const files=path.join(out,'files'),nested=path.join(files,'nested');fs.mkdirSync(nested,{recursive:true});
const fixture=(name,id,coords)=>fs.writeFileSync(name,JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',id,properties:{name:id},geometry:{type:'LineString',coordinates:coords}}]}));
fixture(path.join(files,'root.geojson'),'root-line',[[87,25],[88,26]]);fixture(path.join(nested,'nested.geojson'),'nested-line',[[89,25],[90,26]]);
const realOpen=dialog.showOpenDialog.bind(dialog),calls=[];
dialog.showOpenDialog=(...args)=>{
 assert(args[0] instanceof BrowserWindow,'Every real native panel must have an owner');
 calls.push({owner:args[0].id,title:args[1].title,properties:args[1].properties});
 return realOpen(args[0],{...args[1],defaultPath:files});
};
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));mod._compile(fs.readFileSync(entry,'utf8'),entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<500;i++){if(await fn())return;await pause(100);}throw Error('Native QA timed out');}
const phase=(step,action)=>fs.writeFileSync(path.join(out,'native-control.json'),JSON.stringify({pid:process.pid,title:'GMT 文件选择验证',step,action}));
app.whenReady().then(async()=>{try{
 let win;await until(async()=>{win=BrowserWindow.getAllWindows()[0];return win&&await win.webContents.executeJavaScript('typeof cartUI!=="undefined"&&!!state.gmtInfo').catch(()=>false);});
 win.on('page-title-updated',e=>e.preventDefault());win.setTitle('GMT 文件选择验证');
 const js=s=>win.webContents.executeJavaScript(s);await pause(1000);
 await js('window.qaAlerts=[];window.alert=m=>qaAlerts.push(m);applyConfigToUI({plotType:"baseMap",region:"86/100/20/30",showTerrain:false,showScale:false,showTitle:false,terrainAllowDownload:false,cartography:{features:[],localLibrary:{enabled:false}}});clearTimeout(state.preview.autoTimer);openSettingsPanel("cartography");void 0');
 const actions=['cancel','nested-file','root-file','cancel','root-file'];
 for(const [index,action]of actions.entries()){
  const before=calls.length;
  await js('void importCartData();void importCartData()');await until(()=>calls.length===before+1);
  // Exercise the existing offscreen-window pattern while the sheet is open.
  const hidden=new BrowserWindow({show:false,focusable:false,webPreferences:{offscreen:true,sandbox:true}});await hidden.loadURL('about:blank');hidden.destroy();
  phase(index+1,action);
  await until(()=>js('!cartUI.picking&&!cartUI.busy'));
  assert.equal(calls.length,before+1);assert(await js('!ce("import").disabled&&!ce("source-import").disabled'));
 }
 assert.equal(await js('state.cartography.features.length'),2);
 await js('openSettingsPanel("localLibrary");le("import").click();le("import").click()');await until(()=>calls.length===6);phase(6,'nested-folder');
 await until(()=>js('!libraryUI.picking&&!libraryUI.busy'));
 assert(await js('libraryUI.summary.ready&&libraryUI.summary.total===1'));
 await js('openSettingsPanel("cartography");void importCartData()');await until(()=>calls.length===7);phase(7,'cancel');await until(()=>js('!cartUI.picking&&!cartUI.busy'));
 assert.deepEqual(await js('qaAlerts'),[]);
 const report={version:JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,nativePanels:calls,actualFolderNavigation:true,actualFileImport:true,actualLibraryFolderImport:true,features:await js('state.cartography.features.length'),repeatedCancelAndRetry:true,hiddenRenderWindowDuringPicker:true};
 fs.writeFileSync(path.join(out,'native-results.json'),JSON.stringify(report,null,2));phase(8,'done');console.log('NATIVE_FILE_DIALOG_OK',JSON.stringify(report));app.exit(0);
}catch(e){phase(-1,String(e.stack));console.error(e.stack);app.exit(1);}});
