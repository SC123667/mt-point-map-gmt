const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const engine=require('./gmt-engine');
// Homebrew owns dependency installation. Never download a fabricated macOS DMG,
// silently install a different GMT minor, or clean unrelated installed packages.
class BrewInstallTask {
 constructor(brew,directory,onProgress,onDone){Object.assign(this,{brew,directory,onProgress,onDone,state:'starting',message:'检查 Homebrew 的 GMT 版本...',done:false,cancelled:false,child:null});}
 statusPayload(){return {state:this.state,message:this.message,fileName:'GMT 6.7 + Ghostscript',percent:this.state==='completed'?100:0,downloaded:0,total:0,speed:0,canPause:false};}
 emit(){this.onProgress?.(this.statusPayload());}
 run(args){return new Promise((resolve,reject)=>{
  const log=fs.createWriteStream(path.join(this.directory,'安装日志.txt'),{flags:'a'});
  const child=this.child=spawn(this.brew,args,{detached:true,env:{...process.env,HOMEBREW_NO_AUTO_UPDATE:'1',HOMEBREW_NO_INSTALL_CLEANUP:'1',HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK:'1',HOMEBREW_DOWNLOAD_CONCURRENCY:'1',HOMEBREW_CACHE:path.join(this.directory,'Homebrew缓存')},stdio:['ignore','pipe','pipe']});
  log.on('error',error=>{this.cancel();reject(new Error('无法写入安装日志：'+error.message));});
  let output='',last=0;
  child.stdout.on('data',chunk=>{output+=chunk;log.write(chunk);});
  child.stderr.on('data',chunk=>{log.write(chunk);if(Date.now()-last>500){last=Date.now();this.message=String(chunk).trim().slice(-350)||this.message;this.emit();}});
  child.on('error',e=>{log.end();reject(e);});child.on('close',code=>{this.child=null;log.end();code===0?resolve(output):reject(new Error(this.cancelled?'安装已取消，可稍后重试。':'Homebrew 安装失败，详情见安装日志。'));});
 });}
 async start(){
  try{
   fs.mkdirSync(this.directory,{recursive:true});this.emit();
   const info=JSON.parse(await this.run(['info','--json=v2','gmt'])),version=info.formulae?.[0]?.versions?.stable;
   if(!engine.recommended(version))throw new Error(`Homebrew 当前提供 GMT ${version||'未知版本'}，不是 6.7；已停止，避免安装错误版本。`);
   if(this.cancelled)return;
   this.state='installing';this.message='正在安装 GMT 6.7 与 Ghostscript，首次安装需要下载依赖...';this.emit();
   await this.run(['install','gmt','ghostscript']);
   const binary=path.join(path.dirname(this.brew),'gmt'),gmt=engine.probe({path:binary});
   if(!gmt.available||!engine.recommended(gmt.version))throw new Error('安装完成后未检测到可运行的 GMT 6.7。');
   this.state='completed';this.message=`GMT ${gmt.version} 安装完成。可在引擎选择中切换。`;
  }catch(e){this.state=this.cancelled?'cancelled':'failed';this.message=e.message;}
  finally{this.done=true;this.emit();this.onDone?.();}
 }
 pause(){} resume(){}
 cancel(){if(this.done)return;this.cancelled=true;this.state='cancelled';this.message='正在取消安装...';this.emit();if(this.child){try{process.kill(-this.child.pid,'SIGINT');}catch{this.child.kill('SIGINT');}}}
}
module.exports={BrewInstallTask};
