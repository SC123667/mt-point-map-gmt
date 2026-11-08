// Run with Electron and a fresh, isolated MT_GMT_WORKSPACE under the QA directory.
// Only hidden-window DOM events are dispatched; no OS input or window activation.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module');
const out=process.env.MT_GMT_WORKSPACE,root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..');
assert(out&&path.isAbsolute(out)&&/验证|qa|test/i.test(out),'Set an isolated QA workspace');
fs.mkdirSync(out,{recursive:true});
if(root.endsWith('.asar')){
 app.setAppPath(root);
 // The development Electron host must resolve extraResources from the candidate.
 Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});
}
if(process.platform==='darwin'){app.setActivationPolicy('prohibited');app.dock.hide();}
const entry=path.join(root,'electron/main.js'),source=fs.readFileSync(entry,'utf8');
assert(source.includes('width: 1280,'));
const mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));
mod._compile(source.replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,message){for(let i=0;i<240;i++){if(await fn())return;await pause(250);}throw Error(message||'Timeout');}
app.whenReady().then(async()=>{try{
 let win;await until(()=>win=BrowserWindow.getAllWindows()[0]);
 const js=async s=>{try{return await win.webContents.executeJavaScript(s);}catch(error){throw new Error(s.slice(0,200)+'\n'+error.stack);}};
 await until(()=>js('typeof wb!=="undefined"&&wb.ready&&!!state.gmtInfo').catch(()=>false),'Workbench initialization');
 // Suppress native alert windows in this QA process and keep their messages as evidence.
 await js('window.qaAlerts=[];window.alert=message=>qaAlerts.push(message);void 0');
 const results=[],panels=await js('WORKBENCH_PANELS.map(p=>p[1])');assert.equal(panels.length,25);
 for(const [width,height] of [[1100,720],[1280,820],[1600,940]]){
  win.setSize(width,height);await pause(150);
  for(const key of panels){
   await js(`openSettingsPanel(${JSON.stringify(key)})`);await pause(40);
   const r=await js(`({key:${JSON.stringify(key)},width:innerWidth,open:el.settingsDialog.open,modal:el.settingsDialog.matches(':modal'),items:el.settingsDialogBody.children.length,bodyOverflow:document.body.scrollWidth>innerWidth,panelOverflow:el.settingsDialogBody.scrollWidth>el.settingsDialogBody.clientWidth+2,canvasWidth:el.previewBox.clientWidth,canvasHeight:el.previewBox.clientHeight,panelHeight:el.settingsDialog.clientHeight,layoutHeight:document.querySelector('.layout').clientHeight,missingLabels:[...el.settingsDialogBody.querySelectorAll('input,select,textarea')].filter(n=>!n.closest('label')&&!n.getAttribute('aria-label')&&!n.id.includes('Picker')).map(n=>n.id)})`);
   assert(r.open&&!r.modal&&r.items,key);assert(!r.bodyOverflow&&!r.panelOverflow,JSON.stringify(r));
   assert(r.canvasWidth>=550&&r.canvasHeight>=450&&r.panelHeight>=r.layoutHeight-2,JSON.stringify(r));
   assert.deepEqual(r.missingLabels,[],key);results.push(r);
  }
 }
 // Check Windows-specific CSS without claiming this is a Windows runtime test.
 win.setSize(1100,720);await js('document.body.dataset.platform="win32"');await pause(100);
 for(const key of panels){await js(`openSettingsPanel(${JSON.stringify(key)})`);assert(await js('document.body.scrollWidth<=innerWidth&&el.settingsDialogBody.scrollWidth<=el.settingsDialogBody.clientWidth+2'),key+' Windows CSS');}
 await js('openSettingsPanel("cartography");we("workbenchExpand").click()');
 assert(await js('el.previewBox.clientWidth>=480&&el.settingsDialogBody.scrollWidth<=el.settingsDialogBody.clientWidth+2'));
 await js('we("workbenchExpand").click();el.quickInspectorToggle.click()');
 assert(await js('!el.settingsDialog.open&&el.quickInspector.getAttribute("aria-hidden")==="false"'));
 await js('openSettingsPanel("names")');
 assert(await js('el.settingsDialog.open&&el.quickInspector.getAttribute("aria-hidden")==="true"'));
 await js('document.body.dataset.platform=state.window.platform');
 win.setSize(1280,820);await js('closeSettingsDialog()');await pause(100);
 fs.writeFileSync(path.join(out,'home.png'),(await win.webContents.capturePage()).toPNG());
 // Search results, keyboard navigation and panel focus are part of the real DOM flow.
 await js('openWorkbenchSearch();we("workbenchCommandInput").value="中文";renderWorkbenchSearch()');
 assert(await js('we("workbenchCommandResults").firstElementChild.textContent.includes("名称与语言")'));
 await js('we("workbenchCommandInput").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))');await pause(50);
 assert(await js('!we("workbenchCommandDialog").open&&state.settingsDialog.panel==="names"&&document.activeElement===el.settingsCloseBtn'));
 await js('openWorkbenchSearch();we("workbenchCommandInput").value="unfindable_qa_keyword";renderWorkbenchSearch()');
 assert.equal(await js('we("workbenchCommandResults").querySelectorAll("button").length'),0);
 await js('we("workbenchCommandInput").value="PDF";renderWorkbenchSearch();we("workbenchCommandInput").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}))');
 assert(await js('document.activeElement.closest("#workbenchCommandResults")!==null'));
 fs.writeFileSync(path.join(out,'search.png'),(await win.webContents.capturePage()).toPNG());
 await js('we("workbenchCommandDialog").close();openSettingsPanel("frame");applyConfigToUI({plotType:"baseMap",region:"9/11/44/46",projection:"M16c",showTerrain:false,showTitle:false,showScale:false,terrainAllowDownload:false,pngDpi:120,outputName:"workbench_qa",cartography:{language:"zh",features:[],localLibrary:{enabled:false}}});clearTimeout(state.preview.autoTimer)');
 await js('el.regionWestInput.value="200";el.regionWestInput.dispatchEvent(new Event("input",{bubbles:true}));confirmSettingsDialog()');
 assert(await js('!!regionIssue()&&el.settingsDialog.open&&!state.preview.rendering'));
 await js('el.regionWestInput.value="9";el.regionWestInput.dispatchEvent(new Event("input",{bubbles:true}));openSettingsPanel("cartography")');
 for(const [name,type,coordinates] of [['City','Point','10 45'],['Fault','LineString','9.3 44.4\n10.7 45.6']]){
  const okay=await js(`(async()=>{ce('new').click();ce('name').value=${JSON.stringify(name)};ce('name-en').value=${JSON.stringify(name)};ce('type').value=${JSON.stringify(type)};ce('coordinates').value=${JSON.stringify(coordinates)};ce('remember-names').checked=false;return saveCartFeature(false);})()`);
  assert(okay,await js('ce("edit-status").textContent'));
 }
 assert.equal(await js('state.cartography.features.length'),2);
 await js('we("workbenchEditorTab1").click()');assert(await js('!we("workbenchEditorPage1").hidden&&we("workbenchEditorPage0").hidden'));
 // Use an unknown name so translation is intentionally unavailable, rather than trusting a dictionary match.
 await js('state.cartography.features[0].name="QAUntranslated";state.cartography.features[0].nameZh="";state.cartography.features[0].originalName="QAUntranslated";renderCartography();openSettingsPanel("names");ce("language").value="zh";ce("language").dispatchEvent(new Event("change",{bubbles:true}))');
 assert(await js('!!ce("pending").querySelector("button")'));
 await js('ce("pending").querySelector("button").click()');
 assert(await js('state.settingsDialog.panel==="cartography"&&!we("workbenchEditorPage0").hidden&&ce("name-zh").closest("details").open&&document.activeElement===ce("name-zh")'));
 await js('ce("name-zh").value="测试地点"');assert(await js('saveCartFeature(false)'));
 await js('openSettingsPanel("names");ce("language").value="en";ce("language").dispatchEvent(new Event("change",{bubbles:true}));openSettingsPanel("export");el.outputNameInput.value="workbench_roundtrip";el.pngDpiInput.value="120";openSettingsPanel("elements");el.titleInput.value="QA map";el.showTitleInput.checked=true;window.qaSnapshot=createProjectSnapshot()');
 const snapshot=await js('qaSnapshot');assert.equal(snapshot.config.cartography.language,'en');assert.equal(snapshot.config.cartography.features.length,2);assert.equal(snapshot.config.title,'QA map');assert.equal(snapshot.config.outputName,'workbench_roundtrip');
 fs.writeFileSync(path.join(out,'workbench_roundtrip.mtgmt'),JSON.stringify(snapshot,null,2));
 await js('el.titleInput.value="changed";restoreProjectSnapshot(JSON.parse(JSON.stringify(qaSnapshot)));clearTimeout(state.preview.autoTimer)');
 assert.equal(await js('readConfig().title'),'QA map');assert.equal(await js('readConfig().cartography.features.length'),2);
 // Real renderer -> worker -> GMT -> preview. Applying a docked panel keeps the panel open.
 await js('openSettingsPanel("names");confirmSettingsDialog()');
 await until(()=>js('state.preview.hasImage&&!state.preview.rendering&&!state.preview.autoTimer'),'Actual preview after Apply');
 assert(await js('el.settingsDialog.open&&we("workbenchWelcome").hidden'));
 fs.writeFileSync(path.join(out,'preview.png'),(await win.webContents.capturePage()).toPNG());
 // Export through the existing button handler. Only the final informational alert is intercepted.
 await js('openSettingsPanel("export");el.exportPdfBtn.click()');
 await until(()=>js('!state.preview.rendering&&qaAlerts.some(s=>s.startsWith("导出完成"))'),'PDF export button');
 assert(fs.existsSync(path.join(await js('state.outputDirectory'),'workbench_roundtrip.pdf')));
 await js('el.exportPngBtn.click()');await until(()=>js('el.pngDpiDialog.open'),'PNG DPI dialog');
 await js('el.pngDpiDialogCancelBtn.click()');await until(()=>js('!state.preview.rendering'),'PNG cancellation');
 assert(await js('el.settingsDialog.open&&!el.pngDpiDialog.open'));
 // Parse/import worker and moved field/table controls.
 await js('(async()=>{loadParsed(await window.mtApp.loadSample(),{autoPreview:false});clearTimeout(state.preview.autoTimer);openSettingsPanel("data");})()');
 assert(await js('state.records.length>0&&el.settingsDialogBody.querySelectorAll("tbody tr").length>0'));
 await js('openSettingsPanel("fields")');assert(await js('el.nameColumn.options.length>1'));
 // Controls stay unique after repeated reparenting.
 const duplicates=await js('[...document.querySelectorAll("[id]")].map(n=>n.id).filter((id,i,a)=>a.indexOf(id)!==i)');assert.deepEqual(duplicates,[]);
 for(const key of ['frame','terrain','cartography','localLibrary','names','export']){await js(`openSettingsPanel(${JSON.stringify(key)})`);await pause(100);fs.writeFileSync(path.join(out,key+'.png'),(await win.webContents.capturePage()).toPNG());}
 assert(!win.isVisible());
 const alerts=await js('qaAlerts');assert(alerts.every(s=>s.startsWith('导出完成')),JSON.stringify(alerts));
 fs.writeFileSync(path.join(out,'ui-results.json'),JSON.stringify({hiddenWindow:true,osInputAutomation:false,results,windowsCssPanels:panels.length,windowsRuntimeTested:false,checks:['search','wide panel','quick panel exclusion','geometry editor','translation link','project roundtrip','real preview','PDF button','PNG cancellation','import worker','unique controls'],alerts},null,2));
 console.log('WORKBENCH_UI_OK',results.length,'panel/size cases; actual preview, PDF export, project and editing');app.exit(0);
}catch(error){console.error(error);app.exit(1);}});
