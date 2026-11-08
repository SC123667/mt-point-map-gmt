// User-selected B/C/F schemes from the 2026-11-03 GMT preview comparison.
// Elevation values stay in metres; only the CPT is changed.
const palettes={
 terrainB:['#4f795e','#769367','#9dac76','#c0ba86','#d4c79b','#e3d5b4','#f0e6d2','#faf7ec'],
 terrainC:['#316b42','#6c9552','#aebe6e','#ddce8e','#c5a46a','#a9845f','#ccc2ad','#f7f4ed'],
 terrainF:['#4f795e','#809b6b','#b5b47c','#d1bd87','#decb9f','#ebdcc1','#f7f0de']
};
const has=mode=>Object.hasOwn(palettes,mode);
function sample(colors,t){
 const x=Math.max(0,Math.min(1,t))*(colors.length-1),i=Math.floor(x),f=x-i;
 const a=colors[i],b=colors[Math.min(i+1,colors.length-1)];
 return '#'+[1,3,5].map(k=>Math.round(parseInt(a.slice(k,k+2),16)*(1-f)+parseInt(b.slice(k,k+2),16)*f).toString(16).padStart(2,'0')).join('');
}
function terrainCPT(mode,value){
 if(!has(mode))throw Error('未知地形配色方案');
 const p=require('./terrain-colorbar').validate(value),colors=palettes[mode],rows=[];
 if(mode==='terrainF'){
  // Start at the chosen lower bound; the last band ends at the upper bound.
  const count=Math.ceil((p.max-p.min)/p.step);
  if(count>1000)throw Error('F 方案分级过密，请增大高程色标的刻度间隔（最多 1000 级）。');
  for(let i=0;i<count;i++){
   const color=sample(colors,count===1?0:i/(count-1));
   rows.push(`${p.min+i*p.step} ${color} ${Math.min(p.max,p.min+(i+1)*p.step)} ${color}`);
  }
 }else{
  for(let i=0;i<colors.length-1;i++)rows.push(`${p.min+(p.max-p.min)*i/(colors.length-1)} ${colors[i]} ${p.min+(p.max-p.min)*(i+1)/(colors.length-1)} ${colors[i+1]}`);
 }
 const first=rows[0].split(' ')[1],last=rows.at(-1).split(' ')[3];
 return '# COLOR_MODEL = RGB\n'+rows.join('\n')+`\nB ${first}\nF ${last}\nN white\n`;
}
module.exports={has,terrainCPT};
