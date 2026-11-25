// SPDX-License-Identifier: AGPL-3.0-or-later
// Lands of provinces: round an inner sea, on islands, or the real world. Provinces are patches of small hexes, so every
// border is a real border. The same key always grows the same land.
import { chance, seedState } from "../core/index.js";
import { hexBoard, joined } from "./hex.js";
import { CELLS, COLS, CROSSINGS, MARKS, LANDS as WORLD_LANDS, NAMES as WORLD_NAMES, REGION } from "./maps/world.js";

const R = 11, PROVINCES = 36, SIZES = [5, 6, 7, 8, 10], TRIES = 200;
const NAMES = ["Aldermoor", "Ashwick", "Barrowgate", "Bellhollow", "Bracken", "Brightwater", "Calder", "Candlemere", "Carrow", "Cinderford", "Coldharbour", "Corvane", "Dunmarsh", "Eastlode", "Elmreach", "Fallowdale", "Farrow", "Fenwater", "Flintholm", "Foxhythe", "Gallowfield", "Glasswell", "Greywether", "Halloway", "Harrowdown", "Hazelmark", "Heronstead", "Highmoor", "Ironbeck", "Kestrel", "Lanternhead", "Larkfell", "Longstrand", "Maplecross", "Merrow", "Millstone", "Netherby", "Northlode", "Oxmere", "Pellgate", "Quarryhill", "Ravensay", "Redwillow", "Saltmarsh", "Sedgeford", "Silverlea", "Stonewade", "Summerley", "Tallowbridge", "Tarnside", "Thornwick", "Umberfield", "Valecross", "Wardenhill", "Westerby", "Whitcombe", "Windrush", "Wolverden", "Yarrow", "Yewdale"];
const LANDS = ["the Amber Coast", "the Bronze Hills", "the Chalk Downs", "the Drum Country", "the Grey Reach", "the High Pastures", "the Lantern Shore", "the Old Marches", "the Salt Flats", "the Tin Valleys"];
const far = ([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
const SIGNS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const made = new Map();

/** Steps from a start, through places that pass the test. -1 where it cannot reach. */
export function steps(near, starts, ok = () => true) {
  const d = near.map(() => -1), list = [];
  for (const s of starts) if (d[s] < 0) { d[s] = 0; list.push(s); }
  for (let i = 0; i < list.length; i++) for (const m of near[list[i]]) if (d[m] < 0 && ok(m)) { d[m] = d[list[i]] + 1; list.push(m); }
  return d;
}

/** Places as far from one another as they can be. */
function spread(near, n, dice, ok = () => true, gap = null) {
  const all = dice.shuffle(near.map((_, i) => i).filter(ok)), out = [all[0]];
  while (out.length < n) {
    const d = steps(near, out, ok);
    out.push(all.reduce((a, b) => (d[b] > d[a] ? b : a)));
    if (gap && out.length === 2) { out.shift(); gap = null; } // the first was only a place to start from
  }
  return out;
}

/** Share out places among seeds. Whoever has least of what it wants goes next. */
function share(near, seeds, want, dice, ok = () => true) {
  const of = near.map(() => -1), size = seeds.map(() => 1);
  seeds.forEach((s, k) => { of[s] = k; });
  for (;;) {
    let best = null;
    const order = seeds.map((_, k) => k).sort((a, b) => size[a] * want[b] - size[b] * want[a] || a - b);
    for (const k of order) {
      let top = -1;
      for (let i = 0; i < near.length; i++) {
        if (of[i] !== k) continue;
        for (const m of near[i]) if (of[m] < 0 && ok(m)) {
          const v = near[m].reduce((n, x) => n + (of[x] === k ? 12 : 0), 0) + dice.below(9);
          if (v > top) { top = v; best = [m, k]; }
        }
      }
      if (best) break;
    }
    if (!best) return { of, size };
    of[best[0]] = best[1];
    size[best[1]]++;
  }
}

/** Small shares take cells from bigger neighbours, as long as nobody is cut in two. Changes both lists. */
function even(near, of, size, least) {
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (let k = 0; k < size.length; k++) {
      if (size[k] >= least) continue;
      const gives = [...new Set(of.flatMap((o, i) => (o === k ? near[i].filter((m) => of[m] >= 0 && of[m] !== k) : [])))]
        .filter((m) => { const o = of[m], rest = near[m].find((x) => of[x] === o); return size[o] > size[k] + 1 && joined(near, rest ?? m, (x) => x !== m && of[x] === o).length === size[o] - 1; });
      if (!gives.length) continue;
      const m = gives.reduce((a, b) => (size[of[b]] > size[of[a]] ? b : a));
      size[of[m]]--;
      of[m] = k;
      size[k]++;
      changed = true;
    }
    if (!changed) return;
  }
}

/** Do two straight lines cross? Corners in hex steps serve as well as any others. */
function cross(a, b, c, d) {
  const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);
}

function grow(dice) {
  const g = hexBoard(R), sea = g.cells.map((c) => (far(c) === R ? dice.below(4) > 0 : far(c) === R - 1 && dice.below(5) === 0));
  g.cells.forEach((c, i) => { if (far(c) >= R - 2 && !sea[i] && dice.below(5) === 0 && g.near[i].some((m) => sea[m])) sea[i] = true; });
  g.cells.forEach((c, i) => { const w = g.near[i].filter((m) => sea[m]).length; if (far(c) < R) sea[i] = sea[i] ? w > 0 : w >= g.near[i].length - 1; });
  // the inner sea
  const inner = new Set([dice.pick(g.cells.map((_, i) => i).filter((i) => far(g.cells[i]) <= 2))]), want = 20 + dice.below(12);
  while (inner.size < want) {
    const edge = [...new Set([...inner].flatMap((i) => g.near[i]))].filter((i) => !inner.has(i) && far(g.cells[i]) <= 6);
    inner.add(edge.reduce((a, b) => { const v = (x) => g.near[x].filter((m) => inner.has(m)).length * 2; return v(b) + dice.below(6) > v(a) + dice.below(6) ? b : a; }));
  }
  for (const i of inner) sea[i] = true;
  const whole = joined(g.near, g.cells.findIndex((c, i) => !sea[i] && far(c) >= 5), (m) => !sea[m]), land = new Set(whole);
  if (land.size < 250) return null;
  const ok = (i) => land.has(i);
  const { of, size } = share(g.near, spread(g.near, PROVINCES, dice, ok), Array(PROVINCES).fill(1), dice, ok);
  even(g.near, of, size, 6);
  if (Math.min(...size) < 5) return null;
  const touch = Array.from({ length: PROVINCES }, () => new Set());
  for (const i of land) for (const m of g.near[i]) if (of[m] >= 0 && of[m] !== of[i]) touch[of[i]].add(of[m]);
  const dry = touch.map((s) => [...s].sort((a, b) => a - b));
  if (dry.some((n) => n.length < 2)) return null;
  // crossings over the inner sea, between provinces that are far apart by land
  const shore = [...new Set([...inner].flatMap((i) => g.near[i]).filter(ok))].sort((a, b) => a - b), pairs = [], links = [], ends = [];
  const apart = (i, j) => far([g.cells[i][0] - g.cells[j][0], g.cells[i][1] - g.cells[j][1]]);
  for (const i of shore) { // the shortest clear water from each shore to each other one
    const d = steps(dry, [of[i]]), wet = steps(g.near, [i], (m) => inner.has(m));
    for (const j of shore) {
      if (of[j] <= of[i] || d[of[j]] < 4) continue;
      const water = Math.min(...g.near[j].map((m) => (wet[m] > 0 && inner.has(m) ? wet[m] : 99))) + 1;
      if (water < 99 && water <= apart(i, j)) pairs.push([of[i], of[j], d[of[j]], i, j, water]);
    }
  }
  for (const [a, b, , i, j] of dice.shuffle(pairs).sort((x, y) => (y[2] * 2 - y[5]) - (x[2] * 2 - x[5]))) {
    if (links.length === 2 || links.some((l) => l.includes(a) || l.includes(b)) || ends.some((e) => e.some((x) => apart(x, i) < 4 || apart(x, j) < 4) || cross(g.cells[i], g.cells[j], ...e.map((x) => g.cells[x])))) continue;
    links.push([a, b]);
    ends.push([i, j]);
  }
  if (!links.length) return null;
  const { of: region, size: sizes } = share(dry, spread(dry, SIZES.length, dice), SIZES, dice);
  if (Math.min(...sizes) < 4 || Math.max(...sizes) > 12) return null;
  return finish(g, of, { links, ends, region, names: dice.shuffle(NAMES).slice(0, PROVINCES), lands: dice.shuffle(LANDS).slice(0, SIZES.length) });
}

/** Everything else about a board follows from which small hex is in which province. */
function finish(g, of, { links, ends, region, names, lands, flat = false, marks = null }) {
  const n = names.length, touch = Array.from({ length: n }, () => new Set());
  of.forEach((o, i) => { if (o >= 0) for (const m of g.near[i]) if (of[m] >= 0 && of[m] !== o) touch[o].add(of[m]); });
  const dry = touch.map((s) => [...s].sort((x, y) => x - y));
  const near = dry.map((list, i) => [...new Set([...list, ...links.flatMap(([x, y]) => (x === i ? [y] : y === i ? [x] : []))])].sort((x, y) => x - y));
  const sizes = lands.map((_, k) => region.filter((x) => x === k).length), cellsOf = Array.from({ length: n }, () => []);
  of.forEach((o, i) => { if (o >= 0) cellsOf[o].push(i); });
  const apart = (i, j) => far([g.cells[i][0] - g.cells[j][0], g.cells[i][1] - g.cells[j][1]]);
  // the middle of a province: the cell farthest from its border, then nearest its other cells
  const deep = [], mid = cellsOf.map((mine, k) => {
    const edge = mine.filter((i) => g.near[i].length < 6 || g.near[i].some((m) => of[m] !== k)), d = steps(g.near, edge, (m) => of[m] === k);
    deep[k] = d;
    const gap = (i) => mine.reduce((s, m) => s + apart(i, m), 0);
    return mine.reduce((x, y) => ((d[y] - d[x] || gap(x) - gap(y)) > 0 ? y : x));
  });
  for (let pass = 0; pass < 3; pass++) { // then away from its neighbours' middles, so that pieces do not stand on one another
    for (let k = 0; k < n; k++) {
      const v = (i) => 5 * Math.min(4, ...near[k].map((o) => apart(mid[o], i))) + 3 * deep[k][i];
      for (const i of cellsOf[k]) if (v(i) > v(mid[k])) mid[k] = i;
    }
  }
  return { n, near, dry, links, ends, region, sizes, fine: g.cells, of, mid, names, lands, flat, marks };
}

/** The closest two cells of two groups of cells. */
function closest(g, A, B) {
  let best = null;
  for (const i of A) for (const j of B) { const d = far([g.cells[i][0] - g.cells[j][0], g.cells[i][1] - g.cells[j][1]]); if (!best || d < best[0]) best = [d, i, j]; }
  return best;
}

/** Islands: each one is a land of its own, joined by crossings. */
function isles(dice) {
  const g = hexBoard(R + 1), many = 6, of = g.cells.map(() => -1), home = spread(g.near, many, dice, (i) => far(g.cells[i]) <= R - 2), isle = g.cells.map(() => -1), size = home.map(() => 1), want = dice.shuffle([34, 40, 46, 52, 60, 68]);
  home.forEach((h, k) => { isle[h] = k; });
  for (let turn = 0; turn < 420; turn++) {
    const k = turn % many;
    if (size[k] >= want[k]) continue;
    const edge = g.cells.map((_, i) => i).filter((i) => isle[i] < 0 && far(g.cells[i]) <= R && g.near[i].some((m) => isle[m] === k) && g.near[i].every((m) => (isle[m] < 0 || isle[m] === k) && g.near[m].every((x) => isle[x] < 0 || isle[x] === k)));
    if (!edge.length) { want[k] = size[k]; continue; }
    const v = (i) => g.near[i].filter((m) => isle[m] === k).length * 2 + dice.below(5);
    const at = edge.map((i) => [v(i), i]).reduce((x, y) => (y[0] > x[0] ? y : x))[1];
    isle[at] = k;
    size[k]++;
  }
  if (Math.min(...size) < 24) return null;
  const region = [], groups = home.map(() => []);
  let next = 0;
  home.forEach((_, k) => {
    const parts = Math.floor(size[k] / 7), ok = (i) => isle[i] === k, got = share(g.near, spread(g.near, parts, dice, ok), Array(parts).fill(1), dice, ok);
    even(g.near, got.of, got.size, 5);
    got.of.forEach((o, i) => { if (o >= 0) { of[i] = next + o; groups[k].push(i); } });
    for (let x = 0; x < parts; x++) region.push(k);
    next += parts;
  });
  if (next < 30 || next > NAMES.length) return null;
  const pairs = [];
  for (let x = 0; x < many; x++) for (let y = x + 1; y < many; y++) pairs.push([...closest(g, groups[x], groups[y]), x, y]);
  pairs.sort((x, y) => x[0] - y[0]);
  const set = home.map((_, k) => k), links = [], ends = [], find = (k) => (set[k] === k ? k : find(set[k]));
  for (const [d, i, j, x, y] of pairs) { // join every island, then the shortest of what is left
    if (find(x) === find(y) && (d > 6 || links.length >= many + 2)) continue;
    set[find(x)] = find(y);
    links.push([of[i], of[j]]);
    ends.push([i, j]);
  }
  return finish(g, of, { links, ends, region, names: dice.shuffle(NAMES).slice(0, next), lands: dice.shuffle(LANDS).slice(0, many) });
}

/** The real coast, with our own provinces. */
function earth() {
  const cells = [], of = [], at = new Map();
  CELLS.forEach((line, r) => {
    let c = 0, many = "";
    const put = (o) => { for (let k = 0; k < (Number(many) || 1); k++) { const q = c - (r - (r & 1)) / 2; at.set(q * 1000 + r, cells.length); cells.push([q, r]); of.push(o); c++; } many = ""; };
    for (let i = 0; i < line.length; i++) {
      const s = line[i];
      if (s === "~") put(SIGNS.indexOf(line[++i]));
      else if (s >= "0" && s <= "9") many += s;
      else put(s === "." ? -1 : SIGNS.indexOf(s));
    }
    while (c < COLS) put(-1);
  });
  const near = cells.map(([q, r]) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].map(([x, y]) => at.get((q + x) * 1000 + r + y)).filter((x) => x !== undefined)), g = { cells, near };
  const groups = WORLD_NAMES.map(() => []);
  of.forEach((o, i) => { if (o >= 0) groups[o].push(i); });
  const ends = CROSSINGS.map(([x, y]) => closest(g, groups[x], groups[y]).slice(1));
  return finish(g, of, { links: CROSSINGS, ends, region: REGION, names: WORLD_NAMES, lands: WORLD_LANDS, flat: true, marks: MARKS });
}

/** Where each seat starts: far apart, with about as much land close by. */
export function starts(b, seats, dice) {
  let best = null;
  for (let t = 0; t < 40; t++) {
    const at = t === 0 ? spread(b.near, seats, dice, () => true, true) : dice.shuffle(b.near.map((_, i) => i)).slice(0, seats);
    const ds = at.map((a) => steps(b.near, [a])), apart = Math.min(...at.flatMap((a, i) => at.map((c, j) => (i === j ? 99 : ds[i][c]))));
    const room = ds.map((d) => d.filter((x) => x <= 2).length), uneven = Math.max(...room) - Math.min(...room);
    const own = b.near.map((_, i) => { const v = ds.map((d) => d[i]), low = Math.min(...v); return v.filter((x) => x === low).length === 1 ? v.indexOf(low) : -1; });
    const held = at.map((_, s) => own.filter((o) => o === s).length), reach = Math.max(...held) - Math.min(...held);
    const v = 4 * Math.min(apart, 5) - 2 * uneven - reach;
    if (!best || v > best.v) best = { at, v, apart, uneven };
  }
  return best;
}

export const MAPS = ["world", "grown", "isles"];
/** The land of a kind that grows from a key. There is only one world. */
export function areaBoard(key, map = "grown") {
  const id = map === "world" ? "world" : `${map}/${key}`;
  if (made.has(id)) return made.get(id);
  for (let t = 0; t < TRIES; t++) {
    const dice = chance(seedState(`areas/${id}/${t}`)), b = map === "world" ? earth() : map === "isles" ? isles(dice) : grow(dice);
    if (!b) continue;
    b.starts = {};
    for (const n of [2, 3, 4, 5, 6]) b.starts[n] = starts(b, n, dice);
    if (map === "grown" && [2, 3, 4].some((n) => b.starts[n].apart < 3 || b.starts[n].uneven > 3)) continue;
    if (joined(b.near, 0, () => true).length !== b.n) continue;
    for (const n of [2, 3, 4, 5, 6]) b.starts[n] = b.starts[n].at;
    const done = Object.freeze({ ...b, tries: t + 1 });
    if (made.size > 40) made.clear();
    made.set(id, done);
    return done;
  }
  throw new Error(`no land grew from ${id}`);
}
