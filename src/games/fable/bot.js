// SPDX-License-Identifier: AGPL-3.0-or-later
// Bots for The Island Fable. One action at a time: try each on a copy and keep the best, or stop.
import { NONE, WOOD, act, boardOf, cellsOf, defence, fable, goalOf, groupsOf, territories, topOf, upkeepOf } from "./rules.js";

export const TIERS = ["random", "easy", "normal"];

/** How good a position is for one seat, in whole numbers. */
export function value(p, seat) {
  const { near } = boardOf(p), mine = cellsOf(p, seat);
  let best = 0, v = 0;
  for (let s = 0; s < p.seats; s++) if (s !== seat) best = Math.max(best, cellsOf(p, s));
  if (mine >= goalOf(p)) v += 50000;
  v += 100 * (mine - best) + 50 * mine;
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

/** The moves worth a look: takes, clearing, joining, guarding a border, building beside one. */
function sensible(p) {
  const { near } = boardOf(p), me = p.seat, all = fable.moves(p), border = (c) => near[c].some((m) => p.owner[m] !== me && !p.water[m]), rich = new Map();
  for (const t of territories(p, me)) for (const c of t.cells) rich.set(c, t);
  const takes = all.filter((m) => m.do !== "end" && p.owner[m.to] !== me), strong = new Set(takes.filter((m) => m.do === "move").map((m) => m.from));
  return all.filter((m) => {
    if (m.do === "end") return false;
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

/** Choose one action a little at a time. `dice` breaks ties and drives random. */
export function* thinking(p, dice, tier = "normal") {
  if (tier === "random") return dice.pick(fable.moves(p));
  const me = p.seat, noise = tier === "easy" ? 420 : 20;
  let best = { do: "end" }, score = value(p, me) + 5, n = 0;
  for (const m of p.classic ? sensible(p) : fable.moves(p).filter((x) => x.do !== "end")) { // a small island can be read in full
    const v = value(act(p, m).position, me) + dice.below(noise);
    if (v > score) { score = v; best = m; }
    if (++n % 4 === 0) yield;
  }
  return best;
}

export function choose(p, dice, tier) {
  const t = thinking(p, dice, tier);
  for (;;) { const s = t.next(); if (s.done) return s.value; }
}
