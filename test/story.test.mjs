// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo's turn reader and hard line, held to replies written the ways real chat models write them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isoDate, newWorldGame, readWorldReply, turnCode } from "../src/story/turn.js";
import { crosses } from "../src/story/line.js";

const g = newWorldGame("PER", "nation", "abcdef123");
const code = turnCode(g), to = "2027-01-01";
const known = (c) => ["PER", "CHL", "BOL", "BRA", "USA", "SDS"].includes(c);
const names = { peru: "PER", chile: "CHL", bolivia: "BOL", brazil: "BRA", "united states": "USA" };
const codeOf = (s) => names[String(s || "").trim().toLowerCase()] || "";
const read = (text) => readWorldReply(text, g, known, to, false, codeOf);

test("plain replies are read", () => {
  const r = read(`TURN: ${code}\nEVENT: 2026-12-04 | PER | Lima opens talks with Santiago about the northern ports.\nSUMMARY: Talks begin.\nEND`);
  assert.equal(r.matched, true);
  assert.equal(r.events.length, 1);
  assert.equal(r.summary, "Talks begin.");
});

test("chat formatting is forgiven: bold labels, numbering, bullets, pipes, a chatty preface", () => {
  const r = read([
    "Sure! Here is the turn:",
    `**TURN:** ${code} (Peru, December)`,
    `1. **EVENT:** 2026-12-04 | PER | Lima opens talks with Santiago about the northern ports.`,
    `- EVENT: 2026-12-10 | Chile | Santiago answers that it is willing to talk but not about sovereignty.`,
    `| EVENT: December 15, 2026 | BOL | La Paz protests at being left out of the talks. |`,
    `* NEWS: a Lima daily | Ports talks open | Exporters are hopeful.`,
    `MOVE: m1 | 1 | Peru | TREATY | Chile | trade`,
    "**SUMMARY:** A month of talks.",
  ].join("\n"));
  assert.equal(r.matched, true);
  assert.deepEqual(r.events.map((e) => [e.date, e.at]), [["2026-12-04", "PER"], ["2026-12-10", "CHL"], ["2026-12-15", "BOL"]]);
  assert.equal(r.news.length, 1);
  assert.deepEqual([r.moves[0].country, r.moves[0].verb, r.moves[0].target], ["PER", "TREATY", "CHL"]);
  assert.equal(r.summary, "A month of talks.");
});

test("a reply for another turn is not read", () => {
  assert.equal(read("TURN: t9-zzzzzz\nEVENT: 2026-12-04 | PER | Something happens in Lima that is long enough.").matched, false);
});

test("events outside the turn, off the map, or crossing the hard line are dropped with a reason", () => {
  const r = read([`TURN: ${code}`, "EVENT: 2027-02-01 | PER | Too late for this turn, after its last day.", "EVENT: 2026-12-05 | XXX | Somewhere not on the map does something.", "EVENT: 2026-12-06 | PER | Lima is calm and the markets are steady."].join("\n"));
  assert.equal(r.events.length, 1);
  assert.equal(r.dropped.length, 2);
});

test("dates in words", () => {
  assert.equal(isoDate("December 5, 2026"), "2026-12-05");
  assert.equal(isoDate("5 December 2026"), "2026-12-05");
  assert.equal(isoDate("5th Dec 2026"), "2026-12-05");
  assert.equal(isoDate("2026/12/5"), "2026-12-05");
  assert.equal(isoDate("soon"), "");
});

test("the hard line passes ordinary statecraft and refuses what it must", () => {
  for (const ok of ["Give explicit orders to protect the children's hospital", "Make an explicit threat to Chile over the boys held at the border", "Ban child labour and publish explicit penalties", "Fund sex education for teens", "Prosecute those who sexually abuse children"]) assert.equal(crosses(ok), false, ok);
  for (const no of ["Arrange a sexual encounter with a 14 year old", "Sexual content with a 15-year-old", "Write an erotic scene with a teen to protect the nation", "Hold a nude photo shoot with someone aged 12"]) assert.equal(crosses(no), true, no);
});

import { checkSave, restoreGame, snapGame } from "../src/story/saves.js";

test("saves are checked before use: junk is refused, parts off the map are dropped", () => {
  const isProvince = (id) => ["PER-1", "CHL-2"].includes(id), isCountry = known;
  assert.equal(checkSave(null, isProvince, isCountry), null);
  assert.equal(checkSave({ v: 1, player: "ZZZ", mode: "nation", date: "2026-12-01", turn: 1, seed: "x" }, isProvince, isCountry), null);
  assert.equal(checkSave({ v: 1, player: "PER", mode: "nation", date: "soon", turn: 1, seed: "x" }, isProvince, isCountry), null);
  const s = checkSave({ v: 1, player: "PER", mode: "nation", date: "2026-12-01", turn: 3, seed: "x", owners: { "PER-1": "CHL", "NOPE-9": "PER", "CHL-2": "XXX" }, log: "not a list" }, isProvince, isCountry);
  assert.deepEqual(s.owners, { "PER-1": "CHL" });
  assert.deepEqual(s.log, []);
  assert.deepEqual(s.wars, []);
});

test("take-back records leave the log out and restore it by length", () => {
  const game = { ...newWorldGame("PER", "nation", "abcdef123"), log: [{ a: 1 }, { a: 2 }] };
  const rec = snapGame(game, "turn 2");
  assert.equal(rec.log, undefined);
  const later = [...game.log, { a: 3 }];
  assert.deepEqual(restoreGame(rec, later).log, [{ a: 1 }, { a: 2 }]);
});

// ---- the check and the attack on it (ruling 124, step M0) ----
import { HIGH, LOW, RULES, bandOf, chanceOf, drawKey, odds, oddsLine, replays } from "../src/story/check.js";
import { draw100 } from "../src/story/line.js";
import { adviceFor, applyMoves, attackPlan, commandOf, commanders } from "../src/story/worldrules.js";
import { convertNote } from "../src/story/saves.js";

test("the check: 50 + 10 x (skill - difficulty) + approach + parts, held between 10 and 75", () => {
  assert.deepEqual([LOW, HIGH], [10, 75]);
  assert.equal(chanceOf({ skill: 3, difficulty: 3 }).chance, 50);
  assert.equal(chanceOf({ skill: 4, difficulty: 3, approach: ["bold", 10], parts: [["its own land", 15], ["by open sea", -10]] }).chance, 75);
  assert.equal(chanceOf({ skill: 5, difficulty: 4, parts: [["x", 6]] }).chance, 66);
  assert.equal(chanceOf({ skill: 10, difficulty: 2 }).chance, 75, "never above 75: no plan is certain");
  assert.equal(chanceOf({ skill: 2, difficulty: 10 }).chance, 10, "never below 10");
  assert.equal(chanceOf({ skill: 10, difficulty: 2 }).raw, 130, "the unclamped sum is kept");
  assert.throws(() => chanceOf({ skill: 3, difficulty: 3, parts: [["a", 1], ["b", 1], ["c", 1], ["d", 1], ["e", 1]] }), /at most 4/);
  assert.throws(() => chanceOf({ skill: 3, difficulty: 3, parts: [["luck", 0.5]] }), /whole number/);
  assert.equal(chanceOf({ skill: 3, difficulty: 3, parts: [["", 0], ["a", 5]] }).parts.length, 1, "zero parts are left out");
});

test("three bands, and the odds shown are exactly what the rolls do", () => {
  assert.deepEqual([bandOf(60, 60), bandOf(60, 61), bandOf(60, 80), bandOf(60, 81)], ["clean", "costly", "costly", "failed"]);
  for (let chance = LOW; chance <= HIGH; chance++) {
    const count = { clean: 0, costly: 0, failed: 0 };
    for (let roll = 1; roll <= 100; roll++) count[bandOf(chance, roll)]++;
    assert.deepEqual(count, odds(chance), `chance ${chance}`);
  }
  assert.deepEqual(odds(75), { clean: 75, costly: 20, failed: 5 }, "at the cap, 5 in 100 still fail");
  assert.deepEqual(odds(10), { clean: 10, costly: 20, failed: 70 });
  assert.equal(oddsLine(55), "clean 55 in 100, costly 20, failed 25");
});

test("named draws: whole numbers 1 to 100, stable, even, and independent of each other", () => {
  assert.equal(draw100("seed", "a"), draw100("seed", "a"));
  const seen = new Array(101).fill(0);
  let same = 0, prev = 0;
  for (let i = 0; i < 100000; i++) {
    const r = draw100("seed", drawKey({ turn: i, mission: "attack:X-1:PER", checkpoint: "battle", person: "Ana" }));
    assert.ok(Number.isInteger(r) && r >= 1 && r <= 100);
    seen[r]++; if (r === prev) same++; prev = r;
  }
  for (let v = 1; v <= 100; v++) assert.ok(seen[v] > 850 && seen[v] < 1150, `value ${v} came ${seen[v]} times`);
  assert.ok(same > 800 && same < 1200, `neighbouring keys repeat about 1 in 100 (${same})`);
  // each roll is named by turn, mission, checkpoint and person: one name changing leaves the other rolls alone
  const k = { turn: 4, mission: "attack:CHL-1:PER", checkpoint: "battle", person: "Ana" };
  const other = drawKey({ ...k, mission: "attack:CHL-2:PER" }), before = draw100("s", other);
  assert.notEqual(drawKey(k), drawKey({ ...k, person: "Bea" }));
  assert.notEqual(drawKey(k), drawKey({ ...k, checkpoint: "escape" }));
  assert.equal(draw100("s", other), before);
  let differ = 0;
  for (let i = 0; i < 100; i++) if (draw100(`game-${i}`, drawKey(k)) !== draw100(`game-${i + 1}`, drawKey(k))) differ++;
  assert.ok(differ > 90, "different games draw differently");
});

// a small world: Peru (might 3) beside Chile (might 4), Chile's second province behind its first
const P = { "PER-1": { name: "Tacna", country: "PER" }, "CHL-1": { name: "Arica", country: "CHL" }, "CHL-2": { name: "Iquique", country: "CHL" } };
const NB = { "PER-1": ["CHL-1"], "CHL-1": ["PER-1", "CHL-2"], "CHL-2": ["CHL-1"] };
const geoOf = (g) => {
  const owner = (id) => g.owners[id] || P[id].country;
  return { name: (c) => ({ PER: "Peru", CHL: "Chile" })[c] || c, place: (id) => P[id], find: (s) => (P[s] ? s : null), owner, neighbours: (id) => NB[id], across: () => [], coastal: () => false,
    holds: (c) => Object.keys(P).filter((id) => owner(id) === c).length, known: (c) => ["PER", "CHL"].includes(c), hasCoast: () => false, might: (c) => ({ PER: 3, CHL: 4 })[c] };
};
const warGame = (seed, extra = {}) => ({ ...newWorldGame("PER", "nation", seed), wars: [{ pair: "CHL|PER", since: "2026-12-01", by: "PER" }], ...extra });
const council = { seats: { war: { name: "Iva Rojas", skill: 5, favour: 0, likes: [], hates: [] }, treasury: null, foreign: { name: "Ana Ruiz", skill: 4, favour: 0, likes: [], hates: [] }, home: null, outsider: null }, trusted: null, former: [] };
const attackMove = { action: 1, country: "PER", verb: "ATTACK", target: "CHL-1", detail: "" };

test("the attack: might, a commander from the council, an approach; the preview is the roll's own chance", () => {
  const g = warGame("seed-a", { council: structuredClone(council), orders: [{ text: "a", target: "CHL-1", seat: "war", approach: "bold" }] }), geo = geoOf(g);
  const iva = commandOf(g, g.council.seats.war), ana = commandOf(g, g.council.seats.foreign);
  assert.ok(Number.isInteger(iva) && iva >= 1 && iva <= 5, "command is dealt by rule, 1 to 5");
  assert.equal(commandOf(g, { name: "Iva Rojas", skill: 1 }), iva, "the AI's skill does not move it");
  assert.deepEqual(commanders(g).map((c) => [c.seat, c.off]), [["war", false], ["foreign", true], ["generals", false]]);
  const a = attackPlan(g, geo, "PER", "CHL-1", g.orders[0]);
  assert.equal(a.chance, Math.max(10, Math.min(75, 50 + 10 * (3 - 4) + 10 + 2 * iva)));
  assert.equal(attackPlan(g, geo, "PER", "CHL-1", { seat: "foreign", approach: "steady" }).chance, Math.max(10, 40 + 2 * ana - 10), "outside the war seat, -10");
  assert.equal(attackPlan(g, geo, "CHL", "PER-1", { seat: "war", approach: "bold" }).chance, 50 + 10 + 6, "a rival leads with its generals (command 3), steady");
  assert.equal(attackPlan(g, geo, "PER", "CHL-2").ok, false, "only next to land it holds");
  assert.equal(attackPlan(g, geo, "PER", "CHL-1", { approach: "patient" }, 1).approach, "steady", "too short a turn for patience");
  const receipt = applyMoves(g, [attackMove], geo, ["Attack Arica"], 1);
  assert.equal(receipt[0].check.chance, a.chance);
  assert.equal(receipt[0].check.roll, draw100("seed-a", "1:attack:CHL-1:PER:battle:Iva Rojas"));
});

test("a converted attack replays: same game, same receipt; the stored beat recomputes", () => {
  for (const seed of ["r1", "r2", "r3", "r4", "r5"]) {
    const run = () => { const g = warGame(seed, { council: structuredClone(council) }); return { r: applyMoves(g, [attackMove, attackMove], geoOf(g), ["x"], 2), owners: g.owners }; };
    const one = run();
    assert.deepEqual(run(), one);
    assert.ok(replays(seed, one.r[0].check));
    assert.equal(replays(seed, { ...one.r[0].check, roll: (one.r[0].check.roll % 100) + 1 }), false, "a changed roll is caught");
  }
  // an old save (no rules number, no orders) is converted, not refused, and then plays on the check
  const old = warGame("old-1");
  delete old.rules; delete old.orders;
  assert.match(convertNote(old), /brought up to date/);
  const g = checkSave(old, (id) => !!P[id], (c) => ["PER", "CHL"].includes(c));
  assert.equal(g.rules, RULES);
  assert.deepEqual(g.orders, []);
  assert.equal(convertNote(g), "");
  assert.ok(applyMoves(g, [attackMove], geoOf(g), ["x"], 1)[0].check);
});

test("receipts read right: one sentence, whole numbers, the result in words", () => {
  const found = {};
  for (let i = 0; i < 400 && Object.keys(found).length < 3; i++) {
    const g = warGame(`text-${i}`, { council: structuredClone(council) }), r = applyMoves(g, [attackMove], geoOf(g), ["x"], 1)[0];
    found[r.check.band] ||= { r, g };
  }
  const { clean, costly, failed } = found, c = (x) => x.r.check;
  assert.equal(clean.r.text, `Peru: attacks Arica and takes it from Chile cleanly (might 3 against 4, commander Iva Rojas +${2 * commandOf(clean.g, council.seats.war)}: chance ${c(clean).chance}; drew ${c(clean).roll}; clean)`);
  assert.match(costly.r.text, /^Peru: attacks Arica and takes it from Chile, but its army is spent for the turn \(might 3 against 4, commander Iva Rojas \+\d+: chance \d+; drew \d+; costly\)$/);
  assert.match(failed.r.text, /^Peru: attacks Arica and is thrown back \(might 3 against 4, commander Iva Rojas \+\d+: chance \d+; drew \d+; failed\)$/);
  for (const { r } of [clean, costly, failed]) assert.doesNotMatch(r.text, /\d\.\d|\.\s/, "no fractions and no second sentence");
  // counsel is a whole number, at most 5
  const adv = warGame("c", { council: structuredClone(council), log: [{ advice: { word: "favourable", name: "Iva Rojas" } }] });
  adv.council.seats.war.record = { right: 2, n: 3 };
  assert.equal(adviceFor(adv).nudge, Math.floor((5 * 66 * 2 + 100) / 200));
  adv.council.seats.war.record = { right: 3, n: 3 };
  assert.equal(adviceFor(adv).nudge, 5);
});

test("a costly win spends the army for the turn; a failed bold attack costs its commander one favour", () => {
  let bold = null, costly = null;
  const twoFronts = { ...NB, "PER-1": ["CHL-1", "CHL-2"], "CHL-2": ["CHL-1", "PER-1"] };
  for (let i = 0; i < 400 && (!bold || !costly); i++) {
    const g = warGame(`b-${i}`, { council: structuredClone(council), orders: [{ text: "a", target: "CHL-1", seat: "war", approach: "bold" }] }), geo = geoOf(g);
    geo.neighbours = (id) => twoFronts[id];
    const r = applyMoves(g, [attackMove, { ...attackMove, target: "CHL-2" }], geo, ["x"], 3);
    if (!bold && r[0].check.band === "failed") bold = { r, g };
    if (!costly && r[0].check.band === "costly") costly = { r, g };
  }
  assert.equal(bold.g.council.seats.war.favour, -1);
  assert.ok(bold.r.some((x) => x.text === "Iva Rojas: loses favour after the failed bold attack (favour -1)"));
  assert.equal(costly.r[1].ok, false);
  assert.match(costly.r[1].text, /refused: its army is spent after a costly victory this turn/);
});
