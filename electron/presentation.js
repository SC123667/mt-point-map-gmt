// Display settings only; never change station selection or MT calculations.
const defaults={frameStyle:'fancy',frameWidth:2,framePen:.5,frameSegments:8,fontFamily:'Times New Roman',fontSize:8,panelFontSize:9,outputWidthMM:180,periodPosition:'bottomLeft',panelPosition:'bottomRight',colorBy:'beta',betaMin:-9,betaMax:9,betaStep:3,phaseMin:0,phaseMax:90,phaseStep:15,ellipsePen:.35,lineScale:.8,fillScale:.5,labelFormat:'abbreviation'};
const ranges={frameWidth:[.5,6],framePen:[.1,2],frameSegments:[2,40],fontSize:[5,16],panelFontSize:[5,18],outputWidthMM:[80,500],betaMin:[-90,0],betaMax:[0,90],betaStep:[.1,90],phaseMin:[-90,90],phaseMax:[0,180],phaseStep:[1,90],ellipsePen:[0,2],lineScale:[.1,2],fillScale:[0,1]};
function normalize(value={}){
 const p={...defaults};for(const [k,[lo,hi]]of Object.entries(ranges)){const n=Number(value?.[k]);if(value?.[k]!=null&&Number.isFinite(n))p[k]=Math.min(hi,Math.max(lo,n));}
 for(const [k,allowed]of Object.entries({frameStyle:['fancy','plain'],fontFamily:['Times New Roman','Arial'],periodPosition:['topLeft','bottomLeft','topRight','bottomRight'],panelPosition:['bottomRight','topLeft','topRight','bottomLeft','none'],colorBy:['beta','phimin','phimax','phi2'],labelFormat:['project','abbreviation','name']}))if(allowed.includes(value?.[k]))p[k]=value[k];
 p.frameSegments=Math.round(p.frameSegments);return p;
}
function validate(value){const p=normalize(value);for(const prefix of ['beta','phase'])if(p[prefix+'Max']<=p[prefix+'Min'])throw Error('色标上限必须大于下限');return p;}
function cartography(config){
 const p=normalize(config.presentation),c=config.cartography||{},core=require('./cartography');
 return {...c,...(p.labelFormat==='project'?{}:{nameFormat:p.labelFormat}),features:(c.features||[]).map(f=>{
  if(f.properties?.regionBox)return f;
  const style=core.effectiveStyle(f,c),line=f.geometry?.type.includes('Line'),polygon=f.geometry?.type.includes('Polygon');
  return {...f,style:{...style,...(line?{width:style.width*p.lineScale}:{}),...(polygon?{opacity:style.opacity*p.fillScale}:{})}};
 })};
}
module.exports={defaults,normalize,validate,cartography};
