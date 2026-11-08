// Elevation remains in metres. Display units affect only the legend labels.
const defaults=Object.freeze({show:true,showStation:false,autoRange:true,align:'center',widthMM:45,heightMM:2.5,offsetXMM:0,offsetYMM:8,min:0,max:3500,step:500,unit:'m',fontSize:7});
function settings(value={}){
 const v=value||{},p={...defaults};for(const [k,lo,hi]of [['widthMM',15,150],['heightMM',1,10],['offsetXMM',-100,100],['offsetYMM',0,100],['min',-12000,10000],['max',-11000,12000],['step',1,20000],['fontSize',5,16]]){const n=Number(v[k]);if(v[k]!=null&&Number.isFinite(n))p[k]=Math.min(hi,Math.max(lo,n));}
 if(typeof v.showStation==='boolean')p.showStation=v.showStation;
 if(typeof v.show==='boolean')p.show=v.show;if(typeof v.autoRange==='boolean')p.autoRange=v.autoRange;if(['left','center','right'].includes(v.align))p.align=v.align;if(['m','km'].includes(v.unit))p.unit=v.unit;return p;
}
function elevationSummary(records=[],region=''){
 const bounds=String(region).split('/').map(Number),bounded=bounds.length===4&&bounds.every(Number.isFinite);
 let count=0,max=null;
 for(const r of records){
  if(r.elevation==null||String(r.elevation).trim()==='')continue;
  const z=Number(r.elevation),x=Number(r.lon),y=Number(r.lat);
  if(!Number.isFinite(z)||z===-9999||z < -12000||z > 12000)continue;
  if(bounded&&(!Number.isFinite(x)||!Number.isFinite(y)||x<bounds[0]||x>bounds[1]||y<bounds[2]||y>bounds[3]))continue;
  count++;max=max==null?z:Math.max(max,z);
 }
 return {count,max};
}
// Prefer about seven readable intervals, rounding the upper bound upwards.
function autoScale(value,observedMax){
 const p=settings(value);if(!p.autoRange||observedMax==null||!Number.isFinite(observedMax))return p;
 const target=Math.max(observedMax,p.min+1);let best=null;
 for(let exponent=0;exponent<=4;exponent++)for(const factor of [1,2,2.5,5]){
  const step=factor*10**exponent;if(!Number.isInteger(step)||step>20000)continue;
  const max=Math.ceil(target/step)*step;if(max>12000)continue;
  const count=(max-p.min)/step,score=Math.abs(count-7)+(max-target)/Math.max(target-p.min,1)*.5;
  if(!best||score<best.score)best={max,step,score};
 }
 return best?{...p,max:best.max,step:best.step}:p;
}
function validate(value){const p=settings(value);if(p.max<=p.min)throw Error('高程色标上限必须大于下限（范围单位为米）。');return p;}
function command(config,cpt,region,quote,prefix=''){
 const p=validate(config.terrainColorbar);
 const plotType=config.plotType||'stationMap';
 const visible=plotType==='baseMap'?p.show:plotType==='stationMap'&&p.showStation;
 if(!config.showTerrain||!visible)return '';
 const [major,minor]=String(require('./gmt').resolveGMT().version||'').split('.').map(Number);
 const anchor=p.align==='left'?'L':p.align==='right'?'R':'C';
 const fixedFont=major>6||(major===6&&minor>=5)?'-H':'';
 const unit=p.unit==='km'?.001:1,font=config.presentation?.fontFamily==='Arial'?'Helvetica':'Times-Roman';
 return `${prefix}gmt colorbar -C${cpt} -R${region} -J${config.projection} -DJB${anchor}+w${p.widthMM/10}c/${p.heightMM/10}c+h+jT${anchor}+o${p.offsetXMM/10}c/${p.offsetYMM/10}c+e -Bxa${p.step*unit}+l${quote('Elevation ('+p.unit+')')} -W${unit} -F+gwhite@10+c0.08c -Np ${fixedFont} --FONT_ANNOT_PRIMARY=${p.fontSize}p,${font},black --FONT_LABEL=${p.fontSize}p,${font},black --MAP_FRAME_PEN=0.4p,black --MAP_TICK_LENGTH_PRIMARY=0.06c --MAP_LABEL_OFFSET=0.06c`;
}
module.exports={defaults,settings,validate,command,elevationSummary,autoScale};
