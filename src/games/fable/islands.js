// SPDX-License-Identifier: AGPL-3.0-or-later
// The islands of The Island Fable. Each is grown from the game's own dice, so a seed always gives the same one.
import { hexBoard, joined } from "../hex.js";

export const SIZES = { tiny: { radius: 3, land: 32 }, small: { radius: 5, land: 48 }, medium: { radius: 7, land: 92 }, large: { radius: 8, land: 132 }, huge: { radius: 10, land: 180 } };
export const ISLES = ["round", "lakes", "crescent", "arms", "chain"];
const far = ([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

/** Drop some cells into the sea, keeping the island in one piece and some cells dry. */
function sink(b, water, kept, many, dice) {
  let left = many;
  for (const c of dice.shuffle(b.cells.map((_, i) => i))) {
    if (!left || kept.has(c) || water[c]) continue;
    water[c] = 1;
    const first = water.indexOf(0), size = joined(b.near, first, (m) => !water[m]).length;
    if (size !== water.filter((w) => !w).length) water[c] = 0; else left--;
  }
  return water;
}

/** Grow land from some starting cells until there is enough. `want` scores a cell. */
function grow(b, seeds, land, want, dice, ok = () => true) {
  const in_ = new Set(seeds);
  while (in_.size < land) {
    const edge = [...new Set([...in_].flatMap((i) => b.near[i]))].filter((i) => !in_.has(i) && ok(i));
    if (!edge.length) break;
    const list = edge.map((i) => [want(i, in_) + dice.below(8), i]);
    in_.add(list.reduce((x, y) => (y[0] > x[0] ? y : x))[1]);
  }
  return in_;
}

/** Returns { water, homes }. */
export function island(isle, size, seats, dice, homes) {
  const { radius, land } = SIZES[size], b = hexBoard(radius);
  if (isle === "small") { // Capo's own island: a full board with a few cells sunk
    const at = dice.shuffle(seats === 2 ? [b.corners[0], b.corners[3]] : seats === 3 ? [b.corners[0], b.corners[2], b.corners[4]] : b.corners.slice(0, seats));
    return { water: sink(b, b.cells.map(() => 0), new Set(at.flatMap((h) => [h, ...b.near[h]])), b.size - land, dice), homes: at };
  }
  const middle = b.cells.findIndex((c) => far(c) === 0), touch = (i, s) => b.near[i].filter((m) => s.has(m)).length, sea = (i) => far(b.cells[i]) < radius || dice.below(3) === 0;
  let dry;
  if (isle === "chain") {
    const many = size === "huge" || size === "large" ? 4 : 3, spots = dice.shuffle(b.corners.map((_, k) => k)).slice(0, many), seeds = spots.map((k) => { const [q, r] = b.cells[b.corners[k]]; const h = (v) => Math.trunc((v * 5) / 8); return b.cells.findIndex((c) => c[0] === h(q) && c[1] === h(r)); });
    dry = new Set();
    for (const [n, s] of seeds.entries()) {
      const others = new Set(dry), part = grow(b, [s], Math.floor(land / many) + (n ? 0 : land % many), (i, set) => touch(i, set) * 2 - Math.floor(far(b.cells[i]) / 2), dice, (i) => far(b.cells[i]) < radius && !others.has(i) && !b.near[i].some((m) => others.has(m)));
      for (const i of part) dry.add(i);
    }
  } else if (isle === "crescent") {
    const bay = b.corners[dice.below(6)], [bq, br] = b.cells[bay], gap = (i) => { const [q, r] = b.cells[i]; return far([q - Math.trunc(bq / 2), r - Math.trunc(br / 2)]); };
    const start = b.cells.map((_, i) => i).filter((i) => far(b.cells[i]) < radius).reduce((x, y) => (gap(y) > gap(x) ? y : x));
    dry = grow(b, [start], land, (i, s) => touch(i, s) * 2 + Math.min(gap(i), radius - 1) * 2, dice, (i) => far(b.cells[i]) < radius);
  } else if (isle === "arms") dry = grow(b, [middle], land, (i, s) => (touch(i, s) === 1 ? 9 : touch(i, s) === 2 ? 5 : 1), dice, (i) => far(b.cells[i]) < radius || dice.below(4) === 0);
  else dry = grow(b, [middle], land + (isle === "lakes" ? Math.floor(land / 6) : 0), (i, s) => touch(i, s) * 2 + (radius - far(b.cells[i])), dice, sea);
  const water = b.cells.map((_, i) => (dry.has(i) ? 0 : 1));
  if (isle === "lakes") sink(b, water, new Set(), Math.floor(land / 6), dice);
  // homes: land cells as far apart as they can be
  let at = [];
  if (homes) {
    const list = dice.shuffle([...dry].filter((i) => !water[i] && b.near[i].filter((m) => !water[m]).length > 2));
    at = [list[0]];
    const gap = (i, j) => far([b.cells[i][0] - b.cells[j][0], b.cells[i][1] - b.cells[j][1]]);
    while (at.length < seats) at.push(list.reduce((x, y) => (Math.min(...at.map((a) => gap(a, y))) > Math.min(...at.map((a) => gap(a, x))) ? y : x)));
  }
  return { water, homes: at };
}

const made = new Map();
/** For each land cell, the land a boat can reach over up to `steps` cells of sea. */
export function seaRoads(b, water, steps) {
  const key = `${b.radius}/${steps}/${water.join("")}`;
  if (made.has(key)) return made.get(key);
  const out = b.cells.map((_, i) => {
    if (water[i]) return [];
    const seen = new Set(), land = new Set();
    let ring = b.near[i].filter((m) => water[m]);
    for (const m of ring) seen.add(m);
    for (let k = 1; k <= steps && ring.length; k++) {
      const next = [];
      for (const w of ring) for (const m of b.near[w]) { if (!water[m]) { if (m !== i && !b.near[i].includes(m)) land.add(m); } else if (!seen.has(m)) { seen.add(m); next.push(m); } }
      ring = next;
    }
    return [...land].sort((x, y) => x - y);
  });
  if (made.size > 30) made.clear();
  made.set(key, out);
  return out;
}
