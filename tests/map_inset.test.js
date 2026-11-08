const assert=require('assert'),m=require('../electron/map-inset'),s=require('../electron/map-selections'),{PDFDocument,StandardFonts,rgb}=require('pdf-lib');
(async()=>{
 const old=s.regionBox({bounds:[0,1,0,1]});assert(!m.active({cartography:{features:[old]}}));assert(!m.settings(null).enabled);
 const box=s.regionBox({bounds:[0,1,0,1],inset:{enabled:true,width:40,borderColor:'#123456'}});assert(m.active({cartography:{features:[box]}}));assert(!m.active({plotType:'responseCurve',cartography:{features:[box]}}));assert(!m.active({cartography:{features:[{...box,visible:false}]}}));assert.deepEqual(s.regionBox({bounds:[1,2,1,2]},box).properties.inset,box.properties.inset);
 const pts=[[.45,.45],[.55,.45],[.55,.55],[.45,.55],[.45,.45]],outer=[[.1,.1],[.9,.1],[.9,.9],[.1,.9]],frame={width:400,height:400};
 const v=m.layout(box,pts,outer,frame);assert(v.scale>1);assert(v.target.x<v.source.x&&v.target.y>v.source.y);assert.equal(m.shifted(v,20).source.y,v.source.y+20);assert.equal(m.shifted(v,20).target.y,v.target.y+20);assert.equal(m.shifted(v,20).placement.y,v.placement.y+20);
 const moved=m.layout({...box,properties:{...box.properties,inset:{...box.properties.inset,x:1,y:0}}},pts,outer,frame);assert(moved.target.x>v.target.x&&moved.target.y<v.target.y);assert.deepEqual(moved.source,v.source);assert.equal(moved.scale,v.scale);assert.equal(m.settings({x:5,y:-2}).x,1);assert.equal(m.settings({x:5,y:-2}).y,0);
 assert.throws(()=>m.layout(box,outer,outer,frame),/无法放大/);assert.throws(()=>m.layout(box,[[-.5,0],[1,1]],outer,frame),/主图范围/);
 for(const [region,projection,bounds,swapAxes] of [['86/96/28/32','M12c',[88.2,88.6,29.2,29.6],false],['86/96/28/32','L91/30/28/32/12c',[88.2,88.6,29.2,29.6],false],['170/190/-10/10','M12c',[178,180,-1,1],false],['86/96/28/32','X12c/12c',[88.2,88.6,29.2,29.6],true]]){
  const frame={width:400,height:400,ox:20,oy:20},ring=s.boxGeometry(bounds).coordinates[0],outer=s.boxGeometry(region.split('/')).coordinates[0];
  const pts=await require('../electron/map-project-worker').project({config:{region,projection,swapAxes},frame,points:[...ring,...outer]});
  assert(m.layout(box,pts.slice(0,ring.length),pts.slice(ring.length),frame).scale>1,projection);
 }
 const doc=await PDFDocument.create(),page=doc.addPage([400,400]),font=await doc.embedFont(StandardFonts.Helvetica);page.drawRectangle({x:190,y:190,width:10,height:10,color:rgb(1,0,0)});page.drawText('A',{x:195,y:200,font,size:4});
 const out=await PDFDocument.load(await m.compose(await doc.save(),v));assert.equal(out.getPageCount(),1);assert.deepEqual(out.getPage(0).getSize(),{width:400,height:400});assert(!out.context.enumerateIndirectObjects().some(([,o])=>o.dict?.get(require('pdf-lib').PDFName.of('Subtype'))?.toString()==='/Image'),'Vector inset must not introduce a raster');
 console.log('Inset: persistence, visibility, size limits, source bounds, positions and vector composition passed');
})().catch(e=>{console.error(e);process.exit(1)});
