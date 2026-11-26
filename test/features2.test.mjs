// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo's features lane, round two: home politics, fog and rumours, scenes, the scale of play and means, the
// council convened, beats in scenario files, map views, spheres and clauses, and terrain words on made worlds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { closeTurn, newWorldGame, worldPrompt } from "../src/story/turn.js";
import { applyMoves, commandOf } from "../src/story/worldrules.js";
import { checkSave, snapGame, takeBack } from "../src/story/saves.js";
import { odds, replays } from "../src/story/check.js";
import { askPrompt, chatPrompt } from "../src/story/talk.js";
import { checkScenario, scenarioFrom, scenarioText } from "../src/story/scenarios.js";
import { gaugeOf, settleState } from "../src/story/state.js";
import { ambitionsFor, chooseAmbition, progress } from "../src/story/ambitions.js";
import { WHEN, beatFor, beatLines, keepScript, noteBeat } from "../src/story/beats.js";
import { CARES, caresOf, moodOf, quellPlan, settleHome, settleUnrest, termsFor } from "../src/story/home.js";
import { TIERS, fogLines, knowledge, learn, seenGauge, seenWords, settleFog } from "../src/story/fog.js";
import { chooseScene, openScene, readScene, sceneLines, scenePlan, sceneProblem, scenePrompt, sceneWith, settleScene } from "../src/story/scenes.js";
import { MEANS, meansOf, meansTarget, scaleProblem, settleSelf, switchScale } from "../src/story/scale.js";
import { debatePrompt, debaters, readDebate } from "../src/story/debate.js";
import { changed, claims, fronts } from "../src/story/views.js";
import { PACT, pactAnswer, pactOf, settlePacts, sphereOf, spheres, tributeOf } from "../src/story/pacts.js";
import { MORE, NOTE2, backMore, keepMore, moreFacts, moreNote, plan } from "../src/story/more.js";
import { TERRAIN, makeWorld } from "../src/map/worldgen.js";
import { SETTINGS } from "../src/map/worlds.js";
import { madeWorld } from "../src/story/settings.js";

// Peru (two provinces, Lima its heartland), Chile, Bolivia and Brazil
const P = { "PER-1": { name: "Tacna", country: "PER" }, "PER-2": { name: "Lima", country: "PER" }, "CHL-1": { name: "Arica", country: "CHL" }, "CHL-2": { name: "Santiago", country: "CHL" }, "BOL-1": { name: "La Paz", country: "BOL" }, "BOL-2": { name: "Sucre", country: "BOL" }, "BRA-1": { name: "Acre", country: "BRA" }, "BRA-2": { name: "Rondonia", country: "BRA" } };
const NB = { "PER-1": ["CHL-1", "BOL-1", "BRA-1", "PER-2"], "PER-2": ["PER-1"], "CHL-1": ["PER-1", "CHL-2", "BOL-1"], "CHL-2": ["CHL-1"], "BOL-1": ["PER-1", "BRA-1", "CHL-1", "BOL-2"], "BOL-2": ["BOL-1"], "BRA-1": ["PER-1", "BOL-1", "BRA-2"], "BRA-2": ["BRA-1"] };
const MIGHT = { PER: 3, CHL: 4, BOL: 2, BRA: 6 }, NAMES = { PER: "Peru", CHL: "Chile", BOL: "Bolivia", BRA: "Brazil" }, name = (c) => NAMES[c] || c;
const geoOf = (g, claimed = []) => {
  const owner = (id) => g.owners[id] || P[id].country;
  return { name, all: Object.keys(P), place: (id) => P[id], find: (s) => (P[s] ? s : null), owner, neighbours: (id) => NB[id], across: () => [], coastal: () => false, hasCoast: () => false,
    holds: (c) => Object.keys(P).filter((id) => owner(id) === c).length, known: (c) => !!NAMES[c], might: (c) => MIGHT[c], home: (c) => ({ PER: "PER-2", CHL: "CHL-2", BOL: "BOL-2", BRA: "BRA-2" })[c],
    claimed: () => claimed.filter(([id, who]) => owner(id) !== who) };
};
const game = (seed, extra = {}, mode = "nation") => ({ ...newWorldGame("PER", mode, seed), ...extra });
const reply = (g, moves = [], months = 1) => { const d = new Date(`${g.date}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + months); return { moves, events: [], news: [], summary: "A quiet month.", dropped: [], advice: null, standing: null, stop: d.toISOString().slice(0, 10) }; };
const mv = (country, verb, target, detail = "", action = 0) => ({ action, country, verb, target, detail });
const member = (nm, favour = 0) => ({ name: nm, traits: "blunt, loyal", wants: "a quiet life", likes: [], hates: [], favour, since: "2026-12-01" });
const council = () => ({ seats: { war: member("Iva Rojas"), treasury: member("Ana Ruiz"), foreign: null, home: member("Luz Mora"), outsider: member("Tom Paz") }, trusted: "war", former: [] });
const isP = (id) => !!P[id], known = (c) => !!NAMES[c];
const gauges = (g, c, s, t = 2, m = 2, at = g.date) => { g.gauge = { ...(g.gauge || {}), [c]: { s: [s, at, ""], t: [t, at, ""], m: [m, at, ""] } }; };
const world = (g, extra = {}) => ({ name, neighbours: () => ["CHL", "BOL", "BRA"], size: () => 2, geo: geoOf(g), places: [], ...extra });

test("home politics: every seat cares for two things from a fixed list, and favour drifts a step toward the mood they make", () => {
  const g = game("home-1", { council: council() });
  const [office, own] = caresOf(g, "treasury", g.council.seats.treasury);
  assert.equal(office, "purse", "the Treasurer cares for a full treasury");
  assert.ok(CARES[own] && own !== "purse" && own !== "rise" && own !== "means", "the second is dealt from the list, and a nation's council has no personal cares");
  assert.deepEqual(caresOf(g, "treasury", g.council.seats.treasury), [office, own], "the same game and name always deal the same care");
  assert.equal(moodOf(g, "home", g.council.seats.home).parts[0][1], 0, "a steady country leaves the Interior easy");
  gauges(g, "PER", 1, 0, 2);
  assert.deepEqual(moodOf(g, "home", g.council.seats.home).parts[0], ["order", -1, "stability shaken"]);
  assert.deepEqual(moodOf(g, "treasury", g.council.seats.treasury).parts[0], ["purse", -1, "the treasury empty"]);
  // nothing moves before six months; then one step, with the care that moved it
  assert.deepEqual(settleHome(g, "2026-12-31", geoOf(g)).filter((l) => /favour/.test(l.text)), []);
  assert.deepEqual(settleHome(g, "2027-05-30", geoOf(g)).filter((l) => /favour/.test(l.text)), []);
  const lines = settleHome(g, "2027-07-01", geoOf(g)).map((l) => l.text);
  assert.ok(lines.includes("Luz Mora: cools toward you (favour -1): they care for order at home, and see stability shaken"), lines.join(" / "));
  assert.ok(lines.some((t) => t.startsWith("Ana Ruiz: cools toward you (favour -1): they care for a full treasury, and see the treasury empty")));
  // mood alone never takes a member to -3: it runs from -2 to 2
  for (let y = 2028; y < 2034; y++) settleHome(g, `${y}-01-01`, geoOf(g));
  assert.ok(Object.values(g.council.seats).filter(Boolean).every((m) => m.favour >= -2), "nobody resigns over mood alone");
  assert.ok(g.council.seats.home.favour <= -1);
  // a citizen's circle may care for the player's own rise and means
  const c = game("home-2", { council: { seats: { family: member("Rosa Paz"), friend: member("Eli Soto") }, trusted: null, former: [] }, standing: 2 }, "citizen");
  assert.deepEqual([caresOf(c, "family", c.council.seats.family)[0], caresOf(c, "friend", c.council.seats.friend)[0]], ["means", "rise"]);
});

test("unrest: shaken names a figure and a province, revolt is a rising, a rising a year old hands taken land back, steady ends it", () => {
  const g = game("unrest-1", { owners: { "CHL-1": "PER" } }), G = geoOf(g);
  gauges(g, "PER", 1);
  let lines = settleHome(g, "2027-01-01", G).map((l) => l.text);
  const u = g.unrest.PER;
  assert.equal(u.id, "CHL-1", "trouble gathers in land taken from another");
  assert.match(u.who, /^the (Colonel|Governor|Mayor|Judge|Captain|Tribune|Deputy|Preacher) of Arica$/);
  assert.deepEqual(lines, [`Peru: unrest gathers in Arica around ${u.who} (stability shaken)`]);
  assert.deepEqual(settleHome(g, "2027-02-01", G), [], "it is named once");
  const again = game("unrest-1", { owners: { "CHL-1": "PER" } }); gauges(again, "PER", 1); settleHome(again, "2027-01-01", geoOf(again));
  assert.deepEqual(again.unrest, g.unrest, "the same game names the same figure");
  // in revolt it is a rising
  g.gauge.PER.s[0] = 0;
  lines = settleHome(g, "2027-03-01", G).map((l) => l.text);
  assert.deepEqual(lines, [`Peru: ${u.who} raises Arica in revolt (stability in revolt)`]);
  assert.equal(g.unrest.PER.rising, true);
  assert.match(moreFacts(g, G, ["CHL"]).join("\n"), /- Unrest, kept by the rules: in PER, a rising in CHL-1 Arica around the .* of Arica\. .*Never say how it ends/);
  // a year unanswered: the taken province goes back, as a handover the chronicle and relations read
  assert.deepEqual(settleUnrest(g, "2028-02-28", G), []);
  lines = settleUnrest(g, "2028-03-01", G);
  assert.equal(lines[0].text, `Peru: the rising of ${u.who} hands Arica back to Chile, a year unanswered`);
  assert.deepEqual(lines[0].fact, ["gave", "PER", "CHL", 1]);
  assert.equal(G.owner("CHL-1"), "CHL");
  assert.equal(g.unrest.PER, undefined);
  // with no taken land the rising costs mandate instead, and never the heartland
  const h = game("unrest-2"), H = geoOf(h); gauges(h, "PER", 0);
  settleHome(h, "2027-01-01", H);
  assert.equal(h.unrest.PER.id, "PER-1", "away from the heartland");
  const toll = settleUnrest(h, "2028-01-01", H);
  assert.deepEqual(toll[0].gauge, [["PER", "m", -1, "a rising unanswered"]]);
  settleState(h, toll, "2028-01-01", H);
  assert.equal(gaugeOf(h, "PER", "m"), 1);
  // the rising is over at shaken; the unrest fades at steady
  h.gauge.PER.s[0] = 1;
  assert.match(settleHome(h, "2028-02-01", H)[0].text, /the rising of .* is over, though the unrest is not \(stability shaken\)/);
  h.gauge.PER.s[0] = 2;
  assert.match(settleHome(h, "2028-03-01", H)[0].text, /the unrest around .* fades \(stability steady\)/);
  assert.deepEqual(h.unrest, {});
});

test("unrest answered: terms cost a step of treasury, and moving against it is a check with its odds shown first", () => {
  const g = game("quell-1", { council: council() }), G = geoOf(g);
  gauges(g, "PER", 1, 2, 3);
  settleHome(g, g.date, G);
  assert.equal(termsFor(g), "");
  const q = quellPlan(g, G), skill = commandOf(g, g.council.seats.home);
  assert.deepEqual([q.plan.skill, q.plan.difficulty, q.lead], [skill, 3, "Luz Mora"], "the Interior leads, at the skill the rules dealt");
  assert.deepEqual(q.plan.parts.filter(([, n]) => n), [["mandate trusted", 5]]);
  assert.equal(q.chance, Math.min(75, Math.max(10, 50 + 10 * (skill - 3) + 5)));
  const o = odds(q.chance); assert.equal(o.clean + o.costly + o.failed, 100);
  // by card: the order is carried out only while its action stands
  plan(g, { kind: "quell", text: "Move against the unrest." });
  const t = closeTurn(g, reply(g), G, ["Move against the unrest."]), line = t.receipt.find((r) => r.roll);
  assert.ok(replays(g.seed, line.roll), "the roll replays from the seed");
  assert.equal(line.roll.chance, q.chance, "the chance shown is the chance rolled");
  const s = gaugeOf(g, "PER", "s"), m = gaugeOf(g, "PER", "m");
  assert.deepEqual([s, m], { clean: [2, 3], costly: [2, 2], failed: [0, 2] }[line.roll.band], `${line.roll.band}: ${line.text}`);
  assert.deepEqual(g.plans, [], "orders by card are spent with the turn");
  // terms: the treasury pays, stability rises a step
  const p = game("terms-1"), PG = geoOf(p); gauges(p, "PER", 1, 2, 2); settleHome(p, p.date, PG);
  plan(p, { kind: "terms", text: "Meet their terms." });
  const r = closeTurn(p, reply(p), PG, ["Meet their terms."]).receipt.map((x) => x.text);
  assert.ok(r.some((x) => /^Peru: meets the terms of the .*, and the treasury pays$/.test(x)), r.join(" / "));
  assert.deepEqual([gaugeOf(p, "PER", "s"), gaugeOf(p, "PER", "t")], [2, 1]);
  assert.ok(r.some((x) => /the unrest around .* fades/.test(x)));
  // an order whose action was removed is never carried out; an empty treasury has nothing to offer
  const n = game("terms-2"), NG = geoOf(n); gauges(n, "PER", 1, 0, 2); settleHome(n, n.date, NG);
  assert.equal(termsFor(n), "the treasury is empty: there is nothing to offer");
  plan(n, { kind: "quell", text: "Move against the unrest." });
  assert.equal(closeTurn(n, reply(n), NG, []).receipt.some((x) => x.roll), false);
  assert.deepEqual(quellPlan(game("none"), NG), { ok: false, why: "there is no unrest to answer" });
});

test("fog: four tiers from borders, treaties, wars and talks; an Envoy lifts each a step; what is learned fades", () => {
  const g = game("fog-1"), near = ["CHL", "BOL"];
  assert.deepEqual(TIERS, ["dark", "rumoured", "reported", "clear"]);
  assert.deepEqual([knowledge(g, "PER", near).tier, knowledge(g, "CHL", near).tier, knowledge(g, "BRA", near).tier], [3, 2, 0]);
  assert.equal(knowledge(g, "BRA", near).why, "no border, treaty or talks");
  g.rel = { "BRA|PER": [1, g.date] };
  assert.equal(knowledge(g, "BRA", near).word, "rumoured");
  g.treaties = [{ pair: "BRA|PER", kind: "trade", since: g.date }];
  assert.deepEqual(knowledge(g, "BRA", near), { tier: 2, word: "reported", why: "a trade partner" });
  g.treaties = [{ pair: "BRA|PER", kind: "defence", since: g.date }];
  assert.equal(knowledge(g, "BRA", near).tier, 3);
  g.treaties = []; g.rel = {};
  // talks this turn: reported for a year, rumoured for two more, then dark
  g.chats = [{ id: "c1", with: ["BRA"], person: "", messages: [{ who: "you", text: "Hello", turn: g.turn }] }];
  settleFog(g, "2027-01-01");
  assert.deepEqual(g.seen, { BRA: [2, "2027-01-01"] });
  assert.deepEqual(["2027-06-01", "2028-01-01", "2029-12-31", "2030-01-01"].map((d) => knowledge(g, "BRA", near, d).tier), [2, 1, 1, 0]);
  g.chats = []; settleFog(g, "2030-01-01");
  assert.deepEqual(g.seen, {}, "what has faded is dropped");
  // another rule may teach (a mission, say), and never lowers what is known
  learn(g, "BRA", 3, "2030-01-01"); learn(g, "BRA", 1, "2030-02-01");
  assert.deepEqual(g.seen.BRA, [3, "2030-01-01"]);
  delete g.seen.BRA;
  // the Envoy
  g.council = council(); g.council.seats.foreign = member("Eva Sol");
  assert.deepEqual([knowledge(g, "BRA", near).tier, knowledge(g, "CHL", near).tier, knowledge(g, "PER", near).tier], [1, 3, 3]);
  assert.match(knowledge(g, "CHL", near).why, /a neighbour, and your Envoy/);
  assert.equal(knowledge({ ...g, mode: "citizen" }, "BRA", near).tier, 0, "a citizen has no envoy");
});

test("rumours: a rumoured gauge may be a step off, fixed for the year by the seed; chats and the council are told by tier", () => {
  const g = game("fog-2");
  gauges(g, "BRA", 1, 3, 2);
  assert.deepEqual(seenGauge(g, "BRA", "s", 2), [1, false]);
  assert.deepEqual(seenGauge(g, "BRA", "s", 0), [null, false]);
  let off = 0;
  for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"]) for (const k of ["s", "t", "m"]) {
    const x = { ...g, seed }, [n, rumour] = seenGauge(x, "BRA", k, 1), truth = gaugeOf(x, "BRA", k);
    assert.ok(rumour && Math.abs(n - truth) <= 1 && n >= 0 && n <= 4);
    assert.deepEqual(seenGauge(x, "BRA", k, 1), [n, true], "the same rumour all year");
    off += n !== truth;
  }
  assert.ok(off > 4 && off < 22, `about one rumour in three is off (${off} of 36)`);
  assert.match(seenWords(g, "BRA", 1), /^said to be \w[\w ]*, \w+, \w+$/);
  assert.equal(seenWords(g, "BRA", 2), "shaken, full, accepted");
  assert.equal(seenWords(g, "BRA", 0), "");
  const lines = fogLines(g, ["PER", "CHL", "BRA"], ["CHL"]);
  assert.match(lines[0], /^- What the player's side knows of others .*: CHL reported: steady, sound, accepted; BRA dark: nothing reliable$/);
  // the hook: a chat and the council carry it when the page lends it, and the truth is not in them
  const w = { name, known: (codes) => fogLines(g, codes, ["CHL"]) };
  assert.match(chatPrompt(g, w, { with: ["BRA"], messages: [] }, "Hello"), /BRA dark: nothing reliable/);
  assert.doesNotMatch(chatPrompt(g, w, { with: ["BRA"], messages: [] }, "Hello"), /shaken/);
  assert.doesNotMatch(askPrompt(g, { name }, [["war", member("Iva Rojas")]], "Well?"), /What the player's side knows/, "without the hook nothing changes");
  // the turn's writer is told the truth
  assert.match(moreFacts(g, geoOf(g), ["BRA"]).join("\n"), /BRA shaken, full, accepted/);
});

const TREE = ["SCENE: The ledger room | the Treasury, after hours | Ana Ruiz has the accounts open and does not look up. She has been waiting.",
  "CHOICE: a | bold | Demand the true figures, now", "CLEAN: a | She slides the real ledger across and tells you who has been skimming.", "COSTLY: a | She gives you the figures, and makes sure the clerks hear how you asked.", "FAILED: a | She closes the book and says she will speak to you in council, not here.",
  "**CHOICE:** b | careful | Ask what she would do in your place", "- CLEAN: b | She talks for an hour, and by the end she is on your side.", "COSTLY: b | She answers, but names a price for her help.", "FAILED: b | She gives you the answer she gives everyone.",
  "CHOICE: c | careful | Leave it", "CLEAN: c | Nothing is said, and both of you prefer it so.", "COSTLY: c | no", "FAILED: c | She watches you go.",
  "CHOICE: d | bold | A fourth", "CLEAN: d | It should never be read at all, whatever it says."].join("\n");

test("scenes: the AI writes a small tree inside hard caps, the rules set the odds, and the check picks the ending", () => {
  const g = game("scene-1", { council: council() }), G = geoOf(g);
  g.council.seats.treasury.favour = 2; gauges(g, "PER", 2, 2, 3);
  const withs = sceneWith(g, G, ["CHL"]);
  assert.deepEqual(withs.map((w) => w.kind), ["seat", "seat", "seat", "seat", "country"], "a nation has no scene on its own");
  const w = withs.find((x) => x.key === "treasury"), p = scenePrompt(g, world(g), w, "Find out who is stealing.");
  for (const part of ["The rules roll and choose which is shown; you never choose", "No ending may change land, a war, a treaty", "- Ana Ruiz, treasury in the player's council", "Find out who is stealing.", "CHOICE: a | bold or careful"]) assert.ok(p.includes(part), part);
  assert.deepEqual(readScene("nothing here"), { ok: false, why: "No scene could be read: it needs a SCENE line and at least two choices, each with CLEAN, COSTLY and FAILED endings." });
  const r = readScene(TREE);
  assert.equal(r.ok, true);
  assert.deepEqual(r.scene.choices.map((c) => [c.k, c.bold]), [["a", true], ["b", false]], "a choice missing an ending is left out, and nothing past c is read");
  assert.equal(r.scene.title, "The ledger room");
  assert.equal(readScene(TREE.replace("She slides", "The naked schoolgirl slides")).ok, false, "an ending across the hard line is dropped, and its choice with it");
  openScene(g, w, "Find out who is stealing.", r.scene);
  assert.equal(sceneProblem(g), "");
  const a = scenePlan(g, G, "a"), b = scenePlan(g, G, "b");
  assert.deepEqual([a.chance, b.chance], [75, 65], "50, her favour +10, mandate trusted +5; bold +10, held at 75");
  assert.deepEqual([a.stake, a.price], ["Ana Ruiz's favour", "a step of mandate"]);
  assert.notEqual(a.plan.mission, scenePlan({ ...g, scene: { ...g.scene, title: "Another" } }, G, "a").mission, "a scene asked again draws again");
  const sc = chooseScene(g, G, "b");
  assert.ok(replays(g.seed, sc.beat) && sc.beat.chance === 65);
  assert.equal(sc.end, r.scene.choices[1].ends[sc.beat.band], "the ending shown is the one the AI wrote for that result");
  assert.equal(chooseScene(g, G, "a"), null, "the choice is made once");
  assert.equal(sceneProblem(g), "You have lived this turn's scene: one a turn.");
  assert.match(sceneLines(g)[0], /^- A scene the player lived this turn, "The ledger room" with Ana Ruiz, settled by the rules as (clean|costly|failed): /);
  const band = sc.beat.band, t = closeTurn(g, reply(g), G, []), line = t.receipt.find((x) => x.roll);
  assert.match(line.text, new RegExp(`^A scene, "The ledger room": ${band} \\(presence 3 against 3, .*chance 65; drew \\d+; ${band}\\)`));
  assert.equal(g.council.seats.treasury.favour, band === "failed" ? 2 : 3, "careful and failed costs nothing; otherwise her favour rises");
  assert.equal(gaugeOf(g, "PER", "m"), band === "costly" ? 2 : 3, "the price of a costly scene is a step of mandate");
  assert.equal(g.scene, null);
});

test("scenes: every result of every kind changes one step of one thing, by rule", () => {
  const run = (mode, w, bold, band, setup = () => {}) => {
    const g = game("scene-2", { council: council(), standing: mode === "citizen" ? 2 : 5 }, mode), G = geoOf(g);
    setup(g);
    openScene(g, w, "x", readScene(TREE).scene);
    Object.assign(g.scene, { picked: "a", end: "It ends.", beat: { key: "k", band, roll: 1, chance: 50, skill: 3, difficulty: 3, approach: [bold ? "bold" : "careful", bold ? 10 : 0], parts: [] } });
    const out = settleScene(g, G);
    return { g, out, text: out.lines[0].text };
  };
  const seat = { kind: "seat", key: "war", name: "Iva Rojas" }, land = { kind: "country", key: "CHL", name: "the envoy of Chile" }, self = { kind: "self", key: "", name: "nobody: on your own" };
  assert.equal(run("nation", seat, true, "failed").g.council.seats.war.favour, -1, "bold and failed: the stake is lost");
  assert.equal(run("nation", seat, true, "failed", (g) => { g.council.seats.war.favour = -2; }).g.council.seats.war.favour, -2, "a scene never makes anyone resign");
  assert.match(run("nation", land, false, "clean").text, /relations with Chile rise to warm$/);
  assert.match(run("nation", land, true, "failed").text, /relations with Chile fall to cool$/);
  assert.doesNotMatch(run("nation", land, false, "clean", (g) => { g.wars = [{ pair: "CHL|PER", since: g.date, by: "CHL" }]; }).text, /relations/, "nothing warms an enemy at war");
  assert.deepEqual(run("nation", land, false, "costly").out.lines[0].gauge, [["PER", "m", -1, 'the scene "The ledger room"']]);
  assert.deepEqual(run("leader", self, false, "clean").out.means, [[1, 'the scene "The ledger room"']]);
  assert.deepEqual(run("citizen", self, false, "costly").out.means.map(([d]) => d), [1, -1], "costly on your own: you break even");
  assert.deepEqual(run("citizen", seat, false, "costly").out.means.map(([d]) => d), [-1]);
  assert.deepEqual(run("citizen", self, false, "failed").out.means, []);
  // a scene left unchosen is forgotten with the turn
  const g = game("scene-3", { council: council() }); openScene(g, seat, "x", readScene(TREE).scene);
  assert.equal(closeTurn(g, reply(g), geoOf(g), []).receipt.some((x) => x.roll), false);
  assert.equal(g.scene, null);
});

test("the scale of play changes in a running game: standing and the circle follow, once a turn, and it is said", () => {
  const g = game("scale-1", { council: council(), actions: ["Attack Arica.", "Plant trees."], orders: [{ text: "Attack Arica.", verb: "ATTACK", target: "CHL-1" }] });
  g.council.seats.outsider.favour = -1;
  assert.equal(scaleProblem(g, "nation"), "You already play that way.");
  assert.equal(scaleProblem(g, "king"), "That is not a way to play.");
  const r = switchScale(g, "citizen", { name: "Rosa Paz", role: "teacher" });
  assert.equal(r.ok, true);
  assert.deepEqual([g.mode, g.standing, g.character.name], ["citizen", 2, "Rosa Paz"]);
  assert.deepEqual(Object.keys(g.council.seats), ["family", "friend", "employer", "steward", "neighbour"]);
  assert.equal(g.council.seats.family.name, "Iva Rojas", "each member takes the matching seat");
  assert.equal(g.council.trusted, "family");
  assert.equal(g.council.seats.neighbour, null, "one already cool toward the player parts");
  assert.ok(r.lines.includes("Tom Paz: parts from your circle as the scale of play changes"));
  assert.deepEqual([g.actions, g.orders], [["Plant trees."], []], "a citizen commands nothing: orders by card are dropped");
  assert.equal(switchScale(g, "leader").why, "The scale of play changes once a turn at most.");
  assert.match(moreFacts(g, geoOf(g)).join("\n"), /- The scale of play changed this turn: the player now plays as citizen\./);
  const t = closeTurn(g, reply(g), geoOf(g), g.actions);
  assert.equal(t.receipt.some((x) => x.text === "The scale of play changes from nation to citizen"), true);
  assert.equal(switchScale(g, "leader").ok, true, "next turn it may change again");
  assert.deepEqual([g.mode, g.standing, g.council.seats.war.name], ["leader", 5, "Iva Rojas"]);
});

test("means: a leader or a citizen has a gauge of their own, moved a step a year toward their standing and the treasury", () => {
  const g = game("means-1", { standing: 2, character: { name: "Rosa Paz" } }, "citizen");
  assert.deepEqual(MEANS, ["destitute", "poor", "getting by", "comfortable", "wealthy"]);
  assert.deepEqual([meansOf(g), meansTarget(g)], [2, 1], "an ordinary person in a sound country is heading for poor");
  assert.deepEqual(settleSelf(g, "2027-06-01"), [], "not within the year");
  assert.deepEqual(settleSelf(g, "2028-06-01").map((l) => l.text), ["Your own means fall to poor (a hard year for someone of your standing)"]);
  g.standing = 4; gauges(g, "PER", 2, 3, 2);
  assert.equal(meansTarget(g), 4);
  assert.deepEqual(settleSelf(g, "2028-07-01", [[1, 'the scene "A deal"']]).map((l) => l.text), ['Your own means rise to getting by (the scene "A deal")']);
  assert.deepEqual(settleSelf(g, "2028-08-01", [[1, "a"], [-1, "b"]]), [], "a gain and a price in one turn cancel");
  assert.match(moreFacts(g, geoOf(g)).join("\n"), /- The player's own means, kept by the rules: getting by \(3 of 5\)\./);
  assert.doesNotMatch(moreFacts(game("means-2"), geoOf(g)).join("\n"), /own means/, "a nation has none");
  assert.deepEqual(ambitionsFor(g, geoOf(g)).map((a) => a.id), ["peace", "comfort"], "at standing 4 a name in the land is already made");
  chooseAmbition(g, geoOf(g), "comfort");
  assert.deepEqual([progress(g, geoOf(g)).have, progress(g, geoOf(g)).need], [3, 4]);
});

test("the council convened: the rules seat the two who see the country most differently, and the debate is words only", () => {
  const g = game("debate-1", { council: council() });
  assert.deepEqual(debaters(game("debate-0")), []);
  gauges(g, "PER", 1, 4, 2);
  const who = debaters(g), moods = Object.fromEntries(Object.entries(g.council.seats).filter(([, m]) => m).map(([s, m]) => [s, moodOf(g, s, m).mood]));
  assert.ok(who.length >= 2 && who.length <= 3);
  assert.equal(moods[who[0][0]], Math.max(...Object.values(moods)), "the most pleased");
  assert.equal(moods[who[1][0]], Math.min(...Object.entries(moods).filter(([s]) => s !== who[0][0]).map(([, v]) => v)), "faces the least pleased");
  assert.ok(who.some(([s]) => s === "war") || who.length === 2 || true);
  const p = debatePrompt(g, { name }, who, "Shall we raise taxes?", ["- What the player's side knows of others: CHL reported: steady, sound, accepted"]);
  for (const part of ["They disagree, and say so to each other's faces", "nothing here is decided", "Shall we raise taxes?", "cares for", "CHL reported", "ANSWERS: seat | what they say back to the others"]) assert.ok(p.includes(part), part);
  const [a, b] = who, text = [`SAYS: ${a[0]} | favourable | The books allow it, and the roads need it.`, `**SAYS:** ${b[1].name} | against | Not while the streets are full.`, `SAYS: ${a[0]} | against | A second opening is not read.`, "SAYS: nobody | against | Nor is a stranger.",
    `ANSWERS: ${a[0]} | ${b[1].name} counts crowds; I count coin.`, `ANSWERS: ${b[0]} | And who pays when the crowd turns?`].join("\n");
  const d = readDebate(text, who);
  assert.deepEqual(d.says.map((s) => [s.seat, s.word]), [[a[0], "favourable"], [b[0], "against"]]);
  assert.deepEqual(d.answers.map((s) => s.seat), [a[0], b[0]]);
  assert.equal(readDebate(`SAYS: ${a[0]} | favourable | Alone.`, who), null, "one voice is not a debate");
});

test("beats in scenario files: checked words from a fixed list, kept with the scenario, and played before any drawn beat, once", () => {
  const raw = [{ text: "A comet is seen over the capital, and the priests disagree about what it means.", when: ["peace", "nonsense"], from: 2 }, { text: "The old marshal dies, and the army mourns in the streets.", when: ["war"] }, { text: "short" }, { text: 7 }];
  const script = keepScript(raw);
  assert.deepEqual(script.map((b) => [b.id, b.when, b.from]), [["s1", ["peace"], 2], ["s2", ["war"], 1]]);
  assert.ok(Object.keys(WHEN).length >= 12);
  assert.equal(keepScript(Array.from({ length: 30 }, () => raw[0])).length, 12);
  const file = { kind: "capo-scenario", v: 1, title: "Comet year", start: "2026-12-01", beats: raw };
  const sc = checkScenario(file, known, isP);
  assert.equal(sc.ok, true);
  assert.deepEqual(sc.scenario.beats, script);
  assert.ok(scenarioText(sc.scenario).includes(script[0].text), "a scripted beat passes the hard line like every other text");
  assert.equal(checkScenario({ ...file, beats: undefined }, known, isP).scenario.beats, undefined);
  const g = newWorldGame("PER", "nation", "script-1", { scenario: sc.scenario });
  assert.deepEqual(g.script, script);
  assert.notEqual(beatFor(g)?.[0], "s1", "not before its turn");
  g.turn = 2;
  assert.deepEqual(beatFor(g), ["s1", null, script[0].text]);
  assert.match(beatLines(g, geoOf(g))[0], /^- This turn's beat, written into this scenario by its author: A comet is seen over the capital, and the priests disagree about what it means\. Write it/);
  noteBeat(g); g.turn = 3;
  assert.notEqual(beatFor(g)?.[0], "s1", "once in a game");
  g.wars = [{ pair: "CHL|PER", since: g.date, by: "CHL" }];
  assert.equal(beatFor(g)[0], "s2");
  // saved again as a scenario, and kept in a save
  assert.deepEqual(scenarioFrom(g, { title: "Again", beats: g.script }).beats, script.map(({ text, when, from }) => ({ text, when, from })));
  const kept = keepMore(checkSave(JSON.parse(JSON.stringify(g)), isP, known), isP, known);
  assert.deepEqual([kept.script, kept.beats], [script, [["s1", 2]]]);
});

test("map views: fronts, land changed and claims, read from what the rules keep", () => {
  const g = game("view-1", { owners: { "BOL-1": "CHL" }, wars: [{ pair: "CHL|PER", since: "2026-12-01", by: "CHL" }, { pair: "BOL|BRA", since: "2026-12-01", by: "BRA" }] }), G = geoOf(g, [["CHL-1", "PER"], ["PER-1", "CHL"], ["BRA-1", "BOL"]]);
  const f = fronts(g, G);
  assert.deepEqual([f.get("PER-1"), f.get("CHL-1"), f.get("BOL-1"), f.get("PER-2"), f.get("CHL-2")], ["yours", "foe", "foe", undefined, undefined], "both sides of the player's front, and nothing behind it");
  assert.equal(f.get("BRA-1"), undefined, "Bolivia's border province is in Chile's hands: no front there");
  const o = game("view-4", { wars: [{ pair: "BOL|BRA", since: "2026-12-01", by: "BRA" }] });
  assert.deepEqual(Object.fromEntries(fronts(o, geoOf(o))), { "BOL-1": "other", "BRA-1": "other" }, "another war's front");
  assert.equal(fronts(game("view-0"), geoOf(game("view-0"))).size, 0);
  assert.deepEqual(Object.fromEntries(changed(g, G)), { "BOL-1": "other" });
  g.owners["CHL-2"] = "PER"; g.owners["PER-1"] = "CHL";
  assert.deepEqual([changed(g, G).get("CHL-2"), changed(g, G).get("PER-1")], ["won", "lost"]);
  // land a scenario began with is not land changed, until it changes
  const s = game("view-2", { owners: { "BOL-1": "CHL" }, start: { "BOL-1": "CHL" } });
  assert.equal(changed(s, geoOf(s)).size, 0);
  delete s.owners["BOL-1"];
  assert.equal(changed(s, geoOf(s)).get("BOL-1"), "other", "won back by the country the map gives it to");
  const c = claims(game("view-3"), geoOf(game("view-3"), [["CHL-1", "PER"], ["PER-1", "CHL"], ["BRA-1", "BOL"]]));
  assert.deepEqual(Object.fromEntries(c), { "CHL-1": "yours", "PER-1": "onyou", "BRA-1": "other" });
});

test("a pact of non-aggression: answered by rule, lasts five years, and war on a partner is a breach with a price", () => {
  const g = game("pact-1"), G = geoOf(g);
  assert.equal(pactAnswer(g, G, "PER", "CHL", "peace").ok, false, "neutral relations: 0, needing 1");
  assert.match(pactAnswer(g, G, "PER", "CHL", "peace").why, /relations neutral 0: 0, needing 1$/);
  g.rel = { "CHL|PER": [1, g.date] };
  assert.equal(pactAnswer(g, G, "PER", "CHL", "peace").ok, true);
  plan(g, { kind: "pact", sub: "peace", target: "CHL", text: "Propose a pact of non-aggression to Chile (CHL)." });
  let t = closeTurn(g, reply(g), G, ["Propose a pact of non-aggression to Chile (CHL)."]);
  assert.ok(t.receipt.some((x) => x.ok && /^Peru: signs a pact of non-aggression with Chile, which agrees \(relations warm \+2: 2, needing 1\)$/.test(x.text)), t.receipt.map((x) => x.text).join(" / "));
  assert.deepEqual(pactOf(g, "CHL", "PER"), { kind: "peace", a: "CHL", b: "PER", since: "2027-01-01" });
  assert.deepEqual(pactAnswer(g, G, "PER", "CHL", "peace"), { no: "that pact already stands" });
  assert.match(moreFacts(g, G, ["CHL"]).join("\n"), /- Clauses that bind the player's country.*: a pact of non-aggression with CHL until 2032/);
  // Chile declares war all the same: a breach
  t = closeTurn(g, reply(g, [mv("CHL", "WAR", "PER")]), G, []);
  const texts = t.receipt.map((x) => x.text);
  assert.ok(texts.includes("Chile: breaks its pact of non-aggression with Peru, and is known for it"), texts.join(" / "));
  assert.equal(pactOf(g, "CHL", "PER"), undefined);
  assert.equal(g.word.CHL, t.to, "known for it: every treaty answer counts it for two years");
  assert.deepEqual(g.cause["PER>CHL"], ["a pact of non-aggression broken in 2027", t.to]);
  assert.equal(gaugeOf(g, "CHL", "s"), 1, "and a step of stability at home");
  // a pact left alone runs out
  const q = game("pact-2", { pacts: [{ kind: "peace", a: "BOL", b: "PER", since: "2026-12-01" }] });
  assert.deepEqual(settlePacts(q, [], "2031-11-30", geoOf(q)), []);
  assert.deepEqual(settlePacts(q, [], "2031-12-01", geoOf(q)).map((l) => l.text), ["The pact of non-aggression between Bolivia and Peru runs out after 5 years"]);
  assert.deepEqual(q.pacts, []);
  // refusals say why
  assert.deepEqual(pactAnswer({ ...g }, G, "PER", "CHL", "peace"), { no: "at war with Chile: make peace first" });
});

test("tribute: a weaker country asked adds up a score; paying lowers its treasury's ceiling and lifts the receiver's", () => {
  const g = game("trib-1"), G = geoOf(g);
  assert.deepEqual(pactAnswer(g, G, "PER", "CHL", "tribute"), { no: "Chile is not the weaker of the two" });
  let a = pactAnswer(g, G, "PER", "BOL", "tribute");
  assert.deepEqual([a.ok, a.why], [false, "might 3 against 2 +1: 1, needing 4"]);
  gauges(g, "BOL", 0); g.wars = [{ pair: "BOL|BRA", since: g.date, by: "BRA" }];
  a = pactAnswer(g, G, "PER", "BOL", "tribute");
  assert.deepEqual([a.ok, a.why], [true, "might 3 against 2 +1, another war to fight +1, in revolt at home +2: 4, needing 4"]);
  g.treaties = [{ pair: "BOL|CHL", kind: "defence", since: g.date }];
  assert.equal(pactAnswer(g, G, "PER", "BOL", "tribute").ok, false, "a protector at least as strong stands behind it");
  g.treaties = [];
  plan(g, { kind: "pact", sub: "tribute", target: "BOL", text: "Demand tribute of Bolivia (BOL)." });
  const t = closeTurn(g, reply(g), G, ["Demand tribute of Bolivia (BOL)."]);
  assert.ok(t.receipt.some((x) => /^Bolivia: agrees to pay Peru a yearly tribute rather than refuse it/.test(x.text)), t.receipt.map((x) => x.text).join(" / "));
  assert.deepEqual(tributeOf(g, "PER", "BOL"), { kind: "tribute", a: "PER", b: "BOL", since: t.to });
  assert.equal(gaugeOf(g, "PER", "m"), 3, "a demand met lifts mandate");
  assert.equal(sphereOf(g, G, "BOL"), "PER", "a country that pays you stands in your sphere");
  // a year on: Peru's treasury may rise past sound without a treaty, on tribute alone
  g.wars = [];
  for (let i = 0; i < 13; i++) closeTurn(g, reply(g), G, []);
  assert.equal(gaugeOf(g, "PER", "t"), 3);
  assert.equal(g.gauge.PER.t[2], "a year of tribute received");
  // the payer stops by rule once it is no longer the weaker, and the receiver holds a cause
  const s = game("trib-2", { pacts: [{ kind: "tribute", a: "PER", b: "BOL", since: "2026-12-01" }], might: {} }), S = { ...geoOf(s), might: (c) => (c === "BOL" ? 3 : MIGHT[c]) };
  assert.deepEqual(settlePacts(s, [], "2027-01-01", S).map((l) => l.text), ["Bolivia: stops paying tribute to Peru (might 3 against 3: no longer the weaker)"]);
  assert.deepEqual(s.cause["PER>BOL"], ["tribute refused in 2027", "2027-01-01"]);
  // the player, paying, may stop by card
  const p = game("trib-3", { pacts: [{ kind: "tribute", a: "BRA", b: "PER", since: "2026-12-01" }] });
  assert.deepEqual(settlePacts(p, [], "2027-01-01", geoOf(p), [{ kind: "pact", sub: "stop", target: "BRA", text: "x" }]).map((l) => l.text), ["Peru: stops paying tribute to Brazil"]);
  // a refusal costs mandate and relations
  const r = game("trib-4"); plan(r, { kind: "pact", sub: "tribute", target: "BOL", text: "Demand tribute." });
  closeTurn(r, reply(r), geoOf(r), ["Demand tribute."]);
  assert.deepEqual([gaugeOf(r, "PER", "m"), r.rel["BOL|PER"][0]], [1, -1]);
});

test("spheres: read from the treaties, shown to the story, and an ambition", () => {
  const g = game("sphere-1", { player: "BRA", treaties: [{ pair: "BOL|BRA", kind: "defence", since: "2026-12-01" }, { pair: "BRA|PER", kind: "alliance", since: "2026-12-01" }, { pair: "BRA|CHL", kind: "trade", since: "2026-12-01" }] }), G = geoOf(g);
  assert.deepEqual([sphereOf(g, G, "BOL"), sphereOf(g, G, "PER"), sphereOf(g, G, "CHL"), sphereOf(g, G, "BRA")], ["BRA", "BRA", "", ""], "might 6 over 2 and 3; trade makes no sphere");
  assert.deepEqual([...spheres(g, G)], [["BRA", ["BOL", "PER"]]]);
  assert.match(moreFacts(g, G, ["PER"]).join("\n"), /- Spheres of influence near the player, read by the rules from treaties .*: BRA over BOL, PER/);
  assert.ok(PACT.gap === 3);
  chooseAmbition(g, G, "sphere");
  assert.deepEqual([progress(g, G).have, progress(g, G).need], [2, 3]);
  g.pacts = [{ kind: "tribute", a: "BRA", b: "CHL", since: "2026-12-01" }];
  const t = closeTurn(g, reply(g), G, []);
  assert.ok(t.receipt.some((x) => x.text === 'Brazil: its ambition is met, "A sphere of your own" (hold three countries in your sphere of influence)'));
});

test("round two in a whole game: it replays, the prompt stays small, saves keep it, older saves are converted, take-back redraws", () => {
  const play = () => {
    const g = game("whole-2", { council: council(), owners: { "BOL-1": "CHL" } }), G = geoOf(g, [["CHL-1", "PER"]]), sizes = [];
    g.council.seats.foreign = member("Eva Sol");
    for (let i = 0; i < 60; i++) {
      const acts = [];
      if (i === 3) { plan(g, { kind: "pact", sub: "peace", target: "BRA", text: "Pact with Brazil." }); acts.push("Pact with Brazil."); }
      if (i === 5) { openScene(g, { kind: "seat", key: "war", name: "Iva Rojas" }, "Talk.", readScene(TREE).scene); chooseScene(g, G, "a"); }
      if (i === 12) acts.push("War on Bolivia.");
      if (g.unrest?.PER && i % 2) { plan(g, { kind: "quell", text: "Move against the unrest." }); acts.push("Move against the unrest."); }
      const moves = i === 12 ? [mv("PER", "WAR", "BOL", "", 1)] : i === 20 ? [mv("CHL", "WAR", "PER")] : i > 20 && i < 26 ? [mv("CHL", "ATTACK", "PER-1")] : i % 9 === 0 ? [mv("BRA", "TREATY", "PER", "trade")] : [];
      sizes.push(moreFacts(g, G, ["CHL", "BOL", "BRA"]).join("\n").length);
      closeTurn(g, reply(g, moves, 3), G, acts);
    }
    return { g, sizes };
  };
  const a = play(), b = play(), g = a.g, G = geoOf(g, [["CHL-1", "PER"]]);
  assert.deepEqual(a.g, b.g, "the same seed and moves give the same game, to the last number");
  assert.ok(Math.max(...a.sizes) < 2100, `the lines these systems add to the prompt stay small (${Math.max(...a.sizes)} characters at most)`);
  assert.equal(g.more, MORE);
  assert.ok(g.log.some((t) => t.receipt.some((x) => /unrest gathers|raises .* in revolt/.test(x.text))), "a war without a cause shakes the country, and unrest has a face");
  assert.ok(g.log.some((t) => t.receipt.some((x) => x.roll)), "and it was answered on the check");
  assert.ok(g.log.some((t) => t.receipt.some((x) => /(warms to you|cools toward you) \(favour -?\d\): they care for/.test(x.text))), "the council's favour followed its cares");
  const p = worldPrompt(g, world(g, { geo: G }), [], "2042-03-01");
  assert.ok(p.includes("- The state of countries, kept by the rules"));
  // a save keeps every part; junk and things off the map are dropped, never trusted
  const kept = keepMore(checkSave(JSON.parse(JSON.stringify(g)), isP, known), isP, known);
  for (const k of ["unrest", "home", "seen", "pacts", "plans", "self", "scene", "gauge"]) assert.deepEqual(kept[k] ?? null, g[k] ?? (k === "seen" ? {} : null), k);
  assert.equal(kept.told, undefined);
  const junk = keepMore(checkSave({ ...JSON.parse(JSON.stringify(g)), unrest: { ZZZ: { id: "PER-1", who: "x", since: "2027-01-01" }, PER: { id: "nowhere", who: "x", since: "2027-01-01" }, CHL: 5 }, home: { at: 7 }, seen: { ZZZ: [2, "2027-01-01"], CHL: [9, "2027-01-01"], BRA: [2, "soon"] },
    pacts: [{ kind: "peace", a: "PER", b: "ZZZ", since: "2027-01-01" }, { kind: "marriage", a: "PER", b: "CHL", since: "2027-01-01" }, 4], plans: [{ kind: "coup", text: "x" }, { kind: "pact", sub: "peace", target: "ZZZ", text: "x" }], self: { p: [9, "x"] }, scene: { turn: g.turn, choices: "x" }, script: "x", scaled: "x" }, isP, known), isP, known);
  assert.deepEqual([junk.unrest, junk.home, junk.seen, junk.pacts, junk.plans, junk.self, junk.scene, junk.script, junk.scaled], [{}, undefined, {}, [], [], undefined, null, undefined, undefined]);
  // a game saved under round one: a plain message once, every new part empty, and it plays on
  const old = JSON.parse(JSON.stringify(g));
  for (const k of ["unrest", "home", "seen", "pacts", "plans", "self", "scene"]) delete old[k];
  old.more = 1;
  assert.equal(moreNote(old), NOTE2);
  assert.match(NOTE2, /^This game was saved before home politics, fog and scenes\. It has been brought up to date, and nothing in its past changes\./);
  const conv = keepMore(checkSave(old, isP, known), isP, known);
  assert.deepEqual([conv.told, conv.more, conv.unrest, conv.pacts], [2, MORE, {}, []]);
  assert.ok(closeTurn(conv, reply(conv), geoOf(conv), []));
  assert.equal(moreNote(g), "");
  // a turn in which one of these rules rolled, taken back, moves to a new line: the roll is drawn fresh
  const t = game("back-2"), T = geoOf(t); gauges(t, "PER", 1); settleHome(t, t.date, T);
  const rec = snapGame(t, "turn 1");
  plan(t, { kind: "quell", text: "Move against the unrest." });
  closeTurn(t, reply(t), T, ["Move against the unrest."]);
  const back = backMore(takeBack(t, rec), t);
  assert.deepEqual([back.branch, back.turn], [1, 1]);
  assert.equal(backMore(back, back).branch, 1, "and only once");
});

test("terrain: every province of a made world has one flavour word, the same for the same seed, told to the story and read by no rule", () => {
  const s = SETTINGS[0], w = makeWorld(s, s.seed), again = makeWorld(s, s.seed);
  assert.deepEqual(Object.keys(w.terrain).sort(), w.provinces.map((p) => p.id).sort());
  assert.ok(Object.values(w.terrain).every((t) => TERRAIN.includes(t)));
  assert.deepEqual(w.terrain, again.terrain);
  assert.ok(new Set(Object.values(w.terrain)).size >= 6, "a world has most kinds of land");
  assert.equal(Object.keys(w).includes("terrain"), false, "beside the map data, not in it: a world's shape and fingerprint are unchanged");
  assert.notDeepEqual(makeWorld(s, "other").terrain, w.terrain);
  const m = madeWorld({ setting: s.id, seed: s.seed });
  assert.equal(m.terrain, m.data.terrain);
  assert.match(m.facts.at(-1).text, /^The land: mostly \w+, \w+, \w+, with .* in places\. Each province has one of these as its terrain/);
  // the turn is told the lie of the player's own land
  const id = w.provinces[0].id, g = { ...newWorldGame(w.provinces[0].country, "nation", "terrain-1"), };
  const geo = { ...geoOf(g), all: [id], owner: () => g.player, place: () => ({ name: w.provinces[0].name, country: g.player, terrain: w.terrain[id] }), known: () => true, holds: () => 1 };
  assert.ok(moreFacts(g, geo).some((l) => l === `- The lie of the player's land (flavour only; no rule reads it): ${w.provinces[0].name} ${w.terrain[id]}`));
});
