// Re-export a saved project in a hidden, isolated process. Existing terrain and
// previously resolved library features are read-only inputs; no network download.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module');
const root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..'),out=process.env.MT_GMT_WORKSPACE;
assert(out&&/验证|qa|test/i.test(out));assert(process.env.QA_PROJECT&&process.env.QA_FEATURES);
if(process.platform==='darwin'){app.setActivationPolicy('prohibited');app.dock.hide();}
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));
mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{try{
 let win;for(let i=0;i<240;i++){win=BrowserWindow.getAllWindows()[0];if(win&&await win.webContents.executeJavaScript('typeof state!=="undefined"&&!!state.gmtInfo').catch(()=>false))break;await pause(250);}
 assert(win);const js=s=>win.webContents.executeJavaScript(s);
 const snapshot=JSON.parse(fs.readFileSync(process.env.QA_PROJECT,'utf8'));
 const model=require(path.join(root,'electron/cartography'));
 const {features,issues}=model.collection(JSON.parse(fs.readFileSync(process.env.QA_FEATURES,'utf8')));assert.deepEqual(issues,[]);
 const config={...snapshot.config,terrainAllowDownload:false,terrainCacheDirectory:path.join(out,'地形缓存'),outputName:'研究区地质图概况_修复验证',cartography:{...snapshot.config.cartography,features,localLibrary:{enabled:false}}};
 const results=[];
 for(const language of ['zh','en']){
  const c={...config,cartography:{...config.cartography,language},outputName:config.outputName+'_'+language};
  // Chinese uses the exact cached terrain/resolution/DPI of the failed export.
  // English also verifies neighbouring long labels without reprocessing terrain.
  if(language==='en'&&!process.env.QA_FULL_TERRAIN){c.showTerrain=false;c.pngDpi=120;}
  const r=await js(`window.mtApp.exportMap(${JSON.stringify({records:[],config:c,formats:['png','pdf','eps']})})`);
  assert(r.ok,r.message);assert(r.gmtEngine.version.startsWith('6.7.'));
  for(const f of snapshot.config.cartography.features){assert(r.annotationLayout.labels.some(l=>l.id===f.id),'Missing '+f.name);assert.deepEqual(features.find(v=>v.id===f.id).geometry,f.geometry);}
  for(const f of features.filter(f=>f.abbreviation==='BNS'))assert(r.annotationLayout.labels.some(l=>l.id===f.id&&l.name.includes(language==='en'?'Bangong':'班公')),'Missing bilingual BNS label');
  const labels=r.annotationLayout.labels,p=require(path.join(root,'electron/label-layout'));
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)assert(!p.overlaps(labels[i].placed.bounds,labels[j].placed.bounds),'Label collision');
  for(const f of r.files)assert(fs.statSync(f).size>100);
  results.push({language,files:r.files,labels:labels.map(l=>({id:l.id,name:l.name,placed:l.placed})),gmt:r.gmtEngine});
 }
 assert(BrowserWindow.getAllWindows().every(w=>!w.isVisible()));
 fs.writeFileSync(path.join(out,'project-export-results.json'),JSON.stringify(results,null,2));
 console.log('PROJECT_EXPORT_OK',JSON.stringify(results.map(r=>({language:r.language,labels:r.labels.map(l=>l.name),files:r.files}))));app.exit(0);
}catch(e){console.error(String(e.stack||e).slice(0,2500));app.exit(1);}});
