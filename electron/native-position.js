function nativePositionStyle(value, fallback = "BL", inset = { x: 0.08, y: 0.08 }) {
  const parsed = parseNativePosition(value);
  if (parsed) {
    return [
      `left:${(parsed.x * 100).toFixed(3)}%`,
      `top:${((1 - parsed.y) * 100).toFixed(3)}%`,
      `transform:${nativePositionTransform(parsed.justify)}`
    ].join(";");
  }

  const corner = String(value || fallback).replace(/^j/i, "").toUpperCase();
  const x = `${(clampPosition(inset.x, 0, 1) * 100).toFixed(2)}%`;
  const y = `${(clampPosition(inset.y, 0, 1) * 100).toFixed(2)}%`;
  return {
    TL: `left:${x};top:${y}`,
    TR: `right:${x};top:${y}`,
    BL: `left:${x};bottom:${y}`,
    BR: `right:${x};bottom:${y}`
  }[corner] || `left:${x};bottom:${y}`;
}

function parseNativePosition(value) {
  const match = String(value || "").trim().match(/^n([0-9.]+)\/([0-9.]+)(?:\+j(TL|TR|BL|BR))?$/i);
  if (!match) return null;
  return {
    x: clampPosition(Number(match[1]), 0.02, 0.98),
    y: clampPosition(Number(match[2]), 0.02, 0.98),
    justify: String(match[3] || "BR").toUpperCase()
  };
}

function nativePositionTransform(justify) {
  return {
    TL: "translate(0,0)",
    TR: "translate(-100%,0)",
    BL: "translate(0,-100%)",
    BR: "translate(-100%,-100%)"
  }[String(justify || "").toUpperCase()] || "translate(-100%,-100%)";
}

function clampPosition(value, min, max) {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : min));
}

module.exports = {
  nativePositionStyle,
  nativePositionTransform,
  parseNativePosition
};
