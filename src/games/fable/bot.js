// SPDX-License-Identifier: AGPL-3.0-or-later
// Bots for The Island Fable. One action at a time: try each on a copy and keep the best, or stop.
import { NONE, act, boardOf, cellsOf, defence, fable, goalOf, groupsOf, territories } from "./rules.js";

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
    const ranks = t.cells.reduce((n, c) => n + p.unit[c], 0);
    v += 2 * t.purse + 25 * ranks;
    if (t.net < 0 && t.purse + 2 * t.net < 0) v -= 200 + 100 * ranks; // it would starve within two turns
    for (const c of t.cells) if (near[c].some((m) => p.owner[m] !== NONE && p.owner[m] !== seat) && defence(p, c) < 1) v -= 30;
  }
  return v;
}

/** Choose one action a little at a time. `dice` breaks ties and drives random. */
export function* thinking(p, dice, tier = "normal") {
  const moves = fable.moves(p), me = p.seat, { near } = boardOf(p);
  if (tier === "random") return dice.pick(moves);
  const noise = tier === "easy" ? 420 : 20;
  let best = moves[0], score = value(p, me) + 5; // moves[0] is to end the turn
  for (const m of moves) {
    if (m.do === "end") continue;
    // standing a unit deep inside its own land never helps
    if (p.owner[m.to] === me && !p.unit[m.to] && near[m.to].every((c) => p.owner[c] === me || p.water[c])) continue;
    const v = value(act(p, m).position, me) + dice.below(noise);
    if (v > score) { score = v; best = m; }
    yield;
  }
  return best;
}

export function choose(p, dice, tier) {
  const t = thinking(p, dice, tier);
  for (;;) { const s = t.next(); if (s.done) return s.value; }
}
