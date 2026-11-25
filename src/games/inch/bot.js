// SPDX-License-Identifier: AGPL-3.0-or-later
// Bots for An Inch of Ink. They see only what a player sees and choose from the legal moves.
import { NONE, cellsOf, inch } from "./rules.js";

export const TIERS = ["random", "easy", "normal"];
const FUTURES = 24, DEPTH = 6; // how many possible futures normal looks at, and how many moves deep

/** How good a position is for one seat, in whole numbers. */
export function value(p, seat) {
  if (p.over) return p.over.winners.includes(seat) ? (p.over.winners.length === 1 ? 20000 : 8000) : -20000;
  if (p.home[seat] === NONE) return -18000;
  let rivals = 0;
  for (let s = 0; s < p.pool.length; s++) if (s !== seat && p.home[s] !== NONE) rivals += cellsOf(p, s);
  return 160 * cellsOf(p, seat) - 60 * rivals + 12 * p.pool[seat];
}

const after = (p, m) => inch.apply(p, m).position;

/** The position after the move that looks best straight away, for whoever is to move. */
function quick(p) {
  let best = null, score = -Infinity;
  for (const m of inch.moves(p)) {
    const q = after(p, m), v = value(q, p.seat);
    if (v > score) { score = v; best = q; }
  }
  return best;
}

/** Choose a move a little at a time, so a page can draw between steps. `dice` breaks ties, drives random and draws the futures. */
export function* thinking(p, dice, tier = "normal") {
  const moves = inch.moves(p), me = p.seat;
  if (tier === "random" || moves.length === 1) return dice.pick(moves);
  let best = moves[0], score = -Infinity;
  for (const m of moves) {
    const q = after(p, m);
    let v = value(q, me);
    if (tier === "normal" && !q.over) {
      // People are neither perfect nor careless: half the moves in each future are sensible, half are any move.
      let sum = 0;
      for (let k = 0; k < FUTURES; k++) {
        let r = q;
        for (let d = 0; d < DEPTH && !r.over; d++) r = dice.below(2) ? quick(r) : after(r, dice.pick(inch.moves(r)));
        sum += value(r, me);
        yield;
      }
      v = Math.trunc(sum / FUTURES);
    }
    v = v * 100 + dice.below(60);
    if (v > score) { score = v; best = m; }
  }
  return best;
}

/** Choose a move all at once. */
export function choose(p, dice, tier) {
  const t = thinking(p, dice, tier);
  for (;;) { const s = t.next(); if (s.done) return s.value; }
}
