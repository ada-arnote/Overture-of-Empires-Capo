// SPDX-License-Identifier: AGPL-3.0-or-later
// Brass and Banners, as its rules stand. These check what should survive coming tweaks to dice and turn order:
// no win rates, dice counts, turn orders or whole-game fingerprints are written down here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chance, createMatch, seedState } from "../src/core/index.js";
import { EXPANSIONS, HAND, NONE, SWITCHES, amounts, banners, boardOf, cellsOf, goalOf, muster, nearOf, odds, setWorth, setsOf } from "../src/games/banners/rules.js";
import { DICE, odds as diceOdds } from "../src/games/banners/dice.js";
import { TIERS, choose } from "../src/games/banners/bot.js";
import { SLOW, botGame, ended, inList, passive, refused, replays, same, sameEachStep, slowOnly } from "./fixtures/bots.js";

const STYLES = ["classic", "custom", "ours"]; // Traditional, Custom with its normal switches, Capo
const start = (seats = 2, style = "ours", seed = "b") => createMatch(banners, { seed, options: { seats, style } });
/** A bare board in the attack phase: hand out places as [province, seat, strength]. Everything else is neutral, strength 1. */
function made(list, { seats = 2, style = "ours", ...over } = {}) {
  const p = structuredClone(start(seats, style).position);
  Object.assign(p, { owner: p.owner.map(() => NONE), str: p.str.map(() => 1), seat: 0, step: 0, round: 1, phase: "attack", left: 0, took: 0, pend: null, over: null, hands: p.hands.map(() => []), outBy: Array(seats).fill(NONE) });
  for (const [i, s, n] of list) { p.owner[i] = s; p.str[i] = n; }
  return Object.assign(p, over);
}
const b = boardOf(start().position), A = 0, B = b.near[A][0];
const apart = (...xs) => b.near.findIndex((n, i) => !xs.includes(i) && xs.every((x) => !n.includes(x)));
const far = apart(A, B), far2 = apart(A, B, far);
/** Fight until the attack is settled; strength 40 against 1 takes the place every time it is tried here. */
const win = (p, from, to, seed = "w") => banners.apply(p, { do: "attack", from, to, roll: "all" }, chance(seedState(seed)));

/** What must hold after every move of any game. */
function sound(m) {
  const p = m.position;
  p.owner.forEach((o, i) => {
    assert.ok(o === NONE || (Number.isInteger(o) && o >= 0 && o < p.seats));
    assert.ok(Number.isInteger(p.str[i]) && p.str[i] >= (o === NONE ? 0 : 1), `province ${i}: strength ${p.str[i]}`);
  });
  if (p.over) return;
  assert.ok(p.owner.includes(p.seat) || p.phase === "claim", "the seat to move still holds land");
  assert.ok(["claim", "setup", "place", "attack", "occupy"].includes(p.phase));
  assert.ok(Number.isInteger(p.left) && p.left >= 0);
  if (p.phase === "occupy") assert.ok(p.owner[p.pend.from] === p.seat && p.owner[p.pend.to] === p.seat);
}

test("every rule set and seat count: bots play to an end within the cap, every move legal, and the save replays", () => {
  const seats = SLOW ? [2, 3, 4, 5, 6] : [2, 3, 4];
  for (const style of STYLES) for (const n of seats) {
    const m = botGame(banners, choose, { seed: `all ${style} ${n}`, options: { seats: n, style }, tiers: n === 2 ? ["normal", "easy"] : ["normal", "easy", "normal"], each: sound });
    const r = ended(m, n);
    for (const w of r.winners) assert.ok(cellsOf(m.position, w) > 0, "a winner holds land");
    replays(m, [banners]);
  }
});
test("expansions: a game with all of them on, in each rule set, plays to an end and replays", () => {
  const all = Object.fromEntries(EXPANSIONS.map((x) => [x, true]));
  for (const style of STYLES) {
    const m = botGame(banners, choose, { seed: "x " + style, options: { seats: 3, style, ...all }, tiers: ["normal", "easy", "normal"], each: sound });
    ended(m, 3);
    replays(m, [banners]);
  }
});
test("random play in each rule set stays sound and replays", { skip: slowOnly }, () => {
  for (const style of STYLES) for (const n of [2, 4]) {
    const m = botGame(banners, choose, { seed: "r " + style, options: { seats: n, style }, tiers: ["random"], each: sound });
    ended(m, n);
    replays(m, [banners]);
  }
});
test("the same seed and bots play the same game, and replaying the moves passes through the same positions", () => {
  const run = (seed) => botGame(banners, choose, { seed, options: { seats: 3, style: "ours" }, tiers: TIERS });
  const a = run("same"), c = run("same");
  assert.ok(same(a.list, c.list));
  assert.equal(a.fingerprint(), c.fingerprint());
  assert.notEqual(run("other").fingerprint(), a.fingerprint());
  sameEachStep(a);
});
test("rule sets: Traditional and Capo fix their own rules; Custom takes each switch as given", () => {
  const odd = Object.fromEntries(Object.entries(SWITCHES).map(([k, o]) => [k, o.values.find((v) => v !== o.normal)]));
  const rule = (o) => createMatch(banners, { seed: "s", options: o }).position.rule;
  assert.deepEqual(rule({ style: "custom", ...odd }), odd);
  assert.deepEqual(rule({ style: "custom" }), Object.fromEntries(Object.entries(SWITCHES).map(([k, o]) => [k, o.normal])));
  for (const style of ["classic", "ours"]) assert.deepEqual(rule({ style, ...odd }), rule({ style }));
  assert.notDeepEqual(rule({ style: "classic" }), rule({ style: "ours" }));
});
test("illegal moves are refused and change nothing", () => {
  const m = start(2, "ours"), p = m.position, before = m.fingerprint(), mine = p.owner.indexOf(p.seat), theirs = p.owner.findIndex((o) => o !== NONE && o !== p.seat);
  assert.equal(p.phase, "place");
  for (const bad of [{ do: "attack", from: mine, to: b.near[mine][0], roll: "all" }, { do: "end" }, { do: "place", at: theirs, n: 1 }, { do: "place", at: NONE, n: 1 }, { do: "place", at: mine, n: p.left + 1 }, { do: "place", at: mine, n: 0 }, { do: "place", at: mine, n: 1, extra: 1 }, { do: "occupy", n: 1 }, { do: "claim", at: mine }, { do: "fly" }]) {
    assert.throws(() => m.play(bad), refused("illegal"), JSON.stringify(bad));
  }
  for (const bad of [undefined, 0.5, () => 1]) assert.throws(() => m.play(bad), refused("shape"));
  assert.equal(m.fingerprint(), before);
  assert.equal(m.list.length, 0);
});
test("an attack needs two strength, goes to a neighbour, and never at your own province", () => {
  let looked = 0, tried = 0;
  botGame(banners, choose, {
    seed: "own", options: { seats: 3, style: "classic" }, tiers: ["normal", "easy", "normal"], cap: 1500,
    each(m) {
      const p = m.position;
      if (p.phase !== "attack" || looked > 30) return;
      looked++;
      const list = m.legal();
      for (const a of list.filter((x) => x.do === "attack")) {
        assert.equal(p.owner[a.from], p.seat); assert.ok(p.str[a.from] >= 2); assert.ok(nearOf(p, a.from).includes(a.to)); assert.notEqual(p.owner[a.to], p.seat);
      }
      const own = p.owner.flatMap((o, from) => (o === p.seat && p.str[from] >= 2 ? nearOf(p, from).filter((to) => p.owner[to] === p.seat).map((to) => ({ do: "attack", from, to, roll: "all" })) : []));
      for (const x of own) assert.ok(!inList(list, x), "an attack at your own province is offered");
      if (own.length && tried < 3) { tried++; const f = m.fingerprint(); assert.throws(() => m.play(own[0]), refused("illegal")); assert.equal(m.fingerprint(), f); }
    },
  });
  assert.ok(looked > 5 && tried > 0, `looked at ${looked}, tried ${tried}`);
});
test("placing: what is mustered is offered only on your own land, and placing all of it starts the attack", () => {
  const m = start(3, "ours"), p = m.position;
  assert.equal(p.left, muster(p, p.seat).all);
  for (const x of m.legal().filter((x) => x.do === "place")) { assert.equal(p.owner[x.at], p.seat); assert.ok(x.n >= 1 && x.n <= p.left); }
  const at = p.owner.indexOf(p.seat);
  m.play({ do: "place", at, n: p.left });
  assert.equal(m.position.phase, "attack"); assert.equal(m.position.left, 0); assert.equal(m.position.str[at], p.str[at] + p.left);
});
test("a won fight moves one in, offers the rest from none to all but one, and moving it keeps every unit", () => {
  const p = made([[A, 0, 40], [B, 1, 1], [far, 1, 3]]), { position: q, events } = win(p, A, B);
  assert.ok(events.find((e) => e.kind === "fight").won);
  assert.equal(q.owner[B], 0); assert.equal(q.str[B], 1); assert.equal(q.phase, "occupy");
  const lost = events.find((e) => e.kind === "fight").lost.attacker;
  assert.equal(q.str[A] + q.str[B], 40 - lost);
  const n = banners.moves(q).map((x) => x.n);
  assert.equal(n[0], 0); assert.equal(n.at(-1), q.str[A] - 1);
  const r = banners.apply(q, { do: "occupy", n: n.at(-1) }).position;
  assert.equal(r.str[A], 1); assert.equal(r.str[B], q.str[A]); assert.equal(r.phase, "attack"); assert.equal(r.pend, null);
});
test("putting a seat out hands its cards to the one who did it, and the turn passes it by", () => {
  const p = made([[A, 0, 40], [B, 1, 1], [far, 2, 3], [far2, 2, 3]], { seats: 3, hands: [[], [5, 6], []] });
  const q = win(p, A, B).position;
  assert.equal(q.outBy[1], 0); assert.deepEqual(q.hands[1], []); assert.ok([5, 6].every((c) => q.hands[0].includes(c))); assert.equal(q.over, null);
  let r = banners.apply(q, { do: "occupy", n: 0 }).position;
  const d = chance(seedState("pass"));
  for (let i = 0; i < 12 && !r.over; i++) {
    r = banners.apply(r, r.phase === "attack" ? { do: "end" } : banners.moves(r).at(-1), d).position;
    assert.notEqual(r.seat, 1, "a seat with no land is passed over");
  }
});
test("the last one left wins, and so does holding enough of the land", () => {
  const two = made([[A, 0, 40], [B, 1, 1]]), q = win(two, A, B).position;
  assert.deepEqual(q.over.winners, [0]); assert.equal(banners.turn(q), null);
  const p = made([[A, 0, 40], [B, NONE, 1], [far, 1, 3]]), need = goalOf(p) - 1;
  let given = 1;
  for (let i = 0; i < p.owner.length && given < need; i++) if (p.owner[i] === NONE && i !== B) { p.owner[i] = 0; given++; }
  assert.equal(cellsOf(p, 0), need); assert.equal(p.owner[far], 1);
  assert.equal(win(p, A, B).position.over?.winners?.[0], 0);
});
test("cards: a full hand with a set must trade; trading adds to what is placed and spends the cards", () => {
  const m = start(2, "classic"), p = structuredClone(m.position);
  Object.assign(p, { phase: "place", hands: p.hands.map((h, s) => (s === p.seat ? [0, 3, 6, 1, 4] : [])) });
  assert.equal(p.hands[p.seat].length, HAND);
  const list = banners.moves(p);
  assert.ok(list.length && list.every((x) => x.do === "trade"));
  for (const x of list) assert.ok(inList(setsOf(p, p.seat).map((cards) => ({ do: "trade", cards })), x));
  const cards = list[0].cards, q = banners.apply(p, list[0]).position;
  assert.equal(q.left, p.left + setWorth(p, p.seat, cards)); assert.ok(cards.every((c) => !q.hands[p.seat].includes(c) && q.spent.includes(c)));
  assert.ok(setWorth(p, p.seat, cards) > 0);
});
test("a game nobody attacks in ends after its rounds; each round every seat moves once; most land wins", () => {
  /** Everything placed at once on the first place offered; no fights, no marches. */
  const quiet = (list) => list.filter((x) => x.do !== "place" || x.at === list[0].at).reduce((a, x) => (x.do === "place" && a.do === "place" && x.n > a.n ? x : a));
  for (const start of SWITCHES.start.values) {
    const m = createMatch(banners, { seed: "quiet " + start, options: { seats: 3, style: "custom", start, rounds: 12 } }), turns = new Map();
    passive(m, quiet, (events) => { for (const e of events) if (e.kind === "muster") { const r = m.position.round; turns.set(r, [...(turns.get(r) || []), e.seat]); } });
    const p = m.position, most = Math.max(...[0, 1, 2].map((s) => cellsOf(p, s)));
    assert.ok(p.over, start); assert.equal(p.round, p.rounds + 1);
    assert.deepEqual(m.result.winners, [0, 1, 2].filter((s) => cellsOf(p, s) === most));
    for (let r = 2; r <= p.rounds; r++) assert.deepEqual([...turns.get(r)].sort(), [0, 1, 2], `round ${r}`);
  }
});
test("the odds shown are the odds thrown, for every dice rule", () => {
  for (const dice of SWITCHES.dice.values) {
    const how = DICE[dice];
    assert.equal(diceOdds(0, 3, how), 0); assert.equal(diceOdds(3, 0, how), 1000000);
    for (let d = 1; d < 7; d++) for (let a = 1; a < 10; a++) { assert.ok(diceOdds(a + 1, d, how) >= diceOdds(a, d, how)); assert.ok(diceOdds(a, d + 1, how) <= diceOdds(a, d, how)); }
    const d = chance(seedState("odds " + dice));
    for (const [att, def] of [[3, 3], [6, 4]]) {
      const p = made([[A, 0, att + 1], [B, 1, def], [far, 1, 1]]);
      p.rule = { ...p.rule, dice };
      let won = 0;
      for (let i = 0; i < 2000; i++) if (banners.apply(p, { do: "attack", from: A, to: B, roll: "all" }, d).events.find((e) => e.kind === "fight").won) won++;
      assert.ok(Math.abs(won / 2000 - odds(p, A, B) / 1000000) < 0.04, `${dice}, ${att} v ${def}: ${won / 2000} thrown, ${odds(p, A, B)} shown`);
    }
  }
});
test("amounts: every one when few, sensible steps when many, always one and the whole", () => {
  for (let n = 1; n <= 12; n++) assert.deepEqual(amounts(n), Array.from({ length: n }, (_, i) => i + 1));
  for (const n of [13, 40, 99]) { const a = amounts(n); assert.equal(a[0], 1); assert.equal(a.at(-1), n); for (let i = 1; i < a.length; i++) assert.ok(a[i] > a[i - 1]); }
});
