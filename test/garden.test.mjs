// SPDX-License-Identifier: AGPL-3.0-or-later
// The garden game (early), as its rules stand: the bed, the wheel, sowing, shifting, overgrowth, links, the ring round the
// pond, the free sow, the swap, the called ring and the count at the limit; replay from seed and moves; bots that finish.
// No win rates are written down here: the numbers are still to be tuned.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chance, createMatch, seedState } from "../src/core/index.js";
import { EACH, KINDS, NONE, PLANTS, bedOf, closers, garden, linking, linksOf, meterOf, movesFor, overgrows, ringOf, scoreOf, step } from "../src/games/garden/rules.js";
import { TIERS, choose, value } from "../src/games/garden/bot.js";
import { botGame, ended, inList, replays, sameEachStep } from "./fixtures/bots.js";

const start = (style = "ours", seed = "g", over = {}) => createMatch(garden, { seed, options: { style, ...over } });
/** A bare bed from a rule set: plants given as [q, r, seat, kind], the turn after the opening. */
function made(plants, { style = "ours", seat = 0, ...over } = {}) {
  const p = structuredClone(start(style).position), g = bedOf(p.rule.size), at = (q, r) => g.cells.findIndex(([a, b]) => a === q && b === r);
  for (const [q, r, s, k] of plants) { const c = at(q, r); assert.ok(c >= 0, `${q},${r} is on the bed`); p.owner[c] = s; p.kind[c] = k; p.pouch[s][k] -= 1; }
  Object.assign(p, { seat, done: 2, round: 2 }, over);
  return { p, at };
}

test("the wheel: each kind links with its two neighbours, overgrows one and is overgrown by one", () => {
  assert.equal(PLANTS.length, KINDS);
  for (let a = 0; a < KINDS; a++) {
    assert.deepEqual([...Array(KINDS).keys()].filter((b) => linking(a, b)).sort(), [(a + 1) % KINDS, (a + KINDS - 1) % KINDS].sort());
    assert.deepEqual([...Array(KINDS).keys()].filter((b) => overgrows(a, b)), [(a + 2) % KINDS]);
    assert.deepEqual([...Array(KINDS).keys()].filter((b) => overgrows(b, a)), [(a + KINDS - 2) % KINDS]);
  }
});

test("the bed: a pond of seven cells in the middle, the rim, three home beds each and six parts round the pond", () => {
  for (const R of [4, 5]) {
    const g = bedOf(R);
    assert.equal(g.size, 3 * R * R + 3 * R + 1);
    assert.equal(g.pond.filter(Boolean).length, 7);
    assert.equal(g.rim.filter(Boolean).length, 6 * R);
    for (const s of [0, 1]) assert.equal(g.home[s].filter(Boolean).length, 9);
    assert.ok(g.home[0].every((x, i) => !x || !g.home[1][i]), "the home beds do not overlap");
    // a sixth of a turn carries the first gardener's home beds onto the second's, and six of them go all the way round
    g.home[0].forEach((x, i) => { if (x) assert.ok(g.home[1][g.turn[i]]); });
    g.cells.forEach((_, i) => { let c = i; for (let k = 0; k < 6; k++) c = g.turn[c]; assert.equal(c, i); });
    for (let k = 0; k < 6; k++) assert.equal(g.sector.filter((x) => x === k).length, (g.size - 1) / 6);
  }
});

test("both rule sets start empty with full pouches, and the first move is a sow", () => {
  for (const style of ["ours", "classic", "custom"]) {
    const m = start(style), p = m.position;
    assert.ok(p.owner.every((o) => o === NONE));
    assert.deepEqual(p.pouch, [Array(KINDS).fill(EACH), Array(KINDS).fill(EACH)]);
    assert.ok(m.legal().every((x) => x.do === "sow"));
    assert.equal(m.turn, 0);
  }
  assert.equal(start("ours").position.rule.size, 4);
  assert.equal(start("classic").position.rule.size, 5);
  assert.equal(start("ours", "g", { rounds: 16 }).position.rounds, 16);
  // Capo sows on any empty rim cell; Traditional only on your own home beds
  const capo = start("ours"), g = bedOf(4);
  assert.ok(capo.legal().every((x) => g.rim[x.to]));
  const trad = start("classic"), h = bedOf(5);
  assert.ok(trad.legal().every((x) => h.home[0][x.to]));
});

test("a shift goes in a straight line through empty cells, never into the pond, and may end on a plant it overgrows", () => {
  // Reed at (3,0); Sedge (overgrown by Reed) of the rival at (4,0) on the rim; Thistle (which overgrows Reed) of the rival at (3,-1)
  const { p, at } = made([[3, 0, 0, 0], [4, -1, 1, 2], [2, 1, 1, 3]], { style: "classic" });
  const to = movesFor(p, 0, { sow: false }).filter((m) => m.from === at(3, 0)).map((m) => m.to);
  assert.ok(to.includes(at(4, -1)), "it may overgrow the Sedge");
  assert.ok(!to.includes(at(2, 1)), "it may not take the Thistle");
  assert.ok(to.includes(at(2, 0)) && !to.includes(at(1, 0)), "a shift towards the pond stops at its edge");
  assert.ok(to.every((c) => !bedOf(5).pond[c]));
  const { position: q, events } = step(p, { do: "shift", from: at(3, 0), to: at(4, -1) });
  assert.equal(q.owner[at(4, -1)], 0);
  assert.equal(q.kind[at(4, -1)], 0);
  assert.equal(q.owner[at(3, 0)], NONE);
  assert.equal(q.pouch[1][2], EACH, "the Sedge is back in its owner's pouch");
  assert.equal(q.took[0], 1);
  assert.ok(events.some((e) => e.kind === "overgrow" && e.was === 1 && e.lost === 2));
});

test("links join two plants of linking kinds on one line with nothing between; a rival plant or the pond blocks them", () => {
  const { p, at } = made([[2, 0, 0, 0], [4, 0, 0, 1]]);
  assert.equal(linksOf(p, 0).length, 1);
  const blocked = structuredClone(p);
  blocked.owner[at(3, 0)] = 1; blocked.kind[at(3, 0)] = 4;
  assert.equal(linksOf(blocked, 0).length, 0);
  const same = made([[2, 0, 0, 0], [4, 0, 0, 0]]).p;
  assert.equal(linksOf(same, 0).length, 0, "two Reeds do not link");
  const across = made([[2, 0, 0, 0], [-2, 0, 0, 1]]).p;
  assert.equal(linksOf(across, 0).length, 0, "no line crosses the pond");
});

/** The six corners of the ring of cells two from the middle, with kinds that link all the way round. */
const SIX = [[2, 0], [0, 2], [-2, 2], [-2, 0], [0, -2], [2, -2]];
test("a chain right round the pond is a ring, and wins; a chain that does not go round is not", () => {
  const { p } = made(SIX.map(([q, r], i) => [q, r, 0, i % 2]));
  assert.equal(linksOf(p, 0).length, 6);
  assert.equal(ringOf(p, 0).length, 6);
  assert.equal(meterOf(p, 0).parts, 6);
  const open = made(SIX.slice(0, 5).map(([q, r], i) => [q, r, 0, i % 2])).p;
  assert.equal(ringOf(open, 0), null);
  assert.ok(meterOf(open, 0).parts < 6);
  // a closed loop beside the pond that does not go round it: a small triangle of lines on the rim side
  const side = made([[2, 0, 0, 0], [3, 0, 0, 1], [3, -1, 0, 0], [2, -1, 0, 1]]).p;
  assert.equal(linksOf(side, 0).length, 4);
  assert.equal(ringOf(side, 0), null, "a loop beside the pond is not a ring");
  // the last plant of the ring, sown: the game ends and that gardener wins
  const near = made([...SIX.slice(0, 5).map(([q, r], i) => [q, r, 0, i % 2])]);
  const g = bedOf(4), c = g.cells.findIndex(([a, b]) => a === 2 && b === -2);
  const done = step(near.p, { do: "sow", kind: 1, to: c }); // not a rim cell, so not a legal sow in Capo: the rules here only check the ring
  assert.deepEqual(done.position.over.winners, [0]);
  assert.ok(done.events.some((e) => e.kind === "ring"));
});

test("a ring in one move is called, and a shift that makes a new link earns a free sow", () => {
  // five plants of a ring, the sixth corner empty, and a Fern one step away on the line to it
  const { p, at } = made([...SIX.slice(0, 5).map(([q, r], i) => [q, r, 0, i % 2]), [3, -3, 0, 1]], { seat: 1 });
  const close = closers(p, 0);
  assert.ok(close.some((m) => m.do === "shift" && m.from === at(3, -3) && m.to === at(2, -2)));
  // the rival moves; the game then says the first gardener can close
  const q = step(p, { do: "sow", kind: 0, to: at(-4, 4) }, true);
  assert.ok(q.events.some((e) => e.kind === "threat" && e.seat === 0));
  assert.equal(q.position.warned[0], 1);
  // a shift that makes a link and does not close: one free sow, or a skip
  const { p: f, at: fa } = made([[2, 0, 0, 0], [4, -1, 0, 1]]);
  assert.equal(linksOf(f, 0).length, 0);
  const r = step(f, { do: "shift", from: fa(4, -1), to: fa(4, 0) });
  assert.ok(r.events.some((e) => e.kind === "link"));
  assert.equal(r.position.free, true);
  assert.equal(r.position.seat, 0);
  const list = garden.moves(r.position);
  assert.ok(list.every((m) => m.do === "sow" || m.do === "skip"));
  assert.ok(inList(list, { do: "skip" }));
  const after = step(r.position, { do: "skip" }).position;
  assert.equal(after.seat, 1);
  assert.equal(after.free, false);
});

test("the second gardener may swap after the first sow: the plant turns a sixth round and changes hands", () => {
  const m = start("classic", "swap");
  m.play(m.legal()[0]);
  const before = m.position, sown = before.owner.findIndex((o) => o === 0);
  assert.ok(inList(m.legal(), { do: "swap" }));
  m.play({ do: "swap" });
  const p = m.position, g = bedOf(5);
  assert.equal(p.owner[g.turn[sown]], 1);
  assert.equal(p.kind[g.turn[sown]], before.kind[sown]);
  assert.ok(g.home[1][g.turn[sown]], "it stands on the second gardener's home bed");
  assert.equal(p.owner.filter((o) => o === 0).length, 0);
  assert.deepEqual(p.pouch[1], before.pouch[0]);
  assert.equal(m.turn, 0);
  assert.ok(!inList(m.legal(), { do: "swap" }), "only once");
  const off = start("classic", "noswap", { style: "custom", swap: false });
  off.play(off.legal()[0]);
  assert.ok(!inList(off.legal(), { do: "swap" }));
});

test("at the limit the count decides: links in Traditional, points in Capo, and equal shares", () => {
  const { p } = made([[2, 0, 0, 0], [4, 0, 0, 1], [-2, 0, 1, 2], [-4, 0, 1, 3]], { done: 47, seat: 1, rounds: 24, took: [2, 0] });
  assert.equal(scoreOf(p, 0), 1 + 4);
  assert.equal(scoreOf(p, 1), 1);
  const end = step(p, { do: "pass" }).position;
  assert.deepEqual(end.over.winners, [0]);
  assert.match(end.over.why, /points/);
  const tie = structuredClone(p);
  tie.took = [0, 0];
  assert.deepEqual(step(tie, { do: "pass" }).position.over.winners, [0, 1]);
  const links = structuredClone(tie);
  links.rule.score = "links";
  assert.match(step(links, { do: "pass" }).position.over.why, /links/);
});

test("the rules are whole numbers and the same every time: a seed and the move list replay to the same garden", () => {
  for (const style of ["ours", "classic"]) {
    const m = botGame(garden, choose, { seed: `replay-${style}`, options: { style }, tiers: ["easy", "normal"] });
    ended(m, 2);
    replays(m, [garden]);
    sameEachStep(m);
    const again = botGame(garden, choose, { seed: `replay-${style}`, options: { style }, tiers: ["easy", "normal"] });
    assert.equal(again.save(), m.save());
  }
});

test("bots of every tier play legal, complete games at both rule sets and in Custom", () => {
  const games = [["ours", {}, ["easy", "easy"]], ["ours", { rounds: 16 }, ["normal", "hard"]], ["classic", {}, ["normal", "easy"]], ["custom", { size: 4, sowing: "beds", reach: 4, overgrow: "removed", limit: 16, score: "points", bonus: false }, ["hard", "normal"]], ["custom", { size: 5, overgrow: "off", limit: 16 }, ["easy", "normal"]]];
  for (const [style, over, tiers] of games) {
    for (const seed of ["a", "b"]) {
      const m = botGame(garden, choose, { seed: `${style}-${seed}`, options: { style, ...over }, tiers, each: (x, move) => { assert.ok(x.position.pouch.every((k) => k.every((n) => n >= 0 && n <= EACH))); assert.ok(move); } });
      const r = ended(m, 2);
      assert.ok(m.list.length <= 2 * 2 * m.position.rounds + 2 * m.position.rounds, "within the limit, free sows included");
      assert.ok(typeof r.why === "string");
    }
  }
});

test("a bot takes a ring when it can, and stops one when it must", () => {
  const { p, at } = made([...SIX.slice(0, 5).map(([q, r], i) => [q, r, 0, i % 2]), [3, -3, 0, 1]]);
  const d = chance(seedState("ring"));
  for (const tier of TIERS) {
    const m = choose(p, d, tier);
    assert.ok(ringOf(step(p, m).position, 0), `${tier} closes the ring`);
  }
  // the rival's turn: a normal or hard bot keeps the ring from closing
  // the rival has one Clover beside the Fern, which it overgrows: that is the only way to stop the ring
  const them = structuredClone(p);
  them.seat = 1;
  them.owner[at(4, -4)] = 1; them.kind[at(4, -4)] = 4; them.pouch[1][4] -= 1;
  them.pouch[0] = [0, 0, 0, 0, 0]; // nothing left to sow, or a rim cell would close a larger ring
  them.rule.overgrow = "removed"; // and the Fern gone for good, or it would be sown again
  assert.equal(closers(them, 0).length, 1);
  for (const tier of ["normal", "hard"]) {
    const m = choose(them, d, tier), q = step(them, m).position;
    if (q.over) continue;
    assert.equal(closers(q, 0).length, 0, `${tier} blocks: ${JSON.stringify(m)} at ${at(2, -2)}`);
  }
  assert.ok(value(p, 0) > value(p, 1));
});
