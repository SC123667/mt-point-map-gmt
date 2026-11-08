const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const {verifyResult,findIllustrator,bridge,cancelIllustrator,publishAI}=require('../electron/illustrator-direct');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gmt-ai-direct-'));
 const result=path.join(root,'result.txt'),ai=path.join(root,'中文 空格.ai');
 await assert.rejects(findIllustrator('linux'),/不支持/);
 assert.equal(cancelIllustrator(),false);
 fs.writeFileSync(result,'\uFEFF'+ai);fs.writeFileSync(ai,Buffer.alloc(300));assert.equal(await verifyResult(result,root),ai);
 fs.writeFileSync(ai,'');await assert.rejects(verifyResult(result,root),/完整/);
 fs.writeFileSync(result,path.join(root,'..','outside.ai'));await assert.rejects(verifyResult(result,root),/无效/);
 fs.writeFileSync(result,path.join(root,'renamed.pdf'));await assert.rejects(verifyResult(result,root),/无效/);
 fs.writeFileSync(result,path.join(root,'absent.ai'));await assert.rejects(verifyResult(result,root),/ENOENT/);
 // Script paths are literals, never shell commands; preserve punctuation and Unicode.
 const mac=bridge({platform:'darwin',application:'/Applications/AI "test".app'},'/中文/"quoted"\\file.jsx');
 assert(mac.args[1].includes('AI \\"test\\".app'));assert(mac.args[1].includes('\\\\file.jsx'));assert(!mac.args[1].includes('activate'));
 const win=bridge({platform:'win32'},'C:\\中文\\"file".jsx');assert(win.source.includes('C:\\中文\\""file"".jsx'));assert(win.source.includes('WScript.Quit 1'));
 const previousWorkspace=process.env.MT_GMT_WORKSPACE;process.env.MT_GMT_WORKSPACE=root;
 try {
  const generated=path.join(root,'generated.ai');
  const first=Buffer.alloc(300,1),second=Buffer.alloc(500,2);
  fs.writeFileSync(generated,first);assert.equal(await publishAI(generated,ai),ai);
  fs.writeFileSync(generated,second);assert.equal(await publishAI(generated,ai),ai);
  assert.deepEqual(fs.readFileSync(ai),second);
  const backups=path.join(root,'版本备份','导出图件');
  assert(fs.readdirSync(backups).some(d=>fs.readFileSync(path.join(backups,d,path.basename(ai))).equals(first)));
  fs.writeFileSync(generated,'incomplete');await assert.rejects(publishAI(generated,ai),/完整/);assert.deepEqual(fs.readFileSync(ai),second);
  const directory=path.join(root,'directory.ai');fs.mkdirSync(directory);fs.writeFileSync(generated,first);await assert.rejects(publishAI(generated,directory),/不是文件/);assert(fs.statSync(directory).isDirectory());
  assert(!fs.readdirSync(root).some(n=>n.startsWith('.gmt-ai-')));
  // Exercise the full automation/result/publish path without controlling the
  // user's Illustrator. Only Illustrator's serialization bridge is simulated.
  const Module=require('module'),entry=require.resolve('../electron/illustrator-direct');
  const mod=new Module(entry,module);mod.filename=entry;mod.paths=Module._nodeModulePaths(path.dirname(entry));
  const realRequire=mod.require.bind(mod);let calls=0;
  mod.require=id=>id==='child_process'?{execFile:(file,args,opts,done)=>{
   try {
    const source=fs.readFileSync(path.join(root,'job','直接导出.jsx'),'utf8');
    const meta=JSON.parse(source.match(/var automation=(.*);/)[1]);
    assert.notEqual(meta.outputPath,ai);assert.deepEqual(fs.readFileSync(ai),second);
    fs.writeFileSync(meta.outputPath,first);fs.writeFileSync(meta.resultPath,meta.outputPath);calls++;done(null,'','');
   }catch(e){done(e,'','');}
  }}:realRequire(id);
  mod._compile(fs.readFileSync(entry,'utf8'),entry);
  const job=path.join(root,'job');fs.mkdirSync(job);const jsx=path.join(job,'template.jsx');fs.writeFileSync(jsx,'var automation=/*GMT_AUTOMATION*/null;');
  assert.equal(await mod.exports.exportNativeAI(jsx,ai,{platform:'darwin',application:'/unused.app'}),ai);
  assert.equal(calls,1);assert.deepEqual(fs.readFileSync(ai),first);
 } finally {if(previousWorkspace===undefined)delete process.env.MT_GMT_WORKSPACE;else process.env.MT_GMT_WORKSPACE=previousWorkspace;}
 fs.rmSync(root,{recursive:true,force:true});
 console.log('Native AI: unsupported platform, absent/invalid/empty outputs, path escaping, background bridge passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
