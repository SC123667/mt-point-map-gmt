// Explicit, resumable migration of a reviewed JSON plan. Originals become compatibility links only after SHA-256 verification.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
async function hash(file){const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex');}
async function migrate(planFile){
 const plan=JSON.parse(fs.readFileSync(planFile,'utf8')),journal=planFile.replace(/\.json$/,'-completed.jsonl');
 let moved=0,bytes=0;
 for(const item of plan){
  const before=await fs.promises.lstat(item.source);
  if(before.isSymbolicLink())continue;
  if(!before.isFile())throw new Error('Not a regular file: '+item.source);
  const digest=await hash(item.source);let target=item.target;
  await fs.promises.mkdir(path.dirname(target),{recursive:true});
  if(fs.existsSync(target)&&await hash(target)!==digest){const ext=path.extname(target);target=target.slice(0,-ext.length)+'_历史'+digest.slice(0,10)+ext;}
  if(!fs.existsSync(target)){
   const temp=target+'.migrating';await fs.promises.copyFile(item.source,temp,fs.constants.COPYFILE_EXCL);
   if(await hash(temp)!==digest)throw new Error('Copy verification failed: '+item.source);
   await fs.promises.rename(temp,target);
  } else if(await hash(target)!==digest)throw new Error('Conflicting history copy: '+target);
  const after=await fs.promises.stat(item.source);
  if(after.size!==before.size || (after.mtimeMs!==before.mtimeMs && await hash(item.source)!==digest))throw new Error('Source content changed during copy: '+item.source);
  const link=item.source+'.migration-link';await fs.promises.symlink(target,link);
  // Journal the verified copy before atomically replacing the old path.
  await fs.promises.appendFile(journal,JSON.stringify({...item,target,sha256:digest,verifiedAt:new Date().toISOString()})+'\n');
  await fs.promises.rename(link,item.source);
  moved++;bytes+=before.size;
  if(moved%25===0||before.size>1e9)console.log(JSON.stringify({moved,bytes,file:path.basename(target)}));
 }
 console.log(JSON.stringify({completed:true,moved,bytes,journal}));
}
if(require.main===module){if(process.argv[2]!=='--apply'||!process.argv[3])throw new Error('Usage: node scripts/migrate-workspace.cjs --apply reviewed-plan.json');migrate(process.argv[3]).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={migrate,hash};
