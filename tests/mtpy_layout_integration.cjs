// Requires the verified MTpy environment and original EDI input paths.
const fs=require('fs'),path=require('path'),assert=require('assert'),{execFileSync}=require('child_process');
const engine=require('../electron/mtpy-engine'),exporter=require('../electron/mtpy-export');
(async()=>{
 const root=process.env.MT_GMT_WORKSPACE;assert(root&&/验证|qa/.test(root));
 const files=JSON.parse(fs.readFileSync(process.env.MTPY_TEST_SOURCES||'/tmp/mtpy-tibet-sources.json'));
 for(const [position,align,mode,barMode]of [['left','start','phase','shared'],['right','end','combined','shared'],['bottom','center','combined','individual'],['top','center','tipper','none']]){
  const output=path.join(root,position);fs.mkdirSync(output,{recursive:true});
  const result=await engine.run({action:'render',files,periods:[1,100],columns:2,output,mode,colorbarMode:barMode,colorbarPosition:position,colorbarAlign:align,colorbarGap:8,layout:barMode==='individual'?'spaced':'compact',pngDpi:90,title:position==='left'?'MTpy 地形与构造图':''});
  result.pdf=await exporter.composePDF(result);result.previewOnly=true;await exporter.refreshOutputs(result);
  const text=execFileSync('/opt/homebrew/bin/pdftotext',[result.pdf,'-'],{encoding:'utf8'});
  assert.equal((text.match(/Real/g)||[]).length,mode==='phase'?0:2,'One Real/Imag legend per map');
  assert.equal((text.match(/Imag/g)||[]).length,mode==='phase'?0:2);
  if(result.colorbar){const colorbar=execFileSync('/opt/homebrew/bin/pdftotext',[result.colorbar.file,'-'],{encoding:'utf8'});assert(!/Real|Imag/.test(colorbar),'Colorbar must not contain arrow legend');}
  if(mode==='tipper')assert.equal(result.colorbar,null);
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(position+' '+mode+' '+barMode+' OK');
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
