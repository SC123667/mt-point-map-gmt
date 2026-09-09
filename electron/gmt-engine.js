const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const RECOMMENDED='6.7.0';
let cached;
const versionParts=v=>String(v||'').match(/^(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number);
function supported(v){const p=versionParts(v);return !!p&&p[0]===6&&p[1]>=5;}
function recommended(v){const p=versionParts(v);return !!p&&p[0]===6&&p[1]===7;}
function compare(a,b){const av=versionParts(a)||[],bv=versionParts(b)||[];for(let i=0;i<3;i++)if(av[i]!==bv[i])return (av[i]||0)-(bv[i]||0);return 0;}
function select(engines,preferred=''){
 if(preferred)return engines.find(e=>e.path===preferred&&e.available)||{available:false,path:preferred,version:'',message:'指定的 GMT 不可用，请重新选择；没有自动切换到其他版本。'};
 return engines.filter(e=>e.available).sort((a,b)=>Number(recommended(b.version))-Number(recommended(a.version))||compare(b.version,a.version))[0]||{available:false,path:'',version:'',message:'未找到 GMT 6.5 或更新的 GMT 6.x。推荐安装 GMT 6.7。'};
}
function settingsPath(){return path.join(require('./workspace').workspaceRoot(),'运行数据','GMT引擎.json');}
function preference(){if(process.env.MT_GMT_PATH)return process.env.MT_GMT_PATH;try{return JSON.parse(fs.readFileSync(settingsPath(),'utf8')).path||'';}catch(e){if(e.code==='ENOENT')return '';throw new Error('GMT 引擎设置无法读取：'+e.message);}}
function candidates(){
 const out=[],seen=new Set(),add=(p,source)=>{if(p&&!seen.has(p)){seen.add(p);out.push({path:p,source});}};
 add(preference(),'指定引擎');
 for(const dir of String(process.env.PATH||'').split(path.delimiter).filter(Boolean))add(path.join(dir,process.platform==='win32'?'gmt.exe':'gmt'),'PATH');
 if(process.platform==='darwin'){
  for(const p of ['/opt/homebrew/bin/gmt','/usr/local/bin/gmt','/opt/local/bin/gmt'])add(p,'包管理器');
  try{for(const name of fs.readdirSync('/Applications').filter(n=>/^GMT-.*\.app$/i.test(n)))add(path.join('/Applications',name,'Contents/Resources/bin/gmt'),'GMT macOS App');}catch{}
 }
 if(process.platform==='win32')for(const root of [process.env.ProgramFiles,process.env['ProgramFiles(x86)'],process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Programs')].filter(Boolean)){
  try{for(const name of fs.readdirSync(root).filter(n=>/^GMT/i.test(n)))add(path.join(root,name,'bin/gmt.exe'),'Windows 安装目录');}catch{}
 }
 return out;
}
function probe(candidate){
 if(!fs.existsSync(candidate.path))return {...candidate,available:false};
 try{const version=execFileSync(candidate.path,['--version'],{encoding:'utf8',timeout:1500,stdio:['ignore','pipe','ignore'],windowsHide:true}).trim();
  return {...candidate,version,available:supported(version),recommended:recommended(version),binDir:path.dirname(candidate.path),capabilities:{boundingBox:compare(version,'6.7.0')>=0&&supported(version)},message:supported(version)?`GMT ${version}：${candidate.path}`:'需要稳定版 GMT 6.5 或更新的 GMT 6.x。'};
 }catch(e){return {...candidate,available:false,message:'GMT 启动失败或超时。'};}
}
function list(refresh=false){
 const preferred=preference(),key=preferred+'|'+process.env.PATH;
 if(!refresh&&cached&&cached.key===key&&Date.now()-cached.at<5000)return cached.engines;
 const real=new Set(),engines=[];
 for(const c of candidates()){
  if(!fs.existsSync(c.path))continue;
  let p;try{p=fs.realpathSync(c.path);}catch{continue;}
  if(real.has(p)&&c.path!==preferred)continue;
  real.add(p);engines.push(probe(c));
 }
 cached={key,at:Date.now(),engines};return engines;
}
function resolve(refresh=false){return select(list(refresh),preference());}
function savePreference(selected){
 if(process.env.MT_GMT_PATH)throw new Error('当前由 MT_GMT_PATH 指定引擎，请先移除该环境变量再切换。');
 if(selected&&!probe({path:selected,source:'指定引擎'}).available)throw new Error('所选程序不是可运行的稳定版 GMT 6.5+。');
 const p=settingsPath();fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify({path:selected||''},null,2));cached=null;return resolve(true);
}
function brewPath(){return ['/opt/homebrew/bin/brew','/usr/local/bin/brew'].find(p=>fs.existsSync(p))||'';}
module.exports={RECOMMENDED,versionParts,supported,recommended,compare,select,probe,list,resolve,savePreference,preference,brewPath};
