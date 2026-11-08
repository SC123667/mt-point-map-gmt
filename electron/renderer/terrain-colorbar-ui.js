const terrainColorbarFields={align:['图下方对齐',{left:'左对齐',center:'居中',right:'右对齐'}],widthMM:['长度 / mm',15,150,.5],heightMM:['厚度 / mm',1,10,.5],offsetXMM:['水平偏移 / mm',-100,100,1],offsetYMM:['与地图的间距 / mm',0,100,1],min:['高程下限 / m',-12000,10000,100],max:['高程上限 / m',-11000,12000,100],step:['刻度间隔 / m',1,20000,100],unit:['显示单位',{m:'米（m）',km:'千米（km）'}],fontSize:['字号 / pt',5,16,.5]};
let terrainScaleResult=null;
function initTerrainColorbarControls(){
 const section=document.createElement('details');section.className='wb-section';section.open=true;const heading=document.createElement('summary');heading.textContent='高程色标';section.append(heading);
 const show=document.createElement('label');show.className='check';show.innerHTML='<input type="checkbox" id="terrainColorbar-show" checked />区域底图显示高程色标';section.append(show);
 const station=document.createElement('label');station.className='check';station.innerHTML='<input type="checkbox" id="terrainColorbar-showStation" />点位图显示高程色标';section.append(station);
 const auto=document.createElement('label');auto.className='check';auto.innerHTML='<input type="checkbox" id="terrainColorbar-autoRange" checked />按 EDI 测区自动设置上限与间隔';section.append(auto);
 const status=document.createElement('p');status.id='terrainColorbar-status';status.className='field-note';section.append(status);
 const grid=document.createElement('div');grid.className='form-grid';
 for(const [key,[label,type,max,step]]of Object.entries(terrainColorbarFields)){const wrapper=document.createElement('label');wrapper.textContent=label;const input=document.createElement(typeof type==='object'?'select':'input');input.id='terrainColorbar-'+key;if(typeof type==='object'){for(const [value,text]of Object.entries(type)){const o=document.createElement('option');o.value=value;o.textContent=text;input.append(o);}}else{input.type='number';input.min=type;input.max=max;input.step=step;}wrapper.append(input);grid.append(wrapper);}
 section.append(grid);const note=document.createElement('p');note.className='field-note';note.textContent='自动读取图幅内测点高程，并用测区地形峰值校核，向上取整为易读的整数。地形未准备时先按 EDI 估算；手动修改上限或间隔会关闭自动。区域底图和点位图可分别设置是否显示色标，色标位于图框下方。F 方案按刻度间隔分级，边界不代表地质界线；阴影明暗不代表高程。';section.append(note);
 const panel=document.querySelector('fieldset[data-settings-panel="terrain"]');panel.insertBefore(section,document.getElementById('terrainIntensityInput').closest('label').nextSibling);
 section.addEventListener('input',event=>{if(['terrainColorbar-max','terrainColorbar-step'].includes(event.target.id)){document.getElementById('terrainColorbar-autoRange').checked=false;terrainScaleResult=null;updateTerrainScaleStatus(null);}});
 section.addEventListener('change',event=>{if(['terrainColorbar-max','terrainColorbar-step'].includes(event.target.id))document.getElementById('terrainColorbar-autoRange').checked=false;if(['terrainColorbar-autoRange','terrainColorbar-min','terrainColorbar-max','terrainColorbar-step'].includes(event.target.id))terrainScaleResult=null;readTerrainColorbar();scheduleAutoPreview('高程色标已修改');});restoreTerrainColorbar();
}
function terrainScaleContext(min){
 const edi=window.TerrainColorbar.elevationSummary(state.allRecords,el.regionInput.value);
 return {edi,key:JSON.stringify([edi,el.regionInput.value,min,el.terrainResolutionInput.value,el.showTerrainInput.checked,state.terrain.localGridPath])};
}
function updateTerrainScaleStatus(result){
 const node=document.getElementById('terrainColorbar-status');
 if(!document.getElementById('terrainColorbar-autoRange').checked){node.textContent='使用手动上限与刻度间隔。';return;}
 if(!result||result.source==='fallback'){node.textContent='尚无有效高程，暂保留当前范围；准备地形或导入 EDI 后自动计算。';return;}
 node.textContent=(result.ediMax!=null?`测点最高 ${Math.round(result.ediMax)} m；`:'')+(result.terrainMax!=null?`测区地形最高 ${Math.ceil(result.terrainMax)} m；`:'')+`上限 ${result.settings.max} m，间隔 ${result.settings.step} m。`+(result.warning||'');
}
function readTerrainColorbar(){
 const v=Object.fromEntries(Object.keys(terrainColorbarFields).map(k=>[k,document.getElementById('terrainColorbar-'+k).value]));v.show=document.getElementById('terrainColorbar-show').checked;
 v.showStation=document.getElementById('terrainColorbar-showStation').checked;v.autoRange=document.getElementById('terrainColorbar-autoRange').checked;
 let p=window.TerrainColorbar.settings(v);
 if(p.autoRange){
  const {edi,key}=terrainScaleContext(p.min);
  const result=terrainScaleResult?.key===key?terrainScaleResult.result:{settings:window.TerrainColorbar.autoScale(p,edi.max),source:edi.count?'stations':'fallback',ediMax:edi.max,warning:'预览或导出时用测区地形峰值校核。'};
  p={...p,max:result.settings.max,step:result.settings.step};
  for(const k of ['max','step'])document.getElementById('terrainColorbar-'+k).value=p[k];
  updateTerrainScaleStatus(result);
 }else updateTerrainScaleStatus(null);
 return p;
}
function applyTerrainScale(result){
 if(!result?.settings.autoRange||!document.getElementById('terrainColorbar-autoRange').checked)return;
 terrainScaleResult={key:terrainScaleContext(result.settings.min).key,result};
 for(const k of ['max','step'])document.getElementById('terrainColorbar-'+k).value=result.settings[k];
 updateTerrainScaleStatus(result);
}
function restoreTerrainColorbar(value){const p=window.TerrainColorbar.settings(value);terrainScaleResult=null;for(const k of Object.keys(terrainColorbarFields)){document.getElementById('terrainColorbar-'+k).value=p[k];}document.getElementById('terrainColorbar-show').checked=p.show;
 document.getElementById('terrainColorbar-showStation').checked=p.showStation;document.getElementById('terrainColorbar-autoRange').checked=p.autoRange;updateTerrainScaleStatus(null);}
