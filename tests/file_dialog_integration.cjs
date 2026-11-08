// Real renderer and IPC, with deferred native responses to test re-entry and retry.
const {app,BrowserWindow,dialog}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module');
const root=process.env.QA_MODULE_ROOT||path.resolve(__dirname,'..'),out=process.env.MT_GMT_WORKSPACE;
assert(out&&/验证|qa/.test(out));fs.mkdirSync(out,{recursive:true});
const calls=[];let pending;
dialog.showOpenDialog=(...args)=>new Promise((resolve,reject)=>{calls.push({owner:args[0] instanceof BrowserWindow?args[0].id:null,options:args.at(-1)});pending={resolve,reject};});
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
app.setActivationPolicy('prohibited');app.dock.hide();
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));
mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){if(await fn())return;await pause(50);}throw Error('Timed out');}
app.whenReady().then(async()=>{try{
 let win;await until(async()=>{win=BrowserWindow.getAllWindows()[0];return win&&await win.webContents.executeJavaScript('typeof cartUI!=="undefined"&&!!state.gmtInfo').catch(()=>false);});
 const js=s=>win.webContents.executeJavaScript(s);await pause(1000);
 await js('applyConfigToUI({plotType:"baseMap",region:"86/100/20/30",showTerrain:false,cartography:{features:[],localLibrary:{enabled:false}}});clearTimeout(state.preview.autoTimer);openSettingsPanel("cartography");window.qaAlerts=[];window.alert=m=>qaAlerts.push(m);void 0');
 await js('void importCartData();void importCartData()');await until(()=>calls.length>0);await pause(100);
 if(process.env.QA_DIALOG_BASELINE){
  const evidence={requestsForOneRepeatedImport:calls.length,owners:calls.map(c=>c.owner),version:JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version};
  fs.writeFileSync(path.join(out,'baseline.json'),JSON.stringify(evidence,null,2));console.log('DIALOG_BASELINE',JSON.stringify(evidence));app.exit(0);return;
 }
 assert.equal(calls.length,1,'A repeated click must not open two native panels');assert.equal(calls[0].owner,win.id);
 assert(await js('ce("import").disabled&&ce("source-import").disabled'));
 await js('window.qaOtherPicker=window.mtApp.chooseLibraryDirectory()');
 assert.equal(calls.length,1,'File and folder panels must not overlap');
 assert.equal(await js('qaOtherPicker'),null);
 pending.resolve({canceled:true,filePaths:[]});
 await until(()=>js('!cartUI.picking&&!cartUI.busy'));
 assert(await js('!ce("import").disabled&&!ce("source-import").disabled'));
 await js('void importCartData()');await until(()=>calls.length===2);
 pending.reject(new Error('QA native panel failure'));await until(()=>js('!cartUI.picking&&!cartUI.busy'));
 assert(await js('ce("edit-status").textContent.includes("QA native panel failure")'));
 const file=path.join(out,'line.geojson');fs.writeFileSync(file,JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',id:'qa-line',properties:{name:'QA line'},geometry:{type:'LineString',coordinates:[[87,25],[88,26]]}}]}));
 await js('void importCartData()');await until(()=>calls.length===3);pending.resolve({canceled:false,filePaths:[file]});
 await until(()=>js('!cartUI.picking&&!cartUI.busy&&state.cartography.features.length===1'));
 assert(await js('ce("edit-status").textContent.startsWith("已导入 1 项")'));
 const malformed=path.join(out,'malformed.geojson');fs.writeFileSync(malformed,'{invalid');
 await js('void importCartData()');await until(()=>calls.length===4);pending.resolve({canceled:false,filePaths:[malformed]});
 await until(()=>js('!cartUI.picking&&!cartUI.busy'));assert.equal(await js('state.cartography.features.length'),1);
 await js('void importCartData()');await until(()=>calls.length===5);pending.resolve({canceled:false,filePaths:[file]});
 await until(()=>js('!cartUI.picking&&!cartUI.busy'));assert.equal(await js('state.cartography.features.length'),1);
 await js('openSettingsPanel("localLibrary");le("import").click();le("import").click()');await until(()=>calls.length===6);
 assert.equal(calls.at(-1).owner,win.id);assert.deepEqual(calls.at(-1).options.properties,['openDirectory']);
 pending.resolve({canceled:true,filePaths:[]});await until(()=>js('!libraryUI.picking&&!le("import").disabled'));
 await js('le("import").click()');await until(()=>calls.length===7);pending.reject(new Error('QA folder panel failure'));
 await until(()=>js('!libraryUI.picking&&!le("import").disabled'));assert(await js('le("status").textContent.includes("QA folder panel failure")'));
 await js('le("import").click()');await until(()=>calls.length===8);pending.resolve({canceled:true,filePaths:[]});await until(()=>js('!libraryUI.picking'));
 assert.deepEqual(await js('qaAlerts'),[]);assert(!win.isVisible());
 const result={version:JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,owner:win.id,panels:calls.map(c=>({owner:c.owner,title:c.options.title})),checks:['double click','cross-kind overlap','cancel and reopen','native error and retry','actual GeoJSON import','parse error and retry','folder cancel','folder error and retry'],features:await js('state.cartography.features.length')};
 fs.writeFileSync(path.join(out,'file-dialog-results.json'),JSON.stringify(result,null,2));console.log('FILE_DIALOG_FLOW_OK',JSON.stringify(result));app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
