// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo with no AI as a game on its own terms (cold review 3, fixes 6 to 8): the gazette, pressure on the player by
// rule, a pledge's price, war orders by card, and the endings. Rules version 6.
import { test } from "node:test";
import assert from "node:assert/strict";
import { closeTurn, newWorldGame, worldPrompt } from "../src/story/turn.js";
import { gazette, spanWord, wordDate } from "../src/story/gazette.js";
import { PRESS, beside, keepPressure, protestAnswer, settlePressure, standBy } from "../src/story/pressure.js";
import { pledges, relOf, treatyAnswer } from "../src/story/relations.js";
import { applyMoves, ownMoves } from "../src/story/worldrules.js";
import { chooseAmbition, keepAmbition, settleAmbition } from "../src/story/ambitions.js";
import { keepMore } from "../src/story/more.js";
import { checkSave } from "../src/story/saves.js";
import { suggest } from "../src/story/suggest.js";
import { gaugeOf } from "../src/story/state.js";
import { RULES } from "../src/story/check.js";

// a small world: Peru (might 3) beside Chile (4), Bolivia (2) and Brazil (6); Peru holds two provinces
const P = { "PER-1": { name: "Tacna", country: "PER" }, "PER-2": { name: "Lima", country: "PER" }, "CHL-1": { name: "Arica", country: "CHL" }, "CHL-2": { name: "Iquique", country: "CHL" }, "BOL-1": { name: "La Paz", country: "BOL" }, "BOL-2": { name: "Oruro", country: "BOL" }, "BRA-1": { name: "Acre", country: "BRA" }, "BRA-2": { name: "Manaus", country: "BRA" } };
const NB = { "PER-1": ["PER-2", "CHL-1", "BOL-1", "BRA-1"], "PER-2": ["PER-1"], "CHL-1": ["PER-1", "CHL-2", "BOL-1"], "CHL-2": ["CHL-1"], "BOL-1": ["PER-1", "CHL-1", "BRA-1", "BOL-2"], "BOL-2": ["BOL-1"], "BRA-1": ["PER-1", "BOL-1", "BRA-2"], "BRA-2": ["BRA-1"] };
const NAMES = { PER: "Peru", CHL: "Chile", BOL: "Bolivia", BRA: "Brazil" }, MIGHT = { PER: 3, CHL: 4, BOL: 2, BRA: 6 };
const geoOf = (g, might = MIGHT) => {
  const owner = (id) => g.owners[id] || P[id].country;
  return { name: (c) => NAMES[c] || c, place: (id) => P[id], find: (s) => (P[s] ? s : null), owner, neighbours: (id) => NB[id], across: () => [], coastal: () => false, all: Object.keys(P), home: (c) => `${c}-2`,
    holds: (c) => Object.keys(P).filter((id) => owner(id) === c).length, known: (c) => !!NAMES[c], hasCoast: () => false, might: (c) => might[c] };
};
const game = (seed, extra = {}, who = "PER") => ({ ...newWorldGame(who, "nation", seed), ...extra });
const rules = (g, months = 1) => { const d = new Date(`${g.date}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + months); return { rules: true, moves: [], events: [], news: [], summary: "", dropped: [], stop: d.toISOString().slice(0, 10) }; };
const play = (g, n, months = 1) => { const G = geoOf(g), out = []; for (let i = 0; i < n; i++) out.push(closeTurn(g, rules(g, months), G, [])); return out; };

test("the rules version is 6", () => { assert.equal(RULES, 6); });

// ---- the gazette ----
test("dates and spans in words, the same everywhere", () => {
  assert.equal(wordDate("2027-10-01"), "1 October 2027");
  assert.equal(wordDate("2028-02"), "February 2028");
  assert.equal(wordDate("0912-06-01"), "1 June 912");
  assert.deepEqual([["2027-01-01", "2027-01-08"], ["2027-01-01", "2027-02-01"], ["2027-01-01", "2027-04-01"], ["2027-01-01", "2028-01-01"]].map(([a, b]) => spanWord(a, b)), ["week", "month", "season", "year"]);
});

test("a turn by the rules is told as prose: names, no codes, no sums, the same every time, and a summary of its own", () => {
  const g = game("gaz-1", { wars: [{ pair: "BOL|BRA", since: "2026-12-01", by: "BRA" }] }), G = geoOf(g);
  g.orders = [{ text: "Propose a trade treaty to Chile (CHL).", verb: "TREATY", target: "CHL", detail: "trade" }];
  const e = closeTurn(g, rules(g), G, ["Propose a trade treaty to Chile (CHL)."]);
  assert.equal(e.rules, 1);
  assert.ok(!e.receipt.some((x) => /no AI proposed/.test(x.text)), "the rules do not apologise for having no AI");
  const z = gazette(g, e, G), all = [...z.home, ...z.abroad].join(" ");
  assert.deepEqual(gazette(g, e, G), z, "the same turn reads the same");
  assert.equal(e.summary, z.lead);
  assert.ok(e.summary.length > 10 && !/no story was told/.test(e.summary));
  assert.match(z.home.join(" "), /Peru and Chile|binds Peru and Chile/, "the player's country is named first in its own treaty");
  assert.match(z.home.join(" "), /Trade lets the treasury fill further\./);
  assert.doesNotMatch(all, /\b(PER|CHL|BOL|BRA)\b|needing|chance \d|drew \d|\(|\d{4}-\d{2}/, "no codes, no sums, no dates as numbers");
  assert.doesNotMatch(all, /—/);
  for (const s of [...z.home, ...z.abroad]) assert.match(s, /^[A-Z].*[.!]$/, s);
  // every sentence is drawn from a set by the seed: another seed may word it another way, and a quiet turn says so
  const q = game("gaz-quiet", {}), QG = { ...geoOf(q), all: [] }, qe = closeTurn(q, rules(q), QG, []), qz = gazette(q, qe, QG);
  assert.equal(qz.abroad.length, 0);
  assert.match(qz.home[0], /quiet month|month passes|this month/);
});

test("the gazette tells a war with those who join it as one sentence, a battle by its result, and a demand with its date in words", () => {
  const g = game("gaz-2"), G = geoOf(g), name = G.name, check = (band) => ({ band, key: "1:attack:CHL-1:BRA:battle:-", chance: 50, roll: 1 });
  const e = { turn: 3, from: "2027-01-01", to: "2027-02-01", receipt: [
    { ok: true, verb: "WAR", country: "BRA", text: "Brazil: declares war on Chile", fact: ["war", "BRA", "CHL"] },
    { ok: true, text: "Peru: joins the war against Brazil, as its defence treaty with Chile requires", fact: ["war", "PER", "BRA"] },
    { ok: true, text: "Bolivia: joins the war against Brazil, as its alliance treaty with Chile requires", fact: ["war", "BOL", "BRA"] },
    { ok: true, verb: "ATTACK", country: "BRA", at: "CHL-1", check: check("costly"), text: "Brazil: attacks Arica and takes it from Chile, but its army is spent for the turn (might 6 against 4: chance 70; drew 83; costly)", fact: ["took", "BRA", "CHL", 1] },
    { ok: true, verb: "ATTACK", country: "CHL", at: "BRA-1", check: check("failed"), text: "Chile: attacks Acre and is thrown back (might 4 against 6: chance 30; drew 90; failed)" },
    { ok: true, country: "CHL", text: "Chile: demands La Paz from Bolivia, to be answered by 2027-05-01", asks: ["CHL", "BOL", "BOL-1", "2027-05-01"] },
    { ok: false, verb: "TREATY", country: "CHL", text: "Chile: offers you a trade treaty; accept it from your actions", offer: "trade" },
    { ok: true, country: "PER", text: "Peru: its treasury rises to full (a year of trade)" },
    { ok: false, verb: "WAR", country: "BOL", text: "Bolivia: war refused: its treasury is empty" },
  ] };
  const z = gazette(g, e, G), home = z.home.join(" "), abroad = z.abroad.join(" ");
  assert.match(home, /Brazil.*Chile.*Peru and Bolivia (take Chile's side, as their treaties require|join the war against Brazil)\./);
  assert.match(home, /Chile.*(offers Peru a trade treaty|offer of a trade treaty)/);
  assert.match(home, /Peru's treasury rises to full: a year of trade\./);
  assert.match(abroad, /price|hard fighting/);
  assert.match(abroad, /thrown back|holds against Chile|breaks on the defenders/);
  assert.match(abroad, /1 May 2027/);
  assert.doesNotMatch(`${home} ${abroad}`, /war refused|chance|drew/, "what another country was refused is not news");
  assert.equal(name("PER"), "Peru");
});

// ---- pressure ----
test("something is done to the player within the first five turns, on every seed, and the turns replay", () => {
  const pressed = (r) => r.press || r.asks?.[1] === "PER" || r.offer === "due" || (r.fact?.[0] === "war" && r.fact[2] === "PER");
  const kinds = new Set();
  for (let i = 0; i < 40; i++) {
    const g = game(`press-${i}`), turns = play(g, 4), first = turns.findIndex((t) => t.receipt.some(pressed)) + 1;
    assert.ok(first >= 1 && first <= 4, `seed ${i}: pressed by the end of turn ${first}, read at the start of turn ${first + 1}`);
    assert.ok(first >= PRESS.first || turns[first - 1].receipt.some((r) => !r.press && pressed(r)), "the rules' own pressure never comes on the first turn");
    kinds.add(turns[first - 1].receipt.find(pressed).press || "world");
    const again = game(`press-${i}`);
    assert.deepEqual(play(again, 4).map((t) => t.receipt.map((r) => r.text)), turns.map((t) => t.receipt.map((r) => r.text)), "a seed replays");
    assert.ok(g.press && g.press.at <= g.date);
  }
  for (const k of ["demand", "incident", "unrest"]) assert.ok(kinds.has(k), `${k} comes on some seed (${[...kinds]})`);
  // a pact against the player needs two neighbours no stronger than it: here Peru is the strong one
  const strong = { PER: 6, CHL: 4, BOL: 2, BRA: 3 };
  let bloc = null;
  for (let i = 0; i < 40 && !bloc; i++) {
    const g = game(`bloc-${i}`), G = geoOf(g, strong);
    for (let t = 0; t < 4 && !bloc; t++) { const line = closeTurn(g, rules(g), G, []).receipt.find((r) => r.press === "bloc"); if (line) bloc = { g, line }; }
  }
  assert.ok(bloc, "a pact against the player comes on some seed");
  const [, a, b] = bloc.line.fact;
  assert.match(bloc.line.text, /sign a defence treaty, each wary of Peru \(.*a neighbour both fear \+2: \d+, needing 2\)$/);
  assert.equal(bloc.g.treaties.find((t) => t.pair === `${a}|${b}`).kind, "defence");
  assert.deepEqual([relOf(bloc.g, "PER", a), relOf(bloc.g, "PER", b)], [-1, -1], "each cools a step toward the player");
  assert.match(gazette(bloc.g, { turn: 2, from: "2027-01-01", to: "2027-02-01", receipt: [bloc.line] }, geoOf(bloc.g, strong)).home[0], /wary of Peru/i);
  // a citizen does not lead the country, and is not pressed as one
  const c = { ...game("press-c"), mode: "citizen" };
  assert.ok(play(c, 5).every((t) => !t.receipt.some((r) => r.press)));
});

test("a border incident: let it pass and the mandate falls; protest and the neighbour answers by a sum it states", () => {
  const g = game("inc-1"), G = geoOf(g);
  assert.deepEqual([...beside(g, G).keys()], ["BOL", "BRA", "CHL"]);
  g.incident = { from: "BOL", id: "PER-1", since: "2026-12-01" }; g.press = { at: "2026-12-01", n: 1 };
  const weak = protestAnswer(g, G, "BOL"), strong = protestAnswer(g, G, "BRA");
  assert.deepEqual([weak.ok, weak.why], [true, "might 3 against 2 +1: 1, needing 1"]);
  assert.deepEqual([strong.ok, strong.why], [false, "might 3 against 6 -3: -3, needing 1"]);
  // unanswered, it passes
  let lines = settlePressure(g, [], "2027-01-01", G);
  assert.match(lines[0].text, /^Peru: lets the incident at Tacna pass$/);
  assert.deepEqual(lines[0].gauge, [["PER", "m", -1, "a border incident left unanswered"]]);
  assert.equal(g.incident, undefined);
  // a protest to a weaker neighbour wins an apology
  g.incident = { from: "BOL", id: "PER-1", since: "2026-12-01", answer: "protest" };
  lines = settlePressure(g, [], "2027-01-01", G);
  assert.equal(lines[0].text, "Bolivia: apologises to Peru for the incident at Tacna (might 3 against 2 +1: 1, needing 1)");
  assert.deepEqual(lines[0].gauge, [["PER", "m", 1, "an apology won"]]);
  // a protest to a stronger one is rebuffed: relations cool, and a cause is held; a partner behind the player changes the sum
  g.incident = { from: "BRA", id: "PER-1", since: "2026-12-01", answer: "protest" };
  lines = settlePressure(g, [], "2027-01-01", G);
  assert.match(lines[0].text, /^Brazil: rejects Peru's protest over Tacna \(might 3 against 6 -3: -3, needing 1\); relations cool a step, and Peru holds a cause$/);
  assert.equal(relOf(g, "PER", "BRA"), -1);
  assert.match(g.cause["PER>BRA"][0], /border incident at Tacna in 2027/);
  g.treaties = [{ pair: "BRA|PER", kind: "defence", since: "2020-01-01" }];
  assert.equal(protestAnswer(g, G, "CHL").why, "might 3 against 4 -1, Brazil stands behind it +2: 1, needing 1");
  // the gazette and the prompt both carry it
  g.incident = { from: "CHL", id: "PER-1", since: g.date };
  const p = worldPrompt(g, { name: G.name, neighbours: () => ["CHL"], size: () => 2, geo: G, places: [] }, [], "2027-02-01");
  assert.match(p, /A border incident, kept by the rules: patrols of CHL crossed into PER-1 Tacna\./);
});

test("a partner at war calls the player to arms: joining is a pledge kept, staying out cuts the treaty back a rung", () => {
  const start = () => game("call-1", { treaties: [{ pair: "CHL|PER", kind: "alliance", since: "2020-01-01", old: 1 }], wars: [{ pair: "BOL|CHL", since: "2026-12-01", by: "BOL" }], press: { at: "2026-12-01", n: 1 } });
  const g = start(), G = geoOf(g);
  let lines = settlePressure(g, [], "2027-01-01", G);
  assert.equal(lines[0].text, "Chile: calls on Peru to join its war against Bolivia, by their alliance treaty");
  assert.deepEqual(g.call, { from: "CHL", on: "BOL", since: "2027-01-01" });
  assert.deepEqual(suggest(g, G)[0].verb, "WAR", "the call heads the suggested orders");
  assert.equal(settlePressure(g, [], "2027-01-01", G).length, 0, "it is not answered on the day it is made, nor made twice");
  // staying out
  lines = settlePressure(g, [], "2027-02-01", G);
  assert.equal(lines[0].text, "Chile: Peru did not answer its call against Bolivia, and their alliance treaty is cut back to a defence treaty");
  assert.equal(g.treaties[0].kind, "defence");
  assert.equal(g.call, undefined, "the same partner does not call against the same enemy again for two years");
  // joining: the player's own war order by card is carried out with no AI, and the pledge is kept
  const j = start(), JG = geoOf(j);
  settlePressure(j, [], "2027-01-01", JG);
  j.date = "2027-01-01"; j.orders = [{ text: "Join Chile: declare war on Bolivia.", verb: "WAR", target: "BOL", detail: "" }];
  const moves = ownMoves(j, [], ["Join Chile: declare war on Bolivia."], JG);
  assert.deepEqual(moves.map((m) => [m.verb, m.target]), [["WAR", "BOL"]]);
  assert.equal(applyMoves(j, moves, JG, ["Join Chile: declare war on Bolivia."], 1)[0].text, "Peru: declares war on Bolivia");
  lines = settlePressure(j, [], "2027-02-01", JG);
  assert.equal(lines[0].text, "Chile: thanks Peru for standing by its word against Bolivia");
  assert.deepEqual(lines[0].gauge, [["PER", "m", 1, "a pledge kept"]]);
  assert.equal(j.treaties[0].kind, "alliance");
  assert.deepEqual(standBy(j, "CHL", "BRA"), ["PER"], "who would join Chile if Brazil declared war on it");
});

test("a pledge has a price: the ink must dry, and an asker pledged to many is trusted less", () => {
  const g = game("price-1", { rel: { "CHL|PER": [2, "2026-12-01"] }, treaties: [{ pair: "CHL|PER", kind: "defence", since: "2026-12-01" }] });
  const might = (c) => MIGHT[c];
  assert.match(treatyAnswer(g, "PER", "CHL", "alliance", might).why, /the ink still wet on their last treaty -2/);
  g.date = "2027-12-01";
  assert.doesNotMatch(treatyAnswer(g, "PER", "CHL", "alliance", might).why, /ink/);
  assert.doesNotMatch(treatyAnswer({ ...g, date: "2026-12-01", treaties: [{ pair: "CHL|PER", kind: "defence", since: "2026-12-01", old: 1 }] }, "PER", "CHL", "alliance", might).why, /ink/, "a treaty the game began with is never new");
  assert.doesNotMatch(treatyAnswer({ ...g, date: "2026-12-01", treaties: [{ pair: "CHL|PER", kind: "trade", since: "2026-12-01" }] }, "PER", "CHL", "trade", might).why, /ink|pledges/, "trade is never held back");
  g.treaties.push({ pair: "BOL|PER", kind: "defence", since: "2020-01-01" });
  assert.equal(pledges(g, "PER"), 2);
  assert.equal(pledges(g, "PER", "CHL"), 1);
  assert.match(treatyAnswer(g, "PER", "BRA", "defence", might).why, /2 pledges already given -1/);
  assert.ok(newWorldGame("PER", "nation", "s", { scenario: { id: "x", start: "2026-12-01", opening: "", treaties: [{ pair: "CHL|PER", kind: "trade", since: "2026-12-01" }] } }).treaties[0].old, "a start's treaties are old ones");
});

// ---- endings ----
test("an ambition met is marked on its line, and a country with no land is over, once", () => {
  const g = game("end-1"), G = geoOf(g);
  g.goal = { id: "friends", since: g.date, mark: g.date, base: 2, need: 3 };
  g.treaties = ["BOL", "BRA", "CHL"].map((c) => ({ pair: [c, "PER"].sort().join("|"), kind: "defence", since: "2020-01-01" }));
  const met = settleAmbition(g, [], "2027-01-01", G);
  assert.equal(met[0].met, "friends");
  assert.equal(g.goal, null);
  assert.equal(g.done.length, 1);
  assert.match(gazette(g, { turn: 1, from: "2026-12-01", to: "2027-01-01", receipt: met }, G).home[0], /A ring of friends/);
  // the last province falls
  g.owners = { "PER-1": "CHL", "PER-2": "CHL" };
  assert.ok(chooseAmbition(g, G, "peace"));
  const over = settleAmbition(g, [], "2027-02-01", G);
  assert.deepEqual([over[0].over, over[0].text], [1, "Peru: holds no land; its story as a country ends here"]);
  assert.deepEqual(g.over, { turn: 1, date: "2027-02-01" });
  assert.equal(g.goal, null);
  assert.equal(settleAmbition(g, [], "2027-03-01", G).length, 0, "said once");
  assert.equal(settlePressure(g, [], "2027-03-01", G).length, 0, "nothing presses a country that is gone");
  assert.deepEqual(keepAmbition(g, () => true).over, g.over);
  assert.equal(keepAmbition({ over: { date: "soon" } }, () => true).over, undefined);
});

test("a save keeps pressure and war orders by card, and drops what does not fit the map", () => {
  const known = (c) => !!NAMES[c], isProvince = (id) => !!P[id];
  const kept = keepPressure({ press: { at: "2027-01-01", n: 2 }, incident: { from: "CHL", id: "PER-1", since: "2027-01-01", answer: "protest", extra: 1 }, call: { from: "CHL", on: "BOL", since: "2027-01-01" }, called: { "CHL>BOL": "2027-01-01", "CHL>XXX": "2027-01-01", junk: 1 } }, known, isProvince);
  assert.deepEqual(kept, { press: { at: "2027-01-01", n: 2 }, incident: { from: "CHL", id: "PER-1", since: "2027-01-01", answer: "protest" }, call: { from: "CHL", on: "BOL", since: "2027-01-01" }, called: { "CHL>BOL": "2027-01-01" } });
  assert.deepEqual(keepPressure({ press: "x", incident: { from: "XXX", id: "PER-1", since: "2027-01-01" }, call: { from: "CHL", on: "BOL" } }, known, isProvince), { press: undefined, incident: undefined, call: undefined, called: {} });
  const g = game("save-1"); g.orders = [{ text: "Declare war on Chile.", verb: "WAR", target: "CHL", detail: "" }, { text: "End our trade treaty with Bolivia.", verb: "BREAK", target: "BOL", detail: "" }]; g.actions = g.orders.map((o) => o.text); g.incident = { from: "CHL", id: "PER-1", since: g.date };
  const back = keepMore(checkSave(JSON.parse(JSON.stringify(g)), isProvince, known), isProvince, known);
  assert.deepEqual(back.orders.map((o) => [o.verb, o.target]), [["WAR", "CHL"], ["BREAK", "BOL"]]);
  assert.deepEqual(back.incident, g.incident);
  assert.equal(gaugeOf(back, "PER", "s"), 2);
});
