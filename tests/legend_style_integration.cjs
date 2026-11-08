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
 const js=s=>win.webContents.executeJavaScript(s);await js('window.alert=()=>{};scheduleAutoPreview=()=>{};queueLegendPreview=()=>{};void 0');
 win.setSize(1280,820);await js('openSettingsPanel("overlay")');
 const hit=await js(`(()=>{const n=we('legendLineOpacityOverrideInput');n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return {width:r.width,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n};})()`);assert(hit.width>0&&hit.hit,JSON.stringify(hit));
 await js(`we('legendLineOpacityOverrideInput').click();we('legendLineOpacityInput').value='30';we('legendLineOpacityInput').dispatchEvent(new Event('input',{bubbles:true}));`);
 assert.equal(await js('readConfig().legend.lineOpacity'),30);assert.equal(await js('we("legendLineOpacityInput").disabled'),false);
 const snap=await js('createProjectSnapshot()');await js(`restoreProjectSnapshot(${JSON.stringify(snap)});`);assert.equal(await js('readConfig().legend.lineOpacity'),30);
 await js('openSettingsPanel("overlay")');await pause(150);fs.writeFileSync(path.join(out,'图例设置面板.png'),(await win.webContents.capturePage()).toPNG());
 await js('we("legendLineOpacityOverrideInput").click()');assert.equal(await js('readConfig().legend.lineOpacity'),null);
 await js('openSettingsPanel("localLibrary");renderLocalLibrary()');
 const libResult=await js(`(()=>{const row=le('categories').querySelector('[data-row="正断层"]');row.querySelector('[data-dash]').value='dot';row.querySelector('[data-stroke-opacity]').value='45';row.querySelector('[data-stroke-opacity]').dispatchEvent(new Event('change',{bubbles:true}));return librarySettings().styles['正断层'];})()`);assert.equal(libResult.strokeOpacity,45);assert.equal(libResult.dash,'dot');
 const m=require(path.join(root,'electron/cartography'));
 const features=[['normal','正断层','#a06b35','solid',.8,25,1],['thrust','逆冲断层','#65547d','dash',1.6,85,2],['boundary','构造边界','#647a7d','dot',.5,60,3]].map(([name,category,color,dash,width,strokeOpacity,y])=>m.feature({name,nameZh:name,nameEn:name,category,style:{color,dash,width,strokeOpacity,showLabel:false},geometry:{type:'LineString',coordinates:[[.5,y],[3.5,y]]}}));
 features.push(m.feature({name:'XC',nameZh:'雄村',nameEn:'Xiongcun',abbreviation:'XC',category:'矿床',style:{symbol:'a',fill:'#ab3b38',showLabel:false},geometry:{type:'Point',coordinates:[1,2.6]}}),m.feature({name:'DG',nameZh:'洞嘎',nameEn:'Dongga',abbreviation:'DG',category:'矿床',style:{symbol:'d',fill:'#b88e3a',showLabel:false},geometry:{type:'Point',coordinates:[2,2.6]}}));
 await js(`state.cartography={...state.cartography,features:${JSON.stringify(features)},categoryStyles:{}};renderCartography();selectCartFeature(${JSON.stringify(features[0].id)});openSettingsPanel('cartography');we('workbenchEditorTab1').click();`);
 const control=await js(`(()=>{const n=ce('style-strokeOpacity');n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return {value:n.value,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n};})()`);assert(control.hit);assert.equal(control.value,'25');
 await js(`openSettingsPanel('overlay');we('structureLinePresetBtn').scrollIntoView({block:'center'});`);
 assert(await js(`(()=>{const n=we('structureLinePresetBtn'),r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n;})()`));
 await js(`we('structureLinePresetBtn').click()`);
 const styled=await js('state.cartography.features');assert.equal(styled[0].style.strokeOpacity,95);assert.equal(styled[1].style.dash,'dash');assert.deepEqual(styled[3].style,features[3].style);
 const config={plotType:'baseMap',region:'0/4/0/4',projection:'M16c',frame:'af',showTitle:false,showScale:false,showTerrain:false,showGrid:false,pngDpi:150,outputName:'legend_styles',legend:{show:true,position:'JBC',lineOpacity:30},cartography:{language:'en',features,paperStyle:true},illustratorPackage:true};
 const html=mod.exports.nativeLegendMarkup(config,{width:1000,height:1000});assert(html.includes('stroke-opacity="0.30000000000000004"')||html.includes('stroke-opacity="0.3"'));assert(html.includes('stroke-dasharray'));assert(html.includes('DG')&&html.includes('XC'));
 const r=await js(`window.mtApp.exportMap(${JSON.stringify({records:[],config,formats:['png','pdf']})})`);assert(r.ok,r.message);assert(r.illustratorScript);
 const script=fs.readFileSync(r.scriptPath,'utf8');assert(script.includes('#a06b35@75'));assert(script.includes('#65547d@15'));assert(!script.includes('#a3a6a2'),'Explicit styles must not be silently greyed');
 const svg=fs.readFileSync(path.join(path.dirname(r.illustratorScript),'labels.svg'),'utf8');assert(svg.includes('stroke-opacity="0.3')&&svg.includes('stroke-dasharray'),'AI editing SVG must retain stroke opacity and pattern');
 assert(BrowserWindow.getAllWindows().every(w=>!w.isVisible()));
 fs.writeFileSync(path.join(out,'验证结果.json'),JSON.stringify({ui:{hit,library:libResult,object:control,projectOpacity:snap.config.legend.lineOpacity},files:r.files,illustratorScript:r.illustratorScript,gmt:r.gmtEngine,allWindowsHidden:true},null,2));console.log('LEGEND_STYLE_INTEGRATION_OK',JSON.stringify({files:r.files,illustratorScript:r.illustratorScript}));app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}});
