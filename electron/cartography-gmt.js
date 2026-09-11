const fs=require('fs'),path=require('path');
const m=require('./cartography');
const placement=require('./label-layout');
function scriptParts(config,outputDirectory,region,shell,quote){
 const c=m.normalize(config.cartography),features=c.features.filter(f=>f.visible&&m.inRegion(f,config.region));
 const commands=[],labels=[],groups=new Map(),prefix=shell==='bat'?'':'  ';
 const xy=p=>(config.swapAxes?[p[1],p[0]]:p).join('\t');
 const file=(name,text)=>{fs.writeFileSync(path.join(outputDirectory,name),text,'utf8');return shell==='bat'?name:path.join(outputDirectory,name);};
 // Keep polygons below lines, and point symbols above both.
 const rank=f=>f.geometry.type.includes('Polygon')?0:f.geometry.type.includes('Line')?1:2;
 features.sort((a,b)=>rank(a)-rank(b));
 features.forEach((f,i)=>{
  const s=m.effectiveStyle(f,c),g=f.geometry;
  const hasProperName=[f.name,f.nameZh,f.nameEn].some(name=>name&&!placement.genericLabel(f,name));
  if(c.paperStyle&&!hasProperName&&!g.type.includes('Point')){s.color='#a3a6a2';s.width=Math.min(s.width,.25);}
  const pen=`${s.width}p,${s.color}${s.dash==='dash'?',-':s.dash==='dot'?',.':''}`;
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
  const label=m.labelText(f,s,c),a=m.anchor(f,config.region);
  if(label&&s.showLabel&&a){const cs=c.labelLayout.enabled?placement.candidates(f,config.region,a):[{anchor:a}];if(cs.length)labels.push({id:f.id,name:label,generic:placement.genericLabel(f,label),anchor:cs[0].anchor,candidates:cs,style:s,line:g.type.includes('Line'),point:g.type==='Point',pinned:!!f.labelAnchor,priority:g.type.includes('Point')?30:f.category==='缝合带'?20:10});}
 });
 for(const [i,group] of [...groups.values()].entries()){
  const p=file(`map_features_${String(i+1).padStart(3,'0')}.gmt`,group.parts.join('\n')+'\n');
  commands.push(`${prefix}gmt plot ${quote(p)} -R${region} -J${config.projection} ${group.options}`);
 }
 for(const name of ['地图图层.geojson','图层来源.json'])fs.rmSync(path.join(outputDirectory,name),{force:true});
 if(features.length){file('地图图层.geojson',JSON.stringify(m.geoJSON(features),null,2));file('图层来源.json',JSON.stringify([...new Map(features.filter(f=>f.source?.id).map(f=>[f.source.id,f.source])).values()],null,2));}
 if(labels.length){
  const points=[];for(const l of labels)for(const p of l.candidates){p.index=points.length;points.push(p.anchor,p.before||p.anchor,p.after||p.anchor);}
  const input=file('map_label_anchors.tsv',points.map(xy).join('\n')+'\n');
  commands.push(`${prefix}gmt mapproject ${quote(input)} -R${region} -J${config.projection} -Dc > ${quote(shell==='bat'?'map_label_projected.tsv':path.join(outputDirectory,'map_label_projected.tsv'))}`);
  commands.push(`${prefix}gmt mapproject -R${region} -J${config.projection} -Dc -W > ${quote(shell==='bat'?'map_frame_size.tsv':path.join(outputDirectory,'map_frame_size.tsv'))}`);
  file('map_label_styles.json',JSON.stringify({labels,options:c.labelLayout,showScale:config.showScale,scalePosition:config.scalePosition,showLegend:config.legend?.show,legendPosition:config.legend?.position}));
 }
 return {commands,labels};
}
function contourCommand(config,grid,region,quote,prefix='  '){const c=m.contours(config.cartography?.contours);if(!c.show||!grid)return '';
 const base=`${prefix}gmt grdcontour ${quote(grid)} -R${region} -J${config.projection}`;
 if(!c.labels){const lines=[`${base} -C${c.interval} -A- -W${c.width}p,${c.color} -Q${c.minLength}C --PROJ_LENGTH_UNIT=cm`];if(c.major>0)lines.push(`${base} -C${c.major} -A- -W${c.majorWidth}p,${c.color} -Q${c.minLength}C --PROJ_LENGTH_UNIT=cm`);return lines.join('\n');}
 const major=c.major>0?c.major:c.interval;
 return `${base} -C${c.interval} -Gd8c+r${c.labelSpacing}c -A${major}+f${c.fontSize}p,Helvetica,${c.color}+gwhite -Wc${c.width}p,${c.color} -Wa${c.major>0?c.majorWidth:c.width}p,${c.color} -Q${c.minLength}C --PROJ_LENGTH_UNIT=cm`;

}
function readLayout(directory,outputName,config={}){
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
 const scaleLabel=config.showScale&&config.cartography?.paperStyle&&!config.swapAxes
  ? require('./gmt-scale-label').scaleMidpoint(eps,{ox,oy,height,sx:Number(scale[1]),sy:Number(scale[2])}):null;
 if(!fs.existsSync(labelFile))return {width,height,ox,oy,labels:[],scaleLabel};
 const projected=fs.readFileSync(path.join(directory,'map_label_projected.tsv'),'utf8').trim().split(/\r?\n/).map(x=>x.trim().split(/\s+/).map(Number));
 const metadata=JSON.parse(fs.readFileSync(labelFile,'utf8'));
 const convert=i=>({x:ox+(projected[i]?.[0]??NaN)*72/2.54,y:height-oy-(projected[i]?.[1]??NaN)*72/2.54});
 const labels=(metadata.labels||metadata).map((l,i)=>{const cs=(l.candidates||[{index:i}]).map(p=>{const a=convert(p.index),b=convert(p.index+1),d=convert(p.index+2);let angle=Math.atan2(d.y-b.y,d.x-b.x)*180/Math.PI;if(angle>90)angle-=180;if(angle< -90)angle+=180;return {...a,angle:l.line?angle:-l.style.rotation,...(p.length?{span:Math.hypot(d.x-b.x,d.y-b.y)/.07}:{})};});return {...l,...cs[0],candidates:cs};}).filter(l=>Number.isFinite(l.x)&&Number.isFinite(l.y));
 const sizeFile=path.join(directory,'map_frame_size.tsv'),size=fs.existsSync(sizeFile)?fs.readFileSync(sizeFile,'utf8').trim().split(/\s+/).map(Number):[];
 const frame=size.length>=2&&size.every(Number.isFinite)?{x:ox,y:height-oy-size[1]*72/2.54,width:size[0]*72/2.54,height:size[1]*72/2.54}:{x:0,y:0,width,height};
 const obstacles=[];
 const reserve=(position,w,h,fallback)=>{const corner=String(position||fallback).replace(/^j/,'');const p=require('./native-position').parseNativePosition(position)||{x:corner.includes('R')?.97:.03,y:corner.includes('T')?.97:.03,justify:corner};const cx=frame.x+p.x*frame.width,cy=frame.y+(1-p.y)*frame.height;obstacles.push({x:cx-(p.justify.includes('R')?w:p.justify.includes('L')?0:w/2),y:cy-(p.justify.includes('B')?h:p.justify.includes('T')?0:h/2),width:w,height:h});};
 if(metadata.showScale)reserve(metadata.scalePosition,frame.width*.3+18,38,'BR');
 if(metadata.showLegend&&metadata.legendPosition!=='JBC')reserve(metadata.legendPosition,115,48,'TR');
 const result=placement.place({width,height,ox,oy,frame,obstacles,labels,scaleLabel},metadata.options||{enabled:false});
 fs.writeFileSync(path.join(directory,'标注排布报告.json'),JSON.stringify(result.placement,null,2));
 return result;
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function labelSVG(layout){if(!layout)return '';const texts=layout.labels.map(l=>{const s=l.style,lines=l.name.split(/\n|\\n/),fs=s.fontSize,em=fs*1.22;
 if(l.placed){const {x,y,angle}=l.placed,firstY=y-em*(lines.length-1)/2+fs*.34;
 return `<text x="${x}" y="${firstY}" text-anchor="middle" font-family="${escape(s.font)},PingFang SC,Microsoft YaHei,sans-serif" font-size="${fs}" font-weight="${s.bold?700:400}" fill="${s.labelColor}" ${s.halo?'stroke="white" stroke-width="'+(s.haloWidth??1.1)+'" stroke-linejoin="round" paint-order="stroke"':''} transform="rotate(${angle} ${x} ${y})">${lines.map((t,i)=>`<tspan x="${x}" dy="${i?em:0}">${escape(t)}</tspan>`).join('')}</text>`;}
 let x=l.x+s.dx*72/25.4,y=l.y-s.dy*72/25.4;const pad=s.size*72/2.54/2+2;
 const pos=s.position,align=pos==='left'?'end':pos==='right'?'start':'middle';if(pos==='left')x-=pad;if(pos==='right')x+=pad;
 if(pos==='above')y-=pad+em*(lines.length-1)+fs*.25;else if(pos==='below')y+=pad+fs;else y-=em*(lines.length-1)/2-fs*.33;
 return `<text x="${x}" y="${y}" text-anchor="${align}" font-family="${escape(s.font)},PingFang SC,Microsoft YaHei,sans-serif" font-size="${fs}" font-weight="${s.bold?700:400}" fill="${s.labelColor}" ${s.halo?'stroke="white" stroke-width="'+(s.haloWidth??1.6)+'" stroke-linejoin="round" paint-order="stroke"':''} transform="rotate(${-s.rotation} ${x} ${y})">${lines.map((t,i)=>`<tspan x="${x}" dy="${i?em:0}">${escape(t)}</tspan>`).join('')}</text>`;
 }).join('\n');const tick=layout.scaleLabel;
 const scaleText=tick?`<text x="${tick.x}" y="${tick.y}" text-anchor="middle" dominant-baseline="hanging" font-family="Helvetica,Arial,sans-serif" font-size="${tick.fontSize}" fill="#404040">${escape(tick.text)}</text>`:'';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}pt" height="${layout.height}pt" viewBox="0 0 ${layout.width} ${layout.height}">${texts}${scaleText}</svg>`;}
module.exports={scriptParts,contourCommand,readLayout,labelSVG};
