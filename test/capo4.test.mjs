// SPDX-License-Identifier: AGPL-3.0-or-later
// The end of Capo's Phase 4: storage that cannot silently fill, solo missions on the check (M1), three authored
// starts, the accept step and the "Fiction" mark, and one stage line for every kind of world.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { closeTurn, newWorldGame, worldPrompt } from "../src/story/turn.js";
import { GRADES, KINDS, WAYS, alertOf, heldBy, keepSends, missionLines, missionOdds, people, planMission, recheck, resolve, scouted, send, settleMissions, watchOf } from "../src/story/missions.js";
import { AGENTS, TIMES, agents, keepRoster, mark, recordOf, statusOf, unfit } from "../src/story/roster.js";
import { headline, report } from "../src/story/missiontext.js";
import { commanders } from "../src/story/worldrules.js";
import { strength } from "../src/story/war.js";
import { relOf } from "../src/story/relations.js";
import { checkSave, snapGame, takeBack } from "../src/story/saves.js";
import { ROOM, compact, compactNote, fatten, pressure, shortTurn, sizeWords, slim } from "../src/story/keep.js";
import { keeper } from "../site/keep.js";
import { AUTHORED } from "../src/story/authored.js";
import { FIRST, KINDS as HEADINGS, PRESETS, startOrder } from "../src/story/presets.js";
import { FICTION, SCENARIOS, checkScenario, scenarioFrom, scenarioText } from "../src/story/scenarios.js";
import { crossesLine } from "../src/story/line.js";
import { rivalMoves } from "../src/story/rivals.js";
import { stageOf } from "../src/story/overlay.js";
import { askPrompt, chatPrompt, councilPrompt } from "../src/story/talk.js";
import { AI_RULES, FICTION_MARK, accepted, fictionCopy } from "../site/accept.js";

// a small world: Peru (might 3) beside Chile (4), Bolivia (2) and Brazil (6)
const P = { "PER-1": { name: "Tacna", country: "PER" }, "CHL-1": { name: "Arica", country: "CHL" }, "CHL-2": { name: "Iquique", country: "CHL" }, "BOL-1": { name: "La Paz", country: "BOL" }, "BRA-1": { name: "Acre", country: "BRA" } };
const NB = { "PER-1": ["CHL-1", "BOL-1", "BRA-1"], "CHL-1": ["PER-1", "CHL-2", "BOL-1"], "CHL-2": ["CHL-1"], "BOL-1": ["PER-1", "CHL-1", "BRA-1"], "BRA-1": ["PER-1", "BOL-1"] };
const NAMES = { PER: "Peru", CHL: "Chile", BOL: "Bolivia", BRA: "Brazil" }, MIGHT = { PER: 3, CHL: 4, BOL: 2, BRA: 6 };
const geoOf = (g, might = MIGHT) => {
  const owner = (id) => g.owners[id] || P[id].country;
  return { name: (c) => NAMES[c] || c, place: (id) => P[id], find: (s) => (P[s] ? s : null), owner, neighbours: (id) => NB[id], across: () => [], coastal: () => false, all: Object.keys(P), home: (c) => Object.keys(P).find((id) => P[id].country === c),
    holds: (c) => Object.keys(P).filter((id) => owner(id) === c).length, known: (c) => !!NAMES[c], hasCoast: () => false, might: (c) => might[c] };
};
const council = () => ({ seats: { war: { name: "Iva Rojas", traits: "blunt", wants: "an army", favour: 0, likes: [], hates: [] }, treasury: null, foreign: { name: "Ana Ruiz", traits: "sly", wants: "open borders", favour: 0, likes: [], hates: [] }, home: null, outsider: null }, trusted: null, former: [] });
const game = (seed, extra = {}) => ({ ...newWorldGame("PER", "nation", seed), council: council(), ...extra });
const reply = (g, months = 1) => { const d = new Date(`${g.date}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + months); return { moves: [], events: [], news: [], summary: "A quiet month.", dropped: [], advice: null, standing: null, stop: d.toISOString().slice(0, 10) }; };
const order = (g, m) => { const text = `Send ${m.who} to ${m.kind} ${m.target}, ${m.way}.`; send(g, m, text); return text; };
const plain = (kind, target, who, way = "quiet", fail = "again", hunted = "withdraw") => ({ kind, target, who, way, fail, hunted });

// ---- missions ----

test("the roster: the council and two field agents dealt from the seed, skill by rule, nobody for a citizen", () => {
  const g = game("roster-1"), a = agents(g);
  assert.equal(a.length, 2);
  assert.notEqual(a[0].name, a[1].name);
  assert.deepEqual(agents(game("roster-1")), a, "the same seed deals the same two");
  for (const x of a) assert.ok(AGENTS.includes(x.name) && [3, 4].includes(x.skill) && x.seat === "field");
  const seen = new Set();
  for (let i = 0; i < 200; i++) for (const x of agents(game(`r-${i}`))) seen.add(x.name);
  assert.ok(seen.size >= 20, "the code names are all in use");
  assert.deepEqual(people(g).map((p) => p.seat), ["war", "foreign", "field", "field"]);
  assert.ok(people(g).every((p) => p.st === "fit" && p.skill >= 1 && p.skill <= 5));
  assert.equal(people({ ...g, mode: "citizen" }).length, 0);
  assert.equal(planMission({ ...g, mode: "citizen" }, geoOf(g), plain("scout", "CHL", a[0].name)).ok, false);
  assert.ok(people(g).length <= 7, "seven named people at most");
});

test("a mission's odds before the order are exactly what the rules roll: 100,000 missions a kind, each grade within 1 point", () => {
  for (const kind of Object.keys(KINDS)) {
    const g = game(`odds-${kind}`), G = geoOf(g), who = agents(g)[0].name, m = plain(kind, "CHL", who, kind === "sabotage" ? "bold" : "quiet", "again", kind === "rescue" ? "press" : "withdraw");
    if (kind === "rescue") mark(g, "Ana Ruiz", { st: "held", until: 99, by: "CHL" });
    const plan = planMission(g, G, m), got = [0, 0, 0, 0];
    assert.equal(plan.ok, true, plan.why);
    assert.equal(plan.odds.reduce((a, b) => a + b, 0), 100);
    for (let i = 0; i < 100000; i++) got[resolve({ ...g, seed: `${kind}-${i}` }, G, m, plan.p).grade]++;
    got.forEach((n, k) => assert.ok(Math.abs(n / 1000 - plan.odds[k]) <= 1, `${kind} ${GRADES[k]}: shown ${plan.odds[k]}, rolled ${n / 1000}`));
  }
});

test("an even plan is fair, no plan is certain, no approach rules, and every order matters", () => {
  const g = game("even"), G = geoOf(g, { ...MIGHT, CHL: 6, BOL: 2, BRA: 10 }), even = { name: "X", seat: "field", skill: 3 };
  const odds = (m, p = even) => missionOdds(g, G, m, p);
  const o = odds(plain("scout", "CHL", "X"));
  assert.ok(o[0] >= 25 && o[0] <= 45 && o[2] + o[3] <= 35 && o[3] <= 5, `skill 3 against watch 3, by the default orders: ${o}`);
  // the best person against the weakest country still fails sometimes; the worst against the strongest may still succeed
  const best = odds(plain("scout", "BOL", "X"), { ...even, skill: 5 }), worst = odds(plain("scout", "BRA", "X"), { ...even, skill: 1 });
  assert.ok(best[0] < 100 && best[2] + best[3] >= 1 && worst[0] >= 1, `${best} ${worst}`);
  // each approach is the best at something: quiet is hurt least, bold meets the aim most, patient is cleanest for its price
  const by = Object.fromEntries(Object.keys(WAYS).map((w) => [w, odds(plain("sabotage", "CHL", "X", w, "again", "press"))]));
  assert.ok(by.bold[0] + by.bold[1] > by.quiet[0] + by.quiet[1], "bold meets the aim more often than quiet");
  assert.ok(by.quiet[3] < by.bold[3], "quiet is held less often than bold");
  assert.ok(by.patient[0] >= by.bold[0] && by.patient[2] <= by.quiet[2], "patient is clean more often than bold and fails less than quiet");
  // the two standing orders each change at least 5 missions in 100
  const diff = (a, b) => a.reduce((s, n, i) => s + Math.abs(n - b[i]), 0) / 2;
  assert.ok(diff(odds(plain("scout", "CHL", "X", "quiet", "again")), odds(plain("scout", "CHL", "X", "quiet", "withdraw"))) >= 5);
  assert.ok(diff(odds(plain("scout", "CHL", "X", "bold", "again", "withdraw")), odds(plain("scout", "CHL", "X", "bold", "again", "press"))) >= 5);
  // out of role costs 20 on every step; a scouted country is 10 easier; alert makes it harder
  const first = (gg, m) => planMission(gg, G, m).first.chance, sab = plain("sabotage", "BOL", "Ana Ruiz", "patient"), agent = agents(g)[0];
  const lone = { ...g, council: { ...council(), seats: { ...council().seats, foreign: { ...council().seats.foreign, name: "Ana Ruiz" } } } };
  const inRole = planMission(lone, G, plain("scout", "BOL", "Ana Ruiz", "patient")).first, outRole = planMission(lone, G, sab).first;
  assert.deepEqual(outRole.parts.find(([l]) => l === "out of role"), ["out of role", -20]);
  assert.equal(inRole.parts.length, 0);
  const m = plain("scout", "CHL", agent.name, "patient");
  assert.equal(first({ ...g, intel: { CHL: "2099-01-01" } }, m) - first(g, m), 10);
  assert.equal(first(g, m) - first({ ...g, alert: { CHL: 1 } }, m), 10);
  assert.equal(watchOf({ ...g, alert: { CHL: 2 } }, G, "CHL"), 5, "watch is half the might, rounded up, plus the alert");
});

test("a mission in a turn: ordered by card, settled by the rules, one receipt sentence with its record, told by template", () => {
  let scout = null;
  for (let i = 0; i < 400 && !scout; i++) {
    const g = game(`turn-${i}`), G = geoOf(g), who = agents(g)[0].name, text = order(g, plain("scout", "CHL", who));
    assert.deepEqual([g.actions, g.sends.length], [[text], 1]);
    assert.equal(unfit(g, who), true, "ordered out, so not free for anything else this turn");
    const prompt = worldPrompt(g, { name: G.name, neighbours: () => ["CHL"], size: () => 1, geo: G, places: [] }, g.actions, "2027-01-01");
    assert.match(prompt, /ORDERED MISSIONS \(secret[^\n]*never how it ends\)\n- \w+: scout, in Chile \(CHL\), quiet/);
    const e = closeTurn(g, reply(g), G, [text]), line = e.receipt.find((x) => x.mission);
    assert.ok(line && line.ok && line.country === "PER" && !line.check, "the headline is the player's own receipt line");
    assert.doesNotMatch(line.text, /\.\s|\d\.\d/, "one sentence, whole numbers");
    assert.match(line.text, new RegExp(`^${who}'s scouting of Chile: .*: (clean|costly|failed|disaster)`));
    assert.equal(recheck(g.seed, line.mission), -1, "the record recomputes");
    assert.deepEqual(g.sends, [], "orders are spent");
    assert.equal(recordOf(g, who)[line.mission.grade], 1);
    const steps = report(g.seed, line.mission, "Chile");
    assert.equal(steps.length, line.mission.beats.length);
    assert.deepEqual(report(g.seed, line.mission, "Chile"), steps, "the telling replays from the record");
    for (const s of steps) { assert.ok(s.text.length > 20 && !/[{}]/.test(s.text)); assert.match(s.numbers, /^skill \d against watch \d.*chance \d+; drew \d+; (clean|costly|failed)$/); }
    assert.equal(headline(g.seed, line.mission, "Chile"), line.text.split(";")[0]);
    if (line.mission.grade <= 1 && line.mission.alarm < 2) scout = { g, G, who, line };
  }
  // a met aim changes a number: the country is scouted for a year, and the next mission there is easier
  const { g, G, who } = scout;
  assert.ok(scouted(g, "CHL") > g.date);
  assert.match(scout.line.text, /its watch is known until \d{4}-\d{2}/);
  assert.deepEqual(planMission(g, G, plain("sabotage", "CHL", who)).first.parts, [["scouted", 10]]);
  // a tampered record is caught at the first beat that differs
  const bent = structuredClone(scout.line.mission); bent.beats[1].roll = bent.beats[1].roll === 1 ? 2 : 1;
  assert.equal(recheck(g.seed, bent), 1);
  assert.equal(recheck(g.seed, { ...scout.line.mission, grade: 3 }), scout.line.mission.beats.length);
  assert.equal(recheck("another-seed", scout.line.mission) >= 0, true);
});

test("sabotage lowers might for a year; a noticed mission rouses the country and costs a step of relation; alert eases", () => {
  let done = null, loud = null;
  for (let i = 0; i < 600 && !(done && loud); i++) {
    const g = game(`sab-${i}`), G = geoOf(g), who = agents(g)[0].name, text = order(g, plain("sabotage", "BOL", who, "bold", "again", "press"));
    const before = strength(g, G, "BOL").might, line = closeTurn(g, reply(g), G, [text]).receipt.find((x) => x.mission);
    if (line.mission.grade <= 1 && !done) {
      done = true;
      assert.deepEqual(strength(g, G, "BOL").parts, [["sabotaged", -1]]);
      assert.equal(strength(g, G, "BOL").might, Math.max(1, before - 1));
      assert.equal(strength({ ...g, date: "2029-01-01" }, G, "BOL").parts.length, 0, "and only for a year");
    }
    if (line.mission.alarm >= 2 && !loud) {
      loud = true;
      assert.equal(alertOf(g, "BOL"), 1);
      assert.equal(relOf(g, "PER", "BOL"), -1);
      assert.match(line.text, /Bolivia is on alert \(1 of 3\); it knows whose hand it was, and relations fall a step/);
      closeTurn(g, reply(g), G, []);
      assert.equal(alertOf(g, "BOL"), 0, "a quiet turn, and the alert eases");
    }
  }
  assert.ok(done && loud);
});

test("capture leads to a rescue: the held lead no attack and give no counsel, are brought home, or are let go in six turns", () => {
  const G0 = geoOf(game("x"), { ...MIGHT, BRA: 10 });
  let held = null;
  for (let i = 0; i < 3000 && !held; i++) {
    const g = game(`cap-${i}`), text = order(g, plain("sabotage", "BRA", "Iva Rojas", "bold", "again", "press"));
    const line = closeTurn(g, reply(g), geoOf(g, { ...MIGHT, BRA: 10 }), [text]).receipt.find((x) => x.mission);
    if (line.mission.grade === 3) held = { g, line };
  }
  assert.ok(held, "someone is held in the end");
  const { g } = held, G = geoOf(g, { ...MIGHT, BRA: 10 });
  assert.match(held.line.text, /disaster, and held; .*Iva Rojas is held: send a rescue, or wait 6 turns$/);
  assert.deepEqual(statusOf(g, "Iva Rojas"), { st: "held", until: g.turn + TIMES.held, by: "BRA" });
  assert.deepEqual(heldBy(g, "BRA"), ["Iva Rojas"]);
  assert.equal(unfit(g, "Iva Rojas"), true);
  assert.deepEqual(commanders(g).map((c) => c.seat), ["foreign", "generals"], "the marshal is held, so she leads no attack");
  assert.equal(planMission(g, G, plain("scout", "CHL", "Iva Rojas")).why, "Iva Rojas is held by Brazil and cannot go");
  assert.equal(planMission(g, G, plain("rescue", "CHL", "Ana Ruiz")).why, "Chile holds none of your people");
  // a rescue that meets its aim brings her home, to rest a turn
  let home = null;
  for (let i = 0; i < 400 && !home; i++) {
    const t = structuredClone(g); t.seed = `res-${i}`;
    const who = agents(t)[0].name, text = order(t, plain("rescue", "BRA", who, "quiet", "again", "press")), line = closeTurn(t, reply(t), geoOf(t, { ...MIGHT, BRA: 10 }), [text]).receipt.find((x) => x.mission);
    if (line.mission.grade <= 1) home = { t, line };
  }
  assert.match(home.line.text, /Iva Rojas is home, and rests a turn/);
  assert.equal(statusOf(home.t, "Iva Rojas").st, "hurt");
  closeTurn(home.t, reply(home.t), geoOf(home.t), []);
  assert.equal(statusOf(home.t, "Iva Rojas").st, "fit");
  // left alone, she is let go after six turns, and the receipt says so
  let said = "";
  for (let k = 0; k < TIMES.held; k++) { assert.equal(statusOf(g, "Iva Rojas").st, "held"); said = closeTurn(g, reply(g), G, []).receipt.map((x) => x.text).join("\n"); }
  assert.match(said, /Iva Rojas: let go by Brazil after 6 turns held/);
  assert.equal(statusOf(g, "Iva Rojas").st, "fit");
  assert.deepEqual(commanders(g).map((c) => c.seat), ["war", "foreign", "generals"]);
});

test("mission limits: two a turn, one a person, one a country; a refused mission says why; a retaken turn draws fresh numbers", () => {
  const g = game("lim-1"), G = geoOf(g), [a, b] = agents(g).map((x) => x.name);
  const t1 = order(g, plain("scout", "CHL", a)), t2 = order(g, plain("scout", "BOL", b)), t3 = order(g, plain("scout", "BRA", "Ana Ruiz"));
  assert.deepEqual(g.sends.map((m) => m.target), ["BOL", "BRA"], "a third order replaces the oldest");
  assert.ok(!g.actions.includes(t1) && g.actions.includes(t2) && g.actions.includes(t3));
  const t4 = order(g, plain("sabotage", "BRA", b));
  assert.deepEqual(g.sends.map((m) => [m.who, m.target]), [[b, "BRA"]], "one order a person and a country: the new one stands");
  assert.deepEqual(g.actions, [t4]);
  // someone who leads an ordered attack cannot also go
  const w = game("lim-2", { wars: [{ pair: "CHL|PER", since: "2026-12-01", by: "PER" }], actions: ["Attack Arica"], orders: [{ text: "Attack Arica", verb: "ATTACK", target: "CHL-1", seat: "war", approach: "steady" }] });
  assert.equal(planMission(w, geoOf(w), plain("scout", "BOL", "Iva Rojas")).why, "Iva Rojas leads an attack this turn");
  // a mission whose person was dismissed before the turn closed is refused, in words
  const d = game("lim-3"), text = order(d, plain("scout", "CHL", "Ana Ruiz")); d.council.seats.foreign = null;
  const line = closeTurn(d, reply(d), geoOf(d), [text]).receipt.find((x) => /mission is not sent/.test(x.text));
  assert.deepEqual([line.ok, line.text], [false, "Ana Ruiz's mission is not sent: Ana Ruiz is not on your council or among your agents"]);
  // take-back after a settled mission: a new numbered line, so the roll that was seen is gone
  const s = game("lim-4"), who = agents(s)[0].name, rec = snapGame(s, "turn 1"), txt = order(s, plain("scout", "CHL", who));
  const first = closeTurn(s, reply(s), geoOf(s), [txt]).receipt.find((x) => x.mission).mission;
  const back = takeBack(s, rec);
  assert.equal(back.branch, 1);
  const txt2 = order(back, plain("scout", "CHL", who)), again = closeTurn(back, reply(back), geoOf(back), [txt2]).receipt.find((x) => x.mission).mission;
  assert.notEqual(again.beats[0].key, first.beats[0].key);
  assert.match(again.beats[0].key, /^1b1:scout:CHL:enter:/);
  // what a save holds of missions is checked before use
  assert.deepEqual(keepSends({ sends: [{ kind: "scout", target: "ZZZ", who: "x", way: "quiet", text: "t" }, { kind: "nope" }, plain("scout", "CHL", "x")], alert: { CHL: 2, ZZZ: 1, BOL: 9 }, intel: { CHL: "soon", BOL: "2027-01-01" }, sabot: "junk" }, (c) => !!NAMES[c]),
    { sends: [], alert: { CHL: 2 }, intel: { BOL: "2027-01-01" }, sabot: {} });
  assert.deepEqual(keepRoster({ roster: { Heron: { st: "held", until: 9, by: "ZZZ", n: [1, 0, 0, 1] }, Rook: { st: "hurt", until: 4, n: "x" }, Bad: 7 } }, (c) => !!NAMES[c]), { Heron: { n: [1, 0, 0, 1] }, Rook: { st: "hurt", until: 4, n: [0, 0, 0, 0] } });
  assert.deepEqual(missionLines(g, G, []), [], "no order, no lines in the prompt");
});

// ---- storage ----

const quota = (max) => { const m = new Map(); let used = 0; return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => m.get(k) ?? null, used: () => used,
  setItem: (k, v) => { const next = used - (m.has(k) ? k.length + m.get(k).length : 0) + k.length + v.length; if (next > max) throw new Error("QuotaExceededError"); m.set(k, v); used = next; } }; };
const lend = () => { const said = []; return { said, el: () => ({ style: {}, append() {}, setAttribute() {}, click() {} }), button: () => ({}), toast: (t) => said.push(t) }; };
const longTurn = (g, i) => ({ ...reply(g), summary: `Turn ${i} passes with much to tell.`, events: Array.from({ length: 6 }, (_, k) => ({ date: g.date, at: "PER", text: `Event ${k} of turn ${i}: ${"a long telling of what happened in the capital and at the border. ".repeat(6)}` })), news: Array.from({ length: 3 }, (_, k) => ({ outlet: "a Lima daily", headline: `Headline ${k}`, text: "What the papers say, at some length, about the month.".repeat(3) })) });

test("take-back records leave out chats and counsel, and get them back as they now stand", () => {
  const g = game("keep-1", { chats: [{ id: "c", with: ["CHL"], messages: [{ who: "you", text: "Hello", turn: 1 }] }], counsel: [{ turn: 1, question: "q", says: [] }] });
  const rec = slim(snapGame(g, "turn 1"));
  assert.ok(!("chats" in rec) && !("counsel" in rec) && rec.why === "turn 1" && rec.facts);
  g.chats[0].messages.push({ who: "CHL", text: "Later words", turn: 1 });
  closeTurn(g, reply(g), geoOf(g), []);
  const back = takeBack(g, fatten(rec, g));
  assert.deepEqual([back.turn, back.chats[0].messages.length, back.counsel.length], [1, 2, 1], "the turn is taken back; what was said stays said");
  assert.equal(fatten({ chats: [] }, g).chats.length, 0, "an older, whole record keeps its own");
});

test("a turn in short keeps what the rules decided, and the save shrinks in stated steps", () => {
  const t = { turn: 4, from: "2027-01-01", to: "2027-02-01", actions: ["x".repeat(300)], events: [{ text: "long" }, { text: "long" }], news: [{ headline: "h" }], summary: "A month.", dropped: ["d"], branch: 1, told: [{ at: "CHL-1" }],
    receipt: [{ ok: true, text: "took", fact: ["took", "PER", "CHL", 1], check: { band: "clean" } }, { ok: true, text: "warms to you" }, { ok: true, text: "m", mission: { f: 1 } }] };
  const s = shortTurn(t);
  assert.deepEqual([s.events, s.news, s.dropped, s.short, s.summary, s.branch, s.receipt.length, s.actions[0].length], [[], [], [], [2, 1], "A month.", 1, 2, 120]);
  assert.equal(shortTurn(s), s);
  assert.deepEqual(pressure(2400000, 0), { pc: 48, warn: false, step: 0 });
  assert.deepEqual(pressure(2000000, 600000), { pc: 52, warn: true, step: 0 });
  assert.deepEqual(pressure(3000000, 800000), { pc: 76, warn: true, step: 1 });
  const g = { log: Array.from({ length: 30 }, (_, i) => ({ ...t, turn: i + 1 })), chats: [{ messages: Array.from({ length: 45 }, () => ({ text: "m" })) }] };
  const c = compact(g, Array.from({ length: 8 }, () => ({})), 1);
  assert.deepEqual([c.past.length, c.turns, c.said, c.undone, g.log.filter((x) => x.short).length, g.chats[0].messages.length], [5, 10, 15, 3, 10, 30]);
  assert.equal(compactNote(c), "To make room in this browser: 10 older turns are now kept in short, 3 take-backs let go, 15 old chat messages let go. The chronicle and every record of the rules are whole.");
  assert.equal(compactNote(compact(g, c.past, 1)), "", "nothing more to let go at the same step");
  assert.deepEqual([sizeWords(182400), sizeWords(2449000), sizeWords(10)], ["182 kB", "2.4 MB", "1 kB"]);
});

test("a 200-turn game with fifty chats saves every turn, inside the room a browser gives", () => {
  const g = game("long-1", { chats: [] }), G = geoOf(g), store = quota(ROOM.allow), x = lend(), keep = keeper("capo-game-1", x, store);
  let past = [], most = 0;
  for (let i = 1; i <= 200; i++) {
    if (i % 4 === 0) g.chats.push({ id: `c${i}`, with: ["CHL"], messages: Array.from({ length: 12 }, (_, k) => ({ who: k % 2 ? "CHL" : "you", text: "What was said across the table, at some length, as diplomats do. ".repeat(5), turn: i })) });
    past.push(slim(snapGame(g, `turn ${g.turn}`))); past = past.slice(-20);
    closeTurn(g, longTurn(g, i), G, []);
    past = keep.save(g, past);
    assert.equal(keep.state().failed, false, `turn ${i} is saved`);
    assert.equal(JSON.parse(store.getItem("capo-game-1")).state.turn, g.turn);
    most = Math.max(most, keep.state().size);
  }
  assert.equal(g.chats.length, 50);
  assert.ok(most < ROOM.allow / 2, `the largest save was ${sizeWords(most)}`);
  assert.equal(x.said.length, 0, "and nothing needed saying");
  assert.ok(checkSave(JSON.parse(store.getItem("capo-game-1")).state, (id) => !!P[id], (c) => !!NAMES[c]), "what was kept is a game");
});

test("a filling store warns first, then makes room and says what went, then says plainly that it is not saved", () => {
  const run = (max, other) => {
    const g = game("full-1", { chats: [{ id: "c", with: ["CHL"], messages: Array.from({ length: 60 }, () => ({ who: "you", text: "words ".repeat(100), turn: 1 })) }] }), G = geoOf(g), store = quota(max), x = lend(), keep = keeper("capo-game-1", x, store);
    if (other) store.setItem("capo-scenarios-1", "s".repeat(other));
    let past = [];
    for (let i = 1; i <= 40; i++) { past.push(slim(snapGame(g, `turn ${g.turn}`))); past = past.slice(-20); closeTurn(g, longTurn(g, i), G, []); past = keep.save(g, past); }
    return { g, x, keep, store, past };
  };
  // half full because of what else the site keeps: a warning, once, and nothing is shortened
  const a = run(ROOM.allow, 2500000);
  assert.deepEqual([a.keep.state().warn, a.keep.state().failed, a.g.log.some((t) => t.short)], [true, false, false]);
  assert.equal(a.x.said.length, 1);
  assert.match(a.x.said[0], /fill 5\d in 100 of the room this browser gives it/);
  // three quarters full: older turns go short, take-backs fall to five, and the player is told what went
  const b = run(ROOM.allow, 3700000);
  assert.deepEqual([b.keep.state().failed, b.g.log.length, b.g.log.filter((t) => t.short).length, b.past.length, b.g.chats[0].messages.length], [false, 40, 20, 5, 30]);
  assert.ok(b.x.said.some((t) => /^To make room in this browser: \d+ older turns? (is|are) now kept in short/.test(t)));
  assert.equal(b.g.chron.turns.length + b.g.chron.eras.length > 0, true, "the chronicle is whole");
  // a browser that gives far less than it should: the game shrinks to fit, with no failure
  const c = run(150000, 0);
  assert.equal(c.keep.state().failed, false);
  assert.ok(c.g.log.some((t) => t.short) && c.store.used() <= 150000);
  // no room at all: never silent. The page says so once, keeps saying so in the Game sheet, and a save that works clears it
  const d = run(20000, 0);
  assert.equal(d.keep.state().failed, true);
  assert.equal(d.x.said.filter((t) => /^Not saved: this browser has no room left/.test(t)).length, 1, "said once, not every turn");
  assert.equal(d.g.turn, 41, "the game in hand goes on");
  const big = quota(ROOM.allow), keep2 = keeper("capo-game-1", d.x, big);
  keep2.save(d.g, d.past);
  assert.equal(keep2.state().failed, false);
});

// ---- authored starts ----

const world = JSON.parse(readFileSync(new URL("../maps/world.json", import.meta.url), "utf8"));
const provinces = new Map(world.provinces.map((p) => [p.id, p])), isCountry = (c) => Object.hasOwn(world.countries, c), isProvince = (id) => provinces.has(id);
const realGeo = (g) => {
  const ids = [...provinces.keys()], nb = new Map(ids.map((id) => [id, []])), base = {};
  for (const [a, b] of world.neighbours) { nb.get(a).push(b); nb.get(b).push(a); }
  for (const p of world.provinces) base[p.country] = (base[p.country] || 0) + 1;
  const owner = (id) => g.owners[id] || provinces.get(id).country;
  const holds = (c) => { let n = base[c] || 0; for (const [id, o] of Object.entries(g.owners)) { if (provinces.get(id).country === c) n--; if (o === c) n++; } return n; };
  return { name: (c) => world.countries[c] || c, place: (id) => provinces.get(id), find: (s) => (provinces.has(s) ? s : null), owner, neighbours: (id) => nb.get(id), across: () => [], coastal: () => false, holds, known: (c) => c in base, all: ids, hasCoast: () => false, might: (c) => g.might?.[c] };
};

test("the first screen opens on Late 2026, with the clean slate second and every start once (ruling 151)", () => {
  const list = startOrder(SCENARIOS);
  assert.equal(FIRST, "late-2026");
  assert.deepEqual(list.slice(0, 2).map((s) => s.id), ["late-2026", "today"], "Late 2026 first, the blank start second");
  assert.equal(SCENARIOS[0].title, "A clean slate");
  assert.equal(SCENARIOS[0].id, "today", "the blank start keeps its id, so saves still open");
  assert.equal(list.length, SCENARIOS.length + PRESETS.length);
  assert.equal(new Set(list.map((s) => s.id)).size, list.length);
});

test("three authored starts: whole scenario files on the real map, fiction by their own words, real names only in the present day", () => {
  assert.equal(AUTHORED.length, 3);
  assert.equal(HEADINGS.authored, "Authored starts");
  assert.ok(AUTHORED.every((s) => PRESETS.includes(s)) && PRESETS[0] === AUTHORED[0], "listed first among the ready-made starts");
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
  assert.equal(AUTHORED[0].start, "2026-12-01", "the present day starts in late 2026");
  for (const s of AUTHORED) {
    const r = checkScenario({ ...s, kind: "capo-scenario" }, isCountry, isProvince);
    assert.equal(r.ok, true, r.why);
    // nothing was dropped or cut by the same gate a shared file passes
    for (const k of ["title", "blurb", "opening", "start"]) assert.equal(r.scenario[k], s[k], `${s.id} ${k}`);
    assert.deepEqual([r.scenario.wars.length, r.scenario.treaties.length, r.scenario.facts.length, Object.keys(r.scenario.rel).length, Object.keys(r.scenario.might).length], [s.wars.length, s.treaties.length, s.facts.length, Object.keys(s.rel).length, Object.keys(s.might).length], s.id);
    assert.deepEqual(r.scenario.facts.map((f) => f.text), s.facts.map((f) => f.text), "no fact is cut short");
    assert.deepEqual(crossesLine(scenarioText(r.scenario)), []);
    // "Late 2026" names the real leaders of its day (rulings 48 and 149), and says so first; the others name offices
    if (s.id === "late-2026") { assert.match(s.blurb, /^Fiction with real names\. /); assert.match(s.facts[0].text, /^Fiction with real names/); assert.match(s.opening, /real people/); }
    else { assert.match(s.blurb, /^Fiction\. /); assert.match(s.facts[0].text, /offices, not people/); }
    const pairs = [...s.wars, ...s.treaties].map((x) => x.pair);
    assert.equal(new Set(pairs).size, pairs.length, `${s.id}: no pair is bound twice, or at war and in a treaty`);
    for (const p of [...pairs, ...Object.keys(s.rel)]) assert.equal(p, p.split("|").sort().join("|"));
    assert.ok(s.facts.length >= 8 && s.facts.length <= 20 && s.opening.length >= 300);
    // the game it starts: relations as written, wars from its first day, and a first prompt that carries its facts
    const g = newWorldGame("ETH", "nation", `start-${s.id}`, { scenario: r.scenario }), G = realGeo(g);
    assert.equal(g.date, s.start);
    for (const [p, n] of Object.entries(s.rel)) if (!s.wars.some((w) => w.pair === p) && !(n < 1 && s.treaties.some((t) => t.pair === p))) assert.equal(relOf(g, ...p.split("|")), n, `${s.id} ${p}`);
    assert.ok(g.wars.every((w) => w.since === s.start), "nobody begins worn out");
    const prompt = worldPrompt(g, { name: G.name, neighbours: () => ["ERI", "SOM"], size: (c) => G.holds(c), geo: G, places: [] }, [], "2027-06-01");
    assert.ok(prompt.includes(s.facts[1].text) && prompt.includes(`Opening: ${s.opening}`));
    // twenty turns by the rules alone: it runs, replays, and no country is at war and in a treaty with the same neighbour
    const play = () => { const t = newWorldGame("ETH", "nation", `run-${s.id}`, { scenario: r.scenario }), TG = realGeo(t), lines = []; for (let i = 0; i < 20; i++) lines.push(...closeTurn(t, reply(t, 3), TG, []).receipt.map((x) => x.text)); return { t, lines }; };
    const one = play(), two = play();
    assert.deepEqual(one.lines, two.lines, "a seed replays");
    assert.ok(one.t.wars.every((w) => !one.t.treaties.some((x) => x.pair === w.pair)));
    assert.ok(rivalMoves(one.t, realGeo(one.t)).length >= 0);
  }
  // the three differ in kind: a war under way, a brink, an armed peace
  assert.deepEqual(AUTHORED.map((s) => s.wars.length), [1, 0, 0]);
  assert.ok(AUTHORED[2].treaties.length > AUTHORED[1].treaties.length * 3);
  assert.ok(Object.keys(AUTHORED[1].might).length >= 10, "the regional start sets its own strengths");
});

test("a scenario saved from a game says it is fiction and carries where countries stand", () => {
  const g = game("scen-1", { rel: { "CHL|PER": [-2, "2026-12-01"], "BOL|PER": [1, "2026-12-01"] } });
  const s = scenarioFrom(g, { title: "A cold border", blurb: "b", opening: "o" });
  assert.equal(s.fiction, FICTION);
  assert.deepEqual(s.rel, { "CHL|PER": -2, "BOL|PER": 1 });
  const r = checkScenario({ ...s, rel: { ...s.rel, "PER|CHL": -9, "ZZZ|PER": 1, "BRA|PER": 0 } }, (c) => !!NAMES[c], (id) => !!P[id]);
  assert.deepEqual(r.scenario.rel, { "CHL|PER": -2, "BOL|PER": 1 }, "relations off the map or out of range are dropped");
  assert.deepEqual(newWorldGame("PER", "nation", "x", { scenario: r.scenario }).rel, { "CHL|PER": [-2, "2026-12-01"], "BOL|PER": [1, "2026-12-01"] });
  assert.deepEqual(newWorldGame("PER", "nation", "x").rel, {});
});

// ---- the stage line, the accept step and the Fiction mark ----

test("every prompt names its stage from the game: the real world, an alternate history by year and turning point, a world of its own", () => {
  const real = game("stage-1"), alt = { ...game("stage-2"), date: "1936-05-01", alt: { turn: "1917: the submarines stayed in port.", lands: {}, gone: [], disputes: { add: [], drop: [] } } }, made = { ...game("stage-3"), world: { where: "the Shattered Coast, a world of its own" } };
  assert.equal(stageOf(real), "the real world, starting from the present day");
  assert.equal(stageOf(alt), "an alternate history of our world, in 1936, that never happened. Where history turned: 1917: the submarines stayed in port");
  assert.equal(stageOf(made), "the Shattered Coast, a world of its own");
  const w = (g) => ({ name: (c) => NAMES[c] || c, neighbours: () => [], size: () => 1, geo: geoOf(g), places: [] });
  for (const g of [real, alt, made]) {
    const openers = [worldPrompt(g, w(g), [], "2027-01-01"), chatPrompt(g, w(g), { with: ["CHL"], messages: [] }, "Hello"), councilPrompt(g, w(g), [["war", "Marshal"]]), askPrompt(g, w(g), [], "Well?")].map((p) => p.split("\n")[0]);
    for (const o of openers) assert.ok(o.includes(`set in ${stageOf(g)}.`), o);
  }
  assert.doesNotMatch(worldPrompt(alt, w(alt), [], "1936-06-01"), /the real world, starting from the present day|whatever the first line says/);
});

test("the accept step is asked until accepted; what is copied out of the story says it is fiction", () => {
  assert.equal(accepted(), false, "nothing kept, nothing accepted");
  assert.match(AI_RULES, /^Each AI service has rules of its own, and they bind your key/);
  assert.equal(AI_RULES.split(". ").length, 1, "one sentence");
  let on = null;
  const sheet = { nodeType: 1, closest: (q) => (q.includes("#sheet") ? sheet : null) }, outside = { nodeType: 1, closest: () => null };
  const doc = { selected: "", at: sheet, addEventListener: (k, f) => { on = f; }, getSelection: () => ({ toString: () => doc.selected, anchorNode: doc.at }) };
  fictionCopy(doc);
  const copy = (target = { closest: () => null }) => { const e = { target, set: null, stopped: false, clipboardData: { setData: (k, v) => { e.set = [k, v]; } }, preventDefault: () => { e.stopped = true; } }; on(e); return e; };
  doc.selected = "Lima daily: Ports talks open";
  assert.deepEqual(copy().set, ["text/plain", `Lima daily: Ports talks open\n\n${FICTION_MARK}`]);
  assert.equal(copy({ closest: (q) => (q.includes("textarea") ? {} : null) }).set, null, "the player's own typing is left alone");
  doc.at = outside; assert.equal(copy().set, null, "and so is the rest of the page");
  doc.at = sheet; doc.selected = "  "; assert.equal(copy().stopped, false);
});
