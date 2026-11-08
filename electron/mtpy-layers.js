// Reuse the application's GMT terrain, fault and cartography pipeline. MTpy's
// geographic axes are linear lon/lat, so GMT uses the identical linear mapping.
const fs=require('fs'),path=require('path');
async function prepare(services,sender,source,result,options){
 const b=result.bounds,w=14,h=w*(b[3]-b[2])/(b[1]-b[0]);
 // Both axes are degrees. Plain X treats a 50 km scale as 50 Cartesian units.
 // This is an internal background, not a standalone regional map.
 const elevation=require('./terrain-colorbar').settings(source.terrainColorbar);
 let config={...source,terrainColorbar:{...elevation,show:false},region:b.join('/'),projection:`X${w}cd/${h}cd`,swapAxes:false,
  plotType:'baseMap',outputName:'GMT背景',frame:'0',showGrid:false,showTitle:false,
  showTerrain:!!options.terrain,showLabels:false,showScale:!!source.showScale,showNorthArrow:!!source.showNorthArrow,
  interactiveMap:true,illustratorPackage:false,illustratorDirect:false,legend:{show:false},
  cartography:options.structures?{...source.cartography}:{features:[],contours:{show:false}},
  faultLayers:options.structures?(source.faultLayers||[]):[],terrainPreview:!!source.terrainPreview};
 // Insets are layout tools; the MTpy map's geographic frame is the composition boundary.
 config.cartography={...config.cartography,features:(config.cartography.features||[]).filter(f=>!f.properties?.regionBox)};
 let payload={records:[],config};
 payload=await services.resolveLocalLibrary(sender,payload);
 config=services.normalizeTerrainConfig(payload);
 const soft=source.mtpy?.backgroundStyle!=='original';
 if(soft){
  config={...config,terrainIntensity:Number(config.terrainIntensity??.35)*.7,terrainShadePath:''};
  const cartography=require('./cartography');
  config.cartography={...config.cartography,features:config.cartography.features.map(f=>{
   const style=cartography.effectiveStyle(f,config.cartography);
   // Preserve named main structures, point symbols and polygon fills.
   return f.geometry.type.includes('Line')&&!style.showLabel&&f.category!=='缝合带'
    ?{...f,style:{...style,width:style.width*.8,strokeOpacity:Math.min(style.strokeOpacity??100,70)}}:f;
  })};
 }
 const directory=path.join(result.output,'GMT图层');fs.mkdirSync(directory,{recursive:true});
 const rendered=await services.runGMTWorker(sender,{mode:'export',records:[],config,formats:['png','pdf','eps'],outputDirectory:directory});
 if(!rendered.ok)throw Error(rendered.message||'GMT 图层生成失败');
 const annotationLayout=rendered.annotationLayout;
 // Only scale decorations remain below data; structure labels are placed per period.
 if(annotationLayout?.scaleLabel)await services.overlayNativeDecorations({...rendered,annotationLayout:{...annotationLayout,labels:[]}},config,'GMT背景',['png','pdf']);
 const frame=rendered.mapFrame;if(!frame)throw Error('GMT 未返回地图坐标框');
 const background={presentation:result.presentation,displayScale:result.displayScale,annotationLayout,showScale:!!config.showScale,backgroundStyle:soft?'soft':'original',pdf:path.join(directory,'GMT背景.pdf'),box:{left:frame.ox,bottom:frame.oy,right:frame.ox+w*72/2.54,top:frame.oy+h*72/2.54},region:b,projection:config.projection,terrain:!!options.terrain,terrainResolution:config.terrainResolution,terrainCpt:config.terrainCpt,terrainIntensity:config.terrainIntensity,pngDpi:config.pngDpi};
 background.shorelines=require('./shorelines').settings(config.shorelines);
 fs.writeFileSync(path.join(directory,'叠加定位.json'),JSON.stringify(background,null,2));return background;
}
module.exports={prepare};
