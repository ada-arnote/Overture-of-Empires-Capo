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
  // trust is built in steps: trade, then defence, then an alliance, one a turn
  const acts = ["Treaty with Bolivia"], G = geo4(g);
  let r = applyMoves(g, [mv("PER", "TREATY", "BOL", "alliance", 1)], G, acts, 1);
  assert.deepEqual([r[0].ok, r[0].text], [false, "Peru: proposes an alliance treaty to Bolivia, which refuses (relations neutral 0: 0, needing 4)"]);
  assert.deepEqual(r[0].fact, ["no", "PER", "BOL", "alliance"]);
  assert.equal(g.treaties.length, 0);
  r = applyMoves(g, [mv("PER", "TREATY", "BOL", "trade", 1), mv("PER", "TREATY", "BOL", "defence", 1)], G, acts, 1);
  assert.equal(r[0].text, "Peru: signs a trade treaty with Bolivia, which agrees (relations neutral 0: 0, needing 0)");
  assert.equal(r[1].text, "Peru: turns its trade treaty with Bolivia into a defence treaty, which agrees (relations warm +2: 2, needing 2)");
  assert.equal(relOf(g, "PER", "BOL"), 1, "two treaties in one turn rise one step");
  assert.equal(applyMoves(g, [mv("PER", "TREATY", "BOL", "alliance", 1)], G, acts, 1)[0].ok, false, "an alliance needs more than warm");
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
  for (const t of [r[0].text, r[1].text, rr[0].text]) assert.doesNotMatch(t, /\d\.\d|\.\s/, "one sentence, whole numbers");
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
  assert.match(convertNote(old), /relations and answer treaties by rule/);
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
  assert.deepEqual(ambitionsFor(g, G).map((x) => x.id), ["grow", "restore", "friends", "trade", "golden", "peace", "whole"]);
  assert.deepEqual(ambitionsFor({ ...g, mode: "citizen", standing: 2 }, G).map((x) => x.id), ["peace", "rise"]);
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
