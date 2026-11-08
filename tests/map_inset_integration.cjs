// Isolated offscreen app and real GMT. Never opens Illustrator or user projects.
const {app,BrowserWindow}=require('electron');const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module');
const root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..'),out=process.env.MT_GMT_WORKSPACE;assert(out&&/验证|qa/.test(out));fs.mkdirSync(out,{recursive:true});app.setActivationPolicy('prohibited');app.dock.hide();
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms));app.whenReady().then(async()=>{try{
 let win;for(let i=0;i<200;i++){win=BrowserWindow.getAllWindows()[0];if(win&&await win.webContents.executeJavaScript('typeof projectHistory!=="undefined"&&!!projectHistory.current').catch(()=>false))break;await pause(200);}assert(win);
 const js=s=>win.webContents.executeJavaScript(s);
 await js('window.alert=()=>{};refreshPreviewAutomatically=async()=>{};clearTimeout(state.preview.autoTimer);');
 const records=[{name:'A',lon:1.95,lat:2},{name:'B',lon:2.15,lat:2.1},{name:'Outside',lon:3,lat:3}];
 const grid=path.join(out,'synthetic.nc');require('child_process').execFileSync('/opt/homebrew/bin/gmt',['grdmath','-R0/4/0/4','-I.02','X','SIN','Y','COS','MUL','1200','MUL','3000','ADD','=',grid],{cwd:out});
 await js(`loadParsed({records:${JSON.stringify(records)},rows:[],columns:['name','lon','lat'],mapping:{coordinateType:'geographic',name:'name',lon:'lon',lat:'lat'},region:'0/4/0/4'});applyConfigToUI({plotType:'stationMap',region:'0/4/0/4',projection:'M12c',frame:'af',showTitle:true,title:'Inset test',showScale:true,pngDpi:150,outputName:'inset_test',showTerrain:true,terrainCpt:'paper',terrainIntensity:.25,terrainAllowDownload:false,localTerrainGridPath:${JSON.stringify(grid)},legend:{show:true,position:'JBC'},cartography:{language:'en',paperStyle:true,localLibrary:{enabled:false},features:[]}});state.terrain.localGridPath=${JSON.stringify(grid)};resetProjectHistory();openSettingsPanel('regionBoxes');`);
 await js(`se('box-name').value='Detail';['west','east','south','north'].forEach((k,i)=>se('box-'+k).value=[1.7,2.3,1.7,2.3][i]);se('box-inset').checked=true;se('box-inset-width').value=38;se('box-inset-color').value='#ff0000';se('box-save').scrollIntoView({block:'center'});se('box-save').click();`);
 assert(await js(`state.cartography.features[0].properties.inset.enabled`));const saved=await js('createProjectSnapshot()');
 await js('undoProjectEdit()');assert.equal(await js('state.cartography.features.length'),0);
 await js(`restoreProjectSnapshot(${JSON.stringify(saved)});openSettingsPanel('regionBoxes');selectionUI.boxId=state.cartography.features[0].id;renderRegionBoxes();`);assert(await js(`se('box-inset').checked`));
 await js(`se('box-inset').scrollIntoView({block:'center'})`);await pause(60);
 assert(await js(`(()=>{const b=se('box-inset'),r=b.getBoundingClientRect();return b.checkVisibility()&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;})()`),'Inset checkbox must be visible and clickable in the real panel');
 if(process.env.QA_UI_ONLY){fs.writeFileSync(path.join(out,'区域框放大设置.png'),(await win.webContents.capturePage()).toPNG());console.log('INSET_CONTROL_VISIBLE_OK');app.exit(0);return;}

 const cfg=await js('readConfig()');cfg.illustratorPackage=true;cfg.interactiveMap=true;cfg.terrainGridPath=grid;cfg.localTerrainGridPath=grid;
 const cart=require(path.join(root,'electron/cartography'));
 cfg.cartography.features.push(cart.feature({name:'Site',category:'Mine',geometry:{type:'Point',coordinates:[2,2]},style:{fill:'#0044ff',symbol:'a',fontSize:8}}));
 const assignments=Object.fromEntries(records.map((r,i)=>[require(path.join(root,'electron/map-selections')).stationKey(r),i?'BMT':'LMT']));cfg.stationClasses={enabled:true,assignments};
 const result=await js(`window.mtApp.exportMap(${JSON.stringify({records,config:cfg,formats:['png','pdf','eps']})})`);assert(result.ok,result.message);assert(result.inset?.scale>1);assert(result.inset.target.y>result.inset.source.y,'Inset must be near bottom');
 const pkg=path.dirname(result.illustratorScript),svg=fs.readFileSync(path.join(pkg,'labels.svg'),'utf8');assert(svg.includes('GMT_inset')&&svg.includes('inset-main-clip')&&svg.includes('inset-source-clip'));assert(svg.split('Site').length>=3,'Both main and inset retain editable label');
 const text=require('child_process').execFileSync('/opt/homebrew/bin/pdftotext',[result.files.find(f=>f.endsWith('.pdf')),'-'],{encoding:'utf8'});assert(text.split('Site').length>=3,'PDF must retain selectable text in inset');
 await js(`renderPreview(${JSON.stringify(result.files.find(f=>f.endsWith('.png')))},state.preview.revision,state.plotType,{frame:${JSON.stringify(result.mapFrame)},inset:${JSON.stringify(result.inset)},config:${JSON.stringify(cfg)}})`);await pause(100);fs.writeFileSync(path.join(out,'放大图界面.png'),(await win.webContents.capturePage()).toPNG());
 assert(await js('insidePreviewInset([(state.preview.mapContext.inset.target.x+1)/state.preview.mapContext.frame.width,(state.preview.mapContext.inset.target.y+1)/state.preview.mapContext.frame.height])'));
 fs.writeFileSync(path.join(out,'验证结果.json'),JSON.stringify(result,null,2));
 if(process.env.QA_DRAG){
  await js('resetProjectHistory();renderInsetHandle()');await pause(70);
  assert(await js(`(()=>{const h=insetDrag.handle,r=h.getBoundingClientRect();return !h.hidden&&h.checkVisibility()&&h.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`),'Inset drag surface must receive actual pointer hits');
  const beforeBounds=await js('JSON.stringify(state.cartography.features[0].properties.regionBox)');
  async function drag(x,y,ending='pointerup'){
   await js(`(()=>{const h=insetDrag.handle,c=state.preview.mapContext,b=c.inset.placement,t=c.inset.target,r=el.previewBox.getBoundingClientRect(),a=drawingPixel([(t.x+t.width/2)/c.frame.width,(t.y+t.height/2)/c.frame.height]),z=drawingPixel([(b.x+b.width*${x}+t.width/2)/c.frame.width,(b.y+b.height*${y}+t.height/2)/c.frame.height]);function send(type,p){h.dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,pointerId:123,clientX:r.left+p.x,clientY:r.top+p.y}));}send('pointerdown',a);send('pointermove',z);${ending==='escape'?"document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));": "send('"+ending+"',z);"}})()`);
  }
  await drag(.8,.2);assert(Math.abs(await js('state.cartography.features[0].properties.inset.x')-.8)<.0001);assert(Math.abs(await js('state.cartography.features[0].properties.inset.y')-.2)<.0001);assert.equal(await js('JSON.stringify(state.cartography.features[0].properties.regionBox)'),beforeBounds);assert.equal(await js('projectHistory.past.length'),1);
  const movedSnapshot=await js('createProjectSnapshot()');await js('undoProjectEdit()');assert.equal(await js('state.cartography.features[0].properties.inset.x'),0);assert.equal(await js('state.cartography.features[0].properties.inset.y'),1);
  await js(`renderPreview(${JSON.stringify(result.files.find(f=>f.endsWith('.png')))},state.preview.revision,state.plotType,{frame:${JSON.stringify(result.mapFrame)},inset:${JSON.stringify(result.inset)},config:${JSON.stringify(cfg)}})`);
  await js('state.preview.zoom=1.3;state.preview.panX=-40;state.preview.panY=-90;updatePreviewTransform();resetProjectHistory()');await pause(60);
  await drag(.7,.3,'escape');assert.equal(await js('state.cartography.features[0].properties.inset.x'),0);assert.equal(await js('projectHistory.past.length'),0);
  await drag(.7,.3,'pointercancel');assert.equal(await js('state.cartography.features[0].properties.inset.x'),0);
  await drag(.7,.3);assert(Math.abs(await js('state.cartography.features[0].properties.inset.x')-.7)<.0001);assert(Math.abs(await js('state.cartography.features[0].properties.inset.y')-.3)<.0001);
  await js(`restoreProjectSnapshot(${JSON.stringify(movedSnapshot)});openSettingsPanel('regionBoxes');selectionUI.boxId=state.cartography.features[0].id;renderRegionBoxes();`);assert.equal(await js("Number(se('box-inset-x').value)"),80);
  await js(`se('box-inset-position').value='1,0';se('box-inset-position').dispatchEvent(new Event('change',{bubbles:true}));se('box-save').click();`);
  const movedCfg={...cfg,outputName:'inset_moved',cartography:{...cfg.cartography,features:[...(await js('state.cartography.features')), ...cfg.cartography.features.slice(1)]}};
  const moved=await js(`window.mtApp.exportMap(${JSON.stringify({records,config:movedCfg,formats:['png','pdf','eps']})})`);assert(moved.ok);assert(moved.inset.target.x>result.inset.target.x&&moved.inset.target.y<result.inset.target.y);assert.deepEqual(moved.inset.source,result.inset.source);assert.equal(moved.inset.scale,result.inset.scale);
  fs.writeFileSync(path.join(out,'移动后验证.json'),JSON.stringify(moved,null,2));
  console.log('INSET_DRAG_OK: hit testing, gesture undo, Escape/pointercancel, zoom/pan, persistence, presets, PNG/PDF/EPS/AI package position');
 }

 for(const ext of ['png','pdf','eps'])fs.copyFileSync(result.files.find(f=>f.endsWith('.'+ext)),path.join(out,'开启放大图.'+ext));
 // Turning off is persistent, and a re-export contains no stale inset.
 const off=JSON.parse(JSON.stringify(cfg));off.outputName=cfg.outputName;off.cartography.features[0].properties.inset.enabled=false;
 const disabled=await js(`window.mtApp.exportMap(${JSON.stringify({records,config:off,formats:['png','pdf']})})`);assert(disabled.ok);assert(!disabled.inset);assert(!fs.existsSync(path.join(disabled.outputDirectory,cfg.outputName+'_局部放大参数.json')));assert(!fs.readFileSync(path.join(path.dirname(disabled.illustratorScript),'labels.svg'),'utf8').includes('GMT_inset'));
 // No native labels/title/legend: the editable package must not demand an empty SVG group.
 const empty=JSON.parse(JSON.stringify(cfg));empty.outputName='inset_no_labels';empty.legend.show=false;empty.showTitle=false;empty.showScale=false;empty.cartography.features=empty.cartography.features.slice(0,1);
 const bare=await js(`window.mtApp.exportMap(${JSON.stringify({records,config:empty,formats:['pdf']})})`);assert(bare.ok);const bareSVG=fs.readFileSync(path.join(path.dirname(bare.illustratorScript),'labels.svg'),'utf8');assert(!bareSVG.includes('id="GMT_inset"'));
 assert(BrowserWindow.getAllWindows().every(w=>!w.isVisible()));console.log('INSET_OK: UI, undo, project restore, identical terrain/data, vector PDF/EPS, editable SVG, off/re-export, hidden windows');app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
