const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const c=require('../electron/response-collection'),{buildScript}=require('../electron/gmt');
const response={period:1,z:{xy:{re:4,im:3},yx:{re:-3,im:-4}},variance:{xy:.1,yx:.2}};
const records=Array.from({length:5},(_,i)=>({name:i===1?'中文站':i===2?'A':'S'+i,lon:88+i/10,lat:29,mtResponses:[response,{...response,period:10+i}]}));
const duplicate={...records[2],lon:89};
assert.notEqual(c.stationKey(duplicate),c.stationKey(records[2]));
const keys=records.map(c.stationKey),config={plotType:'responseCurve',curveCollection:{mode:'panels',keys:[keys[2],keys[0],keys[1]],layout:'rows',count:2},pngDpi:100,showTitle:false};
const before=JSON.stringify({records,config});
assert.deepEqual(c.selected(records,config).map(r=>r.name),['A','S0','中文站']);
assert.equal(c.issue(records,config),'');assert(c.issue(records,{...config,curveCollection:{mode:'panels',keys:[]}}));
assert(c.issue(records,{...config,curveCollection:{mode:'panels',keys:['missing']}}));
assert.equal(c.normalize().mode,'single');
for(const [layout,expected]of [['horizontal',[1,5]],['vertical',[5,1]],['rows',[3,2]],['columns',[2,3]]]){
 const g=c.layout(5,{mode:'panels',layout,count:2});assert.deepEqual([g.rows,g.cols],expected);assert.equal(g.cells.length,5);assert.equal(new Set(g.cells.map(v=>[v.x,v.y].join(','))).size,5);
 if(layout==='columns')assert.deepEqual(g.cells.map(v=>[v.row,v.col]),[[0,0],[1,0],[0,1],[1,1],[0,2]]);
}
const root=fs.mkdtempSync(path.join(process.env.MT_GMT_WORKSPACE||os.tmpdir(),'curve-collection-test-'));
try{
 const group=path.join(root,'group');fs.mkdirSync(group);const script=buildScript(records,config,group,['pdf']);
 assert(script.includes('curve_2_rho_xy.tsv')&&script.includes('curve_0_period_ticks.txt'));
 const metadata=JSON.parse(fs.readFileSync(path.join(group,'curve_collection_labels.json')));assert.deepEqual(metadata.stations.map(r=>r.name),['A','S0','中文站']);assert(metadata.labels.some(l=>l.name.includes('中文站')));
 for(const [i,key]of config.curveCollection.keys.entries()){
  const station=records.find(r=>c.stationKey(r)===key),single=path.join(root,String(i));fs.mkdirSync(single);
  buildScript([station],{plotType:'responseCurve',showTitle:false},single,['pdf']);
  for(const file of fs.readdirSync(single).filter(f=>/^curve_(rho|phase).*tsv$/.test(f)))assert.deepEqual(fs.readFileSync(path.join(single,file)),fs.readFileSync(path.join(group,file.replace('curve_',`curve_${i}_`))),'Original numeric and error TSV unchanged');
 }
 const overlay=buildScript(records,{...config,curveCollection:{...config.curveCollection,mode:'overlay'}},group,['pdf']);assert(overlay.includes('#0072b2,-'));assert(overlay.includes('#d55e00'));assert.equal(JSON.parse(fs.readFileSync(path.join(group,'curve_collection_labels.json'))).layout.cells.length,1);
 assert.equal(JSON.stringify({records,config}),before);
 console.log('Response collection: ordering, identity, layouts, invalid selection, overlay, bilingual labels, unchanged response/error TSV passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
