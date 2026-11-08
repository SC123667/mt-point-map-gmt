const controller=new AbortController();let started=false;
process.on('disconnect',()=>controller.abort());
process.on('message',async message=>{
 if(message?.type==='cancel'){controller.abort();return;}
 if(message?.type!=='start'||started)return;started=true;
 try{const result=message.payload?.mode==='findCache'?await require('./em3dvp-elevation').findCachedGrid(message.payload.config,{signal:controller.signal}):await require('./em3dvp-elevation').exportElevation(message.payload,{signal:controller.signal,onProgress:progress=>{if(process.connected)process.send({type:'progress',progress});}});if(process.connected)process.send({type:'result',result},()=>process.exit(0));else process.exit(0);}
 catch(error){if(process.connected)process.send({type:'error',message:error.message},()=>process.exit(1));else process.exit(1);}
});
