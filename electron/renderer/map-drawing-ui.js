// Editable overlay stores geographic vertices; screen coordinates are disposable.
const mapDraw={session:0,active:false,busy:false,geometry:null,parts:[],screen:[],history:[],drag:null,selected:null};
function drawingParts(g){switch(g.type){case 'Point':return [[g.coordinates]];case 'MultiPoint':case 'LineString':return [g.coordinates];case 'Polygon':case 'MultiLineString':return g.coordinates;case 'MultiPolygon':return g.coordinates.flat();default:return [];}}
function initMapDrawing(){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='map-drawing-overlay';svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:20;overflow:visible';el.previewBox.append(svg);
 const bar=document.createElement('div');bar.id='map-drawing-toolbar';bar.className='map-drawing-toolbar';bar.hidden=true;
 bar.innerHTML='<span id="map-drawing-status"></span><button id="map-drawing-undo">撤销</button><button id="map-drawing-remove">删除选中节点</button><button id="map-drawing-finish" class="primary">完成绘制</button><button id="map-drawing-cancel">取消</button>';
 el.previewBox.append(bar);bar.addEventListener('pointerdown',e=>e.stopPropagation());
 document.getElementById('map-drawing-undo').onclick=async()=>{if(mapDraw.busy||!mapDraw.history.length)return;mapDraw.geometry=mapDraw.history.pop();mapDraw.selected=null;await projectDrawing();};
 document.getElementById('map-drawing-remove').onclick=async()=>{if(mapDraw.busy||!mapDraw.selected)return;const [a,b]=mapDraw.selected;const part=mapDraw.parts[a],min=mapDraw.geometry.type.includes('Polygon')?3:mapDraw.geometry.type.includes('Line')?2:1;if(part.length<=min)return drawingStatus(`至少保留 ${min} 个节点。`);rememberDrawing();part.splice(b,1);mapDraw.selected=null;await projectDrawing();};
 document.getElementById('map-drawing-finish').onclick=finishMapDrawing;
 document.getElementById('map-drawing-cancel').onclick=()=>stopMapDrawing();
 el.previewBox.addEventListener('pointerdown',drawingPointerDown,true);
 el.previewBox.addEventListener('pointermove',drawingPointerMove,true);
 el.previewBox.addEventListener('pointerup',drawingPointerUp,true);
 el.previewBox.addEventListener('pointercancel',()=>{mapDraw.drag=null;renderMapDrawing();});
 window.addEventListener('resize',renderMapDrawing);
 document.addEventListener('keydown',e=>{if(!mapDraw.active||isEditableTarget(e.target))return;if(e.key==='Escape'){e.preventDefault();stopMapDrawing();}if((e.metaKey||e.ctrlKey)&&e.key==='z'){e.preventDefault();document.getElementById('map-drawing-undo').click();}});
}
function drawingStatus(s){document.getElementById('map-drawing-status').textContent=s;}
async function startMapDrawing(type){
 if(state.preview.rendering)return ce('edit-status').textContent='请等待当前预览完成。';
 const context=state.preview.mapContext;if(!context?.frame)return ce('edit-status').textContent='请先确认参数并更新一次地图预览，再进入绘制。';
 if(cartUI.dirty && ce('name').value.trim() && ce('coordinates').value.trim()){if(!await saveCartFeature())return;}
 const f=type==='edit'?state.cartography.features.find(f=>f.id===cartUI.selected):null;
 if(type==='edit'&&!f)return ce('edit-status').textContent='请先选择需要编辑的对象。';
 const g=f?JSON.parse(JSON.stringify(f.geometry)):{type,coordinates:type==='Polygon'?[[]]:[]};
 // Remove duplicate closure while editing. The model closes rings at commit.
 if(g.type.includes('Polygon'))for(const ring of drawingParts(g))if(ring.length>1&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1])ring.pop();
 Object.assign(mapDraw,{session:mapDraw.session+1,active:true,busy:false,geometry:g,context:JSON.parse(JSON.stringify(context)),feature:f?JSON.parse(JSON.stringify(f)):null,history:[],drag:null,selected:null,screen:[]});
 clearTimeout(state.preview.autoTimer);state.preview.autoTimer=null;closeSettingsDialog();cancelPreviewInteraction();
 document.getElementById('map-drawing-toolbar').hidden=false;el.previewBox.style.cursor='crosshair';
 await projectDrawing();
}
function rememberDrawing(){mapDraw.history.push(JSON.parse(JSON.stringify(mapDraw.geometry)));if(mapDraw.history.length>100)mapDraw.history.shift();}
async function projectDrawing(){const session=mapDraw.session;mapDraw.parts=drawingParts(mapDraw.geometry);const points=mapDraw.parts.flat();mapDraw.busy=true;try{const all=points.length?await window.mtApp.projectMap({...mapDraw.context,points}):[];if(!mapDraw.active||session!==mapDraw.session)return;let i=0;mapDraw.screen=mapDraw.parts.map(part=>part.map(()=>all[i++]));renderMapDrawing();drawingStatus(mapDraw.feature?'拖动圆点调整走向；点在线段附近插入节点。':'依次点击地图添加节点；完成后设置名称与样式。');}catch(e){drawingStatus(e.message);}finally{if(session===mapDraw.session)mapDraw.busy=false;}}
function drawingPixel(p){const fit=previewImageFitRect();return {x:state.preview.panX+(fit.left+p[0]*fit.width)*state.preview.zoom,y:state.preview.panY+(fit.top+p[1]*fit.height)*state.preview.zoom};}
function drawingNormalized(e){const p=previewPoint(e),fit=previewImageFitRect();return [((p.x-state.preview.panX)/state.preview.zoom-fit.left)/fit.width,((p.y-state.preview.panY)/state.preview.zoom-fit.top)/fit.height];}
function renderMapDrawing(){const svg=document.getElementById('map-drawing-overlay');if(!svg)return;if(!mapDraw.active){svg.innerHTML='';return;}const box=el.previewBox.getBoundingClientRect();svg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
 const polygon=mapDraw.geometry.type.includes('Polygon');svg.innerHTML=mapDraw.screen.map((part,a)=>{const pixels=part.map(drawingPixel),line=pixels.map(p=>`${p.x},${p.y}`).join(' ');return `<${polygon?'polygon':'polyline'} points="${line}" fill="${polygon?'#159b8730':'none'}" stroke="white" stroke-width="5"/><${polygon?'polygon':'polyline'} points="${line}" fill="none" stroke="#087f70" stroke-width="2"/>`+pixels.map((p,b)=>`<circle data-part="${a}" data-vertex="${b}" cx="${p.x}" cy="${p.y}" r="${mapDraw.selected?.[0]===a&&mapDraw.selected?.[1]===b?6:4.5}" fill="white" stroke="#087f70" stroke-width="2" style="pointer-events:all;cursor:grab"/>`).join('');}).join('');}
async function drawingCoordinate(point){const [coordinate]=await window.mtApp.projectMap({...mapDraw.context,points:[point],inverse:true});const [w,e,s,n]=mapDraw.context.config.region.split('/').map(Number);coordinate[0]+=360*Math.round(((w+e)/2-coordinate[0])/360);if(coordinate[0]<w-1e-7||coordinate[0]>e+1e-7||coordinate[1]<s-1e-7||coordinate[1]>n+1e-7)throw new Error('请在地图经纬度范围内绘制。');return coordinate.map(v=>Number(v.toFixed(8)));}
async function drawingPointerDown(e){const session=mapDraw.session;if(!mapDraw.active||e.button!==0||e.target.closest('#map-drawing-toolbar,.preview-zoom-controls,.legend-drag-handle,.element-drag-handle'))return;e.preventDefault();e.stopImmediatePropagation();if(mapDraw.busy)return;
 const vertex=e.target.closest('[data-vertex]');if(vertex){mapDraw.selected=[Number(vertex.dataset.part),Number(vertex.dataset.vertex)];mapDraw.drag={pointerId:e.pointerId};el.previewBox.setPointerCapture(e.pointerId);renderMapDrawing();return;}
 if(mapDraw.geometry.type.includes('Point'))return;
 const point=drawingNormalized(e);mapDraw.busy=true;try{const coordinate=await drawingCoordinate(point);if(!mapDraw.active||session!==mapDraw.session)return;let a=0,b=mapDraw.parts[0].length;
 if(mapDraw.feature){let best=Infinity;const click=drawingPixel(point);mapDraw.screen.forEach((part,i)=>{const count=mapDraw.geometry.type.includes('Polygon')?part.length:part.length-1;for(let j=0;j<count;j++){const x=drawingPixel(part[j]),y=drawingPixel(part[(j+1)%part.length]),dx=y.x-x.x,dy=y.y-x.y,t=clamp(((click.x-x.x)*dx+(click.y-x.y)*dy)/(dx*dx+dy*dy||1),0,1),d=Math.hypot(click.x-x.x-t*dx,click.y-x.y-t*dy);if(d<best){best=d;a=i;b=j+1;}}});if(best>24)throw new Error('在构造线附近点击可插入节点，或拖动已有圆点。');}
 rememberDrawing();mapDraw.parts[a].splice(b,0,coordinate);mapDraw.selected=[a,b];await projectDrawing();}catch(err){drawingStatus(err.message);}finally{if(session===mapDraw.session)mapDraw.busy=false;}}
function drawingPointerMove(e){if(!mapDraw.active||!mapDraw.drag)return;e.preventDefault();e.stopImmediatePropagation();const [a,b]=mapDraw.selected;mapDraw.screen[a][b]=drawingNormalized(e);renderMapDrawing();}
async function drawingPointerUp(e){const session=mapDraw.session;if(!mapDraw.active||!mapDraw.drag)return;e.preventDefault();e.stopImmediatePropagation();mapDraw.drag=null;const point=drawingNormalized(e),selected=mapDraw.selected;mapDraw.busy=true;try{const coordinate=await drawingCoordinate(point);if(!mapDraw.active||session!==mapDraw.session)return;rememberDrawing();const [a,b]=selected;mapDraw.parts[a][b].splice(0,2,...coordinate);await projectDrawing();}catch(err){await projectDrawing();drawingStatus(err.message);}finally{if(session===mapDraw.session)mapDraw.busy=false;}}
async function finishMapDrawing(){const session=mapDraw.session;if(!mapDraw.active||mapDraw.busy)return;mapDraw.busy=true;try{const old=mapDraw.feature,polygon=mapDraw.geometry.type.includes('Polygon'),name=old?.name||(polygon?'自定义构造区域':'自定义构造线');const f={...old,id:old?.id||'draw-'+require('crypto').randomUUID(),name,geometry:mapDraw.geometry,category:old?.category||(polygon?'构造区域':'断层'),style:old?.style||{color:'#485c70',width:1.2,dash:polygon?'dash':'solid',fill:'#aac3cd',opacity:20,showLabel:true},source:{...old?.source,id:old?.source?.id||'manual-drawing',name:old?.source?.name||'用户手工绘制',geometryOrigin:old?'原始矢量经用户调整':'用户在地图上手工描绘',editedAt:new Date().toISOString()}};
 const result=await window.mtApp.geodata({mode:'normalize',cartography:{features:[f]}});if(!mapDraw.active||session!==mapDraw.session)return;const at=state.cartography.features.findIndex(x=>x.id===f.id);if(at>=0)state.cartography.features.splice(at,1,result.features[0]);else state.cartography.features.push(result.features[0]);stopMapDrawing();cartUI.selected=f.id;renderCartography();openSettingsPanel('cartography');cartChanged();ce('edit-status').textContent='几何已保存。可设置双语名称、线型与颜色；确认后更新预览。';}catch(e){drawingStatus(e.message);}finally{if(session===mapDraw.session)mapDraw.busy=false;}}
function stopMapDrawing(){mapDraw.session++;mapDraw.active=false;mapDraw.busy=false;mapDraw.drag=null;document.getElementById('map-drawing-toolbar').hidden=true;el.previewBox.style.cursor='';renderMapDrawing();}
