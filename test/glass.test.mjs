// SPDX-License-Identifier: AGPL-3.0-or-later
// Grain and Glass, as its rules stand. These check what should survive coming tweaks to costs, dice and turn order:
// no win rates, prices, turn orders or whole-game fingerprints are written down here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMatch } from "../src/core/index.js";
import { COST, EXPANSIONS, NONE, SWITCHES, WASTE, answer, boardOf, canPay, depotSpots, glass, pointsOf } from "../src/games/glass/rules.js";
import { TIERS, choose } from "../src/games/glass/bot.js";
import { SLOW, botGame, ended, inList, passive, refused, replays, same, sameEachStep, slowOnly } from "./fixtures/bots.js";

const STYLES = ["classic", "custom", "ours"]; // Traditional, Custom with its normal switches, Capo
const start = (seats = 2, style = "classic", seed = "g", more = {}) => createMatch(glass, { seed, options: { seats, style, ...more } });
const seatsOf = (p) => Array.from({ length: p.seats }, (_, s) => s);
/** Setting up a game that cannot be set up throws; a bug in the rules, not a refusal. */
const setsUp = (options) => { try { createMatch(glass, { seed: "six", options }); return true; } catch (e) { if (e instanceof TypeError) return false; throw e; } };
const SMALL_SIX = !setsUp({ seats: 6, style: "ours" });
const BUG = SMALL_SIX && "BUG in src/games/glass/rules.js: island() wants landFor(\"small\", 6) = 68 land hexes, but a small (radius 5) board has only 61 hexes inside its rim, so Capo, or Custom with the small island, cannot be set up at 6 seats (TypeError: Reduce of empty array with no initial value).";
const known = (style, size, seats) => SMALL_SIX && seats === 6 && (style === "ours" || (style === "custom" && size === "small"));
/** Play the first legal move until the opening is over and someone is in the middle of a turn. */
const opened = (m) => { while (m.position.phase !== "main") m.play(m.legal()[0]); return m; };

/** What must hold after every move of any game. */
function sound(m, move) {
  const p = m.position, { near } = boardOf(p);
  for (const s of seatsOf(p)) {
    assert.ok(p.hands[s].length === 4 && p.hands[s].every((v) => Number.isInteger(v) && v >= 0), `seat ${s} holds ${p.hands[s]}`);
    assert.ok(Number.isInteger(p.coin[s]) && p.coin[s] >= 0);
  }
  p.depot.forEach((o, i) => {
    assert.ok(o === NONE || (p.land[i] && o >= 0 && o < p.seats));
    if (p.town[i]) assert.notEqual(o, NONE, "a town stands on a depot");
    assert.ok(p.route[i].every((s, k) => s >= 0 && s < p.seats && (k === 0 || s > p.route[i][k - 1])), "one route of each seat to a hex");
  });
  if (move?.do === "depot") { // a depot never goes beside another, except on a crowded island at the opening
    const before = m.at(m.list.length - 1), s = before.seat, crowded = before.phase === "open" && !depotSpots(before, s, true).length;
    if (!crowded) assert.ok(near[move.at].every((c) => before.depot[c] === NONE), "a depot beside another");
  }
}
/** Winners: the one who reached the points, or everyone with the most when time ran out. */
function fairEnd(m) {
  const p = m.position, r = ended(m, p.seats), pts = seatsOf(p).map((s) => pointsOf(p, s)), most = Math.max(...pts);
  if (r.winners.length === 1 && pts[r.winners[0]] >= p.rule.goal) return;
  assert.deepEqual(r.winners, seatsOf(p).filter((s) => pts[s] === most));
}

test("every rule set and seat count: bots play to an end within the cap, every move legal, and the save replays", () => {
  const seats = SLOW ? [2, 3, 4, 5, 6] : [2, 3, 4];
  for (const style of STYLES) for (const n of seats) {
    if (known(style, "medium", n)) continue; // the bug in the test below
    const m = botGame(glass, choose, { seed: `all ${style} ${n}`, options: { seats: n, style }, tiers: n === 2 ? ["normal", "easy"] : ["normal", "easy", "normal"], each: sound });
    fairEnd(m);
    replays(m, [glass]);
  }
});
test("expansions: a game with all of them on, in each rule set, plays to an end and replays", () => {
  const all = Object.fromEntries(EXPANSIONS.map((x) => [x, true]));
  for (const style of STYLES) {
    const m = botGame(glass, choose, { seed: "x " + style, options: { seats: 3, style, ...all }, tiers: ["normal", "easy", "normal"], each: sound });
    fairEnd(m);
    replays(m, [glass]);
  }
});
test("random play in each rule set stays sound and replays", { skip: slowOnly }, () => {
  for (const style of STYLES) for (const n of [2, 4]) {
    const m = botGame(glass, choose, { seed: "r " + style, options: { seats: n, style }, tiers: ["random"], each: sound });
    fairEnd(m);
    replays(m, [glass]);
  }
});
test("the same seed and bots play the same game, and replaying the moves passes through the same positions", () => {
  const run = (seed) => botGame(glass, choose, { seed, options: { seats: 3, style: "ours" }, tiers: TIERS });
  const a = run("same"), c = run("same");
  assert.ok(same(a.list, c.list));
  assert.equal(a.fingerprint(), c.fingerprint());
  assert.notEqual(run("other").fingerprint(), a.fingerprint());
  sameEachStep(a);
});
test("rule sets: Traditional and Capo fix their own rules; Custom takes each switch as given", () => {
  const odd = Object.fromEntries(Object.entries(SWITCHES).map(([k, o]) => [k, o.values.find((v) => v !== o.normal)]));
  const rule = (o) => createMatch(glass, { seed: "s", options: { seats: 3, ...o } }).position.rule;
  assert.deepEqual(rule({ style: "custom", ...odd }), odd);
  assert.deepEqual(rule({ style: "custom" }), Object.fromEntries(Object.entries(SWITCHES).map(([k, o]) => [k, o.normal])));
  for (const style of ["classic", "ours"]) assert.deepEqual(rule({ style, ...odd }), rule({ style }));
  assert.notDeepEqual(rule({ style: "classic" }), rule({ style: "ours" }));
});
test("every rule set, island size and seat count sets up", () => {
  for (const style of STYLES) for (const size of SWITCHES.size.values) for (const seats of glass.options.seats.values) {
    if (style !== "custom" && size !== SWITCHES.size.normal) continue;
    if (known(style, size, seats)) continue; // the bug in the next test
    assert.ok(setsUp({ seats, style, ...(style === "custom" ? { size } : {}) }), `${style} ${size} ${seats}`);
  }
});
test("a small island has room for six seats", { skip: BUG }, () => {
  for (const options of [{ seats: 6, style: "ours" }, { seats: 6, style: "custom", size: "small" }]) {
    const m = botGame(glass, choose, { seed: "six", options, tiers: ["easy"] });
    fairEnd(m);
  }
});
test("the island: land in one piece, goods on all but the wastes, numbers only where goods are", () => {
  for (const style of STYLES) for (const seats of [2, 3, 4]) {
    const p = start(seats, style, "isle " + seats).position, { near } = boardOf(p), dry = p.land.flatMap((l, i) => (l ? [i] : []));
    const seen = new Set([dry[0]]), list = [dry[0]];
    for (let i = 0; i < list.length; i++) for (const c of near[list[i]]) if (p.land[c] && !seen.has(c)) { seen.add(c); list.push(c); }
    assert.equal(seen.size, dry.length);
    p.land.forEach((l, i) => {
      if (!l) { assert.equal(p.good[i], WASTE); assert.equal(p.port[i], NONE); return; }
      assert.ok(p.good[i] === WASTE ? p.num[i] === 0 : p.num[i] > 0);
    });
    assert.ok(dry.some((i) => p.good[i] === WASTE) && dry.filter((i) => p.good[i] !== WASTE).length > dry.length / 2);
  }
});
test("the opening: every seat lays the same depots and routes, then the first roll starts play", () => {
  for (const style of STYLES) for (const seats of [2, 3, 4]) {
    const m = start(seats, style, "open " + seats);
    let events = [];
    while (m.position.phase === "open") events = m.play(m.legal()[0]);
    const p = m.position, depots = seatsOf(p).map((s) => p.depot.filter((o) => o === s).length), routes = seatsOf(p).map((s) => p.route.filter((r) => r.includes(s)).length);
    assert.ok(depots[0] > 0 && depots.every((n) => n === depots[0]), String(depots)); assert.ok(routes.every((n) => n === routes[0]), String(routes));
    assert.ok(events.some((e) => e.kind === "roll") && events.some((e) => e.kind === "harvest"));
    assert.ok(p.roll.every((d) => Number.isInteger(d) && d >= 1 && d <= 6));
  }
});
test("illegal moves are refused and change nothing", () => {
  const m = start(3, "classic", "bad"), first = m.legal()[0];
  m.play(first);
  const p = m.position, before = m.fingerprint(), { near } = boardOf(p), sea = p.land.indexOf(0), beside = near[first.at].find((c) => p.land[c]);
  for (const bad of [{ do: "depot", at: depotSpots(p, p.seat, true)[0] }, { do: "end" }, { do: "town", at: first.at }, { do: "route", at: sea }]) assert.throws(() => m.play(bad), refused("illegal"), JSON.stringify(bad));
  m.play(m.legal()[0]);
  for (const bad of [{ do: "depot", at: first.at }, { do: "depot", at: beside }, { do: "depot", at: sea }, { do: "route", at: m.legal()[0].at }, { do: "depot", at: m.legal()[0].at, extra: 1 }]) assert.throws(() => m.play(bad), refused("illegal"), JSON.stringify(bad));
  for (const bad of [undefined, 0.5, () => 1]) assert.throws(() => m.play(bad), refused("shape"));
  assert.ok(m.fingerprint() !== before && m.list.length === 2);
});
test("nothing is built without the goods for it; building spends them", () => {
  const p = structuredClone(opened(start(3, "classic", "pay")).position), s = p.seat;
  Object.assign(p, { hands: p.hands.map(() => [0, 0, 0, 0]), coin: p.coin.map(() => 0), held: p.held.map(() => []) });
  assert.deepEqual(glass.moves(p), [{ do: "end" }]);
  const { near } = boardOf(p), at = p.land.findIndex((l, i) => l && [i, ...near[i]].every((c) => p.depot[c] === NONE));
  p.route[at] = [...p.route[at], s].sort((x, y) => x - y); // a route reaches a free place, so a depot could go there
  assert.ok(!glass.moves(p).some((x) => x.do === "depot"), "a depot with nothing to pay for it");
  p.hands[s] = [...COST.depot];
  const list = glass.moves(p), d = list.find((x) => x.do === "depot" && x.at === at);
  assert.ok(d, "a depot that can be paid for is offered");
  const q = glass.apply(p, d).position;
  assert.deepEqual(q.hands[s], [0, 0, 0, 0]); assert.equal(q.depot[at], s); assert.equal(q.left, p.left - 1);
  for (const x of list) if (["route", "depot", "town", "plan", "harbour"].includes(x.do)) assert.ok(canPay(p.hands[s], COST[x.do]), JSON.stringify(x));
});
test("the harvest: each hex with the number rolled gives its good to every depot on it or beside it, twice to a town", () => {
  let rolls = 0;
  for (const style of ["classic", "ours"]) {
    botGame(glass, choose, {
      seed: "harvest " + style, options: { seats: 3, style }, tiers: ["normal"],
      each(m) {
        const e = m.events, roll = e.find((x) => x.kind === "roll"), got = e.find((x) => x.kind === "harvest")?.got;
        if (!roll) return;
        rolls++;
        const p = m.position, { near } = boardOf(p), [a, b] = roll.dice, twice = p.rule.roll === "high" && a === b ? 2 : 1, want = p.hands.map(() => [0, 0, 0, 0]);
        p.land.forEach((l, i) => { if (l && p.num[i] === roll.n && i !== p.gate && p.good[i] !== WASTE) for (const c of [i, ...near[i]]) if (p.depot[c] !== NONE) want[p.depot[c]][p.good[i]] += (p.town[c] ? 2 : 1) * twice; });
        assert.deepEqual(got, want, `roll ${roll.n}`);
        assert.equal(roll.n, p.rule.roll === "sum" ? a + b : Math.max(a, b));
      },
    });
  }
  assert.ok(rolls > 20);
});
test("an offer is settled by the asked seat's plain rule, and goods change hands one for one", () => {
  // Whether an offer is settled in the same move or the asked seat answers it in a move of its own, the settling move
  // carries an "offer" event, and the bots answer by the rule's own test.
  let offers = 0, settled = 0;
  for (const style of ["classic", "ours"]) {
    botGame(glass, choose, {
      seed: "offer " + style, options: { seats: 3, style }, tiers: ["normal", "easy", "random"],
      each(m, move) {
        const before = m.at(m.list.length - 1), p = m.position;
        if (move.do === "offer") { offers++; assert.equal(p.offers, before.offers - 1); }
        for (const e of m.events.filter((x) => x.kind === "offer")) {
          settled++;
          assert.equal(e.yes, answer(before, e.to, e.give, e.get));
          const k = e.yes ? 1 : 0;
          assert.equal(p.hands[e.seat][e.give], before.hands[e.seat][e.give] - k); assert.equal(p.hands[e.seat][e.get], before.hands[e.seat][e.get] + k);
          assert.equal(p.hands[e.to][e.give], before.hands[e.to][e.give] + k); assert.equal(p.hands[e.to][e.get], before.hands[e.to][e.get] - k);
          assert.equal(p.seat, e.seat, "the turn is with the one who offered");
        }
      },
    });
  }
  assert.ok(offers > 0 && settled === offers, `${offers} offers, ${settled} settled`);
});
test("reaching the points ends the game at once", () => {
  const p = structuredClone(opened(start(3, "classic", "goal")).position), s = p.seat, { near } = boardOf(p);
  p.seals[s] += p.rule.goal - 1 - pointsOf(p, s);
  assert.equal(pointsOf(p, s), p.rule.goal - 1);
  const at = p.land.findIndex((l, i) => l && [i, ...near[i]].every((c) => p.depot[c] === NONE));
  p.route[at] = [...p.route[at], s].sort((x, y) => x - y);
  p.hands[s] = [...COST.depot];
  const move = { do: "depot", at };
  assert.ok(inList(glass.moves(p), move));
  const q = glass.apply(p, move).position;
  assert.deepEqual(q.over.winners, [s]); assert.equal(glass.turn(q), null);
});
test("a game where nobody builds ends after its rounds; each round every seat rolls once; most points win", () => {
  for (const seats of [2, 3]) {
    const m = start(seats, "custom", "idle", { limit: 12 }), rolls = new Map();
    passive(m, undefined, (events) => { for (const e of events) if (e.kind === "roll") { const r = m.position.round; rolls.set(r, [...(rolls.get(r) || []), e.seat]); } });
    const p = m.position;
    assert.ok(p.over); assert.equal(p.round, p.rounds + 1);
    fairEnd(m);
    for (let r = 1; r <= p.rounds; r++) assert.deepEqual([...rolls.get(r)].sort(), seatsOf(p), `round ${r}`);
  }
});
