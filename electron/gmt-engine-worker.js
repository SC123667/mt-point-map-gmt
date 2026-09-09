// Version probing and selection stay out of the Electron UI process.
process.on('message',message=>{
 if(message?.type!=='start')return;
 try{
  const e=require('./gmt-engine'),gmt=require('./gmt'),p=message.payload||{};
  if(p.mode==='select')e.savePreference(p.path||'');
  const engines=e.list(true),gmtInfo=gmt.resolveGMT();
  process.send({type:'result',result:{engines,preferred:e.preference(),gmtInfo,gmtAvailable:gmtInfo.available,installPlan:gmt.installPlan()}},()=>process.exit(0));
 }catch(error){process.send({type:'error',message:error.message},()=>process.exit(1));}
});
