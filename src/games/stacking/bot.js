// SPDX-License-Identifier: AGPL-3.0-or-later
// Bots for the stacking game: a short look ahead and a plain count of what each side holds.
// The easy bot looks one move ahead and chooses with some noise; the normal bot looks at every reply.
// Whole numbers only; ties and noise come from the seeded dice, so a game with bots still replays.
import { LODE, PEBBLE, hasMove, kindOf, legalOf, lodeOf, make, ownerOf, rowOf, sideOf, stepsOf, threatened } from "./rules.js";

export const TIERS = ["easy", "normal"];
/** What a stone is worth on the board, by kind; a pouch stone is worth a little less, until it is dropped. */
export const WORTH = [0, 30, 42, 40, 12];
const WIN = 100000, SWAP = 10;

/** How a position stands for a seat: stones held, height, the Lodestone's room and safety, Pebbles that have come forward. */
export function evaluate(p, seat) {
  let n = 0;
  const step = stepsOf();
  p.cells.forEach((c, i) => {
    c.forEach((st, k) => {
      const kind = kindOf(st), sign = ownerOf(st) === seat ? 1 : -1, top = k === c.length - 1;
      let v = WORTH[kind] - (top ? 0 : 6); // a buried stone cannot act
      if (top && kind !== LODE) v += 4 * k; // height is reach
      if (kind === PEBBLE) v += forward(p, ownerOf(st), i);
      n += sign * v;
    });
  });
  for (let s = 0; s < 2; s++) {
    const sign = s === seat ? 1 : -1, at = lodeOf(p, s);
    n += sign * p.pouch[s].reduce((a, v, k) => a + v * ((WORTH[k] * 4) / 5 | 0), 0);
    if (at < 0) continue;
    // a Lodestone with room round it, and with friends beside it, is hard to trap
    for (const m of step[at]) if (m >= 0) n += sign * (p.cells[m].length === 0 ? 3 : ownerOf(p.cells[m][p.cells[m].length - 1]) === s ? 2 : -2);
    if (threatened(p, s)) n -= sign * 25;
  }
  return n;
}
/** How far a Pebble has come: one for each row past its home's front row. */
function forward(p, s, i) {
  const r = rowOf(i);
  return Math.max(0, sideOf(p, s) === "south" ? 2 - r : r + 2);
}

/** Thinks move by move, so a page can draw between them; returns the chosen move. */
export function* thinking(p, dice, tier = "normal") {
  const seat = p.seat, moves = legalOf(p);
  if (moves.length <= 1) return moves[0];
  let best = -Infinity, picks = [];
  for (const m of moves) {
    const q = make(p, m).position, replies = tier === "easy" ? null : legalOf(q);
    let score;
    if (replies ? !replies.length : !hasMove(q)) score = WIN; // the rival cannot move: a win
    else if (tier === "easy") score = evaluate(q, seat) + dice.below(24);
    else {
      score = Infinity;
      for (const r of replies) {
        const after = make(q, r).position;
        const v = threatened(after, seat) && !hasMove(after, seat) ? -WIN : evaluate(after, seat); // a reply that traps us loses
        if (v < score) score = v;
        if (score < best) break; // this move is already no better than the best
      }
    }
    if (m.do === "swap" && score < WIN) score -= SWAP; // swap only for a clear edge
    if (score > best) { best = score; picks = [m]; } else if (score === best) picks.push(m);
    yield;
  }
  return picks[dice.below(picks.length)];
}
export function choose(p, dice, tier) {
  const t = thinking(p, dice, tier);
  for (;;) { const s = t.next(); if (s.done) return s.value; }
}
