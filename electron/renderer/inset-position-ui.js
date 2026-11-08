// Dragging changes only the inset's normalized page placement, never its source
// geographic bounds. Commit once on release, so one gesture is one undo step.
const insetDrag={handle:null,drag:null};
function initInsetDrag(){
 const h=document.createElement('div');h.id='inset-position-handle';h.hidden=true;h.setAttribute('aria-label','拖动局部放大图位置');h.title='拖动调整局部放大图位置；Esc 取消';
 h.style.cssText='position:absolute;z-index:21;cursor:move;touch-action:none;box-sizing:border-box;border:1px dashed #087f70;background:transparent;';
 h.innerHTML='<span style="position:absolute;left:4px;top:4px;padding:3px 6px;border-radius:4px;background:#ffffffeb;color:#087f70;font-size:11px;white-space:nowrap;pointer-events:none">↔ 拖动放大图</span>';
 el.previewBox.append(h);insetDrag.handle=h;
 h.addEventListener('pointerdown',beginInsetDrag);h.addEventListener('pointermove',moveInsetDrag);h.addEventListener('pointerup',finishInsetDrag);
 h.addEventListener('pointercancel',cancelInsetDrag);h.addEventListener('lostpointercapture',cancelInsetDrag);
 h.addEventListener('wheel',e=>{if(insetDrag.drag){e.preventDefault();e.stopPropagation();}},{passive:false});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&insetDrag.drag){e.preventDefault();cancelInsetDrag();}});
 window.addEventListener('resize',renderInsetHandle);
}
function insetDragContext(){
 const c=state.preview.mapContext;
 if(!state.preview.hasImage||!c?.inset?.placement||state.preview.rendering||selectionUI.mode||mapDraw.active||state.preview.displayRevision!==state.preview.revision)return null;
 const feature=state.cartography.features.find(f=>f.id===c.inset.featureId&&f.visible!==false&&f.properties?.inset?.enabled);
 return feature?{...c,feature}:null;
}
function renderInsetHandle(){
 const h=insetDrag.handle;if(!h)return;const c=insetDragContext();h.hidden=!c;if(!c)return;
 const d=insetDrag.drag?.target||c.inset.target,p=drawingPixel([d.x/c.frame.width,d.y/c.frame.height]),end=drawingPixel([(d.x+d.width)/c.frame.width,(d.y+d.height)/c.frame.height]);
 Object.assign(h.style,{left:p.x+'px',top:p.y+'px',width:(end.x-p.x)+'px',height:(end.y-p.y)+'px',background:insetDrag.drag?'#ffffff55':'transparent',borderWidth:insetDrag.drag?'2px':'1px'});
}
function beginInsetDrag(e){
 if(e.button!==0)return;const c=insetDragContext();if(!c)return;e.preventDefault();e.stopPropagation();document.activeElement?.blur();
 clearTimeout(state.preview.autoTimer);cancelPreviewInteraction();
 insetDrag.drag={context:c,start:drawingNormalized(e),target:{...c.inset.target},pointer:e.pointerId};
 try{insetDrag.handle.setPointerCapture(e.pointerId);}catch{}renderInsetHandle();
}
function moveInsetDrag(e){
 const d=insetDrag.drag;if(!d)return;e.preventDefault();e.stopPropagation();
 const p=drawingNormalized(e),c=d.context,b=c.inset.placement;
 d.target.x=clamp(c.inset.target.x+(p[0]-d.start[0])*c.frame.width,b.x,b.x+b.width);
 d.target.y=clamp(c.inset.target.y+(p[1]-d.start[1])*c.frame.height,b.y,b.y+b.height);
 renderInsetHandle();
}
function finishInsetDrag(e){
 if(!insetDrag.drag)return;moveInsetDrag(e);const d=insetDrag.drag,c=d.context,b=c.inset.placement;
 const x=b.width?(d.target.x-b.x)/b.width:0,y=b.height?(d.target.y-b.y)/b.height:0;
 const moved=Math.hypot(d.target.x-c.inset.target.x,d.target.y-c.inset.target.y)>.1;
 cancelInsetDrag();if(!moved)return;
 const feature=state.cartography.features.find(f=>f.id===c.feature.id);if(!feature)return;
 feature.properties.inset={...feature.properties.inset,x:Number(x.toFixed(6)),y:Number(y.toFixed(6))};
 if(selectionUI.boxId===feature.id){se('box-inset-x').value=(x*100).toFixed(1);se('box-inset-y').value=(y*100).toFixed(1);se('box-inset-position').value='custom';}
 cartChanged();scheduleAutoPreview('放大图位置已调整，正在更新预览…',{delay:120});
}
function cancelInsetDrag(){
 const d=insetDrag.drag;insetDrag.drag=null;
 if(d){try{insetDrag.handle.releasePointerCapture(d.pointer);}catch{}renderInsetHandle();}
}
