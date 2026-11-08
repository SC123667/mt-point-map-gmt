// One native file panel at a time, always attached to the requesting workbench.
// Background render windows must never become the panel's owner.
function create({dialog,BrowserWindow}) {
 let active=null;
 const canceled=()=>({canceled:true,filePaths:[],filePath:''});
 async function show(method,event,options) {
  const owner=BrowserWindow.fromWebContents(event.sender);
  if(!owner||owner.isDestroyed())return canceled();
  if(active)return canceled();
  const token={owner};active=token;
  const release=()=>{if(active===token)active=null;};
  owner.once('closed',release);
  try {
   if(owner.isVisible()&&!owner.isFocused())owner.focus();
   return await dialog[method](owner,options);
  } finally {
   owner.removeListener('closed',release);
   release();
  }
 }
 return {open:(event,options)=>show('showOpenDialog',event,options),save:(event,options)=>show('showSaveDialog',event,options)};
}
module.exports={create};
