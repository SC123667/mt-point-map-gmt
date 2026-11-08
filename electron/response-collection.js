// Presentation and selection only. Original EDI records and MT calculations stay untouched.
const MODES = ['single', 'panels', 'overlay'];
const COLORS = ['#0072b2','#d55e00','#009e73','#cc79a7','#6a3d9a','#a6761d','#222222','#e69f00','#56b4e9','#e7298a','#1b7837','#b2182b','#4575b4','#8c510a','#01665e','#762a83','#666666','#5e4fa2','#a6a000','#00838f'];
function stationKey(record) { return JSON.stringify([String(record.name || ''), record.lon ?? null, record.lat ?? null, record.sourcePath || record.sourceFile || '']); }
function eligible(records) { return records.filter(r => r.mtResponses?.some(v => Number.isFinite(v.period) && v.period > 0 && ['xy','yx'].some(k => Number.isFinite(v.z?.[k]?.re) && Number.isFinite(v.z?.[k]?.im)))); }
function bounded(value, fallback, min, max) { const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback; }
function normalize(value = {}) {
 const reference=value.style==='reference';
 return {style:reference?'reference':'classic',phaseMode:value.phaseMode==='signed'||(!value.phaseMode&&reference)?'signed':'folded',showErrors:value.showErrors!==false,connect:typeof value.connect==='boolean'?value.connect:!reference,mode:MODES.includes(value.mode)?value.mode:'single', keys:Array.isArray(value.keys)?[...new Set(value.keys.filter(k=>typeof k==='string'))]:null,
  layout:['horizontal','vertical','rows','columns'].includes(value.layout)?value.layout:'rows', count:Math.round(bounded(value.count,2,1,20)),
  axisMode:value.axisMode==='individual'?'individual':'shared', cellWidth:bounded(value.cellWidth,7,5,20),
  gapX:bounded(value.gapX,1.8,.3,8),gapY:bounded(value.gapY,1.2,.8,8),fontSize:bounded(value.fontSize,8,6,14),
  showLegend:value.showLegend!==false, showGrid:value.showGrid===true};
}
function selected(records, config={}) {
 const available=eligible(records), c=normalize(config.curveCollection);
 if(c.mode==='single')return [available.find(r=>r.name===config.curveStation)||available[0]].filter(Boolean);
 if(c.keys===null)return available;
 const byKey=new Map(available.map(r=>[stationKey(r),r]));return c.keys.map(k=>byKey.get(k)).filter(Boolean);
}
function issue(records, config) {
 const c=normalize(config.curveCollection);if(c.mode==='single')return '';
 const rows=selected(records,config);
 if(!rows.length)return '请在“曲线组图与排版”中选择至少一个有 ZXY/ZYX 响应的测点。';
 if(c.keys?.some(k=>!eligible(records).some(r=>stationKey(r)===k)))return '部分已选测点不在当前数据/筛选结果中，请重新选择组图测点。';
 if(rows.length>(c.mode==='overlay'?20:100))return c.mode==='overlay'?'同轴叠加最多 20 个测点，请减少选择以便区分曲线。':'单张组图最多 100 个测点，请分组导出。';
 const grid=layout(rows.length,c);
 if(grid.width>200||grid.height>200)return '当前排版超过 200 cm，请减少每行/列数量或测点数。';
 return '';
}
function layout(n, value) {
 const c=normalize(value);let cols=1,rows=1;
 if(c.mode!=='overlay'){
  if(c.layout==='horizontal')cols=n;
  else if(c.layout==='vertical')rows=n;
  else if(c.layout==='columns'){rows=Math.min(c.count,n);cols=Math.ceil(n/rows);}
  else {cols=Math.min(c.count,n);rows=Math.ceil(n/cols);}
 }
 const fontScale=c.fontSize/8, width=c.mode==='overlay'?Math.max(12,c.cellWidth):c.cellWidth;
 const reference=c.style==='reference';
 const rhoHeight=width*(reference?.65:.44), phaseHeight=width*(reference?.35:.32), panelGap=(reference?.38:.65)*fontScale, header=(reference?.12:.8)*fontScale;
 const cellHeight=rhoHeight+phaseHeight+panelGap+header, gapX=c.gapX*fontScale, gapY=c.gapY*fontScale;
 const legendHeight=c.showLegend&&!(reference&&c.mode!=='overlay')?(c.mode==='overlay'?(n+1)*.48*fontScale+.5:.9*fontScale):0;
 const left=1.8*fontScale,bottom=1.2*fontScale+legendHeight;
 const cells=Array.from({length:c.mode==='overlay'?1:n},(_,i)=>{
  const row=c.layout==='columns'?i%rows:Math.floor(i/cols),col=c.layout==='columns'?Math.floor(i/rows):i%cols;
  return {x:left+col*(width+gapX),y:bottom+(rows-1-row)*(cellHeight+gapY),row,col};
 });
 return {cells,cols,rows,plotWidth:width,rhoHeight,phaseHeight,panelGap,header,legendHeight,left,bottom,
  width:left+cols*width+(cols-1)*gapX+.5*fontScale,height:bottom+rows*cellHeight+(rows-1)*gapY+.25*fontScale};
}
function describe(records,config) {const c=normalize(config.curveCollection),rs=selected(records,config);if(c.mode==='single')return config.curveStation||'未选择测点';return `${c.mode==='panels'?'组图':'叠加'} ${rs.length} 站 · ${rs.map(r=>r.name).join(' / ')}`;}
module.exports={normalize,stationKey,eligible,selected,layout,issue,describe,COLORS};
