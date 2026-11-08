const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const {PDFDocument}=require('pdf-lib');
const {composePDF}=require('../electron/mtpy-export'),{buildLayout,buildSharedLayout}=require('../electron/mtpy-annotations');
const {overlaps}=require('../electron/label-layout');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mtpy-readability-'));
 try{
  // Five equal frames: final frame center must match first row center, regardless of margins.
  for(const layout of ['compact','spaced'])for(const align of ['left','center','right']){
   const output=path.join(root,layout+'-'+align);fs.mkdirSync(output);
   const panels=[];
   for(let i=0;i<5;i++){const d=await PDFDocument.create();d.addPage([504,432]).drawText('Panel '+i);const f=path.join(output,i+'.pdf');fs.writeFileSync(f,await d.save());panels.push({period:i,files:{pdf:f},groupAxis:[.15,.12,.78,.78]});}
   const result={output,panels,columns:2,layout,panelGap:6,lastRowAlign:align};await composePDF(result);
   const [a,b,,,last]=result.panelPlacements;
   assert.equal(last.width,a.width);assert.equal(last.height,a.height);
   assert(Math.abs(last.x-(align==='left'?a.x:align==='right'?b.x:(a.x+b.x)/2))<1e-8);
  }
  // Labels move off actual symbol boxes; diagonal arrows can keep narrow obstacles.
  const style={fontSize:8,size:.15,dx:0,dy:0,position:'right',font:'Times New Roman',labelColor:'#333333',rotation:0,halo:false,symbol:'c'};
  const background={box:{left:0,right:400,bottom:0,top:400},annotationLayout:{width:400,height:400,labels:[],sourceLabels:[{id:'mine',name:'Mine A',point:true,x:180,y:200,candidates:[{x:180,y:200}],style}]}};
  const panel={axis:[.1,.1,.8,.8],obstacles:[{x:.45,y:.4,width:.25,height:.2}]};
  const placed=buildLayout(background,panel);assert.equal(placed.labels.length,1);assert(placed.labels[0].style.halo);assert(placed.leaders.length===1);
  assert(placed.obstacles.every(b=>!overlaps(placed.labels[0].placed.bounds,b)));
  background.annotationLayout.sourceLabels=[{id:'suture',name:'Named suture structure zone',line:true,x:180,y:200,candidates:[{x:180,y:200,angle:0,span:250}],style}];
  background.showScale=true;
  const line=buildLayout(background,panel);assert.equal(line.labels.length,1);assert(line.labels[0].originalName);assert(line.leaders.length===1);
  assert(line.obstacles.every(b=>!overlaps(line.labels[0].placed.bounds,b)));
  const panelsForLabels=[{...panel,period:1},{...panel,period:100,obstacles:[{x:.1,y:.3,width:.2,height:.3}]}];
  const shared=buildSharedLayout(background,panelsForLabels);
  assert.deepEqual(shared.sharedPeriods,[1,100]);assert.equal(shared.labels.length,1);
  assert(shared.obstacles.every(b=>!overlaps(shared.labels[0].placed.bounds,b)));
  assert.deepEqual(shared.labels,buildSharedLayout(background,[...panelsForLabels].reverse()).labels);
  assert.deepEqual(shared.leaders,buildSharedLayout(background,[...panelsForLabels].reverse()).leaders);
  assert.throws(()=>buildSharedLayout(background,[panel,{...panel,axis:[.1,.1,.7,.8]}]),/坐标框/);
  console.log('MTPY_READABILITY_OK: five-panel alignment; independent dimensions; label avoidance and leaders');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
