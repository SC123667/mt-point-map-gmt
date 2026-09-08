const fs=require('fs'),path=require('path');
const m=require('./cartography');
function scriptParts(config,outputDirectory,region,shell,quote){
 const c=m.normalize(config.cartography),features=c.features.filter(f=>f.visible&&m.inRegion(f,config.region));
 const commands=[],labels=[],groups=new Map(),prefix=shell==='bat'?'':'  ';
 const xy=p=>(config.swapAxes?[p[1],p[0]]:p).join('\t');
 const file=(name,text)=>{fs.writeFileSync(path.join(outputDirectory,name),text,'utf8');return shell==='bat'?name:path.join(outputDirectory,name);};
 // Keep polygons below lines, and point symbols above both.
 const rank=f=>f.geometry.type.includes('Polygon')?0:f.geometry.type.includes('Line')?1:2;
 features.sort((a,b)=>rank(a)-rank(b));
 features.forEach((f,i)=>{
  const s=m.effectiveStyle(f,c),g=f.geometry,pen=`${s.width}p,${s.color}${s.dash==='dash'?',-':s.dash==='dot'?',.':''}`;
  let text='',options='';
  if(g.type.includes('Polygon')){
   const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
   text=polys.map(rings=>rings.map((r,j)=>(j?'> -Ph\n':'>\n')+r.map(xy).join('\n')).join('\n')).join('\n');
   options=`-L -G${s.fill}@${100-s.opacity} -W${pen}`;
  }else if(g.type.includes('Line')){
   text=(g.type==='LineString'?[g.coordinates]:g.coordinates).map(a=>'>\n'+a.map(xy).join('\n')).join('\n');options=`-W${pen}`;
  }else {text=(g.type==='Point'?[g.coordinates]:g.coordinates).map(xy).join('\n');options=`-S${s.symbol}${s.size}c -G${s.fill} -W${pen}`;}
  if(!g.type.includes('Point')||s.symbol!=='none'){
   const key=rank(f)+'|'+options;
   if(!groups.has(key))groups.set(key,{options,parts:[]});groups.get(key).parts.push(text);
  }
  const label=m.labelText(f,s,c),a=m.anchor(f,config.region);if(label&&s.showLabel&&a&&m.inRegion({geometry:{type:'Point',coordinates:a}},config.region))labels.push({id:f.id,name:label,anchor:a,style:s});
 });
 for(const [i,group] of [...groups.values()].entries()){
  const p=file(`map_features_${String(i+1).padStart(3,'0')}.gmt`,group.parts.join('\n')+'\n');
  commands.push(`${prefix}gmt plot ${quote(p)} -R${region} -J${config.projection} ${group.options}`);
 }
 for(const name of ['地图图层.geojson','图层来源.json'])fs.rmSync(path.join(outputDirectory,name),{force:true});
 if(features.length){file('地图图层.geojson',JSON.stringify(m.geoJSON(features),null,2));file('图层来源.json',JSON.stringify([...new Map(features.filter(f=>f.source?.id).map(f=>[f.source.id,f.source])).values()],null,2));}
 if(labels.length){
  const input=file('map_label_anchors.tsv',labels.map(l=>xy(l.anchor)).join('\n')+'\n');
  commands.push(`${prefix}gmt mapproject ${quote(input)} -R${region} -J${config.projection} -Dc > ${quote(shell==='bat'?'map_label_projected.tsv':path.join(outputDirectory,'map_label_projected.tsv'))}`);
  file('map_label_styles.json',JSON.stringify(labels));
 }
 return {commands,labels};
}
function contourCommand(config,grid,region,quote,prefix='  '){const c=m.contours(config.cartography?.contours);if(!c.show||!grid)return '';
 const base=`${prefix}gmt grdcontour ${quote(grid)} -R${region} -J${config.projection}`;
 if(!c.labels){const lines=[`${base} -C${c.interval} -A- -W${c.width}p,${c.color} -Q${c.minLength}C --PROJ_LENGTH_UNIT=cm`];if(c.major>0)lines.push(`${base} -C${c.major} -A- -W${c.majorWidth}p,${c.color} -Q${c.minLength}C --PROJ_LENGTH_UNIT=cm`);return lines.join('\n');}
 const major=c.major>0?c.major:c.interval;
 return `${base} -C${c.interval} -Gd8c+r${c.labelSpacing}c -A${major}+f${c.fontSize}p,Helvetica,${c.color}+gwhite -Wc${c.width}p,${c.color} -Wa${c.major>0?c.majorWidth:c.width}p,${c.color} -Q${c.minLength}C --PROJ_LENGTH_UNIT=cm`;

}
function readLayout(directory,outputName){
 const labelFile=path.join(directory,'map_label_styles.json');
 const eps=fs.readFileSync(path.join(directory,outputName+'.eps'),'utf8');
 // GMT's EPS crop translation is in PostScript points; PSL drawing coordinates
 // are converted by the page-setup scale. Read both, never guess image margins.
 const bb=eps.match(/%%HiResBoundingBox:\s*([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)/i);
 const setup=eps.match(/%%BeginSetup([\s\S]*?)%%EndSetup/),trans=setup?.[1].match(/([\d.e+-]+)\s+([\d.e+-]+)\s+translate/i);
 const page=eps.match(/%%BeginPageSetup([\s\S]*?)%%EndPageSetup/),scale=page?.[1].match(/([\d.e+-]+)\s+([\d.e+-]+)\s+scale/i);
 const origin=eps.slice(eps.indexOf('%PSL_End_Header')).match(/([\d.e+-]+)\s+([\d.e+-]+)\s+TM/);
 if(!bb||!scale||!origin)throw new Error('无法读取 GMT 图幅定位信息，已停止标注导出以避免位置错误。');
 const ox=Number(origin[1])*Number(scale[1])+Number(trans?.[1]||0)-Number(bb[1]);
 const oy=Number(origin[2])*Number(scale[2])+Number(trans?.[2]||0)-Number(bb[2]);
 const width=Number(bb[3])-Number(bb[1]),height=Number(bb[4])-Number(bb[2]);
 if(!fs.existsSync(labelFile))return {width,height,ox,oy,labels:[]};
 const projected=fs.readFileSync(path.join(directory,'map_label_projected.tsv'),'utf8').trim().split(/\r?\n/).map(x=>x.trim().split(/\s+/).map(Number));
 const labels=JSON.parse(fs.readFileSync(labelFile,'utf8')).map((l,i)=>({...l,x:ox+(projected[i]?.[0]??NaN)*72/2.54,y:height-oy-(projected[i]?.[1]??NaN)*72/2.54})).filter(l=>Number.isFinite(l.x)&&Number.isFinite(l.y));
 return {width,height,ox,oy,labels};
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function labelSVG(layout){if(!layout)return '';const texts=layout.labels.map(l=>{const s=l.style,lines=l.name.split(/\n|\\n/),fs=s.fontSize,em=fs*1.22;
 let x=l.x+s.dx*72/25.4,y=l.y-s.dy*72/25.4;const pad=s.size*72/2.54/2+2;
 const pos=s.position,align=pos==='left'?'end':pos==='right'?'start':'middle';if(pos==='left')x-=pad;if(pos==='right')x+=pad;
 if(pos==='above')y-=pad+em*(lines.length-1)+fs*.25;else if(pos==='below')y+=pad+fs;else y-=em*(lines.length-1)/2-fs*.33;
 return `<text x="${x}" y="${y}" text-anchor="${align}" font-family="${escape(s.font)},PingFang SC,Microsoft YaHei,sans-serif" font-size="${fs}" fill="${s.labelColor}" ${s.halo?'stroke="white" stroke-width="1.6" stroke-linejoin="round" paint-order="stroke"':''} transform="rotate(${-s.rotation} ${x} ${y})">${lines.map((t,i)=>`<tspan x="${x}" dy="${i?em:0}">${escape(t)}</tspan>`).join('')}</text>`;
 }).join('\n');return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}pt" height="${layout.height}pt" viewBox="0 0 ${layout.width} ${layout.height}">${texts}</svg>`;}
module.exports={scriptParts,contourCommand,readLayout,labelSVG};
