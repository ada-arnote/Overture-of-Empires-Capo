// SPDX-License-Identifier: AGPL-3.0-or-later
// Hedge and Highway (working name): lay the countryside one square tile at a time, send stewards to its lanes,
// towns, meadows and wells, and score what they hold. A finished lane or town scores at once and its stewards come
// home; what is left scores at the end. Our own tiles, mix, scores and names.
// Traditional: draw one tile, meadows on, six stewards, one bag. Capo: three tiles face up, no meadows, four stewards,
// three seasons that each end with half scores and every steward home. Custom: every switch by hand.
// Everything is in whole numbers and comes from the seed: the bag is shuffled once, at the start.
import { KINDS, LENGTHS, ORDER, ROTS, START, edgeOf, featAt } from "./tiles.js";

export const NONE = -1;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const RING = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
/** What the rule sets set. Custom takes each of these as it is given. */
export const SWITCHES = {
  choice: { values: [1, 2, 3], normal: 1 }, // tiles to choose from: one drawn, or two or three face up
  meadows: { values: [false, true], normal: true }, // stewards in meadows, scored at the end
  seasons: { values: [1, 3], normal: 1 }, // three: the bag is played in thirds, each ending with half scores and every steward home
  stewards: { values: [4, 5, 6, 7], normal: 6 },
  length: { values: ["short", "normal", "long"], normal: "normal" },
  rest: { values: ["none", "half", "tile"], normal: "tile" }, // what an unfinished lane, town or well scores at the end
};
const SETS = {
  classic: { choice: 1, meadows: true, seasons: 1, stewards: 6, length: "normal", rest: "tile" },
  ours: { choice: 3, meadows: false, seasons: 3, stewards: 4, length: "short", rest: "half" },
};

const key = (x, y) => (x + 4096) * 8192 + (y + 4096);
const GRIDS = new WeakMap(), SHAPES = new WeakMap();
/** Where each laid tile is: cell to its place in the list. Kept for each list, which is never changed once made. */
export function gridOf(laid) {
  let g = GRIDS.get(laid);
  if (!g) { g = new Map(laid.map(([x, y], t) => [key(x, y), t])); GRIDS.set(laid, g); }
  return g;
}
export const tileAt = (p, x, y) => gridOf(p.laid).get(key(x, y)) ?? NONE;
/** Does a kind, turned r times, fit at x, y: every edge the same as the one it meets? */
export function fits(laid, x, y, k, r) {
  const g = gridOf(laid);
  if (g.has(key(x, y))) return false;
  let touch = false;
  for (let e = 0; e < 4; e++) {
    const o = g.get(key(x + DX[e], y + DY[e]));
    if (o === undefined) continue;
    touch = true;
    const [, , ok, or] = laid[o];
    if (edgeOf(k, r, e) !== edgeOf(ok, or, (e + 2) % 4)) return false;
  }
  return touch;
}
/** The empty cells beside the countryside, top to bottom, left to right. */
export function spots(laid) {
  const g = gridOf(laid), out = [], seen = new Set();
  for (const [x, y] of laid) for (let e = 0; e < 4; e++) {
    const nx = x + DX[e], ny = y + DY[e], c = key(nx, ny);
    if (!g.has(c) && !seen.has(c)) { seen.add(c); out.push([nx, ny]); }
  }
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
/** Every place and turn a kind can be laid. */
export const placements = (laid, k) => spots(laid).flatMap(([x, y]) => ROTS[k].flatMap((r) => (fits(laid, x, y, k, r) ? [{ at: [x, y], rot: r }] : [])));
const canPlace = (laid, k) => spots(laid).some(([x, y]) => ROTS[k].some((r) => fits(laid, x, y, k, r)));

/**
 * The countryside's features: every lane, town, meadow and well, joined across tiles. A feature of tile t is the node
 * t * 8 + its place on the tile; find gives the node that stands for the whole feature. info: for each such root, its
 * kind, tiles, markets, open edges, the towns at its lane's gates, the towns its meadow touches and the wells in it.
 */
export function shape(laid) {
  let s = SHAPES.get(laid);
  if (s) return s;
  const g = gridOf(laid), up = Array.from({ length: laid.length * 8 }, (_, i) => i);
  const find = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
  const join = (a, b) => { a = find(a); b = find(b); if (a < b) up[b] = a; else if (b < a) up[a] = b; };
  laid.forEach(([x, y, k, r], t) => {
    for (const e of [1, 2]) { // east and south: each pair of tiles once
      const o = g.get(key(x + DX[e], y + DY[e]));
      if (o === undefined) continue;
      const [, , ok, or] = laid[o];
      for (let q = 0; q < 3; q++) join(t * 8 + featAt(k, r, e * 3 + q), o * 8 + featAt(ok, or, ((e + 2) % 4) * 3 + 2 - q));
    }
  });
  const info = new Map();
  laid.forEach(([x, y, k, r], t) => KINDS[k].feats.forEach((F, f) => {
    const root = find(t * 8 + f);
    let i = info.get(root);
    if (!i) info.set(root, (i = { kind: F.kind, tiles: 0, cells: [], markets: 0, open: 0, gates: [], towns: [], wells: 0 }));
    if (i.cells[i.cells.length - 1] !== t) { i.cells.push(t); i.tiles++; }
    i.markets += F.market || 0;
    if (F.edges) for (const b of F.edges) { const e = (b + r) % 4; if (!g.has(key(x + DX[e], y + DY[e]))) i.open++; }
    if (F.kind === "well") { const around = RING.filter(([dx, dy]) => g.has(key(x + dx, y + dy))).length; i.tiles = 1 + around; i.open = 8 - around; }
    if (F.gate >= 0) { const to = find(t * 8 + F.gate); if (!i.gates.includes(to)) i.gates.push(to); }
    if (F.towns) for (const tw of F.towns) { const to = find(t * 8 + tw); if (!i.towns.includes(to)) i.towns.push(to); }
    i.wells += F.well || 0;
  }));
  s = { find, info };
  SHAPES.set(laid, s);
  return s;
}
/** The features with the stewards in each: root to a count for each seat, in the order the stewards stand in the list. */
export function regions(p) {
  const s = shape(p.laid), men = new Map();
  for (const [t, f, seat] of p.men) {
    const root = s.find(t * 8 + f);
    if (!men.has(root)) men.set(root, Array(p.seats).fill(0));
    men.get(root)[seat]++;
  }
  return { ...s, men };
}
/** The feature a steward on feature f of a tile laid at x, y would join: is anyone in it already? */
function claimed(p, R, x, y, k, r, f) {
  const g = gridOf(p.laid);
  for (const b of KINDS[k].ports[f]) {
    const i = (b + 3 * r) % 12, e = (i / 3) | 0, o = g.get(key(x + DX[e], y + DY[e]));
    if (o === undefined) continue;
    const [, , ok, or] = p.laid[o];
    if (R.men.has(R.find(o * 8 + featAt(ok, or, ((e + 2) % 4) * 3 + 2 - (i % 3))))) return true;
  }
  return false;
}
/** The features of a tile laid here that a steward may go to: unclaimed, and a meadow only when meadows are on. */
export function freeOf(p, R, x, y, k, r) {
  return KINDS[k].feats.flatMap((F, f) => ((F.kind === "meadow" && !p.rule.meadows) || claimed(p, R, x, y, k, r, f) ? [] : [f]));
}

/** What a feature is worth: finished ("done"), at half, at one a tile, or nothing. A meadow by the towns it feeds. */
export function worth(R, i, how) {
  if (i.kind === "meadow") return 2 * i.towns.filter((t) => R.info.get(t).open === 0).length + i.wells;
  const full = i.kind === "lane" ? i.tiles * (i.gates.length >= 2 ? 2 : 1) : i.kind === "town" ? 2 * (i.tiles + i.markets) : i.tiles;
  if (how === "done") return full;
  if (how === "half") return Math.floor(full / 2);
  if (how === "tile") return i.kind === "town" ? i.tiles + i.markets : i.tiles;
  return 0;
}
/** The feature scores for whoever has most stewards in it, and its stewards come home. */
function award(p, R, root, points, events, when) {
  const counts = R.men.get(root), top = Math.max(...counts), winners = counts.flatMap((n, s) => (n === top ? [s] : [])), i = R.info.get(root);
  for (const s of winners) p.score[s] += points;
  p.men = p.men.filter(([t, f, s]) => { if (R.find(t * 8 + f) !== root) return true; p.home[s]++; return false; });
  if (points > 0) events.push({ kind: "score", what: i.kind, seats: winners, points, when, done: i.kind !== "meadow" && i.open === 0, cells: i.cells.map((t) => [p.laid[t][0], p.laid[t][1]]) });
}
/** After a tile is laid: the lanes and towns on it that it finished, and the wells it surrounded, score now. */
function close(p, t, events) {
  const R = regions(p), [x, y, k] = p.laid[t], roots = [];
  KINDS[k].feats.forEach((F, f) => { if (F.kind === "lane" || F.kind === "town") { const r = R.find(t * 8 + f); if (!roots.includes(r)) roots.push(r); } });
  for (const [dx, dy] of [[0, 0], ...RING]) {
    const o = tileAt(p, x + dx, y + dy), w = o < 0 ? -1 : KINDS[p.laid[o][2]].feats.findIndex((F) => F.kind === "well");
    if (w >= 0) roots.push(R.find(o * 8 + w));
  }
  for (const root of roots) { const i = R.info.get(root); if (i.open === 0 && R.men.has(root)) award(p, R, root, worth(R, i, "done"), events, "now"); }
}
/** Every claimed feature scores (unfinished ones as `how` says, meadows in full) and every steward comes home. */
function tally(p, how, events, when) {
  const R = regions(p);
  for (const root of R.men.keys()) { const i = R.info.get(root); award(p, R, root, worth(R, i, i.open === 0 ? "done" : how), events, when); }
  p.men = [];
  p.home = Array(p.seats).fill(p.rule.stewards);
}
/** Fill the row of tiles to choose from; a tile that fits nowhere is set aside and another drawn. */
function refill(p, events) {
  for (;;) {
    while (p.row.length < p.rule.choice && p.bag.length) p.row.push(p.bag.pop());
    const bad = p.row.findIndex((k) => !canPlace(p.laid, k));
    if (bad < 0) return;
    const [k] = p.row.splice(bad, 1);
    p.gone.push(k);
    events.push({ kind: "discard", tile: k });
  }
}
export const tilesLeft = (p) => p.bag.length + p.row.length;
export const pointsOf = (p, s) => p.score[s];
const used = (p) => p.laid.length - 1 + p.gone.length;

export const tile = {
  id: "tile", version: "1",
  options: { style: { values: ["classic", "ours", "custom"], normal: "classic" }, seats: { values: [2, 3, 4, 5], normal: 2 }, ...SWITCHES },
  setup(o, dice) {
    const rule = SETS[o.style] ? { ...SETS[o.style] } : Object.fromEntries(Object.keys(SWITCHES).map((k) => [k, o[k]]));
    const total = LENGTHS[rule.length][o.seats - 2], first = dice.below(o.seats);
    const p = { style: o.style, classic: o.style !== "ours", rule, seats: o.seats, total, bag: dice.shuffle(Array.from({ length: total }, (_, i) => ORDER[i % ORDER.length])), row: [], laid: [[0, 0, START, 0]], men: [],
      score: Array(o.seats).fill(0), home: Array(o.seats).fill(rule.stewards), first, seat: first, turns: 0, round: 1, season: 1, gone: [], last: null, over: null };
    refill(p, []);
    return p;
  },
  turn: (p) => (p.over ? null : p.seat),
  /** Lay one of the row's tiles (pick), at a cell, turned rot times, with a steward on one of its features (put) or none (-1). */
  moves(p) {
    const R = regions(p), out = [], room = p.home[p.seat] > 0;
    p.row.forEach((k, pick) => {
      if (p.row.indexOf(k) !== pick) return; // the same kind twice in the row is one choice
      for (const { at, rot } of placements(p.laid, k)) {
        out.push({ pick, at, rot, put: NONE });
        if (room) for (const put of freeOf(p, R, at[0], at[1], k, rot)) out.push({ pick, at, rot, put });
      }
    });
    return out;
  },
  /** The quick test of one move, the same answer as finding it in the list. */
  allows(p, m) {
    if (!m || typeof m !== "object" || Object.keys(m).sort().join() !== "at,pick,put,rot") return false;
    const { pick, at, rot, put } = m, k = p.row[pick];
    if (!Number.isInteger(pick) || k === undefined || p.row.indexOf(k) !== pick || !ROTS[k].includes(rot)) return false;
    if (!Array.isArray(at) || at.length !== 2 || !at.every(Number.isInteger) || Math.abs(at[0]) > 4000 || Math.abs(at[1]) > 4000 || !fits(p.laid, at[0], at[1], k, rot)) return false;
    return put === NONE || (Number.isInteger(put) && p.home[p.seat] > 0 && freeOf(p, regions(p), at[0], at[1], k, rot).includes(put));
  },
  apply(before, m) {
    const s = before.seat, k = before.row[m.pick], events = [];
    const p = { ...before, row: before.row.filter((_, i) => i !== m.pick), laid: [...before.laid, [m.at[0], m.at[1], k, m.rot]], men: before.men.map((x) => [...x]), score: [...before.score], home: [...before.home], bag: [...before.bag], gone: [...before.gone], last: [m.at[0], m.at[1]] };
    const t = p.laid.length - 1;
    if (m.put >= 0) { p.men.push([t, m.put, s]); p.home[s]--; }
    events.push({ kind: "lay", seat: s, at: [m.at[0], m.at[1]], tile: k, rot: m.rot, put: m.put, what: m.put >= 0 ? KINDS[k].feats[m.put].kind : "" });
    close(p, t, events);
    p.seat = (s + 1) % p.seats;
    p.turns++;
    p.round = Math.floor(p.turns / p.seats) + 1;
    refill(p, events);
    // a season ends when its share of the bag is used: what is claimed scores at half, and every steward comes home
    while (p.season < p.rule.seasons && used(p) * p.rule.seasons >= p.total * p.season) {
      events.push({ kind: "season", n: p.season });
      tally(p, "half", events, "season");
      p.season++;
    }
    if (!p.row.length) {
      tally(p, p.rule.rest, events, "end");
      const top = Math.max(...p.score), winners = p.score.flatMap((v, i) => (v === top ? [i] : []));
      p.over = { winners, why: `${winners.length > 1 ? "shared the lead" : "led"} with ${top} points when the last tile was laid` };
      events.push({ kind: "end", winners, points: top });
    }
    return { position: p, events };
  },
  result: (p) => p.over,
};
