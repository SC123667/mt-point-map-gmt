// Controls belong to existing panels; persisted by the normal project/undo path.
const presentationFields={
 frameStyle:['frame','边框样式',{fancy:'黑白交替分段',plain:'普通细框'}],frameWidth:['frame','黑白边框宽度 / pt',.5,6,.25],framePen:['frame','边框描线 / pt',.1,2,.1],frameSegments:['mtParams','每边黑白分段数',2,40,2],
 fontFamily:['frame','绘图西文字体',{'Times New Roman':'Times New Roman',Arial:'Arial'}],fontSize:['frame','坐标与色标字号 / pt',5,16,.5],
 outputWidthMM:['mtParams','组图总宽 / mm',80,500,10],panelFontSize:['mtParams','周期与编号字号 / pt',5,18,.5],
 periodPosition:['mtParams','周期位置',{bottomLeft:'左下',topLeft:'左上',topRight:'右上',bottomRight:'右下'}],panelPosition:['mtParams','面板编号位置',{bottomRight:'右下',topLeft:'左上',topRight:'右上',bottomLeft:'左下',none:'隐藏'}],
 colorBy:['mtParams','椭圆着色量',{beta:'偏离角 β（°）',phimin:'最小相位 φmin（°）',phimax:'最大相位 φmax（°）',phi2:'Φ₂ 等效相位（°）'}],betaMin:['mtParams','β 色标下限 / °',-90,0,1],betaMax:['mtParams','β 色标上限 / °',0,90,1],betaStep:['mtParams','β 色标分段 / °',.1,90,.5],phaseMin:['mtParams','相位色标下限 / °',-90,90,5],phaseMax:['mtParams','相位色标上限 / °',0,180,5],phaseStep:['mtParams','相位色标刻度间隔 / °',1,90,5],ellipsePen:['mtParams','椭圆描边 / pt',0,2,.05],
 lineScale:['terrain','构造线宽倍率',.1,2,.1],fillScale:['terrain','地质面填色不透明度倍率',0,1,.1],labelFormat:['terrain','构造名称形式',{project:'沿用工程设置',abbreviation:'优先使用已有简称',name:'完整名称'}]
};
function initPresentationControls(){
 const p=window.MapPresentation.defaults;
 for(const [key,[panel,label,type,max,step]]of Object.entries(presentationFields)){
  const target=document.querySelector(`fieldset[data-settings-panel="${panel}"]`);if(!target)throw Error('Missing panel '+panel);
  const wrapper=document.createElement('label');wrapper.textContent=label;
  const input=document.createElement(typeof type==='object'?'select':'input');input.id='presentation-'+key;
  if(typeof type==='object')for(const [value,text]of Object.entries(type)){const o=document.createElement('option');o.value=value;o.textContent=text;input.append(o);}
  else{input.type='number';input.min=type;input.max=max;input.step=step;}
  input.value=p[key];wrapper.append(input);target.append(wrapper);
  input.addEventListener('change',()=>{syncPresentationControls();scheduleAutoPreview('绘图参数已修改');});
 }
 const note=document.createElement('p');note.className='field-note';note.textContent='Φ₂ = √det(Φ)，按 arctan(Φ₂) 的角度值着色；负行列式不着色，并在分析记录中注明。相位色标范围用于最小相位、最大相位和 Φ₂ 等效相位。修改后点击更新预览。';document.getElementById('presentation-colorBy').parentElement.after(note);
 syncPresentationControls();
}
function syncPresentationControls(){const mode=document.getElementById('presentation-colorBy')?.value;for(const prefix of ['beta','phase'])for(const suffix of ['Min','Max','Step']){const input=document.getElementById('presentation-'+prefix+suffix);if(input)input.parentElement.hidden=(prefix==='beta')!==(mode==='beta');}}
function readPresentation(){return window.MapPresentation.normalize(Object.fromEntries(Object.keys(presentationFields).map(k=>[k,document.getElementById('presentation-'+k)?.value])));}
function restorePresentation(value){const p=window.MapPresentation.normalize(value);for(const k of Object.keys(presentationFields)){const input=document.getElementById('presentation-'+k);if(input)input.value=p[k];}syncPresentationControls();}
