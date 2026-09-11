// Hidden saved-project roundtrip and real GMT publication export.
const {app,BrowserWindow,nativeImage}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module');
const root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..'),out=process.env.MT_GMT_WORKSPACE;
assert(out&&/验证|qa|test/i.test(out)&&process.env.QA_PROJECT);
if(process.platform==='darwin'){app.setActivationPolicy('prohibited');app.dock.hide();}
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));
mod._compile(fs.readFileSync(entry,'utf8').replace('width: 1280,','show: false, focusable: false, width: 1280,'),entry);
app.whenReady().then(async()=>{try{
 let win;for(let i=0;i<240;i++){win=BrowserWindow.getAllWindows()[0];if(win&&await win.webContents.executeJavaScript('typeof state!=="undefined"&&!!state.gmtInfo').catch(()=>false))break;await new Promise(r=>setTimeout(r,250));}
 const js=s=>win.webContents.executeJavaScript(s),project=JSON.parse(fs.readFileSync(process.env.QA_PROJECT,'utf8'));
 await js(`restoreProjectSnapshot(${JSON.stringify(project)});clearTimeout(state.preview.autoTimer);void 0`);
 const config=await js('readConfig()');
 assert(config.cartography.features.find(f=>f.abbreviation==='XC').style.bold);
 assert.equal(config.cartography.features.find(f=>f.abbreviation==='XC').style.haloWidth,.5);
 assert.equal(config.legend.position,'JBC','Outside legend must survive save/open');
 config.illustratorPackage=Boolean(process.env.QA_AI);
 config.terrainAllowDownload=false;config.terrainCacheDirectory=path.join(out,'地形缓存');
 if(process.env.QA_FAST){config.showTerrain=false;config.pngDpi=120;}
 const r=await js(`window.mtApp.exportMap(${JSON.stringify({records:[],config,formats:['png','pdf','eps']})})`);assert(r.ok,r.message);
 for(const name of ['Xiongcun','Qulong','Jiama','Bangong','Indus','Lhasa Terrane','Gangdese magmatic arc'])assert(r.annotationLayout.labels.some(l=>l.name.includes(name)),name);
 const {PDFDocument}=require(path.join(root,'node_modules/pdf-lib'));
 const pdf=await PDFDocument.load(fs.readFileSync(r.files.find(f=>f.endsWith('.pdf'))));const size=pdf.getPage(0).getSize();assert(size.width>450&&size.width<530);assert(size.height<300);
 const eps=fs.readFileSync(r.files.find(f=>f.endsWith('.eps')),'latin1'),bounds=eps.match(/^%%HiResBoundingBox: (.*)$/m)[1].split(/\s+/).map(Number);
 assert(Math.abs(bounds[2]-size.width)<.001&&Math.abs(bounds[3]-size.height)<.001);assert.deepEqual(bounds.slice(0,2),[0,0]);
 const cp=require('child_process'),pdfPath=r.files.find(f=>f.endsWith('.pdf'));
 const text=cp.execFileSync('/opt/homebrew/bin/pdftotext',[pdfPath,'-'],{encoding:'utf8'});
 for(const word of ['Legend','Jurassic','Miocene','50'])assert(text.includes(word),`Actual PDF must include ${word}`);
 assert.equal(r.annotationLayout.scaleLabel?.text,'50');
 const roundtrip=path.join(out,'EPS回读.pdf');
 cp.execFileSync('/opt/homebrew/bin/gs',['-q','-dBATCH','-dNOPAUSE','-dEPSCrop','-sDEVICE=pdfwrite',`-sOutputFile=${roundtrip}`,r.files.find(f=>f.endsWith('.eps'))]);
 const fonts=cp.execFileSync('/opt/homebrew/bin/pdffonts',[roundtrip],{encoding:'utf8'});
 assert(fonts.trim().split(/\n/).length>2,'EPS must retain fonts rather than flatten the entire page');
 const back=(await PDFDocument.load(fs.readFileSync(roundtrip))).getPage(0).getSize();
 assert(Math.abs(back.width-size.width)<1&&Math.abs(back.height-size.height)<1,'EPS importer must see a normal physical artboard');
 // Text extraction alone misses Chromium's lost inline-flex symbols. Render
 // both vector formats and require the red/blue legend symbols below the map.
 for(const [name,file] of [['pdf',pdfPath],['eps',roundtrip]]) {
  const prefix=path.join(out,`legend-${name}`);
  cp.execFileSync('/opt/homebrew/bin/pdftoppm',['-scale-to','1500','-singlefile','-png',file,prefix]);
  const raster=nativeImage.createFromPath(prefix+'.png'),{width,height}=raster.getSize(),bytes=raster.toBitmap();
  let red=0,blue=0;
  for(let y=Math.floor(height*.83);y<height;y++)for(let x=0;x<width;x++) {
   const i=(y*width+x)*4,b=bytes[i],g=bytes[i+1],r=bytes[i+2];
   if(r>g*1.5&&r>b*1.5)red++;
   if(b>r*1.8&&g>r*1.3)blue++;
  }
  assert(red>15&&blue>15,`${name} footer must contain painted red/blue symbols, got ${red}/${blue}`);
 }
 assert(BrowserWindow.getAllWindows().every(w=>!w.isVisible()));
 fs.writeFileSync(path.join(out,'publication-results.json'),JSON.stringify({files:r.files,size,bounds,layout:r.annotationLayout,config},null,2));
 console.log('PUBLICATION_EXPORT_OK',JSON.stringify({files:r.files,size,labels:r.annotationLayout.labels.map(l=>l.name)}));app.exit(0);
}catch(e){console.error(String(e.stack||e).slice(0,2500));app.exit(1);}});
