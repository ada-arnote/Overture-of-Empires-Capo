// SPDX-License-Identifier: AGPL-3.0-or-later
// Bots for the garden game: legal and sensible, not strong yet. Each move is tried on a copy and the bed is read in whole numbers.
// Easy reads one move with a lot of noise and never looks at the rival's reply. Normal also checks its best few moves for a
// ring the rival could close straight after. Hard reads the rival's best reply to its best few moves.
import { WIN, garden, meterOf, plantsOf, shiftsFrom, step } from "./rules.js";

export const TIERS = ["easy", "normal", "hard"];

/** Plants of a gardener that a rival plant could overgrow with its next shift. */
function exposed(p, seat) {
  if (p.rule.overgrow === "off") return 0;
  const hit = new Set();
  for (let c = 0; c < p.owner.length; c++) if (p.owner[c] === 1 - seat) for (const x of shiftsFrom(p, c)) if (p.owner[x] === seat) hit.add(x);
  return hit.size;
}

/** How good a position is for one gardener, in whole numbers. */
export function value(p, seat) {
  if (p.over) return p.over.winners.length > 1 ? 0 : p.over.winners[0] === seat ? WIN : -WIN;
  const them = 1 - seat, a = meterOf(p, seat), b = meterOf(p, them);
  let v = 0;
  v += 40 * a.parts * a.parts - 46 * b.parts * b.parts; // the ring is the goal: each part round the pond is worth more than the last
  v += 30 * a.links - 30 * b.links;
  v += 6 * plantsOf(p, seat) - 6 * plantsOf(p, them);
  v -= 14 * exposed(p, seat) - 10 * exposed(p, them);
  if (p.rule.score === "points") v += 40 * (p.took[seat] - p.took[them]);
  if (p.free && p.seat === seat) v += 20; // a free sow still to come
  return v;
}

/** The best the gardener to move can do from here, one move deep: their reading of it. */
function reply(p, seat) {
  let best = -Infinity;
  for (const m of garden.moves(p)) {
    const q = step(p, m).position;
    if (q.over && q.over.winners.length === 1 && q.over.winners[0] === seat) return WIN;
    best = Math.max(best, value(q, seat));
  }
  return best;
}

/** Choose a move a little at a time. `dice` breaks ties and adds the easy bot's noise. */
export function* thinking(p, dice, tier = "normal") {
  const all = garden.moves(p), me = p.seat, them = 1 - me;
  if (all.length === 1) return all[0];
  if (tier === "random") return dice.pick(all.filter((m) => m.do !== "skip" && m.do !== "pass")) || all[0];
  const noise = tier === "easy" ? 90 : tier === "hard" ? 3 : 12, list = [];
  let n = 0;
  for (const m of all) {
    const q = step(p, m).position;
    if (q.over && q.over.winners.length === 1 && q.over.winners[0] === me) return m; // a ring now
    list.push({ m, q, v: value(q, me) + dice.below(noise) });
    if (++n % 12 === 0) yield;
  }
  list.sort((x, y) => y.v - x.v);
  if (tier === "easy") return list[0].m;
  const look = tier === "hard" ? 10 : 6;
  let best = list[0], score = -Infinity;
  for (const c of list.slice(0, look)) {
    let v = c.v;
    if (c.q.seat === them && !c.q.over) {
      // the rival moves next: hard reads their best reply; normal only asks whether they could close a ring
      if (tier === "hard") v = -reply(c.q, them) + dice.below(noise);
      else if (garden.moves(c.q).some((r) => { const z = step(c.q, r).position; return z.over && z.over.winners.length === 1 && z.over.winners[0] === them; })) v -= WIN;
    }
    if (v > score) { score = v; best = c; }
    yield;
  }
  if (score <= -WIN / 2) {
    // every move it looked at lets the rival close a ring: look on down the list for one that does not
    for (const c of list.slice(look)) {
      if (!garden.moves(c.q).some((r) => { const z = step(c.q, r).position; return z.over && z.over.winners.length === 1 && z.over.winners[0] === them; })) return c.m;
      yield;
    }
  }
  return best.m;
}

export function choose(p, dice, tier) {
  const t = thinking(p, dice, tier);
  for (;;) { const s = t.next(); if (s.done) return s.value; }
}

