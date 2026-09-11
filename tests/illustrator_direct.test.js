const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const {verifyResult,findIllustrator,bridge,cancelIllustrator}=require('../electron/illustrator-direct');
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
 fs.rmSync(root,{recursive:true,force:true});
 console.log('Native AI: unsupported platform, absent/invalid/empty outputs, path escaping, background bridge passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
