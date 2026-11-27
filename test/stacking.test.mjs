// SPDX-License-Identifier: AGPL-3.0-or-later
// The stacking game (early), as its rules stand: the opening, each stone's moves, the height rule, strikes, topples,
// drops, the swap, the Lodestone's safety, the end, replays from seed and moves, and bots that play whole legal games.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canon, createMatch, openSave } from "../src/core/index.js";
import { COUNT, COURIER, LAYOUTS, LODE, LONGEST, PEBBLE, QUIET, SLINGER, WARDEN, boardOf, cellAt, hasMove, legalOf, lodeOf, nameOf, stacking, stoneOf, stonesOf, threatened } from "../src/games/stacking/rules.js";
import { TIERS, choose, evaluate } from "../src/games/stacking/bot.js";
import { botGame, inList } from "./fixtures/bots.js";

const start = (seed = "s", options = {}) => createMatch(stacking, { seed, options });
/** An empty board with only the given stones, seat 0 to move, south playing up; for building cases by hand. */
function bare(stones, more = {}) {
  const p = structuredClone(start("bare", { layout: 0 }).position);
  p.cells = p.cells.map(() => []);
  for (const [seat, kind, q, r] of stones) p.cells[cellAt(q, r)].push(stoneOf(seat, kind));
  return Object.assign(p, { ply: 4, round: 3 }, more);
}
const at = (q, r) => cellAt(q, r);
const has = (p, m) => inList(legalOf(p), m);
/** The two Lodestones far apart, so a case is about its own stones. */
const LODES = [[0, LODE, -4, 4], [1, LODE, 4, -4]];

test("each set opening has twelve stones a side, in the three home rows, mirrored", () => {
  for (let layout = 0; layout < LAYOUTS.length; layout++) {
    const p = start("o", { layout }).position;
    for (const s of [0, 1]) {
      const kinds = [0, 0, 0, 0, 0];
      p.cells.forEach((c, i) => { assert.ok(c.length <= 1); for (const st of c) if (Math.floor(st / 5) === s) { kinds[st % 5]++; const r = boardOf().cells[i][1]; assert.ok(s === 0 ? r >= 2 : r <= -2, `home rows: ${nameOf(p, i)}`); } });
      assert.deepEqual(kinds, COUNT);
    }
    p.cells.forEach((c, i) => { const [q, r] = boardOf().cells[i], o = p.cells[at(-q, -r)]; assert.equal(c.length, o.length); if (c.length) assert.equal(c[0] % 5, o[0] % 5); });
    assert.equal(stonesOf(p, 0), 12);
    assert.ok(!threatened(p, 0) && !threatened(p, 1));
  }
});

test("the opening is drawn from the seed: the same seed gives the same board", () => {
  const seen = new Set();
  for (let i = 0; i < 30; i++) { const a = start(`d${i}`).position, b = start(`d${i}`).position; assert.equal(canon(a), canon(b)); seen.add(a.layout); }
  assert.equal(seen.size, LAYOUTS.length, "every layout comes up");
});

test("cells are named by row letter and place", () => {
  const p = start().position;
  assert.equal(nameOf(p, at(0, -4)), "A1");
  assert.equal(nameOf(p, at(-4, 0)), "E1");
  assert.equal(nameOf(p, at(4, 0)), "E9");
  assert.equal(nameOf(p, at(-4, 4)), "I1");
  assert.equal(new Set(boardOf().cells.map((_, i) => nameOf(p, i))).size, 61);
});

test("a Pebble steps only to its two forward cells, which depend on its side", () => {
  const p = bare([...LODES, [0, PEBBLE, 0, 0], [1, PEBBLE, 1, -2]]);
  const mine = legalOf(p).filter((m) => m.from === at(0, 0)).map((m) => m.to).sort((a, b) => a - b);
  assert.deepEqual(mine, [at(0, -1), at(1, -1)].sort((a, b) => a - b));
  const theirs = legalOf({ ...p, seat: 1 }, 1).filter((m) => m.from === at(1, -2)).map((m) => m.to).sort((a, b) => a - b);
  assert.deepEqual(theirs, [at(1, -1), at(0, -1)].sort((a, b) => a - b));
});

test("the height rule: one tier at a time, up to three, and height adds reach", () => {
  // a Courier on the ground slides 2; on tier 2 it slides 3
  let p = bare([...LODES, [0, COURIER, 0, 0]]);
  assert.ok(has(p, { do: "move", from: at(0, 0), to: at(2, 0) }));
  assert.ok(!has(p, { do: "move", from: at(0, 0), to: at(3, 0) }));
  p = bare([...LODES, [0, PEBBLE, 0, 0], [0, COURIER, 0, 0]]);
  assert.ok(has(p, { do: "move", from: at(0, 0), to: at(3, 0) }));
  // a stone on the ground climbs onto one stone, not onto two
  p = bare([...LODES, [0, COURIER, 0, 0], [0, PEBBLE, 1, 0], [0, PEBBLE, -1, 0], [0, PEBBLE, -1, 0]]);
  assert.ok(has(p, { do: "move", from: at(0, 0), to: at(1, 0) }));
  assert.ok(!has(p, { do: "move", from: at(0, 0), to: at(-1, 0) }));
  // nothing stands four high
  p = bare([...LODES, [0, PEBBLE, 0, 0], [0, PEBBLE, 0, 0], [0, COURIER, 0, 0], [0, PEBBLE, 1, 0], [0, PEBBLE, 1, 0], [0, PEBBLE, 1, 0]]);
  assert.ok(!has(p, { do: "move", from: at(0, 0), to: at(1, 0) }));
  // only the top stone acts
  p = bare([...LODES, [0, COURIER, 0, 0], [0, PEBBLE, 0, 0]]);
  assert.ok(!legalOf(p).some((m) => m.from === at(0, 0) && m.to === at(2, 0)), "the buried Courier does not slide");
});

test("Lodestone and Warden: no higher than tier 2, nothing on a Lodestone, a Warden never climbs and is never climbed", () => {
  let p = bare([[0, LODE, 0, 0], [1, LODE, 4, -4], [0, PEBBLE, 1, 0], [0, PEBBLE, -1, 0], [0, PEBBLE, -1, 0], [0, WARDEN, 0, 1], [0, PEBBLE, 1, 1]]);
  assert.ok(has(p, { do: "move", from: at(0, 0), to: at(1, 0) }), "onto one stone: tier 2");
  assert.ok(!has(p, { do: "move", from: at(0, 0), to: at(-1, 0) }), "not to tier 3");
  assert.ok(!has(p, { do: "move", from: at(0, 1), to: at(1, 1) }), "a Warden never climbs");
  assert.ok(!legalOf(p).some((m) => m.do === "move" && (m.to === at(0, 1) || m.to === at(0, 0))), "nothing climbs a Warden or a Lodestone");
});

test("strikes: no more than one tier up; the struck stone goes to the striker's pouch as its own", () => {
  let p = bare([...LODES, [0, PEBBLE, 0, 0], [1, PEBBLE, 0, -1], [1, PEBBLE, 1, -1], [1, PEBBLE, 1, -1], [1, PEBBLE, 1, -1]]);
  assert.ok(has(p, { do: "strike", from: at(0, 0), to: at(0, -1) }));
  assert.ok(!has(p, { do: "strike", from: at(0, 0), to: at(1, -1) }), "three high is two tiers above a ground stone");
  const after = stacking.apply(p, { do: "strike", from: at(0, 0), to: at(0, -1) }).position;
  assert.deepEqual(after.cells[at(0, -1)], [stoneOf(0, PEBBLE)]);
  assert.equal(after.pouch[0][PEBBLE], 1);
  assert.equal(after.quiet, 0);
});

test("a Slinger strikes the first stone in a line within range and stays; height adds range", () => {
  let p = bare([...LODES, [0, SLINGER, 0, 0], [1, PEBBLE, 2, 0], [1, PEBBLE, 3, 0], [1, PEBBLE, 0, -3]]);
  assert.ok(has(p, { do: "sling", from: at(0, 0), to: at(2, 0) }));
  assert.ok(!has(p, { do: "sling", from: at(0, 0), to: at(3, 0) }), "only the first stone in a line");
  assert.ok(!has(p, { do: "sling", from: at(0, 0), to: at(0, -3) }), "out of range on the ground");
  const q = stacking.apply(p, { do: "sling", from: at(0, 0), to: at(2, 0) }).position;
  assert.deepEqual(q.cells[at(0, 0)], [stoneOf(0, SLINGER)]);
  assert.equal(q.cells[at(2, 0)].length, 0);
  p = bare([...LODES, [0, PEBBLE, 0, 0], [0, SLINGER, 0, 0], [1, PEBBLE, 0, -3]]);
  assert.ok(has(p, { do: "sling", from: at(0, 0), to: at(0, -3) }), "range 3 from tier 2");
});

test("topple knocks a rival top stone to the cell behind; never a Warden, never from lower down", () => {
  let p = bare([...LODES, [0, PEBBLE, 0, 0], [0, COURIER, 0, 0], [1, PEBBLE, 1, 0], [1, SLINGER, 1, 0], [1, WARDEN, -1, 0]]);
  assert.ok(has(p, { do: "topple", from: at(0, 0), to: at(1, 0) }));
  assert.ok(!has(p, { do: "topple", from: at(0, 0), to: at(-1, 0) }), "a Warden cannot be toppled");
  const q = stacking.apply(p, { do: "topple", from: at(0, 0), to: at(1, 0) }).position;
  assert.deepEqual(q.cells[at(1, 0)], [stoneOf(1, PEBBLE)]);
  assert.deepEqual(q.cells[at(2, 0)], [stoneOf(1, SLINGER)]);
  p = bare([...LODES, [0, COURIER, 0, 0], [1, PEBBLE, 1, 0], [1, SLINGER, 1, 0]]);
  assert.ok(!has(p, { do: "topple", from: at(0, 0), to: at(1, 0) }), "a ground stone cannot topple a stack of two");
});

test("drops go beside your own stacks, never beside the rival Lodestone", () => {
  const p = bare([[0, LODE, -4, 4], [1, LODE, 2, 0], [0, PEBBLE, 0, 0]]);
  p.pouch[0][COURIER] = 1;
  const drops = legalOf(p).filter((m) => m.do === "drop");
  assert.ok(drops.length > 0 && drops.every((m) => m.kind === COURIER));
  assert.ok(drops.some((m) => m.to === at(-1, 0)));
  assert.ok(!drops.some((m) => m.to === at(1, 0)), "beside the rival Lodestone");
  assert.ok(!drops.some((m) => m.to === at(3, -3)), "not beside a stone of ours");
});

test("you may not leave your Lodestone open, and a trapped Lodestone loses", () => {
  // the rival Courier threatens our Lodestone: every legal move must make it safe
  const p = bare([[0, LODE, 0, 0], [1, LODE, 4, -4], [1, COURIER, 2, 0], [0, PEBBLE, -3, 3]]);
  assert.ok(threatened(p, 0));
  for (const m of legalOf(p)) assert.ok(!threatened(stacking.apply(p, m).position, 0), JSON.stringify(m));
  assert.ok(!legalOf(p).some((m) => m.from === at(-3, 3)), "the Pebble's step leaves the Lodestone open");
  // in the corner, walled in by rival stacks three high; the Pebble on top of one strikes it: no legal move, a loss
  const wall = (south) => {
    const t = bare([[0, LODE, -4, 4], [1, LODE, 4, -4]], { seat: 1, south });
    for (const [q, r] of [[-3, 4], [-3, 3], [-4, 3]]) t.cells[at(q, r)] = [stoneOf(1, PEBBLE), stoneOf(1, PEBBLE), stoneOf(1, PEBBLE)];
    return stacking.apply(t, { do: "move", from: at(4, -4), to: at(3, -4) }).position;
  };
  const trapped = wall(0);
  assert.ok(threatened(trapped, 0) && !hasMove(trapped, 0));
  assert.deepEqual(trapped.over, { winners: [1], why: "the rival Lodestone is trapped" });
});

test("a player with no legal move loses even when the Lodestone is not open", () => {
  // the same wall, but the rival Pebbles face the other way, so none strikes the Lodestone
  const t = bare([[0, LODE, -4, 4], [1, LODE, 4, -4]], { seat: 1, south: 1 });
  for (const [q, r] of [[-3, 4], [-3, 3], [-4, 3]]) t.cells[at(q, r)] = [stoneOf(1, PEBBLE), stoneOf(1, PEBBLE), stoneOf(1, PEBBLE)];
  const p = stacking.apply(t, { do: "move", from: at(4, -4), to: at(3, -4) }).position;
  assert.ok(!threatened(p, 0));
  assert.deepEqual(p.over, { winners: [1], why: "the rival has no legal move" });
});

test("the swap: after the first move the second player may take the side that moved", () => {
  const m = start("sw", { layout: 0 });
  assert.ok(!m.legal().some((x) => x.do === "swap"));
  m.play(m.legal().find((x) => x.do === "move"));
  assert.ok(m.isLegal({ do: "swap" }));
  const before = m.position;
  m.play({ do: "swap" });
  const p = m.position;
  assert.equal(p.seat, 0);
  assert.equal(p.south, 1);
  p.cells.forEach((c, i) => assert.deepEqual(c.map((st) => (st + 5) % 10), before.cells[i]));
  assert.ok(!m.legal().some((x) => x.do === "swap"), "once only");
  const off = start("sw", { layout: 0, swap: false });
  off.play(off.legal()[0]);
  assert.ok(!off.legal().some((x) => x.do === "swap"));
});

test("quiet turns and the longest game end in a draw", () => {
  const p = bare([...LODES, [0, PEBBLE, -2, 2], [1, PEBBLE, 2, -2]], { quiet: QUIET - 1 });
  const q = stacking.apply(p, legalOf(p).find((m) => m.do === "move")).position;
  assert.deepEqual(q.over.winners, [0, 1]);
  const r = bare([...LODES, [0, PEBBLE, -2, 2], [1, PEBBLE, 2, -2]], { ply: LONGEST - 1 });
  assert.deepEqual(stacking.apply(r, legalOf(r).find((m) => m.do === "move")).position.over.winners, [0, 1]);
});

test("positions are whole numbers and plain data; a seed and the moves replay the game exactly", () => {
  const m = botGame(stacking, choose, { seed: "replay", tiers: ["easy"], cap: 120 });
  const again = createMatch(stacking, { seed: m.seed, options: m.options });
  for (const mv of m.list) again.play(mv);
  assert.equal(again.fingerprint(), m.fingerprint());
  const { match, warning } = openSave(m.save(), [stacking]);
  assert.equal(warning, "");
  assert.equal(match.fingerprint(), m.fingerprint());
  canon(m.position);
});

test("bots play whole legal games to an end, easy against easy and normal against easy", () => {
  assert.deepEqual(TIERS, ["easy", "normal"]);
  for (const [seed, tiers] of [["b1", ["easy"]], ["b2", ["easy"]], ["b3", ["normal", "easy"]]]) {
    const m = botGame(stacking, choose, { seed, tiers, each: (x) => { for (const s of [0, 1]) assert.ok(stonesOf(x.position, s) >= 1 && lodeOf(x.position, s) >= 0); } });
    assert.ok(m.result, `${seed} ended`);
    assert.ok(m.list.length <= LONGEST);
  }
});

test("the normal bot takes a free stone and the evaluation counts it", () => {
  const p = bare([...LODES, [0, PEBBLE, 0, 0], [1, COURIER, 0, -1]]);
  const m = choose(p, { below: () => 0 }, "normal");
  assert.deepEqual(m, { do: "strike", from: at(0, 0), to: at(0, -1) });
  assert.ok(evaluate(stacking.apply(p, m).position, 0) > evaluate(p, 0));
});
