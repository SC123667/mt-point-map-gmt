const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {PDFDocument,PDFName}=require('pdf-lib');
const {composePDF,makeAIJob}=require('../electron/mtpy-export');
(async()=>{
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'mtpy-vector-test-'));
 try{
  const source=await PDFDocument.create();const page=source.addPage([504,432]);page.drawRectangle({x:50,y:60,width:100,height:80});page.drawText('MTpy vector');
  const file=path.join(output,'panel.pdf');fs.writeFileSync(file,await source.save());
  const combined=await composePDF({output,columns:2,panels:Array.from({length:3},()=>({files:{pdf:file}}))});
  const pdf=await PDFDocument.load(fs.readFileSync(combined));assert.equal(pdf.getPageCount(),1);assert.deepEqual(pdf.getPage(0).getSize(),{width:1008,height:864});
  for(const [,object] of pdf.context.enumerateIndirectObjects())assert.notEqual(object.dict?.get(PDFName.of('Subtype'))?.toString(),'/Image');
  // Physical gap, all four sides and all alignments must preserve vector content.
  const bar=await PDFDocument.create();bar.addPage([100,40]).drawRectangle({x:0,y:0,width:100,height:40});
  const barFile=path.join(output,'bar.pdf');fs.writeFileSync(barFile,await bar.save());
  const {withColorbar}=require('../electron/mtpy-export');
  for(const position of ['top','bottom','left','right'])for(const align of ['start','center','end']){
   const bytes=await withColorbar(await source.save(),{colorbar:{file:barFile},colorbarPosition:position,colorbarAlign:align,colorbarGap:10},true);
   const doc=await PDFDocument.load(bytes),size=doc.getPage(0).getSize(),vertical=['left','right'].includes(position);
   assert(Math.abs(size.width-(504+(vertical?100+10*72/25.4:0)))<1e-7);
   assert(Math.abs(size.height-(432+(vertical?0:40+10*72/25.4)))<1e-7);
   for(const [,object] of doc.context.enumerateIndirectObjects())assert.notEqual(object.dict?.get(PDFName.of('Subtype'))?.toString(),'/Image');
  }
  const script=makeAIJob(combined,output);assert(fs.existsSync(path.join(path.dirname(script),'MTpy-vector.pdf')));
  const code=fs.readFileSync(script,'utf8');assert(code.includes('/*GMT_AUTOMATION*/null'));assert(code.includes('IllustratorSaveOptions'));assert(code.includes('doc.saveAs'));assert(code.includes('rasters>0'));assert(code.includes('TimesNewRomanPSMT'));assert(code.includes('Font verification failed'));
  new Function(code.replace('#target illustrator',''));
  const fake=path.join(output,'utf8-worker');
  fs.writeFileSync(fake,'#!/usr/bin/env node\nconst b=Buffer.from(JSON.stringify({path:"日喀则/分层.pdf"}));const i=b.indexOf(Buffer.from("喀"))+1;process.stdout.write(b.subarray(0,i));setTimeout(()=>process.stdout.write(b.subarray(i)),30);');fs.chmodSync(fake,0o755);
  const saved=process.env.MT_GMT_MTPY_PYTHON;
  try{process.env.MT_GMT_MTPY_PYTHON=fake;assert.equal((await require('../electron/mtpy-engine').run({})).path,'日喀则/分层.pdf');}
  finally{if(saved===undefined)delete process.env.MT_GMT_MTPY_PYTHON;else process.env.MT_GMT_MTPY_PYTHON=saved;}
  // Semantic pages must match the final artboard, including individual bars,
  // shared bars on either axis, a title and a partly filled final row.
  const {composeLayers}=require('../electron/mtpy-ai');
  for(const mode of ['shared','individual'])for(const position of ['left','bottom']){
   const panels=[];
   for(let i=0;i<3;i++){
    const file=path.join(output,`layer-${mode}-${position}-${i}.pdf`);fs.writeFileSync(file,await source.save());
    panels.push({period:10**i,files:{pdf:file},axis:[.15,.12,.78,.78],groupAxis:[.15,.12,.78,.78],aiArtwork:[{role:'ellipses',file,artists:1}]});
   }
   const result={output,columns:2,panels,colorbar:{file:barFile},colorbarMode:mode,colorbarPosition:position,colorbarGap:3,titlePDF:barFile,layout:'compact'};
   const final=await PDFDocument.load(fs.readFileSync(await composePDF(result)));
   const layers=await composeLayers(result),pages=await PDFDocument.load(fs.readFileSync(layers.file));
   assert.equal(pages.getPageCount(),mode==='shared'?5:7);
   for(const page of pages.getPages())assert.deepEqual(page.getSize(),final.getPage(0).getSize());
   const job=makeAIJob(path.join(output,'多周期组图.pdf'),output,{layers});
   new Function(fs.readFileSync(job,'utf8').replace('#target illustrator',''));
  }
  console.log('MTPY_VECTOR_EXPORT_OK: grid PDF preserves vector content; native AI package is executable');
 }finally{fs.rmSync(output,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
