#target illustrator
(function () {
  var info=/*GMT_METADATA*/;
  var automation=/*GMT_AUTOMATION*/null;
  function checkCancelled(){if(automation&&new File(automation.cancelPath).exists)throw new Error("AI export cancelled");}
  var folder=new File($.fileName).parent;
  var previous=app.documents.length?app.activeDocument:null;
  var interaction=app.userInteractionLevel, doc=null, overlay=null;
  var operationCount=0, terrain=null,stage=null;
  var pdfPage=app.preferences.PDFFileOptions.pageToOpen;
  function insideRectangle(item, mask) {
    if(mask.typename!=='PathItem'||mask.pathPoints.length!==4)return false;
    var bounds=mask.geometricBounds, points=mask.pathPoints;
    for(var p=0;p<4;p++){
      var v=points[p],a=v.anchor;
      if(a[0]!==v.leftDirection[0]||a[1]!==v.leftDirection[1]||a[0]!==v.rightDirection[0]||a[1]!==v.rightDirection[1])return false;
      if(Math.min(Math.abs(a[0]-bounds[0]),Math.abs(a[0]-bounds[2]))>.01||Math.min(Math.abs(a[1]-bounds[1]),Math.abs(a[1]-bounds[3]))>.01)return false;
    }
    var b=item.visibleBounds;return b[0]>=bounds[0]&&b[1]<=bounds[1]&&b[2]<=bounds[2]&&b[3]>=bounds[3];
  }
  function flatten(item, layer, masks) {
    checkCancelled();
    masks=masks||[];
    if(++operationCount>100000)throw new Error('图件对象过多，已停止自动拆组。原始 PDF/SVG 保留在编辑包中。');
    if(item.typename==='GroupItem'&&item.opacity===100&&item.blendingMode===BlendModes.NORMAL) {
      var children=[],clip=null;for(var k=0;k<item.pageItems.length;k++){
        var child=item.pageItems[k];children.push(child);
        if(item.clipped&&((child.typename==='PathItem'&&child.clipping)||(child.typename==='CompoundPathItem'&&child.pathItems.length&&child.pathItems[0].clipping)))clip=child;
      }
      if(item.clipped&&!clip){item.move(layer,ElementPlacement.PLACEATEND);return;}
      var nested=clip?masks.concat([clip]):masks;
      for(var k=0;k<children.length;k++)if(children[k]!==clip)flatten(children[k],layer,nested);
      try{item.remove();}catch(ignored){} // Illustrator may remove emptied groups automatically.
    } else {
      var parent=(item.typename==='RasterItem'&&terrain)?terrain:layer, wrappers=[];
      for(var m=0;m<masks.length;m++)if(!insideRectangle(item,masks[m])){
        var wrapper=parent.groupItems.add();wrapper.move(parent,ElementPlacement.PLACEATEND);
        var mask=masks[m].duplicate(wrapper,ElementPlacement.PLACEATBEGINNING);
        if(mask.typename==='PathItem'){mask.filled=false;mask.stroked=false;}
        wrappers.push(wrapper);parent=wrapper;
      }
      item.move(parent,ElementPlacement.PLACEATEND);
      for(var w=wrappers.length-1;w>=0;w--)wrappers[w].clipped=true;
    }
  }
  try {
    checkCancelled();
    app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
    var baseFile=new File(folder.fsName+'/base-map.pdf'),labelFile=new File(folder.fsName+'/labels.svg');
    if(!baseFile.exists||!labelFile.exists)throw new Error('请保留完整编辑包：缺少底图 PDF 或标注 SVG。');
    // Illustrator's PDF importer can stall on FileProvider/Unicode paths.
    // Stage only the inputs in its own temporary folder; final files stay in the package.
    stage=new Folder(Folder.temp.fsName+'/gmt-ai-'+new Date().getTime());
    if(!stage.create()||!baseFile.copy(stage.fsName+'/base.pdf')||!labelFile.copy(stage.fsName+'/labels.svg'))throw new Error('无法准备 AI 导入临时文件。');
    app.preferences.PDFFileOptions.pageToOpen=1;
    doc=app.open(new File(stage.fsName+'/base.pdf'));
    var bounds=doc.artboards[0].artboardRect;
    if(info.plotType!=='responseCurve'){terrain=doc.layers.add();terrain.name='地形影像';}
    var base=doc.layers.add();base.name=info.plotType==='responseCurve'?'响应曲线与坐标轴':'底图与构造线';
    var old=[];for(var i=0;i<doc.layers.length;i++)if(doc.layers[i]!==base&&doc.layers[i]!==terrain)old.push(doc.layers[i]);
    for(var i=0;i<old.length;i++){while(old[i].pageItems.length)flatten(old[i].pageItems[0],base);old[i].remove();}
    doc.artboards[0].artboardRect=[bounds[0],bounds[1]+info.title,bounds[2],bounds[3]-info.footer];
    var target=doc.artboards[0].artboardRect;
    if(info.groups&&info.groups.length){
    overlay=app.open(new File(stage.fsName+'/labels.svg'));
    var source=overlay.artboards[0].artboardRect;
    var names=['GMT_names','GMT_legend','GMT_elements','GMT_inset'], labels=['名称标注','图例','图件元素','局部放大标注'];
    for(var n=0;n<names.length;n++){
      overlay.activate();var found=null;for(var k=0;k<overlay.groupItems.length;k++)if(overlay.groupItems[k].name.replace(/ /g,'_')===names[n]){found=overlay.groupItems[k];break;}
      if(!found){if(info.groups&&info.groups.join('|').indexOf(names[n])>=0)throw new Error('SVG 分组未正确导入：'+names[n]);continue;}
      var original=found.position;
      doc.activate();var layer=doc.layers.add();layer.name=labels[n];
      var copy=found.duplicate(layer,ElementPlacement.PLACEATEND);
      var actual=copy.position;
      // Illustrator centers cross-document duplicates; align from measured positions.
      copy.translate(original[0]+target[0]-source[0]-actual[0],original[1]+target[1]-source[1]-actual[1]);
      flatten(copy,layer);
    }
    overlay.close(SaveOptions.DONOTSAVECHANGES);overlay=null;
    }
    doc.activate();
    if(info.westernFont==='Times New Roman'){
      var fontNames=['TimesNewRomanPSMT','TimesNewRomanPS-BoldMT','TimesNewRomanPS-ItalicMT','TimesNewRomanPS-BoldItalicMT'],fonts=[];
      for(var f=0;f<fontNames.length;f++){
        try{fonts.push(app.textFonts.getByName(fontNames[f]));}
        catch(fontError){throw new Error('请安装 Times New Roman（常规、粗体、斜体、粗斜体）后重新导出 AI。缺少：'+fontNames[f]);}
      }
      for(var t=0;t<doc.textFrames.length;t++){
        checkCancelled();var characters=doc.textFrames[t].textRange.characters;
        for(var ch=0;ch<characters.length;ch++){
          var character=characters[ch],code=character.contents.charCodeAt(0);
          // Latin, Greek units and mathematical symbols; leave CJK fallback intact.
          if(code<=0x024f||(code>=0x0370&&code<=0x03ff)||(code>=0x2000&&code<=0x22ff)){
            var attributes=character.characterAttributes,oldName=attributes.textFont.name.toLowerCase();
            var bold=/bold|black|heavy/.test(oldName),italic=/italic|oblique/.test(oldName);
            attributes.textFont=fonts[(bold?1:0)+(italic?2:0)];
          }
        }
      }
    }
    var options=new IllustratorSaveOptions();options.pdfCompatible=true;options.compressed=true;
    var output=new File(automation?automation.outputPath:folder.fsName+'/可编辑图件.ai');
    if(output.exists)output=new File(output.fsName.replace(/\.ai$/i,'')+'_'+new Date().getTime()+'.ai');
    checkCancelled();
    doc.saveAs(output,options);
    if(automation){
      doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;
      try{if(previous)previous.activate();}catch(ignored){}
      var result=new File(automation.resultPath);result.encoding="UTF-8";
      if(!result.open("w"))throw new Error("Cannot write AI result");
      result.write(output.fsName);result.close();
    }
    if(!automation&&typeof GMT_QA!=='undefined'&&GMT_QA){
      var frame=doc.textFrames.length?doc.textFrames[0]:null;
      if(frame){var before=frame.contents,position=frame.position;frame.contents=before+' QA';if(frame.contents!==before+' QA')throw new Error('Text edit failed');frame.contents=before;frame.translate(3,2);frame.position=position;}
      var report=[];report.push('paths='+doc.pathItems.length,'rasters='+doc.rasterItems.length,'texts='+doc.textFrames.length);
      for(var t=0;t<doc.textFrames.length;t++)report.push(doc.textFrames[t].contents);
      var f=new File(folder.fsName+'/AI验证.txt');f.encoding='UTF-8';f.open('w');f.write(report.join('\n'));f.close();
      var png=new ExportOptionsPNG24();png.artBoardClipping=true;png.transparency=false;png.horizontalScale=200;png.verticalScale=200;
      doc.exportFile(new File(folder.fsName+'/AI预览.png'),ExportType.PNG24,png);
      doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;try{if(previous)previous.activate();}catch(ignored){}
    }
  } catch(error) {
    try{if(overlay)overlay.close(SaveOptions.DONOTSAVECHANGES);}catch(ignored){}
    try{if(doc)doc.close(SaveOptions.DONOTSAVECHANGES);}catch(ignored){}
    try{if(previous)previous.activate();}catch(ignored){}
    throw new Error(String(error)+' (line '+error.line+')');
  } finally {
    app.userInteractionLevel=interaction;app.preferences.PDFFileOptions.pageToOpen=pdfPage;
    if(stage){var files=stage.getFiles();for(var i=0;i<files.length;i++)files[i].remove();stage.remove();}
  }
}());
