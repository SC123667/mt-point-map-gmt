// Reopen the saved native AI; move/recolor one object and edit one text frame
// in memory, verify its neighbour stays put, then discard all test edits.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {execFileSync}=require('child_process');
const {findIllustrator,bridge}=require('../electron/illustrator-direct');
(async()=>{
 const input=process.argv[2],output=process.argv[3];assert(input&&output);
 const stage=fs.mkdtempSync(path.join(os.tmpdir(),'mtpy-ai-edit-'));fs.copyFileSync(input,path.join(stage,'test.ai'));
 const script=`#target illustrator
 (function(){var previous=app.documents.length?app.activeDocument:null,interaction=app.userInteractionLevel,d=null;
 function equal(a,b){for(var k=0;k<a.length;k++)if(Math.abs(a[k]-b[k])>.00001)return false;return true;}
 try{app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;d=app.open(new File(${JSON.stringify(path.join(stage,'test.ai'))}));
 var checked=0,periods=0;
 for(var n=0;n<d.layers.length;n++){var period=d.layers[n];if(period.name.indexOf('T = ')!==0)continue;periods++;
  var roles=['相位张量椭圆','感应箭头·实部','感应箭头·虚部'];
  for(var r=0;r<roles.length;r++){var layer;try{layer=period.layers.getByName(roles[r]);}catch(e){continue;}
   var items=[];for(var k=0;k<layer.pageItems.length&&items.length<2;k++)if(layer.pageItems[k].typename==='PathItem'&&layer.pageItems[k].filled)items.push(layer.pageItems[k]);
   if(items.length<2)throw Error('No directly editable paths in '+roles[r]);
   var one=items[0],other=items[1],before=one.geometricBounds,neighbour=other.geometricBounds,old=one.fillColor;
   if(r>0&&(!one.stroked||!other.stroked))throw Error('Arrow fill and outline are separate objects');
   d.selection=null;one.selected=true;if(d.selection.length!==1||d.selection[0].typename!=='PathItem')throw Error('Selection is grouped');
   one.translate(7,3);var after=one.geometricBounds;
   if(Math.abs(after[0]-before[0]-7)>.001||!equal(other.geometricBounds,neighbour))throw Error('Moving one path moved another');
   var color=new RGBColor();color.red=255;color.green=0;color.blue=255;one.fillColor=color;
   if(one.fillColor.red!==255)throw Error('Color edit failed');one.fillColor=old;one.translate(-7,-3);one.selected=false;checked++;
  }
 }
 if(!periods||checked<periods)throw Error('No period/object checks');
 var text=d.textFrames[0],oldText=text.contents;text.contents=oldText+'QA';if(text.contents===oldText)throw Error('Text edit failed');text.contents=oldText;
 var proof=new File(${JSON.stringify(output)});proof.open('w');proof.write('periods='+periods+'\\nindependentSelectionMoveColorChecks='+checked+'\\ntextEdit=passed\\nlayers='+d.layers.length);proof.close();
 }finally{if(d)d.close(SaveOptions.DONOTSAVECHANGES);app.userInteractionLevel=interaction;if(previous)previous.activate();}})();`;
 const file=path.join(stage,'check.jsx');fs.writeFileSync(file,script.replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')));
 try{const command=bridge(await findIllustrator(),file);execFileSync(command.file,command.args,{timeout:180000});assert(fs.readFileSync(output,'utf8').includes('textEdit=passed'));console.log('MTPY_AI_EDITABILITY_OK',fs.readFileSync(output,'utf8'));}
 finally{fs.rmSync(stage,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
