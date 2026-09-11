// Use the scale bar's actual GMT tick coordinates; never estimate map distance
// from the displayed region or move/stretch the original geographic scale bar.
function scaleMidpoint(eps, { ox, oy, height, sx, sy }) {
  const commands = [...eps.matchAll(/^%@GMT: gmt basemap[^\n]*\s-L[^\n]*$/gm)];
  if (!commands.length) return null;
  const chunk = eps.slice(commands.at(-1).index).split('%%EndObject')[0];
  const ticks = [...chunk.matchAll(/(-?[\d.]+)\s+(-?[\d.]+)\s+M(?:\s+PSL_font_encode[^\n]*\n)?\s*(?:[\d.]+\s+F\d+\s*)?\(([\d.]+)\)\s+tc\s+Z/g)]
    .map(m => ({ x: Number(m[1]), y: Number(m[2]), value: Number(m[3]) }));
  // GMT already annotates intermediate ticks for many scale lengths. Only add
  // the missing midpoint when there are exactly two unambiguous endpoints.
  if (ticks.length !== 2) return null;
  const [a, b] = ticks;
  if (a.value !== 0 || !(b.value > 0) || b.x <= a.x || a.y !== b.y) return null;
  return { x: ox + (a.x + b.x) / 2 * sx, y: height - oy - a.y * sy,
    text: String(Number((b.value / 2).toPrecision(6))), fontSize: 7.5 };
}
module.exports = { scaleMidpoint };
