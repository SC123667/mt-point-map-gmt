const rcEl=id=>document.getElementById('rc-'+id);
function initResponseCollectionUI(){
 const panel=wbPanel('curveCollection','曲线组图与排版');
 panel.innerHTML+=`<label>显示模式<select id="rc-mode"><option value="single">单测点（兼容已有工程）</option><option value="panels">多测点 · 独立面板组图</option><option value="overlay">多测点 · 同轴叠加</option></select></label>
 <label>曲线样式<select id="rc-style"><option value="reference">参考图 · 红蓝实心点</option><option value="classic">原论文样式 · 空心符号</option></select></label>
 <button id="rc-reference" type="button">应用参考图样式与紧凑排版</button>
 <label>相位显示<select id="rc-phaseMode"><option value="signed">原始阻抗相位（−180°～180°）</option><option value="folded">折叠相位（0°～180°，旧显示）</option></select></label>
 <div class="cart-grid"><label class="check-row"><input id="rc-showErrors" type="checkbox">显示误差棒</label><label class="check-row"><input id="rc-connect" type="checkbox">连接数据点</label></div>
 <p class="field-note">参考样式保留原始阻抗相位，YX 通常位于负半轴；不改 EDI 数值、不平滑。单测点原样式沿用原显示设置。</p>
 <div id="rc-options">
 <p class="wb-intro">每格包含一个测点的视电阻率和相位。已选列表的顺序就是绘图顺序，可拖动或用 ↑ / ↓ 调整。</p>
 <div class="cart-grid"><label>排列方式<select id="rc-layout"><option value="rows">按每行数量</option><option value="columns">按每列数量</option><option value="horizontal">全部横排</option><option value="vertical">全部竖排</option></select></label><label>每行 / 每列测点数<input id="rc-count" type="number" min="1" max="20" step="1" value="2"></label></div>
 <div class="cart-grid"><label>坐标范围<select id="rc-axisMode"><option value="shared">所有测点统一范围</option><option value="individual">各测点自动适配</option></select></label><label>每格图框宽度（cm）<input id="rc-cellWidth" type="number" min="5" max="20" step=".5" value="7"></label></div>
 <div class="cart-grid"><label>列间距（cm，8 pt 字号时）<input id="rc-gapX" type="number" min=".3" max="8" step=".1" value="1.8"></label><label>行间距（cm，8 pt 字号时）<input id="rc-gapY" type="number" min=".8" max="8" step=".1" value="1.2"></label></div>
 <label>字号（pt）<input id="rc-fontSize" type="number" min="6" max="14" step=".5" value="8"></label>
 <div class="cart-grid"><label class="check-row"><input id="rc-showLegend" type="checkbox" checked>显示分量图例</label><label class="check-row"><input id="rc-showGrid" type="checkbox">网格</label></div>
 <p id="rc-summary" class="wb-intro" aria-live="polite"></p>
 <label>查找可选测点<input id="rc-search" type="search" placeholder="输入测点名称"></label>
 <div class="button-row"><button id="rc-all" type="button">选择全部匹配测点</button><button id="rc-clear" type="button">清空选择</button></div>
 <div id="rc-available" class="rc-list" aria-label="可选测点"></div>
 <p class="field-note">已选测点及绘图顺序</p><ol id="rc-selected" class="rc-list" aria-label="组图测点顺序"></ol>
 </div>
 <button id="rc-preview" type="button" class="primary">绘制当前曲线</button>
 <div class="button-row"><button id="rc-ai" type="button">导出 AI（.ai）</button><button id="rc-package" type="button">AI 编辑包</button></div>
 <p class="wb-export-note">整张组图/叠加图一起导出；曲线、误差棒、符号、坐标轴及名称保留矢量。直接 AI 需 Illustrator。叠加模式：颜色区分测点，XY 方块、YX 圆点；开启连线后用实线/虚线区分分量，最多 20 站；独立面板最多 100 站。设置随工程保存。</p>`;
 const apply=()=>{
  const c=window.ResponseCollection.normalize({...state.curveCollection,...Object.fromEntries(['mode','style','phaseMode','layout','count','axisMode','cellWidth','gapX','gapY','fontSize'].map(k=>[k,rcEl(k).value])),showLegend:rcEl('showLegend').checked,showGrid:rcEl('showGrid').checked,showErrors:rcEl('showErrors').checked,connect:rcEl('connect').checked});
  if(c.mode==='single'&&c.style==='classic'){c.phaseMode='folded';c.connect=true;c.showErrors=true;}
  if(c.mode!=='single'&&c.keys===null)c.keys=window.ResponseCollection.eligible(state.records).map(window.ResponseCollection.stationKey);
  state.curveCollection=c;renderResponseCollection();scheduleAutoPreview('曲线组图设置已更新…');
 };
 for(const k of ['mode','style','phaseMode','layout','count','axisMode','cellWidth','gapX','gapY','fontSize','showLegend','showGrid','showErrors','connect'])rcEl(k).onchange=apply;
 rcEl('reference').onclick=()=>{state.curveCollection=window.ResponseCollection.normalize({...state.curveCollection,style:'reference',phaseMode:'signed',showErrors:true,connect:false,showLegend:true,showGrid:true,gapX:.4,gapY:.8,fontSize:8});responseCollectionChanged();};
 rcEl('search').oninput=renderResponseCollectionLists;
 rcEl('all').onclick=()=>{state.curveCollection.keys=[...new Set([...responseKeys(),...responseAvailable().map(window.ResponseCollection.stationKey)])];responseCollectionChanged();};
 rcEl('clear').onclick=()=>{state.curveCollection.keys=[];responseCollectionChanged();};
 rcEl('preview').onclick=()=>{setPlotType('responseCurve');scheduleAutoPreview('正在绘制响应曲线组图…',{delay:80});};
 rcEl('ai').onclick=()=>{setPlotType('responseCurve');exportMap(['ai'],true);};
 rcEl('package').onclick=()=>{setPlotType('responseCurve');exportMap(['pdf'],true,{illustrator:true});};
 document.getElementById('canvasCurveLayout').onclick=()=>openSettingsPanel('curveCollection');
 document.getElementById('curveCollectionOpenBtn').onclick=()=>openSettingsPanel('curveCollection');
 renderResponseCollection();
}
function responseAvailable(){const term=rcEl('search')?.value.trim().toLowerCase()||'';return window.ResponseCollection.eligible(state.records).filter(r=>r.name.toLowerCase().includes(term));}
function responseKeys(){return state.curveCollection.keys??window.ResponseCollection.eligible(state.records).map(window.ResponseCollection.stationKey);}
function responseCollectionChanged(){renderResponseCollection();scheduleAutoPreview('组图测点或顺序已更改…');}
function moveResponseStation(from,to){const keys=[...responseKeys()];if(from<0||to<0||from>=keys.length||to>=keys.length||from===to)return;keys.splice(to,0,keys.splice(from,1)[0]);state.curveCollection.keys=keys;responseCollectionChanged();}
function renderResponseCollection(){
 if(!rcEl('mode'))return;const c=window.ResponseCollection.normalize(state.curveCollection);state.curveCollection=c;
 for(const k of ['mode','style','phaseMode','layout','count','axisMode','cellWidth','gapX','gapY','fontSize'])rcEl(k).value=c[k];
 for(const k of ['showLegend','showGrid','showErrors','connect'])rcEl(k).checked=c[k];
 rcEl('options').hidden=c.mode==='single';
 for(const k of ['phaseMode','showErrors','connect'])rcEl(k).disabled=c.mode==='single'&&c.style==='classic';
 for(const k of ['layout','count','axisMode','gapX','gapY'])rcEl(k).disabled=c.mode==='overlay';
 rcEl('count').disabled=c.mode==='overlay'||['horizontal','vertical'].includes(c.layout);
 const count=window.ResponseCollection.selected(state.records,{curveCollection:c}).length,g=window.ResponseCollection.layout(Math.max(1,count),c);
 rcEl('summary').textContent=`已选 ${count} 站 · ${c.mode==='overlay'?'共用一组坐标轴':`${g.rows} 行 × ${g.cols} 列`} · 约 ${g.width.toFixed(1)} × ${g.height.toFixed(1)} cm（不含总标题）${c.mode==='overlay'?'；图框宽度至少 12 cm':''}`;
 renderResponseCollectionLists();renderCurveContext();
}
function renderResponseCollectionLists(){
 if(!rcEl('available'))return;const selected=new Set(responseKeys());
 rcEl('available').replaceChildren();
 const available=responseAvailable();
 for(const r of available.slice(0,200)){
  const key=window.ResponseCollection.stationKey(r),label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=selected.has(key);
  label.className='rc-station';label.append(box,document.createTextNode(`${r.name} (${Number(r.lon).toFixed(3)}, ${Number(r.lat).toFixed(3)})`));
  box.onchange=()=>{const keys=responseKeys();state.curveCollection.keys=box.checked?[...keys,key]:keys.filter(k=>k!==key);responseCollectionChanged();};rcEl('available').append(label);
 }
 if(available.length>200){const note=document.createElement('p');note.textContent=`显示前 200 个，搜索可定位其余测点；全选会选择全部 ${available.length} 个匹配项。`;rcEl('available').append(note);}
 rcEl('selected').replaceChildren();const all=new Map(window.ResponseCollection.eligible(state.records).map(r=>[window.ResponseCollection.stationKey(r),r]));
 responseKeys().forEach((key,i)=>{
  const r=all.get(key),li=document.createElement('li');li.draggable=true;li.dataset.index=i;li.className='rc-station';
  const text=document.createElement('span');text.textContent=`${i+1}. ${r?.name||'测点不在当前数据中，请移除'}`;li.append(text);
  for(const [label,delta]of [['↑',-1],['↓',1]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.title=delta<0?'上移':'下移';b.disabled=i+delta<0||i+delta>=responseKeys().length;b.onclick=()=>moveResponseStation(i,i+delta);li.append(b);}
  const remove=document.createElement('button');remove.type='button';remove.textContent='移除';remove.onclick=()=>{state.curveCollection.keys=responseKeys().filter(k=>k!==key);responseCollectionChanged();};li.append(remove);
  li.ondragstart=e=>{e.dataTransfer.setData('text/mt-curve-index',String(i));e.dataTransfer.effectAllowed='move';};
  li.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move';};li.ondrop=e=>{e.preventDefault();const value=e.dataTransfer.getData('text/mt-curve-index');if(value!=='')moveResponseStation(Number(value),i);};rcEl('selected').append(li);
 });
}
