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

/** Grow land from some starting cells until there is enough. `want` scores a cell. A test that throws dice may pass later. */
function grow(b, seeds, land, want, dice, ok = () => true) {
  const in_ = new Set(seeds);
  for (let idle = 0; in_.size < land;) {
    const edge = [...new Set([...in_].flatMap((i) => b.near[i]))].filter((i) => !in_.has(i) && ok(i));
    if (!edge.length) { if (++idle > 40) break; continue; }
    const list = edge.map((i) => [want(i, in_) + dice.below(8), i]);
    in_.add(list.reduce((x, y) => (y[0] > x[0] ? y : x))[1]);
  }
  return in_;
}

/** Steps on foot from a land cell to every other; -1 where it cannot walk. */
function walk(b, water, from) {
  const d = b.cells.map(() => -1), list = [from];
  d[from] = 0;
  for (let k = 0; k < list.length; k++) for (const m of b.near[list[k]]) if (d[m] < 0 && !water[m]) { d[m] = d[list[k]] + 1; list.push(m); }
  return d;
}

/** How fair a set of homes is: the nearest two on foot, and the land each has to itself within three steps (nearer to it
 * than to any other home). v is higher for better: three or more apart, every home within 15 percent of the best placed. */
function judge(b, water, at, d) {
  let apart = 99;
  for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) { const x = d(at[i])[at[j]]; apart = Math.min(apart, x < 0 ? 99 : x); }
  const room = at.map(() => 0);
  for (let c = 0; c < b.size; c++) {
    if (water[c]) continue;
    let low = 99, who = -1;
    for (let s = 0; s < at.length; s++) { const x = d(at[s])[c]; if (x >= 0 && x < low) { low = x; who = s; } else if (x === low) who = -1; }
    if (who >= 0 && low <= 3) room[who]++;
  }
  const lo = Math.min(...room), hi = Math.max(...room, 1), off = Math.trunc(((hi - lo) * 100 + hi - 1) / hi); // in percent, rounded up
  return { at, v: (apart >= 3 ? 4000 : 0) + (off <= 15 ? 2000 : 0) + 10 * Math.min(apart, 12) - off, even: apart >= 3 && off <= 15 };
}

/** Homes on land with two or more land neighbours, as fair as `judge` can make them: from a few far-apart starts, each home
 * moves to any cell that helps, until none does. */
function placeHomes(b, water, seats, dice) {
  const list = dice.shuffle(b.cells.map((_, i) => i).filter((i) => !water[i] && b.near[i].filter((m) => !water[m]).length > 1)), dist = new Map();
  const d = (h) => dist.get(h) || dist.set(h, walk(b, water, h)).get(h), gap = (i, j) => far([b.cells[i][0] - b.cells[j][0], b.cells[i][1] - b.cells[j][1]]);
  let best = null;
  for (let t = 0; t < Math.min(40, list.length) && !best?.even; t++) {
    const at = [list[t]];
    while (at.length < seats) at.push(list.reduce((x, y) => (Math.min(...at.map((a) => gap(a, y))) > Math.min(...at.map((a) => gap(a, x))) ? y : x)));
    let now = judge(b, water, at, d);
    for (let moved = true, pass = 0; moved && pass < 12; pass++) {
      moved = false;
      for (let s = 0; s < seats; s++) for (const c of list) {
        if (now.at.includes(c)) continue;
        const next = judge(b, water, now.at.map((a, k) => (k === s ? c : a)), d);
        if (next.v > now.v) { now = next; moved = true; }
      }
    }
    if (!best || now.v > best.v) best = now;
  }
  return best.at;
}

/** The shortest way over the sea from one set of land cells to another: the cells to raise. */
function causeway(b, from, to) {
  const back = new Map(), list = [...from].sort((x, y) => x - y);
  for (const i of list) back.set(i, -1);
  for (let k = 0; k < list.length; k++) {
    for (const m of b.near[list[k]]) {
      if (back.has(m)) continue;
      back.set(m, list[k]);
      if (to.has(m)) { const way = []; for (let x = list[k]; !from.has(x); x = back.get(x)) way.push(x); return way; }
      list.push(m);
    }
  }
  return [];
}

/** Returns { water, homes }. */
export function island(isle, size, seats, dice, homes) {
  const { radius, land } = SIZES[size], b = hexBoard(radius);
  if (isle === "small") { // Capo's own island: a full board with a few cells sunk, the sinking that leaves the homes most even
    const at = dice.shuffle(seats === 2 ? [b.corners[0], b.corners[3]] : seats === 3 ? [b.corners[0], b.corners[2], b.corners[4]] : b.corners.slice(0, seats));
    let best = null;
    for (let t = 0; t < 120 && !best?.even; t++) {
      const water = sink(b, b.cells.map(() => 0), new Set(at.flatMap((h) => [h, ...b.near[h]])), b.size - land, dice), now = judge(b, water, at, (h) => walk(b, water, h));
      if (!best || now.v > best.v) best = { ...now, water };
    }
    return { water: best.water, homes: at };
  }
  const middle = b.cells.findIndex((c) => far(c) === 0), touch = (i, s) => b.near[i].filter((m) => s.has(m)).length, sea = (i) => far(b.cells[i]) < radius || dice.below(3) === 0;
  const inside = (i) => far(b.cells[i]) < radius || land > 3 * radius * (radius - 1) + 1; // the rim too, when inside it is too small
  let dry;
  if (isle === "chain") { // islands in a row, each joined to the next by a causeway, so that nobody is stuck on one
    const many = size === "huge" || size === "large" ? 4 : 3, spots = dice.shuffle(b.corners.map((_, k) => k)).slice(0, many), seeds = spots.map((k) => { const [q, r] = b.cells[b.corners[k]]; const h = (v) => Math.trunc((v * 5) / 8); return b.cells.findIndex((c) => c[0] === h(q) && c[1] === h(r)); });
    const score = (i, set) => touch(i, set) * 2 - Math.floor(far(b.cells[i]) / 2), parts = [], each = land - 2 * (many - 1);
    dry = new Set();
    for (const [n, s] of seeds.entries()) {
      const others = new Set(dry), part = grow(b, [s], Math.floor(each / many) + (n ? 0 : each % many), score, dice, (i) => inside(i) && !others.has(i) && !b.near[i].some((m) => others.has(m)));
      for (const i of part) dry.add(i);
      parts.push(part);
    }
    for (let n = 1; n < parts.length; n++) for (const i of causeway(b, parts[n - 1], parts[n])) dry.add(i);
    if (dry.size < land) dry = grow(b, [...dry], land, score, dice, inside);
  } else if (isle === "crescent") {
    const bay = b.corners[dice.below(6)], [bq, br] = b.cells[bay], gap = (i) => { const [q, r] = b.cells[i]; return far([q - Math.trunc(bq / 2), r - Math.trunc(br / 2)]); };
    const start = b.cells.map((_, i) => i).filter((i) => far(b.cells[i]) < radius).reduce((x, y) => (gap(y) > gap(x) ? y : x));
    dry = grow(b, [start], land, (i, s) => touch(i, s) * 2 + Math.min(gap(i), radius - 1) * 2, dice, inside);
  } else if (isle === "arms") dry = grow(b, [middle], land, (i, s) => (touch(i, s) === 1 ? 9 : touch(i, s) === 2 ? 5 : 1), dice, (i) => far(b.cells[i]) < radius || dice.below(4) === 0);
  else dry = grow(b, [middle], land + (isle === "lakes" ? Math.floor(land / 6) : 0), (i, s) => touch(i, s) * 2 + (radius - far(b.cells[i])), dice, sea);
  const water = b.cells.map((_, i) => (dry.has(i) ? 0 : 1));
  if (isle === "lakes") sink(b, water, new Set(), Math.floor(land / 6), dice);
  const have = water.filter((w) => !w).length;
  if (have > land) sink(b, water, new Set(), have - land, dice); // a causeway too many
  return { water, homes: homes ? placeHomes(b, water, seats, dice) : [] };
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
