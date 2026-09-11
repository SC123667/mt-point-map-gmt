const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber } = require('pdf-lib');

function findCairo(binDir, env = process.env, platform = process.platform) {
  const name = platform === 'win32' ? 'pdftocairo.exe' : 'pdftocairo';
  const dirs = [binDir, ...(env.PATH || '').split(platform === 'win32' ? ';' : ':'), ...(platform === 'darwin' ? ['/opt/homebrew/bin', '/usr/local/bin'] : [])];
  return dirs.filter(Boolean).map(d => path.join(d, name)).find(p => fs.existsSync(p)) || '';
}
async function hasTransparency(bytes) {
  const doc = await PDFDocument.load(bytes);
  const seen=new Set();
  function visit(object) {
    if (!object || seen.has(object)) return false;
    seen.add(object);
    if(object instanceof PDFArray) return object.asArray().some(value=>visit(doc.context.lookup(value)));
    const d = object instanceof PDFDict ? object : object.dict;
    if (!d) return false;
    for (const key of ['ca', 'CA']) {
      const a = d.lookup(PDFName.of(key));
      if (a instanceof PDFNumber && a.asNumber() < 1) return true;
    }
    const mask = d.lookup(PDFName.of('SMask')), blend = d.lookup(PDFName.of('BM'));
    if (mask && mask.toString() !== '/None') return true;
    if (blend && !['/Normal','/Compatible'].includes(blend.toString())) return true;
    // Even nominally opaque transparency groups can trigger GS's page fallback.
    if (d.get(PDFName.of('S'))?.toString() === '/Transparency') return true;
    return d.entries().some(([,value])=>visit(doc.context.lookup(value)));
  }
  return doc.context.enumerateIndirectObjects().some(([,object])=>visit(object));
}
module.exports = { findCairo, hasTransparency };
