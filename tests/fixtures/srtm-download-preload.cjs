// Offline network simulation used only by forked regression-test workers.
const fs = require('fs');
const https = require('https');
const zlib = require('zlib');
const { Readable } = require('stream');
const { EventEmitter } = require('events');
let active=0;
https.get = (url, options, callback) => {
  fs.appendFileSync(process.env.SRTM_TEST_REQUESTS, url + '\n');
  active++;fs.appendFileSync(process.env.SRTM_TEST_REQUESTS+'.active', active+'\n');
  const mode = process.env.SRTM_TEST_MODE;
  let data = fs.readFileSync(process.env.SRTM_TEST_JP2);
  if (url.endsWith('.gz')) {
    const hgt = Buffer.alloc(3601 * 3601 * 2);
    for (let i = 0; i < hgt.length; i += 2) hgt.writeInt16BE(100, i);
    data = zlib.gzipSync(hgt);
  }
  if (mode === 'invalid') data = Buffer.from('<html>not terrain</html>');
  let offset = 0;
  let pending = false;
  const response = new Readable({
    read() {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        if (this.destroyed) return;
        if (mode === 'truncated' && offset > 0) { this.destroy(new Error('connection lost')); return; }
        if (offset >= data.length) { this.push(null); return; }
        const end = Math.min(data.length, offset + 1024);
        this.push(data.subarray(offset, end)); offset = end;
      }, 20);
    }
  });
  response.once('close',()=>{active--;});
  response.statusCode = mode === 'http404' ? 404 : 200;
  response.headers = { 'content-length': String(data.length) };
  const request = new EventEmitter();
  request.setTimeout = () => request;
  request.destroy = (error) => { response.destroy(error); if (error) request.emit('error', error); };
  setImmediate(() => callback(response));
  return request;
};
