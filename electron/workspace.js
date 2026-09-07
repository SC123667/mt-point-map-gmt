const fs=require('fs');
const path=require('path');
const os=require('os');
const {ensureCacheRoot,safeName,placeName,regionLabel}=require('./terrain-cache');
function workspaceRoot(){return path.resolve(process.env.MT_GMT_WORKSPACE || (process.platform==='darwin'?'/Volumes/MacBook Pro SSD/GMT-缓存':path.join(os.homedir(),'Documents','GMT工作区')));}
function workspaceDirectory(category){const root=ensureCacheRoot(workspaceRoot());const dir=path.join(root,category);fs.mkdirSync(dir,{recursive:true});return dir;}
function areaOutputDirectory(config={}){
  const category=config.terrainPreview?'预览文件':'导出图件';
  const root=workspaceDirectory(category);
  let area='未指定区域';
  if(config.region){try{area=`${safeName(config.terrainRegionName||placeName(config.region))}__${regionLabel(config.region)}`;}catch{}}
  const dir=path.join(root,area);fs.mkdirSync(dir,{recursive:true});return dir;
}
function workspaceFile(file){
  const root=workspaceRoot(), target=path.resolve(file),rel=path.relative(root,target);
  if(rel.startsWith('..'+path.sep)||rel==='..'||path.isAbsolute(rel))throw new Error(`请将软件生成的文件保存到全局工作目录内：${root}`);
  ensureCacheRoot(root);fs.mkdirSync(path.dirname(target),{recursive:true});return target;
}
// GMT on Windows still needs ASCII paths. Only the directory junction is outside
// the workspace; all data behind it remains in the global workspace.
function asciiWorkspaceRoot(){
  const root=workspaceRoot();
  if(process.platform!=='win32'||/^[\x00-\x7F]+$/.test(root))return ensureCacheRoot(root);
  const crypto=require('crypto');
  const id=crypto.createHash('sha1').update(root).digest('hex').slice(0,10);
  for(const base of [process.env.PUBLIC,process.env.ProgramData].filter(Boolean)){
    if(!/^[\x00-\x7F]+$/.test(base))continue;
    const alias=path.join(base,'MTPointMapGMT','workspace-'+id);
    try{fs.mkdirSync(path.dirname(alias),{recursive:true});if(!fs.existsSync(alias))fs.symlinkSync(ensureCacheRoot(root),alias,'junction');if(fs.realpathSync(alias)===fs.realpathSync(root))return alias;}catch{}
  }
  throw new Error('无法建立 GMT 的英文路径入口，请使用可写的全局工作目录。');
}
module.exports={workspaceRoot,workspaceDirectory,areaOutputDirectory,workspaceFile,asciiWorkspaceRoot};
