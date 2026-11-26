// SPDX-License-Identifier: AGPL-3.0-or-later
// The Island Fable, as its rules stand. These check what should survive coming tweaks to prices and turn order:
// no win rates, wages, turn orders or whole-game fingerprints are written down here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chance, createMatch, seedState } from "../src/core/index.js";
import { CAIRN, EXPANSIONS, NONE, SWITCHES, act, beats, boardOf, cellsOf, defence, fable, goalOf, groupsOf, raiseOf, territories, topOf, upkeepOf } from "../src/games/fable/rules.js";
import { TIERS, choose } from "../src/games/fable/bot.js";
import { SLOW, botGame, ended, passive, refused, replays, same, sameEachStep, slowOnly } from "./fixtures/bots.js";

const STYLES = ["classic", "custom", "ours"]; // Traditional, Custom with its normal switches, Capo
const start = (seats = 2, style = "ours", seed = "f") => createMatch(fable, { seed, options: { seats, style } });

/** A bare island with no water, after the first round: name whose cells, halls with their purses, and units. */
function made({ land, halls = [], units = [], seat = 0, style = "ours", ...over }) {
  const p = structuredClone(start(land.length, style).position), zero = () => p.owner.map(() => 0);
  Object.assign(p, { water: zero(), owner: p.owner.map(() => NONE), unit: zero(), moved: zero(), hall: zero(), purse: zero(), tree: zero(), fort: zero(), farm: zero(), seat, step: seat, round: 2, left: p.rule.actions, over: null }, over);
  land.forEach((list, s) => list.forEach((c) => { p.owner[c] = s; }));
  for (const [c, n] of halls) { p.hall[c] = 1; p.purse[c] = n; }
  for (const [c, n] of units) p.unit[c] = n;
  return p;
}
/** One row of the island, west to east. */
const rowOf = (p, r) => boardOf(p).cells.map((c, i) => [c, i]).filter(([c]) => c[1] === r).sort((x, y) => x[0][0] - y[0][0]).map(([, i]) => i);
const rows = (style = "ours") => { const p = start(2, style).position; return { mid: rowOf(p, 0), up: rowOf(p, -1), top: rowOf(p, -3), low: rowOf(p, 3) }; };
const tiny = start().position, { mid, up, top, low } = rows();
/** End turns until `seat` has begun its turn. */
function until(p, seat) {
  const d = chance(seedState("until"));
  let q = p, events = [];
  for (let i = 0; i < 2 * p.seats; i++) { ({ position: q, events } = fable.apply(q, { do: "end" }, d)); if (q.seat === seat) return { position: q, events }; }
  throw new Error("that seat never moved");
}

/** What must hold after every move of any game. Now and then, also that each take offered beats what guards it. */
function sound(m) {
  const p = m.position, most = topOf(p);
  for (let s = 0; s < p.seats; s++) for (const g of groupsOf(p, s)) assert.equal(g.filter((c) => p.hall[c]).length, g.length > 1 ? 1 : 0, "one hall to a territory");
  p.owner.forEach((o, c) => {
    assert.ok(Number.isInteger(p.purse[c]) && p.purse[c] >= 0, "money is never below nothing");
    assert.ok(p.unit[c] >= 0 && p.unit[c] <= most);
    if (p.water[c]) assert.equal(o, NONE);
    if (o === NONE) assert.equal(p.unit[c] + p.hall[c] + p.fort[c], 0);
    assert.ok(!(p.hall[c] && p.unit[c]));
    if (!p.hall[c]) assert.equal(p.purse[c], 0);
  });
  if (p.over || m.list.length % 9) return;
  for (const x of fable.moves(p)) {
    if (x.do === "end" || p.owner[x.to] === p.seat) continue;
    assert.equal(p.water[x.to], 0, "nobody takes the sea");
    if (x.do === "move") assert.ok(beats(p, p.unit[x.from], defence(p, x.to)), "a take beats its guard");
    else assert.ok(x.do === "raise" && defence(p, x.to) < 1, "a new unit takes only what is unguarded");
  }
}

test("every rule set and seat count: bots play to an end within the cap, every move legal, and the save replays", () => {
  const seats = SLOW ? [2, 3, 4, 5, 6] : [2, 3, 4];
  for (const style of STYLES) for (const n of seats) {
    const m = botGame(fable, choose, { seed: `all ${style} ${n}`, options: { seats: n, style }, tiers: n === 2 ? ["normal", "easy"] : ["normal", "easy", "normal"], each: sound });
    const r = ended(m, n);
    for (const w of r.winners) assert.ok(cellsOf(m.position, w) > 0, "a winner holds land");
    replays(m, [fable]);
  }
});
test("expansions: a game with all of them on, in each rule set, plays to an end and replays", () => {
  const all = Object.fromEntries(EXPANSIONS.map((x) => [x, true]));
  for (const style of STYLES) {
    const m = botGame(fable, choose, { seed: "x " + style, options: { seats: 3, style, ...all }, tiers: ["normal", "easy", "normal"], each: sound });
    ended(m, 3);
    replays(m, [fable]);
  }
});
test("random play in each rule set stays sound and replays", { skip: slowOnly }, () => {
  for (const style of STYLES) for (const n of [2, 3]) {
    const m = botGame(fable, choose, { seed: "r " + style, options: { seats: n, style }, tiers: ["random"], each: sound });
    ended(m, n);
    replays(m, [fable]);
  }
});
test("the same seed and bots play the same game, and replaying the moves passes through the same positions", () => {
  const run = (seed) => botGame(fable, choose, { seed, options: { seats: 3, style: "ours" }, tiers: TIERS });
  const a = run("same"), c = run("same");
  assert.ok(same(a.list, c.list));
  assert.equal(a.fingerprint(), c.fingerprint());
  assert.notEqual(run("other").fingerprint(), a.fingerprint());
  sameEachStep(a);
});
test("rule sets: Custom takes each switch as given; Traditional only the island's shape and size; Capo none", () => {
  const odd = Object.fromEntries(Object.entries(SWITCHES).map(([k, o]) => [k, o.values.find((v) => v !== o.normal)]));
  const normal = Object.fromEntries(Object.entries(SWITCHES).map(([k, o]) => [k, o.normal]));
  const rule = (o) => createMatch(fable, { seed: "s", options: { seats: 2, ...o } }).position.rule;
  assert.deepEqual(rule({ style: "custom", ...odd }), odd);
  assert.deepEqual(rule({ style: "custom" }), normal);
  assert.deepEqual(rule({ style: "classic", ...odd }), { ...normal, isle: odd.isle, size: odd.size });
  assert.deepEqual(rule({ style: "ours", ...odd }), rule({ style: "ours" }));
  assert.equal(rule({ style: "ours", rounds: 10 }).limit, 10);
});
test("illegal moves are refused and change nothing", () => {
  const m = start(2, "ours"), p = m.position, before = m.fingerprint(), [mine] = territories(p, p.seat), [theirs] = territories(p, 1 - p.seat);
  const sea = p.water.indexOf(1), empty = mine.cells.find((c) => !p.unit[c] && !p.hall[c]);
  assert.ok(sea >= 0 && empty !== undefined);
  for (const bad of [{ do: "raise", hall: theirs.hall, to: empty }, { do: "raise", hall: mine.hall, to: sea }, { do: "raise", hall: mine.hall, to: theirs.hall }, { do: "move", from: empty, to: mine.cells.find((c) => c !== empty && !p.hall[c]) }, { do: "fort", hall: mine.hall, to: empty }, { do: "end", now: 1 }, { do: "fly" }]) {
    assert.throws(() => m.play(bad), refused("illegal"), JSON.stringify(bad));
  }
  for (const bad of [undefined, 0.5, () => 1]) assert.throws(() => m.play(bad), refused("shape"));
  assert.equal(m.fingerprint(), before);
});
test("upkeep a territory cannot pay: all its units go and it keeps nothing; a territory that can pay keeps its units", () => {
  for (const style of ["ours", "classic"]) {
    const { mid, top, low } = rows(style), p = made({ style, seat: 1, land: [[mid[0], mid[1], mid[2], low[0], low[1], top[3]], [top[0], top[1]]], halls: [[mid[0], 0], [low[0], 20], [top[0], 0]], units: [[mid[2], 3], [low[1], 1], [top[3], 1]] });
    const poor = territories(p, 0).find((t) => t.hall === mid[0]), rich = territories(p, 0).find((t) => t.hall === low[0]);
    assert.ok(poor.purse + poor.net < 0 && rich.purse + rich.net >= 0, "the board is set as meant");
    const { position: q, events } = until(p, 0);
    assert.equal(q.unit[mid[2]], 0); assert.equal(q.purse[mid[0]], 0);
    assert.deepEqual(events.find((e) => e.kind === "starve" && e.seat === 0).cells, [mid[2]]);
    assert.equal(q.tree[mid[2]], q.rule.woods === "none" ? 0 : CAIRN, "a starved unit leaves a cairn where woods grow");
    assert.equal(q.unit[low[1]], 1); assert.equal(q.purse[low[0]], 20 + rich.net);
    assert.equal(q.unit[top[3]], 0, "a lone unit with no territory disbands"); assert.ok(events.some((e) => e.kind === "stranded" && e.cells.includes(top[3])));
    assert.ok(upkeepOf(q, 3) > upkeepOf(q, 1));
  }
});
test("a take needs a higher rank than what guards the place", () => {
  const p = (rank) => made({ land: [[mid[0], mid[1], mid[2]], [mid[3], mid[4], mid[5]]], halls: [[mid[0], 0], [mid[5], 0]], units: [[mid[2], rank], [mid[4], 1]] });
  assert.equal(defence(p(1), mid[3]), 1);
  assert.ok(!fable.moves(p(1)).some((x) => x.to === mid[3]), "equal rank is not enough");
  assert.ok(fable.moves(p(2)).some((x) => x.do === "move" && x.from === mid[2] && x.to === mid[3]));
  const q = act(p(2), { do: "move", from: mid[2], to: mid[3] }).position;
  assert.equal(q.owner[mid[3]], 0); assert.equal(q.unit[mid[3]], 2); assert.equal(q.left, p(2).left - 1);
  assert.ok(!fable.moves(q).some((x) => x.from === mid[3]), "a unit moves once a turn");
});
test("cutting a territory in two: the part without the hall gets a new one with no money", () => {
  const p = made({ land: [[up[1], up[2]], mid.slice(1, 6)], halls: [[up[1], 0], [mid[1], 12]], units: [[up[2], 2]] });
  const { position: q, events } = act(p, { do: "move", from: up[2], to: mid[3] });
  const t = territories(q, 1);
  assert.equal(t.length, 2); assert.deepEqual(t.map((x) => x.purse).sort((x, y) => x - y), [0, 12]); assert.ok(t.every((x) => q.hall[x.hall]));
  assert.ok(events.some((e) => e.kind === "split" && e.seat === 1));
});
test("joining two territories keeps one hall and pools what is in both purses", () => {
  const p = made({ land: [[mid[0], mid[1], mid[3], mid[4]], [low[0], low[1]]], halls: [[mid[0], 7], [mid[4], 9], [low[0], 0]] });
  const q = act(p, { do: "raise", hall: mid[4], to: mid[2] }).position, t = territories(q, 0);
  assert.equal(t.length, 1); assert.equal(t[0].purse, 7 + 9 - raiseOf(p));
});
test("a turn passes when its actions are used, or when it is ended", () => {
  const p = made({ land: [mid.slice(0, 5), [low[0], low[1]]], halls: [[mid[0], 99], [low[0], 0]] });
  /** A new turn has begun: the place in the round moved on and the actions are full again. Who it is depends on the turn order. */
  const passed = (q) => { assert.ok(q.step !== p.step || q.round !== p.round, "the turn passed"); assert.equal(q.left, q.rule.actions); };
  let q = p;
  for (let i = 0; i < p.rule.actions; i++) {
    assert.equal(q.seat, 0); assert.equal(q.step, p.step); assert.equal(q.left, p.rule.actions - i);
    q = fable.apply(q, fable.moves(q).find((x) => x.do === "raise"), chance(seedState("a" + i))).position;
  }
  passed(q);
  passed(fable.apply(p, { do: "end" }, chance(seedState("e"))).position);
});
test("reaching the goal wins at once, in the middle of a turn", () => {
  const cells = tiny.owner.map((_, i) => i), need = goalOf(made({ land: [[], []] })) - 1;
  const p = made({ land: [cells.slice(0, need), cells.slice(-2)], halls: [[0, 20], [cells.at(-1), 0]] });
  assert.equal(groupsOf(p, 0).length, 1);
  const raise = fable.moves(p).find((x) => x.do === "raise" && p.owner[x.to] === NONE), q = fable.apply(p, raise, chance(seedState("g"))).position;
  assert.deepEqual(q.over.winners, [0]); assert.equal(q.seat, 0); assert.equal(fable.turn(q), null);
});
test("a game where nobody does anything ends after its rounds, and everyone with the most land wins", () => {
  for (const seats of [2, 3]) {
    const m = passive(createMatch(fable, { seed: "idle", options: { seats, style: "ours", rounds: 10 } })), p = m.position;
    const most = Math.max(...Array.from({ length: seats }, (_, s) => cellsOf(p, s)));
    assert.ok(p.over); assert.equal(p.round, p.rounds + 1);
    assert.deepEqual(m.result.winners, Array.from({ length: seats }, (_, s) => s).filter((s) => cellsOf(p, s) === most));
    replays(m, [fable]);
  }
});
