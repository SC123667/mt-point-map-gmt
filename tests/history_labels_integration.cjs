// Hidden renderer regression. No Illustrator, OS keystrokes or user documents.
const {app,BrowserWindow,Menu}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module');
const root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..'),out=process.env.MT_GMT_WORKSPACE;
assert(out&&/验证|qa/.test(out));fs.mkdirSync(out,{recursive:true});
app.setActivationPolicy('prohibited');app.dock.hide();
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));
mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{try{
 let win;for(let i=0;i<240;i++){win=BrowserWindow.getAllWindows()[0];if(win&&await win.webContents.executeJavaScript('typeof projectHistory!=="undefined"&&!!projectHistory.current').catch(()=>false))break;await pause(250);}assert(win);
 const js=s=>win.webContents.executeJavaScript(s);
 await js('window.alert=()=>{};refreshPreviewAutomatically=async()=>{};clearTimeout(state.preview.autoTimer);el.titleInput.value="";resetProjectHistory();');
 const change=async(id,value)=>{await js(`el.${id}.value=${JSON.stringify(value)};el.${id}.dispatchEvent(new Event('change',{bubbles:true}));`);};
 // Actual button must be visible and hit-testable.
 assert(await js(`(()=>{const b=document.getElementById('headerUndoBtn'),r=b.getBoundingClientRect();return b.checkVisibility()&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;})()`));
 await change('titleInput','First title');await change('titleInput','Second title');
 assert.equal(await js('projectHistory.past.length'),2);
 await js("document.getElementById('headerUndoBtn').click()");assert.equal(await js('el.titleInput.value'),'First title');
 await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}))`);assert.equal(await js('el.titleInput.value'),'');
 await change('titleInput','Mac title');
 await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true,cancelable:true}))`);assert.equal(await js('el.titleInput.value'),'');
 // Native Edit menu routes through the same renderer; focused text retains native undo.
 const undoMenu=Menu.getApplicationMenu().items.find(v=>v.label==='编辑').submenu.items.find(v=>v.label==='撤销');assert.equal(undoMenu.accelerator,'CmdOrCtrl+Z');
 await change('titleInput','Menu edit');await js('document.activeElement.blur()');undoMenu.click();await pause(80);assert.equal(await js('el.titleInput.value'),'');
 await js(`openSettingsPanel('elements');el.titleInput.focus();el.titleInput.value='';document.execCommand('insertText',false,'Typing');`);undoMenu.click();await pause(80);assert.equal(await js('el.titleInput.value'),'');await js('el.titleInput.blur();resetProjectHistory()');
 // Typing coalesces into one step until focus leaves the field.
 await js(`el.titleInput.focus();el.titleInput.value='T';scheduleAutoPreview();`);
 await js(`el.titleInput.value='Typed title';scheduleAutoPreview();`);
 assert.equal(await js('projectHistory.past.length'),1);await js(`el.titleInput.blur();undoProjectEdit()`);assert.equal(await js('el.titleInput.value'),'');
 // 25 separate changes retain exactly the most recent 20 prior states.
 await js('resetProjectHistory()');for(let i=1;i<=25;i++)await change('pointSizeInput',String(i/100));
 assert.equal(await js('projectHistory.past.length'),20);for(let i=0;i<20;i++)await js('undoProjectEdit()');
 assert.equal(await js('Number(el.pointSizeInput.value)'),.05);assert(await js("document.getElementById('headerUndoBtn').disabled"));
 // Actual region box save/delete and station classification controls.
 const records=[{name:'One',lon:88.4,lat:29.3},{name:'Two',lon:88.5,lat:29.5}];
 await js(`loadParsed({records:${JSON.stringify(records)},columns:['name','lon','lat'],mapping:{coordinateType:'geographic',name:'name',lon:'lon',lat:'lat'},region:'88/89/29/30',rows:[]});resetProjectHistory();openSettingsPanel('regionBoxes');`);
 await js(`se('box-west').value='88.2';se('box-east').value='88.8';se('box-south').value='29.2';se('box-north').value='29.8';se('box-save').click();`);
 assert.equal(await js('state.cartography.features.filter(f=>f.properties?.regionBox).length'),1);
 await js('undoProjectEdit()');assert.equal(await js('state.cartography.features.filter(f=>f.properties?.regionBox).length'),0);
 await js(`openSettingsPanel('stationClasses');se('stations-all').click();se('stations-type').value='BMT';se('stations-assign').click();`);
 assert.equal(await js('Object.keys(state.stationClasses.assignments).length'),2);
 await js('undoProjectEdit()');assert.equal(await js('Object.keys(state.stationClasses.assignments).length'),0);
 assert.equal(await js('state.allRecords.length'),2);
 // Undo keeps older import snapshots and their mapping intact.
 await js(`resetProjectHistory();window.qaOldRecords=state.allRecords;loadParsed({records:[{name:'Other',lon:90,lat:30}],columns:['name','lon','lat'],mapping:{coordinateType:'geographic',name:'name',lon:'lon',lat:'lat'},region:'89/91/29/31',rows:[]});`);
 await js('undoProjectEdit()');assert(await js('state.allRecords===window.qaOldRecords'));assert.equal(await js('state.allRecords[0].name'),'One');
 // Preview cache completion and unrelated panel clicks must not consume history.
 await js(`resetProjectHistory();state.terrain.gridPath='/generated/cache.nc';queueProjectHistory();`);assert.equal(await js('projectHistory.past.length'),0);
 await js(`closeSettingsDialog();document.getElementById('headerExportBtn').click()`);assert.equal(await js('projectHistory.past.length'),0);
 fs.writeFileSync(path.join(out,'撤销入口.png'),(await win.webContents.capturePage()).toPNG());
 // Real Chromium line layout: both parentheses stay together; genuine wrapping
 // and Chinese fallback text must agree with DOM lines at several render scales.
 let collector=require(path.join(root,'electron/illustrator-export')).collectEditableSVG;
 if(process.env.QA_OLD_COLLECTOR){const old=new Module(path.join(root,'electron/illustrator-export.js'),module);old.filename=path.join(root,'electron/illustrator-export.js');old.paths=Module._nodeModulePaths(path.dirname(old.filename));old._compile(fs.readFileSync(process.env.QA_OLD_COLLECTOR,'utf8'),old.filename);collector=old.exports.collectEditableSVG;}
 const labelWin=new BrowserWindow({show:false,focusable:false,width:1500,height:500,webPreferences:{offscreen:true}});
 const html=path.join(out,'legend-layout.html');
 fs.writeFileSync(html,`<style>body{margin:0;width:1400px;font-family:Arial} .native-legend-entry{display:flex;align-items:center;line-height:1.25;margin:10px}.native-legend-entry>span{overflow-wrap:anywhere;min-width:0}.native-legend-entry>svg{width:40px;flex-shrink:0;margin-right:6px}</style><div id="legend"></div>`);await labelWin.loadFile(html);
 for(const font of [8.5,16.99998995,28.499983,39.999]){
  await labelWin.webContents.executeJavaScript(`document.body.style.fontSize='${font}px';document.getElementById('legend').innerHTML=['Broadband MT (BMT)','Long-period MT (LMT)','音频大地电磁 (AMT)','Long geological description that must wrap onto several lines'].map((t,i)=>'<div class="native-legend-entry" style="'+(i===3?'width:200px':'')+'"><svg></svg><span>'+t+'</span></div>').join('');document.fonts.ready`);
  const r=await labelWin.webContents.executeJavaScript(`(${collector.toString()})(500)`);
  const result=await labelWin.webContents.executeJavaScript(`(()=>{const doc=new DOMParser().parseFromString(${JSON.stringify(r.svg)},'image/svg+xml');return [...doc.querySelectorAll('text')].map(t=>[...t.children].map(s=>s.textContent));})()`);
  assert.deepEqual(result.slice(0,3),[['Broadband MT (BMT)'],['Long-period MT (LMT)'],['音频大地电磁 (AMT)']]);assert(result[3].length>1,'Real wrapped lines must be preserved');
  fs.writeFileSync(path.join(out,`labels-${font}.svg`),r.svg);
 }
 assert(BrowserWindow.getAllWindows().every(w=>!w.isVisible()));console.log('HISTORY_LABELS_OK: 20 steps, UI/menu/Ctrl/Command undo, native text undo, boxes/classes, cache exclusion and real DOM text lines');app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
