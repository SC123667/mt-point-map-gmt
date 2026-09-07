const assert = require("assert");
const { PDFDocument, PDFName, PDFDict, rgb } = require("pdf-lib");
const { composeVectorPDF } = require("../electron/vector-pdf");

(async () => {
  const base = await PDFDocument.create();
  const page = base.addPage([460, 320]);
  page.drawLine({ start: { x: 10, y: 20 }, end: { x: 430, y: 280 }, color: rgb(0, 0, 1) });
  page.drawText("GMT coordinates", { x: 30, y: 40 });
  const overlay = await PDFDocument.create();
  overlay.addPage([920, 720]).drawText("Editable title", { x: 300, y: 680 });
  const bytes = await composeVectorPDF(await base.save(), await overlay.save(), { width: 920, height: 640 }, 80);
  const result = await PDFDocument.load(bytes);
  assert.strictEqual(result.getPageCount(), 1);
  assert.deepStrictEqual(result.getPage(0).getSize(), { width: 460, height: 360 });
  const resources = result.getPage(0).node.Resources().lookup(PDFName.of("XObject"), PDFDict);
  assert.strictEqual(resources.keys().length, 2);
  for (const key of resources.keys()) {
    const object = resources.lookup(key);
    assert.strictEqual(object.dict.get(PDFName.of("Subtype")).toString(), "/Form", "map and annotations must remain PDF forms, not images");
  }
  const highDPI = await composeVectorPDF(await base.save(), await overlay.save(), { width: 1840, height: 1280 }, 160);
  assert.deepStrictEqual((await PDFDocument.load(highDPI)).getPage(0).getSize(), { width: 460, height: 360 });
  base.addPage();
  await assert.rejects(composeVectorPDF(await base.save(), await overlay.save(), { width: 920, height: 640 }, 80), /单页/);
  console.log("Vector PDF tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
