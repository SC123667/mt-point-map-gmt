// EPS importers use DSC bounds, not the PDF MediaBox inside eps2write's body.
// Ghostscript can include clipped-out GMT paths in its computed ink bounds.
const { PDFDocument } = require('pdf-lib');

async function pdfPageSize(bytes) {
  const pdf = await PDFDocument.load(bytes);
  if (pdf.getPageCount() !== 1) throw new Error('EPS 导出需要单页 PDF。');
  const page = pdf.getPage(0), box = page.getCropBox();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  if (rotation % 90) throw new Error('EPS 导出不支持非直角页面旋转。');
  const size = rotation % 180 ? { width: box.height, height: box.width } : { width: box.width, height: box.height };
  if (![size.width, size.height].every(v => Number.isFinite(v) && v > 0)) throw new Error('PDF 页面尺寸无效。');
  return size;
}

function setEPSPageBounds(bytes, { width, height }) {
  if (![width, height].every(v => Number.isFinite(v) && v > 0)) throw new Error('EPS 页面尺寸无效。');
  // Latin-1 preserves every byte of the PostScript body and embedded images.
  const text = Buffer.from(bytes).toString('latin1'), end = text.indexOf('%%EndComments');
  if (end < 0) throw new Error('EPS 缺少页面声明，已停止导出。');
  const header = text.slice(0, end);
  if (!/^%%BoundingBox:.*$/m.test(header)) throw new Error('EPS 缺少边界声明，已停止导出。');
  const number = v => Number(v.toFixed(6));
  const sizedHeader = /^%%HiResBoundingBox:.*$/m.test(header) ? header : header + '%%HiResBoundingBox: 0 0 0 0\n';
  return Buffer.from(sizedHeader
    .replace(/^%%BoundingBox:.*$/m, `%%BoundingBox: 0 0 ${Math.ceil(width)} ${Math.ceil(height)}`)
    .replace(/^%%HiResBoundingBox:.*$/m, `%%HiResBoundingBox: 0 0 ${number(width)} ${number(height)}`) + text.slice(end), 'latin1');
}
module.exports = { pdfPageSize, setEPSPageBounds };
