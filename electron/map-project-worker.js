// Projection runs in its own process and uses the same GMT projection as the map.
const {spawn}=require('child_process');
const path=require('path');
const {resolveGMT}=require('./gmt');
const {workspaceDirectory,asciiWorkspaceRoot}=require('./workspace');
const fs=require('fs');
async function project(p){
 const {frame,config,inverse}=p,points=p.points||[];
 if(!frame||![frame.width,frame.height,frame.ox,frame.oy].every(Number.isFinite)||frame.width<=0||frame.height<=0)throw new Error('请先更新地图预览，再编辑节点。');
 if(!points.length)return [];
 if(points.length>100000||points.some(a=>a.length!==2||!a.every(Number.isFinite)))throw new Error('投影坐标无效或数量过多。');
 const r=String(config.region).split('/').map(Number);if(r.length!==4||!r.every(Number.isFinite))throw new Error('地图范围无效。');
 const region=config.swapAxes?[r[2],r[3],r[0],r[1]]:r;
 const input=points.map(a=>inverse?[(a[0]*frame.width-frame.ox)*2.54/72,((1-a[1])*frame.height-frame.oy)*2.54/72]:config.swapAxes?[a[1],a[0]]:a);
 const working=process.platform==='win32'?path.join(asciiWorkspaceRoot(),'runtime','map-projection'):workspaceDirectory('临时文件/坐标投影');fs.mkdirSync(working,{recursive:true});
 const userDirectory=path.join(working,'gmt-user');fs.mkdirSync(userDirectory,{recursive:true});
 const gmt=resolveGMT();if(!gmt.available)throw new Error('未找到 GMT。');
 const args=['mapproject','-R'+region.join('/'),'-J'+config.projection,'-Dc','--FORMAT_FLOAT_OUT=%.12g',...(inverse?['-I']:[])];
 const stdout=await new Promise((resolve,reject)=>{let out='',err='';const child=spawn(path.join(gmt.binDir,process.platform==='win32'?'gmt.exe':'gmt'),args,{cwd:working,env:{...process.env,GMT_USERDIR:userDirectory}});const timer=setTimeout(()=>{child.kill();reject(new Error('坐标投影超时。'));},20000);child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code?reject(new Error(err||'坐标转换失败')):resolve(out);});child.stdin.end(input.map(a=>a.join('\t')).join('\n')+'\n');});
 const rows=stdout.trim().split(/\r?\n/).map(l=>l.split(/\s+/).slice(0,2).map(Number));
 if(rows.length!==points.length||rows.some(a=>!a.every(Number.isFinite)))throw new Error('节点超出当前投影可用范围。');
 return rows.map(a=>inverse?(config.swapAxes?[a[1],a[0]]:a):[(frame.ox+a[0]*72/2.54)/frame.width,1-(frame.oy+a[1]*72/2.54)/frame.height]);
}
if(require.main===module){process.on('message',async m=>{if(m.type!=='start')return;try{const result=await project(m.payload);process.send({type:'result',result},()=>process.exit());}catch(e){process.send({type:'error',message:e.message},()=>process.exit(1));}});}
module.exports={project};
