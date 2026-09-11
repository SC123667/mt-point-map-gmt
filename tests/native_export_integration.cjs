// Hidden Electron regression: large PNG, Unicode/file-URL escaping, vector overlay,
// and temporary-file cleanup. Use an isolated QA workspace; never the user's App.
const {app,BrowserWindow,nativeImage}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module'),crypto=require('crypto');
const out=process.env.MT_GMT_WORKSPACE,root=process.env.QA_MODULE_ROOT||path.join(__dirname,'..');
assert(out&&path.isAbsolute(out)&&/验证|qa|test/i.test(out),'Set an isolated QA workspace');
fs.mkdirSync(out,{recursive:true});
if(process.platform==='darwin'){app.setActivationPolicy('prohibited');app.dock.hide();}
if(root.endsWith('.asar')){app.setAppPath(root);Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});}
const entry=path.join(root,'electron/main.js');
const source=fs.readFileSync(process.env.QA_SOURCE_MAIN||entry,'utf8');
const mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));
mod._compile(source.replace('width: 1280,','show: false, focusable: false, width: 1280,')+'\nmodule.exports={renderDecoratedMap,nativeLegendMarkup};',entry);
app.whenReady().then(async()=>{try{
 const input=path.join(out,'中文 地形 #% &.png');
 if(process.env.QA_PNG)fs.copyFileSync(process.env.QA_PNG,input);
 else {const width=3022,height=1391,bytes=crypto.randomBytes(width*height*4);for(let i=3;i<bytes.length;i+=4)bytes[i]=255;fs.writeFileSync(input,nativeImage.createFromBitmap(bytes,{width,height}).toPNG());}
 assert(fs.statSync(input).size>2*1024*1024,'Fixture must exceed the old data-URL limit');
 const config={title:'大图导出验证',showTitle:true,legend:{show:false}};
 if(process.env.QA_EXPECT_OLD_FAILURE){
  await assert.rejects(mod.exports.renderDecoratedMap(input,config),e=>e.message.includes('ERR_INVALID_URL'));
  console.log('OLD_LARGE_PNG_FAILURE_REPRODUCED');app.exit(0);return;
 }
 const r=await mod.exports.renderDecoratedMap(input,config,true);
 assert(r.pdfBuffer?.length>1000);assert(r.pngBuffer.length>1000);
 const size=nativeImage.createFromBuffer(r.pngBuffer).getSize();
 const scale=size.width/r.imageSize.width;
 assert(scale>=1);assert.equal(size.height,(r.imageSize.height+r.titleHeight)*scale);
 fs.writeFileSync(path.join(out,'decorated.png'),r.pngBuffer);fs.writeFileSync(path.join(out,'overlay.pdf'),r.pdfBuffer);
 // The PDF must contain editable text and must not embed the PNG background.
 const {PDFDocument,PDFName}=require(path.join(root,'node_modules/pdf-lib'));
 const doc=await PDFDocument.load(r.pdfBuffer);let images=0;
 for(const [,obj]of doc.context.enumerateIndirectObjects())if(obj.dict?.get(PDFName.of('Subtype'))?.toString()==='/Image')images++;
  assert.equal(images,0,'Native overlay must remain vector-only');
 for(const language of ['en','zh']) {
  const cfg={...config,projection:'M16c',plotType:'baseMap',region:'86/96/28/32',legend:{show:true,position:'JBC',labelFontSize:8},cartography:{language,features:[{visible:true,category:language==='en'?'Study locality':'研究地点',geometry:{type:'Point',coordinates:[88,29]},style:{symbol:'a',fill:'#c23b32'}}]}};
  assert(mod.exports.nativeLegendMarkup(cfg,{width:3022,height:1391}).includes('<polygon'), 'Star symbol must match the map');
  const outside=await mod.exports.renderDecoratedMap(input,cfg,true);
  assert(outside.footerHeight>0);
  const printed=await PDFDocument.load(outside.pdfBuffer), page=printed.getPage(0).getSize();
  assert.equal(printed.getPageCount(),1);
  assert(Math.abs(page.height/page.width-(outside.imageSize.height+outside.titleHeight+outside.footerHeight)/outside.imageSize.width)<.002,'Print page must include footer without vertical stretching');
  const output=path.join(out,`outside-${language}.pdf`);fs.writeFileSync(output,outside.pdfBuffer);
  const text=require('child_process').execFileSync(process.env.QA_PDFTOTEXT||'/opt/homebrew/bin/pdftotext',[output,'-'],{encoding:'utf8'});
  assert(text.includes(language==='en'?'Study locality':'研究地点'),'Outside legend must actually be printed, not clipped');
 }
 const noPDF=await mod.exports.renderDecoratedMap(input,{showTitle:false,legend:{show:false}},false);
 assert.equal(noPDF.pdfBuffer,undefined);assert.equal(noPDF.titleHeight,0);
 const tmp=path.join(out,'临时文件','原生叠加');assert.deepEqual(fs.readdirSync(tmp),[]);
 // A failed load must also destroy its window and release its temporary files.
 const original=BrowserWindow.prototype.loadFile;
 BrowserWindow.prototype.loadFile=async function(){throw Error('QA_LOAD_FAILURE');};
 try{await assert.rejects(mod.exports.renderDecoratedMap(input,config),/QA_LOAD_FAILURE/);}finally{BrowserWindow.prototype.loadFile=original;}
 assert.deepEqual(fs.readdirSync(tmp),[]);assert(BrowserWindow.getAllWindows().every(w=>!w.isVisible()));
 console.log('NATIVE_EXPORT_OK',JSON.stringify({inputBytes:fs.statSync(input).size,size,overlayImages:images,cleanup:true,hidden:true}));app.exit(0);
}catch(e){console.error(String(e.stack||e).slice(0,2500));app.exit(1);}});
