// Hidden UI and real GMT/export validation; no Illustrator or OS input automation.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module');
const root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..'),out=process.env.MT_GMT_WORKSPACE;
assert(out&&/验证|qa/.test(out));app.setActivationPolicy('prohibited');app.dock.hide();
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));
mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,')+'\nmodule.exports={nativeLegendMarkup};',entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{try{
 let win;for(let i=0;i<200;i++){win=BrowserWindow.getAllWindows()[0];if(win&&await win.webContents.executeJavaScript('typeof wb!=="undefined"&&wb.ready&&!!state.gmtInfo').catch(()=>false))break;await pause(200);}assert(win);
 const js=async s=>{try{return await win.webContents.executeJavaScript(s);}catch(e){throw new Error(s.slice(0,500)+'\n'+e.stack);}};await js('window.alert=()=>{};scheduleAutoPreview=()=>{};queueLegendPreview=()=>{};void 0');

 await js(`window.qaAlerts=[];window.alert=m=>qaAlerts.push(m);applyConfigToUI({plotType:'baseMap',region:'0/4/0/4',projection:'M12c',showTerrain:false,showTitle:false,showScale:false,showLegend:false,pngDpi:100,outputName:'repeat_export',cartography:{language:'en',features:[],localLibrary:{enabled:false}}});state.plotType='baseMap';clearTimeout(state.preview.autoTimer);`);
 const config=await js('readConfig()');config.showTitle=true;config.title='First export';config.interactiveMap=true;
 const first=await js(`window.mtApp.exportMap(${JSON.stringify({records:[],config,formats:['png','pdf','eps']})})`);assert(first.ok,first.message);
 const hash=p=>require('crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex');const hashes=first.files.map(p=>[p,hash(p)]);
 config.title='Second export - updated';
 const second=await js(`window.mtApp.exportMap(${JSON.stringify({records:[],config,formats:['png','pdf','eps']})})`);assert(second.ok,second.message);
 for(const [p,h]of hashes){assert(second.files.includes(p));assert.notEqual(hash(p),h,'Stale file: '+p);}
 // Delay the real first render, then click the actual PDF button during it.
 await js(`window.qaCalls=[];window.qaOriginalExport=window.mtApp.exportMap;window.qaGate=new Promise(r=>window.qaRelease=r);window.mtApp.exportMap=async payload=>{qaCalls.push(payload.formats);if(qaCalls.length===1)await qaGate;return qaOriginalExport(payload);};window.qaPreview=exportMap(['png'],false);void 0;`);
 for(let i=0;i<100&&!(await js('qaCalls.length'));i++)await pause(20);
 assert(await js('state.preview.rendering&&!state.preview.exporting'));
 await js(`openSettingsPanel('export');el.exportPdfBtn.scrollIntoView({block:'center'});`);
 assert(await js(`(()=>{const n=el.exportPdfBtn,r=n.getBoundingClientRect();return r.width>0&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n;})()`));
 await js(`el.exportPdfBtn.click()`);assert.deepEqual(await js('state.preview.queuedExport.formats'),['pdf']);
 await js('qaRelease();void 0');await js('qaPreview');
 assert.deepEqual(await js('qaCalls'),[['png'],['pdf']]);assert.equal(await js('state.preview.queuedExport'),null);assert.equal(await js('state.preview.rendering'),false);
 assert(await js('qaAlerts.some(m=>m.includes("导出完成"))'));
 // Cancelling a render also clears its pending export, without triggering it.
 await js(`(async()=>{state.preview.rendering=true;state.preview.exporting=false;await exportMap(['pdf'],true);await cancelCurrentRender();state.preview.rendering=false;})()`);assert.equal(await js('state.preview.queuedExport'),null);
 assert(BrowserWindow.getAllWindows().every(w=>!w.isVisible()));
 fs.writeFileSync(path.join(out,'验证结果.json'),JSON.stringify({files:second.files,repeatedFormats:['png','pdf','eps'],queuedExportCalls:await js('qaCalls'),allWindowsHidden:true},null,2));
 console.log('REPEATED_EXPORT_OK: changed PNG/PDF/EPS, visible PDF button queues during preview, cancellation clears queue');app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
