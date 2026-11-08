let elevationBusy=false;
const ee=id=>document.getElementById('elevation-'+id);
function initElevationUI(){
 const panel=wbPanel('elevation','EM3DVP 高程导出');
 panel.innerHTML+=`<p class="wb-intro">按范围自动获取地形，与“地形底图”使用同一缓存、分辨率和下载源。优先复用当前/覆盖范围的缓存；不足时按地形设置准备数据，不需要手动选择 GRD。</p>
 <button id="elevation-current" type="button">使用当前图幅和地形设置</button>
 <div class="cart-grid"><label>西边界（°E）<input id="elevation-west" type="number" min="-180" max="180" step="any"></label><label>东边界（°E）<input id="elevation-east" type="number" min="-180" max="180" step="any"></label><label>南边界（°N）<input id="elevation-south" type="number" min="-90" max="90" step="any"></label><label>北边界（°N）<input id="elevation-north" type="number" min="-90" max="90" step="any"></label></div>
 <label>地形分辨率<select id="elevation-resolution"></select></label>
 <label>区域名称（可选）<input id="elevation-area" placeholder="留空按区域城镇命名"></label>
 <label>抽样步长（每 N 个格点取 1 个）<input id="elevation-stride" type="number" min="1" max="1000" step="1" value="1"></label>
 <p class="field-note">1 保留原始格点；增大可减小文件。抽样不会增加分辨率，不做插值或平滑。海拔保持正负值。</p>
 <details class="wb-section"><summary>单位与缺测处理</summary>
 <label>源高程单位<select id="elevation-unit"><option value="m">米（GMT / SRTM 默认）</option><option value="km">千米</option><option value="ft">英尺</option></select></label>
 <label class="check"><input id="elevation-skip" type="checkbox">跳过无效格点（不补零）</label>
 <label class="check"><input id="elevation-geographic" type="checkbox">确认未声明坐标类型的本地网格也是经纬度</label>
 <p class="field-note">投影坐标网格必须先重投影，不能直接勾选。高程基准沿用源文件；此处不转换椭球高/海拔基准。</p></details>
 <button id="elevation-export" class="primary" type="button">一键获取地形并导出 EM3DVP 高程</button>
 <button id="elevation-cancel" type="button" disabled>取消高程导出</button>
 <progress id="elevation-progress" max="100" value="0"></progress><p id="elevation-status" class="wb-intro" aria-live="polite">输出：全局目录 / 导出高程 / EM3DVP / 区域。硬盘未连接时会提示，不会另建缓存。</p>
 <p class="wb-export-note">生成 elevation_lonlat.xyz（无表头三列：经度、纬度、高程米）和来源说明。EM3DVP 中加载 EDI、生成模型后，通过“添加地形/水深”选择 XYZ。范围应覆盖核心模型。</p>`;
 ee('resolution').replaceChildren(...Array.from(el.terrainResolutionInput.options).map(o=>new Option(o.text,o.value)));
 ee('current').onclick=()=>{const c=readConfig();state.elevationExport={...readElevationSettings(),region:c.region,resolution:c.terrainResolution,areaName:c.terrainRegionName};renderElevationSettings();queueProjectHistory();};
 for(const id of ['west','east','south','north','resolution','area','stride','unit','skip','geographic'])ee(id).onchange=()=>{state.elevationExport=readElevationSettings();queueProjectHistory();};
 ee('export').onclick=exportEM3DVPElevation;ee('cancel').onclick=async()=>{ee('cancel').disabled=true;await window.mtApp.cancelElevation();};
 window.mtApp.onElevationProgress(status=>{if(!elevationBusy)return;ee('progress').value=status.percent||0;ee('status').textContent=status.message||'';});
 renderElevationSettings();
}
function readElevationSettings(){if(!ee('west'))return state.elevationExport||{};return {region:['west','east','south','north'].map(k=>ee(k).value).join('/'),resolution:ee('resolution').value,areaName:ee('area').value.trim(),stride:Number(ee('stride').value),unit:ee('unit').value,skipMissing:ee('skip').checked,confirmGeographic:ee('geographic').checked};}
function renderElevationSettings(){
 if(!ee('west'))return;const c=state.elevationExport||{},r=String(c.region||el.regionInput.value||'').split('/');
 ['west','east','south','north'].forEach((k,i)=>ee(k).value=r[i]??'');ee('resolution').value=c.resolution||el.terrainResolutionInput.value;ee('area').value=c.areaName||'';ee('stride').value=c.stride||1;ee('unit').value=c.unit||'m';ee('skip').checked=!!c.skipMissing;ee('geographic').checked=!!c.confirmGeographic;
}
async function exportEM3DVPElevation(){
 if(elevationBusy)return;
 const settings=readElevationSettings(),bounds=settings.region.split('/');if(bounds.some(v=>!v.trim())){ee('status').textContent='请填写四个经纬度边界，或点击“使用当前图幅和地形设置”。';return;}
 const config={...readConfig(),region:settings.region,terrainResolution:settings.resolution,terrainRegionName:settings.areaName,terrainPreview:false};
 elevationBusy=true;ee('export').disabled=true;ee('cancel').disabled=false;ee('progress').value=0;ee('status').textContent='正在匹配区域地形…';
 try{const result=await window.mtApp.exportElevation({...settings,config});ee('status').textContent=`已导出 ${result.rows.toLocaleString()} 个高程点；跳过无效点 ${result.missing}。${result.terrainSource}。文件：${result.filePath}`;ee('progress').value=100;}
 catch(error){ee('status').textContent=error.message||String(error);}
 finally{elevationBusy=false;ee('export').disabled=false;ee('cancel').disabled=true;}
}
