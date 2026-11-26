// SPDX-License-Identifier: AGPL-3.0-or-later
// Bots against bots, for the game tests. Every move goes through a match, so a move the rules refuse fails the test.
import assert from "node:assert/strict";
import { Refusal, canon, chance, createMatch, fingerprint, openSave, seedState } from "../../src/core/index.js";

/** No game here comes near this many moves; one that does is stuck. */
export const CAP = 6000;
/** CAPO_SLOW=1 runs the long versions: more games, more seats, the strongest bots. */
export const SLOW = process.env.CAPO_SLOW === "1";
export const slowOnly = SLOW ? false : "slow: set CAPO_SLOW=1 to run it";
export const refused = (code) => (e) => e instanceof Refusal && e.code === code;
export const same = (a, b) => canon(a) === canon(b);
export const inList = (list, m) => list.some((x) => same(x, m));

/**
 * Play bots to the end, or to the cap. tiers: one per seat, used in turn. each(match, move) runs after every move.
 * For a game with a quick `allows` check, each bot move is also looked for in the full list of legal moves.
 */
export function botGame(game, choose, { seed = "t", options = {}, tiers = ["normal"], cap = CAP, each } = {}) {
  const m = createMatch(game, { seed, options }), dice = chance(seedState("bots/" + seed));
  while (m.turn !== null && m.list.length < cap) {
    const move = choose(m.position, dice, tiers[m.turn % tiers.length]);
    if (game.allows) assert.ok(m.isLegal(move), `a bot chose a move that is not in the list: ${canon(move)}`);
    m.play(move);
    each?.(m, move);
  }
  return m;
}

/**
 * Bots against bots on the rules alone, without a match: the first position comes from a match, then each move is
 * checked against the full list of legal moves and applied with seeded dice. For a game whose match refuses moves it lists.
 */
export function direct(game, choose, { seed = "t", options = {}, tiers = ["normal"], cap = CAP, each } = {}) {
  let p = createMatch(game, { seed, options }).position;
  const rules = chance(seedState(`direct/${game.id}/${seed}`)), bots = chance(seedState("bots/" + seed)), list = [];
  while (game.turn(p) !== null && list.length < cap) {
    const move = choose(p, bots, tiers[game.turn(p) % tiers.length]), before = p;
    assert.ok(inList(game.moves(p), move), `a bot chose a move that is not in the list: ${canon(move)}`);
    const made = game.apply(p, JSON.parse(canon(move)), rules);
    canon(made.position);
    p = made.position;
    list.push(move);
    each?.(p, made.events, move, before);
  }
  return { position: p, list, over: p.over, fingerprint: fingerprint(p) };
}

/** A move the game lists at its start but its quick check refuses, once the match has written it the one exact way; or null. */
export function refusedListed(game, options, seed = "probe") {
  if (!game.allows) return false;
  const m = createMatch(game, { seed, options });
  return m.legal().find((x) => !game.allows(m.position, JSON.parse(canon(x)))) ?? false; // false, not null: a null skip still skips
}

/** The game ended, within the cap, with winners who are real seats. */
export function ended(m, seats = m.options.seats) {
  assert.equal(m.turn, null, `no end after ${m.list.length} moves (seed ${m.seed}, ${canon(m.options)})`);
  const r = m.result;
  assert.ok(r && Array.isArray(r.winners) && r.winners.length >= 1 && typeof r.why === "string" && r.why);
  for (const w of r.winners) assert.ok(Number.isInteger(w) && w >= 0 && w < seats, `winner ${w}`);
  assert.equal(new Set(r.winners).size, r.winners.length);
  assert.deepEqual(m.legal(), []);
  return r;
}

/** The save opens by replaying every move from the seed, and arrives at the same fingerprint and the same file. */
export function replays(m, games) {
  const { match, warning } = openSave(m.save(), games);
  assert.equal(warning, "");
  assert.equal(match.fingerprint(), m.fingerprint());
  assert.equal(match.save(), m.save());
  return match;
}

/** The move list, played again on a fresh match from the same seed, lands on the same fingerprint at every step. */
export function sameEachStep(m) {
  const again = createMatch(m.game, { options: m.options, seed: m.seed }), list = m.list;
  for (let i = 0; i < list.length; i++) {
    again.play(list[i]);
    assert.equal(fingerprint(again.position), fingerprint(m.at(i + 1)), `move ${i + 1}`);
  }
  assert.equal(again.fingerprint(), m.fingerprint());
}

/** A plain player, for games that should end with nobody pressing: pick(list, position) chooses from the legal moves. each(events) sees what each move did. */
export function passive(m, pick = (list) => list[0], each) {
  while (m.turn !== null && m.list.length < CAP) {
    const events = m.play(pick(m.legal(), m.position));
    each?.(events);
  }
  return m;
}
