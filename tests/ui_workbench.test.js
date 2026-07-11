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
assert(html.includes('id="quickInspector" class="quick-inspector" aria-hidden="true"'), "quick inspector must launch hidden");
assert(html.includes('<main class="layout">'), "workbench layout must not launch with the inspector open");
assert(renderer.includes("setOpen(false);"), "renderer must explicitly reset the inspector to closed on launch");
assert(renderer.includes('classList.toggle("quick-inspector-open"'), "inspector toggle wiring missing");
assert(css.includes("grid-template-columns: var(--workbench-sidebar) minmax(0, 1fr)"), "canvas-first workbench grid missing");
assert(css.includes(".layout.quick-inspector-open"), "expanded inspector layout missing");
assert(css.includes('body[data-platform="darwin"]'), "macOS styling missing");
assert(css.includes('body[data-platform="win32"]'), "Windows styling missing");

console.log("UI workbench tests passed");
