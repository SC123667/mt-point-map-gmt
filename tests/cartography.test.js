const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),http=require('http');
const m=require('../electron/cartography'),{buildScript}=require('../electron/gmt'),{handle,importFile}=require('../electron/geodata-worker');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gmt-cartography-'));process.env.MT_GMT_WORKSPACE=tmp;
(async()=>{try{
 const points=m.parsePaste('拉萨\t91.13\t29.65\t城市\n林芝\t94.36\t29.65\t城市');assert.equal(points.length,2);assert.equal(points[0].geometry.coordinates[0],91.13);
 assert.throws(()=>m.parsePaste('位置\t\t30'),/坐标无效/);assert.throws(()=>m.geometry({type:'Point',coordinates:[91,100]}),/坐标无效/);
 const polygon=m.parsePaste('90 29\n92 29\n92 31','Polygon','研究区','区域')[0];assert.deepEqual(polygon.geometry.coordinates[0].at(-1),[90,29]);
 assert.throws(()=>m.collection({type:'FeatureCollection',crs:{name:'EPSG:3857'},features:[]}),/WGS84/);
 const line=m.feature({name:'雅鲁藏布缝合带',geometry:{type:'LineString',coordinates:[[85,29],[90,29.2],[98,30]]},category:'缝合带'});
 assert(m.inRegion(line,'86/96/28/32'));assert(!m.inRegion(line,'110/120/28/32'));assert.deepEqual(m.anchor(line,'86/96/28/32'),[90,29.2]);
 assert.deepEqual(m.anchor(m.feature({geometry:{type:'LineString',coordinates:[[80,29],[100,29]]}}),'86/94/28/32'),[90,29]);
 assert(m.inRegion(m.feature({geometry:{type:'Point',coordinates:[-175,10]}}),'170/190/0/20'));
 const c={features:[...points,line,polygon],categoryStyles:{城市:{fontSize:12,labelMode:'abbreviation'}},contours:{show:false}};
 assert.equal(m.effectiveStyle(points[0],c).fontSize,12);points[0].style.fontSize=8;assert.equal(m.effectiveStyle(points[0],c).fontSize,8);
 const round=m.collection(m.geoJSON(c.features)).features;assert.deepEqual(round[0].geometry,points[0].geometry);assert.equal(round[0].category,'城市');assert.equal(round[0].style.fontSize,8);
 const many=Array.from({length:1000},(_,i)=>m.feature({...line,id:'line-'+i,style:{showLabel:false}}));
 const config={plotType:'baseMap',region:'86/96/28/32',projection:'M18c',frame:'af',outputName:'test',cartography:{features:many,categoryStyles:{}}};
 const script=buildScript([],config,tmp,['pdf']);assert.equal((script.match(/gmt plot /g)||[]).length,1,'1000 identical styles must batch into one GMT invocation');
 const hole={type:'Polygon',coordinates:[[[90,29],[92,29],[92,31],[90,31],[90,29]],[[90.5,29.5],[91.5,29.5],[91.5,30.5],[90.5,30.5],[90.5,29.5]]]};
 buildScript([],{...config,cartography:{features:[m.feature({geometry:hole})]}},tmp,['eps']);assert(fs.readFileSync(path.join(tmp,'map_features_001.gmt'),'utf8').includes('> -Ph'));
 const contour=require('../electron/cartography-gmt').contourCommand({...config,cartography:{contours:{show:true,interval:100,major:500}}},'dem.nc',config.region,x=>x);
 assert(contour.includes('-C100'));assert(contour.includes('-A500'));assert(contour.includes('-Wa0.65p'));
 const svg=require('../electron/cartography-gmt').labelSVG({width:500,height:200,labels:[{x:100,y:100,name:'<城市>\n第二行',style:m.style({fontSize:10})}]});assert(svg.includes('&lt;城市&gt;'));assert(svg.includes('<tspan'));assert(!svg.includes('<城市>'));
 // Real SHP reader, including a projected point converted to WGS84 by its PRJ.
 const shp=Buffer.alloc(128);shp.writeInt32BE(9994,0);shp.writeInt32BE(64,24);shp.writeInt32LE(1000,28);shp.writeInt32LE(1,32);shp.writeInt32BE(1,100);shp.writeInt32BE(10,104);shp.writeInt32LE(1,108);shp.writeDoubleLE(91.13*6378137*Math.PI/180,112);shp.writeDoubleLE(3450909.22,120);const fp=path.join(tmp,'projected.shp');fs.writeFileSync(fp,shp);fs.writeFileSync(fp.replace('.shp','.prj'),'PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Mercator_1SP"],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1],EXTENSION["PROJ4","+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs"]]');
 const imported=await importFile(fp);assert(Math.abs(imported.features[0].geometry.coordinates[0]-91.13)<.001);
 // Local service fixture verifies request parameters and capability parsing.
 let request;
 const server=http.createServer((req,res)=>{request=new URL(req.url,'http://localhost');if(request.searchParams.get('request')==='GetCapabilities')res.end('<wfs:WFS_Capabilities version="2.0.0"><wfs:FeatureTypeList><wfs:FeatureType><wfs:Name>geo:faults</wfs:Name><wfs:Title>Faults</wfs:Title></wfs:FeatureType></wfs:FeatureTypeList></wfs:WFS_Capabilities>');else{res.setHeader('content-type','application/json');res.end(JSON.stringify(m.geoJSON([line])));}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {const url=`http://127.0.0.1:${server.address().port}/wfs`;const cap=await handle({mode:'capabilities',url});assert.equal(cap.layers[0].name,'geo:faults');const r=await handle({mode:'service',url,typeName:'geo:faults',region:'86/96/28/32'});assert.equal(r.total,1);assert.equal(request.searchParams.get('bbox'),'86,28,96,32,urn:ogc:def:crs:OGC:1.3:CRS84');assert.equal(request.searchParams.get('srsName'),'urn:ogc:def:crs:OGC:1.3:CRS84');}finally{await new Promise(r=>server.close(r));}
 console.log('Cartography geometry, batching, contours, shapefile reprojection and WFS tests passed');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
