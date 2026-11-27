// SPDX-License-Identifier: AGPL-3.0-or-later
// Bots for the stacking game, in five steps, on the search in search.js. Each step is held to a count of positions it may
// look at, never to time, so a bot's move is the same on any device and in a worker or not:
//   1 easy: one move ahead, with noise. 2: two moves ahead. 3 normal: a search to 3,000 positions, strikes and threats first.
//   4 hard: 20,000 positions and a table of positions seen. 5 strongest: 80,000 positions.
// A move that opens the rival Lodestone is always looked at one step deeper, so a trap in two is not missed from step 3 up.
// Also here: free placement (by a plain plan), a hint that says why, and a review of a finished game.
import { createMatch } from "../../core/match.js";
import { KINDS, LODE, PLACE_LEAST, WARDEN, boardOf, hasMove, kindOf, legalOf, lodeOf, make, nameOf, sizeOf, stacking, stepsOf, threatened, topOf } from "./rules.js";
import { WIN, flat, legal, make as makeFlat, moveOf, thinking as searching } from "./search.js";

export const TIERS = ["easy", "normal", "hard", "master"];
/** What each step may look at. gentle is the lesson's bot: one move ahead, very loose. */
export const STEPS = {
  gentle: { depth: 1, noise: 240 }, easy: { depth: 1, noise: 30 }, two: { depth: 2, budget: 1e9 },
  normal: { budget: 8000 }, hard: { budget: 20000, table: true }, master: { budget: 80000, table: true, reduce: true },
};
export const STEP_OF = { gentle: 1, easy: 1, two: 2, normal: 3, hard: 4, master: 5 };

/** Free placement by a plain plan: the Lodestone at the back with the Warden beside it, Pebbles in front, the rest between. */
function placing(p, dice) {
  const s = p.seat, all = legalOf(p), size = sizeOf(p), keep = size === 3 ? 1 : 2, left = p.hand[s].reduce((a, b) => a + b, 0);
  if (p.placed[s] >= PLACE_LEAST && left <= keep) return all.find((m) => m.do === "stop");
  const lode = lodeOf(p, s), step = stepsOf(size), cells = boardOf(size).cells;
  let best = -Infinity, pick = all[0];
  for (const m of all) {
    if (m.do !== "place") continue;
    const [q, r] = cells[m.to], depth = size - Math.abs(r); // 0 on the back row
    const want = [0, 0, 1, 1, 2][m.kind], first = [50, 30, 8, 12, 16][m.kind];
    let v = first - 12 * Math.abs(depth - want) + dice.below(7);
    if (lode >= 0 && step[m.to].includes(lode)) v += m.kind === WARDEN ? 24 : 6;
    if (m.kind === LODE) v -= Math.abs(2 * q + r) * 2; // near the middle
    if (v > best) { best = v; pick = m; }
  }
  return pick;
}

/** The search's settings for a step, and its seed, drawn from the dice before anything else so both ways of thinking draw alike. */
export const askOf = (tier, dice) => ({ ...(STEPS[tier] || STEPS.normal), seed: dice.below(0x40000000) });

/** Thinks in parts, so a page can draw between them; returns the chosen move. */
export function* thinking(p, dice, tier = "normal") {
  if (p.phase === "place") return placing(p, dice);
  return yield* deciding(p, askOf(tier, dice));
}
/** The search's choice for settings already drawn: the same here and in a worker. */
export function* deciding(p, o) {
  const f = flat(p), r = yield* searching(f, o);
  return r.move < 0 ? legalOf(p)[0] : moveOf(f, r.move);
}
export function choose(p, dice, tier) {
  const t = thinking(p, dice, tier);
  for (;;) { const s = t.next(); if (s.done) return s.value; }
}

/** A move as the search writes it, found in the flat position's list. */
function codeOf(f, m) {
  const want = JSON.stringify(m);
  return legal(f).find((c) => JSON.stringify(moveOf(f, c)) === want) ?? -1;
}
/** Plies to a trap, from a search's score, or 0. */
const trapIn = (v) => (v >= WIN - 2000 ? WIN - v : 0);

/** Why a move is good, in one sentence, for a hint. */
export function why(p, m, score = 0) {
  const s = p.seat, q = make(p, m).position, kind = (st) => KINDS[kindOf(st)], at = (i) => nameOf(p, i), plies = trapIn(score);
  if (m.do !== "swap" && !hasMove(q)) return "It traps the rival Lodestone: they have no legal move left.";
  if (plies) return `It leads to a trap in ${(plies + 1) >> 1} of your turns, whatever they do.`;
  if (score <= -WIN + 2000) return "Every move loses against best play; this one holds out longest.";
  const parts = [];
  if (threatened(p, s)) parts.push("your Lodestone is open, and this makes it safe");
  if (m.do === "strike" || m.do === "sling") parts.push(`it takes their ${kind(topOf(p, m.to))} on ${at(m.to)}`);
  else if (m.do === "topple") parts.push(`it knocks their ${kind(topOf(p, m.to))} off ${at(m.to)}`);
  else if (m.do === "drop") parts.push(`it brings a ${KINDS[m.kind]} back from your pouch`);
  else if (m.do === "move" && p.cells[m.to].length) parts.push(`it climbs to tier ${p.cells[m.to].length + 1}, so its reach grows`);
  else if (m.do === "swap") parts.push("the side that moved first stands better");
  if (threatened(q, 1 - s)) parts.push("it puts the rival Lodestone in reach, so they must answer");
  if (!parts.length) return "Nothing to take this turn; this is the bot's best by its count of the board.";
  const text = parts.join(", and ");
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

/** A hint for the seat to move: the normal bot's choice and why, or null in free placement. */
export function* hinting(p, seed = 1) {
  if (p.phase === "place") return null;
  const f = flat(p), r = yield* searching(f, { ...STEPS.normal, seed });
  if (r.move < 0) return null;
  const m = moveOf(f, r.move);
  return { move: m, why: why(p, m, r.score) };
}

/**
 * A review of a finished game: { seed, options, moves } and the seats played by people. Each of their moves is weighed by
 * a short search; returns the three largest swings and every missed trap: [{ n (the move's number, from 1), seat, played,
 * best, lost (points), trap (turns to a trap that was missed, or 0) }].
 */
export function* reviewing(game, people = [0, 1], budget = 1500) {
  const m = createMatch(stacking, { seed: game.seed, options: game.options }), out = [];
  for (let n = 0; n < game.moves.length; n++) {
    const p = m.position, mv = game.moves[n];
    if (p.phase !== "place" && people.includes(p.seat) && mv.do !== "swap") {
      const f = flat(p), r = yield* searching(f, { budget, table: true, seed: 7 }), played = codeOf(f, mv);
      let got = r.score;
      if (played >= 0 && played !== r.move) {
        makeFlat(f, played);
        const after = yield* searching(f, { budget, table: true, seed: 7 });
        got = after.move < 0 ? (after.score <= -WIN ? WIN : 0) : -after.score;
      }
      const lost = Math.max(0, r.score - got), trap = trapIn(r.score) && !trapIn(got) ? (trapIn(r.score) + 1) >> 1 : 0;
      if (lost > 0 || trap) out.push({ n: n + 1, seat: p.seat, played: mv, best: moveOf(flat(p), r.move), lost: Math.min(lost, 9999), trap });
    }
    m.play(mv);
    yield;
  }
  const traps = out.filter((x) => x.trap), swings = out.filter((x) => !x.trap && x.lost >= 30).sort((a, b) => b.lost - a.lost || a.n - b.n).slice(0, 3);
  return [...traps, ...swings].sort((a, b) => a.n - b.n);
}
export const drain = (t) => { for (;;) { const s = t.next(); if (s.done) return s.value; } };
