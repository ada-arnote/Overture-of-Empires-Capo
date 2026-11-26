// SPDX-License-Identifier: AGPL-3.0-or-later
// The Island Fable, as its rules stand. These check what should survive coming tweaks to prices and turn order:
// no win rates, wages, turn orders or whole-game fingerprints are written down here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chance, createMatch, packGame, seedState, unpackGame } from "../src/core/index.js";
import { CAIRN, EXPANSIONS, NONE, SAFETY, SWITCHES, WOOD, act, beats, boardOf, cellsOf, defence, fable, goalOf, groupsOf, raiseOf, territories, topOf, upkeepOf } from "../src/games/fable/rules.js";
import { TIERS, choose, hopeless, keen, value } from "../src/games/fable/bot.js";
import { villageName } from "../src/games/fable/names.js";
import { ISLANDS, island, open, step, stepOf } from "../src/games/fable/ladder.js";
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
    if (x.to === undefined || p.owner[x.to] === p.seat) continue;
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
  for (const bad of [{ do: "concede" }, { do: "raise", hall: theirs.hall, to: empty }, { do: "raise", hall: mine.hall, to: sea }, { do: "raise", hall: mine.hall, to: theirs.hall }, { do: "move", from: empty, to: mine.cells.find((c) => c !== empty && !p.hall[c]) }, { do: "fort", hall: mine.hall, to: empty }, { do: "end", now: 1 }, { do: "fly" }]) {
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

// Traditional's genre rules: free steps at home, joining and striking, the last one standing, conceding.
const cl = rows("classic"), play = (p, m) => fable.apply(p, m, chance(seedState("t"))).position;
/** A strip of land in the middle row of the Traditional island, with the sea all round: seat 0 holds the west, seat 1 the east. */
function strip({ mine = 4, theirs = 3, purse = 7, units = [], style = "classic", ...over }) {
  const land = cl.mid.slice(0, mine + theirs), p = made({ style, land: [land.slice(0, mine), land.slice(mine)], halls: [[land[0], purse], [land.at(-1), 0]], units, ...over });
  p.water = p.water.map((_, c) => (land.includes(c) ? 0 : 1));
  return p;
}
test("free movement: a step inside your own land leaves the unit ready, in Traditional only; taking land or clearing a wood ends its turn", () => {
  const { mid } = cl, p = strip({ units: [[mid[1], 2]] });
  const q = act(p, { do: "move", from: mid[1], to: mid[2] }).position;
  assert.equal(q.moved[mid[2]], 0);
  assert.ok(fable.moves(q).some((x) => x.do === "move" && x.from === mid[2] && x.to === mid[4]), "it can still take");
  const r = act(q, { do: "move", from: mid[2], to: mid[4] }).position;
  assert.equal(r.owner[mid[4]], 0); assert.equal(r.moved[mid[4]], 1);
  assert.ok(!fable.moves(r).some((x) => x.from === mid[4]), "a unit that took land is done");
  const wood = strip({ units: [[mid[1], 2]] }); wood.tree[mid[3]] = WOOD;
  assert.equal(act(wood, { do: "move", from: mid[1], to: mid[3] }).position.moved[mid[3]], 1, "clearing a wood ends its turn");
  const once = { ...p, rule: { ...p.rule, walk: "once" } };
  assert.equal(act(once, { do: "move", from: mid[1], to: mid[2] }).position.moved[mid[2]], 1, "with the switch off, any move uses the unit");
  const capo = createMatch(fable, { seed: "c", options: { seats: 2, style: "ours" } }).position;
  assert.equal(capo.rule.walk, "once", "Capo keeps its own rule");
});
test("merging: two ready units join into one that can still strike; joining a unit that has acted gives one that has acted", () => {
  const { mid } = cl, p = strip({ units: [[mid[1], 1], [mid[2], 1], [mid[5], 1]] });
  assert.ok(!fable.moves(p).some((x) => x.to === mid[4] && x.do === "move"), "no scout alone takes a guarded hex");
  const q = act(p, { do: "move", from: mid[1], to: mid[2] }).position;
  assert.equal(q.unit[mid[2]], 2); assert.equal(q.moved[mid[2]], 0);
  assert.ok(fable.moves(q).some((x) => x.do === "move" && x.from === mid[2] && x.to === mid[4]));
  const tired = strip({ units: [[mid[1], 1], [mid[2], 1]] }); tired.moved[mid[2]] = 1;
  assert.equal(act(tired, { do: "move", from: mid[1], to: mid[2] }).position.moved[mid[2]], 1);
  const raised = act(strip({ purse: 20 }), { do: "raise", hall: mid[0], to: mid[2] }).position;
  assert.equal(raised.moved[mid[2]], 0, "a new scout at home can act at once");
});
test("the bot joins two scouts, then strikes with the result", () => {
  const { mid } = cl;
  let p = strip({ units: [[mid[1], 1], [mid[2], 1], [mid[5], 1]] });
  const dice = chance(seedState("join")), seen = [];
  for (let i = 0; i < 20 && p.seat === 0 && !p.over; i++) { const made = fable.apply(p, choose(p, dice, "normal"), dice); seen.push(...made.events); p = made.position; }
  assert.ok(seen.some((e) => e.kind === "merge" && !e.raised), "it joined at home");
  assert.equal(p.owner[mid[4]], 0, "and took the guarded hex");
});
test("Traditional is played to the last one standing: a big lead does not end it; taking the last rival hex does", () => {
  const { mid } = cl, all = made({ style: "classic", land: [[], []] }).owner.map((_, c) => c), theirs = [mid[5], mid[6]];
  const p = made({ style: "classic", land: [all.filter((c) => !theirs.includes(c)), theirs], halls: [[mid[0], 0], [mid[6], 0]], units: [[mid[4], 2], [mid[7], 2]] });
  assert.ok(cellsOf(p, 0) * 100 > 90 * all.length && goalOf(p) === all.length);
  const q = play(p, { do: "move", from: mid[4], to: mid[5] });
  assert.equal(q.over, null, "one rival hex left: play goes on");
  const r = play(q, { do: "move", from: mid[7], to: mid[6] });
  assert.deepEqual(r.over.winners, [0]); assert.equal(r.over.why, "the only one left");
});
test("conceding: offered in Traditional, not in Capo; the land is left to claim and the turn passes; the last rival to concede ends the game", () => {
  const m = start(3, "classic", "give"), s = m.position.seat;
  assert.ok(m.legal().some((x) => x.do === "concede"));
  assert.ok(!start(3, "ours").legal().some((x) => x.do === "concede"));
  const events = m.play({ do: "concede" }), p = m.position;
  assert.ok(events.some((e) => e.kind === "concede" && e.seat === s));
  assert.equal(cellsOf(p, s), 0); assert.notEqual(p.seat, s); assert.equal(m.result, null);
  for (const c of events.find((e) => e.kind === "concede").cells) assert.equal(p.owner[c] + 1 + p.unit[c] + p.hall[c] + p.fort[c] + p.purse[c], 0);
  const left = p.seat;
  m.play({ do: "concede" });
  assert.deepEqual(m.result.winners, [0, 1, 2].filter((x) => x !== s && x !== left)); assert.equal(m.result.why, "the only one left");
  replays(m, [fable]);
});
test("bots concede by their plain rule: one rival holds half the island and three times their land", () => {
  const big = made({ style: "classic", land: [[], []] }).owner.map((_, c) => c);
  const p = made({ style: "classic", seat: 1, land: [big.slice(0, Math.ceil(big.length / 2)), big.slice(-5)], halls: [[0, 10], [big.at(-1), 10]] });
  assert.ok(hopeless(p, 1) && !hopeless(p, 0));
  assert.deepEqual(choose(p, chance(seedState("h")), "normal"), { do: "concede" });
  const close = made({ style: "classic", seat: 1, land: [big.slice(0, 30), big.slice(-20)], halls: [[0, 10], [big.at(-1), 10]] });
  assert.ok(!hopeless(close, 1));
});
test("with no round limit a game still ends: after the safety rounds the most land wins", () => {
  const m = passive(createMatch(fable, { seed: "idle", options: { seats: 2, style: "classic" } })), p = m.position;
  assert.equal(p.rule.limit, 0); assert.equal(p.round, SAFETY + 1); assert.ok(m.result.why.includes(String(SAFETY)));
  replays(m, [fable]);
});

// ---- the hard bot, village names and the voyage ----
test("the hard bot reads its rivals: units and purses count against it, but not in a territory that cannot pay", () => {
  const { mid } = cl, starving = strip({ units: [[mid[5], 3]] }), paid = structuredClone(starving);
  paid.purse[mid[6]] = 40;
  assert.ok(territories(starving, 1)[0].purse + territories(starving, 1)[0].net < 0, "the captain cannot be paid");
  assert.equal(keen(starving, 0), value(starving, 0), "a unit that will starve is not counted");
  assert.equal(keen(paid, 0), value(paid, 0) - (30 * 3 + 40), "a paid captain and a full purse are");
  assert.ok(TIERS.includes("hard"));
});
test("the hard bot plays whole games in Traditional: every move legal, an end, and the save replays", () => {
  for (const n of [2, 3]) {
    const m = botGame(fable, choose, { seed: `hard ${n}`, options: { seats: n, style: "classic", size: "small" }, tiers: ["hard", "normal", "hard"], each: sound });
    ended(m, n);
    replays(m, [fable]);
  }
});
test("the hard bot beats the normal one more often than not, over 40 small duels with the seats swapped", { skip: slowOnly }, () => {
  let won = 0;
  for (let i = 0; i < 40; i++) {
    const hero = i % 2, m = botGame(fable, choose, { seed: `duel ${i}`, options: { seats: 2, style: "classic", size: "small" }, tiers: hero ? ["normal", "hard"] : ["hard", "normal"] });
    if (ended(m, 2).winners.includes(hero)) won++;
  }
  assert.ok(won > 20, `hard won ${won} of 40`);
});
test("village names: every hex of the largest island would give a different one, and a seed gives the same names again", () => {
  const p = createMatch(fable, { seed: "names", options: { seats: 6, style: "classic", size: "huge" } }).position, q = createMatch(fable, { seed: "names", options: { seats: 6, style: "classic", size: "huge" } }).position;
  const all = p.owner.map((_, c) => villageName(p, c));
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.every((n) => /^[A-Z][a-z]+$/.test(n)));
  assert.deepEqual(all, q.owner.map((_, c) => villageName(q, c)));
});
test("the voyage: 24 steps that never ease, each a legal Traditional game for one player, grown the same way every time", () => {
  const rank = { gentle: 0, easy: 1, normal: 2, hard: 3 }, hardness = (v) => v.kinds.slice(1).reduce((n, k) => n + rank[k] + 1, 0);
  assert.equal(ISLANDS, 24);
  assert.equal(new Set(Array.from({ length: ISLANDS }, (_, i) => step(i + 1).name)).size, ISLANDS, "every island has its own name");
  const seas = [0, 1, 2, 3].map((s) => Array.from({ length: 6 }, (_, i) => step(s * 6 + i + 1)));
  for (let s = 1; s < 4; s++) {
    assert.ok(seas[s].reduce((n, v) => n + hardness(v), 0) > seas[s - 1].reduce((n, v) => n + hardness(v), 0), "each sea's rivals are harder than the last sea's");
    assert.ok(Math.min(...seas[s].flatMap((v) => v.kinds.slice(1).map((k) => rank[k]))) >= Math.min(...seas[s - 1].flatMap((v) => v.kinds.slice(1).map((k) => rank[k]))));
  }
  for (let n = 1; n <= ISLANDS; n++) {
    const v = step(n);
    assert.equal(v.kinds[0], "you"); assert.equal(v.kinds.length, v.seats); assert.equal(v.options.style, "classic");
    assert.ok(v.kinds.slice(1).every((k) => k in rank) && v.par >= 10);
    assert.equal(createMatch(fable, { seed: `check ${n}`, options: v.options }).position.seats, v.seats, "its options are ones the game takes");
  }
  for (const n of SLOW ? Array.from({ length: ISLANDS }, (_, i) => i + 1) : [1, 7, 13]) {
    const v = island(n), again = island(n);
    assert.equal(stepOf(v.seed), n); assert.equal(v.seed, again.seed);
    assert.equal(createMatch(fable, { seed: v.seed, options: v.options }).position.seat, 0, "the player moves first in round 1");
  }
  assert.equal(stepOf("series 4"), 0); assert.equal(stepOf("voyage 99 a"), 0);
  assert.equal(open([]), 2); assert.equal(open([1, 2]), 4); assert.equal(open([24]), 24);
});
test("the voyage deals an early step kindly and a late one evenly: of six islands grown, the kept one is never one of the two worst for the player", () => {
  const hand = (p, s) => { const ts = territories(p, s); return ts.reduce((n, t) => n + 2 * t.cells.length + t.purse, 0) + 4 * Math.max(0, ...ts.map((t) => t.cells.length)); };
  for (const n of [1, 19]) {
    const v = island(n), edges = [..."abcdef"].map((t) => { const p = createMatch(fable, { seed: `voyage ${n} ${t}`, options: v.options }).position; let rest = 0; for (let s = 1; s < v.seats; s++) rest += hand(p, s); return [`voyage ${n} ${t}`, hand(p, 0) * (v.seats - 1) - rest]; }).sort((a, b) => b[1] - a[1]);
    const place = edges.findIndex(([seed]) => seed === v.seed), mine = edges[place][1];
    assert.ok(edges.filter(([, e]) => e < mine).length >= 2 || place <= 3, `step ${n} kept place ${place + 1} of 6`);
    if (n === 1) assert.equal(mine, edges[0][1], "the first step keeps the kindest");
  }
});
test("a game by link may seat a hard bot", () => {
  const m = createMatch(fable, { seed: "link", options: { seats: 2, style: "ours" } }), look = [[0, 0], [4, 1]];
  assert.deepEqual(unpackGame(packGame(m, ["host", "hard"], look), [fable]).roles, ["host", "hard"]);
});
