// SPDX-License-Identifier: AGPL-3.0-or-later
// Brass and Banners, as its rules stand. These check what should survive coming tweaks to dice and turn order:
// no win rates, dice sequences, turn orders or whole-game fingerprints are written down here. The genre rules that
// ruling 119 fixed for Traditional (3 dice against 2, a muster floor of 3, land bonuses by size and borders, trading
// at once after a knockout) are checked as rules, not as outcomes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chance, createMatch, seedState } from "../src/core/index.js";
import { BAG, EXPANSIONS, HAND, NONE, SAFETY, SWITCHES, amounts, banners, boardOf, bonusOf, bordersOf, cellsOf, gain, goalOf, muster, nearOf, odds, setWorth, setsOf, toll, wholeOf } from "../src/games/banners/rules.js";
import { DICE, fair, meet, odds as diceOdds, toll as diceToll } from "../src/games/banners/dice.js";
import { areaBoard } from "../src/games/areas.js";
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
const roller = (seed) => chance(seedState(seed));
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
  const m = createMatch(banners, { seed: "b", options: { seats: 3, style: "custom", start: "far" } }), p = m.position; // a full first turn
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
test("a game nobody attacks in ends after its rounds, or at the safety end with no limit; each round every seat moves once; most land wins", () => {
  /** Everything placed at once on the first place offered; no fights, no marches. */
  const quiet = (list) => list.filter((x) => x.do !== "place" || x.at === list[0].at).reduce((a, x) => (x.do === "place" && a.do === "place" && x.n > a.n ? x : a));
  for (const [start, style, rounds] of [...SWITCHES.start.values.map((x) => [x, "custom", 12]), ["dealt", "classic", 0]]) {
    const m = createMatch(banners, { seed: `quiet ${start} ${style}`, options: { seats: 3, style, start, rounds } }), turns = new Map();
    passive(m, quiet, (events) => { for (const e of events) if (e.kind === "muster") { const r = m.position.round; turns.set(r, [...(turns.get(r) || []), e.seat]); } });
    const p = m.position, most = Math.max(...[0, 1, 2].map((s) => cellsOf(p, s)));
    assert.ok(p.over, start); assert.equal(p.rounds, rounds, "Traditional has no round limit, only the safety end"); assert.equal(p.round, (p.rounds || SAFETY) + 1);
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
test("amounts: every one from one to the whole, so a stack can be split exactly", () => {
  for (const n of [1, 5, 12, 13, 17, 40, 99]) assert.deepEqual(amounts(n), Array.from({ length: n }, (_, i) => i + 1));
  assert.deepEqual(amounts(0), []);
});
test("moving in after a conquest: any number from none to all but one may follow, exactly", () => {
  const p = made([[A, 0, 19], [B, 1, 1], [far, 1, 1]]), q = win(p, A, B).position;
  assert.equal(q.phase, "occupy");
  const spare = q.str[A] - 1, list = banners.moves(q).map((m) => m.n);
  assert.deepEqual(list, Array.from({ length: spare + 1 }, (_, i) => i), "every amount is offered, 7 and 13 among them");
  for (const n of [0, 7, spare]) {
    const r = banners.apply(q, { do: "occupy", n }, roller("o")).position;
    assert.equal(r.str[B], 1 + n); assert.equal(r.str[A], q.str[A] - n); assert.equal(r.phase, "attack");
  }
  // placing and the last move are exact too
  const put = Object.assign(structuredClone(p), { phase: "place", left: 23 });
  assert.deepEqual(banners.moves(put).filter((m) => m.at === A).map((m) => m.n), amounts(23));
  const after = banners.apply(q, { do: "occupy", n: 0 }, roller("o")).position;
  assert.deepEqual(banners.moves(after).filter((m) => m.do === "move" && m.from === A && m.to === B).map((m) => m.n), amounts(after.str[A] - 1));
});
test("dice luck, an open bag: off by default in every rule set; on in Custom, every die is drawn from the bag, which never runs dry and replays", () => {
  for (const style of STYLES) assert.equal(start(2, style).position.bag, null, style);
  assert.equal(SWITCHES.luck.normal, "fair");
  const m = createMatch(banners, { seed: "bag", options: { seats: 2, style: "custom", luck: "bag", start: "far" } });
  assert.deepEqual(m.position.bag, Array(6).fill(BAG.each));
  const p = made([[A, 0, 40], [B, 1, 30]], { style: "custom" });
  p.bag = Array(6).fill(BAG.each);
  const before = p.bag.reduce((n, c) => n + c, 0), r = banners.apply(p, { do: "attack", from: A, to: B, roll: "once" }, roller("b1"));
  const e = r.events.find((x) => x.kind === "fight"), thrown = e.rolls.flat(2);
  assert.equal(r.position.bag.reduce((n, c) => n + c, 0), before - thrown.length, "each die thrown leaves the bag");
  for (let f = 0; f < 6; f++) assert.equal(r.position.bag[f], BAG.each - thrown.filter((v) => v === f + 1).length, `face ${f + 1}`);
  assert.deepEqual(r, banners.apply(p, { do: "attack", from: A, to: B, roll: "once" }, roller("b1")), "the same seed draws the same dice");
  // a long fight: the bag is topped up and never empties, and over many throws each face comes up as often as the others, within a fresh set
  const q = made([[A, 0, 800], [B, 1, 700]], { style: "custom" });
  q.bag = Array(6).fill(BAG.each);
  const long = banners.apply(q, { do: "attack", from: A, to: B, roll: "all" }, roller("b2")), faces = Array(7).fill(0);
  for (const [x, y] of long.events.find((x) => x.kind === "fight").rolls) for (const v of [...x, ...y]) faces[v]++;
  const all = faces.reduce((n, c) => n + c, 0);
  assert.ok(all > 600, `${all} dice`);
  for (let f = 1; f <= 6; f++) assert.ok(Math.abs(faces[f] - all / 6) <= 6 * BAG.each, `face ${f}: ${faces[f]} of ${all}`);
  assert.ok(long.position.bag.every((c) => c >= 0) && long.position.bag.reduce((n, c) => n + c, 0) >= BAG.low - 1);
  const g = botGame(banners, choose, { seed: "bag game", options: { seats: 3, style: "custom", luck: "bag" }, tiers: ["normal"], each: sound });
  ended(g, 3);
  replays(g, [banners]);
});

test("3 against 2: Traditional throws at most 3 dice against 2, highest meets highest, and the odds shown count every throw", () => {
  const how = DICE[start(2, "classic").position.rule.dice];
  assert.equal(how.a, 3); assert.equal(how.d, 2); assert.equal(how.tie, "attacker");
  // the chance worked out again the slow way: every face of every die, one throw at a time
  const faces = (n) => (n ? faces(n - 1).flatMap((t) => [1, 2, 3, 4, 5, 6].map((v) => [...t, v])) : [[]]), slow = new Map();
  const chanceOf = (a, d) => {
    if (a <= 0) return 0;
    if (d <= 0) return 1;
    const k = `${a}/${d}`;
    if (!slow.has(k)) {
      const X = faces(Math.min(a, how.a)), Y = faces(Math.min(d, how.d));
      let sum = 0;
      for (const x of X) for (const y of Y) { const [l, w] = meet(x, y, how); sum += chanceOf(a - l, d - w); }
      slow.set(k, sum / (X.length * Y.length));
    }
    return slow.get(k);
  };
  for (let a = 1; a <= 6; a++) for (let d = 1; d <= 6; d++) assert.ok(Math.abs(diceOdds(a, d, how) / 1000000 - chanceOf(a, d)) < 0.00002, `${a} v ${d}: ${diceOdds(a, d, how)} shown, ${chanceOf(a, d)} counted`); // the shown odds round down at each step
  const d = roller("throws");
  for (const [att, def] of [[1, 1], [2, 1], [5, 1], [5, 4], [9, 9]]) {
    const p = made([[A, 0, att + 1], [B, 1, def], [far, 1, 1]], { style: "classic" });
    for (let i = 0; i < 40; i++) {
      const f = banners.apply(p, { do: "attack", from: A, to: B, roll: "once" }, d).events.find((e) => e.kind === "fight"), [X, Y] = f.rolls[0];
      assert.equal(X.length, Math.min(3, att)); assert.equal(Y.length, Math.min(2, def));
      assert.equal(f.lost.attacker + f.lost.defender, Math.min(X.length, Y.length), "one loss for each pair of dice");
    }
  }
});
test("muster: Traditional gives one for every three provinces with a floor of 3, Capo 3 more on top, and whole lands pay their bonus", () => {
  for (const style of ["classic", "ours", "custom"]) {
    const p = made([], { style }), board = boardOf(p), plus = p.rule.muster === "plus";
    for (let k = 1; k <= board.n - 2; k++) {
      p.owner = p.owner.map((_, i) => (i < k ? 0 : 1));
      const m = muster(p, 0), lands = wholeOf(p, 0).reduce((n, x) => n + bonusOf(board, x), 0);
      assert.equal(m.lands, lands);
      assert.equal(m.all, (plus ? 3 + Math.floor(k / 3) : Math.max(3, Math.floor(k / 3))) + lands, `${style}, ${k} provinces`);
    }
  }
});
test("land bonuses on every map: a third of the size and half the border provinces, halves down; more exposure never pays less", () => {
  const boards = [areaBoard(0, "world"), ...[1, 2, 3, 4].flatMap((k) => [areaBoard(k, "grown"), areaBoard(k, "isles")])];
  for (const board of boards) {
    board.sizes.forEach((size, k) => {
      const mine = board.near.map((_, i) => i).filter((i) => board.region[i] === k), edge = mine.filter((i) => board.near[i].some((m) => board.region[m] !== k)).length;
      assert.equal(bordersOf(board, k), edge); assert.ok(edge >= 1 && edge <= size);
      const v = bonusOf(board, k), six = 2 * size + 3 * edge; // six times the exact value
      assert.ok(Number.isInteger(v) && v >= 1); assert.ok(six - 6 * v <= 3 && 6 * v - six <= 2, `${board.lands[k]}: ${size} provinces, ${edge} on the border, pays ${v}`);
    });
    for (const x of board.sizes.keys()) for (const y of board.sizes.keys()) if (board.sizes[x] >= board.sizes[y] && bordersOf(board, x) >= bordersOf(board, y)) assert.ok(bonusOf(board, x) >= bonusOf(board, y));
  }
});
test("a knockout hands over the cards; at five or more Traditional must hand in at once and place it, then attacks on", () => {
  const set = [0, 3, 6]; // three of one suit
  for (const style of ["classic", "ours"]) for (const moveIn of [true, false]) {
    const p = made([[A, 0, moveIn ? 40 : 2], [B, 1, 1], [far, 2, 3], [far2, 2, 3]], { seats: 3, style, hands: [[...set], [1, 4], []] });
    let q, events, tries = 0;
    do ({ position: q, events } = win(p, A, B, `ko ${tries++}`)); while (q.owner[B] !== 0 && tries < 50); // 2 against 1 can fail: try other dice
    assert.equal(q.owner[B], 0); assert.equal(q.outBy[1], 0); assert.equal(q.hands[0].length, HAND);
    assert.equal(q.phase, moveIn ? "occupy" : style === "classic" ? "place" : "attack");
    if (moveIn) ({ position: q, events } = banners.apply(q, { do: "occupy", n: 0 }));
    if (q.rule.spoils === "wait") { assert.equal(q.phase, "attack"); assert.ok(!events.some((e) => e.kind === "spoils")); continue; }
    assert.equal(q.phase, "place"); assert.equal(q.left, 0); assert.ok(events.some((e) => e.kind === "spoils" && e.seat === 0));
    const list = banners.moves(q);
    assert.ok(list.length && list.every((x) => x.do === "trade"), "only sets may be handed in");
    const r = banners.apply(q, list[0]).position;
    assert.equal(r.phase, "place"); assert.ok(r.left > 0); assert.ok(r.hands[0].length < HAND);
    const t = banners.apply(r, { do: "place", at: B, n: r.left }).position;
    assert.equal(t.phase, "attack"); assert.equal(t.seat, 0); assert.ok(banners.moves(t).some((x) => x.do === "end"));
  }
  // under five cards there is nothing to hand in yet
  const p = made([[A, 0, 40], [B, 1, 1], [far, 2, 3], [far2, 2, 3]], { seats: 3, style: "classic", hands: [[0], [1], []] });
  assert.equal(banners.apply(win(p, A, B).position, { do: "occupy", n: 0 }).position.phase, "attack");
});
test("first turns: under grade each seat in round 1 musters more the later it moves, the first at least half and the last all of it; under lean the first of two musters a third", () => {
  const firsts = (options) => {
    const m = createMatch(banners, { seed: "first " + JSON.stringify(options), options }), got = [];
    while (m.turn !== null && m.position.round === 1) {
      const p = m.position;
      if (p.phase === "place" && got[p.step] === undefined) got[p.step] = [p.left, muster(p, p.seat).all];
      else if (p.phase === "attack" && got[p.step] === undefined) got[p.step] = [0, muster(p, p.seat).all];
      m.play(p.phase === "attack" ? { do: "end" } : { do: "place", at: p.owner.indexOf(p.seat), n: p.left });
    }
    return got;
  };
  for (const seats of [2, 3, 5]) {
    const got = firsts({ seats, style: "custom", start: "far", opening: "grade" });
    got.forEach(([left, all], i) => assert.equal(left, Math.floor((all * (seats + i)) / (2 * seats - 1)), `${seats} seats, place ${i + 1}`));
    got.forEach(([left, all], i) => { assert.ok(2 * left + 1 >= all, "nobody starts with less than half, rounded down"); if (i) assert.ok(left >= got[i - 1][0]); });
    assert.equal(got.at(-1)[0], got.at(-1)[1]);
  }
  const lean = firsts({ seats: 2, style: "classic" });
  assert.equal(lean[0][0], Math.floor(lean[0][1] / 3)); assert.equal(lean[1][0], lean[1][1]);
  for (const [left, all] of firsts({ seats: 3, style: "classic" })) assert.equal(left, all, "lean is for two seats only");
});

test("scored rounds: Capo is ten of them; from round 2 each seat scores what it holds as its turn starts, everyone once more at the end, and the most points wins", () => {
  const quiet = (list) => list.filter((x) => x.do !== "place" || x.at === list[0].at).reduce((a, x) => (x.do === "place" && a.do === "place" && x.n > a.n ? x : a));
  const m = start(3), scored = [0, 0, 0], times = [0, 0, 0];
  assert.equal(m.position.rule.score, "rounds"); assert.equal(m.position.rounds, 10); assert.deepEqual(m.position.points, [0, 0, 0]);
  passive(m, quiet, (events) => {
    for (const e of events) if (e.kind === "score") {
      assert.ok(m.position.round > 1, "nothing is scored in round 1");
      assert.ok(Number.isInteger(e.n) && e.n >= 0);
      scored[e.seat] += e.n; times[e.seat]++;
      assert.equal(e.all, scored[e.seat]);
    }
  });
  const p = m.position;
  assert.deepEqual(p.points, scored);
  assert.deepEqual(times, [10, 10, 10], "nine turn starts and the end");
  assert.equal(p.over.why, "scored the most over the rounds");
  assert.ok(p.over.winners.every((s) => p.points[s] === Math.max(...p.points)));
  // what is scored is what is held: 1 for every three provinces, a whole land's bonus, 2 for a capital when capitals are played
  const q = made([[A, 0, 2], [B, 0, 2], [far, 0, 2], [far2, 1, 2]]);
  assert.equal(gain(q, 0), 1); assert.equal(gain(q, 1), 0);
  const land = boardOf(q).region[A], whole = made(boardOf(q).region.flatMap((k, i) => (k === land ? [[i, 0, 1]] : [])));
  assert.equal(gain(whole, 0), Math.floor(cellsOf(whole, 0) / 3) + bonusOf(boardOf(whole), land));
  assert.equal(gain({ ...q, caps: [A, far2] }, 1), 2);
  // level on points, the most land wins; and land rules keep no points at all
  for (const style of ["classic", "custom"]) assert.equal(start(2, style).position.points, null);
  assert.equal(createMatch(banners, { seed: "s", options: { style: "custom", score: "rounds", rounds: 0 } }).position.points, null, "scoring needs a last round");
});
test("scored rounds: a seat is scored after the others have answered, and holding enough land still wins at once", () => {
  const p = made([[A, 0, 40], [B, 1, 1], [far, 1, 1], [far2, 0, 1]], { round: 2, points: [0, 0], step: 0 });
  const took = win(p, A, B).position, done = banners.apply(banners.apply(took, { do: "occupy", n: 0 }, roller("o")).position, { do: "end" }, roller("e"));
  assert.deepEqual(done.position.points[0], 0, "taking land scores nothing until your turn comes round again");
  assert.ok(done.events.some((e) => e.kind === "score" && e.seat === 1), "the next seat is scored as its turn starts");
  const all = made(b.near.map((_, i) => [i, i === far ? 1 : 0, i === A ? 40 : 1]).filter(([i]) => i !== B).concat([[B, 1, 1]]), { round: 2, points: [0, 9] });
  const end = win(all, A, B).position;
  assert.deepEqual(end.over.winners, [0]); assert.equal(end.over.why, "held enough of the land");
});
test("what a fight is likely to cost: nothing against nobody, never more than was sent, more against more; one throw's fair share adds up", () => {
  for (const [name, d] of Object.entries(DICE)) {
    const how = { ...d, up: 0, down: 0 };
    assert.equal(diceToll(5, 0, how), 0); assert.equal(diceToll(0, 5, how), 0);
    for (const a of [1, 3, 8, 20]) for (const dn of [1, 2, 6]) {
      const t = diceToll(a, dn, how);
      assert.ok(Number.isInteger(t) && t >= 0 && t <= 1000 * a, `${name} ${a} against ${dn}: ${t}`);
      if (a >= 20) assert.ok(diceToll(a, dn + 3, how) > t, "a larger garrison costs more to take");
    }
    for (let a = 1; a <= d.a; a++) for (let dn = 1; dn <= d.d; dn++) {
      const [x, y] = fair(a, dn, how), pairs = Math.min(a, dn);
      assert.ok(x >= 0 && y >= 0 && x + y >= 1000 * pairs - 2 && x + y <= 2000 * pairs, `${name} ${a} dice against ${dn}`);
      if (d.tie === "attacker") assert.ok(Math.abs(x + y - 1000 * pairs) <= 2, "each pair of dice costs one side exactly one");
    }
  }
  const p = made([[A, 0, 9], [B, 1, 3]]);
  assert.equal(toll(p, A, B), diceToll(8, 3, { ...DICE[p.rule.dice], up: 0, down: 0 }));
});
test("the hard bot plays whole legal games in every rule set, the same way from the same seed", () => {
  assert.ok(TIERS.includes("hard"));
  for (const style of STYLES) {
    const run = () => botGame(banners, choose, { seed: "hard " + style, options: { seats: 3, style }, tiers: ["hard", "normal", "hard"], each: sound });
    const m = run();
    ended(m, 3);
    if (style === "ours") assert.equal(run().fingerprint(), m.fingerprint());
  }
  const all = Object.fromEntries(EXPANSIONS.map((x) => [x, true]));
  ended(botGame(banners, choose, { seed: "hard all", options: { seats: 4, style: "ours", ...all }, tiers: ["hard"], each: sound }), 4);
});
