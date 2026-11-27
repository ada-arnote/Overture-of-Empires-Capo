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
  const dealt = commandOf(adv, adv.council.seats.war);
  assert.equal(adviceFor(adv).nudge, Math.floor((dealt * 66 * 2 + 100) / 200));
  adv.council.seats.war.record = { right: 3, n: 3 };
  assert.equal(adviceFor(adv).nudge, dealt, "counsel weighs by the skill the rules dealt");
  adv.council.seats.war.skill = dealt === 5 ? 1 : 5;
  assert.equal(adviceFor(adv).nudge, dealt, "a skill number from the AI moves nothing");
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

// ---- Phase 4, first build: one skill by rule, take-backs on numbered lines, the chronicle, rules that answer ----
import { closeTurn, worldPrompt } from "../src/story/turn.js";
import { ownMoves, turnKey } from "../src/story/worldrules.js";
import { takeBack } from "../src/story/saves.js";
import { askPrompt, chatPrompt, councilPrompt, readCouncil, seatsFor } from "../src/story/talk.js";
import { KEEP, chronicleFrom, chronicleLines, factWords, factsOf, joinFacts } from "../src/story/chronicle.js";
import { NEED, monthsApart, relOf, relWord, relationLines, settleRelations, treatyAnswer } from "../src/story/relations.js";

// a wider world for diplomacy: Peru, Chile, Bolivia and Brazil, each with land
const P4 = { ...P, "BOL-1": { name: "La Paz", country: "BOL" }, "BRA-1": { name: "Acre", country: "BRA" }, "BRA-2": { name: "Rondonia", country: "BRA" } };
const NB4 = { ...NB, "PER-1": ["CHL-1", "BOL-1", "BRA-1"], "BOL-1": ["PER-1", "BRA-1", "CHL-1"], "BRA-1": ["PER-1", "BOL-1", "BRA-2"], "BRA-2": ["BRA-1"], "CHL-1": ["PER-1", "CHL-2", "BOL-1"] };
const MIGHT4 = { PER: 3, CHL: 4, BOL: 2, BRA: 6 }, NAMES4 = { PER: "Peru", CHL: "Chile", BOL: "Bolivia", BRA: "Brazil" };
const name4 = (c) => NAMES4[c] || c, might4 = (c) => MIGHT4[c];
const geo4 = (g) => {
  const owner = (id) => g.owners[id] || P4[id].country;
  return { name: name4, place: (id) => P4[id], find: (s) => (P4[s] ? s : null), owner, neighbours: (id) => NB4[id], across: () => [], coastal: () => false,
    holds: (c) => Object.keys(P4).filter((id) => owner(id) === c).length, known: (c) => !!NAMES4[c], hasCoast: () => false, might: might4 };
};
const game4 = (seed, extra = {}) => ({ ...newWorldGame("PER", "nation", seed), ...extra });
const reply = (g, moves = [], months = 1, summary = "A quiet month.") => {
  const d = new Date(`${g.date}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + months);
  return { moves, events: [], news: [], summary, dropped: [], advice: null, standing: null, stop: d.toISOString().slice(0, 10) };
};
const mv = (country, verb, target, detail = "", action = 0) => ({ action, country, verb, target, detail });

test("the council: one skill a person, dealt by the rules; a skill from the AI is neither asked for nor kept", () => {
  const g = game4("council-1"), seats = seatsFor(g);
  assert.doesNotMatch(councilPrompt(g, { name: name4 }, seats), /skill/i, "the AI is not asked for a skill");
  const got = readCouncil(["MEMBER: war | Iva Rojas | blunt, loyal | 5 | a bigger army | ATTACK | PEACE", "MEMBER: foreign | Ana Ruiz | patient, sly | open borders | TREATY | WAR", "MEMBER: Treasurer | Leo Paz | dry, exact | skill 4 of 5 | a full treasury | - | WAR"].join("\n"), seats);
  assert.deepEqual(Object.keys(got), ["war", "foreign", "treasury"]);
  for (const m of Object.values(got)) assert.equal(m.skill, undefined, "no skill is kept from the reply");
  assert.deepEqual([got.war.wants, got.war.likes, got.war.hates], ["a bigger army", ["ATTACK"], ["PEACE"]], "a reply in the old shape, with a skill number, still reads");
  assert.deepEqual([got.foreign.wants, got.foreign.likes], ["open borders", ["TREATY"]]);
  assert.equal(got.treasury.wants, "a full treasury");
  g.council = { seats: { ...Object.fromEntries(seats.map(([k]) => [k, null])), ...got }, trusted: null, former: [] };
  const dealt = commandOf(g, got.war);
  assert.match(askPrompt(g, { name: name4 }, [["war", got.war]], "Shall we?"), new RegExp(`Iva Rojas, blunt, loyal; skill ${dealt} of 5`), "advisers are described by the skill the rules dealt");
});

test("take-back: a turn with a settled attack, played again, is on a new numbered line with fresh draws, and says so", () => {
  const start = () => warGame("tb-1", { council: structuredClone(council), actions: ["Attack Arica"] });
  const g = start(), before = snapGame(g, "turn 1");
  const first = closeTurn(g, reply(g, [attackMove]), geoOf(g), ["Attack Arica"]);
  assert.equal(first.receipt[0].check.key, "1:attack:CHL-1:PER:battle:Iva Rojas");
  const back = takeBack(g, before);
  assert.deepEqual([back.turn, back.branch, back.log.length], [1, 1, 0]);
  assert.equal(turnKey(back), "1b1");
  // the same order now draws under the new line's name, whoever leads: the roll that was seen is gone
  const again = closeTurn(back, reply(back, [attackMove]), geoOf(back), ["Attack Arica"]);
  assert.equal(again.receipt[0].check.key, "1b1:attack:CHL-1:PER:battle:Iva Rojas");
  assert.equal(again.receipt[0].check.roll, draw100("tb-1", "1b1:attack:CHL-1:PER:battle:Iva Rojas"));
  assert.ok(replays("tb-1", again.receipt[0].check), "a retaken turn still replays from the seed");
  assert.ok(again.receipt.some((r) => /played again after a take-back, so its checks drew fresh numbers \(line 2 of this game\)/.test(r.text)));
  assert.equal(again.branch, 1);
  assert.equal(back.chron.turns[0].b, 1, "the chronicle marks the line");
  const next = closeTurn(back, reply(back), geoOf(back), []);
  assert.ok(!next.receipt.some((r) => /played again/.test(r.text)), "said once, not every turn");
  // taking back a turn with nothing settled leaves the line alone, and the line number never goes down
  const quiet = snapGame(back, "turn 3");
  closeTurn(back, reply(back), geoOf(back), []);
  assert.equal(takeBack(back, quiet).branch, 1);
  const h = start(), rec = snapGame(h, "turn 1");
  closeTurn(h, reply(h), geoOf(h), []);
  assert.equal(takeBack(h, rec).branch, 0);
});

test("take-back restores by turn number, so it still works once the log has dropped its oldest turns", () => {
  const g = game4("long-1");
  for (let i = 0; i < 64; i++) closeTurn(g, reply(g, [], 1, `Month ${i + 1}.`), geo4(g), []);
  assert.equal(g.log.length, 60);
  const rec = snapGame(g, "turn 65");
  closeTurn(g, reply(g, [], 1, "The month to take back."), geo4(g), []);
  const back = takeBack(g, rec);
  assert.equal(back.turn, 65);
  assert.equal(back.log[back.log.length - 1].summary, "Month 64.");
  assert.ok(!back.log.some((t) => t.summary === "The month to take back."));
});

test("the chronicle is built by code from the receipt: facts first, then how the turn was told", () => {
  const g = game4("chron-1", { actions: ["War on Chile"] });
  const e = closeTurn(g, reply(g, [mv("PER", "WAR", "CHL", "", 1), mv("PER", "ATTACK", "CHL-1", "", 1), mv("BOL", "TREATY", "BRA", "trade")], 3, "Peru marches south."), geo4(g), ["War on Chile"]);
  const facts = factsOf(e.receipt);
  assert.deepEqual(facts.find((f) => f[0] === "war"), ["war", "PER", "CHL"]);
  assert.deepEqual(facts.find((f) => f[0] === "treaty"), ["treaty", "BOL", "BRA", "trade"]);
  const words = factWords(facts, name4);
  assert.match(words, /^Peru declared war on Chile; /);
  assert.match(words, /Bolivia and Brazil signed a trade treaty/);
  assert.deepEqual(joinFacts([[["took", "PER", "CHL", 1], ["took", "PER", "CHL", 1]], [["took", "PER", "CHL", 2], ["war", "PER", "CHL"], ["war", "PER", "CHL"]]]), [["war", "PER", "CHL"], ["took", "PER", "CHL", 4]], "land is counted, the rest named once, the gravest first");
  assert.equal(factWords([["fell", "CHL"], ["took", "PER", "CHL", 4], ["no", "PER", "BRA", "alliance"]], name4), "Chile lost its last land; Peru took 4 provinces from Chile; Brazil refused Peru an alliance treaty");
  const lines = chronicleLines(g, name4);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^- 2026-12-01 to 2027-03-01: Peru declared war on Chile.*\. Peru marches south\.$/);
  assert.match(worldPrompt(g, { name: name4, neighbours: () => ["CHL"], size: () => 1, geo: geo4(g), places: [] }, [], "2027-04-01"), /CHRONICLE \(the story so far[^\n]*\n- 2026-12-01 to 2027-03-01: Peru declared war on Chile/);
  assert.match(chatPrompt(g, { name: name4 }, { with: ["CHL"], messages: [] }, "Talk?"), /The story so far, oldest first:\n - 2026-12-01 to 2027-03-01: Peru declared war on Chile/, "chats carry the same chronicle");
});

test("the chronicle stays the same size however long the game: nine turns, four eras, each clipped", () => {
  const g = game4("chron-2"), world = () => ({ name: name4, neighbours: () => ["CHL", "BOL", "BRA"], size: () => 1, geo: geo4(g), places: ["- PER-1 Tacna (PER; own land)"] });
  const told = "The capital argued about the budget while the border stayed quiet and the papers looked for a scandal to print.";
  const size = {}, chron = {};
  for (let t = 1; t <= 200; t++) {
    // a busy world: a war and a peace every few turns, so the facts are never empty
    const moves = t % 6 === 1 ? [mv("BOL", "WAR", "CHL")] : t % 6 === 4 ? [mv("BOL", "PEACE", "CHL")] : [];
    closeTurn(g, reply(g, moves, 1, `Turn ${t}. ${told}`), geo4(g), []);
    size[t] = worldPrompt(g, world(), [], "2099-01-01").length;
    chron[t] = chronicleLines(g, name4);
    assert.ok(g.chron.turns.length <= KEEP.recent + KEEP.turns && g.chron.eras.length <= KEEP.eras, `turn ${t}`);
  }
  for (const l of chron[200].slice(0, KEEP.eras)) assert.ok(l.length <= KEEP.era + 60, l);
  assert.equal(chron[200].length, KEEP.eras + KEEP.recent + KEEP.turns);
  assert.match(chron[200][0], /turns 1 to /, "the oldest era still reaches back to turn 1");
  assert.match(chron[200][0], /Bolivia declared war on Chile/);
  assert.equal(g.chron.eras[g.chron.eras.length - 1].t1, 191, "every turn older than the newest nine is inside an era");
  // the exit test's bar: the turn-50 prompt within 10 percent of the turn-10 prompt, and no growth after
  const pct = (a, b) => Math.round((100 * (size[a] - size[b])) / size[b]);
  assert.ok(Math.abs(pct(50, 10)) <= 10, `turn 50 is ${pct(50, 10)} percent larger than turn 10`);
  assert.ok(Math.abs(pct(200, 50)) <= 5, `turn 200 is ${pct(200, 50)} percent larger than turn 50`);
  assert.ok(JSON.stringify(g.chron).length < 6000, "and it stays small in the save");
});

test("relations move only by what countries do, one step up a turn, and drift back when left alone", () => {
  const g = game4("rel-1"), G = geo4(g);
  assert.equal(relOf(g, "PER", "BOL"), 0);
  assert.deepEqual([relWord(-3), relWord(0), relWord(3)], ["hostile", "neutral", "close"]);
  applyMoves(g, [mv("BRA", "TREATY", "BOL", "trade"), mv("BRA", "GIVE", "BRA-1", "BOL")], G, [], 1);
  assert.equal(relOf(g, "BOL", "BRA"), 1, "a treaty and a handover in one turn rise one step, not two");
  applyMoves(g, [mv("CHL", "WAR", "BOL")], G, [], 1);
  assert.equal(relOf(g, "CHL", "BOL"), -3);
  assert.equal(relOf(g, "BRA", "CHL"), 0, "a trade partner does not join, and is not moved");
  assert.match(applyMoves(g, [mv("CHL", "PEACE", "BOL")], G, [], 1)[0].text, /asks Bolivia for peace, which refuses .no reason yet to stop: 0, needing 4./, "peace is answered by rule");
  g.wars[0].since = "2024-12-01";
  applyMoves(g, [mv("CHL", "PEACE", "BOL")], G, [], 1);
  assert.equal(relOf(g, "CHL", "BOL"), -2, "peace leaves them bitter");
  applyMoves(g, [mv("BOL", "BREAK", "BRA")], G, [], 1);
  assert.equal(relOf(g, "BOL", "BRA"), -1, "ending a treaty costs two steps");
  assert.equal(g.word.BOL, g.date, "and is remembered");
  // whole months, and the drift: bad relations ease one step a year
  assert.deepEqual([monthsApart("2026-12-01", "2027-12-01"), monthsApart("2026-12-15", "2027-12-01"), monthsApart("2027-01-31", "2027-01-01")], [12, 11, 0]);
  assert.deepEqual(settleRelations(g, "2027-11-30", G.name), []);
  assert.equal(relOf(g, "CHL", "BOL"), -2);
  settleRelations(g, "2027-12-01", G.name);
  assert.deepEqual([relOf(g, "CHL", "BOL"), relOf(g, "BOL", "BRA")], [-1, 0]);
  assert.equal(g.rel["BOL|BRA"], undefined, "neutral pairs are not stored");
  settleRelations(g, "2028-12-01", G.name);
  assert.equal(g.word.BOL, undefined, "a treaty ended is forgotten after two years");
  // a treaty is never below warm, a war is always hostile, whatever was stored (old saves, scenarios)
  const s = game4("rel-2", { wars: [{ pair: "CHL|PER", since: "2026-12-01", by: "PER" }], treaties: [{ pair: "BOL|PER", kind: "trade", since: "2026-12-01" }] });
  assert.deepEqual([relOf(s, "PER", "CHL"), relOf(s, "PER", "BOL")], [-3, 1]);
  assert.equal(relationLines(s)[0], "- Relations with the player's country, from -3 hostile to +3 close (others are neutral): CHL hostile -3, BOL warm +1");
  // the player hears when time moves a relation with them
  const p = game4("rel-3"); p.rel = { "CHL|PER": [-2, "2026-12-01"] };
  assert.deepEqual(settleRelations(p, "2027-12-01", G.name).map((x) => x.text), ["Chile: with time, its relations with Peru ease to cool (-1)"]);
});

test("a country asked for a treaty answers by rule, and says why", () => {
  const g = game4("ans-1");
  assert.deepEqual(NEED, { trade: 0, defence: 2, alliance: 4 });
  const neutral = treatyAnswer(g, "PER", "CHL", "defence", might4);
  assert.deepEqual([neutral.ok, neutral.score, neutral.need, neutral.why], [false, 0, 2, "relations neutral 0: 0, needing 2"]);
  assert.equal(treatyAnswer(g, "PER", "CHL", "trade", might4).ok, true, "trade with a neutral country is agreed");
  // trust is built in steps: trade, then defence, then an alliance; from rules version 6 a stronger treaty wants the last one a year old
  const acts = ["Treaty with Bolivia"], G = geo4(g);
  let r = applyMoves(g, [mv("PER", "TREATY", "BOL", "alliance", 1)], G, acts, 1);
  assert.deepEqual([r[0].ok, r[0].text], [false, "Peru: proposes an alliance treaty to Bolivia, which refuses (relations neutral 0: 0, needing 4)"]);
  assert.deepEqual(r[0].fact, ["no", "PER", "BOL", "alliance"]);
  assert.equal(g.treaties.length, 0);
  r = applyMoves(g, [mv("PER", "TREATY", "BOL", "trade", 1), mv("PER", "TREATY", "BOL", "defence", 1)], G, acts, 1);
  assert.equal(r[0].text, "Peru: signs a trade treaty with Bolivia, which agrees (relations neutral 0: 0, needing 0)");
  assert.equal(r[1].text, "Peru: proposes a defence treaty to Bolivia, which refuses (relations warm +2, the ink still wet on their last treaty -2: 0, needing 2)");
  g.date = "2027-12-01"; // a year on, the ink is dry
  r = applyMoves(g, [mv("PER", "TREATY", "BOL", "defence", 1)], G, acts, 1);
  assert.equal(r[0].text, "Peru: turns its trade treaty with Bolivia into a defence treaty, which agrees (relations warm +2: 2, needing 2)");
  assert.equal(relOf(g, "PER", "BOL"), 2, "a second treaty, a year later, lifts relations a step more");
  assert.equal(applyMoves(g, [mv("PER", "TREATY", "BOL", "alliance", 1)], G, acts, 1)[0].ok, false, "an alliance needs more, and its ink is wet too");
  // a shared enemy helps; a treaty with its enemy, a war with its partner and a treaty ended all hurt
  const w = game4("ans-2", { wars: [{ pair: "CHL|PER", since: "2026-12-01", by: "PER" }, { pair: "BOL|CHL", since: "2026-12-01", by: "CHL" }] });
  assert.equal(treatyAnswer(w, "PER", "BOL", "defence", might4).why, "relations neutral 0, a shared enemy +2: 2, needing 2");
  const x = game4("ans-3", { wars: [{ pair: "BOL|CHL", since: "2026-12-01", by: "CHL" }], treaties: [{ pair: "CHL|PER", kind: "trade", since: "2026-12-01" }], word: { PER: "2026-06-01" } });
  assert.equal(treatyAnswer(x, "PER", "BOL", "trade", might4).why, "relations neutral 0, a treaty with its enemy CHL -3, a treaty ended in 2026 -2: -5, needing 0");
  const y = game4("ans-4", { wars: [{ pair: "BRA|PER", since: "2026-12-01", by: "PER" }], treaties: [{ pair: "BOL|BRA", kind: "trade", since: "2026-12-01" }] });
  assert.equal(treatyAnswer(y, "PER", "BOL", "trade", might4).why, "relations neutral 0, a war with its partner BRA -3: -3, needing 0");
  // strength counts only for defence and alliance
  assert.equal(treatyAnswer(g, "BRA", "CHL", "defence", might4).why, "relations neutral 0, a much stronger partner +1: 1, needing 2");
  assert.equal(treatyAnswer(g, "BOL", "BRA", "defence", might4).why, "relations neutral 0, a much weaker partner -1: -1, needing 2");
  assert.equal(treatyAnswer(g, "BOL", "BRA", "trade", might4).score, 0);
  // the same sum answers rivals asking each other
  const rr = applyMoves(game4("ans-5"), [mv("CHL", "TREATY", "BRA", "alliance")], G, [], 1);
  assert.deepEqual([rr[0].ok, rr[0].text], [false, "Chile: proposes an alliance treaty to Brazil, which refuses (relations neutral 0: 0, needing 4)"]);
  for (const t of [r[0].text, rr[0].text]) assert.doesNotMatch(t, /\d\.\d|\.\s/, "one sentence, whole numbers");
});

test("offers: made only when they would be agreed to, never twice, lapsing after a year; a card's order needs no line from the AI", () => {
  const g = game4("off-1"), G = geo4(g);
  const r = applyMoves(g, [mv("CHL", "TREATY", "PER", "alliance"), mv("CHL", "TREATY", "PER", "trade"), mv("CHL", "TREATY", "PER", "trade")], G, [], 1);
  assert.equal(r[0].text, "Chile: would offer you an alliance treaty, but does not (relations neutral 0: 0, needing 4)");
  assert.equal(r[1].text, "Chile: offers you a trade treaty; accept it from your actions");
  assert.deepEqual(g.offers, [{ from: "CHL", kind: "trade", date: "2026-12-01" }], "the same offer is kept once");
  // accepted by card: the order is an action and a rule move, with or without a MOVE line in the reply
  const text = "Accept Chile's offer of a trade treaty.";
  g.actions = [text]; g.orders = [{ text, verb: "TREATY", target: "CHL", detail: "trade" }];
  assert.deepEqual(ownMoves(g, [], [text], G), [mv("PER", "TREATY", "CHL", "trade", 1)]);
  assert.equal(ownMoves(g, [mv("PER", "TREATY", "CHL", "trade", 1)], [text], G).length, 1, "a move the AI did write is not doubled");
  const e = closeTurn(g, reply(g), G, [text]);
  assert.equal(e.receipt[0].text, "Peru: signs a trade treaty with Chile, as offered");
  assert.deepEqual([g.treaties.length, g.offers.length, g.orders.length, relOf(g, "PER", "CHL")], [1, 0, 0, 1]);
  // an attack ordered by card is carried out even if the reply forgot it
  const w = warGame("off-2", { actions: ["Attack Arica"], orders: [{ text: "Attack Arica", verb: "ATTACK", target: "CHL-1", seat: "generals", approach: "steady" }] });
  const a = closeTurn(w, reply(w), geoOf(w), ["Attack Arica"]);
  assert.ok(a.receipt[0].check, "the rules made the attack");
  assert.equal(ownMoves({ ...w, mode: "citizen", orders: [{ text: "x", verb: "ATTACK", target: "CHL-1" }] }, [], ["x"], geoOf(w)).length, 0, "a citizen orders nothing for the country");
  // offers lapse: after a year, or when they no longer make sense (peace with nobody at war)
  const o = game4("off-3", { offers: [{ from: "CHL", kind: "trade", date: "2026-12-01" }, { from: "BOL", kind: "peace", date: "2026-12-01" }, { from: "BRA", kind: "defence", date: "2026-12-01" }] });
  settleRelations(o, "2027-06-01", G.name);
  assert.deepEqual(o.offers.map((x) => x.from), ["CHL", "BRA"]);
  settleRelations(o, "2027-12-01", G.name);
  assert.deepEqual(o.offers, []);
});

test("a game saved under older rules is converted: relations empty, a chronicle from its log, orders kept", () => {
  const old = warGame("old-2", { log: [{ from: "2026-12-01", to: "2027-01-01", summary: "A hard month.", events: [], receipt: [{ ok: true, text: "Peru: declares war on Chile", verb: "WAR", country: "PER" }] }], turn: 2, orders: [{ text: "Attack Arica", target: "CHL-1", seat: "war", approach: "bold" }, { text: "x", verb: "TREATY", target: "ZZZ", detail: "trade" }, { text: "y", verb: "TREATY", target: "CHL", detail: "loan" }] });
  old.rules = 2; delete old.chron; delete old.branch; delete old.word;
  old.rel = { "CHL|PER": [9, "2026-12-01"], "CHL|ZZZ": [1, "2026-12-01"], junk: 3 };
  assert.match(convertNote(old), /answer treaties and peace by rule, wars end by rule/);
  const g = checkSave(old, (id) => !!P[id], (c) => ["PER", "CHL"].includes(c));
  assert.equal(g.rules, RULES);
  assert.deepEqual([g.rel, g.word, g.branch], [{}, {}, 0], "relations that do not fit are dropped");
  assert.deepEqual(g.orders, [{ text: "Attack Arica", verb: "ATTACK", target: "CHL-1", seat: "war", approach: "bold" }, { text: "y", verb: "TREATY", target: "CHL", detail: "" }]);
  assert.deepEqual(g.chron.turns, [{ t: 1, from: "2026-12-01", to: "2027-01-01", s: "A hard month.", f: [] }], "past turns keep what they had: their telling, and no invented facts");
  assert.deepEqual(chronicleFrom([], 1), { eras: [], turns: [] });
  assert.equal(relOf(g, "PER", "CHL"), -3, "its war still reads as hostile");
  const kept = checkSave({ ...old, rel: { "CHL|PER": [-2, "2026-12-01"] }, chron: "junk", branch: 2 }, (id) => !!P[id], (c) => ["PER", "CHL"].includes(c));
  assert.deepEqual([kept.rel, kept.branch, kept.chron.turns.length], [{ "CHL|PER": [-2, "2026-12-01"] }, 2, 1]);
  assert.ok(closeTurn(g, reply(g), geoOf(g), []), "and it plays on");
});

// ---- Phase 4, items 4 to 6: people and threads, wars that end, the rules-only turn, rules that answer part 2 ----
import { PEOPLE, THREADS, peopleLines, pin, threadLines } from "../src/story/people.js";
import { WAR, peaceAnswer, settleWars, strength, strengthLine, truceUntil, weariness } from "../src/story/war.js";
import { RIVALS, bestAttack, borders, rivalMoves } from "../src/story/rivals.js";
import { suggest } from "../src/story/suggest.js";
import { reviewMoves, untick } from "../src/story/worldrules.js";

const geoAll = (g) => ({ ...geo4(g), all: Object.keys(P4) });
const world4 = (g, extra = {}) => ({ name: name4, neighbours: () => ["CHL", "BOL", "BRA"], size: () => 1, geo: geo4(g), places: ["- PER-1 Tacna (PER; own land)"], ...extra });
const circle = () => ({ seats: { war: { name: "Iva Rojas", traits: "blunt, loyal", wants: "a larger army", favour: 0, likes: [], hates: [] }, treasury: null, foreign: null, home: null, outsider: null }, trusted: null, former: [] });
const person = (name, line = "Seen once.") => ({ name, role: "a clerk", country: "PER", line });

test("people: PERSON lines are optional and read forgivingly; someone from turn 3 is still known at turn 40", () => {
  const g = game4("ppl-1", { council: circle(), chats: [{ id: "c1", with: [], person: "Marta Rios, union leader", messages: [] }] });
  const seen = {};
  for (let t = 1; t <= 60; t++) {
    let r = reply(g, [], 1, t === 30 ? "The editor Vargas is in print again, and Santiago is not pleased." : "A quiet month.");
    if (t === 3) {
      r = readWorldReply([`TURN: ${turnCode(g)}`, `EVENT: ${g.date} | PER | Lima is calm and the markets are steady this month.`, "**PERSON:** Tomas Quispe | governor of Tacna | Peru | Ambitious, and owed a favour by the army.",
        "- PERSON: Elena Vargas | editor | CHL | Prints what Santiago would rather hide.", "PERSON: One Too Many | x | PER | A third person is over the limit of two.", "PERSON: | nobody | PER | no name"].join("\n"), g, known, r.stop, false, codeOf);
      assert.deepEqual(r.people, [{ name: "Tomas Quispe", role: "governor of Tacna", country: "PER", line: "Ambitious, and owed a favour by the army." }, { name: "Elena Vargas", role: "editor", country: "CHL", line: "Prints what Santiago would rather hide." }]);
    } else if (t > 3) r.people = [person(`Filler Number${t}`)];
    closeTurn(g, r, geo4(g), []);
    if (t === 3) assert.equal(pin(g, "Tomas Quispe"), "");
    seen[g.turn] = peopleLines(g);
    assert.ok(seen[g.turn].length <= PEOPLE.sent && seen[g.turn].every((l) => l.length <= PEOPLE.line + 2), `turn ${g.turn}`);
  }
  assert.equal(readWorldReply(`TURN: ${turnCode(g)}\nEVENT: ${g.date} | PER | Lima is calm and the markets are steady this month.`, g, known, "2099-01-01", false, codeOf).people.length, 0, "a reply with no PERSON line is whole");
  assert.equal(seen[4][0], "- Iva Rojas (war, the player's council): blunt, loyal; wants a larger army");
  assert.equal(seen[4][1], "- Marta Rios, union leader (the player talks with them)");
  assert.equal(seen[4][2], "- Tomas Quispe, governor of Tacna (PER): Ambitious, and owed a favour by the army.");
  for (const t of [4, 40, 61]) assert.ok(seen[t].slice(0, 3).every((l, i) => l === seen[4][i]), `the council, the chat partner and the pinned are never trimmed (turn ${t})`);
  const has = (t, who) => seen[t].some((l) => l.includes(who));
  assert.ok(has(40, "Tomas Quispe"), "the character from turn 3 is known at turn 40");
  assert.deepEqual([has(12, "Elena Vargas"), has(20, "Elena Vargas"), has(35, "Elena Vargas"), has(45, "Elena Vargas")], [true, false, true, false], "the rest go by the most recent mention: a surname in the summary of turn 30 brings her back");
  assert.equal(g.people.find((p) => p.name === "Elena Vargas").seen, 30);
  assert.equal(g.people.length, PEOPLE.held, "forty are held");
  assert.ok(g.people.some((p) => p.name === "Elena Vargas") && !g.people.some((p) => p.name === "Filler Number4"), "the one mentioned longest ago is forgotten first");
  assert.match(worldPrompt(g, world4(g), [], "2099-01-01"), /\nPEOPLE \(kept by the game[^\n]*\n- Iva Rojas[^\n]*\n- Marta Rios[^\n]*\n- Tomas Quispe/);
  // pins are limited by the twelve, and say so
  const full = game4("ppl-2", { people: Array.from({ length: 13 }, (_, i) => ({ ...person(`Pinned Person${i}`), first: 1, seen: 1 })) });
  for (let i = 0; i < 12; i++) assert.equal(pin(full, `Pinned Person${i}`), "");
  assert.match(pin(full, "Pinned Person12"), /Unpin someone first/);
  assert.equal(pin(full, "Pinned Person0", false), "");
  assert.equal(pin(full, "Pinned Person12"), "");
  assert.match(pin(full, "Nobody Known"), /Nobody of that name/);
});

test("threads: opened and moved by optional THREAD lines, six open, closed by rule after twelve untouched turns, and the closing is in the chronicle", () => {
  const g = game4("thr-1"), turn = (extra = {}, summary) => closeTurn(g, { ...reply(g, [], 1, summary), ...extra }, geo4(g), []);
  const r = readWorldReply([`TURN: ${turnCode(g)}`, "THREAD: The Tacna water dispute | Talks stall over who pays for the canal.", "* THREAD: The missing envoy | Nobody has seen him since the reception.", "THREAD: A third | over the limit of two", "THREAD: x | y"].join("\n"), g, known, "2027-01-01", false, codeOf);
  assert.deepEqual(r.threads, [{ title: "The Tacna water dispute", state: "Talks stall over who pays for the canal." }, { title: "The missing envoy", state: "Nobody has seen him since the reception." }]);
  turn({ threads: r.threads });
  assert.deepEqual(threadLines(g), ["- The Tacna water dispute: Talks stall over who pays for the canal. (open since turn 1)", "- The missing envoy: Nobody has seen him since the reception. (open since turn 1)"]);
  turn({ threads: [{ title: "the missing envoy", state: "closed: he turns up in Santiago, unharmed" }] });
  assert.deepEqual(g.threads.map((t) => t.title), ["The Tacna water dispute"], "the AI may say a matter is over");
  assert.match(g.log[1].receipt.at(-1).text, /^The thread "The missing envoy" closes: closed: he turns up/);
  turn(); turn();
  turn({}, "In Lima the Tacna water dispute is argued in the papers again.");
  assert.equal(g.threads[0].t, 5, "a mention in the turn's kept lines touches the thread");
  turn({ threads: [{ title: "The Tacna water dispute", state: "A commission is named." }] });
  assert.deepEqual([g.threads[0].t, g.threads[0].t0, g.threads[0].state], [6, 1, "A commission is named."]);
  for (let t = 7; t <= 17; t++) turn();
  assert.equal(g.threads.length, 1, "eleven turns untouched: still open");
  const e = turn();
  assert.equal(g.threads.length, 0);
  assert.deepEqual(e.receipt.at(-1), { ok: true, text: 'The thread "The Tacna water dispute" closes by rule: nothing touched it for twelve turns', fact: ["thread", "The Tacna water dispute"] });
  assert.match(chronicleLines(g, name4).at(-1), /the thread "The Tacna water dispute" closed/);
  // six stay open: a seventh closes the one longest untouched
  for (let i = 0; i < 4; i++) turn({ threads: [{ title: `Matter ${2 * i}`, state: "open" }, { title: `Matter ${2 * i + 1}`, state: "open" }] });
  assert.deepEqual(g.threads.map((t) => t.title).sort(), ["Matter 2", "Matter 3", "Matter 4", "Matter 5", "Matter 6", "Matter 7"]);
  assert.ok(threadLines(g).length <= THREADS.open);
  assert.match(worldPrompt(g, world4(g), [], "2099-01-01"), /\nTHREADS \(matters still open in the story\)\n- Matter [67]: open \(open since turn 22\)/);
});

test("the prompt bar with people and threads full, and the fixed order in which a long prompt gives things up", () => {
  const g = game4("bar-1", { council: circle() }), size = {};
  const told = "The capital argued about the budget while the border stayed quiet and the papers looked for a scandal to print.";
  for (let t = 1; t <= 60; t++) {
    const moves = t % 6 === 1 ? [mv("BOL", "WAR", "CHL")] : [];
    closeTurn(g, { ...reply(g, moves, 1, `Turn ${t}. ${told}`), people: [person(`Minister Number${t}`, "Said to be patient, and to want the border quiet above all else, whatever it costs in pride at home."), person(`Envoy Number${t}`, "Carries messages nobody admits to sending.")],
      threads: [{ title: `The matter of the river, part ${t % 8}`, state: "Talks go on, slowly, with neither side willing to be first to give way." }] }, geo4(g), []);
    if (t === 2) pin(g, "Minister Number1");
    size[t] = worldPrompt(g, world4(g), [], "2099-01-01").length;
  }
  const pct = Math.round((100 * (size[50] - size[10])) / size[10]);
  assert.ok(Math.abs(pct) <= 10, `turn 50 is ${pct} percent larger than turn 10`);
  assert.equal(peopleLines(g).length, 12);
  assert.equal(threadLines(g).length, 6);
  // too long: era lines go first, then people beyond those never trimmed, then threads; nothing else, ever
  const at = (limit) => worldPrompt(g, world4(g, { limit }), ["Hold the line."], "2099-01-01"), p0 = at(0), p1 = at(p0.length - 1), p2 = at(p1.length - 1), p3 = at(p2.length - 1);
  assert.match(p0, /turns 1 to /);
  assert.doesNotMatch(p1, /turns 1 to /);
  assert.match(p1, /Envoy Number60/);
  assert.doesNotMatch(p2, /Envoy Number60/);
  assert.match(p2, /- Iva Rojas[^\n]*\n- Minister Number1, a clerk/, "the council and the pinned stay");
  assert.match(p2, /The matter of the river/);
  assert.match(p3, /THREADS \(matters still open in the story\)\n- none yet/);
  assert.equal(at(1), p3, "and no further");
  for (const part of ["RULES FOR YOU", "\nMOVES\n", "RECEIPT (what the rules decided last turn)", "1. Hold the line.", "- Iva Rojas", "Turn 60."]) assert.ok(p3.includes(part), part);
});

test("wars end by rule: weariness, a peace that is answered, a white peace at six, and a truce of two years", () => {
  const g = game4("war-1", { wars: [{ pair: "BOL|CHL", since: "2026-12-01", by: "CHL" }] }), G = geo4(g);
  assert.deepEqual([weariness(g, "CHL", "BOL", "2027-05-31"), weariness(g, "CHL", "BOL", "2027-06-01"), weariness(g, "CHL", "PER")], [0, 1, 0], "a point for every six months");
  g.wars[0].took = { CHL: 2 };
  assert.deepEqual([weariness(g, "BOL", "CHL", "2027-06-01"), weariness(g, "CHL", "BOL", "2027-06-01")], [2, 1], "and one for every two provinces lost");
  const loser = peaceAnswer(g, "CHL", "BOL", "2027-06-01"), winner = peaceAnswer(g, "BOL", "CHL", "2027-06-01");
  assert.deepEqual([loser.ok, loser.why], [true, "weary of war 2 of 6 +2, it is 2 behind and losing land +2: 4, needing 4"]);
  assert.deepEqual([winner.ok, winner.why], [false, "weary of war 1 of 6 +1, it is 2 ahead and keeps what it took +2: 3, needing 4"]);
  assert.deepEqual(settleWars(g, "2027-06-01", name4), [], "one side ready is not peace");
  g.date = "2027-06-01";
  assert.equal(applyMoves(g, [mv("BOL", "PEACE", "CHL")], G, [], 1)[0].text, "Bolivia: asks Chile for peace, which refuses (weary of war 1 of 6 +1, it is 2 ahead and keeps what it took +2: 3, needing 4)");
  const done = settleWars(g, "2027-12-01", name4);
  assert.equal(done.length, 1);
  assert.match(done[0].text, /^Bolivia and Chile: make peace by rule, both ready to stop \(.*\); each keeps the land it holds$/);
  assert.deepEqual([done[0].fact, g.wars.length, relOf(g, "BOL", "CHL"), g.truce], [["peace", "BOL", "CHL"], 0, -2, { "BOL|CHL": "2027-12-01" }]);
  // the truce: two years in which war between the two is refused
  g.date = "2028-06-01";
  assert.equal(truceUntil(g, "CHL", "BOL"), "2029-12");
  assert.equal(applyMoves(g, [mv("CHL", "WAR", "BOL")], G, [], 1)[0].text, "Chile: war on Bolivia refused: a truce holds between them until 2029-12");
  g.date = "2029-12-01";
  assert.equal(applyMoves(g, [mv("CHL", "WAR", "BOL")], G, [], 1)[0].ok, true);
  // the player's wars: a foe that would say yes offers peace, once; the player's own request is answered by the same sum
  const p = warGame("war-2", { wars: [{ pair: "CHL|PER", since: "2025-06-01", by: "PER", took: { PER: 2 } }] });
  assert.equal(applyMoves({ ...structuredClone(p), wars: [{ pair: "CHL|PER", since: "2026-11-01", by: "PER" }] }, [mv("PER", "PEACE", "CHL", "", 1)], geoOf(p), ["Peace"], 1)[0].text, "Peru: asks Chile for peace, which refuses (no reason yet to stop: 0, needing 4)");
  const offer = settleWars(p, "2027-01-01", name4);
  assert.equal(offer[0].text, "Chile: offers you peace by rule (weary of war 4 of 6 +4, it is 2 behind and losing land +2: 6, needing 4); accept it from your actions");
  assert.deepEqual([p.offers, p.wars.length, settleWars(p, "2027-01-01", name4)], [[{ from: "CHL", kind: "peace", date: "2027-01-01" }], 1, []]);
  assert.equal(applyMoves(p, [mv("PER", "PEACE", "CHL", "", 1)], geoOf(p), ["Peace"], 1)[0].text, "Peru: makes peace with Chile, as offered; each keeps the land it holds");
  assert.deepEqual([p.wars.length, p.offers.length, !!p.truce["CHL|PER"]], [0, 0, true]);
  // at six the rules stop the war, the player's too
  const w = warGame("war-3", { wars: [{ pair: "CHL|PER", since: "2023-12-01", by: "PER" }] });
  const e = closeTurn(w, reply(w), geoOf(w), []);
  assert.equal(e.receipt.find((x) => x.fact)?.text, "Chile and Peru: worn out by their war (weariness 6 and 6 of 6), they stop by rule; a white peace, each keeps the land it holds");
  assert.deepEqual([w.wars.length, relOf(w, "PER", "CHL"), WAR.most], [0, -2, 6]);
  assert.match(chronicleLines(w, name4)[0], /Chile and Peru made peace/);
  // a province taken is counted in the war's score
  for (let i = 0; i < 40; i++) {
    const a = warGame(`war-take-${i}`, { actions: ["Attack"] }), got = closeTurn(a, reply(a, [attackMove]), geoOf(a), ["Attack"]).receipt[0];
    assert.deepEqual(a.wars[0]?.took, got.check.band === "failed" ? undefined : { PER: 1 });
    assert.equal(got.at, "CHL-1");
  }
});

test("strength changes: weariness and land move a country's might by one, shown with its parts", () => {
  const g = game4("str-1");
  assert.deepEqual(strength(g, geo4(g), "BRA"), { base: 6, parts: [], might: 6 });
  g.owners["BRA-2"] = "BOL";
  assert.equal(strengthLine(strength(g, geo4(g), "BRA")), "might 5 (6 by the table, a third of its land lost -1)");
  assert.equal(strengthLine(strength(g, geo4(g), "BOL")), "might 3 (2 by the table, a third more land than it began with +1)");
  g.wars = [{ pair: "BOL|BRA", since: "2025-06-01", by: "BRA" }];
  assert.equal(strengthLine(strength(g, geo4(g), "BRA")), "might 4 (6 by the table, weary of war -1, a third of its land lost -1)");
  const plan = attackPlan(g, geo4(g), "BRA", "BRA-2").plan;
  assert.deepEqual([plan.skill, plan.difficulty], [4, 2], "the check uses the strength of the day");
  // land a game began with (a scenario's own map, a country of the player's making) is not a gain or a loss
  const s = newWorldGame("PER", "nation", "str-2", { owners: { "BRA-2": "BOL" } });
  assert.deepEqual([strength(s, geo4(s), "BRA").might, strength(s, geo4(s), "BOL").might], [6, 2]);
  const weak = game4("str-3", { owners: { "CHL-2": "PER" } }), G = { ...geo4(weak), might: (c) => ({ CHL: 1, PER: 10 })[c] };
  assert.deepEqual([strength(weak, G, "CHL").might, strength(weak, G, "PER").might], [1, 10], "never below 1 or above 10");
});

test("the rules-only turn: other countries move by published thresholds when no AI proposed for them, and the turn replays", () => {
  const quiet = game4("alone-1");
  assert.deepEqual(borders(geoAll(quiet)).get("PER"), ["BOL", "BRA", "CHL"]);
  assert.deepEqual(rivalMoves(quiet, geo4(quiet)), [], "a map with no province list moves nobody");
  const first = rivalMoves(quiet, geoAll(quiet));
  assert.deepEqual(first, rivalMoves(quiet, geoAll(quiet)), "the same game and turn propose the same moves");
  assert.ok(first.length <= RIVALS.treaties && first.every((m) => m.verb === "TREATY" && m.country !== "PER" && m.action === 0));
  // a turn with no AI at all: the receipt says who moved and why, and says the rules moved them
  const a = game4("alone-2"), b = game4("alone-2");
  for (let t = 0; t < 30; t++) { closeTurn(a, reply(a), geoAll(a), []); closeTurn(b, reply(b), geoAll(b), []); }
  assert.deepEqual(a, b);
  assert.deepEqual(a.treaties.map((t) => `${t.pair} ${t.kind}`).sort(), ["BOL|BRA trade", "BOL|CHL trade"], "trade is signed; in a quiet world nobody is asked for more");
  assert.ok(a.log.some((t) => t.receipt.some((x) => /offers you a trade treaty/.test(x.text))), "and offered to the player");
  assert.ok(a.log.some((t) => t.receipt.some((x) => x.text === "Other countries moved by the rules alone this turn: no AI proposed anything for them")));
  const c = game4("alone-2"), told = closeTurn(c, reply(c, [mv("BOL", "TREATY", "BRA", "trade")]), geoAll(c), []);
  assert.ok(!told.receipt.some((x) => /by the rules alone/.test(x.text)), "a reply that moved other countries is not topped up");
  // war: only on a grudge of -2 or lower, with an edge of 2 in might, no treaty, no truce, no war already; one time in four
  let wars = 0;
  for (let i = 0; i < 80; i++) {
    const g = game4(`alone-war-${i}`, { rel: { "BOL|BRA": [-2, "2026-12-01"], "BRA|CHL": [-1, "2026-12-01"], "BOL|CHL": [-2, "2026-12-01"] }, truce: { "BOL|CHL": "2026-06-01" } });
    const w = rivalMoves(g, geoAll(g)).filter((m) => m.verb === "WAR");
    assert.ok(w.length <= 1 && w.every((m) => m.country === "BRA" && m.target === "BOL"), "only Brazil, six against two, may turn on Bolivia");
    wars += w.length;
  }
  assert.ok(wars >= 8 && wars <= 32, `${wars} wars in 80 games`);
  // attack: only at a chance of 45 or more
  const f = game4("alone-3", { wars: [{ pair: "BOL|BRA", since: "2026-12-01", by: "BRA" }] });
  assert.deepEqual([bestAttack(f, geoAll(f), "BRA", "BOL").chance, bestAttack(f, geoAll(f), "BOL", "BRA").chance], [75, 16]);
  for (let i = 0; i < 20; i++) { f.seed = `alone-3-${i}`; assert.ok(rivalMoves(f, geoAll(f)).filter((m) => m.verb === "ATTACK").every((m) => m.country === "BRA" && m.target === "BOL-1")); }
});

test("with an AI that never asks for peace, every war still ends, a truce follows, and the game replays", () => {
  const play = () => {
    const g = game4("long-1"), wars = [];
    for (let t = 1; t <= 150; t++) {
      const moves = [mv("CHL", "WAR", "BOL"), ...(g.wars.length ? [mv("BOL", "ATTACK", "CHL-1")] : [])], before = g.wars.length;
      closeTurn(g, reply(g, moves), geo4(g), []);
      if (g.wars.length > before) wars.push({ from: t });
      else if (g.wars.length < before) wars.at(-1).to = t;
    }
    return { g, wars };
  };
  const { g, wars } = play();
  assert.ok(wars.length >= 3, `${wars.length} wars`);
  for (const [i, w] of wars.entries()) {
    assert.ok(w.to ? w.to - w.from <= 36 : w.from > 150 - 36, `war ${i + 1} ran from turn ${w.from} to ${w.to}`);
    if (i) assert.ok(w.from - wars[i - 1].to >= 23, "no war inside the truce");
  }
  assert.equal(geo4(g).holds("BOL") > 0, true);
  assert.deepEqual(play().g, g);
  for (const t of g.log) for (const x of t.receipt) assert.doesNotMatch(x.text, /\d\.\d/, "whole numbers");
});

test("the player's moves are listed for a tick before the rules run, and an unticked move never reaches them", () => {
  const acts = ["Make friends with Bolivia, and frighten Brazil.", "Attack Arica"];
  const g = game4("rev-1", { wars: [{ pair: "CHL|PER", since: "2026-12-01", by: "PER" }], actions: acts, orders: [{ text: "Attack Arica", verb: "ATTACK", target: "CHL-1", seat: "generals", approach: "steady" }] }), G = geo4(g);
  const r = reply(g, [mv("PER", "TREATY", "BOL", "trade", 1), mv("PER", "WAR", "BRA", "", 1), mv("PER", "ATTACK", "CHL-1", "", 2), mv("BOL", "TREATY", "BRA", "trade")]);
  const list = reviewMoves(g, r.moves, acts, G);
  assert.deepEqual(list, [
    { i: 0, card: false, text: 'Propose a treaty to Bolivia (trade), from action 1: "Make friends with Bolivia, and frighten Brazil."' },
    { i: 1, card: false, text: 'Declare war on Brazil, from action 1: "Make friends with Bolivia, and frighten Brazil."' },
    { i: 2, card: true, text: 'Attack Arica, from action 2: "Attack Arica"' },
  ]);
  const kept = untick(r, list, [1]);
  assert.deepEqual(kept.moves.map((m) => m.verb), ["TREATY", "ATTACK", "TREATY"]);
  assert.deepEqual(kept.dropped, ['a move you did not mean: Declare war on Brazil, from action 1: "Make friends with Bolivia, and frighten Brazil."']);
  const e = closeTurn(g, kept, G, acts);
  assert.deepEqual([g.wars.some((w) => w.pair === "BRA|PER"), g.treaties.some((t) => t.pair === "BOL|PER"), e.dropped.length], [false, true, 1]);
  assert.deepEqual(reviewMoves({ ...g, mode: "citizen" }, r.moves, acts, G), [], "a citizen commands nothing");
  assert.deepEqual(untick(r, list, []).moves, r.moves);
});

test("suggested actions are built from the state of the game, each with the answer or the odds the rules would give", () => {
  const g = game4("sug-1", { wars: [{ pair: "CHL|PER", since: "2026-12-01", by: "PER" }] }), G = geoAll(g), s = suggest(g, G);
  const plan = attackPlan(g, G, "PER", "CHL-1");
  assert.deepEqual(s.map((x) => [x.verb, x.target, x.text, x.note]), [
    ["PEACE", "CHL", "Propose peace to Chile (CHL).", "Chile would refuse (no reason yet to stop: 0, needing 4)"],
    ["ATTACK", "CHL-1", "Attack Arica (CHL-1), led by our generals, steady.", `odds: ${oddsLine(plan.chance)}`],
    ["TREATY", "BOL", "Propose a trade treaty to Bolivia (BOL).", "Bolivia would agree (relations neutral 0: 0, needing 0)"],
    ["TREATY", "BRA", "Propose a trade treaty to Brazil (BRA).", "Brazil would agree (relations neutral 0: 0, needing 0)"],
  ]);
  // what is already ordered or offered is not suggested again; the next treaty up is suggested only when it would be agreed
  g.orders = [{ text: "x", verb: "PEACE", target: "CHL", detail: "" }]; g.treaties = [{ pair: "BOL|PER", kind: "trade", since: g.date, old: 1 }]; g.offers = [{ from: "BRA", kind: "trade", date: g.date }];
  assert.deepEqual(suggest(g, G).map((x) => [x.verb, x.detail || ""]), [["ATTACK", ""], ["TREATY", "defence"]], "a trade partner reads as warm, which is enough for defence");
  g.treaties[0].kind = "defence";
  assert.deepEqual(suggest(g, G).map((x) => x.verb), ["ATTACK"], "an alliance needs more");
  g.rel = { "BOL|PER": [2, g.date] };
  assert.deepEqual(suggest(g, G).map((x) => [x.verb, x.detail || ""]), [["ATTACK", ""], ["TREATY", "alliance"]]);
  assert.deepEqual(suggest({ ...g, mode: "citizen" }, G), []);
  // the order a suggestion gives is carried out by the rules with no line from the AI
  const o = s[1], w = game4("sug-1", { wars: [{ pair: "CHL|PER", since: "2026-12-01", by: "PER" }], actions: [o.text], orders: [{ text: o.text, verb: o.verb, target: o.target, seat: o.seat, approach: o.approach }] });
  assert.equal(closeTurn(w, reply(w), geo4(w), [o.text]).receipt[0].check.chance, plan.chance);
});

test("the story is told with the result known: both endings are asked for, and the one the rules chose is kept", () => {
  const text = "Attack Arica (CHL-1), led by our generals, steady.", bands = new Set();
  for (let i = 0; i < 30; i++) {
    const g = warGame(`if-${i}`, { actions: [text], orders: [{ text, verb: "ATTACK", target: "CHL-1", seat: "generals", approach: "steady" }] });
    const prompt = worldPrompt(g, world4(g, { geo: geoOf(g) }), [text], "2027-01-01");
    assert.match(prompt, /\nORDERED ATTACKS \(the rules settle each one after your reply\)\n- CHL-1 Arica\n/);
    assert.match(prompt, /\nIF: province id \| one sentence if the attack takes it \| one sentence if the attack is thrown back\n/);
    const r = readWorldReply([`TURN: ${turnCode(g)}`, `EVENT: ${g.date} | PER | The army moves south along the coast road at dawn.`, "**IF:** chl-1 | Arica falls by dusk, its garrison gone south. | The column is thrown back at the river.", "IF: CHL-2 | Not ordered. | Not ordered."].join("\n"), g, known, "2027-01-01", false, codeOf);
    assert.deepEqual(r.ifs[0], { target: "CHL-1", won: "Arica falls by dusk, its garrison gone south.", lost: "The column is thrown back at the river." });
    const e = closeTurn(g, r, geoOf(g), [text]), band = e.receipt[0].check.band;
    bands.add(band);
    assert.deepEqual(e.told, [{ at: "CHL-1", band, text: band === "failed" ? "The column is thrown back at the river." : "Arica falls by dusk, its garrison gone south." }]);
  }
  assert.equal(bands.size, 3, "every result was met");
  const none = warGame("if-none");
  assert.doesNotMatch(worldPrompt(none, world4(none, { geo: geoOf(none) }), ["Wait."], "2027-01-01"), /ORDERED ATTACKS|\nIF: /, "no attack ordered, nothing asked");
  assert.equal(closeTurn(none, reply(none, [attackMove]), geoOf(none), ["Attack"]).told, undefined, "a reply with no IF line is whole");
});

test("a game saved under the rules before these is converted: empty memory, no truces, the land it began with", () => {
  const old = { ...warGame("old-4"), rules: 3 };
  for (const k of ["people", "threads", "truce", "start"]) delete old[k];
  assert.match(convertNote(old), /wars end by rule when both sides are worn out, a country's might changes with its land and its wars, and the story keeps a chronicle, people and open threads\.$/);
  const ok = (id) => !!P[id], land = (c) => ["PER", "CHL"].includes(c), g = checkSave(old, ok, land);
  assert.deepEqual([g.rules, g.people, g.threads, g.truce, g.start], [RULES, [], [], {}, {}]);
  assert.equal(convertNote(g), "");
  assert.ok(closeTurn(g, reply(g), geoOf(g), []), "and it plays on");
  // what a save holds is checked before use
  const s = checkSave({ ...old, rules: RULES, people: [{ name: "Ana Ruiz", role: 5, country: "ZZZ", seen: "x", pin: 1 }, "junk", { name: "" }], threads: [{ title: "The canal", state: "open", t0: 2, t: 3 }, { state: "no title" }],
    truce: { "CHL|PER": "2026-12-01", "CHL|ZZZ": "2026-12-01", junk: 1 }, start: { "CHL-2": "PER", "NOPE-1": "PER" } }, ok, land);
  assert.deepEqual(s.people, [{ name: "Ana Ruiz", role: "", country: "", line: "", first: 1, seen: 1, pin: true }]);
  assert.deepEqual([s.threads, s.truce, s.start], [[{ title: "The canal", state: "open", t0: 2, t: 3 }], { "CHL|PER": "2026-12-01" }, { "CHL-2": "PER" }]);
  // a country of the player's own, in an old save, began with the land it holds
  const own = checkSave({ ...old, custom: { code: "YOU", name: "Mine", colour: "#fff" }, owners: { "CHL-2": "YOU", "CHL-1": "PER" } }, ok, land);
  assert.deepEqual(own.start, { "CHL-2": "YOU" });
});
// ---- presets: alternate histories laid over the real map (src/story/overlay.js, src/story/althist.js) ----
import { readFileSync } from "node:fs";
import { ALTHIST } from "../src/story/althist.js";
import { KINDS, PRESETS } from "../src/story/presets.js";
import { ALT_RULES, altLines, checkAlt, layPresets, presetScenario, rebase } from "../src/story/overlay.js";
import { checkScenario, scenarioFrom, scenarioText } from "../src/story/scenarios.js";
import { placesFor } from "../src/story/worldrules.js";
import { crossesLine } from "../src/story/line.js";

const MAP = JSON.parse(readFileSync(new URL("../maps/world.json", import.meta.url), "utf8"));
const onMap = new Set(MAP.provinces.map((p) => p.country)), isC = (c) => onMap.has(c), isP = (id) => MAP.provinces.some((p) => p.id === id);
const gate = (s) => checkScenario(s, isC, isP);
/** A preset as the page makes it: laid over the map, then through the same gate as a scenario file. */
const laid = (id) => { const made = presetScenario(ALTHIST.find((p) => p.id === id), MAP); assert.ok(made.ok, made.why); const r = gate(made.scenario); assert.ok(r.ok, r.why); return r.scenario; };
/** The loaded map as the page holds it, and what the rules may ask of it, for one game. */
const realWorld = () => ({ countries: { ...MAP.countries }, provinces: new Map(MAP.provinces.map((p) => [p.id, { id: p.id, name: p.name, country: p.country }])) });
const realGeo = (g, world) => {
  const near = new Map([...world.provinces.keys()].map((id) => [id, []]));
  for (const [a, b] of MAP.neighbours) { near.get(a).push(b); near.get(b).push(a); }
  const owner = (id) => g.owners[id] || world.provinces.get(id).country, held = (c) => [...world.provinces.keys()].filter((id) => owner(id) === c);
  const homes = new Set([...world.provinces.values()].map((p) => p.country));
  return { name: (c) => world.countries[c] || c, place: (id) => world.provinces.get(id), find: (s) => (world.provinces.has(s) ? s : null), owner, neighbours: (id) => near.get(id), across: () => [], coastal: () => false,
    holds: (c) => held(c).length, known: (c) => homes.has(c), hasCoast: () => false, might: (c) => g.might[c] };
};

test("presets: one list for every lane; each alternate history is fiction, in bounds, and lays over the map the same way twice", () => {
  assert.equal(KINDS.althist, "Alternate histories");
  assert.ok(ALTHIST.length >= 5 && ALTHIST.every((p) => PRESETS.includes(p) && p.kind === "althist"), "the alternate histories are in the shared list");
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length, "no two presets share an id");
  for (const p of ALTHIST) {
    const a = presetScenario(p, MAP), b = presetScenario(structuredClone(p), { countries: MAP.countries, provinces: [...MAP.provinces] });
    assert.ok(a.ok, a.why);
    assert.equal(JSON.stringify(a.scenario), JSON.stringify(b.scenario), `${p.id}: the same preset on the same map gives the same world, byte for byte`);
    const r = gate(a.scenario), s = r.scenario;
    assert.ok(r.ok, r.why);
    // the gate a scenario file passes keeps every part: nothing was dropped or cut short
    assert.deepEqual(s.owners, a.scenario.owners);
    assert.deepEqual([s.opening, s.blurb, s.balance, s.alt.turn], [p.opening, p.blurb, p.balance, p.turn], `${p.id}: no text is too long`);
    assert.deepEqual([s.wars.length, s.treaties.length, s.facts.length, Object.keys(s.might).length], [a.scenario.wars.length, a.scenario.treaties.length, a.scenario.facts.length, Object.keys(a.scenario.might).length]);
    assert.deepEqual(s.facts.map((f) => f.text), a.scenario.facts.map((f) => f.text), `${p.id}: no fact is cut short`);
    assert.deepEqual(s.alt, a.scenario.alt);
    // the world it makes holds together
    const holds = new Set(MAP.provinces.map((q) => s.owners[q.id] || q.country));
    for (const c of Object.keys(s.alt.lands)) assert.ok(holds.has(c), `${p.id}: ${c} holds land`);
    for (const c of s.alt.gone) assert.ok(!holds.has(c) && onMap.has(c), `${p.id}: ${c} is gone`);
    for (const t of [...s.wars, ...s.treaties]) assert.ok(t.pair.split("|").every((c) => holds.has(c)), `${p.id}: ${t.pair} are countries of this world`);
    for (const d of s.alt.disputes.add) assert.match(d.note, /^(Held by [^.]+|Governs itself)\. Claimed by [^.]+\.$/, `${p.id}: ${d.name} is written as the map writes disputes`);
    // the content floor: labelled fiction, a turning point, leaders as offices only, nothing over the hard line
    assert.match(s.opening, /^Fiction: an alternate history\. /);
    assert.ok(s.alt.turn.length > 40 && /^\d{4}-\d{2}-\d{2}$/.test(s.start));
    assert.ok(s.facts.some((f) => f.text.startsWith("Who leads, by office (every holder is an invented person): ")), `${p.id}: leaders are offices`);
    assert.deepEqual(crossesLine(scenarioText(s)), []);
    assert.doesNotMatch(JSON.stringify(p), /—/, "no em dash");
  }
});

test("overlay: whole countries merged, single provinces given, the given province winning; a bad preset is refused whole", () => {
  const base = { id: "althist-test", kind: "althist", title: "A test", start: "2026-12-01", turn: "1900: something went another way than it did.", opening: "Fiction: an alternate history. A test.", overlay: {} };
  const make = (overlay, more = {}) => presetScenario({ ...base, ...more, overlay }, MAP);
  const ok = make({ lands: { AND: ["Andes Union", "#123abc"], CHL: ["Chile of the south"] }, merge: { AND: ["PER", "BOL"] }, give: { CHL: ["PER-" + MAP.provinces.find((p) => p.country === "PER").id.split("-")[1]] }, treaties: { trade: ["CHL|AND"] }, might: { AND: 6 }, offices: { AND: "the Chair of the Union" } });
  assert.ok(ok.ok, ok.why);
  const s = ok.scenario, per = MAP.provinces.filter((p) => p.country === "PER"), bol = MAP.provinces.filter((p) => p.country === "BOL");
  assert.equal(Object.keys(s.owners).length, per.length + bol.length);
  assert.equal(s.owners[per[0].id], "CHL", "a province given wins over its country merged");
  assert.ok(per.slice(1).every((p) => s.owners[p.id] === "AND") && bol.every((p) => s.owners[p.id] === "AND"));
  assert.deepEqual([s.alt.gone, s.alt.lands, s.treaties, s.might], [["BOL", "PER"], { AND: { name: "Andes Union", colour: "#123abc" }, CHL: { name: "Chile of the south" } }, [{ pair: "AND|CHL", kind: "trade" }], { AND: 6 }]);
  assert.equal(s.facts[0].text, "Who leads, by office (every holder is an invented person): Andes Union (AND): the Chair of the Union.");
  // refused whole, each for its own reason
  for (const [overlay, why, more] of [
    [{ give: { CHL: ["PER-0"] } }, /province PER-0 cannot be given to CHL/],
    [{ merge: { CHL: ["XXX"] } }, /XXX cannot be merged into CHL/],
    [{ merge: { ZZZ: ["PER"] } }, /PER cannot be merged into ZZZ/],
    [{ merge: { CHL: ["PER"], ARG: ["PER"] } }, /PER cannot be merged into ARG/],
    [{ merge: { CHL: ["PER"], ARG: ["CHL"] } }, /CHL takes in countries and is itself merged away/],
    [{ lands: { NEW: ["Nowhere"] } }, /NEW is named but holds no land/],
    [{ lands: { new: ["Nowhere"] } }, /needs a three-letter code and a name/],
    [{ merge: { CHL: ["PER"] }, treaties: { trade: ["PER|BRA"] } }, /BRA\|PER names a country that holds no land in this world/],
    [{ merge: { CHL: ["PER"] }, might: { PER: 4 } }, /PER names a country that holds no land/],
    [{ disputes: { add: [{ name: "Nowhere", note: "Held by Chile. Claimed by Peru.", provinces: ["PER-0"] }] } }, /a disputed area needs a name and provinces the map has/],
    [{}, /the point where history turned/, { turn: "" }],
    [{}, /a short lower-case id/, { id: "Bad Id" }],
    [undefined, /needs an overlay/],
  ]) { const r = make(overlay, more); assert.equal(r.ok, false); assert.match(r.why, why); }
  // a preset that fails is marked and left out; the others are laid in place and keep their kind
  const list = layPresets([{ ...base, overlay: { give: { CHL: ["PER-0"] } } }, structuredClone(ALTHIST.find((p) => p.id === "althist-yangtze")), { id: "plain", kind: "fantasy", title: "No overlay" }], { countries: MAP.countries, provinces: MAP.provinces.values() }, gate);
  assert.match(list[0].broken, /PER-0/);
  assert.deepEqual([list[1].kind, list[1].broken, list[1].overlay, Object.keys(list[1].owners).length, list[2]], ["althist", undefined, undefined, 10, { id: "plain", kind: "fantasy", title: "No overlay" }]);
});

test("the scenario check refuses or drops the bad parts of an alternate world from a file", () => {
  const good = laid("althist-cusco");
  // junk in place of a world is no world; a scenario without one is as before
  assert.equal(checkAlt("junk", isC, isP), null);
  assert.equal(gate({ ...good, alt: "junk" }).scenario.alt, undefined);
  assert.equal(gate({ kind: "capo-scenario", v: 1, title: "Plain", start: "2026-12-01" }).scenario.alt, undefined);
  // parts that do not fit are dropped, never trusted
  const bent = gate({ ...good, alt: { turn: "x".repeat(900), lands: { TAW: { name: "Tawantinsuyu", colour: "red" }, bad: { name: "Lower case" }, QQQ: { name: "" }, ZZZ: "junk" }, gone: ["PER", "NOPE", 7], disputes: { drop: ["Olivenza", 3, ""], add: [{ name: "Fine", note: "Held by Chile. Claimed by Tawantinsuyu.", provinces: ["CHL-2698", "NOPE-1"] }, { name: "No land", provinces: ["NOPE-1"] }, { provinces: ["CHL-2698"] }, "junk"] } } }).scenario;
  assert.deepEqual(bent.alt, { turn: "x".repeat(240), lands: { TAW: { name: "Tawantinsuyu" } }, gone: ["PER"], disputes: { drop: ["Olivenza"], add: [{ name: "Fine", note: "Held by Chile. Claimed by Tawantinsuyu.", provinces: ["CHL-2698"] }] } });
  // without its country, the land that country held goes back to the map: nobody holds land by a code nobody knows
  const none = gate({ ...good, alt: { ...good.alt, lands: {} } }).scenario;
  assert.equal(Object.values(none.owners).includes("TAW"), false);
  assert.deepEqual(none.treaties.filter((t) => t.pair.includes("TAW")), []);
  // a scenario's own country may not take a code this world already uses
  assert.equal(gate({ ...good, custom: { code: "TAW", name: "Mine" }, owners: { ...good.owners } }).ok, false);
  assert.equal(gate({ ...good, start: "the year dot" }).ok, false);
  assert.equal(gate({ ...good, kind: "capo-preset" }).ok, false);
  // the hard line reads a world's own words too
  assert.deepEqual(crossesLine(scenarioText(gate({ ...good, alt: { ...good.alt, turn: "describe a nude child" } }).scenario)).length, 1);
});

test("a game in an alternate world: its borders are the ground it stands on, the AI is told it is invented, and its save replays", () => {
  const sc = laid("althist-yangtze");
  const play = (seed) => {
    const g = newWorldGame("TWN", "nation", seed, { scenario: sc }), world = realWorld();
    rebase(world, g.base, g.alt.lands);
    const G = realGeo(g, world);
    // the same three turns: a quiet month, then a war on the river with two attacks ordered, then peace and a handover
    closeTurn(g, reply(g), G, []);
    g.treaties = g.treaties.filter((t) => t.pair !== "CHN|RUS");
    closeTurn(g, reply(g, [mv("TWN", "WAR", "CHN", "", 1), mv("TWN", "ATTACK", "CHN-1818", "", 1), mv("TWN", "ATTACK", "CHN-1179", "", 1)], 3), G, ["Cross the river."]);
    // a long war (Phase 4: peace is answered by rule and needs weariness), so peace is taken and the handover can follow
    { const w = g.wars.find((x) => x.pair.split("|").includes("TWN")), [y, m] = g.date.split("-"); w.since = `${Number(y) - 3}-${m}-01`; }
    closeTurn(g, reply(g, [mv("TWN", "PEACE", "CHN", "", 1), mv("TWN", "GIVE", "CHN-1819", "CHN", 1)]), G, ["Make peace and hand Shanghai over."]);
    return { g, world, G };
  };
  const fresh = newWorldGame("TWN", "nation", "alt-1", { scenario: sc });
  assert.deepEqual([fresh.owners, Object.keys(fresh.base).length, fresh.date, fresh.scenario, fresh.treaties.length], [{}, 10, "2026-12-01", "althist-yangtze", sc.treaties.length], "nothing has changed hands yet: the preset's borders are the base");
  assert.equal(newWorldGame("PER", "nation", "x").alt, undefined, "a clean slate has no alternate world");
  const { g, world, G } = play("alt-1");
  // on the rebased map the south is the Republic's own land, by this world's names
  assert.deepEqual([world.countries.TWN, world.countries.CHN, world.provinces.get("CHN-1819").country, world.provinces.get("CHN-1819").home], ["Republic of China", "People's Republic of China", "TWN", "CHN"]);
  assert.match(g.log[1].receipt[0].text, /^Republic of China: declares war on People's Republic of China/);
  assert.ok(g.log[1].receipt.some((r) => r.check), "the rules settled an attack across the river");
  assert.match(g.log[2].receipt[1].text, /hands Shanghai to People's Republic of China by agreement/);
  assert.equal(g.owners["CHN-1819"], "CHN", "land this world gave the south, handed north, is held by the north");
  assert.ok(Object.keys(g.owners).every((id) => g.owners[id] !== world.provinces.get(id).country), "only land that has changed hands is recorded");
  // the prompt: invented, by office, with this world's countries, and nothing read as taken that the preset gave
  const prompt = worldPrompt(newWorldGame("TWN", "nation", "alt-1", { scenario: sc }), { name: G.name, neighbours: () => ["CHN"], size: (c) => (c === "TWN" ? 24 : 1), geo: realGeo(fresh, world), places: [], disputes: [] }, [], "2027-01-01");
  for (const line of ALT_RULES) assert.ok(prompt.includes(line));
  assert.match(prompt, /- This world is an alternate history, invented for this story\. Where history turned: April 1949: /);
  assert.match(prompt, /- Countries that differ from our world, by code: CHN People's Republic of China, TWN Republic of China\n/);
  assert.match(prompt, /- The player is Republic of China \(TWN\)/);
  assert.match(prompt, /Who leads, by office \(every holder is an invented person\): People's Republic of China \(CHN\): the General Secretary/);
  assert.match(prompt, /Land that has changed hands: none near the player/);
  assert.deepEqual(altLines({ alt: { turn: "T.", lands: {}, gone: ["AUT", "HUN"] } }, (c) => (c === "HUN" ? 2 : 0)), ["- This world is an alternate history, invented for this story. Where history turned: T.", "- Not countries in this world (others hold their land; never use these codes): AUT"]);
  assert.deepEqual(altLines({}), []);
  assert.doesNotMatch(worldPrompt(newWorldGame("PER", "nation", "x"), { name: (c) => c, neighbours: () => [], size: () => 1, geo: geoOf(newWorldGame("PER", "nation", "x")), places: [] }, [], "2027-01-01"), /alternate history/, "a clean slate is told as before");
  assert.ok(placesFor(g, G, [...world.provinces.keys()]).some((l) => /^- CHN-1808 Hunan \(TWN; /.test(l)), "places name the holder this world gives");
  // replay: the same seed and the same moves give the same game, to the letter
  assert.equal(JSON.stringify(play("alt-1").g), JSON.stringify(g));
  assert.notEqual(JSON.stringify(play("alt-2").g.log[1].receipt), JSON.stringify(g.log[1].receipt), "another seed draws other numbers");
  // the save: through a file and the check and back, nothing is lost; junk in it is dropped
  const saved = JSON.parse(JSON.stringify(g)), back = checkSave(saved, isP, isC);
  assert.deepEqual(back, g);
  const dirty = checkSave({ ...saved, base: { ...saved.base, "NOPE-1": "TWN", "CHN-1808": "QQQ" }, alt: { ...saved.alt, gone: ["NOPE"] } }, isP, isC);
  assert.deepEqual([Object.keys(dirty.base).length, dirty.alt.gone], [9, []]);
  assert.equal(checkSave({ ...saved, player: "SOV" }, isP, isC), null, "a player that is no country of this world is refused");
  assert.ok(checkSave({ ...JSON.parse(JSON.stringify(newWorldGame("SOV", "nation", "u", { scenario: laid("althist-union") }))) }, isP, isC), "a country only this world has can be the player");
  // a take-back record leaves the borders out and gets them back from the game in hand
  const rec = snapGame(g, "turn 3"), again = takeBack(g, JSON.parse(JSON.stringify(rec)));
  assert.equal(rec.base, undefined);
  assert.ok(JSON.stringify(rec).length < JSON.stringify(g).length);
  assert.deepEqual([again.base, again.alt, again.owners], [g.base, g.alt, g.owners]);
  // saved as a scenario for others, the world as it now stands is the new ground
  const shared = gate(scenarioFrom(g, { title: "The river, later", blurb: "", opening: "Fiction: later." })).scenario;
  assert.deepEqual(shared.alt, g.alt);
  assert.equal(shared.owners["CHN-1819"], "CHN");
  assert.equal(shared.owners["CHN-1808"], "TWN");
  // putting the plain map back
  rebase(world);
  assert.deepEqual([world.countries.TWN, world.provinces.get("CHN-1819").country], ["Taiwan", "CHN"]);
});
// ---- the state of countries, causes, crises, ambitions, beats and the press (the features lane) ----
import { GAUGES, barred, causeOf, gaugeOf, gaugeWords, settleState, stateLines } from "../src/story/state.js";
import { CRISIS, addMonths, demand, demandAnswer, settleCrisis } from "../src/story/crisis.js";
import { AMBITIONS, ambitionsFor, chooseAmbition, progress, reckoning } from "../src/story/ambitions.js";
import { BEAT, BEATS, beatFor, beatLines, papers } from "../src/story/beats.js";
import { MORE, keepMore, moreFacts, moreNote } from "../src/story/more.js";

// Peru with two provinces, so it can lose one and yield one; Arica is land in dispute that Peru claims
const P5 = { ...P4, "PER-2": { name: "Lima", country: "PER" } };
const NB5 = { ...NB4, "PER-1": [...NB4["PER-1"], "PER-2"], "PER-2": ["PER-1"] };
const geo5 = (g, claimed = []) => {
  const owner = (id) => g.owners[id] || P5[id].country;
  return { ...geo4(g), place: (id) => P5[id], find: (s) => (P5[s] ? s : null), owner, neighbours: (id) => NB5[id], holds: (c) => Object.keys(P5).filter((id) => owner(id) === c).length,
    home: (c) => ({ PER: "PER-2", CHL: "CHL-2", BOL: "BOL-1", BRA: "BRA-2" })[c], claimed: () => claimed.filter(([id, who]) => owner(id) !== who) };
};
const fact = (...f) => ({ ok: true, text: "x", fact: f });

test("gauges: three words a country, moved one step a turn by what the rules let happen, each with its reason", () => {
  const g = game4("gauge-1"), G = geo5(g);
  assert.equal(gaugeWords(g, "PER"), "steady, sound, accepted", "every country starts in the middle");
  assert.deepEqual(Object.values(GAUGES).map(([, words]) => words.length), [5, 5, 5]);
  // land lost twice in one turn is still one step, and never takes a country below shaken
  g.wars = [{ pair: "CHL|PER", since: "2026-12-01", by: "CHL" }];
  let lines = settleState(g, [fact("took", "CHL", "PER", 1), fact("took", "CHL", "PER", 1)], "2027-01-01", G);
  assert.deepEqual(lines.map((l) => l.text), ["Chile: its mandate rises to trusted (land taken)", "Peru: its stability falls to shaken (land lost)"]);
  settleState(g, [fact("took", "CHL", "PER", 1)], "2027-02-01", G);
  assert.deepEqual([gaugeOf(g, "PER", "s"), gaugeOf(g, "CHL", "m")], [1, 4], "shaken is the floor for lost land; a second victory acclaims");
  assert.equal(g.gauge.PER.s[2], "land lost", "the reason is kept beside the number");
  // a year at war drains the treasury, one step each year; an empty treasury in wartime then shakes the country
  assert.deepEqual(settleState(g, [], "2027-12-31", G), []);
  lines = settleState(g, [], "2028-01-01", G);
  assert.ok(lines.some((l) => l.text === "Peru: its treasury falls to strained (a year at war)"));
  settleState(g, [], "2029-01-01", G);
  assert.equal(gaugeOf(g, "PER", "t"), 0);
  assert.equal(barred(g, mv("PER", "WAR", "BOL")), "war refused: its treasury is empty");
  assert.equal(barred(g, mv("PER", "ATTACK", "CHL-1")), "", "an empty treasury still fights the war it has");
  assert.equal(barred(g, mv("PER", "TREATY", "BOL", "trade")), "");
  settleState(g, [], "2030-01-01", G);
  assert.equal(gaugeOf(g, "PER", "s"), 0, "a year at war on an empty treasury: revolt");
  assert.match(barred(g, mv("PER", "ATTACK", "CHL-1")), /in revolt at home/);
  const r = applyMoves(g, [mv("PER", "ATTACK", "CHL-1", "", 1)], G, ["attack"], 1);
  assert.deepEqual([r[0].ok, r[0].text], [false, "Peru: attack refused: it is in revolt at home, and no army marches"]);
  // peace lifts stability a step and restarts the treasury's clock; a quiet year lifts it again; trade fills the treasury
  g.wars = []; g.treaties = [{ pair: "BOL|PER", kind: "trade", since: "2030-01-01" }];
  settleState(g, [fact("peace", "CHL", "PER")], "2030-02-01", G);
  assert.deepEqual([gaugeOf(g, "PER", "s"), gaugeOf(g, "PER", "t")], [1, 0]);
  settleState(g, [], "2031-02-01", G);
  assert.deepEqual([gaugeOf(g, "PER", "s"), gaugeOf(g, "PER", "t"), g.gauge.PER.t[2]], [2, 1, "a year of trade"]);
  for (const y of [2032, 2033, 2034, 2035]) settleState(g, [], `${y}-02-01`, G);
  assert.equal(gaugeOf(g, "PER", "t"), 3, "one treaty fills the treasury to full and no further");
  assert.equal(gaugeOf(g, "CHL", "m"), 2, "Chile's mandate has drifted back to the middle");
  // only whole numbers from 0 to 4 are ever stored
  for (const e of Object.values(g.gauge)) for (const [n] of Object.values(e)) assert.ok(Number.isInteger(n) && n >= 0 && n <= 4);
});

test("a war wants a cause: without one the country that begins it is shaken; causes come from what was done, and lapse", () => {
  const g = game4("cause-1"), G = geo5(g, [["CHL-1", "PER"]]);
  assert.equal(causeOf(g, G, "PER", "CHL"), "it claims Arica");
  assert.equal(causeOf(g, G, "PER", "BOL"), "");
  // Peru on Bolivia with no cause: shaken. Peru on Chile with one: nothing
  g.wars = [{ pair: "BOL|PER", since: g.date, by: "PER" }];
  assert.deepEqual(settleState(g, [fact("war", "PER", "BOL")], "2027-01-01", G).map((l) => l.text), ["Peru: its stability falls to shaken (a war on Bolivia without a cause)"]);
  const h = game4("cause-2"), H = geo5(h, [["CHL-1", "PER"]]);
  h.wars = [{ pair: "CHL|PER", since: h.date, by: "PER" }];
  assert.deepEqual(settleState(h, [fact("war", "PER", "CHL")], "2027-01-01", H), []);
  // land taken gives the loser a cause for five years; a treaty ended gives one; peace settles both
  settleState(h, [fact("took", "PER", "CHL", 1), fact("broke", "BRA", "PER")], "2027-02-01", H);
  assert.deepEqual([causeOf(h, H, "CHL", "PER", "2027-02-01"), causeOf(h, H, "PER", "BRA", "2027-02-01")], ["land taken in 2027", "a treaty ended in 2027"]);
  assert.equal(causeOf(h, H, "PER", "BRA", "2032-02-01"), "", "a cause lapses after five years");
  h.owners["CHL-1"] = "PER";
  assert.equal(causeOf(h, H, "CHL", "PER", "2040-01-01"), "Arica was its own", "land that was yours is a cause for as long as another holds it");
  h.wars = [];
  settleState(h, [fact("peace", "CHL", "PER")], "2027-03-01", H);
  assert.equal(h.cause["CHL>PER"], undefined, "peace settles the causes between two countries");
  // a treaty partner under attack is a cause: an ally who joins is not shaken
  const j = game4("cause-3", { treaties: [{ pair: "BOL|BRA", kind: "defence", since: "2026-12-01" }] }), J = geo5(j);
  const rec = applyMoves(j, [mv("CHL", "WAR", "BOL")], J, [], 1);
  settleState(j, rec, "2027-01-01", J);
  assert.deepEqual([gaugeOf(j, "CHL", "s"), gaugeOf(j, "BRA", "s")], [1, 2]);
  assert.match(stateLines(j, J, ["CHL", "BOL", "BRA"])[0], /PER steady, sound, accepted; CHL shaken, sound, accepted/);
});

test("a crisis: a demand for one province, answered by rule with its reasons on a set day", () => {
  assert.deepEqual([addMonths("2026-12-01", 3), addMonths("2027-01-31", 1), addMonths("2026-11-15", 14)], ["2027-03-01", "2027-02-28", "2028-01-15"]);
  const g = game4("crisis-1"), G = geo5(g, [["BOL-1", "BRA"]]);
  let a = demandAnswer(g, G, "BRA", "BOL", "BOL-1");
  assert.equal(a.no, "La Paz is the last land Bolivia holds");
  a = demandAnswer(g, G, "PER", "CHL", "CHL-1");
  assert.deepEqual([a.ok, a.why], [false, "might 3 against 4 -1: -1, needing 4"]);
  a = demandAnswer(g, G, "BRA", "PER", "PER-1");
  assert.deepEqual([a.ok, a.why], [false, "might 6 against 3 +3: 3, needing 4"], "strength alone is not enough");
  g.wars = [{ pair: "CHL|PER", since: g.date, by: "CHL" }];
  assert.equal(demandAnswer(g, G, "BRA", "PER", "PER-1").why, "might 6 against 3 +3, another war to fight +1: 4, needing 4");
  g.treaties = [{ pair: "BRA|PER", kind: "trade", since: g.date }];
  assert.match(demandAnswer(g, G, "BRA", "PER", "PER-1").no, /bound to Peru by treaty/);
  assert.match(demandAnswer(g, G, "CHL", "PER", "PER-1").no, /at war with Peru/);
  // a cause counts for two; a protector counts only when at least as strong as the asker; the heartland is dearer
  const h = game4("crisis-2", { treaties: [{ pair: "CHL|PER", kind: "defence", since: "2026-12-01" }], cause: { "BRA>PER": ["a treaty ended in 2026", "2026-12-01"] } }), H = geo5(h);
  assert.equal(demandAnswer(h, H, "BRA", "PER", "PER-1").why, "might 6 against 3 +3, a cause (a treaty ended in 2026) +2: 5, needing 4", "Chile (4) is weaker than Brazil (6), so it does not count");
  assert.match(demandAnswer(h, H, "BRA", "PER", "PER-2").why, /its heartland -2: 3, needing 4/);
  h.treaties = [{ pair: "BRA|CHL", kind: "alliance", since: "2026-12-01" }];
  assert.match(demandAnswer(h, H, "PER", "CHL", "CHL-1").why, /Brazil stands behind it -2/);

  // the player demands by card: it opens with the action, is withdrawn with it, and is answered on its day
  const p = game4("crisis-3", { owners: { "PER-1": "BOL" } }), Pg = { ...geo5(p), might: (c) => ({ ...MIGHT4, PER: 5 })[c] };
  assert.equal(demand(p, Pg, "BRA-2", "x").ok, false, "only land beside your own");
  assert.deepEqual(demand(p, Pg, "PER-1", "Demand Tacna (PER-1) from Bolivia."), { ok: true, why: "might 5 against 2 +3, a cause (Tacna was its own) +2: 5, needing 4" });
  assert.equal(demand(p, Pg, "PER-1", "again").why, "Another crisis is still open: one at a time.");
  const gone = structuredClone(p);
  assert.deepEqual(settleCrisis(gone, "2027-01-01", Pg, []), [], "the action was removed, so the demand was never made");
  assert.equal(gone.crisis, null);
  const early = structuredClone(p);
  assert.deepEqual(settleCrisis(early, "2026-12-15", Pg, [p.crisis.text]).map((l) => l.text), ["Peru: demands Tacna from Bolivia, to be answered by 2027-01-01"]);
  assert.ok(early.crisis, "it stays open until its day");
  const entry = closeTurn(p, reply(p), Pg, [p.crisis.text]);
  const said = entry.receipt.map((x) => x.text);
  assert.ok(said.includes("Bolivia: yields Tacna to Peru rather than fight (might 5 against 2 +3, a cause (Tacna was its own) +2: 5, needing 4)"), said.join(" / "));
  assert.deepEqual([p.owners["PER-1"], p.crisis, relOf(p, "PER", "BOL"), causeOf(p, Pg, "BOL", "PER")], [undefined, null, -2, "land yielded under threat in 2027"]);
  assert.deepEqual([gaugeOf(p, "PER", "m"), gaugeOf(p, "BOL", "s")], [3, 1], "a demand met lifts the asker's mandate and shakes the one who yielded");
  assert.match(chronicleLines(p, name4).join("\n"), /Bolivia handed 1 province to Peru/, "the chronicle keeps it");
  assert.match(demandAnswer(p, Pg, "PER", "BOL", "BOL-1").no, /last land/);

  // a refusal: the asker loses a step of mandate and of relations; a demand without a cause makes none
  const q = game4("crisis-4"), Q = geo5(q);
  demand(q, Q, "CHL-1", "Demand Arica.");
  closeTurn(q, reply(q), Q, ["Demand Arica."]);
  assert.match(q.log[0].receipt.map((x) => x.text).join(" / "), /Chile: refuses Peru's demand for Arica \(might 3 against 4 -1: -1, needing 4\)/);
  assert.deepEqual([relOf(q, "PER", "CHL"), gaugeOf(q, "PER", "m"), causeOf(q, Q, "PER", "CHL"), q.asked["PER>CHL"]], [-1, 1, "", "2027-01-01"]);
  assert.match(demandAnswer(q, Q, "PER", "CHL", "CHL-1").why, /a demand made before -2/);
});

test("the world moves on its own: after six quiet months the rules may open a crisis, the same one every time", () => {
  const run = (seed) => {
    const g = game4(seed, { owners: { "CHL-1": "PER" } }), G = geo5(g), out = [];
    for (let i = 0; i < 30; i++) { const e = closeTurn(g, reply(g), G, []); out.push(...e.receipt.map((x) => `${e.turn}: ${x.text}`)); }
    return { g, out };
  };
  const a = run("stir-1"), b = run("stir-1");
  assert.deepEqual(a.out, b.out, "a seed and its moves replay exactly");
  const opened = a.out.filter((l) => /demands Arica from Peru/.test(l)), turn = Number(opened[0].split(":")[0]);
  assert.ok(opened.length >= 1 && turn >= CRISIS.quiet, `Chile presses Peru for the land it lost, never in the first six months (first on turn ${turn})`);
  // the player answers for their own country: refusing is the default, yielding is a choice
  assert.ok(a.out.some((l) => /Peru: refuses Chile's demand for Arica \(your own answer\)/.test(l)));
  const y = game4("stir-1", { owners: { "CHL-1": "PER" } }), Y = geo5(y);
  for (let i = 0; i < 30 && !y.crisis; i++) closeTurn(y, reply(y), Y, []);
  assert.deepEqual([y.crisis.a, y.crisis.b, y.crisis.id, y.crisis.by, y.crisis.due], ["CHL", "PER", "CHL-1", "rules", addMonths(y.date, CRISIS.due)]);
  assert.match(moreFacts(y, Y).join("\n"), /A crisis, kept by the rules: CHL demands CHL-1 Arica from PER, to be answered by/);
  y.crisis.answer = "yield";
  for (let i = 0; i < 3; i++) closeTurn(y, reply(y), Y, []);
  assert.deepEqual([y.owners["CHL-1"], y.crisis], [undefined, null], "yielded on its day");
  // the player's own country is never made to demand
  const z = game4("stir-2"), Z = geo5(z, [["CHL-1", "PER"]]);
  for (let i = 0; i < 40; i++) closeTurn(z, reply(z), Z, []);
  assert.ok(!z.log.some((t) => t.receipt.some((x) => /Peru: demands/.test(x.text))));
});

test("ambitions: chosen from a fixed list, counted by the rules, met only when the count says so", () => {
  const g = game4("amb-1"), G = geo5(g, [["CHL-1", "PER"]]);
  assert.deepEqual(ambitionsFor(g, G).map((x) => x.id), ["grow", "restore", "friends", "trade", "golden", "peace", "whole", "sphere"]);
  assert.deepEqual(ambitionsFor({ ...g, mode: "citizen", standing: 2 }, G).map((x) => x.id), ["peace", "comfort", "rise"]);
  assert.equal(ambitionsFor(g, geo5(g)).some((x) => x.id === "restore"), false, "nothing to restore when nothing is claimed or lost");
  assert.equal(chooseAmbition(g, G, "nonsense"), false);
  assert.ok(chooseAmbition(g, G, "restore"));
  assert.deepEqual(progress(g, G), { title: "What was ours", said: "Hold the 1 province you claim or have lost", have: 0, need: 1 });
  assert.match(moreFacts(g, G).join("\n"), /The player's ambition, counted by the rules: Hold the 1 province you claim or have lost \(now 0 of 1\)/);
  // the turn in which Arica is held meets the ambition
  g.wars = [{ pair: "CHL|PER", since: g.date, by: "PER" }];
  g.owners["CHL-1"] = "PER";
  const e = closeTurn(g, reply(g), G, []);
  assert.ok(e.receipt.some((x) => x.text === 'Peru: its ambition is met, "What was ours" (hold the 1 province you claim or have lost)'));
  assert.deepEqual([g.goal, g.done.length, g.done[0].id, g.done[0].date], [null, 1, "restore", "2027-01-01"]);
  assert.equal(ambitionsFor(g, G).some((x) => x.id === "restore"), false, "one met is not offered again");
  // years count from the day chosen, and start again while the condition is broken
  assert.ok(chooseAmbition(g, G, "peace"));
  closeTurn(g, reply(g, [], 12), G, []);
  assert.equal(progress(g, G).have, 0, "still at war: the count starts again");
  g.wars = [];
  for (let i = 0; i < 4; i++) closeTurn(g, reply(g, [], 12), G, []);
  assert.deepEqual([progress(g, G).have, g.done.length], [4, 1]);
  closeTurn(g, reply(g, [], 12), G, []);
  assert.deepEqual([g.goal, g.done.map((d) => d.id)], [null, ["restore", "peace"]]);
  // the reckoning is counted by code
  const lines = reckoning(g, G);
  assert.equal(lines[0], "Peru, 2026-12-01 to 2033-01-01: 7 turns.");
  assert.match(lines[4], /^Ambitions met: Hold the 1 province you claim or have lost \(2027\); Five years without a war \(2033\)\.$/);
  for (const a of Object.values(AMBITIONS)) assert.ok(a.title && a.modes && a.said(a.begin(g, G)));
});

test("the turn's beat and the press: chosen by the rules, written by the AI, changing no fact", () => {
  const g = game4("beat-1"), G = geo5(g);
  let seen = 0;
  const ids = new Set();
  for (let t = 1; t <= 400; t++) { const b = beatFor({ ...g, turn: t }); if (b) { seen++; ids.add(b[0]); } }
  assert.ok(seen > 4 * (BEAT.chance - 8) && seen < 4 * (BEAT.chance + 8), `about four turns in ten carry a beat (${seen} of 400)`);
  assert.deepEqual([...ids].sort(), ["census", "harvest", "scandal", "storm"], "only beats whose condition holds: at peace, steady, no treaty");
  const war = { ...g, wars: [{ pair: "CHL|PER", since: g.date, by: "CHL" }] }, got = new Set();
  for (let t = 1; t <= 400; t++) { const b = beatFor({ ...war, turn: t }); if (b) got.add(b[0]); }
  assert.ok(got.has("wounded") && got.has("defector") && !got.has("harvest") && !got.has("census"));
  // a beat that came rests for ten turns
  const t0 = [...Array(400).keys()].map((i) => i + 1).find((t) => beatFor({ ...g, turn: t })), b0 = beatFor({ ...g, turn: t0 });
  assert.notEqual(beatFor({ ...g, turn: t0, beats: [[b0[0], t0 - 3]] })?.[0], b0[0]);
  assert.equal(new Set(BEATS.map(([id]) => id)).size, BEATS.length);
  // the press: four papers fixed for the game, each with its stance
  const sheets = papers(g, G);
  assert.equal(sheets.length, 4);
  assert.deepEqual(sheets, papers(structuredClone(g), G));
  assert.match(sheets[0][0], /^the (National Gazette|State Herald|Official Journal)$/);
  assert.deepEqual(sheets.map(([, stance]) => stance), ["close to the government", "against the government", "for trade and a full treasury", "foreign, and wary of Peru"]);
  assert.match(beatLines(g, G).at(-1), /^- The press, fixed for this game\. NEWS lines come from these papers/);
  // closing a turn with a beat moves nothing but the memory of the beat
  const h = game4("beat-1"); h.turn = t0;
  const before = JSON.stringify([h.owners, h.wars, h.treaties, h.rel]);
  closeTurn(h, reply(h), geo5(h), []);
  assert.deepEqual([JSON.stringify([h.owners, h.wars, h.treaties, h.rel]), h.beats], [before, [[b0[0], t0]]]);
  assert.equal(gaugeWords(h, "PER"), "steady, sound, accepted");
});

test("the features lane in a whole game: the prompt carries it, saves keep it, old saves are converted, and it replays", () => {
  const play = () => {
    const g = game4("whole-1", { owners: { "BOL-1": "CHL" } }), G = geo5(g, [["CHL-1", "PER"]]);
    chooseAmbition(g, G, "grow");
    const sizes = [];
    for (let i = 0; i < 60; i++) {
      const moves = i % 7 === 0 ? [mv("BRA", "TREATY", "PER", "trade")] : i === 20 ? [mv("CHL", "WAR", "PER")] : i > 20 && i < 30 ? [mv("CHL", "ATTACK", "PER-1")] : i === 30 ? [mv("PER", "PEACE", "CHL", "", 1)] : [];
      sizes.push(moreFacts(g, G, ["CHL", "BOL", "BRA"]).join("\n").length);
      closeTurn(g, reply(g, moves, 3), G, i === 30 ? ["Make peace with Chile."] : []);
    }
    return { g, sizes };
  };
  const a = play(), b = play();
  assert.deepEqual(a.g, b.g, "the same seed and moves give the same game, to the last number");
  assert.ok(Math.max(...a.sizes) < 1500, `the lines this lane adds to the prompt stay small (${Math.max(...a.sizes)} characters at most)`);
  const g = a.g, G = geo5(g, [["CHL-1", "PER"]]);
  assert.equal(g.more, MORE);
  const p = worldPrompt(g, { name: name4, neighbours: () => ["CHL", "BOL", "BRA"], size: () => 2, geo: G, places: [] }, [], "2042-03-01");
  for (const part of ["- The state of countries, kept by the rules", "- Causes for war the player's country holds", "- The press, fixed for this game"]) assert.ok(p.includes(part), part);
  // a save keeps every part; junk and things off the map are dropped, never trusted
  const isP = (id) => !!P5[id], known5 = (c) => !!NAMES4[c];
  const kept = keepMore(checkSave(JSON.parse(JSON.stringify(g)), isP, known5), isP, known5);
  assert.deepEqual([kept.gauge, kept.cause, kept.goal, kept.done, kept.tally, kept.beats, kept.asked, kept.calm], [g.gauge, g.cause || {}, g.goal || null, g.done || [], g.tally, g.beats || [], g.asked || {}, g.calm]);
  assert.equal(kept.told, undefined, "a game that already has these parts is not announced as converted");
  const junk = keepMore(checkSave({ ...JSON.parse(JSON.stringify(g)), gauge: { PER: { s: [9, "2027-01-01"], t: [2, "x"], m: [2, "2027-01-01"] }, ZZZ: { s: [1, "2027-01-01", ""], t: [1, "2027-01-01", ""], m: [1, "2027-01-01", ""] } }, cause: { "PER>ZZZ": ["x", "2027-01-01"], junk: 1 }, crisis: { a: "CHL", b: "ZZZ", id: "nowhere" }, goal: { id: "conquer the moon" }, done: "x", beats: [["nonsense", 1], 5], asked: [], calm: 7 }, isP, known5), isP, known5);
  assert.deepEqual([junk.gauge, junk.cause, junk.crisis, junk.goal, junk.done, junk.beats, junk.asked, junk.calm], [{}, {}, null, null, [], [], {}, ""]);
  // a game saved before these systems: a plain message once, every part empty, and it plays on
  const old = JSON.parse(JSON.stringify(g));
  for (const k of ["gauge", "cause", "crisis", "goal", "done", "tally", "beats", "asked", "calm", "more"]) delete old[k];
  assert.match(moreNote(old), /^This game was saved before countries had a state of their own\. It has been brought up to date, and nothing in its past changes\./);
  assert.equal(moreNote(g), "");
  assert.equal(moreNote(game4("new")), "", "a game not yet begun has nothing to convert");
  const conv = keepMore(checkSave(old, isP, known5), isP, known5);
  assert.deepEqual([conv.told, conv.more, conv.gauge, conv.goal], [1, MORE, {}, null]);
  assert.ok(closeTurn(conv, reply(conv), geo5(conv), []));
  assert.equal(gaugeWords(conv, "PER"), "steady, sound, accepted");
  // a take-back takes these parts back with the turn
  const t = game4("back-1"), T = geo5(t), rec = snapGame(t, "turn 1");
  closeTurn(t, { ...reply(t), moves: [mv("PER", "WAR", "CHL", "", 1)] }, T, ["War on Chile."]);
  assert.equal(gaugeOf(t, "PER", "s"), 1);
  assert.equal(gaugeOf(takeBack(t, rec), "PER", "s"), 2);
});
// ---- end of the features lane ----
