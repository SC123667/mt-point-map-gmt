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
assert.deepEqual(p.place(layout),r,'deterministic output');const manual=p.place(layout,{enabled:false,hideGeneric:true});
assert.deepEqual(manual.labels.map(l=>l.id),['a','b','e','f']);
assert.deepEqual(manual.placement.hidden.map(l=>l.reason),['generic','generic']);
assert.equal(manual.placement.shown,4);
assert.deepEqual(p.place(layout,{enabled:false,hideGeneric:false}).labels,layout.labels);
const sourceNumber=label('auto','Future-data 42',150,120,{generic:true,pinned:true});
assert.equal(p.place({...layout,labels:[sourceNumber]},{enabled:false}).labels.length,0);
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

// Close mineral localities: keep the configured side if it fits, try other
// directions before hiding a name, and never move its geographic point.
const pointStyle=m.style({fontSize:7,position:'right',dx:1.2,dy:0,size:.16});
const minerals={width:500,height:240,frame:{x:20,y:20,width:460,height:200},labels:[
 {...label('jiama','甲玛 (JM)',310,120),point:true,style:pointStyle},
 {...label('qulong','驱龙 (QL)',303,124),point:true,style:pointStyle},
 {...label('xiongcun','雄村 (XC)',180,150),point:true,style:pointStyle}]};
const before=JSON.stringify(minerals),mineralLayout=p.place(minerals);
assert.equal(mineralLayout.labels.length,3);assert.equal(JSON.stringify(minerals),before);
assert(mineralLayout.labels.find(l=>l.id==='qulong').placed.x<303,'Conflicting right label should fit on the left');
for(const [i,l]of mineralLayout.labels.entries())for(const other of mineralLayout.labels.slice(i+1))assert(!p.overlaps(l.placed.bounds,other.placed.bounds));
assert.deepEqual(p.place(minerals),mineralLayout);
const edge=p.place({...minerals,labels:[{...minerals.labels[0],x:468,y:100}]});assert.equal(edge.labels.length,1);assert(edge.labels[0].placed.x<468);
const pinnedPoint={...minerals.labels[0],pinned:true};
assert.deepEqual(p.place({...minerals,labels:[pinnedPoint]}).labels[0].placed,p.place({...minerals,labels:[{...pinnedPoint,point:false}]}).labels[0].placed,'Explicit anchors retain their requested placement');
assert.equal(p.place(minerals,{enabled:false}).labels[0].placed,undefined);
const rotatedPin={...pinnedPoint,style:{...pointStyle,rotation:35}};
const pinPosition=p.place({...minerals,labels:[rotatedPin]}).labels[0].placed;
assert(Math.abs(pinPosition.x-(rotatedPin.x+pointStyle.dx*72/25.4+p.textSize(rotatedPin.name,pointStyle.fontSize).width/2+pointStyle.size*72/2.54/2+3))<1e-9,'Rotated manual anchors keep the existing horizontal offset');
console.log('Nearby point names: alternate sides, edges, unchanged coordinates, manual anchors and disabled layout passed');
const longSuture=p.place({width:500,height:240,frame:{x:20,y:20,width:460,height:200},labels:[
 {...label('bns','Bangong–Nujiang Suture Zone (BNS)',360,30),style:m.style({fontSize:7.5,position:'center',dx:0,dy:0}),line:true,candidates:[{x:360,y:30,angle:18,span:180}]}]});
assert.equal(longSuture.labels.length,1,'A long English suture name must gain clearance from the upper frame');
assert(longSuture.labels[0].placed.bounds.y>=24);assert(longSuture.labels[0].placed.bounds.x+longSuture.labels[0].placed.bounds.width<=476);
assert(require('../electron/cartography-gmt').labelSVG(longSuture).includes('Bangong–Nujiang Suture Zone (BNS)'));
const weighted=m.style({bold:true,haloWidth:.5});
assert(p.textSize('Xiongcun',9,true).width>p.textSize('Xiongcun',9).width);
const styled=require('../electron/cartography-gmt').labelSVG({width:200,height:100,labels:[{...label('xc','Xiongcun',80,50),style:weighted}]});
assert(styled.includes('font-weight="700"'));assert(styled.includes('stroke-width="0.5"'));
assert.equal(m.normalize({features:[{name:'XC',geometry:{type:'Point',coordinates:[88.425,29.375]},style:weighted}]}).features[0].style.haloWidth,.5);
const {scaleMidpoint}=require('../electron/gmt-scale-label');
const tickContext={ox:12,oy:8,height:240,sx:.06,sy:.06};
const tickPS='%@GMT: gmt basemap -R86/96/28/32 -JM16c -LjBR+w100k+f\n100 50 M PSL_font_encode 0 get something\n125 F0\n(0) tc Z\n500 50 M (100) tc Z\n%%EndObject';
assert.deepEqual(scaleMidpoint(tickPS,tickContext),{x:30,y:229,text:'50',fontSize:7.5});
assert.equal(scaleMidpoint(tickPS.replace('500 50','500 51'),tickContext),null);
assert.equal(scaleMidpoint(tickPS.replace('%%EndObject','300 50 M (50) tc Z\n%%EndObject'),tickContext),null);
assert.equal(scaleMidpoint('no scale',tickContext),null);
assert(require('../electron/cartography-gmt').labelSVG({width:100,height:80,labels:[],scaleLabel:{x:10,y:10,text:'50',fontSize:7.5}}).includes('>50</text>'));

const {buildLayout}=require('../electron/mtpy-annotations');
const generic=label('segment','未命名构造边界（线段 15）',250,220,{generic:true});
for(const hideGeneric of [true,false]){
 const background={box:{left:0,bottom:0,right:504,top:432},annotationLayout:{height:432,sourceLabels:[generic],hideGeneric}};
 const mtpy=buildLayout(background,{axis:[0,0,1,1]});
 assert.equal(mtpy.labels.length,hideGeneric?0:1);
}
