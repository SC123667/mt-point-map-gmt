const assert=require('assert'),m=require('../electron/cartography'),p=require('../electron/label-layout'),paper=require('../electron/paper-style');
const s=m.style({fontSize:8,position:'center',dx:0,dy:0});
const label=(id,name,x,y,more={})=>({id,name,x,y,style:s,...more});
const layout={width:500,height:240,frame:{x:20,y:20,width:460,height:200},labels:[
 label('a','Main Fault',120,110,{line:true,priority:20,candidates:[{x:120,y:110,angle:12,span:180}]}),
 label('b','Main Fault',300,100,{line:true,priority:10}),
 label('c','suturezone 49',250,130),label('d','未命名缝合带（线段 22）',200,150),
 label('e','Edge label would be clipped',490,5),label('f','Adjacent Fault',120,110,{line:true,candidates:[{x:120,y:110,angle:12,span:180},{x:310,y:130,angle:0,span:180}]})]};
const r=p.place(layout);assert.equal(r.labels.length,2);assert.equal(r.placement.hidden.filter(x=>x.reason==='generic').length,2);assert(r.placement.hidden.some(x=>x.reason==='duplicate'));
for(const [i,l]of r.labels.entries()){const b=l.placed.bounds;assert(b.x>=24&&b.x+b.width<=476&&b.y>=24&&b.y+b.height<=216);for(const other of r.labels.slice(i+1))assert(!p.overlaps(b,other.placed.bounds));}
assert.deepEqual(p.place(layout),r,'deterministic output');assert.equal(p.place(layout,{enabled:false}).labels.length,layout.labels.length);
assert(p.genericName('CN-block-L2 17'));assert(!p.genericName('San Andreas Fault'));assert(p.meaningful({name:'suturezone 39'},'雅鲁藏布江缝合带'));
for(const name of ['CN-faults 523','majorfaults 51','! 26','normal_faults 119','sinistral_faults 165','YZS 1'])assert(p.genericName(name),name);
for(const name of ['YZS','BNS','Altyn Tagh Fault','雅鲁藏布江缝合带','North Fault 2'])assert(!p.genericName(name),name);
const generated={source:{relativePath:'source/Future-data.gmt'},properties:{segment:42}};
assert(p.genericLabel(generated,'Future-data 42'));assert(!p.genericLabel(generated,'Known Fault'));
const pin=p.place({...layout,labels:[label('p','Pinned',100,100,{pinned:true}),label('q','Nearby',100,100)]});assert(pin.labels.some(l=>l.id==='p'));assert(!pin.labels.some(l=>l.id==='q'));
const line=m.feature({name:'Crossing fault',category:'断层',geometry:{type:'LineString',coordinates:[[80,29],[100,29]]}});
const original=JSON.stringify(line);const cs=p.candidates(line,'86/96/28/32',m.anchor(line,'86/96/28/32'));assert(cs.length);assert(cs.every(c=>c.anchor[0]>=86&&c.anchor[0]<=96));assert.equal(JSON.stringify(line),original);
const crossing=m.feature({geometry:{type:'LineString',coordinates:[[175,10],[-175,11]]}});assert(p.candidates(crossing,'178/182/0/20',null).length);
const c=paper.applyCartography({language:'zh',features:[line],localLibrary:{enabled:true},contours:{show:true,interval:500}});assert.equal(JSON.stringify(c.features[0].geometry),JSON.stringify(line.geometry));assert.equal(JSON.stringify(line),original);assert(c.localLibrary.enabled);assert.equal(c.contours.interval,500);
assert.deepEqual(m.normalize(JSON.parse(JSON.stringify(c))).labelLayout,c.labelLayout);assert(m.normalize(c).paperStyle);assert(paper.terrainCPT('paper').includes('9000'));
const svg=require('../electron/cartography-gmt').labelSVG(r);assert(svg.includes('rotate(12'));assert(!svg.includes('suturezone'));assert(svg.includes('<text'));
console.log('Publication style and label layout: collision, duplicate, generic, edge, manual priority, date line and persistence tests passed');
