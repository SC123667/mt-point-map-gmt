const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const n=require('../electron/map-names'),m=require('../electron/cartography');
const {search,handle}=require('../electron/geodata-worker');
const {buildLegendEntries}=require('../electron/legend');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gmt-map-editing-'));process.env.MT_GMT_WORKSPACE=root;
(async()=>{try{
 const f=m.feature({id:'IYZS',name:'Indus-Yarlung Suture Zone',geometry:{type:'LineString',coordinates:[[86,29],[90,29.3],[96,30]]},source:{id:'hima-sutures'},category:'缝合带'});
 assert.equal(f.nameZh,'雅鲁藏布缝合带');assert.equal(f.abbreviation,'IYZS');
 for(const q of ['IYZS','雅鲁藏布','Indus–Yarlung Suture Zone'])assert.equal(search([f],q,'86/96/28/32').length,1);
 const c=m.normalize({language:'zh',nameFormat:'both',features:[f]});
 assert.equal(m.labelText(f,m.style(),c),'雅鲁藏布缝合带 (IYZS)');
 assert.equal(m.labelText(f,m.style(),{...c,language:'en'}),'Indus–Yarlung Suture Zone (IYZS)');
 assert.deepEqual(m.normalize(JSON.parse(JSON.stringify(c))).features[0].geometry,f.geometry);
 const restored=m.collection(m.geoJSON([f])).features[0];for(const k of ["geometry","nameZh","nameEn","originalName","abbreviation","source"])assert.deepEqual(restored[k],f[k]);
 const unknown=m.feature({name:'Unmapped Fault 123',geometry:f.geometry});
 assert.equal(n.label(unknown,{},c),'');assert.equal(n.pending({...c,features:[unknown]}).length,1);
 assert.equal(n.label({...unknown,abbreviation:'UF'}, {}, {...c,nameFormat:'abbreviation'}),'UF');
 const corrected={...f,nameZh:'雅鲁藏布江缝合带',nameEn:'Yarlung Zangbo Suture Zone'};
 await handle({mode:'rememberNames',feature:corrected});
 const d=JSON.parse(fs.readFileSync(path.join(root,'名称词典/用户中英文名称.json')));
 assert.equal(n.applyDictionary(f,d).nameZh,corrected.nameZh);
 assert.equal(n.applyDictionary({...f,id:'other'},d).nameZh,f.nameZh,'do not apply a homonymous object correction');
 assert.equal(buildLegendEntries({plotType:'baseMap',region:'86/96/28/32',cartography:c})[0].label,'缝合带');
 assert.equal(buildLegendEntries({plotType:'baseMap',region:'86/96/28/32',cartography:{...c,language:'en'}})[0].label,'Suture zones');
 const {project}=require('../electron/map-project-worker'),{resolveGMT}=require('../electron/gmt');
 if(resolveGMT().available){for(const swapAxes of [false,true]){
  const config={region:'86/96/28/32',projection:'X18c/8c',swapAxes},frame={width:600,height:300,ox:25,oy:18},points=[[86,28],[91.13,29.65],[96,32]];
  const screen=await project({frame,config,points}),back=await project({frame,config,points:screen,inverse:true});
  points.forEach((p,i)=>p.forEach((v,j)=>assert(Math.abs(v-back[i][j])<1e-8)));
 }}
 console.log('Map language, terminology persistence, vector roundtrip and real GMT projection tests passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
