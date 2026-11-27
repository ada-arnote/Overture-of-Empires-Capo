// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo's map, close in: the models only Capo stands (strength pips, an agent, dunes, reeds, grass, ice, a hamlet), and the
// land's dressing. Looks only: no rule reads any of it. Dressing is cheap by design: spots lie on a grid of cells that halve
// as the map comes closer (each level keeps the spots of the levels above, so nothing jumps), each spot is worked out once
// and kept, and only the spots in view are stood, up to a cap. What a spot shows comes from the province under it: its
// terrain word (an invented world), or the heights and ice of the real one.
import { bake, box, lathe, move, prism } from "./kit.js";
import { SLOT } from "./style.js";

const c = (slot, shade = 128) => [SLOT[slot], shade, 0], TAU = Math.PI * 2;
/** Pips on a dark tray along the front of a block (or beside a hull): one a point of strength, five to a row. */
function pips(o, n, y0) {
  const rows = n > 5 ? 2 : 1, per = Math.min(5, n), w = per * 0.055 + 0.03;
  box(o, -w, y0, 0, w, y0 + 0.03 + rows * 0.1, 0.05, c("dark"), 0, 0.01);
  for (let i = 0; i < n; i++) { const r = i < 5 ? 0 : 1, k = r ? n - 5 : per, x = (i % 5 - (k - 1) / 2) * 0.11; move(o, lathe([], [[0.038, 0], [0.036, 0.016], [0.022, 0.03], [0, 0.034]], 8, c("bone")), x, y0 + 0.065 + r * 0.1, 0.05); }
  return o;
}
const RECIPES = {
  agent(o) { // someone sent alone: a cloak, a hood, the sender's colour at the collar
    lathe(o, [[0.15, 0], [0.155, 0.02], [0.12, 0.04], [0, 0.04]], 10, c("metal"), 2);
    lathe(o, [[0.12, 0.04], [0.1, 0.3], [0.06, 0.44], [0, 0.45]], 9, c("dark"));
    lathe(o, [[0.07, 0.4], [0.075, 0.43], [0.05, 0.45], [0, 0.45]], 9, c("cloth"), 1);
    return lathe(o, [[0, 0.43], [0.065, 0.47], [0.07, 0.53], [0.045, 0.59], [0, 0.6]], 8, c("dark", 110));
  },
  dune(o) { for (const [x, y, s] of [[-0.12, 0.04, 1], [0.2, -0.1, 0.7]]) move(o, prism([], [[-0.3, 0], [-0.05, -0.08], [0.3, -0.02], [0.1, 0.06]], 0, 0.1, c("field", 150), 0, 0.07), x, y, 0, s); return o; },
  reeds(o) { for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 0.05 + (i % 3) * 0.06; move(o, lathe([], [[0.012, 0], [0.008, 0.16 + (i % 2) * 0.08], [0, 0.2 + (i % 2) * 0.08]], 4, c("leaf", 112 + (i % 3) * 14), 0, true), Math.cos(a) * r, Math.sin(a) * r); } return o; },
  grass(o) { for (const [x, y] of [[-0.18, 0.05], [0.06, -0.12], [0.2, 0.1]]) move(o, lathe([], [[0.07, 0], [0.04, 0.05], [0, 0.08]], 5, c("field", 118), 0, true), x, y); return o; },
  floe(o) { for (const [x, y, s, t] of [[-0.1, 0.02, 1, 0.3], [0.16, -0.08, 0.7, 1.4]]) move(o, prism([], [[-0.16, -0.1], [0.12, -0.14], [0.18, 0.06], [-0.04, 0.14], [-0.2, 0.04]], 0, 0.07, c("snow"), 0, 0.03), x, y, 0, s, t); return o; },
  ridge: (o) => { const r = lathe([], [[0.56, 0], [0.44, 0.05], [0.24, 0.1], [0, 0.12]], 9, c("leaf"), 3, true); for (let i = 0; i < r.length; i += 10) r[i] *= 1.6; return move(o, r); }, // a long low hill, in the ground's own colour
  hamlet(o) { for (const [x, y, w, h] of [[-0.08, 0.03, 0.08, 0.12], [0.09, -0.05, 0.065, 0.16]]) { box(o, x - w, y - w, 0, x + w, y + w, h, c("wall")); move(o, prism([], [[-w - 0.01, 0], [w + 0.01, 0], [0, 0.07]], -w - 0.01, w + 0.01, c("roof"), 0), x, y, h, 1, 0, Math.PI / 2); } return o; },
};
for (let n = 1; n <= 10; n++) { RECIPES[`pips${n}`] = (o) => pips(o, n, 0.25); RECIPES[`fpips${n}`] = (o) => pips(o, n, 0.17); }
let made = null;
/** Capo's own models, packed for the mesh layer (added beside the shared ones). */
export function capoModels() { return (made ||= Object.fromEntries(Object.entries(RECIPES).map(([k, f]) => [k, bake(f([]))]))); }

// what each terrain word stands, and how often a spot shows it: [model, chance, size]
const WORDS = {
  forest: [["tree", 0.5, 0.44], ["oak", 0.25, 0.42]], hills: [["ridge", 0.3, 0.24]], mountain: [["peak", 0.4, 0.4]], desert: [["dune", 0.45, 0.5]],
  steppe: [["grass", 0.4, 0.45]], marsh: [["reeds", 0.5, 0.45]], plain: [["oak", 0.06, 0.4]], coast: [],
};
const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const inside = (x, y, rings) => { let n = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) n = !n; } return n; };

export class Dressing {
  /** world: the unpacked map (provinces with poly, n and, for an invented world, terrain; lake outlines, if it has them). */
  constructor(world) {
    this.world = world; this.lakes = (world.lakeRings || []).map((ring) => ({ ring, box: ring.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]) })); this.list = [...world.provinces.values()].sort((a, b) => a.n - b.n); this.kept = new Map(); this.heights = null;
    // which province each small square of the map belongs to, filled row by row from the outlines; -1 for the sea, -2 where two meet
    const G = this.G = 4, w = this.w = Math.ceil(world.width / G), h = this.h = Math.ceil(world.height / G), of = this.of = new Int16Array(w * h).fill(-1);
    const xs = [];
    for (const p of this.list) {
      const [, y0, , y1] = p.box;
      for (let row = Math.max(0, Math.floor(y0 / G)); row <= Math.min(h - 1, Math.floor(y1 / G)); row++) {
        const y = (row + 0.5) * G; xs.length = 0;
        for (const r of p.poly) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1])); }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) for (let col = Math.max(0, Math.ceil(xs[k] / G - 0.5)); col <= Math.min(w - 1, Math.floor(xs[k + 1] / G - 0.5)); col++) { const at = row * w + col; of[at] = of[at] === -1 ? p.n : -2; }
      }
    }
  }
  /** The real world's heights and ice, read once from its picture at a smaller size: {w, h, r: heights, a: ice}. */
  relief(r) { this.heights = r; this.kept.clear(); }
  /** What stands at one spot: null, or [model, size, turn]. Worked out once a spot. */
  at(x, y, seed) {
    const col = Math.floor(x / this.G), row = Math.floor(y / this.G);
    if (col < 0 || row < 0 || col >= this.w || row >= this.h) return null;
    let n = this.of[row * this.w + col];
    if (n === -1) return null;
    if (n < 0 || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.of[(row + dy) * this.w + col + dx] !== n)) { // near a line: ask the outlines themselves
      n = -1;
      for (const k of [this.of[row * this.w + col], ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => this.of[(row + dy) * this.w + col + dx])]) if (k >= 0 && inside(x, y, this.list[k].poly)) { n = k; break; }
      if (n < 0) return null;
    }
    if (this.lakes.some((l) => x > l.box[0] && x < l.box[2] && y > l.box[1] && y < l.box[3] && inside(x, y, [l.ring]))) return null;
    const p = this.list[n], H = this.heights, turn = seed * TAU;
    let pick = WORDS[p.terrain] || null;
    if (!pick && H) { // the real world: ice where the picture marks it, peaks and hills by height
      const cx = Math.min(H.w - 1, Math.floor((x / this.world.width) * H.w)), cy = Math.min(H.h - 1, Math.floor((y / this.world.height) * H.h)), metres = (v) => (v > 96 ? 6500 * ((v - 96) / 159) ** (1 / 0.6) : 0);
      let lo = 255, hi = 0; // how rough the country is: the spread of heights round the spot
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = H.r[Math.max(0, Math.min(H.h - 1, cy + dy)) * H.w + Math.max(0, Math.min(H.w - 1, cx + dx))]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const m = metres(H.r[cy * H.w + cx]), rough = metres(hi) - metres(lo);
      pick = H.a[cy * H.w + cx] < 200 ? [["floe", 0.4, 0.45]] : rough > 1300 || (m > 3200 && rough > 500) ? [["peak", 0.36, 0.4]] : m > 600 && rough > 800 ? [["ridge", 0.14, 0.24]] : null;
    }
    if (!pick) return null;
    let roll = hash(Math.floor(x * 7), Math.floor(y * 7), 91);
    for (const [m, chance, size] of pick) { if (roll < chance) return [m, size * (0.85 + 0.3 * seed), turn]; roll -= chance; }
    return null;
  }
  /**
   * The dressing in a view: box [x0, y0, x1, y1] of the map, s its scale (screen points a map unit), k a piece's size, most the cap,
   * gap the screen points between spots, swap a style's model table. Returns [{m, x, y, z, s, t, rgb}].
   */
  stand(view, s, k, most, gap, swap = {}) {
    const out = [], C0 = 128, fine = Math.log2((C0 * s) / gap), top = Math.max(0, Math.floor(fine)), grow = fine - top;
    for (let L = 0; L <= top + 1 && out.length < most; L++) {
      const C = C0 / 2 ** L, grown = L <= top ? 1 : Math.min(1, (grow - 0.4) * 2.5);
      if (grown < 0.3) break; // a spot grows in from a third of its size, never a speck
      for (let j = Math.floor(view[1] / C); j <= Math.floor(view[3] / C) && out.length < most; j++) for (let i = Math.floor(view[0] / C); i <= Math.floor(view[2] / C) && out.length < most; i++) {
        const key = (L * 16384 + i) * 16384 + j;
        let spot = this.kept.get(key);
        if (spot === undefined) {
          const x = (i + 0.15 + 0.7 * hash(L, i, j)) * C, y = (j + 0.15 + 0.7 * hash(j, L, i)) * C, got = this.at(x, y, hash(i, j, L + 7));
          spot = got ? [x, y, ...got] : null;
          if (this.kept.size > 60000) this.kept.clear();
          this.kept.set(key, spot);
        }
        if (!spot || spot[0] < view[0] || spot[0] > view[2] || spot[1] < view[1] || spot[1] > view[3]) continue;
        const m = swap[spot[2]] ?? (spot[2] === "ridge" ? swap.hill : undefined) ?? spot[2]; // a style that stands no hills stands no ridges
        if (m) out.push({ m, x: spot[0], y: spot[1], z: 1, s: k * spot[3] * grown, t: spot[4], rgb: m === "ridge" || m === "hill" ? [150, 132, 98] : null });
      }
    }
    return out;
  }
}
