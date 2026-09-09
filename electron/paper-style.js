// Cartographic presentation only: no coordinate or scientific-data changes.
const PALETTE={
 '缝合带':{color:'#874d49',width:0.85,dash:'dash'},
 '断层':{color:'#737c7d',width:0.4},
 '活动断层':{color:'#596568',width:0.45},
 '地质构造':{color:'#848b8a',width:0.35},
 '正断层':{color:'#4a626a',width:0.55},
 '逆冲断层':{color:'#41484c',width:0.65},
 '左旋断层':{color:'#41484c',width:0.55},
 '右旋断层':{color:'#41484c',width:0.55},
 '构造边界':{color:'#838583',width:0.35},
 '板块边界':{color:'#666e71',width:0.5},
 '背斜':{color:'#818382',width:0.35},
 '向斜':{color:'#818382',width:0.35},
 '火山岩':{color:'#a77e70',width:0.3,fill:'#d8b9a5',opacity:22}
};
function featureStyle(f){
 const point=f.geometry?.type.includes('Point');
 return {color:'#50595d',width:0.5,dash:'solid',fill:'#647681',opacity:18,
  font:'Arial',fontSize:point?7:7.5,labelColor:'#30383c',halo:true,
  position:point?'right':'center',dx:point?1.2:0,dy:0,rotation:0,
  ...PALETTE[f.category]};
}
function applyCartography(c={}){
 const categoryStyles={...c.categoryStyles},styles={...c.localLibrary?.styles};
 for(const category of Object.keys(PALETTE)){const s=featureStyle({category});categoryStyles[category]={...categoryStyles[category],...s};styles[category]={...styles[category],...s};}
 return {...c,language:c.language&&c.language!=='original'?c.language:'zh',paperStyle:true,labelLayout:{enabled:true,hideGeneric:true,maxLabels:45},
  features:(c.features||[]).map(f=>({...f,style:{...f.style,...featureStyle(f)}})),categoryStyles,
  localLibrary:{...c.localLibrary,showLabels:true,styles},
  contours:{...c.contours,color:'#858982',width:.25,majorWidth:.45,fontSize:7,labelSpacing:2.5}};
}
function terrainCPT(mode){
 const colors=mode==='paperGray'?['#dddddd','#e3e3e3','#e9e9e9','#f0f0f0','#fafafa']:['#dce7ea','#e0e7db','#e4e3d5','#efede4','#faf9f5'];
 const levels=[-11000,0,2000,4500,9000];
 return '# COLOR_MODEL = RGB\n'+levels.slice(0,-1).map((z,i)=>`${z} ${colors[i]} ${levels[i+1]} ${colors[i+1]}`).join('\n')+`\nB ${colors[0]}\nF ${colors.at(-1)}\nN white\n`;
}
module.exports={PALETTE,featureStyle,applyCartography,terrainCPT};
