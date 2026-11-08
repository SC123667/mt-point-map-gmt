// MTpy participates in the main workbench's render/export lifecycle.
const fs=require('fs'),path=require('path');
const engine=require('./mtpy-engine'),exportsMT=require('./mtpy-export');
const {areaOutputDirectory}=require('./workspace');
const jobs=new Map();
const active=type=>['phaseTensorMap','tipperMap'].includes(type);
function cancel(id){const job=jobs.get(id);if(!job)return false;job.cancelled=true;job.child?.kill();return true;}
function create(services){
 async function render(event,payload){
  const id=event.sender.id;if(jobs.has(id))throw Error('MTpy 正在绘图');
  const job={cancelled:false,child:null};jobs.set(id,job);
  const check=()=>{if(job.cancelled||event.sender.isDestroyed())throw Error('MTpy 绘图已取消');};
  const progress=(message,percent)=>{if(!event.sender.isDestroyed())event.sender.send('gmt:progress',{message,percent});};
  let output;
  try{
   const config=services.normalizeTerrainConfig(payload),settings=config.mtpy||{};
   const files=[...new Set((payload.records||[]).map(r=>r.sourcePath).filter(f=>/\.edi$/i.test(f||'')))];
   if(!files.length)throw Error('MTpy 绘图需要原始 EDI 文件');
   const root=areaOutputDirectory(config);fs.mkdirSync(root,{recursive:true});
   output=fs.mkdtempSync(path.join(root,'MTpy-'));
   const bounds=String(config.region||'').split('/').map(Number);
   const periods=Array.isArray(settings.periods)?settings.periods:String(settings.periods||'1,10,100,1000').split(/[,，;；\s]+/).filter(Boolean).map(Number);
   const presentation=require('./presentation').validate(config.presentation);
   const result=await engine.run({...settings,presentation,action:'render',files,periods,output,
    mode:config.plotType==='tipperMap'?'tipper':settings.mode||'combined',bounds:bounds.length===4?bounds:undefined,
    labels:!!config.showLabels,showGrid:!!config.showGrid,showScale:!!config.showScale,labelFontSize:config.labelFontSize,
    pngDpi:config.pngDpi,preview:!!config.terrainPreview,aiLayers:(payload.formats||[]).includes('ai')||!!config.illustratorPackage,
    title:config.showTitle?config.title:'',
   },{onChild:child=>job.child=child,onProgress:p=>progress(p.message,Math.min(70,p.percent*.7))});
   job.child=null;check();
   progress('GMT 地形与构造图层',74);
   result.background=await require('./mtpy-layers').prepare(services,event.sender,config,result,{terrain:config.showTerrain,structures:true});check();
   await require('./mtpy-annotations').prepare(result);check();
   result.pdf=await exportsMT.composePDF(result);check();
   result.pngDpi=config.pngDpi;result.previewOnly=!!config.terrainPreview;
   progress('正在生成图件',88);await exportsMT.refreshOutputs(result);check();
   const requested=payload.formats||['png'];
   const outputName=require('./terrain-cache').safeName(config.outputName||'mtpy_map');
   const exported=[];
   for(const ext of requested.filter(e=>['png','pdf','eps','svg'].includes(e))){
    const source=ext==='pdf'?result.pdf:ext==='png'?result.preview:path.join(output,'多周期组图.'+ext);
    if(!fs.existsSync(source))await exportsMT.convert(result.pdf,source,ext);
    const dest=path.join(output,outputName+'.'+ext);fs.copyFileSync(source,dest);exported.push(dest);
   }
   if(requested.includes('ai')||config.illustratorPackage){
    const layers=await require('./mtpy-ai').composeLayers(result);check();
    const script=exportsMT.makeAIJob(result.pdf,output,{allowRaster:!!result.background,layers,fontFamily:result.presentation?.fontFamily});
    if(requested.includes('ai')){
     progress('正在导出 Illustrator AI',95);const direct=require('./illustrator-direct');
     exported.push(await direct.exportNativeAI(script,path.join(output,outputName+'.ai'),await direct.findIllustrator()));
    }else exported.push(script);
   }
   check();
   fs.writeFileSync(path.join(output,'工作台设置.json'),JSON.stringify(config,null,2));
   progress('绘图完成',100);
   return {ok:true,files:exported,preview:result.preview,outputDirectory:output,mtpy:result};
  }catch(error){if(output)fs.writeFileSync(path.join(output,'未完成.txt'),String(error.message));throw error;}
  finally{jobs.delete(id);}
 }
 return {render,cancel,active};
}
module.exports={create,active,cancel};
