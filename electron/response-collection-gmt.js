const fs=require('fs'),path=require('path'),collection=require('./response-collection');
const PT=72/2.54;
function build(records,config,directory,formats,deps) {
 const problem=collection.issue(records,config);if(problem)throw Error(problem);
 const c=collection.normalize(config.curveCollection),stations=collection.selected(records,config),grid=collection.layout(stations.length,c);
 const reference=c.style==='reference',phaseRange=c.phaseMode==='signed'?'-200/200':'0/180';
 const dpi=Number(config.pngDpi)||300;
 if((grid.width*dpi/2.54)*(grid.height*dpi/2.54)>100e6)throw Error('组图按当前 DPI 超过 1 亿像素，请降低 PNG DPI、图格宽度或减少测点。');
 const curves=stations.map((station,i)=>deps.buildCurveFiles(station,directory,`curve_${i}_`,c));
 curves.forEach((v,i)=>{if(![v.xMin,v.xMax,v.rhoMin,v.rhoMax].every(Number.isFinite))throw Error(`测点 ${stations[i].name} 没有可绘制的正值电阻率。`);});
 const common={xMin:Math.min(...curves.map(v=>v.xMin)),xMax:Math.max(...curves.map(v=>v.xMax)),rhoMin:Math.min(...curves.map(v=>v.rhoMin)),rhoMax:Math.max(...curves.map(v=>v.rhoMax))};
 const shell=process.platform==='win32'?'bat':'sh',q=deps.quote,f=name=>q(shell==='bat'?name:path.join(directory,name));
 const env=deps.gmtEnvironmentLines(deps.resolveGMT(),shell,config,directory);
 for(const [key,val]of Object.entries(deps.gmtCacheEnv(directory,config)))env.push(shell==='bat'?`set "${key}=${val}"`:`export ${key}=${q(val)}`);
 const write=(name,text)=>{fs.writeFileSync(path.join(directory,name),text+'\n');return f(name);};
 const labels=[],commands=[];
 // Explicit white page establishes one predictable origin for all panels and
 // native bilingual text. No response series is rasterized or resampled.
 const page=write('curve_page.tsv',`0 0\n${grid.width} 0\n${grid.width} ${grid.height}\n0 ${grid.height}\n0 0`);
 commands.push(`gmt plot ${page} -R0/${grid.width}/0/${grid.height} -JX${grid.width}c/${grid.height}c -Xa0c -Ya0c -Gwhite -W0.01p,white`);
 const addLabel=(name,x,y,opts={})=>labels.push({name,x,y,fontSize:opts.fontSize||c.fontSize,bold:!!opts.bold,align:opts.align});
 const ticks=(name,min,max)=>{
  const list=[],stride=Math.max(1,Math.ceil((max-min)/(reference?8:4)));
  for(let e=Math.floor(min);e<=Math.ceil(max);e++)for(let m=1;m<=9;m++){
   const v=e+Math.log10(m);if(v<min-1e-8||v>max+1e-8)continue;
   const major=m===1&&e%stride===0;
   list.push(`${v.toFixed(8)} ${major?(c.showGrid?'ag':'a'):'f'}${major?` 10@+${e}@+`:''}`);
  }
  return write(name,list.join('\n'));
 };
 function drawSeries(index,metric,axis) {
  const curve=curves[index],metricCap=metric==='rho'?'Rho':'Phase';
  for(const [key,cap,symbol,componentColor]of [['xy','XY','s',reference?'#cf321b':'#b33d36'],['yx','YX','c',reference?'#00549b':'#276a9a']]){
   const color=c.mode==='overlay'?collection.COLORS[index]:componentColor;
   const dash=c.mode==='overlay'&&key==='yx'?',-':'';
   if(c.showErrors&&curve[`has${metricCap}${cap}Error`])commands.push(`gmt plot ${f(`curve_${index}_${metric}_${key}_err.tsv`)} ${axis} -W0.4p,${color}`);
   if(curve[`has${metricCap}${cap}`]){
    if(c.connect)commands.push(`gmt plot ${f(`curve_${index}_${metric}_${key}.tsv`)} ${axis} -W0.5p,${color}${dash}`);
    commands.push(`gmt plot ${f(`curve_${index}_${metric}_${key}.tsv`)} ${axis} -S${reference&&c.mode!=='overlay'?'c':symbol}${reference?'0.12':'0.11'}c -G${reference?color:'white'} -W${reference?'0.25':'0.7'}p,${color}`);
   }
  }
 }
 grid.cells.forEach((cell,i)=>{
  const range=c.mode==='overlay'||c.axisMode==='shared'?common:curves[i];
  const indices=c.mode==='overlay'?stations.map((_,j)=>j):[i];
  const xTicks=ticks(`curve_${i}_period_ticks.txt`,range.xMin,range.xMax),rTicks=ticks(`curve_${i}_rho_ticks.txt`,range.rhoMin,range.rhoMax);
  const showY=c.axisMode==='individual'||cell.col===0||c.mode==='overlay';
  commands.push(`gmt basemap -R${range.xMin}/${range.xMax}/${phaseRange} -JX${grid.plotWidth}c/${grid.phaseHeight}c -Bpxc${xTicks}+l${q('Period (s)')} -Bya${c.phaseMode==='signed'?90:45}f15${c.showGrid?(c.phaseMode==='signed'?'g45':'g45'):''}${showY?'+l'+q(reference?'Phase (@.)':'Phase (degree)'):''} -B${showY?'W':'w'}Sen -Xa${cell.x}c -Ya${cell.y}c`);
  indices.forEach(j=>drawSeries(j,'phase',`-R${range.xMin}/${range.xMax}/${phaseRange} -JX${grid.plotWidth}c/${grid.phaseHeight}c -Xa${cell.x}c -Ya${cell.y}c`));
  const topY=cell.y+grid.phaseHeight+grid.panelGap;
  commands.push(`gmt basemap -R${range.xMin}/${range.xMax}/${range.rhoMin}/${range.rhoMax} -JX${grid.plotWidth}c/${grid.rhoHeight}c -Bpxc${xTicks} -Bpyc${rTicks}${showY?'+l'+q(reference?'Res. (@~W@~ m)':'Apparent resistivity (@~W@~ m)'):''} -B${showY?'W':'w'}sen -Xa${cell.x}c -Ya${topY}c`);
  indices.forEach(j=>drawSeries(j,'rho',`-R${range.xMin}/${range.xMax}/${range.rhoMin}/${range.rhoMax} -JX${grid.plotWidth}c/${grid.rhoHeight}c -Xa${cell.x}c -Ya${topY}c`));
  const title=c.mode==='overlay'?'MT responses — overlay':(reference?stations[i].name:`(${i+1}) ${stations[i].name}`);
  // Wrap long or Chinese station names without shrinking every plot's lettering.
  const capacity=Math.max(10,Math.floor(grid.plotWidth*PT/(c.fontSize*.6)));
  const chunks=[];let row='',weight=0;
  for(const char of title){const step=char.charCodeAt(0)>255?1.7:1;if(weight+step>capacity){chunks.push(row);row='';weight=0;}row+=char;weight+=step;}if(row)chunks.push(row);
  const display=chunks.join('\n');
  if(reference){
   // Keep the station name and component key inside separate top corners.
   const y=topY+grid.rhoHeight-.32*c.fontSize/8;
   const titleWidth=grid.plotWidth-(c.showLegend&&c.mode!=='overlay'?1.9:0)-.25;
   addLabel(title,cell.x+.12,y,{align:'left',bold:true,fontSize:Math.min(c.fontSize+1,titleWidth*PT/Math.max(1,Array.from(title).reduce((n,ch)=>n+(ch.charCodeAt(0)>255?1:.6),0)))});
   if(c.showLegend&&c.mode!=='overlay')for(const [k,color,offset]of [['xy','#cf321b',1.6],['yx','#00549b',.75]]){
    if(!curves[i][k==='xy'?'hasRhoXY':'hasRhoYX']&&!curves[i][k==='xy'?'hasPhaseXY':'hasPhaseYX'])continue;
    const x=cell.x+grid.plotWidth-offset;
    const dot=write(`curve_key_${i}_${k}.tsv`,`${x} ${y}`);
    commands.push(`gmt plot ${dot} -R0/${grid.width}/0/${grid.height} -JX${grid.width}c/${grid.height}c -Xa0c -Ya0c -Sc0.12c -G${color} -W0.25p,${color}`);
    addLabel(k.toUpperCase(),x+.15,y,{align:'left'});
   }
  }else addLabel(display,cell.x+grid.plotWidth/2,topY+grid.rhoHeight+grid.header/2,{bold:true,fontSize:Math.min(c.fontSize+1,grid.header*PT/Math.max(1,chunks.length)/1.3)});
 });
 // Legend sample paths stay GMT vectors; names use editable native SVG text.
 if(c.showLegend&&!(reference&&c.mode!=='overlay')){
  const legendX=grid.left,totalWidth=grid.width-grid.left-.5;
  const symbol=(id,x,y,color,component)=>{
   const file=write(`curve_legend_${id}.tsv`,`${x} ${y}\n${x+.5} ${y}`);
   if(c.connect)commands.push(`gmt plot ${file} -R0/${grid.width}/0/${grid.height} -JX${grid.width}c/${grid.height}c -Xa0c -Ya0c -W0.6p,${color}${c.mode==='overlay'&&component==='yx'?',-':''}`);
   const mark=write(`curve_symbol_${id}.tsv`,`${x+.25} ${y}`);
   commands.push(`gmt plot ${mark} -R0/${grid.width}/0/${grid.height} -JX${grid.width}c/${grid.height}c -Xa0c -Ya0c -S${component==='xy'?'s':'c'}0.12c -G${reference?color:'white'} -W0.8p,${color}`);
  };
  if(c.mode==='panels'){
   for(const [i,k,text,color]of [[0,'xy','XY (Ex / Hy)','#b33d36'],[1,'yx','YX (Ey / Hx)','#276a9a']]){
    if(!curves.some(v=>v[k==='xy'?'hasRhoXY':'hasRhoYX']||v[k==='xy'?'hasPhaseXY':'hasPhaseYX']))continue;
    const x=legendX+i*totalWidth/2;symbol(k,x,.6,color,k);addLabel(text,x+.7,.6,{align:'left'});
   }
  }else{
   addLabel(c.connect?'Station color · XY square / solid · YX circle / dashed':'Station color · XY square / YX circle',legendX+totalWidth/2,grid.legendHeight-.2,{fontSize:c.fontSize});
   stations.forEach((r,i)=>{
    const y=grid.legendHeight-.8-i*.48*c.fontSize/8,x=legendX;
    if(curves[i].hasRhoXY||curves[i].hasPhaseXY)symbol(`${i}_xy`,x,y,collection.COLORS[i],'xy');
    if(curves[i].hasRhoYX||curves[i].hasPhaseYX)symbol(`${i}_yx`,x+.75,y,collection.COLORS[i],'yx');
    addLabel(`${i+1}. ${r.name}`,x+1.5,y,{align:'left',fontSize:Math.min(c.fontSize,(totalWidth-1.8)*PT/Math.max(1,Array.from(r.name).reduce((n,ch)=>n+(ch.charCodeAt(0)>255?1:.6),0)+3))});
   });
  }
 }
 fs.writeFileSync(path.join(directory,'curve_collection_labels.json'),JSON.stringify({labels,layout:grid,stations:stations.map(r=>({name:r.name,key:collection.stationKey(r)})),options:c},null,2));
 const title=String(config.title||'').trim();
 if(config.showTitle!==false&&title&&title!=='MT Survey Stations'&&/^[\x20-\x7e]*$/.test(title)){
  const file=write('curve_collection_title.txt',`${grid.width/2} ${grid.height-.1} ${title.replace(/@/g,'@@')}`);
  commands.push(`gmt text ${file} -R0/${grid.width}/0/${grid.height} -JX${grid.width}c/${grid.height}c -Xa0c -Ya0c -F+f${c.fontSize+1}p,Helvetica-Bold+jBC`);
 }
 const start=shell==='bat'?['@echo off','setlocal enabledelayedexpansion','cd /d "%~dp0"']:['#!/usr/bin/env bash','set -euo pipefail',`cd ${q(directory)}`];
 return [...start,...env,deps.gmtBeginCommand(config.outputName||'mt_response_collection',formats,config),
  `gmt set MAP_FRAME_TYPE plain FONT_LABEL ${c.fontSize}p,${reference?'Times-Roman':'Helvetica'} FONT_ANNOT_PRIMARY ${c.fontSize}p,${reference?'Times-Roman':'Helvetica'} MAP_GRID_PEN_PRIMARY ${reference?'0.35p,gray75,-':'0.18p,gray90'} MAP_FRAME_PEN 0.6p,gray25 MAP_TICK_LENGTH_PRIMARY=${reference?'-3p/-1.5p':'2p'} MAP_ANNOT_OFFSET_PRIMARY 3p MAP_LABEL_OFFSET 4p`,
  ...commands,'gmt end',''].join(shell==='bat'?'\r\n':'\n');
}
function annotate(layout,directory){
 const metadata=JSON.parse(fs.readFileSync(path.join(directory,'curve_collection_labels.json'),'utf8'));
 return {...layout,labels:metadata.labels.map(l=>{const x=layout.ox+l.x*PT,y=layout.height-layout.oy-l.y*PT;return {name:l.name,...(l.align==='left'?{x,y}:{placed:{x,y,angle:0}}),style:{fontSize:l.fontSize,font:metadata.options.style==='reference'?'Times New Roman':'Helvetica',bold:l.bold,labelColor:'#202020',halo:false,position:'right',size:0,rotation:0,dx:0,dy:0}};})};
}
module.exports={build,annotate};
