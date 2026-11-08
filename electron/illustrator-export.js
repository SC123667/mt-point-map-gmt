const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// Runs in the hidden decoration window, after fonts and layout have settled.
function collectEditableSVG(pageWidth) {
  const ns = 'http://www.w3.org/2000/svg';
  const scale = pageWidth / document.body.getBoundingClientRect().width;
  const out = document.createElementNS(ns, 'svg');
  out.setAttribute('xmlns', ns);
  out.setAttribute('width', pageWidth + 'pt');
  const height = document.body.getBoundingClientRect().height * scale;
  out.setAttribute('height', height + 'pt');
  out.setAttribute('viewBox', `0 0 ${pageWidth} ${height}`);
  function group(id) { const g = document.createElementNS(ns, 'g'); g.id=id; out.appendChild(g); return g; }
  function svg(el, parent) {
    const r=el.getBoundingClientRect(), c=el.cloneNode(true);
    c.removeAttribute('style'); c.setAttribute('x',r.x*scale); c.setAttribute('y',r.y*scale);
    c.setAttribute('width',r.width*scale); c.setAttribute('height',r.height*scale);
    // White text strokes make Illustrator duplicate or outline the letters.
    for(const t of c.querySelectorAll('text,tspan')) { t.removeAttribute('stroke');t.removeAttribute('stroke-width');t.removeAttribute('paint-order');t.style.stroke='none'; }
    parent.appendChild(c);
  }
  function text(el, parent) {
    const c=getComputedStyle(el),r=el.getBoundingClientRect();
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=c.font;
    const font=parseFloat(c.fontSize),line=parseFloat(c.lineHeight)||font*1.2;
    const value=el.textContent.trim();if(!value)return;
    // Read Chromium's actual line layout. Canvas advances differ from DOM
    // kerning/fallback fonts and used to push a closing parenthesis onto an
    // invented extra line, without reserving any space in the legend.
    const lines=[],walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      let offset=0;
      for(const char of node.textContent){
        const range=document.createRange();range.setStart(node,offset);offset+=char.length;range.setEnd(node,offset);
        const rect=Array.from(range.getClientRects()).find(v=>v.width>0&&v.height>0);
        if(!rect)continue;
        let row=lines.at(-1);
        if(!row||Math.min(row.bottom,rect.bottom)-Math.max(row.top,rect.top)<=Math.min(row.bottom-row.top,rect.height)/2){
          row={text:'',x:rect.left,top:rect.top,bottom:rect.bottom};lines.push(row);
        }
        row.text+=char;row.x=Math.min(row.x,rect.left);row.top=Math.min(row.top,rect.top);row.bottom=Math.max(row.bottom,rect.bottom);
      }
    }
    if(!lines.length)return;
    const t=document.createElementNS(ns,'text');
    t.setAttribute('font-family',c.fontFamily);t.setAttribute('font-size',font*scale);t.setAttribute('font-weight',c.fontWeight);t.setAttribute('fill',c.color);
    const metrics=ctx.measureText('Hg');const ascent=metrics.fontBoundingBoxAscent||font*.9,descent=metrics.fontBoundingBoxDescent||font*.22;
    lines.forEach(row=>{const span=document.createElementNS(ns,'tspan');
      span.setAttribute('x',row.x*scale);span.setAttribute('y',((el.classList.contains('title')?r.bottom-parseFloat(c.paddingBottom)-line:r.y)+(line-ascent-descent)/2+ascent+row.top-lines[0].top)*scale);span.textContent=row.text.trim();t.appendChild(span);});
    parent.appendChild(t);
  }
  const names=group('GMT_names');document.querySelectorAll('.map-wrap > svg').forEach(el=>svg(el,names));
  const legend=group('GMT_legend');
  document.querySelectorAll('.native-legend-entry > svg').forEach(el=>svg(el,legend));
  document.querySelectorAll('.native-legend-title,.native-legend-entry > span').forEach(el=>text(el,legend));
  const elements=group('GMT_elements');
  document.querySelectorAll('.title,.native-scale-label,.native-scale-ticks > span').forEach(el=>text(el,elements));
  document.querySelectorAll('.native-compass > svg').forEach(el=>svg(el,elements));
  document.querySelectorAll('.native-scale-bar,.native-scale-bar > span').forEach(el=>{
    const r=el.getBoundingClientRect(),c=getComputedStyle(el),rect=document.createElementNS(ns,'rect');
    for(const [key,val] of Object.entries({x:r.x,y:r.y,width:r.width,height:r.height}))rect.setAttribute(key,val*scale);
    rect.setAttribute('fill',c.backgroundColor);rect.setAttribute('stroke',c.borderTopColor);rect.setAttribute('stroke-width',parseFloat(c.borderTopWidth)*scale);elements.appendChild(rect);
  });
  return {svg:new XMLSerializer().serializeToString(out),groups:Array.from(out.children).filter(g=>g.childNodes.length).map(g=>g.id)};
}
async function writeIllustratorPackage(directory, name, basePDF, rendered) {
  const doc=await PDFDocument.load(basePDF),size=doc.getPage(0).getSize();
  const destination=path.join(directory,`${name}_AI编辑包`);
  await fs.promises.mkdir(destination,{recursive:true});
  const scale=size.width/rendered.imageSize.width;
  const info={westernFont:rendered.plotType==='responseCurve'?'Times New Roman':null,plotType:rendered.plotType||"map",width:size.width,height:size.height,title:rendered.titleHeight*scale,footer:rendered.footerHeight*scale,groups:rendered.editingGroups||[]};
  await fs.promises.writeFile(path.join(destination,'base-map.pdf'),basePDF);
  await fs.promises.writeFile(path.join(destination,'labels.svg'),rendered.editingSVG);
  const template=await fs.promises.readFile(path.join(__dirname,'illustrator-template.jsx'),'utf8');
  await fs.promises.writeFile(path.join(destination,'生成可编辑AI.jsx'),template.replace('/*GMT_METADATA*/',JSON.stringify(info)).replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')));
  await fs.promises.writeFile(path.join(destination,'使用说明.txt'),
    (rendered.plotType==='responseCurve'?'本包包含所选 EDI 测点的视电阻率与相位曲线。AI 脚本将西文设为 Times New Roman（保留粗体/斜体），中文保持回退字体；需要本机安装 Times New Roman。曲线、数据符号、误差棒、坐标轴及文字保留矢量对象；在“响应曲线与坐标轴”层中编辑。\n':'') + '在 Illustrator 中选择：文件 → 脚本 → 其他脚本，运行本文件夹的「生成可编辑AI.jsx」。\n生成后直接打开「可编辑图件.ai」，不要把它置入现有画板。\n名称和图例保留完整文字对象；编辑版不加白色文字描边，可在 AI 外观面板添加。\n底图与构造保留矢量路径；需要保留的地图裁剪组可用直接选择工具 A 编辑内部路径。\n地形晕渲本身是影像，不能变成可修改高程的矢量。\n脚本仅打开本文件夹的副本，不修改原工程或原始导出。请将整个文件夹一起移动。\n');
  return path.join(destination,'生成可编辑AI.jsx');
}
module.exports={collectEditableSVG,writeIllustratorPackage};
