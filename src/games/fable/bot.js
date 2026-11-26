// SPDX-License-Identifier: AGPL-3.0-or-later
// Bots for The Island Fable. One action at a time: try each on a copy and keep the best, or stop.
// It also looks a few steps ahead for one strike: raise scouts onto a unit, or join two where steps at home are free, then take.
import { NONE, WOOD, act, beats, boardOf, cellsOf, defence, fable, goalOf, groupsOf, landOf, raiseOf, territories, topOf, upkeepOf } from "./rules.js";

export const TIERS = ["random", "easy", "normal"];

/** The bots' plain rule for giving up: one rival holds at least half the island and at least three times their land. */
export function hopeless(p, seat) {
  const mine = cellsOf(p, seat), land = landOf(p);
  for (let s = 0; s < p.seats; s++) if (s !== seat && 2 * cellsOf(p, s) >= land && cellsOf(p, s) >= 3 * mine) return true;
  return false;
}

/** How good a position is for one seat, in whole numbers. */
export function value(p, seat) {
  const { near } = boardOf(p), mine = cellsOf(p, seat), last = p.rule.goal === "last";
  let best = 0, least = 0, v = 0;
  for (let s = 0; s < p.seats; s++) if (s !== seat) { const c = cellsOf(p, s); best = Math.max(best, c); if (c && (!least || c < least)) least = c; }
  if (mine >= goalOf(p)) v += 50000;
  v += 100 * (mine - (last ? least : best)) + 50 * mine; // racing to a goal, watch the leader; playing to the last, finish off the weakest
  for (const g of groupsOf(p, seat)) if (g.length < 2) v -= 60;
  for (const t of territories(p, seat)) {
    const ranks = t.cells.reduce((n, c) => n + p.unit[c], 0), deep = t.purse + 2 * t.net;
    v += 2 * (p.classic ? Math.min(t.purse, 60) : t.purse) + 25 * ranks + (p.classic ? 14 * Math.min(6, t.net) : 0);
    if (t.net < 0 && deep < 0) v -= 200 + 100 * ranks; // it would starve within two turns
    if (t.net < 0 && p.classic) v += 10 * t.net;
    for (const c of t.cells) {
      if (p.tree[c] === WOOD) v -= 45;
      if (p.farm[c]) v += 45;
      if (p.fort[c]) v += 26;
      if (near[c].some((m) => p.owner[m] !== NONE && p.owner[m] !== seat)) { const d = defence(p, c); if (d < 1) v -= 30; else if (d > 1 && p.classic) v += 5; }
    }
  }
  return v;
}

/** A step inside your own land that leaves the unit ready: free where the rules say so. */
const free = (p, m) => m.do === "move" && !m.sea && p.rule.walk === "free" && p.owner[m.to] === p.seat && !p.tree[m.to];

/** The moves worth a look: takes, clearing, joining, guarding a border, building beside one. */
function sensible(p, all) {
  const { near } = boardOf(p), me = p.seat, border = (c) => near[c].some((m) => p.owner[m] !== me && !p.water[m]), rich = new Map();
  for (const t of territories(p, me)) for (const c of t.cells) rich.set(c, t);
  const takes = all.filter((m) => m.to !== undefined && p.owner[m.to] !== me), strong = new Set(takes.filter((m) => m.do === "move").map((m) => m.from));
  return all.filter((m) => {
    if (m.to === undefined) return false;
    if (p.owner[m.to] !== me) return true;
    if (m.do === "farm") return !border(m.to);
    if (m.do === "fort") return border(m.to) && defence(p, m.to) < 2;
    if (p.unit[m.to]) { // joining: only when it can be paid for and there is something it would then beat
      const t = rich.get(m.to), now = p.unit[m.to] + (m.do === "raise" ? 1 : p.unit[m.from]), more = upkeepOf(p, now) - upkeepOf(p, p.unit[m.to]) - (m.do === "raise" ? 0 : upkeepOf(p, p.unit[m.from]));
      return now <= topOf(p) && t && t.net - more >= -4 && t.cells.some((c) => near[c].some((x) => p.owner[x] !== me && !p.water[x] && defence(p, x) === now - 1));
    }
    if (p.tree[m.to]) return true;
    if (m.do === "move" && strong.has(m.from)) return false; // it has better to do
    return border(m.to) && defence(p, m.to) < 1;
  });
}

/**
 * Strikes a single action cannot make: build a unit up (raise scouts onto it, or, where steps at home are free, join two),
 * then take a hex nothing ready could. One cheapest way for each target and territory; each is a list of moves.
 */
function plans(p) {
  const { near } = boardOf(p), me = p.seat, price = raiseOf(p), top = topOf(p), out = [], walk = p.rule.walk === "free";
  for (const t of territories(p, me)) {
    const inside = new Set(t.cells), ready = t.cells.filter((c) => p.unit[c] && !p.moved[c]), best = Math.max(0, ...ready.map((c) => p.unit[c]));
    const empty = t.cells.find((c) => !p.unit[c] && !p.hall[c] && !p.fort[c] && !p.farm[c] && !p.tree[c]), edge = new Set();
    for (const c of t.cells) for (const x of near[c]) if (!inside.has(x) && !p.water[x] && p.owner[x] !== me && (p.round > 1 || p.rule.opening !== "truce" || p.owner[x] === NONE)) edge.add(x);
    for (const c of edge) {
      const g = defence(p, c);
      let need = 1;
      while (need <= top && !beats(p, need, g)) need++;
      if (need > top || need === 1 || best >= need) continue; // out of reach, or a single move does it
      let way = null;
      const consider = (steps, at, raises) => {
        const list = [...steps, ...Array.from({ length: raises }, () => ({ do: "raise", hall: t.hall, to: at })), { do: "move", from: at, to: c }];
        if (list.filter((m) => m.do === "raise").length * price <= t.purse && (!way || list.length < way.length)) way = list;
      };
      for (const a of ready) {
        consider([], a, need - p.unit[a]);
        if (walk) for (const b of ready) if (b !== a && p.unit[a] + p.unit[b] <= top) consider([{ do: "move", from: a, to: b }], b, Math.max(0, need - p.unit[a] - p.unit[b]));
      }
      if (empty !== undefined) consider([{ do: "raise", hall: t.hall, to: empty }], empty, need - 1);
      if (way) out.push(way);
    }
  }
  return out;
}

/** Choose one action a little at a time. `dice` breaks ties and drives random. */
export function* thinking(p, dice, tier = "normal") {
  if (tier === "random") return dice.pick(fable.moves(p).filter((m) => m.do !== "concede"));
  const me = p.seat, noise = tier === "easy" ? 420 : 20, all = fable.moves(p), base = value(p, me) + 5;
  if (all.some((m) => m.do === "concede") && hopeless(p, me)) return { do: "concede" };
  let best = { do: "end" }, score = base, n = 0;
  for (const m of p.classic ? sensible(p, all) : all.filter((x) => x.to !== undefined)) { // a small island can be read in full
    const raw = value(act(p, m).position, me), v = free(p, m) ? (raw > base ? raw : -Infinity) : raw + dice.below(noise); // a free step must gain, or a bot could walk all day
    if (v > score) { score = v; best = m; }
    if (++n % 4 === 0) yield;
  }
  if (p.classic) {
    for (const list of plans(p)) { // the first step now; the rest come on the next looks
      const v = value(list.reduce((q, m) => act(q, m).position, p), me) + dice.below(noise);
      if (v > score) { score = v; best = list[0]; }
      if (++n % 4 === 0) yield;
    }
  }
  return best;
}

export function choose(p, dice, tier) {
  const t = thinking(p, dice, tier);
  for (;;) { const s = t.next(); if (s.done) return s.value; }
}
