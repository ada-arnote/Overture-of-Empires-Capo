// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo's features lane, round three: pacts of non-aggression and tribute between any two countries (as moves, and
// by rule), other countries answering their own unrest, a rising that founds a country, and how restless the world is.
import { test } from "node:test";
import assert from "node:assert/strict";
import { closeTurn, newWorldGame, readWorldReply, turnCode, worldPrompt } from "../src/story/turn.js";
import { VERBS, applyMoves, reviewMoves } from "../src/story/worldrules.js";
import { checkSave, convertNote, snapGame, takeBack } from "../src/story/saves.js";
import { RULES } from "../src/story/check.js";
import { checkScenario, scenarioFrom, scenarioText } from "../src/story/scenarios.js";
import { causeOf, gaugeOf, settleState } from "../src/story/state.js";
import { demandAnswer } from "../src/story/crisis.js";
import { truceUntil } from "../src/story/war.js";
import { relOf } from "../src/story/relations.js";
import { factWords, factsOf } from "../src/story/chronicle.js";
import { settleHome, settleUnrest } from "../src/story/home.js";
import { PACT, askClause, fearOf, mayDun, pactAnswer, pactOf, settlePacts, sphereOf, tributeOf } from "../src/story/pacts.js";
import { COLOURS, FORMS, NEUTRAL, POLITY, codeFor, found, keepLands, nameFor, polityLines, rebelLand } from "../src/story/polity.js";
import { PACE, RIVALS, crisisChance, keepPace, paceOf, rivalMoves, setPace } from "../src/story/rivals.js";
import { clauseWords, pactView } from "../src/story/views.js";
import { keepMore, moreFacts, plan } from "../src/story/more.js";
import { SETTINGS } from "../src/map/worlds.js";
import { madeWorld, settingScenario } from "../src/story/settings.js";

// Peru (Lima its heartland), Chile, Bolivia, and Brazil with five provinces (Rondonia its heartland)
const P = { "PER-1": { name: "Tacna", country: "PER" }, "PER-2": { name: "Lima", country: "PER" }, "CHL-1": { name: "Arica", country: "CHL" }, "CHL-2": { name: "Santiago", country: "CHL" }, "BOL-1": { name: "La Paz", country: "BOL" }, "BOL-2": { name: "Sucre", country: "BOL" },
  "BRA-1": { name: "Acre", country: "BRA" }, "BRA-2": { name: "Rondonia", country: "BRA" }, "BRA-3": { name: "Amapa", country: "BRA" }, "BRA-4": { name: "Para", country: "BRA" }, "BRA-5": { name: "Bahia", country: "BRA" } };
const NB = { "PER-1": ["CHL-1", "BOL-1", "BRA-1", "PER-2"], "PER-2": ["PER-1"], "CHL-1": ["PER-1", "CHL-2", "BOL-1"], "CHL-2": ["CHL-1"], "BOL-1": ["PER-1", "BRA-1", "CHL-1", "BOL-2"], "BOL-2": ["BOL-1"],
  "BRA-1": ["PER-1", "BOL-1", "BRA-2"], "BRA-2": ["BRA-1", "BRA-3"], "BRA-3": ["BRA-2", "BRA-4", "BRA-5"], "BRA-4": ["BRA-3", "BRA-5"], "BRA-5": ["BRA-3", "BRA-4"] };
const MIGHT = { PER: 3, CHL: 4, BOL: 2, BRA: 6 }, NAMES = { PER: "Peru", CHL: "Chile", BOL: "Bolivia", BRA: "Brazil" }, HOMES = { PER: "PER-2", CHL: "CHL-2", BOL: "BOL-2", BRA: "BRA-2" };
// what the page's map answers, with the countries founded in the game counted as countries
const geoOf = (g) => {
  const owner = (id) => g.owners[id] || P[id].country;
  return { name: (c) => g.lands?.[c]?.name || NAMES[c] || c, all: Object.keys(P), place: (id) => P[id], find: (s) => (P[s] ? s : null), owner, neighbours: (id) => NB[id], across: () => [], coastal: () => false, hasCoast: () => false,
    holds: (c) => Object.keys(P).filter((id) => owner(id) === c).length, known: (c) => !!NAMES[c] || !!g.lands?.[c], might: (c) => g.might?.[c] ?? MIGHT[c], home: (c) => HOMES[c] || g.lands?.[c]?.seat, claimed: () => [] };
};
const game = (seed, extra = {}, me = "PER", mode = "nation") => ({ ...newWorldGame(me, mode, seed), ...extra });
const reply = (g, moves = [], months = 1) => { const d = new Date(`${g.date}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + months); return { moves, events: [], news: [], summary: "A quiet month.", dropped: [], advice: null, standing: null, stop: d.toISOString().slice(0, 10) }; };
const mv = (country, verb, target, detail = "", action = 0) => ({ action, country, verb, target, detail });
const isP = (id) => !!P[id], known = (c) => !!NAMES[c];
const gauges = (g, c, s, t = 2, m = 2, at = g.date) => { g.gauge = { ...(g.gauge || {}), [c]: { s: [s, at, ""], t: [t, at, ""], m: [m, at, ""] } }; };
const texts = (lines) => lines.map((l) => l.text);
// a turn in which an AI moved for other countries (a move the rules refuse), so none moves by rule
const QUIET = [mv("CHL", "PEACE", "BRA")];

test("the rules version is 6, and a game saved under 5 or 4 is told what changed", () => {
  assert.equal(RULES, 6);
  assert.match(convertNote({ rules: 5 }), /^This game was saved under rules version 5\. It has been brought up to date: its past turns keep the results they had\..*a year old.*press your country.*call you to arms.*is over\.$/);
  assert.match(convertNote({ rules: 4 }), /^This game was saved under rules version 4\. It has been brought up to date: its past turns keep the results they had\..*pacts of non-aggression and tribute.*found a new country\.$/);
  assert.match(convertNote({ rules: 3 }), /saved under older rules/);
  assert.equal(convertNote({ rules: 6 }), "");
  assert.equal(convertNote(game("v")), "");
});

test("PACT and TRIBUTE are moves the AI is told of, in two short lines", () => {
  assert.match(VERBS.PACT, /pact of non-aggression \(target: its country code\)/);
  assert.match(VERBS.TRIBUTE, /yearly tribute of a weaker country beside it \(target: its country code\)/);
  assert.ok(VERBS.PACT.length + VERBS.TRIBUTE.length < 170, "the prompt stays compact");
  const g = game("verbs"), p = worldPrompt(g, { name: (c) => NAMES[c], neighbours: () => ["CHL", "BOL", "BRA"], size: () => 2, geo: geoOf(g), places: [] }, [], "2027-01-01");
  assert.ok(p.includes(`- PACT: ${VERBS.PACT}`) && p.includes(`- TRIBUTE: ${VERBS.TRIBUTE}`));
  assert.ok(p.includes("- A country asked for a treaty, a pact, tribute or peace answers by the rules."));
});

test("a pact between two other countries: the same sum the player's card uses, with a part for a neighbour both fear", () => {
  const g = game("pact-1", {}, "CHL"), G = geoOf(g);
  // Peru (3) and Bolivia (2) both stand beside Brazil (6): at least two stronger than either
  assert.equal(fearOf(g, G, "PER", "BOL"), "BRA");
  assert.equal(fearOf(g, G, "CHL", "BOL"), "", "Peru, beside both, is not much stronger than Chile");
  const a = pactAnswer(g, G, "PER", "BOL", "peace");
  assert.deepEqual([a.ok, a.why], [true, "relations neutral 0, Brazil beside both and stronger than both +1: 1, needing 1"]);
  assert.deepEqual([pactAnswer(g, G, "CHL", "BOL", "peace").ok, pactAnswer(g, G, "CHL", "BOL", "peace").why], [false, "relations neutral 0: 0, needing 1"]);
  // a protector is not feared: Bolivia, allied to Brazil, has no such reason
  g.treaties = [{ pair: "BOL|BRA", kind: "defence", since: g.date }];
  assert.equal(fearOf(g, G, "PER", "BOL"), "");
  g.treaties = [];
  const receipt = applyMoves(g, [mv("PER", "PACT", "BOL"), mv("CHL", "PACT", "BOL"), mv("PER", "PACT", "BOL"), mv("PER", "PACT", "ZZZ")], G, [], 1);
  assert.deepEqual(texts(receipt), [
    "Peru: signs a pact of non-aggression with Bolivia, which agrees (relations neutral 0, Brazil beside both and stronger than both +1: 1, needing 1)",
    "Chile: a pact of non-aggression with Bolivia is refused: at war with nobody, bound by nothing, it is yours to ask from its card",
    "Peru: a pact of non-aggression with Bolivia is refused: that pact already stands",
    "Peru: a pact of non-aggression refused: \"ZZZ\" is not a country",
  ].map((t, i) => (i === 1 ? receipt[1].text : t)));
  // Chile is the player here: its own move needs an action of its own, as any move does
  assert.match(receipt[1].text, /^Chile: pact refused: your country moves only on your own actions$/);
  assert.deepEqual(pactOf(g, "BOL", "PER"), { kind: "peace", a: "BOL", b: "PER", since: g.date });
  assert.deepEqual(receipt[0].fact, ["pact", "BOL", "PER"]);
  assert.equal(factWords(factsOf(receipt), G.name), "Bolivia and Peru signed a pact of non-aggression", "the chronicle keeps it");
  assert.equal(relOf(g, "PER", "BOL"), 0, "a pact moves no relation, as the player's does not");
});

test("a pact meant for the player arrives as an offer card, and stands as offered when accepted (ruling 154)", () => {
  const g = game("pact-2"), G = geoOf(g);
  const r = applyMoves(g, [mv("BOL", "PACT", "PER"), mv("CHL", "PACT", "PER"), mv("BOL", "PACT", "PER")], G, [], 1);
  assert.deepEqual(r.map((x) => x.ok), [false, false, false], "nothing is signed for the player");
  assert.equal(r[0].text, "Bolivia: offers you a pact of non-aggression; accept it from your actions");
  assert.equal(r[1].text, "Chile: would offer you a pact of non-aggression, but does not (relations neutral 0: 0, needing 1)");
  assert.deepEqual(g.offers, [{ from: "BOL", kind: "pact", date: g.date }], "offered once, however often it is proposed");
  assert.deepEqual(g.pacts || [], []);
  // accepted from the actions, as a treaty offer is: the order is a PACT move, and it stands as offered whatever has changed since
  const act = "Accept Bolivia's offer of a pact of non-aggression.";
  g.orders = [{ text: act, verb: "PACT", target: "BOL", detail: "" }];
  const kept = keepMore(checkSave(JSON.parse(JSON.stringify(g)), isP, known), isP, known);
  assert.deepEqual([kept.orders, kept.offers], [g.orders, g.offers], "the offer and its acceptance are kept in the save");
  g.rel = { "BOL|PER": [-1, g.date] };
  assert.equal(pactAnswer(g, G, "PER", "BOL", "peace").ok, false, "asked afresh today, Bolivia would refuse");
  const t = closeTurn(g, reply(g, QUIET), G, [act]);
  assert.ok(t.receipt.some((x) => x.ok && x.text === "Peru: signs a pact of non-aggression with Bolivia, which agrees (as offered)"), texts(t.receipt).join(" / "));
  assert.ok(pactOf(g, "PER", "BOL"));
  assert.deepEqual(g.offers, []);
  // by rule too: Bolivia, which would agree, sooner or later offers; and does not offer again while its offer waits
  const p = game("pact-2b"), P2 = geoOf(p), asks = () => { let n = 0; for (let k = 1; k <= 80; k++) { p.turn = k; n += rivalMoves(p, P2).filter((m) => m.verb === "PACT" && m.target === "PER").length; } return n; };
  assert.ok(asks() > 0);
  p.offers = [{ from: "BOL", kind: "pact", date: p.date }];
  assert.equal(asks(), 0);
  // a citizen does not speak for the country: its government is bound like any other
  const c = game("pact-2", {}, "PER", "citizen"), rc = applyMoves(c, [mv("BOL", "PACT", "PER")], geoOf(c), [], 1);
  assert.match(rc[0].text, /^Bolivia: signs a pact of non-aggression with Peru, which agrees/);
});

test("tribute is demanded of the player by card, only when the sum says they would pay; the player answers (ruling 154)", () => {
  const open = (seed) => { const g = game(seed); gauges(g, "PER", 1); g.wars = [{ pair: "CHL|PER", since: g.date, by: "CHL" }]; return g; };
  // steady and at peace, Peru would refuse Brazil, so nothing is asked
  const calm = game("due-0"), r0 = applyMoves(calm, [mv("BRA", "TRIBUTE", "PER")], geoOf(calm), [], 1);
  assert.deepEqual([r0[0].ok, r0[0].text, calm.due], [false, "Brazil: would demand a yearly tribute of you, but does not: by the rules you would refuse (might 6 against 3 +3: 3, needing 4)", undefined]);
  // shaken and at war, it would pay: the demand waits as a card, and nothing is owed yet
  const g = open("due-1"), G = geoOf(g), r = applyMoves(g, [mv("BRA", "TRIBUTE", "PER"), mv("CHL", "TRIBUTE", "PER")], G, [], 1);
  assert.equal(r[0].text, "Brazil: demands a yearly tribute of you (might 6 against 3 +3, another war to fight +1, shaken at home +1: 5, needing 4); pay or refuse from your actions before the next turn ends");
  assert.equal(r[1].ok, false, "one demand at a time, and Chile is at war with you");
  assert.deepEqual(g.due, { from: "BRA", turn: 1, since: g.date });
  assert.deepEqual(g.pacts || [], []);
  assert.ok(moreFacts(g, G, ["CHL", "BOL", "BRA"]).some((l) => /^- A demand, kept by the rules: BRA demands a yearly tribute of the player's country\. The player answers it this turn\./.test(l)));
  assert.deepEqual(settlePacts(g, [], "2027-01-01", G), [], "not answered in the turn it was made");
  assert.deepEqual(keepMore(checkSave(JSON.parse(JSON.stringify(g)), isP, known), isP, known).due, g.due, "it waits in the save");
  // no answer given is a refusal: the asker holds a cause, relations cool a step, and it does not ask again for two years
  g.turn = 2;
  let lines = settlePacts(g, [], "2027-02-01", G);
  assert.deepEqual(texts(lines), ["Peru: refuses Brazil's demand for tribute (your own answer), and Brazil holds a cause"]);
  assert.deepEqual([g.due, g.cause["BRA>PER"], g.rel["BRA|PER"], g.dunned, tributeOf(g, "BRA", "PER")], [null, ["tribute refused in 2027", "2027-02-01"], [-1, "2027-02-01"], { BRA: "2027-02-01" }, undefined]);
  g.date = "2027-02-01";
  assert.equal(mayDun(g, "BRA"), false);
  assert.match(applyMoves(g, [mv("BRA", "TRIBUTE", "PER")], G, [], 1)[0].text, /a demand already waits or was refused in the last two years$/);
  g.date = "2029-02-01";
  assert.equal(mayDun(g, "BRA"), true);
  // paying binds the country as any tribute does, and it may stop later by card
  const h = open("due-2"), H = geoOf(h);
  applyMoves(h, [mv("BRA", "TRIBUTE", "PER")], H, [], 1);
  h.due.answer = "pay"; h.turn = 2;
  lines = settlePacts(h, [], "2027-02-01", H);
  assert.deepEqual(texts(lines), ["Peru: agrees to pay Brazil a yearly tribute (your own answer)"]);
  assert.deepEqual([lines[0].fact, lines[0].gauge], [["tribute", "PER", "BRA"], [["BRA", "m", 1, "tribute agreed"]]]);
  assert.deepEqual([tributeOf(h, "BRA", "PER"), sphereOf(h, H, "PER"), h.due], [{ kind: "tribute", a: "BRA", b: "PER", since: "2027-02-01" }, "BRA", null]);
  // overtaken: a demand whose asker is now at war with you is dropped
  const w = open("due-3"), W = geoOf(w);
  applyMoves(w, [mv("BRA", "TRIBUTE", "PER")], W, [], 1);
  w.wars.push({ pair: "BRA|PER", since: w.date, by: "BRA" }); w.turn = 2;
  assert.match(settlePacts(w, [], "2027-02-01", W)[0].text, /^Brazil: its demand for tribute is overtaken by events \(at war with Peru: make peace first\)$/);
  // by rule: asked of a player in trouble that would pay, never while a demand waits or after a refusal
  const d = game("due-4", {}, "BOL"), D = geoOf(d), asks = () => { let n = 0; for (let k = 1; k <= 60; k++) { d.turn = k; n += rivalMoves(d, D).filter((m) => m.verb === "TRIBUTE" && m.target === "BOL").length; } return n; };
  assert.equal(asks(), 0, "a steady player is asked nothing");
  gauges(d, "BOL", 0);
  assert.ok(asks() > 0);
  d.dunned = { CHL: d.date, BRA: d.date };
  assert.equal(asks(), 0);
  d.dunned = {}; d.due = { from: "CHL", turn: 1, since: d.date };
  assert.equal(asks(), 0);
  // junk in a save is dropped
  const junk = keepMore(checkSave({ ...JSON.parse(JSON.stringify(g)), due: { from: "ZZZ", turn: 1, since: "2027-01-01" }, dunned: { ZZZ: "2027-01-01", BRA: "soon", CHL: "2027-01-01" } }, isP, known), isP, known);
  assert.deepEqual([junk.due, junk.dunned], [null, { CHL: "2027-01-01" }]);
});

test("the player's own PACT or TRIBUTE move, read from an action, is the same order as the card: it is asked once", () => {
  const g = game("pact-3"), G = geoOf(g), act = "Offer Bolivia a pact of non-aggression.";
  plan(g, { kind: "pact", sub: "peace", target: "BOL", text: act });
  assert.deepEqual(reviewMoves(g, [mv("PER", "PACT", "BOL", "", 1)], [act], G).map((x) => x.text), [`Offer a pact of non-aggression to Bolivia, from action 1: "${act}"`]);
  const t = closeTurn(g, reply(g, [mv("PER", "PACT", "BOL", "", 1), ...QUIET]), G, [act]);
  assert.equal(t.receipt.filter((x) => /pact of non-aggression/.test(x.text)).length, 1, texts(t.receipt).join(" / "));
  assert.ok(pactOf(g, "PER", "BOL"));
  // tribute by move: the payer speaks in the receipt, and the asker's mandate moves, as by card
  const h = game("pact-4"), H = geoOf(h);
  gauges(h, "BOL", 0); h.wars = [{ pair: "BOL|BRA", since: h.date, by: "BRA" }];
  const u = closeTurn(h, reply(h, [mv("PER", "TRIBUTE", "BOL", "", 1), ...QUIET]), H, ["Demand tribute of Bolivia."]);
  assert.ok(u.receipt.some((x) => x.country === "BOL" && /^Bolivia: agrees to pay Peru a yearly tribute rather than refuse it \(might 3 against 2 \+1, another war to fight \+1, in revolt at home \+2: 4, needing 4\)$/.test(x.text)), texts(u.receipt).join(" / "));
  assert.equal(gaugeOf(h, "PER", "m"), 3);
  assert.equal(factWords(factsOf(u.receipt), H.name), "Bolivia agreed to pay Peru tribute");
});

test("tribute between two other countries: the payer answers by its sum, pays one country at a time, and stands in its sphere", () => {
  const g = game("trib-3"), G = geoOf(g);
  gauges(g, "BOL", 0);
  let r = applyMoves(g, [mv("CHL", "TRIBUTE", "BOL"), mv("BRA", "TRIBUTE", "BOL"), mv("BRA", "TRIBUTE", "CHL")], G, [], 1);
  assert.deepEqual(texts(r), [
    "Bolivia: agrees to pay Chile a yearly tribute rather than refuse it (might 4 against 2 +2, in revolt at home +2: 4, needing 4)",
    "Brazil: a yearly tribute with Bolivia is refused: Bolivia already pays tribute to Chile",
    "Brazil: a yearly tribute with Chile is refused: Chile is not beside you by land or narrow sea",
  ]);
  assert.deepEqual([r[0].country, r[0].verb, r[0].fact, r[0].gauge], ["BOL", "TRIBUTE", ["tribute", "BOL", "CHL"], [["CHL", "m", 1, "tribute agreed"]]]);
  assert.deepEqual(tributeOf(g, "CHL", "BOL"), { kind: "tribute", a: "CHL", b: "BOL", since: g.date });
  assert.equal(sphereOf(g, G, "BOL"), "CHL");
  assert.equal(relOf(g, "CHL", "BOL"), -1, "signing it leaves the pair cool");
  settleState(g, r, "2027-01-01", G);
  assert.equal(gaugeOf(g, "CHL", "m"), 3, "a demand met lifts the asker's mandate, whoever asked");
  // a refusal costs the asker a step of mandate and of relations, whoever asked
  const h = game("trib-4"), H = geoOf(h);
  r = applyMoves(h, [mv("BRA", "TRIBUTE", "BOL")], H, [], 1);
  assert.equal(r[0].text, "Bolivia: refuses Brazil's demand for tribute (might 6 against 2 +3: 3, needing 4)");
  assert.deepEqual(r[0].gauge, [["BRA", "m", -1, "a demand for tribute refused"]]);
  assert.equal(relOf(h, "BRA", "BOL"), -1);
  assert.deepEqual(h.pacts, []);
});

test("by rule: other countries bind each other, and the same game draws the same moves", () => {
  // Brazil is the player; Peru and Bolivia, in its shadow, have a reason to bind each other
  const g = game("rule-1", {}, "BRA"), G = geoOf(g), seen = [];
  for (let t = 1; t <= 80; t++) { g.turn = t; for (const m of rivalMoves(g, G)) if (m.verb === "PACT" || m.verb === "TRIBUTE") seen.push([t, m.country, m.verb, m.target]); }
  assert.ok(seen.length >= 2 && seen.length <= 24, `a few in seven years, not every month: ${seen.length}`);
  assert.ok(seen.every(([, c, v, t]) => v === "PACT" && [c, t].sort().join() === "BOL,PER"), "the only pair with a reason; Brazil, which nobody would agree with, is not asked");
  const again = game("rule-1", {}, "BRA"), twice = [];
  for (let t = 1; t <= 80; t++) { again.turn = t; for (const m of rivalMoves(again, geoOf(again))) if (m.verb === "PACT") twice.push([t, m.country, m.verb, m.target]); }
  assert.deepEqual(twice, seen);
  // played out: the pact is signed, written in the receipt, and stands five years
  const p = game("rule-1", {}, "BRA");
  const [, from, , to] = seen[0], signed = closeTurn(p, reply(p, [mv(from, "PACT", to)]), geoOf(p), []).receipt.filter((x) => x.ok && /signs a pact of non-aggression/.test(x.text)).length;
  assert.equal(signed, 1);
  assert.ok(pactOf(p, "PER", "BOL"));
  for (let t = 0; t < 61; t++) closeTurn(p, reply(p, QUIET), geoOf(p), []);
  assert.equal(pactOf(p, "PER", "BOL"), undefined, "it runs out after five years");
  // a pact keeps the peace by rule: a country bitter with a partner declares no war on it while the pact stands
  const w = game("rule-2", { rel: { "BOL|CHL": [-3, "2026-12-01"] } }, "BRA"), W = geoOf(w);
  const wars = () => { let n = 0; for (let t = 1; t <= 40; t++) { w.turn = t; n += rivalMoves(w, W).filter((m) => m.verb === "WAR").length; } return n; };
  assert.ok(wars() > 0, "Chile, bitter and stronger, goes to war by rule");
  w.pacts = [{ kind: "peace", a: "BOL", b: "CHL", since: "2026-12-01" }];
  assert.equal(wars(), 0);
  // tribute by rule: a steady country asks a weaker neighbour in trouble that would pay
  const d = game("rule-3", {}, "BRA"), D = geoOf(d), asked = new Set();
  gauges(d, "BOL", 0);
  for (let t = 1; t <= 60; t++) { d.turn = t; for (const m of rivalMoves(d, D)) if (m.verb === "TRIBUTE") asked.add(`${m.country}>${m.target}`); }
  assert.deepEqual([...asked], ["CHL>BOL"], "Chile would be paid (4); Peru would be refused (3), so it does not ask");
  gauges(d, "CHL", 1);
  for (let t = 1; t <= 60; t++) { d.turn = t; assert.ok(!rivalMoves(d, D).some((m) => m.verb === "TRIBUTE"), "a country shaken at home asks nobody"); }
});

test("how restless the world is: three settings that change how often the rules move countries, never an answer", () => {
  const g = game("pace");
  assert.equal(paceOf(g), "lively");
  assert.deepEqual([PACE.lively.war, PACE.lively.grudge, PACE.lively.edge], [RIVALS.war, RIVALS.grudge, RIVALS.edge], "lively is the world as it was");
  assert.deepEqual([crisisChance(g), PACE.calm.crisis, PACE.stormy.crisis], [50, 25, 75]);
  assert.equal(setPace(g, "stormy"), "The world is now stormy: old grudges come to war sooner, and crises come often.");
  assert.deepEqual([g.pace, paceOf(g), crisisChance(g)], ["stormy", "stormy", 75]);
  assert.equal(setPace(g, "wild"), "");
  assert.deepEqual(keepPace({ pace: "stormy" }), { pace: "stormy" });
  assert.deepEqual([keepPace({ pace: "wild" }).pace, keepPace({ pace: "lively" }).pace, keepPace({}).pace], [undefined, undefined, undefined]);
  setPace(g, "lively");
  assert.equal(g.pace, undefined);
  // stormy: a pair that is only cool, and a smaller edge, may come to war by rule
  const w = game("pace-2", { rel: { "BOL|PER": [-1, "2026-12-01"] } }, "BRA"), W = geoOf(w);
  const wars = () => { let n = 0; for (let t = 1; t <= 60; t++) { w.turn = t; n += rivalMoves(w, W).filter((m) => m.verb === "WAR").length; } return n; };
  assert.equal(wars(), 0);
  w.pace = "stormy";
  assert.ok(wars() > 0);
});

test("other countries answer their own unrest by rule: terms from a full treasury, otherwise a move against it", () => {
  const g = game("answer-1"), G = geoOf(g);
  gauges(g, "BOL", 1, 3); gauges(g, "CHL", 1, 2); gauges(g, "PER", 1, 4);
  settleHome(g, "2027-01-01", G);
  assert.deepEqual(Object.keys(g.unrest).sort(), ["BOL", "CHL", "PER"]);
  assert.deepEqual(settleUnrest(g, "2027-06-30", G), [], "not before six months");
  const lines = settleUnrest(g, "2027-07-01", G);
  assert.equal(lines.length, 2, "the player's own unrest waits for the player");
  assert.equal(lines[0].text, `Bolivia: meets the terms of ${g.unrest.BOL.who}, and the treasury pays`);
  assert.deepEqual(lines[0].gauge, [["BOL", "t", -1, "terms paid to end unrest"], ["BOL", "s", 1, "the unrest's terms met"]]);
  assert.match(lines[1].text, new RegExp(`^Chile: moves against ${g.unrest.CHL.who} and (fails|scatters them(, at a price in blood)?) \\(skill 3 against 3: chance 50; drew \\d+; (clean|costly|failed)\\)$`));
  assert.equal(lines[1].roll, undefined, "another country's roll is not one the player can take back to draw again");
  assert.deepEqual(settleUnrest(g, "2027-08-01", G), [], "then once a year while it stands");
  assert.equal(settleUnrest(g, "2028-07-01", G).length, 2);
  // a citizen's government answers like any other
  const c = game("answer-1", {}, "PER", "citizen"), C = geoOf(c);
  gauges(c, "PER", 1, 4); settleHome(c, "2027-01-01", C);
  assert.match(settleUnrest(c, "2027-07-01", C)[0].text, /^Peru: meets the terms of/);
});

test("a rising that holds a year founds a country: a code, a name, a colour, land, and a place among countries", () => {
  const g = game("found-1", {}, "CHL"), G = geoOf(g);
  gauges(g, "BRA", 0, 0);
  settleHome(g, "2027-01-01", G);
  const u = { ...g.unrest.BRA }, land = rebelLand(G, "BRA", u.id);
  assert.ok(u.rising && u.id !== "BRA-2", "never in the heartland");
  assert.ok(land.length >= 1 && land.length <= 2 && land[0] === u.id && !land.includes("BRA-2"), "where it gathered and what touches it, never the heartland, never more than half");
  // Brazil's one answer by rule comes at six months; here it has failed, and the year is up
  g.unrest.BRA.ans = "2027-12-31";
  assert.deepEqual(settleUnrest(g, "2027-12-31", G), []);
  const lines = settleUnrest(g, "2028-01-01", G), code = Object.keys(g.lands)[0], born = g.lands[code], place = P[u.id].name;
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, `Brazil: the rising of ${u.who} holds ${place} a year unanswered and founds ${born.name} (${code}), with ${land.length} province${land.length > 1 ? "s" : ""}; a truce of two years follows`);
  assert.deepEqual(lines[0].fact, ["formed", code, "BRA", land.length]);
  assert.deepEqual(lines[0].gauge, [["BRA", "s", 1, "the rising has left, and its land with it"], ["BRA", "m", -1, "land lost to a rising"]]);
  assert.match(code, /^[A-Z]{3}$/);
  // ruling 154: on the real map the name and the code come from the rebel's title, never from the place
  const title = u.who.match(/^the (\w+) of /)[1];
  assert.ok(NEUTRAL.map((f) => `The ${title}'s ${f}`).includes(born.name) && COLOURS.includes(born.colour), born.name);
  assert.ok(!born.name.includes(place) && !NAMES[code] && code[0] === title[0].toUpperCase(), "a name and a code of its own, with nothing of the province in them");
  assert.deepEqual([born.from, born.since, born.seat], ["BRA", "2028-01-01", u.id]);
  for (const id of land) assert.equal(G.owner(id), code);
  assert.deepEqual([G.holds(code), G.holds("BRA"), G.known(code), G.name(code), G.home(code)], [land.length, 5 - land.length, true, born.name, u.id]);
  assert.equal(g.might[code], 4, "two below its parent's, held between 2 and 4");
  assert.equal(g.unrest.BRA, undefined);
  // what follows by rule: bitter, a truce, a cause, and no demand for the land back for two years
  g.date = "2028-01-01";
  assert.equal(relOf(g, "BRA", code), -2);
  assert.equal(truceUntil(g, "BRA", code), "2030-01");
  assert.match(causeOf(g, G, "BRA", code), new RegExp(`^(the secession of 2028|${place} was its own)$`));
  assert.ok(demandAnswer(g, G, "BRA", code, u.id).no || demandAnswer(g, G, "BRA", code, u.id).why.includes("a demand made before -2"));
  g.gauge.BRA.s[0] = 2; g.gauge.BRA.t[0] = 2;
  assert.match(applyMoves(g, [mv("BRA", "WAR", code)], G, [], 1)[0].text, /war on .* refused: a truce holds between them until 2030-01/);
  assert.equal(factWords(factsOf(lines), G.name), `${born.name} broke from Brazil with ${land.length} province${land.length > 1 ? "s" : ""}`);
  // the same game founds the same country
  const h = game("found-1", {}, "CHL"), H = geoOf(h);
  gauges(h, "BRA", 0, 0); settleHome(h, "2027-01-01", H); h.unrest.BRA.ans = "2027-12-31"; settleUnrest(h, "2028-01-01", H);
  assert.deepEqual([h.lands, h.owners, h.might, h.rel, h.truce], [g.lands, g.owners, g.might, g.rel, g.truce]);
  // the AI is told of it in one line, and may write it by code or by name
  assert.deepEqual(polityLines(g, G), [`- Countries founded in this story by a rising, real in it, by code: ${code} ${born.name} (broke from BRA in 2028)`]);
  assert.ok(moreFacts(g, G, ["PER", "BOL"]).includes(polityLines(g, G)[0]));
  const read = readWorldReply(`TURN: ${turnCode(g)}\nMOVE: m1 | 0 | ${code} | TREATY | PER | trade\nEVENT: 2028-01-10 | ${code} | The new government of the rebel provinces meets for the first time and sends envoys abroad.\nEND`, g, G.known, "2028-02-01");
  assert.deepEqual([read.moves[0].country, read.events[0].at], [code, code]);
  // and it is a country like any other: it signs, it can be bound, it can be attacked once the truce is over
  const r = applyMoves(g, [mv(code, "TREATY", "PER", "trade")], G, [], 1);
  assert.match(r[0].text, new RegExp(`^${born.name}: signs a trade treaty with Peru, which agrees`));
});

test("a rising: answered in time it founds nothing; taken land still goes back; a last province or a full world costs mandate", () => {
  // the player answers in the turn the year is up: the rising has not held
  const g = game("found-2"), G = geoOf(g);
  gauges(g, "PER", 0, 3); settleHome(g, "2027-01-01", G);
  plan(g, { kind: "terms", text: "Meet their terms." });
  let lines = settleUnrest(g, "2028-01-01", G, g.plans);
  assert.deepEqual(texts(lines), [`Peru: meets the terms of ${g.unrest.PER.who}, and the treasury pays`]);
  assert.equal(g.lands, undefined);
  // unanswered, Tacna leaves and Peru keeps Lima
  lines = settleUnrest(g, "2028-02-01", G, []);
  assert.match(lines[0].text, /^Peru: the rising of the \w+ of Tacna holds Tacna a year unanswered and founds The \w+'s [\w ]+ \([A-Z]{3}\), with 1 province; a truce of two years follows$/);
  const tac = Object.keys(g.lands)[0];
  assert.deepEqual([G.owner("PER-1"), G.owner("PER-2"), G.holds("PER")], [tac, "PER", 1]);
  settleState(g, lines, "2028-02-01", G);
  assert.deepEqual([gaugeOf(g, "PER", "s"), gaugeOf(g, "PER", "m")], [1, 1], "the country it left is shaken, not in revolt, and doubted");
  // land taken from a country that still stands goes back to it, as before
  const b = game("found-3", { owners: { "CHL-1": "PER" } }), B = geoOf(b);
  gauges(b, "PER", 0); settleHome(b, "2027-01-01", B);
  assert.match(settleUnrest(b, "2028-01-01", B)[0].text, /hands Arica back to Chile, a year unanswered$/);
  assert.equal(b.lands, undefined);
  // no code is ever one the map, the game or an alternate world uses
  assert.equal(codeFor(g, G, "Peru"), "PEU", "PER is Peru's own, so the next letters are tried");
  assert.equal(codeFor(g, G, "Tacna"), "TAC");
  assert.equal(codeFor({ ...g, lands: { TAC: { name: "x" } } }, G, "Tacna"), "TAN", "TAC is taken in that game");
  assert.equal(codeFor({ ...g, lands: { TAC: { name: "x" } }, alt: { lands: { TAN: { name: "Tannu" } } } }, G, "Tacna"), "TAA");
  // names: the rebel's title on the real map and on an alternate history laid over it, the province only on an invented world; never one twice
  const who = { id: "PER-1", who: "the Mayor of Tacna" }, first = nameFor(g, who, "Tacna", "2030-01-01");
  assert.match(first, /^The Mayor's (Republic|Free State|Commonwealth|League|Confederation|Union)$/);
  assert.match(nameFor({ ...g, alt: { lands: {} } }, who, "Tacna", "2030-01-01"), /^The Mayor's /);
  assert.ok(FORMS.map((x) => x.replace("%", "Tacna")).includes(nameFor({ ...g, world: { setting: {} } }, who, "Tacna", "2030-01-01")));
  const second = nameFor({ ...g, lands: { QQA: { name: first } } }, who, "Tacna", "2030-01-01");
  assert.ok(second !== first && /^The Mayor's /.test(second));
  assert.equal(nameFor(g, { id: "PER-1", who: "someone a save made up" }, "Tacna", "2030-01-01").slice(0, 12), "The Rebel's ");
  assert.equal(codeFor(g, G, "Ñu"), "NUX");
  assert.equal(codeFor(g, G, "U.S.A."), "USB", "never a code the might table knows");
  // a game holds forty at most; past that a rising costs mandate, as it did
  const full = game("found-4"), F = geoOf(full);
  full.lands = Object.fromEntries(Array.from({ length: POLITY.lands }, (_, i) => [`Q${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`, { name: `Land ${i}`, colour: COLOURS[0], from: "BRA", since: "2027-01-01" }]));
  assert.equal(found(full, F, "PER", { id: "PER-1", who: "the Mayor of Tacna" }, "2028-01-01"), null);
  assert.equal(found(game("found-5"), geoOf(game("found-5")), "PER", { id: "PER-2", who: "x" }, "2028-01-01"), null, "never the heartland");
});

test("a founded country has a place in the save: it reads back whole, junk is dropped, a take-back unfounds it", () => {
  const g = game("save-1"), G = geoOf(g);
  // a rising and the stability that began it are dated the same day, so its year is up before a quiet year can end it
  gauges(g, "PER", 0, 2, 2, "2027-01-01"); gauges(g, "BRA", 0, 0, 2, "2027-01-01");
  for (let i = 0; i < 2; i++) closeTurn(g, reply(g, QUIET), G, []);
  const before = snapGame(g, "before the year is up");
  let founded = [];
  for (let i = 0; i < 14 && !founded.length; i++) founded = closeTurn(g, reply(g, QUIET), G, []).receipt.filter((x) => x.fact?.[0] === "formed");
  assert.ok(founded.length >= 1, "left unanswered, the player's own rising founds a country");
  const codes = Object.keys(g.lands);
  assert.equal(g.owners["PER-1"], codes.find((c) => g.lands[c].from === "PER"));
  assert.match(g.chron.turns[g.chron.turns.length - 1].f.map((f) => f[0]).join(), /formed/);
  // the save: nothing of it is lost, and the new code counts as a country wherever one is checked
  const kept = keepMore(checkSave(JSON.parse(JSON.stringify(g)), isP, known), isP, known);
  for (const k of ["lands", "owners", "rel", "truce", "might", "cause", "asked", "gauge", "unrest", "pacts"]) assert.deepEqual(kept[k] ?? {}, g[k] ?? {}, k);
  assert.equal(kept.rules, RULES);
  // junk: a code that is no code, a name that is no name, a seat off the map
  const junk = checkSave({ ...JSON.parse(JSON.stringify(g)), lands: { ...g.lands, toolong: { name: "x" }, ABC: { name: "" }, XYZ: { name: "Zed", colour: "red", from: 5, since: "soon", seat: "NOPE-1" } } }, isP, known);
  assert.deepEqual(Object.keys(junk.lands).sort(), [...codes, "XYZ"].sort());
  assert.deepEqual(junk.lands.XYZ, { name: "Zed", colour: COLOURS[0], from: "", since: "" });
  assert.deepEqual(keepLands({ lands: "no" }), {});
  // without the founded countries the same save would lose their land: that is why they are kept with it
  assert.equal(checkSave({ ...JSON.parse(JSON.stringify(g)), lands: undefined }, isP, known).owners["PER-1"], undefined);
  // a take-back: the country is unfounded with the turn
  const back = takeBack(g, before);
  assert.deepEqual([back.lands, back.owners["PER-1"]], [undefined, undefined]);
  // replays: the same seed and the same moves found the same countries on the same days
  const h = game("save-1"), H = geoOf(h);
  gauges(h, "PER", 0, 2, 2, "2027-01-01"); gauges(h, "BRA", 0, 0, 2, "2027-01-01");
  while (h.turn < g.turn) closeTurn(h, reply(h, QUIET), H, []);
  assert.equal(JSON.stringify(h), JSON.stringify(g));
});

test("a founded country travels in a scenario saved from the game, and a new game begins with it", () => {
  const g = game("scen-1"), G = geoOf(g);
  gauges(g, "PER", 0); settleHome(g, "2027-01-01", G); settleUnrest(g, "2028-01-01", G);
  const s = scenarioFrom(g, { title: "After Tacna", blurb: "", opening: "Tacna has gone its own way." }), r = checkScenario(JSON.parse(JSON.stringify(s)), known, isP);
  assert.equal(r.ok, true);
  assert.deepEqual(r.scenario.lands, g.lands);
  const tac = Object.keys(g.lands)[0];
  assert.equal(r.scenario.owners["PER-1"], tac);
  assert.ok(scenarioText(r.scenario).includes(g.lands[tac].name), "its name passes the hard-line check like any other text");
  // a code the map already uses is never taken from a file
  assert.equal(checkScenario({ ...s, lands: { CHL: { name: "Not Chile" } } }, known, isP).scenario.lands, undefined);
  const n = newWorldGame("CHL", "nation", "scen-2", { scenario: r.scenario }), N = geoOf(n);
  assert.deepEqual([n.lands, N.owner("PER-1"), N.name(tac), N.holds(tac)], [g.lands, tac, g.lands[tac].name, 1]);
});

test("founding works on an invented world: its own codes, its own province names, the same game twice", () => {
  const sc = settingScenario(SETTINGS[0], "first"), made = madeWorld(sc.world), d = made.data;
  const nb = new Map(d.provinces.map((p) => [p.id, []])), by = new Map(d.provinces.map((p) => [p.id, p]));
  for (const [a, b] of d.neighbours) { nb.get(a).push(b); nb.get(b).push(a); }
  const geo = (g) => { const owner = (id) => g.owners[id] || by.get(id).country, holds = (c) => d.provinces.filter((p) => owner(p.id) === c).length;
    return { name: (c) => g.lands?.[c]?.name || d.countries[c] || c, all: [...by.keys()], place: (id) => by.get(id), find: (s) => (by.has(s) ? s : null), owner, neighbours: (id) => nb.get(id), across: () => [], coastal: () => false, hasCoast: () => false,
      holds, known: (c) => !!d.countries[c] || !!g.lands?.[c], might: (c) => g.might?.[c], home: (c) => d.provinces.find((p) => p.country === c)?.id || g.lands?.[c]?.seat, claimed: () => [] }; };
  const big = Object.keys(d.countries).find((c) => d.provinces.filter((p) => p.country === c).length >= 6), other = Object.keys(d.countries).find((c) => c !== big);
  const run = () => { const g = newWorldGame(other, "nation", "made-1", { scenario: sc }), G = geo(g); gauges(g, big, 0, 0); settleHome(g, "0913-01-01", G); g.unrest[big].ans = "0913-06-01"; const lines = settleUnrest(g, "0914-01-01", G); return { g, G, lines }; };
  const { g, G, lines } = run(), code = Object.keys(g.lands)[0];
  assert.match(lines[0].text, /holds .* a year unanswered and founds .* \([A-Z]{3}\), with \d provinces?; a truce of two years follows$/);
  assert.ok(!d.countries[code] && G.holds(code) >= 1 && G.holds(code) <= POLITY.most);
  assert.ok(g.lands[code].name.includes(by.get(g.lands[code].seat).name));
  assert.equal(JSON.stringify(run().g), JSON.stringify(g));
  const isProvince = (id) => by.has(id), isCountry = (c) => !!d.countries[c];
  const kept = keepMore(checkSave(JSON.parse(JSON.stringify(g)), isProvince, isCountry), isProvince, isCountry);
  assert.deepEqual([kept.lands, kept.owners], [g.lands, g.owners]);
});

test("the map views and a country's card read the clauses of every country", () => {
  const g = game("view-1", { pacts: [{ kind: "peace", a: "BOL", b: "PER", since: "2026-12-01" }, { kind: "peace", a: "BOL", b: "CHL", since: "2027-03-01" }, { kind: "tribute", a: "BRA", b: "CHL", since: "2027-01-01" }] });
  assert.deepEqual([...pactView(g)].sort(), [["BOL", "yours"], ["CHL", "tribute"]]);
  g.pacts.push({ kind: "tribute", a: "PER", b: "CHL", since: "2027-01-01" }, { kind: "tribute", a: "BRA", b: "PER", since: "2027-01-01" });
  assert.deepEqual([...pactView(g)].sort(), [["BOL", "yours"], ["BRA", "paid"], ["CHL", "pays"]]);
  assert.equal(clauseWords(g, "BOL", (c) => NAMES[c], PACT.years), "Bound by a pact of non-aggression with Peru (until 2031), Chile (until 2032).");
  assert.equal(clauseWords(g, "BRA", (c) => NAMES[c]), "Paid tribute by Chile, Peru.");
  assert.equal(clauseWords(game("view-2"), "BOL", (c) => NAMES[c]), "");
  assert.equal(askClause(g, geoOf(g), "PER", "PER", "peace", g.date).no, "that is not a country with land");
});

test("forty turns by the rules alone on a small map replay exactly, with unrest answered by rule on the way", () => {
  const play = () => {
    const g = game("forty", {}, "CHL"); gauges(g, "BRA", 0, 0); gauges(g, "BOL", 1, 1);
    const seen = { pact: 0, formed: 0, answered: 0 };
    for (let t = 0; t < 40; t++) for (const x of closeTurn(g, reply(g), geoOf(g), []).receipt) { if (x.fact?.[0] === "pact") seen.pact++; if (x.fact?.[0] === "formed") seen.formed++; if (/meets the terms of|moves against/.test(x.text)) seen.answered++; }
    return { g, seen };
  };
  const a = play(), b = play();
  assert.equal(JSON.stringify(a.g), JSON.stringify(b.g));
  assert.ok(a.seen.answered >= 1, JSON.stringify(a.seen));
  const kept = keepMore(checkSave(JSON.parse(JSON.stringify(a.g)), isP, known), isP, known);
  assert.equal(JSON.stringify(closeTurn(kept, reply(kept), geoOf(kept), []).receipt), JSON.stringify(closeTurn(a.g, reply(a.g), geoOf(a.g), []).receipt), "a game read back from its save plays on the same");
});
