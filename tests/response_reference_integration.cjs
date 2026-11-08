// Hidden real Electron / GMT checks. Never launch or manipulate Illustrator.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module'),cp=require('child_process');
const root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..'),out=process.env.MT_GMT_WORKSPACE;
assert(out&&/验证|qa/.test(out));fs.mkdirSync(out,{recursive:true});
app.setActivationPolicy('prohibited');app.dock.hide();
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));
mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{try{
 let win;for(let i=0;i<160;i++){win=BrowserWindow.getAllWindows()[0];if(win&&await win.webContents.executeJavaScript('typeof projectHistory!=="undefined"&&!!projectHistory.current').catch(()=>false))break;await pause(200);}
 const js=s=>win.webContents.executeJavaScript(s);

 const paths=JSON.parse(fs.readFileSync('/Volumes/MacBook Pro SSD/GMT-缓存/验证/v1.22.0/源码集成/验证结果.json')).sources;
 const records=paths.map(p=>require('../electron/parser').parseEdiStationText(fs.readFileSync(p,'utf8'),p));
 await js(`window.alert=()=>{};refreshPreviewAutomatically=async()=>{};loadParsed({records:${JSON.stringify(records)},rows:[],columns:['name','lon','lat'],mapping:{coordinateType:'geographic',name:'name',lon:'lon',lat:'lat'},region:'86/96/28/32'});applyConfigToUI({plotType:'responseCurve',showTitle:false,curveStation:${JSON.stringify(records[0].name)}});clearTimeout(state.preview.autoTimer);openSettingsPanel('curveCollection');rcEl('reference').click();clearTimeout(state.preview.autoTimer);`);
 assert.equal(await js('readConfig().curveCollection.style'),'reference');assert.equal(await js('readConfig().curveCollection.phaseMode'),'signed');
 const config=await js('readConfig()'),before=JSON.stringify(records),results=[];
 const {PDFDocument,PDFName}=require('../node_modules/pdf-lib');
 for(const [mode,layout]of [['single','rows'],['panels','horizontal'],['panels','vertical'],['overlay','rows']]){
  const cfg={...config,showTitle:false,outputName:mode+'_'+layout,pngDpi:140,illustratorPackage:true,curveCollection:{...config.curveCollection,mode,layout,keys:null,count:3}};
  const r=await js(`window.mtApp.exportMap({records:${JSON.stringify(records)},config:${JSON.stringify(cfg)},formats:['png','pdf','eps']})`);assert(r.ok,JSON.stringify(r));
  const dir=path.dirname(r.illustratorScript),pdf=await PDFDocument.load(fs.readFileSync(path.join(dir,'base-map.pdf')));let images=0;for(const [,o]of pdf.context.enumerateIndirectObjects())if(o.dict?.get(PDFName.of('Subtype'))?.toString()==='/Image')images++;assert.equal(images,0);
  const svg=fs.readFileSync(path.join(dir,'labels.svg'),'utf8');for(const st of mode==='single'?records.slice(0,1):records)assert(svg.includes(st.name));if(mode!=='overlay')assert(svg.includes('XY')&&svg.includes('YX'));assert(svg.includes('Times New Roman'));assert(fs.readFileSync(r.illustratorScript,'utf8').includes('TimesNewRomanPSMT'));
  const numeric=fs.readFileSync(path.join(r.outputDirectory,'curve_0_phase_yx_err.tsv'),'utf8');assert(numeric.includes('>'),'valid EDI error bars retained');
  const png=r.files.find(f=>f.endsWith('.png'));fs.copyFileSync(png,path.join(out,cfg.outputName+'.png'));results.push({mode,layout,files:r.files,images});
 }
 for(const width of [1000,1280]){win.setSize(width,850);await pause(100);for(const id of ['rc-reference','rc-style','rc-phaseMode','rc-showErrors','rc-connect','rc-ai'])assert(await js(`(()=>{const b=document.getElementById('${id}');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return b.checkVisibility()&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;})()`),id);}
 const snapshot=await js('createProjectSnapshot()');await js(`restoreProjectSnapshot(${JSON.stringify(snapshot)});clearTimeout(state.preview.autoTimer);`);assert.equal(await js('readConfig().curveCollection.style'),'reference');
 assert.equal(JSON.stringify(records),before);assert(BrowserWindow.getAllWindows().every(w=>!w.isVisible()));
 fs.writeFileSync(path.join(out,'验证结果.json'),JSON.stringify({sources:paths,results,hidden:true,nativeIllustrator:'not operated'},null,2));console.log('REFERENCE_STYLE_OK: real EDI/GMT single/horizontal/vertical/overlay, vector PDF/EPS and editable SVG names/keys, hidden UI controls and persistence');app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
