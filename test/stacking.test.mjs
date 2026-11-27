// SPDX-License-Identifier: AGPL-3.0-or-later
// The stacking game (early), as its rules stand: the openings (Traditional, the small Capo set, free placement), each stone's
// moves, the height rule, strikes, topples, drops, the swap, the Lodestone's safety, the ends, replays from seed and moves; the
// search's own position against the rules, the bots' steps, hints, reviews and the puzzles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canon, chance, createMatch, openSave, seedState } from "../src/core/index.js";
import { COUNT, COURIER, LAYOUTS, LAYOUTS_SMALL, LODE, LONGEST, PEBBLE, PLACE_LEAST, QUIET, SLINGER, SMALL, WARDEN, boardOf, cellAt, countOf, hasMove, legalOf, lodeOf, make as makeRule, nameOf, stacking, stoneOf, stonesOf, threatened } from "../src/games/stacking/rules.js";
import { STEPS, TIERS, choose, deciding, drain, hinting, reviewing, why } from "../src/games/stacking/bot.js";
import { evaluate, flat, legal, make, moveOf, think, unmake } from "../src/games/stacking/search.js";
import { PUZZLES, optionOf } from "../src/games/stacking/puzzles.js";
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
  const off = start("sw", { style: "custom", layout: 0, swap: false });
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

test("bots play whole legal games to an end at every step", () => {
  assert.deepEqual(TIERS, ["easy", "normal", "hard", "master"]);
  for (const [seed, tiers, style] of [["b1", ["easy"], "classic"], ["b2", ["easy", "normal"], "ours"], ["b3", ["normal", "easy"], "classic"], ["b4", ["hard", "gentle"], "ours"]]) {
    const m = botGame(stacking, choose, { seed, tiers, options: { style }, each: (x) => { for (const s of [0, 1]) assert.ok(stonesOf(x.position, s) >= 1 && lodeOf(x.position, s) >= 0); } });
    assert.ok(m.result, `${seed} ended`);
    assert.ok(m.list.length <= LONGEST);
  }
});

test("the normal bot takes a free stone and the count holds it", () => {
  const p = bare([...LODES, [0, PEBBLE, 0, 0], [1, COURIER, 0, -1]]);
  const m = choose(p, { below: () => 0 }, "normal");
  assert.deepEqual(m, { do: "strike", from: at(0, 0), to: at(0, -1) });
  const f = flat(p), before = evaluate(f);
  make(f, think(f, { budget: 2000 }).move);
  assert.ok(-evaluate(f) > before, "the side that took is better off");
});

// ---- version 2: the small Capo set, free placement, the count, Custom

test("the Capo set: 37 cells, nine stones a side in three home rows, mirrored, drawn from the seed", () => {
  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    const p = start(`c${i}`, { style: "ours" }).position, b = boardOf(3);
    assert.equal(p.cells.length, 37);
    seen.add(p.layout);
    for (const s of [0, 1]) {
      const kinds = [0, 0, 0, 0, 0];
      p.cells.forEach((c, j) => { for (const st of c) if (Math.floor(st / 5) === s) { kinds[st % 5]++; const r = b.cells[j][1]; assert.ok(s === 0 ? r >= 1 : r <= -1, "home rows"); } });
      assert.deepEqual(kinds, SMALL);
    }
    p.cells.forEach((c, j) => { const [q, r] = b.cells[j], o = p.cells[cellAt(-q, -r, 3)]; assert.equal(c.length, o.length); if (c.length) assert.equal(c[0] % 5, o[0] % 5); });
    assert.ok(!threatened(p, 0) && !threatened(p, 1));
    assert.deepEqual(p.rule, { size: 3, opening: "set", swap: true, limit: 30, drops: true, topple: true, extra: false });
  }
  assert.equal(seen.size, LAYOUTS_SMALL.length);
  assert.equal(nameOf(start("n", { style: "ours" }).position, cellAt(0, -3, 3)), "A1");
  assert.equal(new Set(boardOf(3).cells.map((_, i) => nameOf({ size: 3 }, i))).size, 37);
});

test("Traditional keeps the settled game: the same twelve stones in the same set layouts", () => {
  for (let layout = 0; layout < 3; layout++) {
    const p = start("t", { layout }).position;
    assert.equal(p.cells.length, 61);
    for (const [kind, q, r] of LAYOUTS[layout].stones) assert.deepEqual(p.cells[at(q, r)], [stoneOf(0, kind)]);
    assert.equal(stonesOf(p, 1), COUNT.reduce((a, b) => a + b, 0));
  }
});

test("the count at a turn limit: each stack a side tops counts its height", () => {
  const p = bare([...LODES, [0, PEBBLE, 0, 0], [0, PEBBLE, 0, 0], [1, PEBBLE, 2, -2]], { rule: { ...start("x").position.rule, limit: 3 }, ply: 5, began: 0 });
  assert.equal(countOf(p, 0), 3);
  assert.equal(countOf(p, 1), 2);
  const q = stacking.apply(p, legalOf(p).find((m) => m.do === "move" && m.from === at(-4, 4))).position;
  assert.deepEqual(q.over, { winners: [0], why: "after 3 turns each, tiers topped 5 to 2 with the first player's 2" });
  const tie = (more = {}) => bare([...LODES, [0, PEBBLE, -2, 2], [1, PEBBLE, 2, -2], [1, PEBBLE, 2, -2], [1, PEBBLE, 2, -2]], { rule: p.rule, ply: 5, began: 0, ...more }); // 2 + 2 against 4
  const end = (r) => stacking.apply(r, legalOf(r).find((m) => m.do === "move" && m.from === at(-4, 4))).position.over;
  assert.deepEqual(end(tie()), { winners: [1], why: "after 3 turns each, tiers topped 4 to 4 with the first player's 2, and more stones held" });
  assert.deepEqual(end(tie({ pouch: [[0, 0, 0, 0, 2], [0, 0, 0, 0, 0]] })), { winners: [0, 1], why: "after 3 turns each, tiers topped 4 to 4 with the first player's 2, and stones held level" });
  const t = bare([...LODES, [1, PEBBLE, 2, -2], [1, PEBBLE, 2, -2], [1, PEBBLE, 2, -2], [1, PEBBLE, 1, -1], [1, PEBBLE, 0, -1]], { rule: p.rule, ply: 5, began: 0 }); // 1 + 2 against 6
  assert.deepEqual(end(t).winners, [1]);
});

test("free placement: the Lodestone first, home rows only, a stop after eight, the rest to the pouch", () => {
  const m = start("free", { opening: "free" });
  let p = m.position;
  assert.equal(p.phase, "place");
  assert.ok(m.legal().every((x) => x.do === "place" && x.kind === LODE && p.cells[x.to].length === 0 && boardOf().cells[x.to][1] >= 2));
  const d = chance(seedState("free"));
  while (m.position.phase === "place") {
    p = m.position;
    const all = m.legal(), s = p.seat, places = all.filter((x) => x.do === "place"), stop = all.find((x) => x.do === "stop");
    if (p.placed[s] < PLACE_LEAST && places.length) assert.ok(!stop, "no stop before eight");
    if (p.placed[s] > 0) assert.ok(places.every((x) => x.kind !== LODE));
    m.play(stop && p.placed[s] >= 9 ? stop : places.length ? places[d.below(places.length)] : stop);
    for (const t of [0, 1]) assert.ok(m.position.phase !== "place" || !threatened({ ...m.position, phase: "play" }, t), "nothing put down strikes a Lodestone");
  }
  p = m.position;
  assert.equal(p.seat, 0);
  assert.equal(p.began, p.ply);
  for (const s of [0, 1]) assert.equal(stonesOf(p, s), 12);
  assert.equal(p.pouch[0].reduce((a, b) => a + b, 0), 3, "nine placed, three in the pouch");
  m.play(m.legal().find((x) => x.do === "move"));
  assert.ok(m.isLegal({ do: "swap" }), "the swap comes after the first move of play");
  assert.ok(botGame(stacking, choose, { seed: "fb", tiers: ["normal", "easy"], options: { style: "custom", size: 3, opening: "free", limit: 30 } }).result);
});

test("Custom switches: no drops, an extra Pebble for the second player, the small board", () => {
  const p = start("cu", { style: "custom", size: 3, drops: false, extra: true, limit: 20 }).position;
  assert.equal(p.cells.length, 37);
  assert.deepEqual(p.pouch[1], [0, 0, 0, 0, 1]);
  assert.equal(p.rule.limit, 20);
  const q = bare([...LODES, [0, PEBBLE, 0, 0]], { rule: { ...p.rule, size: 4, drops: false } });
  q.pouch[0][COURIER] = 1;
  assert.ok(!legalOf(q).some((m) => m.do === "drop"));
});

test("the search's flat position makes the same moves as the rules, and make and unmake leave it as it was", () => {
  let checked = 0;
  for (const style of ["ours", "classic"]) for (let g = 0; g < 4; g++) {
    const m = createMatch(stacking, { seed: `eq${g}`, options: { style } }), d = chance(seedState(`e${g}`));
    while (m.turn !== null && m.list.length < 120) {
      const p = m.position, f = flat(p), want = legalOf(p).map(canon).sort(), got = legal(f).map((c) => canon(moveOf(f, c))).sort();
      assert.deepEqual(got, want);
      const before = canon([[...f.st], [...f.h], [...f.pouch], f.hash, f.lode, f.seat, f.south]);
      for (const c of legal(f)) { make(f, c); unmake(f); }
      assert.equal(canon([[...f.st], [...f.h], [...f.pouch], f.hash, f.lode, f.seat, f.south]), before);
      checked++;
      const all = m.legal();
      m.play(g % 2 ? all[d.below(all.length)] : choose(p, d, "easy"));
    }
  }
  assert.ok(checked > 300, `${checked} positions`);
});

test("the search is held to a count of positions, not time: the same seed gives the same move", () => {
  const p = start("det", { style: "ours" }).position;
  for (const tier of ["normal", "hard"]) {
    const a = think(flat(p), { ...STEPS[tier], seed: 9 }), b = think(flat(p), { ...STEPS[tier], seed: 9 });
    assert.equal(a.move, b.move);
    assert.ok(a.nodes <= STEPS[tier].budget + 400, `${a.nodes} positions`);
  }
  const o = { ...STEPS.normal, seed: 4 }; // the worker and the page run the same code from the same settings
  assert.deepEqual(drain(deciding(p, o)), drain(deciding(p, o)));
});

test("puzzles: each has exactly one first move that traps in time, whatever the reply, and the hard bot finds it", () => {
  const trapped = (f) => legal(f).length === 0;
  const in1 = (f) => legal(f).filter((c) => { make(f, c); const t = trapped(f); unmake(f); return t; });
  const in2 = (f, c) => { make(f, c); let ok = !trapped(f); if (ok) for (const r of legal(f)) { make(f, r); const t = in1(f).length > 0; unmake(f); if (!t) { ok = false; break; } } unmake(f); return ok; };
  for (const z of PUZZLES) {
    const m = createMatch(stacking, { seed: "pz", options: { style: "custom", size: 3, puzzle: optionOf(z) } }), p = m.position, f = flat(p);
    assert.equal(p.seat, z.seat);
    const solving = z.turns === 1 ? in1(f) : legal(f).filter((c) => in2(f, c));
    assert.equal(solving.length, 1, z.name);
    assert.deepEqual(moveOf(f, solving[0]), z.answer, z.name);
    if (z.turns === 2) assert.equal(in1(f).length, 0, `${z.name}: no trap in one`);
    assert.deepEqual(choose(p, chance(seedState("s")), "hard"), z.answer, `${z.name}: the hard bot finds it`);
    m.play(z.answer); // then the hard bot's best defence, then the trap
    while (m.turn !== null) m.play(choose(m.position, chance(seedState("d")), "hard"));
    assert.deepEqual(m.result.winners, [z.seat], z.name);
  }
  // a puzzle not solved in time is lost
  const z = PUZZLES[0], m = createMatch(stacking, { seed: "pz", options: { style: "custom", size: 3, puzzle: optionOf(z) } });
  m.play(m.legal().find((x) => canon(x) !== canon(z.answer)));
  if (m.turn !== null) m.play(m.legal()[0]);
  assert.deepEqual(m.result?.winners, [1 - z.seat]);
});

test("the steps climb: each beats the one below in most games", () => {
  const score = (a, b, n, style) => {
    let won = 0;
    for (let i = 0; i < n; i++) {
      const tiers = i % 2 ? [b, a] : [a, b], g = botGame(stacking, choose, { seed: `ladder ${style} ${i}`, tiers, options: { style } });
      if (g.result.winners.length === 1 && tiers[g.result.winners[0]] === a) won++;
    }
    return won;
  };
  assert.ok(score("normal", "easy", 6, "ours") >= 5, "normal over easy");
  assert.ok(score("easy", "gentle", 6, "ours") >= 4, "easy over the lesson's gentle bot");
});

test("a hint names the move and says why; a trap is called a trap", () => {
  const z = PUZZLES[1], p = createMatch(stacking, { seed: "h", options: { style: "custom", size: 3, puzzle: optionOf(z) } }).position;
  const h = drain(hinting(p, 3));
  assert.deepEqual(h.move, z.answer);
  assert.match(h.why, /traps the rival Lodestone/);
  const q = bare([...LODES, [0, PEBBLE, 0, 0], [1, COURIER, 0, -1]]);
  assert.match(why(q, { do: "strike", from: at(0, 0), to: at(0, -1) }), /takes their Courier/);
  assert.equal(drain(hinting(start("f", { opening: "free" }).position, 1)), null, "no hints while placing");
});

test("the review marks a missed trap", () => {
  const z = PUZZLES[0], m = createMatch(stacking, { seed: "rv", options: { style: "custom", size: 3, puzzle: optionOf(z) } });
  m.play(m.legal().find((x) => canon(x) !== canon(z.answer)));
  while (m.turn !== null) m.play(choose(m.position, chance(seedState("r")), "normal"));
  const marks = drain(reviewing({ seed: m.seed, options: m.options, moves: m.list }, [z.seat]));
  assert.equal(marks[0].n, 1);
  assert.equal(marks[0].trap, 1);
  assert.deepEqual(marks[0].best, z.answer);
  assert.ok(makeRule && hasMove && QUIET && SLINGER && WARDEN); // the rules' exports the cases above lean on
});
