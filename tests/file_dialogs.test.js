const assert=require('assert'),{EventEmitter}=require('events');
const {create}=require('../electron/file-dialogs');
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
class Owner extends EventEmitter {
 constructor(){super();this.destroyed=false;this.focused=false;this.focusCalls=0;}
 isDestroyed(){return this.destroyed;}isVisible(){return true;}isFocused(){return this.focused;}
 focus(){this.focused=true;this.focusCalls++;}
 close(){this.destroyed=true;this.emit('closed');}
}
(async()=>{
 const owner=new Owner(),nextOwner=new Owner(),calls=[];
 const dialog=Object.fromEntries(['showOpenDialog','showSaveDialog'].map(method=>[method,(parent,options)=>{const d=deferred();calls.push({method,parent,options,...d});return d.promise;} ]));
 const pickers=create({dialog,BrowserWindow:{fromWebContents:sender=>sender.owner}});
 const event={sender:{owner}},next={sender:{owner:nextOwner}},options={properties:['openFile']};
 const first=pickers.open(event,options);assert.equal(calls.length,1);assert.strictEqual(calls[0].parent,owner);assert.strictEqual(calls[0].options,options);assert.equal(owner.focusCalls,1);
 assert((await pickers.open(event,options)).canceled);assert((await pickers.save(next,{})).canceled);assert.equal(calls.length,1);
 calls[0].resolve({canceled:true,filePaths:[]});await first;assert.equal(owner.listenerCount('closed'),0);
 const failed=pickers.open(event,options);calls[1].reject(new Error('Native error'));await assert.rejects(failed,/Native error/);
 const retry=pickers.open(event,options);calls[2].resolve({canceled:false,filePaths:['/test.geojson']});assert.deepEqual((await retry).filePaths,['/test.geojson']);
 const closing=pickers.open(event,options);owner.close();
 const replacement=pickers.save(next,{title:'Save'});assert.equal(calls.length,5);assert.strictEqual(calls[4].parent,nextOwner);
 calls[3].resolve({canceled:true,filePaths:[]});await closing;
 assert((await pickers.open(next,options)).canceled,'A late result from a closed owner must not unlock a newer panel');
 calls[4].resolve({canceled:false,filePath:'/output.txt'});assert.equal((await replacement).filePath,'/output.txt');
 assert((await pickers.open(event,options)).canceled);assert.equal(calls.length,5,'A destroyed owner cannot create an orphan panel');
 assert((await pickers.open({sender:{owner:null}},options)).canceled);
 console.log('file_dialogs: parent ownership, overlap, cancel, error, retry and window closure passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
