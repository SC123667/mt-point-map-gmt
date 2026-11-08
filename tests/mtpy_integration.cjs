// Main workbench integration, real EDI + GMT cache + optional native Illustrator.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module');
const root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..'),out=process.env.MT_GMT_WORKSPACE;
assert(out&&/验证|qa/.test(out));fs.mkdirSync(out,{recursive:true});
app.setActivationPolicy('prohibited');app.dock.hide();
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));
mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,limit=240000){const end=Date.now()+limit;while(Date.now()<end){if(await fn())return;await pause(250);}throw Error('Workbench timeout');}
app.whenReady().then(async()=>{try{
 let win;await until(async()=>{win=BrowserWindow.getAllWindows()[0];return win&&await win.webContents.executeJavaScript('typeof projectHistory!=="undefined"&&!!projectHistory.current').catch(()=>false);});
 win.webContents.on('console-message',(_e,level,message)=>{if(level>=2)console.error('RENDERER',message)});
 const js=async s=>{try{return await win.webContents.executeJavaScript(s)}catch(e){console.error('FAILED_JS',s.slice(0,180));throw e}};
 const sources=JSON.parse(fs.readFileSync(process.env.MTPY_TEST_SOURCES||'/tmp/mtpy-tibet-sources.json'));
 const userCase=process.env.MTPY_TEST_USER_CASE==='1',finalGap=userCase?'3':'9';
 const config=process.env.MTPY_TEST_CONFIG?JSON.parse(fs.readFileSync(process.env.MTPY_TEST_CONFIG)):{};
 const periods=userCase?config.mtpy.periods:'1,10,100,1000';
 const expectedPanels=String(periods).split(/[,，\s]+/).filter(Boolean).length;
 const ellipseScale=userCase?String(config.mtpy.ellipseScale||.7):'0.7',arrowScale=userCase?String(config.mtpy.arrowScale||.85):'0.85';
 const settings={...(userCase?config.mtpy:{}),periods,columns:'2',mode:'combined',layout:'compact',colorbarMode:'shared',colorbarPosition:'bottom',colorbarAlign:'center',colorbarGap:'3',panelGap:'6',ellipseScale,arrowScale,lastRowAlign:'center',backgroundStyle:'soft'};
 const sourceMeta=process.env.MTPY_TEST_STATIONS?JSON.parse(fs.readFileSync(process.env.MTPY_TEST_STATIONS)):[];
 const input=sources.map((sourcePath,i)=>({sourcePath,name:path.basename(sourcePath),lon:sourceMeta[i]?.longitude??[88,88,89,89][i%4],lat:sourceMeta[i]?.latitude??[29,29.5,29.5,30][i%4],mtResponses:[]}));
 await js(`window.qaAlerts=[];window.alert=m=>qaAlerts.push(m);state.records=${JSON.stringify(input)};state.allRecords=state.records;applyConfigToUI(${JSON.stringify({...config,plotType:'phaseTensorMap',showTerrain:!!process.env.MTPY_TEST_CONFIG,showTitle:false,showScale:userCase?config.showScale:false,showNorthArrow:false,showLabels:!userCase,showGrid:false,pngDpi:100,mtpy:settings})});state.terrain.localGridPath=${JSON.stringify(config.localTerrainGridPath||config.terrainGridPath||'')};clearTimeout(state.preview.autoTimer);document.getElementById('mtpyOpenBtn').click();clearTimeout(state.preview.autoTimer);`);
 assert.equal(BrowserWindow.getAllWindows().length,1,'MTpy must stay in main window');
 assert.equal(await js('state.settingsDialog.panel'),'mtParams');

 assert(await js(`getComputedStyle(el.strikeLengthInput.closest('label')).display==='none'`),'Unrelated MT controls must be hidden');
 assert(await js('exportMap(["png"],false)'),await js('qaAlerts.join("\\n")'));
 assert(await js('state.preview.hasImage&&state.preview.mapContext.config.mtpy.colorbarGap==="3"'));
 const firstOutput=await js('state.outputDirectory');
 assert.equal(await js('readConfig().mtpy.ellipseScale'),ellipseScale);assert.equal(await js('readConfig().mtpy.arrowScale'),arrowScale);
 // Exercise actual shared controls; changes must appear in the next GMT render.
 await js(`el.terrainCptInput.value='paperGray';el.terrainIntensityInput.value='0.65';document.getElementById('mtpyColorbarPosition').value='top';document.getElementById('mtpyColorbarAlign').value='end';document.getElementById('mtpyColorbarGap').value='9';document.getElementById('mtpyPanelGap').value='4';syncMTpyControls();clearTimeout(state.preview.autoTimer);`);
 if(userCase)await js(`el.terrainCptInput.value=${JSON.stringify(config.terrainCpt)};document.getElementById('mtpyColorbarPosition').value='bottom';document.getElementById('mtpyColorbarAlign').value='center';document.getElementById('mtpyColorbarGap').value='3';document.getElementById('mtpyPanelGap').value=${JSON.stringify(config.mtpy.panelGap||'6')};syncMTpyControls()`);
 const snapshot=await js('createProjectSnapshot()');assert.equal(snapshot.config.mtpy.colorbarGap,finalGap);
 await js('document.getElementById("mtpyColorbarGap").value="1"');
 await js(`restoreProjectSnapshot(${JSON.stringify(snapshot)});clearTimeout(state.preview.autoTimer)`);
 assert.equal(await js('readConfig().mtpy.colorbarGap'),finalGap);
 assert.equal(await js('readConfig().mtpy.lastRowAlign'),'center');assert.equal(await js('readConfig().mtpy.ellipseScale'),ellipseScale);assert.equal(await js('readConfig().mtpy.arrowScale'),arrowScale);
 const result=await js(`window.mtApp.exportMap({records:state.records,config:{...readConfig(),pngDpi:100,terrainPreview:false},formats:${JSON.stringify(process.env.MTPY_TEST_AI==='1'?['pdf','ai','eps']:['pdf'])}})`);
 assert(result.ok);const pdfText=require('child_process').execFileSync('/opt/homebrew/bin/pdftotext',[result.mtpy.pdf||path.join(result.outputDirectory,'多周期组图.pdf'),'-'],{encoding:'utf8'});assert.equal((pdfText.match(/Real/g)||[]).length,expectedPanels);assert.equal((pdfText.match(/Imag/g)||[]).length,expectedPanels);assert.equal(result.mtpy.colorbarPosition,userCase?'bottom':'top');assert.equal(result.mtpy.colorbarAlign,userCase?'center':'end');assert.equal(result.mtpy.colorbarGap,Number(finalGap));
 if(process.env.MTPY_TEST_CONFIG){assert.equal(result.mtpy.background.terrainCpt,userCase?config.terrainCpt:'paperGray');assert(Math.abs(result.mtpy.background.terrainIntensity-.455)<1e-8);assert(result.mtpy.background.terrainResolution);}
 if(userCase){const p=result.mtpy.panelPlacements;assert.equal(p.length,5);assert(Math.abs(p[4].x-(p[0].x+p[1].x)/2)<1e-8);assert(result.mtpy.panels.every(p=>p.annotationPDF&&p.annotationPlacement.shown===5&&p.annotationPlacement.hidden.length===0));}
 if(userCase&&config.showScale){assert.equal((pdfText.match(/\bkm\b/g)||[]).length,expectedPanels,'Geographic distance scales must retain units');assert(/^X[\d.]+cd\/[\d.]+cd$/.test(result.mtpy.background.projection));}
 const layouts=result.mtpy.panels.map(p=>JSON.parse(fs.readFileSync(path.join(result.outputDirectory,`标注_${p.period}s.json`),'utf8')));
 for(const layout of layouts.slice(1)){assert.deepStrictEqual(layout.labels,layouts[0].labels);assert.deepStrictEqual(layout.leaders,layouts[0].leaders);}
 for(const p of result.mtpy.panels){assert.equal(p.arrowReference.magnitude,.5);assert.equal(p.arrowReference.components.length,2);}
 assert.equal((pdfText.match(/Real\s*0\.5/g)||[]).length,expectedPanels);assert.equal((pdfText.match(/Imag\s*0\.5/g)||[]).length,expectedPanels);
 assert(!/Parkinson|Wiese/.test(pdfText),'Direction convention belongs in the user caption');
 await js(`renderPreview(${JSON.stringify(result.preview)},null,'',{config:readConfig()})`);
 for(const width of [1100,1280]){win.setSize(width,850);await pause(100);for(const id of ['mtpyPeriods','mtpyEllipseScale','mtpyArrowScale','mtpyLastRowAlign','mtpyColorbarGap','mtpyColorbarAlign','mtpyColumns'])assert(await js(`(()=>{const el=document.getElementById('${id}');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return r.width>40&&r.left>=0&&r.right<=innerWidth;})()`),id);}
 await js('el.settingsDialogBody.scrollTop=0');
 fs.writeFileSync(path.join(out,'MTpy主工作台.png'),(await win.webContents.capturePage()).toPNG());
 if(process.env.MTPY_TEST_AI==='1'){
  const file=result.files.find(f=>f.endsWith('.ai'));assert(fs.statSync(file).size>1000);
  const proofs=fs.readdirSync(result.outputDirectory).filter(f=>f.startsWith('AI编辑包-')).map(f=>path.join(result.outputDirectory,f,'AI-vector-proof.txt'));
  assert(proofs.some(f=>fs.existsSync(f)&&fs.readFileSync(f,'utf8').includes('westernFont=Times New Roman')));
  const layerProof=JSON.parse(fs.readFileSync(path.join(path.dirname(proofs[0]),'AI-layer-proof.json'),'utf8'));
  for(const p of result.mtpy.panels)for(const role of ['ellipses','real','imag']){
   const item=layerProof.find(x=>x.period===p.period&&x.role===role);
   const source=p.aiArtwork.find(x=>x.role===role);
   assert(item&&source&&item.items===source.artists&&source.artists>0,'MT objects must be individually selectable: '+role);
  }
 }
 await assert.rejects(js('window.mtApp.buildScript({records:state.records,config:readConfig()})'),/MTpy/);
 fs.writeFileSync(path.join(out,'MTpy验证结果.json'),JSON.stringify({root,sources,result,firstOutput,snapshot},null,2));
 console.log('MTPY_WORKBENCH_OK: single main window; shared terrain controls; original EDI; preview; project persistence; colorbar layout; AI/fonts');app.exit(0);
}catch(error){console.error(error.stack);app.exit(1);}});
