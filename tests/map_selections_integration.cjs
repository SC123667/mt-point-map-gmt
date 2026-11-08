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
 const js=async s=>{try{return await win.webContents.executeJavaScript(s);}catch(e){throw new Error(s.slice(0,200)+'\n'+e.stack);}};await js('window.alert=()=>{};scheduleAutoPreview=()=>{};queueLegendPreview=()=>{};void 0');

 async function until(expr){for(let i=0;i<200;i++){if(await js(expr))return;await pause(50);}throw Error('Timeout '+expr);}
 const records=[{name:'one',lon:1,lat:1},{name:'two',lon:2,lat:2},{name:'three',lon:3,lat:3},{name:'four',lon:3.5,lat:1}];
 await js(`state.allRecords=${JSON.stringify(records)};state.records=state.allRecords;applyConfigToUI({plotType:'stationMap',region:'0/4/0/4',projection:'M12c',frame:'af',showTerrain:false,showTitle:false,showScale:false,pngDpi:120,outputName:'boxes_classes',pointSymbol:'c',pointSize:.18,pointFill:'#2f6f8f',pointPenWidth:.3,pointPenColor:'#000000',legend:{show:true,position:'JBC'},cartography:{language:'en',features:[],localLibrary:{enabled:false}}});clearTimeout(state.preview.autoTimer);`);
 assert(await js(`exportMap(['png'],false)`));assert(await js('!!state.preview.mapContext.frame'));
 await js(`openSettingsPanel('regionBoxes');se('box-name').value='Model area';['west','east','south','north'].forEach((k,i)=>se('box-'+k).value=[.5,3.5,.5,3.5][i]);se('box-opacity').value=20;se('box-strokeOpacity').value=65;se('box-save').scrollIntoView({block:'center'});`);
 assert(await js(`(()=>{const n=se('box-save'),r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n;})()`));await js(`se('box-save').click()`);
 assert.deepEqual(await js('state.cartography.features[0].properties.regionBox'),[.5,3.5,.5,3.5]);assert.equal(await js('state.cartography.features[0].style.opacity'),20);
 await js(`se('box-new').click();se('box-name').value='Detail area';startSelectionMode('box-new');void 0;`);await until('selectionUI.mode&&!selectionUI.busy');
 async function gesture(a,b,target){await js(`(async()=>{const p=await window.mtApp.projectMap({...selectionUI.context,points:${JSON.stringify([a,b])}}),rect=el.previewBox.getBoundingClientRect(),xy=p.map(drawingPixel);const node=${target||'el.previewBox'};function send(type,at,to){to.dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,pointerId:21,clientX:rect.left+at.x,clientY:rect.top+at.y}));}send('pointerdown',xy[0],node);send('pointermove',xy[1],el.previewBox);send('pointerup',xy[1],el.previewBox);})()`);await until('!selectionUI.busy');}
 await gesture([.5,.5],[1.5,1.5]);assert((await js('selectionUI.bounds')).every((v,i)=>Math.abs(v-[.5,1.5,.5,1.5][i])<1e-5));await js(`se('map-done').click()`);assert.equal(await js('state.cartography.features.length'),2);
 await js(`startSelectionMode('box-edit');void 0`);await until('!selectionUI.busy');await gesture([1,1],[1.2,1.3],`se('overlay').querySelector('[data-box-body]')`);assert(Math.abs((await js('selectionUI.bounds'))[0]-.7)<1e-5);
 await gesture([.7,.8],[.4,.4],`se('overlay').querySelector('[data-box-corner="0"]')`);assert(Math.abs((await js('selectionUI.bounds'))[0]-.4)<1e-5);await js(`se('map-done').click()`);
 await js(`openSettingsPanel('stationClasses');startSelectionMode('stations');void 0`);await until('!selectionUI.busy');await gesture([1,1],[1,1]);assert.equal(await js('selectionUI.selected.size'),1);await gesture([.8,.8],[2.2,2.2]);assert.equal(await js('selectionUI.selected.size'),2);await js(`se('map-done').click();se('stations-type').value='LMT';se('stations-assign').click()`);
 assert.equal(await js('Object.values(state.stationClasses.assignments).filter(v=>v==="LMT").length'),2);
 await js(`se('stations-clear').click();se('stations-search').value='three';se('stations-search').dispatchEvent(new Event('input'));se('stations-all').click();se('stations-type').value='BMT';se('stations-assign').click();se('stations-clear').click();se('stations-search').value='four';se('stations-search').dispatchEvent(new Event('input'));se('stations-list').querySelector('input').click();se('stations-type').value='AMT';se('stations-assign').click();`);
 assert.deepEqual((await js('Object.values(state.stationClasses.assignments)')).sort(),['AMT','BMT','LMT','LMT']);
 const snapshot=await js('createProjectSnapshot()');await js(`restoreProjectSnapshot(${JSON.stringify(snapshot)});clearTimeout(state.preview.autoTimer);`);assert.deepEqual(await js('state.stationClasses.assignments'),snapshot.config.stationClasses.assignments);assert.equal(await js('state.cartography.features.length'),2);
 await js(`openSettingsPanel('stationClasses');const row=se('classes-styles').querySelector('[data-class="AMT"]');row.closest('details').open=true;row.querySelector('[data-style="fill"]').value='#448844';row.querySelector('[data-style="size"]').value='0.24';row.querySelector('[data-style="size"]').dispatchEvent(new Event('change',{bubbles:true}));`);assert.equal(await js('state.stationClasses.styles.AMT.size'),.24);
 const config=await js('readConfig()');config.illustratorPackage=true;config.interactiveMap=true;config.pngDpi=150;
 const result=await js(`window.mtApp.exportMap(${JSON.stringify({records,config,formats:['png','pdf','eps']})})`);assert(result.ok,result.message);const script=fs.readFileSync(result.scriptPath,'utf8');assert(script.includes('-Ss0.180c')&&script.includes('-St0.180c')&&script.includes('-Sc0.240c'));
 const labels=fs.readFileSync(path.join(path.dirname(result.illustratorScript),'labels.svg'),'utf8');for(const text of ['Long-period','Broadband','Audio-frequency','Region boxes'])assert(labels.includes(text),text);
 assert(!/<tspan[^>]*>\s*\)<\/tspan>/.test(labels),'Closing parentheses must not become a separate legend row');
 for(const text of ['Long-period MT (LMT)','Broadband MT (BMT)'])assert(labels.includes('>'+text+'</tspan>'),text+' must remain one editable line');
 await js(`renderPreview(${JSON.stringify(result.files.find(p=>p.endsWith('.png')))},state.preview.revision,state.plotType,{frame:${JSON.stringify(result.mapFrame)},config:${JSON.stringify(config)}})`);
 await js(`openSettingsPanel('stationClasses');se('stations-search').value='';renderStationClasses()`);await pause(300);fs.writeFileSync(path.join(out,'测点分类面板.png'),(await win.webContents.capturePage()).toPNG());await js(`openSettingsPanel('regionBoxes')`);await pause(300);fs.writeFileSync(path.join(out,'区域框面板.png'),(await win.webContents.capturePage()).toPNG());
 assert(BrowserWindow.getAllWindows().every(w=>!w.isVisible()));fs.writeFileSync(path.join(out,'验证结果.json'),JSON.stringify({files:result.files,project:snapshot.config,gmt:result.gmtEngine,allWindowsHidden:true},null,2));console.log('MAP_SELECTIONS_UI_OK: coordinate box, drag, move, corner resize, station click/rectangle/list, three classes, project restore, real PNG/PDF and AI editing package');app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
