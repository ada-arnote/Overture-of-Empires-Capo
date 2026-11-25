// SPDX-License-Identifier: AGPL-3.0-or-later
// Turns a list of hexes into what the painter needs: a picture of cell numbers and a picture of heights.
const ROOT3 = Math.sqrt(3);

/** A small repeatable noise for the ground. Looks only: no rule ever reads it. */
function noise(x, y) {
  const at = (i, j) => { const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return n - Math.floor(n); };
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
  return (at(xi, yi) * (1 - a) + at(xi + 1, yi) * a) * (1 - b) + (at(xi, yi + 1) * (1 - a) + at(xi + 1, yi + 1) * a) * b;
}

/**
 * cells: [[q, r], ...] in axial steps, pointy tops. rough: true for hilly cells.
 * Cell i of the list is number i + 1 in the picture; 0 is off the board.
 */
export function hexPicture(cells, rough, size = 44) {
  const R = size, pad = 10, at = cells.map(([q, r]) => [R * ROOT3 * (q + r / 2), R * 1.5 * r]);
  const x0 = Math.min(...at.map((p) => p[0])) - R - pad, y0 = Math.min(...at.map((p) => p[1])) - R - pad;
  const w = Math.ceil(Math.max(...at.map((p) => p[0])) + R + pad - x0), h = Math.ceil(Math.max(...at.map((p) => p[1])) + R + pad - y0);
  const mid = at.map(([x, y]) => [x - x0, y - y0]), ids = new Uint16Array(w * h), hw = w >> 1, hh = h >> 1, height = new Uint8Array(hw * hh);
  const half = (R * ROOT3) / 2 - 1.1;
  mid.forEach(([cx, cy], i) => {
    for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(h, cy + R); y++) {
      for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(w, cx + R); x++) {
        const X = Math.abs(x + 0.5 - cx), Y = Math.abs(y + 0.5 - cy);
        if (X <= half && Y <= R - 1.3 - X / ROOT3) ids[y * w + x] = i + 1;
      }
    }
  });
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < hw; x++) {
      const id = ids[y * 2 * w + x * 2], X = x * 2, Y = y * 2;
      let v = 24 + 5 * noise(X / 34, Y / 34) + 1.2 * noise(X / 9 + 40, Y / 9);
      if (id && rough[id - 1]) {
        const [cx, cy] = mid[id - 1];
        const ridge = (ox, oy, r, tall) => Math.max(0, 1 - Math.hypot((X - cx) / R - ox, ((Y - cy) / R - oy) * 1.25) / r) * tall; // three small peaks
        v += Math.max(ridge(0.05, -0.2, 0.52, 92), ridge(-0.34, 0.18, 0.42, 66), ridge(0.36, 0.22, 0.4, 60)) * (0.86 + 0.28 * noise(X / 5 + 3, Y / 5));
      }
      if (id) { // a soft bevel at the rim of every cell
        const [cx, cy] = mid[id - 1], DX = Math.abs(X - cx), DY = Math.abs(Y - cy), edge = Math.min(half - DX, (R - 1.3 - DX / ROOT3 - DY) * 0.87);
        if (edge < 5) v -= (5 - edge) * 2.4;
      } else v = 6;
      height[y * hw + x] = Math.max(0, Math.min(255, v));
    }
  }
  return { w, h, hw, hh, n: cells.length, ids, height, mid, R };
}
