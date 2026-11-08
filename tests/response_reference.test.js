const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const {buildScript}=require('../electron/gmt'),{metricsForResponse}=require('../electron/mt');
const c=require('../electron/response-collection'),root=fs.mkdtempSync(path.join(os.tmpdir(),'response-reference-'));
const rs=[{name:'S1',lon:88,lat:29,mtResponses:[1,10,100].map(period=>({period,z:{xy:{re:4,im:3},yx:{re:-4,im:-3}},variance:{xy:.2,yx:.2}}))}];
const before=JSON.stringify(rs);
try{
 for(const mode of ['single','panels','overlay'])for(const phaseMode of ['signed','folded']){
  const dir=path.join(root,mode+phaseMode);fs.mkdirSync(dir);
  const script=buildScript(rs,{plotType:'responseCurve',showTitle:false,curveCollection:{mode,style:'reference',phaseMode,showGrid:true}},dir,['pdf']);
  const actual=Number(fs.readFileSync(path.join(dir,'curve_0_phase_yx.tsv'),'utf8').split(/\s+/)[1]),z=metricsForResponse(rs[0].mtResponses[0]).impedance;
  assert(Math.abs(actual-(phaseMode==='signed'?z.phaseYX:z.phaseYXPlot))<1e-6);
  assert(script.includes('MAP_TICK_LENGTH_PRIMARY=-3p/-1.5p'));assert(script.includes('gray75,-'));assert(/gmt plot .*_err.tsv/.test(script));
  if(mode!=='overlay'){assert(script.includes('-Sc0.12c -G#cf321b'));assert(script.includes('-Sc0.12c -G#00549b'));assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'curve_collection_labels.json'))).layout.legendHeight,0);}
 }
 const jsx=fs.readFileSync(path.join(__dirname,'../electron/illustrator-template.jsx'),'utf8');
 const block=jsx.slice(jsx.indexOf("    if(info.westernFont==='Times New Roman')"),jsx.indexOf('    var options=new IllustratorSaveOptions();'));
 const chars=['A','B','C','D','中','Ω'].map((contents,i)=>({contents,characterAttributes:{textFont:{name:['Helvetica','Helvetica-Bold','Helvetica-Oblique','Helvetica-BoldOblique','PingFangSC','Symbol'][i]}}}));
 const context={info:{westernFont:'Times New Roman'},app:{textFonts:{getByName:name=>({name})}},doc:{textFrames:[{textRange:{characters:chars}}]},checkCancelled:()=>{}};
 require('vm').runInNewContext(block,context);
 assert.deepEqual(chars.map(c=>c.characterAttributes.textFont.name),['TimesNewRomanPSMT','TimesNewRomanPS-BoldMT','TimesNewRomanPS-ItalicMT','TimesNewRomanPS-BoldItalicMT','PingFangSC','TimesNewRomanPSMT']);
 assert.throws(()=>require('vm').runInNewContext(block,{...context,app:{textFonts:{getByName:()=>{throw Error('missing')}}}}),/Times New Roman/);
 assert.equal(JSON.stringify(rs),before);assert.equal(c.normalize({style:'reference'}).phaseMode,'signed');
 console.log('Reference response style: single/panels/overlay, signed/folded impedance phase, filled dots, error bars and no connecting line defaults, inset keys and unchanged EDI passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
