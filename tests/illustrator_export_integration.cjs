// Hidden Electron/GMT export; runs without Illustrator or a user's saved project.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert');
const root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..'),out=process.env.MT_GMT_WORKSPACE;
assert(out&&/qa|验证/i.test(out));
if(process.platform==='darwin'){app.setActivationPolicy('prohibited');app.dock.hide();}
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));
mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
app.whenReady().then(async()=>{try{
 let win;for(let i=0;i<240;i++){win=BrowserWindow.getAllWindows()[0];if(win&&await win.webContents.executeJavaScript('typeof state!=="undefined"&&!!state.gmtInfo').catch(()=>false))break;await new Promise(r=>setTimeout(r,250));}
 const js=s=>win.webContents.executeJavaScript(s),model=require(path.join(root,'electron/cartography'));
 const config=await js('clearTimeout(state.preview.autoTimer);readConfig()');
 Object.assign(config,{plotType:'baseMap',region:'86/96/28/32',projection:'M18c',title:'Editable map',showTitle:true,showTerrain:false,showScale:true,pngDpi:150,illustratorPackage:true,outputName:'AI导出验证',faultLayers:[],legend:{show:true,position:'JBC',title:'Legend',labelFontSize:8}});
 config.cartography={paperStyle:true,language:'en',localLibrary:{enabled:false},features:[
  model.feature({name:'Xiongcun (XC)',category:'Study deposit',geometry:{type:'Point',coordinates:[88.425,29.375]},style:{symbol:'a',fill:'#c23b32',fontSize:9,bold:true,halo:true}}),
  model.feature({name:'Qulong (QL)',category:'Comparison deposit',geometry:{type:'Point',coordinates:[91.6,29.6167]},style:{fill:'#226a95',fontSize:9}}),
  model.feature({name:'Jiama (JM)',category:'Comparison deposit',geometry:{type:'Point',coordinates:[91.75,29.7]},style:{fill:'#226a95',fontSize:9}}),
  model.feature({name:'Synthetic test boundary',category:'Test line',geometry:{type:'LineString',coordinates:[[85,30.5],[90,31],[97,30.5]]},style:{fontSize:9}}),
 ]};
 if(process.env.QA_TERRAIN){
  const grid=path.join(out,'synthetic-terrain.nc');
  require('child_process').execFileSync('/opt/homebrew/bin/gmt',['grdmath','-R86/96/28/32','-I0.025','X','Y','MUL','SIN','1000','MUL','4000','ADD','=',grid],{cwd:out});
  Object.assign(config,{showTerrain:true,terrainGridPath:grid,localTerrainGridPath:grid,terrainAllowDownload:false,terrainResolution:'01m',terrainPreview:true});
  config.cartography.features.push(model.feature({name:'测试地名 Test',category:'Test area',geometry:{type:'Polygon',coordinates:[[[88,29],[93,29],[93,30],[88,30],[88,29]]]},style:{opacity:25,fill:'#dea965',fontSize:9}}));
 }
 if(process.env.QA_EMPTY){config.cartography.features=[];config.legend.show=false;config.showTitle=false;config.showScale=false;}
 const r=await js(`window.mtApp.exportMap(${JSON.stringify({records:[],config,formats:['png','pdf','eps']})})`);assert(r.ok,r.message);
 const script=r.files.find(f=>f.endsWith('.jsx'));assert(script);const dir=path.dirname(script);
 const svg=fs.readFileSync(path.join(dir,'labels.svg'),'utf8');
 for(const label of (process.env.QA_EMPTY?[]:['Xiongcun (XC)','Qulong (QL)','Jiama (JM)','Legend','Editable map']))assert(svg.includes(label),label);
 assert(!svg.includes('paint-order'));assert(!svg.includes('stroke="white"'));assert(!svg.includes('<image'));
 const cp=require('child_process'),pdf=path.join(out,'EPS回读.pdf');
 cp.execFileSync('/opt/homebrew/bin/gs',['-q','-dBATCH','-dNOPAUSE','-dEPSCrop','-sDEVICE=pdfwrite',`-sOutputFile=${pdf}`,r.files.find(f=>f.endsWith('.eps'))]);
 assert(cp.execFileSync('/opt/homebrew/bin/pdffonts',[pdf],{encoding:'utf8'}).trim().split('\n').length>2,'EPS must retain fonts');
 assert(BrowserWindow.getAllWindows().every(w=>!w.isVisible()));
 fs.writeFileSync(path.join(out,'ai-results.json'),JSON.stringify({script,files:r.files},null,2));console.log('AI_PACKAGE_EXPORT_OK',script);app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
