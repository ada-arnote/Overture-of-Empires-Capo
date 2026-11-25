// SPDX-License-Identifier: AGPL-3.0-or-later
// Turns provinces made of small hexes into what the painter needs. Borders are bent a little so they look drawn,
// never enough to make two provinces touch that did not, or part two that did.
import { noise } from "./hexes.js";

const ROOT3 = Math.sqrt(3);

/** cells: small hexes [[q, r], ...]. of[i]: the province of hex i, or -1 for sea. The sea is the last number in the picture. */
export function areaPicture(cells, of, mids, size = 26) {
  const n = mids.length, seaId = n + 1, key = new Map(cells.map(([q, r], i) => [q * 1000 + r, of[i]]));
  const round = Math.max(...cells.map(([q, r]) => Math.hypot(ROOT3 * (q + r / 2), 1.5 * r))) * size + size * 1.5, c = Math.ceil(round) + 4, w = c * 2, h = c * 2;
  const ids = new Uint16Array(w * h), at = ([q, r]) => [c + size * ROOT3 * (q + r / 2), c + size * 1.5 * r];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((x - c) ** 2 + (y - c) ** 2 > round * round) continue;
      const X = (x - c + (noise(x / 13, y / 13) - 0.5) * 13) / size, Y = (y - c + (noise(x / 13 + 70, y / 13 + 30) - 0.5) * 13) / size;
      const r0 = Y / 1.5, q0 = X / ROOT3 - r0 / 2; // the hex a point is in, by rounding
      let q = Math.round(q0), r = Math.round(r0);
      const s = Math.round(-q0 - r0), dq = Math.abs(q - q0), dr = Math.abs(r - r0), ds = Math.abs(s + q0 + r0);
      if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
      const o = key.get(q * 1000 + r);
      ids[y * w + x] = o === undefined || o < 0 ? seaId : o + 1;
    }
  }
  const hw = w >> 1, hh = h >> 1, height = new Uint8Array(hw * hh), gap = new Float32Array(hw * hh).fill(99), id = (x, y) => (x < 0 || y < 0 || x >= hw || y >= hh ? 0 : ids[y * 2 * w + x * 2]);
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) { const v = id(x, y); if (id(x - 1, y) !== v || id(x + 1, y) !== v || id(x, y - 1) !== v || id(x, y + 1) !== v) gap[y * hw + x] = 0; }
  const low = (i, j, d) => { if (j >= 0 && j < gap.length && gap[j] + d < gap[i]) gap[i] = gap[j] + d; };
  for (let i = 0; i < gap.length; i++) { low(i, i - 1, 1); low(i, i - hw, 1); low(i, i - hw - 1, 1.4); low(i, i - hw + 1, 1.4); }
  for (let i = gap.length - 1; i >= 0; i--) { low(i, i + 1, 1); low(i, i + hw, 1); low(i, i + hw + 1, 1.4); low(i, i + hw - 1, 1.4); }
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < hw; x++) {
      const i = y * hw + x, v = id(x, y), X = x * 2, Y = y * 2;
      if (!v) { height[i] = 6; continue; }
      let z;
      if (v === seaId) z = 20 + 5 * noise(X / 14, Y / 6) + 2 * noise(X / 6 + 9, Y / 5);
      else {
        const ridge = Math.max(0, noise(X / 46 + 11, Y / 46 + 5) - 0.56) * 2.3; // a few rolling hills
        z = 26 + 6 * noise(X / 34, Y / 34) + 2 * noise(X / 9 + 40, Y / 9) + ridge * 62 * (0.7 + 0.5 * noise(X / 8, Y / 8)) * Math.min(1, gap[i] / 7);
        if (gap[i] < 3) z -= (3 - gap[i]) * 3.2;
      }
      height[i] = Math.max(0, Math.min(255, z));
    }
  }
  const ends = Array.from({ length: 16 }, (_, k) => [c + round * Math.cos((k * Math.PI) / 8), c + round * Math.sin((k * Math.PI) / 8)]);
  return { w, h, hw, hh, n: n + 1, ids, height, mid: [...mids.map((m) => at(cells[m])), [c, c]], R: size * 1.6, ends, at: cells.map(at) };
}
