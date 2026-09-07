// Shares the workbench's state and dialog host. Data parsing runs through IPC.
const cartUI={selected:'',results:[],sources:[],busy:false,serviceVersion:'2.0.0'};
const ce=id=>document.getElementById('cart-'+id);
const ch=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cartDefault={color:'#62494a',width:.8,dash:'solid',fill:'#cfb8ab',opacity:35,symbol:'c',size:.14,showLabel:true,labelColor:'#263238',font:'sans-serif',fontSize:9,halo:true,position:'right',dx:2,dy:0,rotation:0,labelMode:'name'};
function initCartography(){
 const storage=document.createElement('div');storage.hidden=true;storage.innerHTML=`
 <fieldset data-settings-panel="cartography" class="cart-panel"><legend>地点与构造 · 我的图层</legend>
  <div class="cart-actions"><button id="cart-new">新增对象</button><button id="cart-import">导入矢量 / 地点表</button><button id="cart-export">导出图层 GeoJSON</button></div>
  <p id="cart-summary" class="hint">尚未添加图层。可以输入坐标，也可以查询数据源。</p>
  <div class="cart-grid"><label>选择对象<select id="cart-selected"></select></label><label class="checkbox-row"><input id="cart-visible" type="checkbox" checked>显示这个对象</label></div>
  <div class="cart-actions"><button id="cart-previous">上一个</button><button id="cart-next">下一个</button><button id="cart-delete" class="danger">移除当前对象</button></div>
  <div class="cart-grid"><label>名称<input id="cart-name" placeholder="拉萨 / 雅鲁藏布缝合带"></label><label>类别<input id="cart-category" list="cart-categories" value="地点"><datalist id="cart-categories"></datalist></label>
  <label>形状<select id="cart-type"><option value="Point">点 · 城市、位置</option><option value="LineString">线 · 断层、缝合带</option><option value="Polygon">面 · 研究区、构造单元</option><option value="GeoJSON">复合几何 · GeoJSON</option></select></label><label>简称<input id="cart-abbreviation" placeholder="例如 IYZS"></label></div>
  <label>坐标（每行：经度 纬度；经度在前）<textarea id="cart-coordinates" rows="4" spellcheck="false" placeholder="91.13 29.65"></textarea></label>
  <p class="hint">线至少 2 个坐标；区域至少 3 个，自动闭合。坐标采用 WGS84 十进制度。</p>
  <details><summary>批量添加地点（可直接粘贴 Excel）</summary><label>每行：名称、经度、纬度、类别（可选）<textarea id="cart-paste" rows="4" placeholder="拉萨&#9;91.13&#9;29.65&#9;城市"></textarea></label><button id="cart-paste-add">添加这些地点</button></details>
  <details open><summary>符号与名称样式</summary><div class="cart-grid" id="cart-styles"></div></details>
  <details><summary>精细标注位置与数据来源</summary><div class="cart-grid"><label>标注锚点经度<input id="cart-anchor-lon" type="number" step="any" placeholder="自动定位"></label><label>标注锚点纬度<input id="cart-anchor-lat" type="number" step="any" placeholder="自动定位"></label></div><label>自定义标注文字（可换行）<textarea id="cart-label" rows="2"></textarea></label><pre id="cart-source-details" class="cart-source-details"></pre></details>
  <div class="cart-actions"><button id="cart-save" class="primary">保存对象</button><button id="cart-category-style">将此样式应用到同类全部对象</button></div><p id="cart-edit-status" class="hint" role="status"></p>
 </fieldset>
 <fieldset data-settings-panel="geodata" class="cart-panel"><legend>地点与构造 · 查询数据</legend>
  <label>数据来源<select id="cart-source"><option value="places">GeoNames · 离线城市库</option></select></label><p id="cart-source-info" class="hint"></p>
  <div class="cart-actions"><button id="cart-homepage">查看来源官网</button><button id="cart-source-import">导入已下载数据</button></div>
  <div id="cart-service" hidden><label>WFS 服务 / GeoJSON 地址<input id="cart-url" type="url" placeholder="https://…/geoserver/wfs"></label><div class="cart-actions"><button id="cart-capabilities">查询 WFS 图层</button><label class="checkbox-row"><input id="cart-direct" type="checkbox">地址直接返回 GeoJSON</label></div><label>服务图层<select id="cart-type-name"></select></label></div>
  <div class="cart-grid"><label>名称关键词<input id="cart-query" placeholder="例如 拉萨、雅鲁藏布、Bangong"></label><label class="checkbox-row"><input id="cart-region-only" type="checkbox" checked>仅当前经纬度范围</label></div>
  <div class="cart-actions"><button id="cart-search" class="primary">查询 / 加载</button><button id="cart-refresh">更新本地数据</button><button id="cart-cancel">取消任务</button></div>
  <p id="cart-search-status" class="hint" role="status">公开矢量数据首次下载后缓存；可离线重复查询。官网申请类来源需取得文件后导入。</p>
  <div class="cart-actions"><button id="cart-select-all">全选结果</button><button id="cart-add-results">添加选中到地图</button></div><div id="cart-results" class="cart-results"></div>
 </fieldset>
 <fieldset data-settings-panel="contours" class="cart-panel"><legend>地形等高线</legend>
  <label class="checkbox-row"><input id="cart-contour-show" type="checkbox">绘制等高线（可独立于地形晕渲显示）</label>
  <div class="cart-grid"><label>等高距（米）<input id="cart-contour-interval" type="number" value="500" min="1"></label><label>主等高距（米，0 为普通线）<input id="cart-contour-major" type="number" value="2000" min="0"></label><label>普通线宽（pt）<input id="cart-contour-width" type="number" value="0.25" min="0.05" step="0.05"></label><label>主等高线宽（pt）<input id="cart-contour-majorWidth" type="number" value="0.65" min="0.05" step="0.05"></label><label>线条与数字颜色<input id="cart-contour-color" type="color" value="#666666"></label><label>高程字号（pt）<input id="cart-contour-fontSize" type="number" value="8" min="4" max="30"></label><label>过滤短线长度（图上 cm）<input id="cart-contour-minLength" type="number" value="0.4" min="0" step="0.1"></label><label>高程数字最小间隔（cm）<input id="cart-contour-labelSpacing" type="number" value="1.2" min="0.1" step="0.1"></label><label class="checkbox-row"><input id="cart-contour-labels" type="checkbox" checked>显示主等高线高程数字</label></div>
  <p class="hint">使用“地形底图”中选择的高程数据、分辨率及本地 GRD。预览采用较轻的网格，导出按所选分辨率计算；大区域建议采用 500–1000 米等高距，避免图面拥挤。</p>
 </fieldset>`;document.body.append(storage);
 const fields=[['color','线条 / 边框颜色','color'],['width','线宽（pt）','number'],['dash','线型',{solid:'实线',dash:'虚线',dot:'点线'}],['fill','符号 / 区域填色','color'],['opacity','区域不透明度（%）','number'],['symbol','点符号',{c:'圆',s:'方形',t:'三角',d:'菱形',a:'星形',none:'仅文字'}],['size','符号大小（cm）','number'],['showLabel','显示名称','checkbox'],['labelMode','名称形式',{name:'完整名称',abbreviation:'简称',custom:'自定义文字'}],['labelColor','文字颜色','color'],['font','字体',{'sans-serif':'默认黑体','serif':'默认衬线','PingFang SC':'苹方','Microsoft YaHei':'微软雅黑','SimSun':'宋体','Arial':'Arial','Times New Roman':'Times New Roman'}],['fontSize','字号（pt）','number'],['halo','文字白色描边','checkbox'],['position','文字位置',{right:'右侧',left:'左侧',above:'上方',below:'下方',center:'居中'}],['dx','向右偏移（mm）','number'],['dy','向上偏移（mm）','number'],['rotation','逆时针旋转（度）','number']];
 ce('styles').innerHTML=fields.map(([k,n,t])=>`<label ${t==='checkbox'?'class="checkbox-row"':''}>${t==='checkbox'?`<input id="cart-style-${k}" type="checkbox">${n}`:n+(typeof t==='object'?`<select id="cart-style-${k}">${Object.entries(t).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select>`:`<input id="cart-style-${k}" type="${t}" ${t==='number'?'step="any"':''}>`)}</label>`).join('');
 const on=(id,fn,event='click')=>ce(id).addEventListener(event,fn);
 on('new',()=>selectCartFeature(''));on('selected',()=>selectCartFeature(ce('selected').value),'change');
 on('previous',()=>cartNavigate(-1));on('next',()=>cartNavigate(1));
 on('save',()=>saveCartFeature(false));on('category-style',()=>saveCartFeature(true));on('paste-add',async()=>{const r=await cartTask({mode:'paste',text:ce('paste').value,type:'Point'});if(r){addCartFeatures(r.features);ce('paste').value='';}});
 on('delete',()=>{state.cartography.features=state.cartography.features.filter(f=>f.id!==cartUI.selected);cartUI.selected='';renderCartography();cartChanged();});
 on('visible',()=>{const f=state.cartography.features.find(f=>f.id===cartUI.selected);if(f){f.visible=ce('visible').checked;cartChanged();}},'change');
 on('import',importCartData);on('source-import',importCartData);on('export',async()=>{const r=await window.mtApp.geodata({mode:'export',cartography:state.cartography,region:readConfig().region});ce('edit-status').textContent=`已保存：${r.file}`;});
 on('source',renderCartSource,'change');on('homepage',()=>{const s=cartUI.sources.find(s=>s.id===ce('source').value);if(s?.homepage)window.mtApp.openExternal(s.homepage);});
 on('search',()=>searchCartData());on('refresh',()=>searchCartData(true));on('cancel',()=>window.mtApp.cancelGeodata());
 on('query',e=>{if(e.key==='Enter')searchCartData();},'keydown');
 on('capabilities',async()=>{const r=await cartTask({mode:'capabilities',url:ce('url').value});if(r){cartUI.serviceVersion=r.version;ce('type-name').innerHTML=r.layers.map(l=>`<option value="${ch(l.name)}">${ch(l.title)}</option>`).join('');ce('search-status').textContent=`已找到 ${r.layers.length} 个 WFS 图层。`;}});
 on('select-all',()=>ce('results').querySelectorAll('input').forEach(x=>x.checked=true));
 on('add-results',()=>{const indices=[...ce('results').querySelectorAll('input:checked')].map(x=>Number(x.value));addCartFeatures(indices.map(i=>cartUI.results[i]));ce('search-status').textContent=`已添加 ${indices.length} 项；到“地点与构造”调整名称和样式。`;});
 for(const k of ['show','interval','major','width','majorWidth','color','fontSize','minLength','labelSpacing','labels'])on('contour-'+k,()=>{state.cartography.contours=readCartContours();cartChanged();},'change');
 window.mtApp.onGeodataProgress(p=>ce('search-status').textContent=p.message);
 document.querySelector('[data-settings-panel=cartography].cart-panel').addEventListener('input',e=>{if(!['cart-selected','cart-paste'].includes(e.target.id))cartUI.dirty=true;});
 renderCartography();window.mtApp.geodata({mode:'catalog'}).then(s=>{cartUI.sources=s;ce('source').innerHTML += s.map(x=>`<option value="${ch(x.id)}">${ch(x.name)}${x.access==='portal'?' · 官网获取':''}</option>`).join('');renderCartSource();}).catch(()=>{});
}
function readCartContours(){return Object.fromEntries(['show','interval','major','width','majorWidth','color','fontSize','minLength','labelSpacing','labels'].map(k=>[k,ce('contour-'+k).type==='checkbox'?ce('contour-'+k).checked:k==='color'?ce('contour-'+k).value:Number(ce('contour-'+k).value)]));}
function renderCartography(){if(!ce('selected'))return;const c=state.cartography;ce('summary').textContent=`${c.features.length} 个对象 · ${c.features.filter(f=>f.visible).length} 个显示；内容随工程保存。`;
 ce('selected').innerHTML='<option value="">新对象</option>'+c.features.map(f=>`<option value="${ch(f.id)}">${ch(f.name)} · ${ch(f.category)}${f.visible?'':'（隐藏）'}</option>`).join('');
 ce('categories').innerHTML=[...new Set(c.features.map(f=>f.category))].map(x=>`<option value="${ch(x)}">`).join('');
 selectCartFeature(cartUI.selected);for(const [k,v]of Object.entries({show:false,interval:500,major:2000,width:.25,majorWidth:.65,color:'#666666',fontSize:8,minLength:.4,labelSpacing:1.2,labels:true,...c.contours})){const el=ce('contour-'+k);if(el)el.type==='checkbox'?el.checked=v:el.value=v;}}
function selectCartFeature(id){cartUI.dirty=false;const f=state.cartography.features.find(x=>x.id===id);cartUI.selected=f?.id||'';ce('selected').value=cartUI.selected;ce('name').value=f?.name||'';ce('category').value=f?.category||'地点';ce('abbreviation').value=f?.abbreviation||'';ce('label').value=f?.label||'';ce('visible').checked=f?.visible!==false;ce('anchor-lon').value=f?.labelAnchor?.[0]??'';ce('anchor-lat').value=f?.labelAnchor?.[1]??'';
 const g=f?.geometry;ce('type').value=!g?'Point':['Point','LineString','Polygon'].includes(g.type)&&!(g.type==='Polygon'&&g.coordinates.length>1)?g.type:'GeoJSON';
 ce('coordinates').value=!g?'':ce('type').value==='GeoJSON'?JSON.stringify(g,null,2):(g.type==='Point'?[g.coordinates]:g.type==='Polygon'?g.coordinates[0]:g.coordinates).map(p=>p.join('\t')).join('\n');
 const s={...cartDefault,...state.cartography.categoryStyles[f?.category],...f?.style};for(const [k,v]of Object.entries(s)){const x=ce('style-'+k);if(x)x.type==='checkbox'?x.checked=v:x.value=v;}
 ce('source-details').textContent=f?.source?.id?JSON.stringify(f.source,null,2):'手动添加；可填写名称、类别和坐标。';}
function cartNavigate(d){const a=state.cartography.features;if(!a.length)return;let i=a.findIndex(f=>f.id===cartUI.selected);selectCartFeature(a[(i+d+a.length)%a.length].id);}
async function saveCartFeature(categoryStyle=false){try{
 const name=ce('name').value.trim();if(!name)throw new Error('请输入对象名称。');const old=state.cartography.features.find(f=>f.id===cartUI.selected),type=ce('type').value;let g;
 if(type==='GeoJSON')g=JSON.parse(ce('coordinates').value);else {const rows=ce('coordinates').value.trim().split(/\r?\n/).map(l=>l.trim().split(/[\s,，]+/).map(Number));g={type,coordinates:type==='Point'?rows[0]:type==='Polygon'?[rows]:rows};if(type==='Point'&&rows.length!==1)throw new Error('多个地点请使用“批量添加地点”。');}
 const s=Object.fromEntries(Object.keys(cartDefault).map(k=>{const x=ce('style-'+k);return [k,x.type==='checkbox'?x.checked:x.type==='number'?Number(x.value):x.value];}));
 const f={...old,id:old?.id||'manual-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),name,category:ce('category').value.trim()||'地点',abbreviation:ce('abbreviation').value,label:ce('label').value,visible:ce('visible').checked,geometry:g,style:s,labelAnchor:ce('anchor-lon').value!==''&&ce('anchor-lat').value!==''?[Number(ce('anchor-lon').value),Number(ce('anchor-lat').value)]:null};
 const validated=await cartTask({mode:'normalize',cartography:{features:[f]}});if(!validated)return false;
 if(old)state.cartography.features.splice(state.cartography.features.indexOf(old),1,validated.features[0]);else state.cartography.features.push(validated.features[0]);
 if(categoryStyle){state.cartography.categoryStyles[f.category]=s;for(const item of state.cartography.features)if(item.category===f.category)item.style={};}
 cartUI.selected=f.id;renderCartography();ce('edit-status').textContent=categoryStyle?'已保存，并统一同类别样式。':'对象已保存；确认后更新预览。';cartChanged();cartUI.dirty=false;return true;
 }catch(e){ce('edit-status').textContent=e.message;return false;}}
function cartChanged(){if(!state.records.length&&state.cartography.features.length&&state.plotType==='stationMap'&&!regionIssue())setPlotType('baseMap');state.preview.revision++;if(!el.settingsDialog.open)scheduleAutoPreview('图层已更新，正在生成预览…');}
function addCartFeatures(features){const ids=new Set(state.cartography.features.map(f=>f.id));for(const f of features)if(!ids.has(f.id)){state.cartography.features.push(f);ids.add(f.id);}if(features.length)cartUI.selected=features[0].id;renderCartography();cartChanged();}
async function cartTask(p){if(cartUI.busy)return null;cartUI.busy=true;for(const id of ['search','refresh','capabilities','import','source-import','save','paste-add'])ce(id).disabled=true;ce('search-status').textContent='正在后台处理…';try{return await window.mtApp.geodata(p);}catch(e){ce('search-status').textContent=e.message;ce('edit-status').textContent=e.message;return null;}finally{cartUI.busy=false;for(const id of ['search','refresh','capabilities','import','source-import','save','paste-add'])ce(id).disabled=false;}}
function renderCartSource(){const s=cartUI.sources.find(s=>s.id===ce('source').value);ce('source-info').textContent=s?[s.description,s.license,s.cached?'已有离线缓存':''].filter(Boolean).join(' · '):'离线查询城市位置，不需要导入 MT 测点。';ce('service').hidden=s?.access!=='wfs';if(s?.serviceUrl&&ce('url').dataset.source!==s.id){ce('url').value=s.serviceUrl;ce('url').dataset.source=s.id;}ce('homepage').disabled=!s?.homepage;ce('refresh').hidden=!['download','wfs'].includes(s?.access);ce('search').disabled=s?.access==='portal';}
async function searchCartData(refresh=false){const id=ce('source').value,s=cartUI.sources.find(s=>s.id===id),p={query:ce('query').value,region:ce('region-only').checked?readConfig().region:'',limit:1000,refresh};if(ce('region-only').checked&&regionIssue()){ce('search-status').textContent='请先设置有效的地图经纬度范围。';return;}
 if(s?.access==='portal'){renderCartSource();return;}Object.assign(p,id==='places'?{mode:'places'}:s?.access==='wfs'?{mode:'service',sourceId:id,url:ce('url').value,direct:ce('direct').checked,typeName:ce('type-name').value,version:cartUI.serviceVersion}:{mode:'source',id});
 const r=await cartTask(p);if(r)showCartResults(r);renderCartSource();}
function showCartResults(r){cartUI.results=r.features;ce('results').innerHTML=r.features.map((f,i)=>`<label class="cart-result"><input type="checkbox" value="${i}"><span><b>${ch(f.name)}</b><small>${ch(f.category)} · ${ch(f.geometry.type)}</small></span></label>`).join('');ce('search-status').textContent=`找到 ${r.total??r.features.length} 项${r.truncated?'，仅显示前 1000 项，请缩小范围或增加关键词':''}。${(r.issues||[]).slice(0,3).join(' ')}`;}
async function importCartData(){try{const file=await window.mtApp.openGeodata();if(!file)return;const r=await cartTask({mode:'import',file,limit:20000});if(r){addCartFeatures(r.features);ce('edit-status').textContent=`已导入 ${r.features.length} 项。${(r.issues||[]).slice(0,3).join(' ')}`;}}catch(e){ce('edit-status').textContent=e.message;}}
