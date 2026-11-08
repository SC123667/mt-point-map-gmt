// Real renderer event regression; backend is controlled to count submitted jobs.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module');
const root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..'),out=process.env.MT_GMT_WORKSPACE;
assert(out&&/验证|qa/.test(out));fs.mkdirSync(out,{recursive:true});
app.setActivationPolicy('prohibited');app.dock.hide();
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);
mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));
mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
let calls=[],release;
ipcMain.removeHandler('gmt:export');
ipcMain.handle('gmt:export',async(_event,payload)=>{
 calls.push(payload);
 await new Promise(resolve=>{release=resolve;});
 return {ok:true,files:[],outputDirectory:out};
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await pause(50);}throw Error('Timed out');}
app.whenReady().then(async()=>{try{
 let win;await until(async()=>{win=BrowserWindow.getAllWindows()[0];return win&&await win.webContents.executeJavaScript('typeof projectHistory!=="undefined"&&!!projectHistory.current').catch(()=>false);});
 const js=s=>win.webContents.executeJavaScript(s);
 await js(`window.qaAlerts=[];window.alert=m=>qaAlerts.push(m);state.records=[{name:'QA',sourcePath:'/qa/site.edi',lon:88,lat:29,mtResponses:[]}];state.allRecords=state.records;applyConfigToUI({plotType:'phaseTensorMap',showTerrain:false,showTitle:false,mtpy:{periods:'1,10',ellipseScale:'0.7',arrowScale:'0.85'}});openSettingsPanel('mtParams');`);
 const edit=async(id,value,type='change')=>js(`(()=>{const n=document.getElementById(${JSON.stringify(id)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event(${JSON.stringify(type)},{bubbles:true}));})()`);
 await edit('mtpyEllipseScale','0.55');await edit('mtpyArrowScale','0.65');await edit('mtpyColorbarGap','8');
 assert(await js('el.previewBtn.getBoundingClientRect().width>0'),'Canvas preview must be visible');
 await edit('mtpyPeriods','1,10,100');await edit('titleInput','Draft title','input');
 await pause(1700);
 assert.equal(calls.length,0,'Editing must not submit a job');
 assert.equal(await js('state.preview.autoTimer'),null);
 assert.match(await js('el.previewStatus.textContent'),/尚未绘制/);
 await js('closeSettingsDialog()');await pause(800);assert.equal(calls.length,0,'Closing must not render');
 await js('openSettingsPanel("mtParams");el.settingsConfirmBtn.click();el.settingsConfirmBtn.click()');
 await until(()=>calls.length===1);
 assert.equal(calls[0].config.mtpy.periods,'1,10,100');assert.equal(calls[0].config.mtpy.ellipseScale,'0.55');
 assert.equal(calls[0].config.mtpy.arrowScale,'0.65');assert.equal(calls[0].config.mtpy.colorbarGap,'8');
 await edit('mtpyEllipseScale','0.6');await edit('titleInput','Later draft','input');
 assert.equal(await js('state.preview.queuedAuto'),false);
 release();await until(()=>js('!state.preview.rendering'));await pause(1700);
 assert.equal(calls.length,1,'Edits during rendering must not queue another job');
 assert.match(await js('el.previewStatus.textContent'),/尚未绘制/);
 await js('el.previewBtn.click()');await until(()=>calls.length===2);
 assert.equal(calls[1].config.mtpy.ellipseScale,'0.6');release();await until(()=>js('!state.preview.rendering'));
 await edit('mtpyMode','tipper');await pause(800);assert.equal(calls.length,2,'Mode changes are drafts too');
 await js('refreshPreviewAutomatically()');assert.equal(calls.length,2,'A stale timer must not render MTpy');
 await js('setPlotType("stationMap");setPlotType("phaseTensorMap")');await pause(800);assert.equal(calls.length,2,'Switching to MTpy cancels older auto preview');
 await js('setPlotType("stationMap")');await until(()=>calls.length===3);release();await until(()=>js('!state.preview.rendering'));
 assert.equal(calls[2].config.plotType,'stationMap','Other plots keep existing auto preview');
 await js('setPlotType("phaseTensorMap");openSettingsPanel("mtParams")');
 fs.writeFileSync(path.join(out,'manual-preview.png'),(await win.webContents.capturePage()).toPNG());
 assert.deepEqual(await js('qaAlerts'),[]);
 console.log('MTPY_MANUAL_PREVIEW_OK: batched changes, explicit confirmation, canvas preview, no queued redraw, stale timer guard, other plots unchanged');app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
