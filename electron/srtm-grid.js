const fs = require('fs');
const { once } = require('events');
const { setImmediate: yieldTurn } = require('timers/promises');
const { normalizedRegion } = require('./terrain-cache');
function gridLayout(region, seconds) {
  const [w,e,s,n]=normalizedRegion(region).split('/').map(Number);
  const step=Math.max(1,Math.round(seconds));
  const west=Math.floor(w*3600/step+1e-7)*step, east=Math.ceil(e*3600/step-1e-7)*step;
  const south=Math.floor(s*3600/step+1e-7)*step, north=Math.ceil(n*3600/step-1e-7)*step;
  return {west,east,south,north,step,width:(east-west)/step+1,height:(north-south)/step+1,
    region:[west,east,south,north].map(v=>v/3600).join('/')};
}
async function writeSrtmRaster(tiles,region,seconds,outputPath,hooks={}) {
  const layout=gridLayout(region,seconds);
  const bands=new Map();
  for(const tile of tiles){const band=bands.get(tile.lat)||[];band.push(tile);bands.set(tile.lat,band);}
  const minimumLat=Math.min(...bands.keys());
  const stream=fs.createWriteStream(outputPath,{highWaterMark:1024*1024});
  let streamError, cachedLat, buffers=[];
  stream.on('error',e=>{streamError=e;});
  const invalid=Buffer.from([0x80,0]);
  try {
    for(let row=0;row<layout.height;row++) {
      if(hooks.shouldCancel?.())throw new Error('SRTM 网格生成已取消。');
      if(row%64===0){await yieldTurn();await hooks.waitIfPaused?.();}
      const latSeconds=layout.north-row*layout.step;
      const tileLat=Math.max(minimumLat,Math.ceil(latSeconds/3600)-1);
      if(cachedLat!==tileLat){
        buffers=[];
        for(const tile of bands.get(tileLat)||[]) {
          const data=fs.readFileSync(tile.hgtPath);
          if(data.length!==3601*3601*2)throw new Error(`SRTM 瓦片 ${tile.name} 尺寸异常。`);
          buffers.push({tile,data});
        }
        cachedLat=tileLat;
      }
      const line=Buffer.allocUnsafe(layout.width*2).fill(invalid);
      for(const {tile,data} of buffers) {
        const sourceRow=(tile.lat+1)*3600-latSeconds;
        if(sourceRow<0||sourceRow>3600)continue;
        const first=Math.max(0,Math.ceil((tile.lon*3600-layout.west)/layout.step));
        const last=Math.min(layout.width-1,Math.floor(((tile.lon+1)*3600-layout.west)/layout.step));
        if(last<first)continue;
        const startCol=layout.west+first*layout.step-tile.lon*3600;
        const offset=(sourceRow*3601+startCol)*2;
        if(layout.step===1)data.copy(line,first*2,offset,offset+(last-first+1)*2);
        else for(let col=first;col<=last;col++)line.writeInt16BE(data.readInt16BE(offset+(col-first)*layout.step*2),col*2);
      }
      if(!stream.write(line))await once(stream,'drain');
      if(streamError)throw streamError;
      if(row%128===0)hooks.onProgress?.({row:row+1,totalRows:layout.height});
    }
    stream.end();await once(stream,'finish');
    return layout;
  } catch(e){stream.destroy();throw e;}
}
module.exports={gridLayout,writeSrtmRaster};
