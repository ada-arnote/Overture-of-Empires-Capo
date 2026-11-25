// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { chance, createMatch, openSave, seedState } from "../src/core/index.js";
import { hexBoard, joined } from "../src/games/hex.js";
import { NONE, boardOf, cellsOf, density, goalOf, growth, inch, poolLimit } from "../src/games/inch/rules.js";
import { TIERS, choose } from "../src/games/inch/bot.js";
import { playOne } from "../tools/play.mjs";

const G = { game: inch, choose, score: cellsOf };
const start = (seats = 2, seed = "t") => createMatch(inch, { seed, options: { seats, style: "ours" } });
/** A position with named cells given away, for one rule at a time. */
const set = (p, change) => ({ ...structuredClone(p), cost: p.cost.map(() => 1), ...change });

test("the board: 61 cells, neighbours agree, opposite corners are far apart", () => {
  const b = hexBoard(4);
  assert.equal(b.size, 61);
  b.near.forEach((list, i) => { assert.ok(list.length >= 3 && list.length <= 6); for (const m of list) assert.ok(b.near[m].includes(i)); });
  assert.equal(new Set(b.corners).size, 6);
  for (const c of b.corners) assert.equal(b.near[c].length, 3);
  assert.equal(joined(b.near, 0, () => true).length, 61);
  assert.deepEqual(joined(b.near, 0, () => false), []);
});
test("growth is the stated formula for every size, in whole numbers", () => {
  for (let c = 0; c <= 61; c++) for (const pool of [0, 4, 5, 60]) assert.equal(growth({ classic: false, pool: [pool] }, 0, c), 3 + Math.floor(1.5 * Math.sqrt(c) + 1e-9) + Math.floor(pool / 8));
});
test("setup: fair homes, home ground is easy, the first seat has already grown", () => {
  for (const seats of [2, 3]) for (let s = 0; s < 30; s++) {
    const p = start(seats, "s" + s).position;
    assert.equal(new Set(p.home).size, seats);
    p.home.forEach((h, k) => { assert.equal(p.owner[h], k); assert.equal(p.cost[h], 1); assert.ok(boardOf().corners.includes(h)); });
    assert.equal(p.pool[0], Math.min(poolLimit(1), 6 + growth({ pool: [6] }, 0, 1)));
    assert.equal(p.pool[1], 6);
  }
});
test("a pour takes the cheapest joined cells and returns what is left", () => {
  const m = start(), p = m.position;
  const { position, events } = inch.apply(set(p, {}), { do: "pour", to: NONE, share: "all" });
  const e = events[0];
  assert.equal(e.kind, "pour"); assert.equal(e.spent, e.taken.length); assert.equal(position.pool[0], p.pool[0] - e.spent);
  assert.equal(joined(boardOf().near, p.home[0], (i) => position.owner[i] === 0).length, e.taken.length + 1);
});
test("rough ground costs two, a surrounded cell half", () => {
  const b = boardOf(), p = start().position, mid = 30, ring = b.near[mid];
  const owner = p.owner.map(() => NONE); for (const c of ring) owner[c] = 0; owner[b.corners[3]] = 1;
  const q = set(p, { owner, home: [ring[0], b.corners[3]], pool: [1, 6] }); q.cost = q.cost.map(() => 2);
  const e = inch.apply(q, { do: "pour", to: NONE, share: "all" }).events[0];
  assert.deepEqual(e.taken, [mid]); assert.equal(e.spent, 1);
});
test("a rival's land costs more when their strength is dense, and each cell drains them", () => {
  const b = boardOf(), p = start().position, a = 30, x = b.near[a][0], owner = p.owner.map(() => NONE);
  owner[a] = 0; owner[x] = 1; owner[b.near[x].find((n) => n !== a && !b.near[a].includes(n))] = 1;
  const home1 = owner.lastIndexOf(1) === x ? owner.indexOf(1) : owner.lastIndexOf(1);
  const q = set(p, { owner, home: [a, home1], pool: [20, 7] });
  assert.equal(density(q, 1), 4);
  const { position, events } = inch.apply(q, { do: "pour", to: 1, share: "third" });
  assert.deepEqual(events[0].taken, [x]); assert.equal(events[0].spent, 1 + 1 + 4); assert.ok(position.pool[1] < 7 + growth({ pool: [0, 3] }, 1, 1) + 1);
});
test("a lost home moves to the largest group; with no land left the seat is out and the game ends", () => {
  const b = boardOf(), p = start().position, a = 30, x = b.near[a][0], owner = p.owner.map(() => NONE); owner[a] = 0; owner[x] = 1;
  const one = inch.apply(set(p, { owner: [...owner], home: [a, x], pool: [18, 0] }), { do: "pour", to: 1, share: "all" });
  assert.equal(one.position.home[1], NONE); assert.deepEqual(one.position.over.winners, [0]);
  const far = b.corners[0]; owner[far] = 1;
  const two = inch.apply(set(p, { owner, home: [a, x], pool: [5, 0] }), { do: "pour", to: 1, share: "all" });
  assert.equal(two.position.home[1], far); assert.equal(two.position.over, null);
});
test("cut-off land falls at the start of that seat's turn", () => {
  const b = boardOf(), p = start().position, owner = p.owner.map(() => NONE), [h0, , , h1] = b.corners; owner[h0] = 0; owner[h1] = 1; owner[30] = 1;
  const { position, events } = inch.apply(set(p, { owner, home: [h0, h1], pool: [0, 6] }), { do: "wait" });
  assert.equal(position.owner[30], NONE); assert.ok(events.some((e) => e.kind === "cut" && e.seat === 1 && e.cells[0] === 30));
});
test("the first seat of a round rotates", () => {
  const m = start(3), order = []; for (let i = 0; i < 9; i++) { order.push(m.turn); m.play({ do: "wait" }); }
  assert.deepEqual(order, [0, 1, 2, 1, 2, 0, 2, 0, 1]);
});
test("a game nobody presses ends after its rounds, and a tie names both", () => {
  const m = createMatch(inch, { seed: "w", options: { rounds: 10, style: "ours" } }); while (m.turn !== null) m.play({ do: "wait" });
  assert.equal(m.list.length, 20); assert.deepEqual(m.result.winners, [0, 1]);
});
test("the goal is more than half at two seats, and is reachable", () => { assert.equal(goalOf(start(2).position), 34); assert.equal(goalOf(start(3).position), 28); });
test("every offered pour takes something, and no two offers are the same amount at one target", () => {
  for (let s = 0; s < 40; s++) {
    const m = start(2 + (s % 2), "o" + s), d = chance(seedState("o" + s));
    while (m.turn !== null) {
      const seen = new Set();
      for (const mv of m.legal()) if (mv.do === "pour") { const e = inch.apply(m.position, mv).events[0]; assert.ok(e.taken.length); const k = mv.to + ":" + mv.share; assert.ok(!seen.has(k)); seen.add(k); }
      m.play(d.pick(m.legal()));
    }
  }
});
test("random play: pools stay in range, owners are real, homes are owned, and saves replay", () => {
  for (let s = 0; s < 60; s++) {
    const seats = 2 + (s % 2), m = start(seats, "r" + s), d = chance(seedState("r" + s));
    while (m.turn !== null) {
      m.play(d.pick(m.legal())); const p = m.position;
      p.pool.forEach((x) => assert.ok(Number.isInteger(x) && x >= 0)); p.owner.forEach((o) => assert.ok(o >= NONE && o < seats));
      p.home.forEach((h, k) => assert.ok(h === NONE || p.owner[h] === k)); if (!p.over) assert.notEqual(p.home[p.seat], NONE);
    }
    assert.equal(openSave(m.save(), [inch]).match.fingerprint(), m.fingerprint());
  }
});
test("bots only choose legal moves, and the same seed plays the same game", () => {
  for (const tier of TIERS) for (const seats of [2, 3]) { const run = () => playOne(G, { seed: "b", seats, tiers: Array(seats).fill(tier), check: true }); assert.deepEqual(run(), run()); }
});
const classic = (seats = 2, seed = "c") => createMatch(inch, { seed, options: { seats, style: "classic" } });
test("classic: a wider map, land never falls for being cut off, and no home to storm", () => {
  const p = classic().position, b = boardOf(p); assert.equal(b.size, 91); assert.equal(goalOf(p), 55); assert.equal(growth({ ...p, round: 6 }, 0, 10), 3 + 3 + 3); assert.equal(p.rounds, 40);
  const owner = p.owner.map(() => NONE), [h0, , , h1] = b.corners; owner[h0] = 0; owner[h1] = 1; owner[45] = 1;
  const q = inch.apply({ ...structuredClone(p), owner, home: [h0, h1], pool: [0, 6], seat: 0 }, { do: "wait" }).position; assert.equal(q.owner[45], 1);
  const a = 45, x = b.near[a][0], own2 = p.owner.map(() => NONE); own2[a] = 0; own2[x] = 1; own2[h1] = 1;
  const e = inch.apply({ ...structuredClone(p), cost: p.cost.map(() => 1), owner: own2, home: [a, x], pool: [2, 0], seat: 0 }, { do: "pour", to: 1, share: "all" }).events[0]; assert.deepEqual(e.taken, [x]); assert.equal(e.spent, 2);
});
test("classic: four shares, random games replay, and the two styles never mix", () => {
  assert.ok(classic().legal().every((m) => m.do === "wait" || ["quarter", "half", "most", "all"].includes(m.share)));
  for (let s = 0; s < 12; s++) { const m = classic(2 + (s % 2), "k" + s), d = chance(seedState("k" + s)); while (m.turn !== null) m.play(d.pick(m.legal())); assert.equal(openSave(m.save(), [inch]).match.fingerprint(), m.fingerprint()); }
  const f = JSON.parse(classic(2, "z").save()); f.options.style = "ours"; assert.throws(() => openSave(JSON.stringify(f), [inch]));
});
