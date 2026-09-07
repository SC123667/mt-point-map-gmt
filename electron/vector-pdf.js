const { PDFDocument } = require("pdf-lib");

// Composite PDF pages as vector Form XObjects; never embed the preview PNG.
async function composeVectorPDF(baseBytes, overlayBytes, imageSize, titleHeight) {
  const base = await PDFDocument.load(baseBytes);
  const overlay = await PDFDocument.load(overlayBytes);
  if (base.getPageCount() !== 1 || overlay.getPageCount() !== 1) {
    throw new Error("矢量图合成需要单页 GMT 底图与单页标注。");
  }
  const result = await PDFDocument.create();
  const basePage = base.getPage(0);
  const bounds = basePage.getCropBox();
  const [map] = await result.embedPages([basePage], [{
    left: bounds.x, bottom: bounds.y,
    right: bounds.x + bounds.width, top: bounds.y + bounds.height
  }]);
  const [decorations] = await result.embedPages([overlay.getPage(0)]);
  // Keep the physical GMT figure size, independent of PNG preview/export DPI.
  const width = bounds.width;
  const mapHeight = bounds.height;
  const height = mapHeight * (imageSize.height + titleHeight) / imageSize.height;
  const page = result.addPage([width, height]);
  page.drawPage(map, { x: 0, y: 0, width, height: mapHeight });
  page.drawPage(decorations, { x: 0, y: 0, width, height });
  result.setCreator("MT Point Map GMT");
  result.setProducer("GMT + Electron + pdf-lib (vector composition)");
  return Buffer.from(await result.save());
}

module.exports = { composeVectorPDF };
