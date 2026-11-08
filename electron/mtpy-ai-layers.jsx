// Runs inside the MTpy exporter, before font verification and native AI saving.
var entries=/*MTPY_LAYERS*/,originalLayers=[],periodLayers={},layerProof=[],imported=null,operations=0;
for(var k=0;k<doc.layers.length;k++)originalLayers.push(doc.layers[k]);
function insideMask(item,mask){
 if(mask.typename!=='PathItem'||mask.pathPoints.length!==4)return false;
 var b=mask.geometricBounds,points=mask.pathPoints;
 for(var k=0;k<4;k++){
  var v=points[k],a=v.anchor;
  if(a[0]!==v.leftDirection[0]||a[1]!==v.leftDirection[1]||a[0]!==v.rightDirection[0]||a[1]!==v.rightDirection[1])return false;
  if(Math.min(Math.abs(a[0]-b[0]),Math.abs(a[0]-b[2]))>.01||Math.min(Math.abs(a[1]-b[1]),Math.abs(a[1]-b[3]))>.01)return false;
 }
 var r=item.visibleBounds;return r[0]>=b[0]-.001&&r[1]<=b[1]+.001&&r[2]<=b[2]+.001&&r[3]>=b[3]-.001;
}
function unpack(item,layer,masks,terrain){
 check();if(++operations>100000)throw Error('AI 对象过多，已停止拆组。');
 if(item.typename==='PathItem'&&!item.clipping&&((!item.filled&&!item.stroked)||item.opacity===0)){item.remove();return;}
 if(item.typename==='GroupItem'&&item.opacity===100&&item.blendingMode===BlendModes.NORMAL){
  var children=[],clip=null;
  for(var k=0;k<item.pageItems.length;k++){
   var c=item.pageItems[k];children.push(c);
   if(item.clipped&&((c.typename==='PathItem'&&c.clipping)||(c.typename==='CompoundPathItem'&&c.pathItems.length&&c.pathItems[0].clipping)))clip=c;
  }
  if(!item.clipped||clip){
   var next=clip?masks.concat([clip]):masks;
   for(var k=0;k<children.length;k++)if(children[k]!==clip)unpack(children[k],layer,next,terrain);
   try{item.remove();}catch(e){}return;
  }
 }
 // Preserve holes, opacity groups and genuinely clipped edge objects. Every
 // ordinary arrow, ellipse and text frame becomes its own selectable object.
 var parent=item.typename==='RasterItem'&&terrain?terrain:layer,wrappers=[];
 for(var m=0;m<masks.length;m++)if(!insideMask(item,masks[m])){
  var wrapper=parent.groupItems.add();wrapper.move(parent,ElementPlacement.PLACEATEND);
  var mask=masks[m].duplicate(wrapper,ElementPlacement.PLACEATBEGINNING);
  if(mask.typename==='PathItem'){mask.filled=false;mask.stroked=false;}
  wrappers.push(wrapper);parent=wrapper;
 }
 item.move(parent,ElementPlacement.PLACEATEND);
 for(var w=wrappers.length-1;w>=0;w--)wrappers[w].clipped=true;
}
function samePath(a,b){
 if(a.typename!=='PathItem'||b.typename!=='PathItem'||a.closed!==b.closed)return false;
 var ap=a.pathPoints,bp=b.pathPoints,count=ap.length,keys=['anchor','leftDirection','rightDirection'];if(count!==bp.length)return false;
 for(var p=0;p<count;p++){var u=ap[p],v=bp[p];for(var t=0;t<3;t++){
  var x=u[keys[t]],y=v[keys[t]];if(Math.abs(x[0]-y[0])>.00001||Math.abs(x[1]-y[1])>.00001)return false;
 }}
 return true;
}
function leafPath(item){
 var masks=[];
 while(item.typename==='GroupItem'&&item.clipped&&item.opacity===100&&item.blendingMode===BlendModes.NORMAL){
  var content=null,mask=null;
  for(var i=0;i<item.pageItems.length;i++){
   var c=item.pageItems[i];
   if(c.typename==='PathItem'&&c.clipping)mask=c;
   else{if(content)return null;content=c;}
  }
  if(!mask||!content)return null;masks.push(mask);item=content;
 }
 return item.typename==='PathItem'?{path:item,masks:masks}:null;
}
function joinPaint(layer){
 // Illustrator's PDF importer separates an arrow's fill from its identical
 // stroked outline. Reunite only adjacent, exactly coincident paths and masks.
 var items=[];for(var i=0;i<layer.pageItems.length;i++)items.push(layer.pageItems[i]);
 for(var i=0;i<items.length-1;i++){
  var a=leafPath(items[i]),b=leafPath(items[i+1]);if(!a||!b)continue;
  if(a.path.filled||!a.path.stroked||!b.path.filled||b.path.stroked||a.path.opacity!==b.path.opacity||a.path.blendingMode!==b.path.blendingMode||a.masks.length!==b.masks.length||!samePath(a.path,b.path))continue;
  var same=true;for(var j=0;j<a.masks.length;j++)if(!samePath(a.masks[j],b.masks[j]))same=false;
  if(!same)continue;
  a.path.filled=true;a.path.fillColor=b.path.fillColor;a.path.fillOverprint=b.path.fillOverprint;a.path.evenodd=b.path.evenodd;
  items[i+1].remove();i++;
 }
}
try{
 if(!new File(folder.fsName+'/MTpy-layers.pdf').copy(stage.fsName+'/layers.pdf'))throw Error('Cannot stage AI layers');
 var targetBounds=doc.artboards[0].artboardRect;
 for(var n=0;n<entries.length;n++){
  check();var entry=entries[n],key=String(entry.period),periodLayer=null;
  if(entry.period!==undefined){
   periodLayer=periodLayers[key];
   if(!periodLayer){periodLayer=doc.layers.add();periodLayer.name='T = '+key+' s';periodLayers[key]=periodLayer;}
  }
  var terrain=null;
  if(entry.role==='background'){terrain=periodLayer.layers.add();terrain.name='地形影像';}
  var layer=periodLayer?periodLayer.layers.add():doc.layers.add();layer.name=entry.name;
  app.preferences.PDFFileOptions.pageToOpen=entry.page;
  imported=app.open(new File(stage.fsName+'/layers.pdf'));
  var sourceBounds=imported.artboards[0].artboardRect,items=[];
  for(var a=0;a<imported.layers.length;a++)for(var b=0;b<imported.layers[a].pageItems.length;b++)items.push(imported.layers[a].pageItems[b]);
  for(var k=0;k<items.length;k++){
   var original=items[k].position;var copy=items[k].duplicate(layer,ElementPlacement.PLACEATEND),actual=copy.position;
   copy.translate(original[0]+targetBounds[0]-sourceBounds[0]-actual[0],original[1]+targetBounds[1]-sourceBounds[1]-actual[1]);
   unpack(copy,layer,[],terrain);
  }
  imported.close(SaveOptions.DONOTSAVECHANGES);imported=null;doc.activate();
  if(entry.role==='ellipses'||entry.role==='real'||entry.role==='imag'||entry.role==='legend')joinPaint(layer);
  if(entry.role==='ellipses'||entry.role==='real'||entry.role==='imag')for(var k=0;k<layer.pageItems.length;k++)layer.pageItems[k].name=entry.name+' '+(k+1);
  layerProof.push({period:entry.period,role:entry.role,items:layer.pageItems.length,artists:entry.artists});
  var progress=new File(folder.fsName+'/AI-layer-progress.txt');progress.open('w');progress.write((n+1)+'/'+entries.length+' '+entry.role);progress.close();
 }
 for(var k=0;k<originalLayers.length;k++)originalLayers[k].remove();
 // Structural proof is separate from path totals: MT objects must be selectable
 // as individual items, not one shared clipping group per component.
 for(var n=0;n<layerProof.length;n++){
  var proof=layerProof[n];
  if((proof.role==='ellipses'||proof.role==='real'||proof.role==='imag')&&proof.artists>0&&proof.items!==proof.artists)throw Error('AI 独立对象核验失败: '+proof.role+' '+proof.items+'/'+proof.artists);
 }
 var record=new File(folder.fsName+'/AI-layer-proof.json');record.encoding='UTF-8';record.open('w');
 // ExtendScript has no guaranteed native JSON; serialize these simple records.
 var lines=[];for(var n=0;n<layerProof.length;n++){var p=layerProof[n];lines.push('{"period":'+(p.period===undefined?'null':p.period)+',"role":"'+p.role+'","items":'+p.items+',"artists":'+(p.artists||0)+'}');}
 record.write('['+lines.join(',')+']');record.close();
}finally{
 if(imported)try{imported.close(SaveOptions.DONOTSAVECHANGES);}catch(e){}
 try{new File(stage.fsName+'/layers.pdf').remove();}catch(e){}
}
