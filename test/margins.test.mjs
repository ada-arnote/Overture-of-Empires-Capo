// SPDX-License-Identifier: AGPL-3.0-or-later
// Margins of Trust (early): the map, the one-pass reveal with a reason for every order, the talk and its bargains, the
// season and winter, the ledger, the end, replay from seed and moves, and bots that bargain by their stated characters
// and play legal, complete games without reading anyone's sheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canon, chance, createMatch, packGame, seedState, unpackGame } from "../src/core/index.js";
import { mapOf } from "../src/games/margins/map.js";
import { resolve } from "../src/games/margins/resolve.js";
import { LEADS, NONE, WORDS, alive, boardOf, formsOf, ledgerFor, margins, mineOf, ordersAt, pending, portsOf, reason, strengthOf, supplyOf, toWin, wordOf } from "../src/games/margins/rules.js";
import { TIERS, characterOf, choose, plan, record } from "../src/games/margins/bot.js";
import { CAST, FORMS, formText, judge } from "../src/games/margins/forms.js";
import { inList, refused, replays, sameEachStep } from "./fixtures/bots.js";

const B = mapOf(4); // 32 provinces; ports 0, 1, 2 in seat 0's march, 8, 9, 10 in seat 1's, and so on round the sea
/** An empty land with some provinces held: [[at, seat, strength], ...]. */
const land = (held) => { const owner = Array(B.n).fill(NONE), str = Array(B.n).fill(0); for (const [at, s, n] of held) { owner[at] = s; str[at] = n; } return { owner, str }; };
const run = (held, sheets) => { const { owner, str } = land(held); return { ...resolve(B, owner, str, sheets), before: { owner, str } }; };
const res = (r, at) => r.results.find((x) => x.at === at);
const mv = (at, to, n) => ({ at, kind: "move", to, n }), sup = (at, to, seat) => ({ at, kind: "support", to, seat }), carry = (at, a, b) => ({ at, kind: "transport", a, b });
const words = (r) => reason(r, (i) => `P${i}`, (s) => `Seat${s}`);

test("the map: three rings round the sea, the same march for every seat, two neighbours each", () => {
  for (const seats of [3, 4, 5]) {
    const b = mapOf(seats);
    assert.equal(b.n, 8 * seats);
    assert.equal(b.ports, 3 * seats);
    for (let i = 0; i < b.n; i++) {
      for (const j of b.near[i]) assert.ok(b.near[j].includes(i), `${i} and ${j} border both ways`);
      const turned = b.near[i].map((j) => (j + 8) % b.n).sort((x, y) => x - y);
      assert.deepEqual(turned, [...b.near[(i + 8) % b.n]].sort((x, y) => x - y), "every march has the same shape");
    }
    const seen = new Set([0]), list = [0];
    for (let k = 0; k < list.length; k++) for (const j of b.near[list[k]]) if (!seen.has(j)) { seen.add(j); list.push(j); }
    assert.equal(seen.size, b.n, "one land");
    for (let s = 0; s < seats; s++) {
      const next = new Set(); for (let i = 8 * s; i < 8 * s + 8; i++) for (const j of b.near[i]) if (b.land[j] !== s) next.add(b.land[j]);
      assert.equal(next.size, 2, `seat ${s}'s march borders exactly two others`);
      const [home, ...rest] = b.starts[s];
      assert.equal(home[1], 3);
      for (const [at] of rest) assert.ok(b.near[home[0]].includes(at));
      assert.ok(b.starts[s].some(([at]) => b.port[at]), "each seat starts with a port");
    }
    assert.equal(new Set(b.names).size, b.n, "every province has its own name");
  }
});

test("reveal: a move into empty land arrives, leaving the rest behind", () => {
  const r = run([[4, 0, 3]], [[mv(4, 5, 2)]]);
  assert.equal(res(r, 4).code, "took");
  assert.deepEqual([r.owner[5], r.str[5], r.str[4]], [0, 2, 1]);
});

test("reveal: an attack must be stronger than what stays; a bounce comes home one weaker", () => {
  const r = run([[4, 0, 3], [5, 1, 2]], [[mv(4, 5, 2)], []]);
  assert.equal(res(r, 4).code, "held-off");
  assert.equal(res(r, 4).back, 1);
  assert.equal(res(r, 5).code, "stood");
  assert.deepEqual([r.owner[5], r.str[5], r.str[4]], [1, 2, 2]);
  assert.match(words(res(r, 4)), /bounced off P5: 2 against a defence of 2\. 1 came home/);
});

test("reveal: support adds 1, and the taker loses half of what stood there", () => {
  const r = run([[4, 0, 3], [2, 0, 1], [5, 1, 2]], [[mv(4, 5, 2), sup(2, 5, 0)], []]);
  assert.equal(res(r, 2).code, "given");
  assert.equal(res(r, 4).code, "took");
  assert.equal(res(r, 5).code, "lost");
  assert.deepEqual([r.owner[5], r.str[5]], [0, 1]);
  assert.deepEqual(r.takes, [{ at: 5, seat: 0, was: 1, n: 1, power: 3, against: 2 }]);
});

test("reveal: an attack on the supporter cuts it, unless it comes from where the support is aimed", () => {
  const cut = run([[4, 0, 3], [2, 0, 1], [5, 1, 2], [8, 1, 3]], [[mv(4, 5, 2), sup(2, 5, 0)], [mv(8, 2, 2)]]);
  assert.equal(res(cut, 2).code, "cut");
  assert.equal(res(cut, 2).by, 8);
  assert.match(words(res(cut, 2)), /support was cut: P2 was attacked from P8/);
  assert.equal(res(cut, 4).code, "held-off");
  assert.equal(res(cut, 8).code, "took", "and the attacker on the supporter takes it");
  const kept = run([[4, 0, 3], [2, 0, 1], [5, 1, 3]], [[mv(4, 5, 2), sup(2, 5, 0)], [mv(5, 2, 1)]]);
  assert.equal(res(kept, 2).code, "given", "an attack from the target does not cut");
  assert.equal(res(kept, 4).code, "took");
  assert.equal(res(kept, 5).code, "held-off");
  assert.equal(res(kept, 5).gone, true, "its home was taken meanwhile, so the bounced 1 is lost");
});

test("reveal: standoffs bounce everyone, and the strongest of several arrivals is the only one that can take", () => {
  const two = run([[4, 0, 3], [11, 1, 3]], [[mv(4, 5, 2)], [mv(11, 5, 2)]]);
  assert.deepEqual([res(two, 4).code, res(two, 11).code], ["tie", "tie"]);
  assert.equal(two.owner[5], NONE);
  assert.deepEqual([two.str[4], two.str[11]], [2, 2]);
  const three = run([[4, 0, 3], [8, 1, 3], [7, 2, 3]], [[mv(4, 5, 2)], [mv(8, 5, 2)], [mv(7, 5, 2)]]);
  assert.deepEqual([4, 8, 7].map((at) => res(three, at).code), ["tie", "tie", "tie"]);
  const big = run([[4, 0, 4], [8, 1, 3], [7, 2, 3]], [[mv(4, 5, 3)], [mv(8, 5, 2)], [mv(7, 5, 2)]]);
  assert.deepEqual([4, 8, 7].map((at) => res(big, at).code), ["took", "outdone", "outdone"]);
  const held = run([[4, 0, 3], [11, 1, 3], [5, 2, 3]], [[mv(4, 5, 2), sup(2, 5, 0)], [mv(11, 5, 2)], []]);
  assert.equal(held.owner[5], 2, "a supported attack that does not beat the defence still bounces");
});

test("reveal: head on, the weaker bounces, both when equal, and support counts", () => {
  const one = run([[4, 0, 4], [5, 1, 3]], [[mv(4, 5, 3)], [mv(5, 4, 2)]]);
  assert.equal(res(one, 5).code, "swap");
  assert.equal(res(one, 4).code, "took");
  assert.deepEqual([one.owner[5], one.str[5], one.str[4]], [0, 3, 1]);
  const both = run([[4, 0, 3], [5, 1, 3]], [[mv(4, 5, 2)], [mv(5, 4, 2)]]);
  assert.deepEqual([res(both, 4).code, res(both, 5).code], ["swap", "swap"]);
  assert.deepEqual([both.str[4], both.str[5]], [2, 2]);
  const backed = run([[4, 0, 3], [2, 0, 1], [5, 1, 3]], [[mv(4, 5, 2), sup(2, 5, 0)], [mv(5, 4, 2)]]);
  assert.equal(res(backed, 5).code, "swap");
  assert.equal(res(backed, 4).code, "took");
});

test("reveal: a crossing needs a transport that stands", () => {
  assert.equal(B.near[1].includes(10), false);
  const none = run([[1, 0, 3]], [[mv(1, 10, 2)]]);
  assert.equal(res(none, 1).code, "no-transport");
  assert.match(words(res(none, 1)), /no transport stood/);
  const by = run([[1, 0, 3], [0, 0, 1]], [[mv(1, 10, 2), carry(0, 1, 10)]]);
  assert.equal(res(by, 1).code, "took");
  assert.equal(res(by, 1).sea, true);
  assert.equal(res(by, 0).code, "carried");
  const cut = run([[1, 0, 3], [0, 0, 1], [29, 3, 3]], [[mv(1, 10, 2), carry(0, 1, 10)], [], [], [mv(29, 0, 2)]]);
  assert.equal(res(cut, 0).code, "cut");
  assert.equal(res(cut, 1).code, "no-transport");
  assert.equal(res(cut, 1).by, 0);
  const idle = run([[0, 0, 1]], [[carry(0, 1, 10)]]);
  assert.equal(res(idle, 0).code, "void");
});

test("reveal: reinforcements fall with the garrison; a support for nothing is void", () => {
  const r = run([[4, 0, 5], [5, 1, 1], [11, 1, 2], [2, 0, 1]], [[mv(4, 5, 4), sup(2, 8, 1)], [mv(11, 5, 1)]]);
  assert.equal(res(r, 11).code, "fell");
  assert.equal(res(r, 4).code, "took");
  assert.deepEqual([r.owner[5], r.str[5]], [0, 3]);
  assert.equal(res(r, 2).code, "void");
  const join = run([[5, 1, 1], [11, 1, 2]], [[], [mv(11, 5, 1)]]);
  assert.equal(res(join, 11).code, "joined");
  assert.equal(join.str[5], 2);
});

/** A position with land scattered at random, and random legal sheets. */
function randomSeason(seed, seats = 4) {
  const d = chance(seedState(`margins-random/${seed}`)), b = mapOf(seats), owner = Array(b.n).fill(NONE), str = Array(b.n).fill(0);
  for (let i = 0; i < b.n; i++) if (d.below(4)) { owner[i] = d.below(seats); str[i] = 1 + d.below(5); }
  const p = { seats, owner, str }, sheets = Array.from({ length: seats }, () => []);
  for (let i = 0; i < b.n; i++) if (owner[i] >= 0 && d.below(4)) sheets[owner[i]].push(d.pick(ordersAt(p, i)));
  return { b, owner, str, sheets, d };
}
const CODES = { hold: ["held", "stood", "lost"], move: ["took", "joined", "fell", "held-off", "tie", "outdone", "swap", "no-transport"], support: ["given", "cut", "void"], transport: ["carried", "cut", "void"] };

test("reveal: every order has exactly one reason; sheets in any order give one result; strength never grows", () => {
  for (let seed = 0; seed < 400; seed++) {
    const { b, owner, str, sheets, d } = randomSeason(seed, 3 + (seed % 3)), r = resolve(b, owner, str, sheets);
    const held = owner.flatMap((o, i) => (o >= 0 ? [i] : []));
    assert.deepEqual(r.results.map((x) => x.at), held, "one result for each province held");
    for (const x of r.results) {
      assert.ok(CODES[x.kind].includes(x.code), `a known reason: ${x.kind}/${x.code}`);
      const t = words(x);
      assert.ok(t.endsWith(".") && !/undefined|NaN/.test(t), t);
    }
    const shuffled = resolve(b, owner, str, sheets.map((l) => d.shuffle(l)));
    assert.equal(canon([shuffled.owner, shuffled.str]), canon([r.owner, r.str]));
    const total = (o, s) => o.reduce((n, x, i) => n + (x >= 0 ? s[i] : 0), 0);
    assert.ok(total(r.owner, r.str) <= total(owner, str));
    r.owner.forEach((o, i) => assert.ok(o === NONE ? r.str[i] === 0 : r.str[i] >= 1, `province ${i}: held means at least 1, empty means 0`));
  }
});

test("reveal: turning the board one march turns the result one march", () => {
  for (let seed = 0; seed < 150; seed++) {
    const seats = 3 + (seed % 3), { b, owner, str, sheets } = randomSeason(`turn/${seed}`, seats), rot = (i) => (i + 8) % b.n, rs = (s) => (s < 0 ? s : (s + 1) % seats);
    const o2 = Array(b.n), s2 = Array(b.n);
    owner.forEach((o, i) => { o2[rot(i)] = rs(o); s2[rot(i)] = str[i]; });
    const turn = (o) => { const x = { ...o, at: rot(o.at) }; if (o.to !== undefined) x.to = rot(o.to); if (o.seat !== undefined) x.seat = rs(o.seat); if (o.a !== undefined) { x.a = Math.min(rot(o.a), rot(o.b)); x.b = Math.max(rot(o.a), rot(o.b)); } return x; };
    const sh2 = Array.from({ length: seats }, () => []);
    sheets.forEach((l, s) => { sh2[rs(s)] = l.map(turn); });
    const r1 = resolve(b, owner, str, sheets), r2 = resolve(b, o2, s2, sh2);
    r1.owner.forEach((o, i) => { assert.equal(r2.owner[rot(i)], rs(o)); assert.equal(r2.str[rot(i)], r1.str[i]); });
  }
});

const start = (seats = 3, style = "classic", seed = "m", more = {}) => createMatch(margins, { seed, options: { seats, style, ...more } });
/** Nobody says anything: every seat ends its talk. */
const quiet = (m) => { while (m.turn !== null && m.position.stage === "talk") m.play({ do: "done" }); };

test("orders: one a province, leaving 1 behind, only your own; the quick check agrees with the full list", () => {
  const m = start(4);
  assert.equal(m.position.stage, "talk");
  assert.throws(() => m.play({ do: "order", at: 4, kind: "hold" }), refused("illegal"), "no orders in the talk");
  quiet(m);
  assert.equal(m.position.stage, "write");
  assert.equal(m.turn, 0);
  assert.throws(() => m.play({ do: "order", at: 4, kind: "move", to: 5, n: 3 }), refused("illegal"), "all three cannot leave");
  assert.throws(() => m.play({ do: "order", at: 12, kind: "hold" }), refused("illegal"), "not yours");
  assert.throws(() => m.play({ do: "order", at: 4, kind: "move", to: 12, n: 1 }), refused("illegal"), "not a neighbour");
  m.play({ do: "order", at: 4, kind: "move", to: 5, n: 2 });
  assert.throws(() => m.play({ do: "order", at: 4, kind: "hold" }), refused("illegal"), "one order a province");
  assert.deepEqual(m.events, [], "a written order says nothing");
  const d = chance(seedState("agree"));
  for (let k = 0; k < 300; k++) {
    const p = m.position, list = margins.moves(p), mv2 = d.pick(list);
    assert.ok(margins.allows(p, JSON.parse(canon(mv2))));
    const bent = { ...mv2, n: 99 };
    assert.equal(margins.allows(p, bent), inList(list, bent));
  }
  m.play({ do: "done" });
  assert.equal(m.turn, 1);
  assert.deepEqual(m.events, [{ kind: "sealed", seat: 0 }]);
});

test("a season: the last seal reveals every order at once, then spring turns to autumn", () => {
  const m = start(3);
  quiet(m);
  m.play({ do: "order", at: 4, kind: "move", to: 5, n: 2 });
  m.play({ do: "done" });
  m.play({ do: "done" });
  const ev = m.play({ do: "done" });
  assert.deepEqual(ev[0], { kind: "sealed", seat: 2 });
  assert.equal(ev[1].kind, "reveal");
  assert.equal(ev.filter((e) => e.kind === "order").length, 9, "every province held, ordered or not");
  assert.deepEqual(ev.filter((e) => e.kind === "take").map((e) => [e.at, e.seat]), [[5, 0]]);
  const p = m.position;
  assert.deepEqual([p.half, p.year, p.round, p.seat, p.stage], [1, 1, 2, 0, "talk"]);
  assert.deepEqual(p.orders, [[], [], []]);
});

test("talk: promises and asks, at most a few a season; the quick check agrees with the full list", () => {
  const m = start(4), d = chance(seedState("talk"));
  const list = margins.moves(m.position);
  assert.ok(list.some((x) => x.do === "promise" && x.to === -1) && list.some((x) => x.do === "ask" && x.to === 1));
  assert.ok(!list.some((x) => x.do === "ask" && x.to === -1), "nobody is asked in public");
  for (let k = 0; k < 300; k++) {
    const p = m.position, all = margins.moves(p), x = d.pick(all);
    assert.ok(margins.allows(p, JSON.parse(canon(x))));
    for (const bent of [{ ...x, at: 999 }, { ...x, to: 7 }, { ...x, extra: 1 }]) assert.equal(margins.allows(p, bent), inList(all, bent));
  }
  assert.throws(() => m.play({ do: "promise", form: "stand", to: 1, at: 12 }), refused("illegal"), "you hold only your own");
  assert.throws(() => m.play({ do: "promise", form: "back-move", to: -1, at: 5 }), refused("illegal"), "a support is promised to a seat");
  m.play({ do: "promise", form: "no-strike", to: 1 });
  assert.throws(() => m.play({ do: "promise", form: "no-strike", to: 1 }), refused("illegal"), "said once");
  for (let k = 1; k < WORDS; k++) m.play({ do: "promise", form: "stand", to: k % 2 ? -1 : 2, at: [4, 1, 6, 4, 1][k - 1] });
  assert.equal(m.position.talk[0].length, WORDS);
  assert.deepEqual(margins.moves(m.position), [{ do: "done" }], "no more words this season");
  assert.deepEqual(m.events, [], "talk is private until the answers");
});

test("bargains: accepted, both sides' promises stand; declined, neither does; gifts and public pledges always stand", () => {
  const m = start(3);
  // Amber offers Blue a pact and asks Blue's support; gives Teal a gift; pledges in public
  m.play({ do: "promise", form: "no-strike", to: 1 });
  m.play({ do: "ask", form: "back-move", to: 1, at: 7 });
  m.play({ do: "promise", form: "keep-out", to: 2, at: 23 });
  m.play({ do: "promise", form: "stand", to: -1, at: 4 });
  m.play({ do: "done" });
  // Blue asks Teal for a pact, offering one
  m.play({ do: "promise", form: "no-strike", to: 2 });
  m.play({ do: "ask", form: "no-strike", to: 2 });
  m.play({ do: "done" });
  const ev = m.play({ do: "done" });
  assert.deepEqual(ev, [], "answers are due first");
  assert.equal(m.position.stage, "answer");
  assert.deepEqual([m.turn, pending(m.position, 1), pending(m.position, 2)], [1, [0], [1]]);
  assert.throws(() => m.play({ do: "done" }), refused("illegal"), "an answer is yes or no");
  m.play({ do: "answer", from: 0, yes: true });
  const end = m.play({ do: "answer", from: 1, yes: false });
  assert.equal(m.position.stage, "write");
  assert.deepEqual(end, [{ kind: "talked", open: 1, closed: 3 }]);
  assert.deepEqual(m.position.pledges, [
    { form: "stand", to: -1, at: 4, by: 0 }, { form: "no-strike", to: 1, by: 0 },
    { form: "back-move", to: 0, at: 7, by: 1 }, { form: "keep-out", to: 2, at: 23, by: 0 },
  ]);
});

test("the ledger: after the reveal every promise in force is marked from the orders; private marks only for their two seats", () => {
  const m = start(3);
  m.play({ do: "promise", form: "no-strike", to: 1 });
  m.play({ do: "ask", form: "keep-out", to: 1, at: 13 });
  m.play({ do: "promise", form: "stand", to: -1, at: 4 });
  m.play({ do: "done" });
  m.play({ do: "promise", form: "keep-out", to: 2, at: 11 });
  m.play({ do: "done" });
  m.play({ do: "done" });
  m.play({ do: "answer", from: 0, yes: true });
  m.play({ do: "order", at: 4, kind: "move", to: 5, n: 2 }); // Amber moves out of the home it pledged in public to hold
  m.play({ do: "done" });
  m.play({ do: "order", at: 12, kind: "move", to: 13, n: 2 }); // Blue enters the land it promised Amber to keep out of
  m.play({ do: "done" });
  const ev = m.play({ do: "done" }), marks = ev.filter((e) => e.kind === "promise");
  assert.deepEqual(marks.map((e) => [e.by, e.to, e.form, e.mark]), [[0, -1, "stand", "broken"], [0, 1, "no-strike", "kept"], [1, 0, "keep-out", "broken"], [1, 2, "keep-out", "kept"]]);
  assert.ok(ev.indexOf(marks[0]) > ev.findLastIndex((e) => e.kind === "order"), "marked after the orders");
  const p = m.position, owner = m.at(m.list.length - 1).owner, results = ev.filter((x) => x.kind === "order").map((x) => x.r);
  assert.equal(p.ledger.length, 4);
  for (const e of p.ledger) assert.equal(e.mark, judge(e, results, owner), "the same mark from the orders alone");
  assert.deepEqual(ledgerFor(p, 2).map((e) => e.form), ["stand", "keep-out"], "Teal sees the public pledge and its own");
  assert.deepEqual(ledgerFor(p, 0).map((e) => e.form), ["stand", "no-strike", "keep-out"]);
  for (let s = 0; s < 3; s++) for (const e of ledgerFor(p, s)) assert.ok(e.to < 0 || e.by === s || e.to === s);
  assert.deepEqual([wordOf(p, 0), wordOf(p, 1), wordOf(p, 2)], [0, 0, 0]);
  assert.deepEqual(p.pledges, [], "a new season starts with no promises");
  assert.equal(formText(p.ledger[2], (i) => `P${i}`), "I will not enter P13 this season.");
  assert.equal(formText(p.ledger[2], (i) => `P${i}`, true), "Do not enter P13 this season.");
  assert.equal(formText({ form: "no-strike", to: -1 }, String), "I will not move into anyone's province this season.");
  assert.equal(formText({ form: "back-move", to: 1, at: 5 }, (i) => `P${i}`), "I will support your move into P5.");
});

test("forms: what can be promised follows the board", () => {
  const p = start(3).position;
  for (let to = -1; to < 3; to++) for (const f of formsOf(p, 0, to)) {
    assert.equal(f.to, to);
    if (f.form === "stand") assert.equal(p.owner[f.at], 0);
    if (f.form === "keep-out") assert.notEqual(p.owner[f.at], 0);
    if (f.form === "back-hold") assert.equal(p.owner[f.at], to);
    if (to < 0) assert.ok(["keep-out", "stand", "no-strike"].includes(f.form), "in public: keep out, hold, no strikes");
  }
  assert.deepEqual(formsOf(p, 0, 0), [], "not to yourself");
});

test("winter: each port grows 1, and strength past supply is lost from the strongest", () => {
  const m = start(3);
  for (let k = 0; k < 12; k++) m.play({ do: "done" }); // spring and autumn, nothing said, everything holding
  const p = m.position, w = m.events.filter((e) => e.kind === "winter");
  assert.equal(w.length, 3);
  for (const e of w) assert.deepEqual([e.grew, e.lost, e.supply], [1, 1, 5]);
  assert.deepEqual([p.str[4], p.str[1], p.str[6]], [2, 2, 1], "the port grew to 2; 6 is past a supply of 5, so the strongest, the home, gave 1");
  assert.equal(strengthOf(p, 0), supplyOf(p, 0));
  assert.deepEqual([p.year, p.half], [2, 0]);
});

test("the end: Traditional at more than half the ports, or the most ports alone from the third winter, or when the years run out; Capo by points", () => {
  const short = start(3, "classic", "end", { years: 2 });
  while (short.turn !== null) short.play({ do: "done" });
  assert.deepEqual(short.result.winners, [0, 1, 2], "all level: shared");
  assert.match(short.result.why, /most ports/);
  assert.equal(short.position.round, 4);
  const big = start(3);
  const p = structuredClone(big.position);
  for (const at of [0, 2, 8, 9, 10]) { p.owner[at] = 0; p.str[at] = 1; }
  p.half = 1;
  p.stage = "write";
  p.done = [false, false, false];
  let q = p;
  for (let s = 0; s < 3; s++) q = margins.apply(q, { do: "done" }).position;
  assert.ok(portsOf(q, 0) >= toWin(q));
  assert.deepEqual(q.over.winners, [0]);
  // one port ahead: not enough before the third winter, enough from it
  const lead = (year) => { const x = structuredClone(big.position); x.owner[0] = 0; x.str[0] = 1; Object.assign(x, { half: 1, year, stage: "write" }); let y = x; for (let s = 0; s < 3; s++) y = margins.apply(y, { do: "done" }).position; return y; };
  assert.equal(lead(LEADS - 1).over, null);
  assert.deepEqual(lead(LEADS).over, { winners: [0], why: "held the most ports, 2, at a winter" });
  const capo = start(3, "ours", "capo", { years: 2 });
  while (capo.turn !== null) capo.play({ do: "done" });
  assert.deepEqual(capo.position.points, [2 * (1 + 3), 2 * (1 + 3), 2 * (1 + 3)], "1 a port, 3 for the most of a land, each winter");
  assert.deepEqual(capo.result.winners, [0, 1, 2]);
  // level on points and ports: the better word wins
  const word = start(3, "ours", "word", { years: 2 });
  word.play({ do: "promise", form: "stand", to: -1, at: 4 });
  while (word.turn !== null) word.play({ do: "done" });
  assert.deepEqual(word.result, { winners: [0], why: "scored the most points, and kept its word better" });
});

test("forms: each promise is judged kept, broken or void from the orders", () => {
  assert.equal(Object.keys(FORMS).length, 6);
  const r = run([[4, 0, 3], [2, 0, 1], [5, 1, 2], [11, 1, 3]], [[mv(4, 5, 2), sup(2, 5, 0)], [mv(11, 7, 2)]]), owner = r.before.owner;
  assert.equal(judge({ form: "keep-out", by: 0, to: 1, at: 5 }, r.results, owner), "broken");
  assert.equal(judge({ form: "keep-out", by: 1, to: 0, at: 5 }, r.results, owner), "kept");
  assert.equal(judge({ form: "back-move", by: 0, to: 0, at: 5 }, r.results, owner), "kept");
  assert.equal(judge({ form: "back-move", by: 0, to: 1, at: 7 }, r.results, owner), "broken");
  assert.equal(judge({ form: "back-move", by: 0, to: 1, at: 3 }, r.results, owner), "void");
  assert.equal(judge({ form: "back-hold", by: 0, to: 1, at: 5 }, r.results, owner), "broken");
  assert.equal(judge({ form: "stand", by: 0, at: 4 }, r.results, owner), "broken");
  assert.equal(judge({ form: "stand", by: 0, at: 2 }, r.results, owner), "kept");
  assert.equal(judge({ form: "no-strike", by: 0, to: 1 }, r.results, owner), "broken");
  assert.equal(judge({ form: "no-strike", by: 1, to: 0 }, r.results, owner), "kept");
  assert.equal(judge({ form: "carry", by: 0, to: 1, a: 1, b: 10 }, r.results, owner), "void");
});

/** Bots to the end; each move goes through the match and must be in the full list of legal moves. */
function botGame(seats, style, tiers, seed, check = true) {
  const m = start(seats, style, seed), d = chance(seedState(`bots/${seed}`));
  while (m.turn !== null && m.list.length < 3000) {
    const move = choose(m.position, d, tiers[m.turn % tiers.length]);
    // a word is checked by the quick check, which the talk test holds to the full list: the full list of words is long
    if (check) assert.ok(move.do === "promise" || move.do === "ask" ? margins.allows(m.position, move) : m.isLegal(move), `a bot chose a move that is not in the list: ${canon(move)}`);
    m.play(move);
  }
  return m;
}

test("bots play legal, complete games at 3, 4 and 5 seats, in both rule sets, and the games replay", () => {
  let supports = 0, seasons = 0;
  for (const seats of [3, 4, 5]) for (const style of ["classic", "ours"]) {
    const m = botGame(seats, style, ["easy", "normal", "hard"], `${seats}/${style}`);
    assert.equal(m.turn, null, "it ends");
    const r = m.result;
    assert.ok(r.winners.length >= 1 && r.winners.every((w) => w >= 0 && w < seats) && r.why);
    assert.deepEqual(m.legal(), []);
    replays(m, [margins]);
    seasons += m.position.round;
    supports += m.list.filter((x) => x.do === "order" && x.kind === "support").length;
  }
  assert.ok(supports > seasons / 4, `bots support (${supports} supports in ${seasons} seasons)`);
});

test("a game replays move by move, and travels by link", () => {
  const m = botGame(3, "classic", ["normal"], "link", false);
  sameEachStep(m);
  const back = unpackGame(packGame(m, ["host", "normal", "normal"], [[0, 0], [1, 1], [2, 2]]), [margins]);
  assert.equal(back.match.fingerprint(), m.fingerprint());
});

test("bots are blind: what others have written this season never changes a bot's sheet", () => {
  const d = chance(seedState("blind"));
  for (const tier of TIERS) {
    const m = botGame(4, "classic", [tier], `blind/${tier}`, false), list = m.list;
    for (let i = 0; i < list.length; i += 7) {
      const p = m.at(i);
      if (p.over || p.seat === 0) continue;
      const fake = structuredClone(p);
      for (let s = 0; s < p.seat; s++) {
        fake.orders[s] = [];
        for (const at of mineOf(p, s)) if (d.below(2)) fake.orders[s].push(d.pick(ordersAt(p, at)));
      }
      assert.equal(canon(choose(fake, d, tier)), canon(choose(p, d, tier)), `move ${i}`);
    }
  }
});

test("bots treat every seat alike: no seat number wins by itself", () => {
  // the same sheet for every seat, turned to its own march, keeps the whole game turned alike to the end
  const seats = 4, m = start(seats, "classic", "fair"), b = boardOf(m.position), rot = (i, k) => (i + 8 * k) % b.n;
  while (m.turn !== null) {
    if (m.position.stage === "talk") { quiet(m); continue; }
    const p = m.position, mine = plan(p, 0, "normal");
    for (let s = 0; s < seats; s++) {
      for (const o of mine) {
        const x = { do: "order", ...o, at: rot(o.at, s) };
        if (o.to !== undefined) x.to = rot(o.to, s);
        if (o.seat !== undefined) x.seat = (o.seat + s) % seats;
        if (o.a !== undefined) { x.a = Math.min(rot(o.a, s), rot(o.b, s)); x.b = Math.max(rot(o.a, s), rot(o.b, s)); }
        m.play(x);
      }
      m.play({ do: "done" });
    }
    const q = m.position;
    for (let i = 0; i < b.n; i++) for (let s = 1; s < seats; s++) {
      assert.equal(q.str[rot(i, s)], q.str[i]);
      assert.equal(q.owner[rot(i, s)], q.owner[i] < 0 ? NONE : (q.owner[i] + s) % seats);
    }
  }
  assert.deepEqual(m.result.winners, [0, 1, 2, 3]);
  for (let s = 0; s < seats; s++) assert.ok(alive(m.position, s));
});

test("bots bargain, and keep or break their promises exactly as their characters' lines say", () => {
  assert.equal(CAST.length, 6);
  const tally = Object.fromEntries(CAST.map((c) => [c.id, { kept: 0, broken: 0 }]));
  let pledges = 0, bargains = 0;
  for (const seats of [3, 4, 5]) for (let g = 0; g < 2; g++) {
    const m = botGame(seats, g % 2 ? "ours" : "classic", ["normal", "hard"], `word/${seats}/${g}`, false);
    assert.equal(new Set(m.position.cast).size, seats, "no two seats share a character");
    const again = start(seats, g % 2 ? "ours" : "classic", `word/${seats}/${g}`);
    for (const move of m.list) {
      const before = again.position;
      again.play(move);
      const after = again.position;
      if (after.ledger.length === before.ledger.length) continue;
      for (const e of after.ledger.slice(before.ledger.length)) {
        pledges++;
        if (e.to >= 0 && before.talk[e.to]?.some((w) => w.say === "ask" && w.to === e.by)) bargains++;
        const c = characterOf(before, e.by).id, r = e.to >= 0 ? record(before, e.to, e.by) : null;
        if (e.mark !== "void") tally[c][e.mark]++;
        if (e.mark !== "broken") continue;
        assert.notEqual(c, "steward", "the Steward keeps every promise");
        if (c === "herald") assert.ok(e.to >= 0, "the Herald never breaks a public pledge");
        if (c === "merchant") assert.ok(r && r.broken > 0, "the Merchant breaks only to a seat that broke a promise to it");
        if (c === "elder") assert.ok(r && r.broken >= 2, "the Elder forgives one");
        if (c === "climber") assert.ok(e.to >= 0 && portsOf(before, e.to) > portsOf(before, e.by), "the Climber breaks only to a seat that leads it");
      }
    }
  }
  assert.ok(pledges > 100 && bargains > 20, `bots talk: ${pledges} promises, ${bargains} from bargains`);
  assert.ok(tally.steward.kept > 0 && tally.gambler.kept + tally.gambler.broken > 0);
});

test("easy bots say nothing and accept nothing; every character's line is shown in plain words", () => {
  const m = start(3), d = chance(seedState("easy"));
  assert.deepEqual(choose(m.position, d, "easy"), { do: "done" });
  for (const c of CAST) assert.match(c.line, /^[A-Z][^\u2014]*\.$/);
});
