// SPDX-License-Identifier: AGPL-3.0-or-later
// The first bot for Hedge and Highway: it lays each tile where it scores most now, counts what its stewards stand to
// gain, sends a steward where the feature is worth the piece, and weighs what a rival gains against it. The easy bot
// adds a little chance and looks only at itself. Whole numbers, so every device plays the same bot move.
import { KINDS } from "./tiles.js";
import { NONE, regions, tile, worth } from "./rules.js";

export const TIERS = ["random", "easy", "normal"];

/** What each seat's stewards stand to gain from the features they lead, at one a tile, in tenths. */
function hopes(p) {
  const R = regions(p), out = Array(p.seats).fill(0), late = p.bag.length < 3 * p.seats;
  for (const [root, counts] of R.men) {
    const i = R.info.get(root), top = Math.max(...counts), w = i.kind === "meadow" ? worth(R, i) * 10 : (late ? worth(R, i, p.rule.rest) : worth(R, i, "done")) * (i.open <= 1 ? 8 : i.open <= 3 ? 6 : 4);
    counts.forEach((n, s) => { if (n === top) out[s] += w; });
  }
  return out;
}

/** How much a seat likes a move's outcome: its own gain against the best rival's, in tenths of a point. */
function value(p, now, after, s, tier) {
  const then = hopes(after), gain = (o) => (after.score[o] - p.score[o]) * 10 + ((then[o] - now[o]) * 5) / 10;
  let rival = 0;
  for (let o = 0; o < p.seats; o++) if (o !== s) rival = Math.max(rival, gain(o));
  return Math.round(gain(s) * 10 - (tier === "easy" ? 0 : rival * 6));
}

export function* thinking(p, dice, tier = "normal") {
  const all = tile.moves(p), s = p.seat;
  if (tier === "random") return dice.pick(all);
  const now = hopes(p);
  let best = null, top = -Infinity, n = 0;
  for (const m of all) {
    const after = tile.apply(p, m).position;
    let v = value(p, now, after, s, tier);
    // a steward is a piece that may not come back: worth sending only for a feature that pays for it
    if (m.put !== NONE) {
      const F = KINDS[p.row[m.pick]].feats[m.put], back = after.home[s] > p.home[s] - 1;
      if (!back) v -= (F.kind === "meadow" ? 120 : 60) + (p.home[s] <= 2 ? 150 : 0) + (F.kind === "meadow" && p.bag.length > p.total / 2 ? 100 : 0);
    }
    if (tier === "easy") v += dice.below(60);
    if (v > top) { top = v; best = m; }
    if (++n % 24 === 0) yield;
  }
  return best;
}
export function choose(p, dice, tier) {
  const t = thinking(p, dice, tier);
  for (;;) { const s = t.next(); if (s.done) return s.value; }
}
