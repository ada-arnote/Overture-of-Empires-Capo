// SPDX-License-Identifier: AGPL-3.0-or-later
// A land of provinces round an inner sea, grown from a key. Provinces are patches of small hexes, so every
// border is a real border. The same key always grows the same land.
import { chance, seedState } from "../core/index.js";
import { hexBoard, joined } from "./hex.js";

const R = 11, PROVINCES = 36, SIZES = [5, 6, 7, 8, 10], TRIES = 200;
const NAMES = ["Aldermoor", "Ashwick", "Barrowgate", "Bellhollow", "Bracken", "Brightwater", "Calder", "Candlemere", "Carrow", "Cinderford", "Coldharbour", "Corvane", "Dunmarsh", "Eastlode", "Elmreach", "Fallowdale", "Farrow", "Fenwater", "Flintholm", "Foxhythe", "Gallowfield", "Glasswell", "Greywether", "Halloway", "Harrowdown", "Hazelmark", "Heronstead", "Highmoor", "Ironbeck", "Kestrel", "Lanternhead", "Larkfell", "Longstrand", "Maplecross", "Merrow", "Millstone", "Netherby", "Northlode", "Oxmere", "Pellgate", "Quarryhill", "Ravensay", "Redwillow", "Saltmarsh", "Sedgeford", "Silverlea", "Stonewade", "Summerley", "Tallowbridge", "Tarnside", "Thornwick", "Umberfield", "Valecross", "Wardenhill", "Westerby", "Whitcombe", "Windrush", "Wolverden", "Yarrow", "Yewdale"];
const LANDS = ["the Amber Coast", "the Bronze Hills", "the Chalk Downs", "the Drum Country", "the Grey Reach", "the High Pastures", "the Lantern Shore", "the Old Marches", "the Salt Flats", "the Tin Valleys"];
const far = ([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
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
  const near = dry.map((n, i) => [...n, ...links.flatMap(([a, b]) => (a === i ? [b] : b === i ? [a] : []))].sort((x, y) => x - y));
  const { of: region, size: sizes } = share(dry, spread(dry, SIZES.length, dice), SIZES, dice);
  if (Math.min(...sizes) < 4 || Math.max(...sizes) > 12) return null;
  // the middle of a province: the cell farthest from its border, then nearest its other cells
  const deep = [], mid = dry.map((_, k) => {
    const mine = [...land].filter((i) => of[i] === k), edge = mine.filter((i) => g.near[i].length < 6 || g.near[i].some((m) => of[m] !== k)), d = steps(g.near, edge, (m) => of[m] === k);
    deep[k] = d;
    const gap = (i) => mine.reduce((n, m) => { const a = g.cells[i], b = g.cells[m]; return n + far([a[0] - b[0], a[1] - b[1]]); }, 0);
    return mine.reduce((a, b) => (d[b] - d[a] || gap(a) - gap(b)) > 0 ? b : a);
  });
  for (let pass = 0; pass < 3; pass++) { // then away from its neighbours' middles, so that pieces do not stand on one another
    for (let k = 0; k < PROVINCES; k++) {
      const v = (i) => 5 * Math.min(4, ...mid.map((m, o) => (o === k ? 9 : apart(m, i)))) + 3 * deep[k][i];
      for (let i = 0; i < of.length; i++) if (of[i] === k && v(i) > v(mid[k])) mid[k] = i;
    }
  }
  return { n: PROVINCES, near, dry, links, ends, region, sizes, fine: g.cells, of, mid, inner: [...inner], names: dice.shuffle(NAMES).slice(0, PROVINCES), lands: dice.shuffle(LANDS).slice(0, SIZES.length) };
}

/** Where each seat starts: far apart, with about as much land close by. Null when this land has no fair places. */
function starts(b, seats, dice) {
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
  return best.apart >= 3 && best.uneven <= 3 ? best.at : null;
}

/** The land that grows from a key. */
export function areaBoard(key) {
  if (made.has(key)) return made.get(key);
  for (let t = 0; t < TRIES; t++) {
    const dice = chance(seedState(`areas/${key}/${t}`)), b = grow(dice);
    if (!b) continue;
    b.starts = { 2: starts(b, 2, dice), 3: starts(b, 3, dice), 4: starts(b, 4, dice) };
    if (Object.values(b.starts).some((s) => !s)) continue;
    const done = Object.freeze({ ...b, tries: t + 1 });
    if (made.size > 40) made.clear();
    made.set(key, done);
    return done;
  }
  throw new Error(`no land grew from ${key}`);
}
