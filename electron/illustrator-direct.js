// Native AI serialization belongs to Illustrator. Never relabel a PDF as .ai.
const fs=require('fs'),path=require('path');
const {execFile}=require('child_process');
let active=null;
function execute(file,args,timeout=660000) {
  return new Promise((resolve,reject)=>execFile(file,args,{encoding:'utf8',timeout,maxBuffer:1024*1024,windowsHide:true},(error,stdout,stderr)=>{
    if(error)reject(new Error(String(stderr||error.message).trim()));else resolve(stdout.trim());
  }));
}
async function findIllustrator(platform=process.platform) {
  if(platform==='darwin') {
    // Launch Services resolves renamed/nonstandard installations without activating them.
    try{return {platform,application:await execute('/usr/bin/osascript',['-e','POSIX path of (path to application id "com.adobe.illustrator")'],15000)};}catch(error){
      throw new Error('直接导出 .ai 需要安装 Adobe Illustrator。未检测到 Illustrator，请先安装，或选择“AI 编辑包”。');
    }
  }
  if(platform==='win32') {
    try{await execute('reg.exe',['query','HKCR\\Illustrator.Application'],15000);return {platform};}catch(error){
      throw new Error('直接导出 .ai 需要已安装并注册的 Adobe Illustrator，请先启动 Illustrator 一次，或选择“AI 编辑包”。');
    }
  }
  throw new Error('当前系统不支持自动调用 Illustrator，请选择“AI 编辑包”。');
}
function appleString(s){return '"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n')+'"';}
function bridge(target,script) {
  if(target.platform==='darwin')return {file:'/usr/bin/osascript',args:['-e',`with timeout of 600 seconds\n tell application ${appleString(target.application)}\n do javascript file (POSIX file ${appleString(script)})\n end tell\nend timeout`]};
  // UTF-16 VBScript path and literal escaping work with Chinese Windows paths.
  const quote=s=>'"'+s.replace(/"/g,'""')+'"';
  return {file:'cscript.exe',source:`On Error Resume Next\r\nSet ai = GetObject(, "Illustrator.Application")\r\nIf Err.Number <> 0 Then\r\n Err.Clear\r\n Set ai = CreateObject("Illustrator.Application")\r\nEnd If\r\nIf Err.Number <> 0 Then\r\n WScript.StdErr.Write Err.Description\r\n WScript.Quit 1\r\nEnd If\r\nai.DoJavaScriptFile ${quote(script)}\r\nIf Err.Number <> 0 Then\r\n WScript.StdErr.Write Err.Description\r\n WScript.Quit 1\r\nEnd If\r\n`};
}
function cancelIllustrator() {
  if(!active)return false;
  fs.writeFileSync(active.cancelPath,'cancel');return true;
}
async function verifyResult(resultPath,outputDirectory) {
  const output=(await fs.promises.readFile(resultPath,'utf8')).replace(/^\uFEFF/,'').trim();
  if(path.dirname(path.resolve(output))!==path.resolve(outputDirectory)||path.extname(output).toLowerCase()!=='.ai')throw new Error('Illustrator 返回了无效的输出路径。');
  const stat=await fs.promises.stat(output);if(!stat.isFile()||stat.size<100)throw new Error('Illustrator 没有生成完整的 AI 文件。');
  return output;
}
async function publishAI(generated, output) {
  const stat=await fs.promises.stat(generated);
  if(!stat.isFile()||stat.size<100)throw new Error('Illustrator 没有生成完整的 AI 文件。');
  // Prepare a complete sibling before replacing the destination. A failed
  // conversion/copy leaves the previous export intact, including on Windows.
  const stage=await fs.promises.mkdtemp(path.join(path.dirname(output),'.gmt-ai-'));
  try {
    const ready=path.join(stage,'ready.ai');
    await fs.promises.copyFile(generated,ready);
    let old;
    try {old=await fs.promises.stat(output);} catch(error) {if(error.code!=='ENOENT')throw error;}
    if(old) {
      if(!old.isFile())throw new Error('AI 输出路径不是文件。');
      const backups=require('./workspace').workspaceDirectory('版本备份/导出图件');
      const backup=await fs.promises.mkdtemp(path.join(backups,path.basename(output,'.ai')+'-'));
      await fs.promises.copyFile(output,path.join(backup,path.basename(output)));
    }
    await fs.promises.rename(ready,output);
    return output;
  } finally {await fs.promises.rm(stage,{recursive:true,force:true});}
}
async function exportNativeAI(script,output,target) {
  if(active)throw new Error('已有 Illustrator 导出正在进行，请稍后再试。');
  const job=path.dirname(script),resultPath=path.join(job,'ai-result.txt'),cancelPath=path.join(job,'cancel.txt');
  active={cancelPath};
  const run=path.join(job,'直接导出.jsx');
  let timer;
  try{
    // Each export uses its own job directory; never reuse another job's result file.
    const generated=path.join(job,'new-export.ai');
    const metadata={outputPath:generated,resultPath,cancelPath};
    let source=await fs.promises.readFile(script,'utf8');
    source=source.replace('/*GMT_AUTOMATION*/null',JSON.stringify(metadata));
    await fs.promises.writeFile(run,source.replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')));
    const command=bridge(target,run);
    if(command.source){const vbs=path.join(job,'run.vbs');await fs.promises.writeFile(vbs,Buffer.from('\uFEFF'+command.source,'utf16le'));command.args=['//Nologo',vbs];}
    // Cooperative cancellation never terminates the user's Illustrator process.
    timer=setTimeout(()=>{try{fs.writeFileSync(cancelPath,'timeout');}catch{}},590000);
    await execute(command.file,command.args);
    const actual=await verifyResult(resultPath,job);
    if(path.resolve(actual)!==path.resolve(generated))throw new Error('Illustrator 返回的文件不是本次导出结果。');
    if(fs.existsSync(cancelPath))throw new Error('AI 导出已取消。');
    return await publishAI(actual,output);
  }catch(error){
    // Also stop a late-arriving script after an AppleEvent/helper timeout.
    try{await fs.promises.writeFile(cancelPath,'cancel');}catch{}
    const reason=String(error.message);
    if(/-1743|not authorized|not permitted/i.test(reason))throw new Error('macOS 尚未允许控制 Illustrator。请在“系统设置 → 隐私与安全性 → 自动化”允许本软件控制 Adobe Illustrator，然后重试。');
    throw new Error(`AI 导出未完成：${reason}\n编辑包已保留：${job}`);
  }finally{clearTimeout(timer);active=null;}
}
module.exports={findIllustrator,exportNativeAI,cancelIllustrator,bridge,verifyResult,publishAI};
