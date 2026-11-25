// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { chance, createMatch, openSave, seedState } from "../src/core/index.js";
import { areaBoard, steps } from "../src/games/areas.js";
import { joined } from "../src/games/hex.js";
import { ATTACK_DICE, DEFEND_DICE, NONE, amounts, banners, bonusOf, boardOf, cellsOf, compare, goalOf, muster, odds, wholeOf } from "../src/games/banners/rules.js";
import { TIERS, choose } from "../src/games/banners/bot.js";
import { playOne } from "../tools/play.mjs";

const G = { game: banners, choose, score: cellsOf };
const start = (seats = 3, seed = "t") => createMatch(banners, { seed, options: { seats } });
/** A position with a bare board: hand out places as [province, seat, strength]. */
function made(list, over = {}) {
  const p = structuredClone(start(over.seats || 2).position);
  Object.assign(p, { owner: p.owner.map(() => NONE), str: p.str.map(() => 3), seat: 0, step: 0, round: 1, phase: "attack", left: 0, took: 0, pend: null, over: null, banners: Array(p.seats).fill(0) });
  for (const [i, s, n] of list) { p.owner[i] = s; p.str[i] = n; }
  return Object.assign(p, over);
}
const loaded = (...faces) => ({ die: () => faces.shift() });
const two = boardOf(start(2).position), [A, B] = [0, two.near[0][0]], far = two.near.findIndex((n, i) => i !== A && i !== B && !n.includes(A) && !n.includes(B));

test("a land: 36 provinces in one piece, every border shared, five whole lands, fair starts, the same every time", () => {
  for (let k = 0; k < 30; k++) {
    const b = areaBoard(k), count = Array(36).fill(0);
    b.of.forEach((o) => { if (o >= 0) count[o]++; });
    assert.ok(Math.min(...count) >= 5);
    b.near.forEach((n, i) => { assert.ok(n.length >= 2); assert.ok(!n.includes(i)); assert.equal(new Set(n).size, n.length); for (const m of n) assert.ok(b.near[m].includes(i)); });
    assert.equal(joined(b.dry, 0, () => true).length, 36, "joined by land alone");
    for (let r = 0; r < 5; r++) { const mine = b.region.flatMap((x, i) => (x === r ? [i] : [])); assert.equal(mine.length, b.sizes[r]); assert.equal(joined(b.dry, mine[0], (i) => b.region[i] === r).length, mine.length); }
    b.mid.forEach((c, i) => assert.equal(b.of[c], i));
    assert.ok(b.links.length >= 1); b.links.forEach(([x, y], i) => { assert.ok(b.near[x].includes(y) && !b.dry[x].includes(y)); assert.deepEqual(b.ends[i].map((c) => b.of[c]), [x, y]); });
    for (const n of [2, 3, 4]) { const s = b.starts[n]; assert.equal(new Set(s).size, n); for (const a of s) for (const c of s) if (a !== c) assert.ok(steps(b.near, [a])[c] >= 3); }
    assert.equal(new Set(b.names).size, 36);
  }
  const one = JSON.stringify(areaBoard(7)); for (let k = 100; k < 145; k++) areaBoard(k); // push it out of memory
  assert.equal(JSON.stringify(areaBoard(7)), one);
});
test("dice: highest meets highest, the lower loses one, a tie costs both", () => {
  assert.deepEqual(compare([6, 5, 1], [5, 5]), [1, 2]);
  assert.deepEqual(compare([3], [3, 1, 1]), [1, 1]);
  assert.deepEqual(compare([2, 2, 2, 2], [6, 6, 6]), [3, 0]);
  assert.deepEqual(compare([1, 6], [2]), [0, 1], "order does not matter");
});
test("the odds shown are the odds thrown", () => {
  assert.equal(odds(0, 3), 0); assert.equal(odds(3, 0), 1000000);
  assert.equal(odds(1, 1), 416666, "15 of 36: a tie leaves nobody to walk in");
  for (let d = 1; d < 8; d++) for (let a = 1; a < 12; a++) { assert.ok(odds(a + 1, d) >= odds(a, d)); assert.ok(odds(a, d + 1) <= odds(a, d)); }
  const dice = chance(seedState("odds"));
  for (const [att, def] of [[3, 3], [6, 3], [8, 7]]) {
    let won = 0;
    for (let i = 0; i < 4000; i++) if (banners.apply(made([[A, 0, att + 1], [B, 1, def], [far, 1, 1]]), { do: "attack", from: A, to: B, roll: "all" }, dice).events[0].won) won++;
    assert.ok(Math.abs(won / 4000 - odds(att, def) / 1000000) < 0.03, `${att} v ${def}: ${won / 4000}`);
  }
});
test("muster: three, one for each three provinces, whole lands, and a set of banners", () => {
  const b = two, land = b.region.flatMap((r, i) => (r === 2 ? [i] : [])), p = made(land.map((i) => [i, 0, 1]), { banners: [3, 0] }), m = muster(p, 0);
  assert.deepEqual(wholeOf(p, 0), [2]); assert.equal(bonusOf(b, 2), Math.max(1, Math.floor(b.sizes[2] / 3)));
  assert.equal(m.all, 3 + Math.floor(land.length / 3) + bonusOf(b, 2) + 3);
});
test("placing uses up what was mustered, only on your own land, then you attack", () => {
  const p = start().position, mine = p.owner.indexOf(p.seat), q = banners.apply(p, { do: "place", at: mine, n: 1 }).position;
  assert.equal(p.left, 3); assert.equal(q.left, 2); assert.equal(q.phase, "place"); assert.ok(banners.moves(q).every((m) => m.do === "place" && q.owner[m.at] === q.seat));
  assert.equal(banners.apply(q, { do: "place", at: mine, n: 2 }).position.phase, "attack");
});
test("an attack needs 2 strength and a neighbour that is not yours", () => {
  const p = made([[A, 0, 1], [B, 0, 5], [far, 1, 2]]), list = banners.moves(p).filter((m) => m.do === "attack");
  assert.ok(list.length && list.every((m) => m.from === B && two.near[B].includes(m.to) && m.to !== A));
});
test("a volley throws at most four against three, and never the last one", () => {
  const p = made([[A, 0, 9], [B, 1, 8], [far, 1, 1]]), { events, position } = banners.apply(p, { do: "attack", from: A, to: B, roll: "once" }, loaded(6, 6, 6, 6, 1, 1, 1));
  assert.equal(events[0].rolls[0][0].length, ATTACK_DICE); assert.equal(events[0].rolls[0][1].length, DEFEND_DICE);
  assert.equal(position.str[B], 5); assert.equal(position.str[A], 9); assert.equal(position.phase, "attack");
  const small = banners.apply(made([[A, 0, 2], [B, 1, 1], [far, 1, 1]]), { do: "attack", from: A, to: B, roll: "once" }, loaded(5, 5));
  assert.equal(small.position.str[A], 1); assert.equal(small.position.str[B], 1, "both would fall, so the defender holds on"); assert.equal(small.position.owner[B], 1);
});
test("winning moves one in, offers the rest, and earns one banner a turn however much is taken", () => {
  const a = banners.apply(made([[A, 0, 5], [B, 1, 1], [far, 1, 1]]), { do: "attack", from: A, to: B, roll: "once" }, loaded(6, 6, 6, 6, 1));
  assert.equal(a.position.owner[B], 0); assert.equal(a.position.str[B], 1); assert.equal(a.position.str[A], 4); assert.equal(a.position.phase, "occupy");
  assert.deepEqual(banners.moves(a.position).map((m) => m.n), [0, 1, 2, 3]);
  const c = banners.apply(a.position, { do: "occupy", n: 2 }).position; assert.equal(c.str[B], 3); assert.equal(c.str[A], 2);
  const d = banners.apply({ ...c, took: 4 }, { do: "end" }); assert.equal(d.position.banners[0], 1); assert.equal(d.position.seat, 1);
});
test("putting a seat out hands over its banners, and it is passed over after", () => {
  const p = made([[A, 0, 5], [B, 1, 1], [far, 2, 4]], { seats: 3, banners: [0, 2, 0] }), q = banners.apply(p, { do: "attack", from: A, to: B, roll: "once" }, loaded(6, 6, 6, 6, 1)).position;
  assert.deepEqual(q.banners, [2, 0, 0]); assert.equal(q.over, null);
  assert.equal(banners.apply(banners.apply(q, { do: "occupy", n: 0 }).position, { do: "end" }).position.seat, 2);
});
test("the last one left wins; so does holding enough; three banners are handed in", () => {
  const q = banners.apply(made([[A, 0, 5], [B, 1, 1]]), { do: "attack", from: A, to: B, roll: "once" }, loaded(6, 6, 6, 6, 1)).position;
  assert.deepEqual(q.over, { winners: [0], why: "the only one left" });
  const rest = two.near.map((_, i) => i).filter((i) => i !== B && i !== far).slice(0, goalOf(made([])) - 1).filter((i) => i !== A);
  const r = banners.apply(made([[A, 0, 5], ...rest.map((i) => [i, 0, 1]), [far, 1, 3]]), { do: "attack", from: A, to: B, roll: "once" }, loaded(6, 6, 6, 6, 1, 1, 1));
  assert.equal(goalOf(r.position), 24); assert.equal(r.position.str[B], 0 + (r.position.owner[B] === 0 ? 1 : 0));
  const s = banners.apply(made([[A, 0, 2], [far, 1, 2]], { banners: [0, 4] }), { do: "end" }).position; assert.equal(s.banners[1], 1); assert.equal(s.left, 3 + 0 + 3);
});
test("the one move goes between joined provinces of yours, leaves one behind, and ends the turn", () => {
  const p = made([[A, 0, 6], [B, 0, 1], [far, 1, 2]]), list = banners.moves(p).filter((m) => m.do === "move");
  assert.deepEqual(list.map((m) => m.n), [1, 2, 3, 4, 5]); assert.ok(list.every((m) => m.from === A && m.to === B));
  const q = banners.apply(p, { do: "move", from: A, to: B, n: 5 }).position; assert.equal(q.str[A], 1); assert.equal(q.str[B], 6); assert.equal(q.seat, 1);
});
test("amounts: every one when few, sensible steps when many, always the whole", () => {
  assert.deepEqual(amounts(3), [1, 2, 3]); for (const n of [13, 40, 99]) { const a = amounts(n); assert.equal(a[0], 1); assert.equal(a.at(-1), n); assert.equal(new Set(a).size, a.length); }
});
test("a whole game is legal, replays to the same end, and every tier finishes", () => {
  for (const seats of [2, 3, 4]) for (const tier of TIERS) playOne(G, { seed: `g${seats}${tier}`, seats, tiers: Array(seats).fill(tier), style: "classic", check: true });
  const m = start(); const dice = chance(seedState("x")); for (let i = 0; i < 40 && m.turn !== null; i++) m.play(choose(m.position, dice, "normal"));
  assert.equal(openSave(m.save(), [banners]).match.fingerprint(), m.fingerprint());
});
