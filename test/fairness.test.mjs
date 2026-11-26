// SPDX-License-Identifier: AGPL-3.0-or-later
// A smoke test, not a judgement: many bot games of each game at two and three seats, every one of which must end
// without a crash. How often each seat wins is printed for a person to read (node --test shows it as a diagnostic);
// nothing is asserted about it, because the rules are still being tuned.
// Normally: Capo's rules, 40 games at each seat count, and 10 real-time Inch games (each can run to its time limit).
// CAPO_SLOW=1: every rule set, 40 real-time Inch games, and the strongest Inch bots in Capo's duel (in the larger Custom
// duel they take seconds a move, so it keeps the easy ones).
import { test } from "node:test";
import { banners } from "../src/games/banners/rules.js";
import { choose as bannersBot } from "../src/games/banners/bot.js";
import { fable } from "../src/games/fable/rules.js";
import { choose as fableBot } from "../src/games/fable/bot.js";
import { glass } from "../src/games/glass/rules.js";
import { choose as glassBot } from "../src/games/glass/bot.js";
import { inch } from "../src/games/inch/rules.js";
import { choose as inchBot } from "../src/games/inch/bot.js";
import { SLOW, botGame, direct, ended, refusedListed } from "./fixtures/bots.js";

const GAMES = 40, LIVE = SLOW ? 40 : 10, STYLES = SLOW ? ["classic", "custom", "ours"] : ["ours"];

/** Play the games, and print the share of wins for each seat (a tie counts for each winner). */
function series(t, name, play, styles = STYLES) {
  for (const style of styles) for (const seats of [2, 3]) {
    const wins = Array(seats).fill(0), why = {};
    for (let i = 0; i < GAMES; i++) {
      const r = play(style, seats, `fair ${style} ${seats} ${i}`);
      for (const w of r.winners) wins[w]++;
      why[r.why] = (why[r.why] || 0) + 1;
    }
    t.diagnostic(`${name} ${style} ${seats} seats: wins by seat ${wins.map((w) => Math.round((100 * w) / GAMES) + "%").join(" / ")}; ${JSON.stringify(why)}`);
  }
}
const byMatch = (game, choose, tier = "normal") => (style, seats, seed) => ended(botGame(game, choose, { seed, options: { seats, style }, tiers: [tier] }), seats);

test(`Brass and Banners: ${GAMES} bot games at 2 and 3 seats all end`, (t) => series(t, "banners", byMatch(banners, bannersBot)));
test(`The Island Fable: ${GAMES} bot games at 2 and 3 seats all end`, (t) => series(t, "fable", byMatch(fable, fableBot)));
test(`Grain and Glass: ${GAMES} bot games at 2 and 3 seats all end`, (t) => series(t, "glass", byMatch(glass, glassBot)));
test(`An Inch of Ink, real time: ${LIVE} bot games all end`, (t) => {
  const wins = new Map();
  for (let i = 0; i < LIVE; i++) {
    const r = ended(botGame(inch, inchBot, { seed: "fair live " + i, options: { style: "classic" } }), 50);
    wins.set(r.why, (wins.get(r.why) || 0) + 1);
  }
  t.diagnostic(`inch real time: ${JSON.stringify(Object.fromEntries(wins))}`);
});
// The turn duel is played under Custom on turns, with its normal switches (the duel Capo used to be); Capo is now real time
const DUELS = ["custom"], duelTier = () => (SLOW ? "normal" : "easy");
test(`An Inch of Ink, turn duel on the rules alone: ${GAMES} bot games at 2 and 3 seats all end`, (t) => {
  // Played without a match, because a match refuses the duel's pours (see the skipped tests in inch.test.mjs).
  series(t, "inch duel", (style, seats, seed) => {
    const r = direct(inch, inchBot, { seed, options: { seats, style }, tiers: [duelTier(style)] });
    if (!r.over) throw new Error(`no end after ${r.list.length} moves: ${seed}`);
    return r.over;
  }, DUELS);
});
test(`An Inch of Ink, turn duel through a match: ${GAMES} bot games at 2 and 3 seats all end`, { skip: refusedListed(inch, { style: "custom", seats: 2 }) && "BUG in src/games/inch/rules.js: inch.allows depends on key order, so a match refuses every pour of the turn duel (see inch.test.mjs)" }, (t) => {
  series(t, "inch duel", (style, seats, seed) => byMatch(inch, inchBot, duelTier(style))(style, seats, seed), DUELS);
});
