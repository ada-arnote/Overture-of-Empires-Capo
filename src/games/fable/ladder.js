// SPDX-License-Identifier: AGPL-3.0-or-later
// The voyage: a ladder of islands for one player against bots, each harder than the last. Nothing here changes a rule.
// An island is harder by its rivals (more of them, and better ones), by its size and shape, and by the hand it deals:
// of six islands grown for a step, an early step takes the one kindest to the player, a late one a middling one, and never
// the two worst, so that no step starts lost.
import { createMatch } from "../../core/index.js";
import { fable, territories } from "./rules.js";

export const SEAS = ["The Sheltered Sound", "The Trade Winds", "The Grey Reaches", "The Storm Gates"];
const BOTS = { g: "gentle", e: "easy", n: "normal", h: "hard" }, PAR = { small: 10, medium: 14, large: 18, huge: 22 }, TRIES = "abcdef";
// name, shape, size, rivals (one letter each), expansions
const STEPS = [
  ["Lambing Holm", "round", "small", "g"], ["Two Wells", "lakes", "small", "e"], ["The Skerry", "round", "small", "ee"], ["Sickle Bay", "crescent", "medium", "e"], ["Crab Claw", "arms", "small", "en"], ["Wardens' Rock", "round", "medium", "nn"],
  ["Mirror Tarns", "lakes", "medium", "n"], ["The Stepping Stones", "chain", "medium", "nn", "boats"], ["Harvest Horn", "crescent", "medium", "nn", "farms"], ["Four Corners", "round", "medium", "nnn"], ["The Long Fingers", "arms", "large", "nn"], ["Eel Waters", "lakes", "large", "nnn"],
  ["The Duel Stone", "round", "medium", "h"], ["Widow's Hook", "crescent", "large", "hn"], ["The Broken Necklace", "chain", "large", "hnn", "boats"], ["Granary Reach", "arms", "large", "hnn", "farms"], ["Fivefold Fen", "lakes", "large", "hnnn"], ["The Great Round", "round", "huge", "hhn"],
  ["Knife Bay", "crescent", "medium", "hh"], ["The Kraken", "arms", "large", "hhh"], ["Gale Chain", "chain", "huge", "hhhn", "boats gales"], ["The Drowned Shire", "lakes", "huge", "hhhh", "farms"], ["Crown of Six", "round", "huge", "hhhhn"], ["World's End", "arms", "huge", "hhhhh", "boats farms gales"],
];
export const ISLANDS = STEPS.length;

/** How a start looks for one seat: its land and coin, and four more for each hex of its largest territory. */
function hand(p, seat) {
  const ts = territories(p, seat);
  return ts.reduce((n, t) => n + 2 * t.cells.length + t.purse, 0) + 4 * Math.max(0, ...ts.map((t) => t.cells.length));
}

/** A step of the voyage, counted from 1, without growing its island: its name, sea, rules, rivals and par. The player is the first seat. */
export function step(n) {
  const [name, isle, size, rivals, extra = ""] = STEPS[n - 1], seats = rivals.length + 1, more = extra.split(" ").filter(Boolean);
  return { n, name, sea: Math.floor((n - 1) / 6), isle, size, seats, extra: more, options: { style: "classic", isle, size, seats, ...Object.fromEntries(more.map((k) => [k, true])) }, kinds: ["you", ...[...rivals].map((k) => BOTS[k])], par: PAR[size] + 2 * (seats - 2) };
}

const grown = new Map();
/** A step with the seed that grows its island. Six are grown and one is kept, so this takes a moment; it is done once. */
export function island(n) {
  if (grown.has(n)) return grown.get(n);
  const v = step(n), { options, seats, sea } = v;
  // the player's start against the mean of the rivals', in whole numbers; the kindest first
  const dealt = [...TRIES].map((t) => {
    const seed = `voyage ${n} ${t}`, p = createMatch(fable, { seed, options }).position;
    let rest = 0;
    for (let s = 1; s < seats; s++) rest += hand(p, s);
    return { seed, edge: hand(p, 0) * (seats - 1) - rest };
  }).sort((a, b) => b.edge - a.edge || (a.seed < b.seed ? -1 : 1));
  grown.set(n, { ...v, seed: dealt[sea].seed });
  return grown.get(n);
}

/** Which step a game belongs to, from its seed; 0 for any other game. */
export const stepOf = (seed) => { const m = /^voyage (\d+) [a-f]$/.exec(String(seed)), n = m ? Number(m[1]) : 0; return n >= 1 && n <= ISLANDS ? n : 0; };
/** The steps open to a player who has won these: every one up to two past the furthest won, so one hard island never bars the way. */
export const open = (won) => Math.min(ISLANDS, Math.max(0, ...won) + 2);
