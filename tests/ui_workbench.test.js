const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "electron", "renderer", "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "electron", "renderer", "styles.css"), "utf8");
const renderer = fs.readFileSync(path.join(root, "electron", "renderer", "renderer.js"), "utf8");

const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
assert.strictEqual(new Set(ids).size, ids.length, "renderer HTML contains duplicate element IDs");

const referencedIds = new Set(Array.from(renderer.matchAll(/\bel\.([A-Za-z0-9_]+)/g), (match) => match[1]));
const optionalLegacyIds = new Set(["chooseOutputBtn", "deleteOutputBtn", "exportBothBtn", "previewBtn"]);
const missingIds = Array.from(referencedIds).filter((id) => !ids.includes(id) && !optionalLegacyIds.has(id)).sort();
assert.deepStrictEqual(missingIds, [], `renderer.js references missing HTML IDs: ${missingIds.join(", ")}`);

assert(html.includes('id="quickInspectorToggle"'), "quick-inspector toggle missing");
assert(html.includes('id="sidebarImportFileBtn"'), "sidebar table import action missing");
assert(html.includes('id="sidebarImportEdiBtn"'), "sidebar EDI import action missing");
assert(html.includes('id="sidebarLoadSampleBtn"'), "sidebar sample-data action missing");
assert(renderer.includes('bind(el.sidebarImportFileBtn, "click", openPointFile)'), "sidebar table import wiring missing");
assert(renderer.includes('bind(el.sidebarImportEdiBtn, "click", openEdiDirectory)'), "sidebar EDI import wiring missing");
assert(renderer.includes('bind(el.sidebarLoadSampleBtn, "click", loadSampleData)'), "sidebar sample-data wiring missing");
assert(html.includes('id="quickInspector" class="quick-inspector" aria-hidden="true"'), "quick inspector must launch hidden");
assert(html.includes('<main class="layout">'), "workbench layout must not launch with the inspector open");
assert(renderer.includes("setOpen(false);"), "renderer must explicitly reset the inspector to closed on launch");
assert(renderer.includes('classList.toggle("quick-inspector-open"'), "inspector toggle wiring missing");
assert(css.includes("grid-template-columns: var(--workbench-sidebar) minmax(0, 1fr)"), "canvas-first workbench grid missing");
assert(css.includes(".layout.quick-inspector-open"), "expanded inspector layout missing");
assert(html.includes('class="quick-inspector-scroll" role="region" aria-label="快捷参数内容" tabindex="0"'), "quick inspector scroll region missing");
assert(css.includes(".quick-inspector-scroll"), "quick inspector scroll styling missing");
assert(css.includes("overflow-y: auto"), "quick inspector must allow vertical scrolling");
assert(css.includes("overflow-x: hidden"), "quick inspector must not create horizontal scrolling");
assert(css.includes("overscroll-behavior: contain"), "quick inspector scroll must stay within the panel");
assert(css.includes('body[data-platform="darwin"]'), "macOS styling missing");
assert(css.includes('body[data-platform="win32"]'), "Windows styling missing");
assert(html.includes('id="curvePreviousBtn"'), "previous curve-station control missing");
assert(html.includes('id="curveNextBtn"'), "next curve-station control missing");
assert(html.includes('id="curveStationPosition"'), "curve-station position indicator missing");
assert(renderer.includes('bind(el.curveStationInput, "change"'), "curve-station select must trigger a preview");
assert(renderer.includes('["ArrowLeft", "ArrowRight"]'), "curve-station arrow-key navigation missing");
assert(renderer.includes("requestRevision === state.preview.revision"), "stale preview revision guard missing");
assert(renderer.includes("expectedPlotType !== state.plotType"), "stale preview plot-type guard missing");
assert(css.includes(".curve-station-nav"), "curve-station navigation styling missing");

console.log("UI workbench tests passed");
