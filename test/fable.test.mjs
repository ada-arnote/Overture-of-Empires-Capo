// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { chance, createMatch, openSave, seedState } from "../src/core/index.js";
import { joined } from "../src/games/hex.js";
import { ACTIONS, NONE, UPKEEP, act, boardOf, cellsOf, defence, fable, goalOf, groupsOf, landOf, nameOf, plunder, raiseOf, territories } from "../src/games/fable/rules.js";
import { TIERS, choose } from "../src/games/fable/bot.js";
import { playOne } from "../tools/play.mjs";

const G = { game: fable, choose, score: cellsOf };
const b = boardOf(), start = (seats = 2, seed = "t") => createMatch(fable, { seed, options: { seats, style: "ours" } });
const zero = () => b.cells.map(() => 0);
/** A bare island: name whose cells, halls, purses and units. */
function made({ land = [[], []], halls = [], units = [], seat = 0, left = ACTIONS, moved = [] }) {
  const p = structuredClone(start(land.length).position);
  Object.assign(p, { water: zero(), owner: b.cells.map(() => NONE), unit: zero(), moved: zero(), hall: zero(), purse: zero(), seat, left, step: 0, round: seat + 1 });
  land.forEach((list, s) => list.forEach((c) => { p.owner[c] = s; }));
  for (const [c, n] of halls) { p.hall[c] = 1; p.purse[c] = n; }
  for (const [c, n] of units) p.unit[c] = n;
  for (const c of moved) p.moved[c] = 1;
  return p;
}
const row = (r) => b.cells.map((c, i) => [c, i]).filter(([c]) => c[1] === r).sort((x, y) => x[0][0] - y[0][0]).map(([, i]) => i);
const mid = row(0), up = row(-1); // 7 cells in a line, and the 6 above them

test("the island: 32 land cells in one piece, equal starts, every cell has its own name", () => {
  for (const seats of [2, 3]) for (let s = 0; s < 40; s++) {
    const p = start(seats, "i" + s).position, first = p.water.indexOf(0);
    assert.equal(landOf(p), 32);
    assert.equal(joined(b.near, first, (m) => !p.water[m]).length, 32);
    for (let k = 0; k < seats; k++) { assert.equal(cellsOf(p, k), 3); assert.equal(groupsOf(p, k).length, 1); assert.equal(territories(p, k)[0].purse, k === 0 ? 9 : 6); }
  }
  assert.equal(new Set(b.cells.map((_, i) => nameOf(null, i))).size, 37);
  assert.equal(goalOf(start(2).position), 20); assert.equal(goalOf(start(3).position), 15);
});
test("a territory earns one a hex and pays 1, 3 or 6 for its units", () => {
  assert.deepEqual(UPKEEP, [0, 1, 3, 6]);
  const p = made({ land: [mid.slice(0, 5), [up[5], up[4]]], halls: [[mid[0], 4], [up[5], 0]], units: [[mid[2], 2]], seat: 1 });
  const q = fable.apply(p, { do: "end" }).position;
  assert.equal(q.seat, 0); assert.equal(q.purse[mid[0]], 4 + 5 - 3);
});
test("a territory that cannot pay loses all its units and has nothing left", () => {
  const p = made({ land: [mid.slice(0, 3), [up[5], up[4]]], halls: [[mid[0], 1], [up[5], 0]], units: [[mid[1], 3], [mid[2], 1]], seat: 1 });
  const { position: q, events } = fable.apply(p, { do: "end" });
  assert.equal(q.unit.reduce((a, x) => a + x, 0), 0); assert.equal(q.purse[mid[0]], 0); assert.deepEqual(events.find((e) => e.kind === "starve").cells.sort(), [mid[1], mid[2]].sort());
});
test("a lone unit disbands; a lone hex earns nothing and has no hall", () => {
  const p = made({ land: [[mid[0], mid[1], mid[5]], [up[5], up[4]]], halls: [[mid[0], 3], [up[5], 0]], units: [[mid[5], 1]], seat: 1 });
  const { position: q, events } = fable.apply(p, { do: "end" });
  assert.equal(q.unit[mid[5]], 0); assert.ok(events.some((e) => e.kind === "stranded")); assert.equal(territories(q, 0).length, 1);
});
test("raising costs 5 and can stand, strengthen, or take a bare neighbour", () => {
  const p = made({ land: [mid.slice(0, 3), [up[5], up[4]]], halls: [[mid[0], 17], [up[5], 0]] });
  const a = act(p, { do: "raise", hall: mid[0], to: mid[2] }).position; assert.equal(a.purse[mid[0]], 17 - raiseOf(p)); assert.equal(a.unit[mid[2]], 1); assert.equal(a.left, ACTIONS - 1);
  const c = act(a, { do: "raise", hall: mid[0], to: mid[2] }).position; assert.equal(c.unit[mid[2]], 2);
  const d = act(c, { do: "raise", hall: mid[0], to: mid[3] }).position; assert.equal(d.owner[mid[3]], 0); assert.equal(d.moved[mid[3]], 1);
  const poor = made({ land: [mid.slice(0, 3), [up[5]]], halls: [[mid[0], 4]] }); assert.ok(!fable.moves(poor).some((m) => m.do === "raise"));
});
test("defence: a unit guards itself and its neighbours, a hall counts as one, and equal rank is not enough", () => {
  const p = made({ land: [mid.slice(0, 3), mid.slice(3)], halls: [[mid[0], 0], [mid[6], 0]], units: [[mid[2], 2], [mid[4], 2]] });
  assert.equal(defence(p, mid[3]), 2); assert.equal(defence(p, mid[5]), 2); assert.equal(defence(p, mid[6]), 1);
  assert.ok(!fable.moves(p).some((m) => m.to === mid[3]));
  p.unit[mid[2]] = 3; assert.ok(fable.moves(p).some((m) => m.do === "move" && m.to === mid[3]));
});
test("a unit moves once a turn, anywhere in its territory or over its edge, and never onto a hall", () => {
  const p = made({ land: [mid.slice(0, 4), [up[5], up[4]]], halls: [[mid[0], 0], [up[5], 0]], units: [[mid[1], 1]] });
  const to = fable.moves(p).filter((m) => m.do === "move").map((m) => m.to); assert.ok(to.includes(mid[3]) && to.includes(mid[4]) && !to.includes(mid[0]));
  const q = act(p, { do: "move", from: mid[1], to: mid[3] }).position; assert.equal(q.unit[mid[3]], 1); assert.ok(!fable.moves(q).some((m) => m.from === mid[3]));
});
test("merging adds ranks, up to three", () => {
  const p = made({ land: [mid.slice(0, 4), [up[5]]], halls: [[mid[0], 0]], units: [[mid[1], 1], [mid[2], 2], [mid[3], 2]] });
  assert.equal(act(p, { do: "move", from: mid[1], to: mid[2] }).position.unit[mid[2]], 3);
  assert.ok(!fable.moves(p).some((m) => m.from === mid[2] && m.to === mid[3]));
});
test("cutting a territory: the part without the hall gets a new one and no money", () => {
  const foe = up[2], p = made({ land: [[foe, up[1]], mid.slice(0, 6)], halls: [[up[1], 0], [mid[0], 12]], units: [[foe, 1]] });
  const cut = mid[3]; assert.ok(b.near[foe].includes(cut) || b.near[up[1]].includes(cut), "the cut cell is beside the attacker");
  const { position: q, events } = act(p, { do: "move", from: foe, to: cut });
  const t = territories(q, 1); assert.equal(t.length, 2); assert.deepEqual(t.map((x) => x.purse).sort((x, y) => x - y), [0, 12]); assert.ok(events.some((e) => e.kind === "split"));
});
test("joining two territories pools their purses under the richer hall", () => {
  const p = made({ land: [[mid[0], mid[1], mid[3], mid[4]], [up[5]]], halls: [[mid[0], 7], [mid[4], 9]] });
  const q = act(p, { do: "raise", hall: mid[4], to: mid[2] }).position, t = territories(q, 0);
  assert.equal(t.length, 1); assert.equal(t[0].hall, mid[0]); assert.equal(t[0].purse, 7 + 9 - 5);
});
test("taking a hall: its money is won or lost by the one rule; the land left gets a new empty hall", () => {
  const p = made({ land: [[up[0], up[1]], mid.slice(0, 4)], halls: [[up[0], 0], [mid[1], 20]], units: [[up[1], 2]] });
  const { position: q, events } = act(p, { do: "move", from: up[1], to: mid[1] });
  const won = plunder(20); assert.equal(events[0].lost, 20 - won); assert.equal(territories(q, 0)[0].purse, won); assert.equal(territories(q, 1).reduce((n, t) => n + t.purse, 0), 0);
});
test("the turn passes after three actions or when ended, and the first seat rotates", () => {
  const m = start(3), seats = []; for (let i = 0; i < 9; i++) { seats.push(m.turn); m.play({ do: "end" }); }
  assert.deepEqual(seats, [0, 1, 2, 1, 2, 0, 2, 0, 1]);
  const p = made({ land: [mid.slice(0, 4), [up[5], up[4]]], halls: [[mid[0], 30], [up[5], 0]] }); let q = p; for (const to of [mid[1], mid[2], mid[3]]) { assert.equal(q.seat, 0); q = fable.apply(q, { do: "raise", hall: mid[0], to }).position; } assert.equal(q.seat, 1);
});
test("reaching the goal wins at once, in the middle of a turn", () => {
  const all = b.cells.map((_, i) => i), p = made({ land: [all.slice(0, 22), [all[36], all[35]]], halls: [[0, 9], [36, 0]] });
  const to = fable.moves(p).find((m) => m.do === "raise" && p.owner[m.to] === NONE); const { position: q } = fable.apply(p, to); assert.deepEqual(q.over.winners, [0]); assert.equal(q.left, 2);
});
test("an idle game ends after its rounds in a tie", () => { const m = createMatch(fable, { seed: "w", options: { rounds: 10, style: "ours" } }); while (m.turn !== null) m.play({ do: "end" }); assert.deepEqual(m.result.winners, [0, 1]); });
test("random play: one hall a territory, money never negative, ranks in range, saves replay", () => {
  for (let s = 0; s < 40; s++) {
    const seats = 2 + (s % 2), m = start(seats, "r" + s), d = chance(seedState("r" + s));
    while (m.turn !== null) {
      m.play(d.pick(m.legal())); const p = m.position;
      for (let k = 0; k < seats; k++) for (const g of groupsOf(p, k)) assert.equal(g.filter((c) => p.hall[c]).length, g.length > 1 ? 1 : 0);
      p.owner.forEach((o, c) => { assert.ok(p.purse[c] >= 0 && p.unit[c] >= 0 && p.unit[c] <= 3); if (p.water[c]) assert.equal(o, NONE); if (o === NONE) assert.equal(p.unit[c] + p.hall[c], 0); assert.ok(!(p.hall[c] && p.unit[c])); if (!p.hall[c]) assert.equal(p.purse[c], 0); });
    }
    assert.equal(openSave(m.save(), [fable]).match.fingerprint(), m.fingerprint());
  }
});
test("bots only choose legal moves, and the same seed plays the same game", () => { for (const tier of TIERS) for (const seats of [2, 3]) { const run = () => playOne(G, { seed: "b", seats, tiers: Array(seats).fill(tier), check: true }); assert.deepEqual(run(), run()); } });
const classic = (seats = 2, seed = "c") => createMatch(fable, { seed, options: { seats, style: "classic" } });
test("classic: a bigger island, dealt evenly, every territory with a little money, and any number of actions", () => {
  for (const seats of [2, 3]) for (let s = 0; s < 20; s++) {
    const p = classic(seats, "d" + s).position; assert.equal(landOf(p), 48); const n = Array.from({ length: seats }, (_, k) => cellsOf(p, k)); assert.ok(n.every((x) => x === n[0])); assert.equal(n[0] * seats, 48 - (48 % seats));
    for (let k = 0; k < seats; k++) for (const g of groupsOf(p, k)) assert.equal(g.filter((c) => p.hall[c]).length, g.length > 1 ? 1 : 0);
    assert.ok(p.left > 50); assert.equal(p.rounds, 40);
  }
  assert.equal(new Set(boardOf({ classic: true }).cells.map((_, i) => nameOf({ classic: true }, i))).size, 61);
});
test("classic: bot games finish and replay, and the two styles never mix", () => {
  for (let s = 0; s < 4; s++) playOne(G, { seed: "k" + s, seats: 2 + (s % 2), tiers: ["normal", "easy", "normal"], style: "classic", check: true });
  const f = JSON.parse(classic(2, "z").save()); f.options.style = "ours"; assert.throws(() => openSave(JSON.stringify(f), [fable]));
});
