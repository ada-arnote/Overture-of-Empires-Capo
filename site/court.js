// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo's page for the second round of what the rules keep: home politics and unrest, what you know of others,
// scenes, the scale of play and your own means, the council convened, pacts and spheres, a scenario's own beats,
// and the map views that show them. The rules live in src/story (home.js, fog.js, scenes.js, scale.js, debate.js,
// pacts.js, views.js, beats.js); this file only shows them and takes orders. x is what the game page lends, as in
// realm.js, with: order(o) an order by card, ask(prompt, take, sheet) one call to the AI, asking(), askBox(),
// colour(code), refresh() paints the map again, bar() draws the top bar again.
import { CARES, moodOf, quellPlan, termsFor } from "../src/story/home.js";
import { fogLines, knowledge, seenGauge, seenWords, setFog } from "../src/story/fog.js";
import { chooseScene, openScene, readScene, scenePlan, sceneProblem, scenePrompt, sceneWith } from "../src/story/scenes.js";
import { MEANS, SCALES, meansOf, meansTarget, scaleProblem, switchScale } from "../src/story/scale.js";
import { debatePrompt, debaters, readDebate } from "../src/story/debate.js";
import { PACT, pactAnswer, pactOf, spheres, tributeOf } from "../src/story/pacts.js";
import { changed, claims, clauseWords, fronts, knownView, pactView, sphereView } from "../src/story/views.js";
import { PACE, paceOf, setPace } from "../src/story/rivals.js";
import { landsOf, rebelLand } from "../src/story/polity.js";
import { WHEN, keepScript } from "../src/story/beats.js";
import { oddsLine, partsLine } from "../src/story/check.js";
import { NEED, treatyName } from "../src/story/relations.js";
import { MODES } from "../src/story/turn.js";
import { plan } from "../src/story/more.js";
import { crosses } from "../src/story/line.js";

const rows = (x, items, empty) => {
  const ul = x.el("ul", undefined, "list");
  ul.append(...(items.length ? items : [empty]).map((t) => { const li = x.el("li"); li.append(...[t].flat().map((p) => (typeof p === "string" ? x.el("span", p) : p))); return li; }));
  return ul;
};
const line = (x, ...items) => { const r = x.el("div", undefined, "row"); r.append(...items); return r; };
const cap = (s) => `${s[0].toUpperCase()}${s.slice(1)}`;
const planned = (g, kind, sub, target) => (g.plans || []).some((p) => p.kind === kind && p.sub === sub && p.target === target && (g.actions || []).includes(p.text));
/** Give an order by card for one of these rules: it stands while its action does. */
const give = (x, p) => { plan(x.g(), p); x.act(p.text); };

// ---- what you know ----
/** One country as the player's side knows it, in a sentence. */
export function knownLine(x, c) {
  const g = x.g(), k = knowledge(g, c, x.near()), w = seenWords(g, c, k.tier), u = k.tier >= 2 && g.unrest?.[c];
  return `${x.name(c)}: ${k.word} (${k.why})${w ? `: ${w}` : ""}${u ? `; ${u.rising ? "a rising" : "unrest"} around ${u.who}` : ""}.`;
}
/** Whether the player's side knows a country well enough to read its answers before asking. */
export const reads = (x, c) => knowledge(x.g(), c, x.near()).tier >= 2;
/** Lines on what this side knows, for a chat or the council. */
export const knownFor = (x, codes) => fogLines(x.g(), [...codes, ...x.near()], x.near());

/** In place of the treaty answers, for a country known too little: the same orders, with no answer shown. */
export function dimBox(c, x) {
  if (reads(x, c)) return null;
  const g = x.g(), box = x.el("div"), row = x.el("div", undefined, "row"), k = knowledge(g, c, x.near()), has = g.treaties.find((t) => t.pair === [g.player, c].sort().join("|"))?.kind;
  for (const kind of Object.keys(NEED)) if (kind !== has) row.append(x.button(`Propose ${kind}`, () => x.order({ text: `Propose ${treatyName(kind)} to ${x.name(c)} (${c}).`, verb: "TREATY", target: c, detail: kind })));
  box.append(x.el("h3", "Treaties"), x.el("p", `${cap(k.word)}: ${k.why}. You know too little of ${x.name(c)} to read its answer before you ask. Talk with it in Chats, sign with it, or seat an Envoy on your council, and you will see more. You may still ask; the answer comes with the turn.`, "note"), row);
  return box;
}

// ---- the country sheet: home, yourself, what you know, pacts and spheres ----
/** What a rising a year old would take, in words: land handed back, a new country, or mandate. */
function left(x, u) {
  const g = x.g(), G = x.geo(), me = g.player, old = G.place(u.id)?.country, n = rebelLand(G, me, u.id).length;
  if (old !== me && G.holds(old) > 0 && G.holds(me) > 1 && !g.wars.some((w) => w.pair === [me, old].sort().join("|"))) return `it hands ${G.place(u.id).name} back to ${x.name(old)}`;
  return n ? `it founds a country of its own with ${n} of your province${n > 1 ? "s" : ""}` : "it costs you a step of mandate";
}
function unrestRows(x) {
  const g = x.g(), G = x.geo(), me = g.player, u = g.unrest?.[me];
  if (!u) return [x.el("p", "No unrest. When stability falls to shaken the rules name a figure and a province where trouble gathers; in revolt it is a rising.", "note")];
  const said = `${u.rising ? "A rising" : "Unrest"} in ${G.place(u.id)?.name || u.id} around ${u.who}, since ${x.fmtDate(u.since)}.${u.rising ? ` While it stands your country declares no war and makes no attack. A year unanswered, and ${left(x, u)}.` : ""}`;
  if (g.mode === "citizen") return [rows(x, [said]), x.el("p", "As a citizen you watch; the government answers, or does not.", "note")];
  const q = quellPlan(g, G), no = termsFor(g), parts = partsLine({ approach: null, parts: q.plan.parts.filter(([, n]) => n) });
  const terms = x.button(planned(g, "terms") ? "Terms: ordered" : "Meet their terms", () => (no ? x.toast(`${cap(no)}.`) : give(x, { kind: "terms", text: `Meet the terms of ${u.who}.` })));
  const move = x.button(planned(g, "quell") ? "Move against them: ordered" : "Move against them", () => give(x, { kind: "quell", text: `Move against ${u.who}, led by ${q.lead}.` }));
  return [rows(x, [said]),
    x.el("p", `Meet their terms: a step of treasury buys a step of stability${no ? ` (not now: ${no})` : ""}.`, "note"),
    x.el("p", `Move against them, led by ${q.lead}: skill ${q.plan.skill} against ${q.plan.difficulty}${parts ? `, ${parts}` : ""}: chance ${q.chance} of 100. Odds: ${oddsLine(q.chance)}. Clean: a step of stability. Costly: the same, and a step of mandate lost. Failed: a step of mandate lost${u.rising ? "" : ", and a step of stability too"}.`, "note"),
    line(x, terms, move)];
}

function pactRows(x) {
  const g = x.g(), G = x.geo(), me = g.player, mine = (g.pacts || []).filter((p) => p.a === me || p.b === me), near = new Set([me, ...x.near()]);
  const list = mine.map((p) => (p.kind === "peace" ? `A pact of non-aggression with ${x.name(p.a === me ? p.b : p.a)}, until ${Number(p.since.slice(0, 4)) + PACT.years}. War between you would be a breach.`
    : p.a === me ? `${x.name(p.b)} pays you tribute, since ${x.fmtDate(p.since)}.`
      : [`You pay tribute to ${x.name(p.a)}, since ${x.fmtDate(p.since)}. It holds your treasury a step lower.`, ...(g.mode === "citizen" ? [] : [x.button(planned(g, "pact", "stop", p.a) ? "Ordered" : "Stop paying", () => give(x, { kind: "pact", sub: "stop", target: p.a, text: `Stop paying tribute to ${x.name(p.a)} (${p.a}).` }))])]));
  const around = [...spheres(g, G)].filter(([p, l]) => near.has(p) || l.some((c) => near.has(c))).map(([p, l]) => `${p === me ? "Your sphere" : `${x.name(p)}'s sphere`}: ${l.map(x.name).join(", ")}.`);
  // round 3: the clauses that bind the countries beside you, and the countries founded in this game
  const others = (g.pacts || []).filter((p) => p.a !== me && p.b !== me && (near.has(p.a) || near.has(p.b))).slice(0, 12).map((p) => (p.kind === "peace" ? `${x.name(p.a)} and ${x.name(p.b)}: a pact of non-aggression until ${Number(p.since.slice(0, 4)) + PACT.years}.` : `${x.name(p.b)} pays tribute to ${x.name(p.a)}, since ${x.fmtDate(p.since)}.`));
  const born = Object.entries(landsOf(g)).map(([c, l]) => `${l.name} (${c}): founded by a rising in ${x.name(l.from)}${l.since ? `, ${x.fmtDate(l.since)}` : ""}. ${G.holds(c) ? `It holds ${G.holds(c)} province${G.holds(c) > 1 ? "s" : ""}.` : "It has since lost its land."}`);
  return [rows(x, list, "No pact binds you. Propose one from a foreign province's card."),
    x.el("h3", "Pacts among your neighbours"), rows(x, others, "None. Other countries bind each other by the same rules you do; the map view \"pacts and tribute\" shows them all."),
    ...(born.length ? [x.el("h3", "Countries founded in this game"), rows(x, born), x.el("p", "A rising left a year unanswered founds a country of its own from the provinces around it. A truce of two years follows; after it, the country it left holds a cause.", "note")] : []),
    x.el("h3", "Spheres of influence"), rows(x, around, "None near you."),
    x.el("p", "A country stands in the sphere of a defence or alliance partner whose might is at least three above its own, and of anyone it pays tribute to. Its patron shields it in a crisis.", "note")];
}

/** The parts of the sheet under the country's name that round two adds. */
export function realmMore(x) {
  const g = x.g(), { el } = x, known = [...new Set([...x.near(), ...g.wars.concat(g.treaties).filter((t) => t.pair.split("|").includes(g.player)).map((t) => t.pair.split("|").find((c) => c !== g.player)), ...Object.keys(g.seen || {})])];
  const e = g.self?.p, target = meansTarget(g), mine = meansOf(g);
  return [
    el("h3", "At home"), ...unrestRows(x),
    ...(g.mode === "nation" ? [] : [el("h3", "Yourself"), rows(x, [`Your own means: ${MEANS[mine]} (${mine + 1} of 5)${e?.[2] ? `. Since ${x.fmtDate(e[1])}: ${e[2]}` : ""}.`]),
      el("p", `Kept by the rules, like the country's gauges. Once a year it moves a step toward where your standing and the treasury put it (now ${MEANS[target]}); a scene lived on your own can move it too. Nothing is bought with it: it weighs in scenes and in what your circle thinks of you.`, "note")]),
    el("h3", "A scene"), el("p", "Once a turn you may live a moment in person: with someone of your council, another country's envoy, or on your own. The AI writes the room and the choices; the rules show the odds and decide.", "note"),
    x.button(sceneProblem(g) ? "This turn's scene is lived" : g.scene?.turn === g.turn ? "Go back to the scene" : "Play a scene", () => x.open("scene")),
    el("h3", "What you know of others"), rows(x, known.map((c) => knownLine(x, c)), "Nobody near you."),
    el("p", "Clear: your own country and your defence and alliance partners. Reported: neighbours, trade partners, enemies, and anyone you talked with this year. Rumoured: old dealings; a rumour may be a step off. Dark: the rest. An Envoy on your council lifts each a step. The map view \"what you know\" shows it.", "note"),
    el("h3", "Pacts"), ...pactRows(x),
  ];
}

// ---- the scene ----
let sceneDraft = { key: "", ask: "" };
export function sceneSheet(box, x) {
  const g = x.g(), G = x.geo(), { el, button } = x, sc = g.scene?.turn === g.turn ? g.scene : null;
  box.append(el("h2", sc ? sc.title : "A scene"));
  if (x.asking()?.where === "scene") { box.append(x.askBox()); return; }
  if (sc?.picked) {
    const c = sc.choices.find((k) => k.k === sc.picked), p = scenePlan(g, G, sc.picked), band = sc.beat.band, bold = sc.beat.approach?.[0] === "bold";
    const change = band === "clean" ? `${cap(p.stake)} rises a step.` : band === "costly" ? `${cap(p.stake)} rises a step, and it costs ${p.price}.` : bold ? `${cap(p.stake)} falls a step.` : "Nothing: you were careful.";
    box.append(el("p", `${sc.where}. With ${sc.with.name}.`, "note"), el("p", sc.intro), el("h3", `You chose: ${c.label}`), el("p", `${cap(band)}. ${sc.end}`),
      el("p", `The check: chance ${sc.beat.chance} of 100, drew ${sc.beat.roll}. What it changes, when the turn ends: ${change} The story carries on from here next turn.`, "note"), button("Back to your country", () => x.open("realm")));
    return;
  }
  if (sc) {
    box.append(el("p", `${sc.where}. With ${sc.with.name}.`, "note"), el("p", sc.intro), el("h3", "What do you do?"));
    for (const c of sc.choices) {
      const p = scenePlan(g, G, c.k), parts = partsLine({ approach: p.plan.approach, parts: p.plan.parts.filter(([, n]) => n) }), card = el("ol", undefined, "feed"), li = el("li");
      li.append(el("div", c.bold ? "Bold" : "Careful", "note"), el("b", c.label), el("p", `Chance ${p.chance} of 100${parts ? ` (50, ${parts})` : ""}. Odds: ${p.odds}.`),
        el("p", `Clean: ${p.stake} rises a step. Costly: the same, at the price of ${p.price}. Failed: ${c.bold ? `${p.stake} falls a step` : "nothing lost"}.`, "note"),
        button("Choose", () => { chooseScene(g, G, c.k); x.save(); x.open("scene"); }, "go"));
      card.append(li); box.append(card);
    }
    box.append(el("p", "The endings are already written; the check picks one the moment you choose, and it cannot be chosen again. A scene changes no land, war, treaty or office.", "note"), button("Walk away", () => { g.scene = null; x.save(); x.open("realm"); }));
    return;
  }
  const withs = sceneWith(g, G, x.near()), pick = el("select", undefined, "plain"), ask = Object.assign(el("textarea", undefined, "plain"), { rows: 3, maxLength: 400, value: sceneDraft.ask, placeholder: "What do you hope to do? For example: Find out who leaked the plan, without losing her." });
  pick.append(...withs.map((w) => new Option(w.kind === "seat" ? `${w.name} (${w.key})` : cap(w.name), `${w.kind}:${w.key}`)));
  if ([...pick.options].some((o) => o.value === sceneDraft.key)) pick.value = sceneDraft.key;
  pick.setAttribute("aria-label", "Who the scene is with"); ask.setAttribute("aria-label", "What you hope to do in the scene");
  pick.onchange = () => { sceneDraft.key = pick.value; }; ask.oninput = () => { sceneDraft.ask = ask.value; };
  const go = button("Open the scene", () => {
    const why = sceneProblem(g), w = withs.find((o) => `${o.kind}:${o.key}` === pick.value), hope = ask.value.trim();
    if (why || !w) return x.toast(why || "Choose who the scene is with.");
    if (crosses(hope)) return x.toast("Refused: nothing sexual involving minors.");
    x.ask(scenePrompt(g, { name: x.name }, w, hope), (text) => { const r = readScene(text); if (!r.ok) return r.why; openScene(g, w, hope, r.scene); sceneDraft = { key: "", ask: "" }; return ""; }, "scene");
  }, "go");
  box.append(el("p", "A moment lived in person, once a turn. The AI writes where it is, how it opens, two or three things you could do and how each could end. The rules set the odds from what they keep (favour, relations, mandate, your means), show them before you choose, and roll once.", "note"),
    ...(sceneProblem(g) ? [el("p", sceneProblem(g), "warn")] : withs.length ? [pick, ask, line(x, go)] : [el("p", "Nobody to share a scene with yet: form your council in Advisors first.", "note")]));
}

// ---- advisors: what each cares for, and the council convened ----
export function councilMore(x) {
  const g = x.g(), { el, button } = x, seated = Object.entries(g.council?.seats || {}).filter(([, m]) => m);
  if (!seated.length) return [];
  const moods = seated.map(([seat, m]) => { const { mood, parts } = moodOf(g, seat, m); return `${m.name} cares for ${parts.map(([k, v, why]) => `${CARES[k][0]} (${v > 0 ? "pleased" : v < 0 ? "displeased" : "easy"}: ${why})`).join(" and ")}. Favour is heading ${mood > m.favour ? "up" : mood < m.favour ? "down" : "nowhere"}.`; });
  const who = debaters(g), last = (g.counsel || []).filter((c) => c.answers?.length).slice(-1)[0];
  const convene = button("Convene them", () => {
    const q = (document.getElementById("council-question")?.value || "").trim();
    if (!q) return x.toast("Write the decision to argue in the Ask box above.");
    if (crosses(q)) return x.toast("Refused: nothing sexual involving minors.");
    x.ask(debatePrompt(g, { name: x.name }, who, q, knownFor(x, [])), (text) => { const d = readDebate(text, who); if (!d) return "No debate could be read: at least two advisers must open with a SAYS line."; g.counsel = [...(g.counsel || []), { turn: g.turn, question: q, ...d }].slice(-30); return ""; }, "advisors");
  }, "go");
  return [
    el("h3", "What they care for"), rows(x, moods), el("p", "Each seat cares for two things: one that comes with the office, one their own. Every six months favour moves a step toward the mood those make. Mood alone never makes anyone resign.", "note"),
    el("h3", "Convene the council"), ...(who.length ? [el("p", `The rules seat the ones who see the country most differently: ${who.map(([, m]) => m.name).join(", ")}. They argue the decision written in the Ask box, and answer each other. Words only.`, "note"), convene] : [el("p", "Two seats must be filled before anyone can argue.", "note")]),
    ...(last ? [el("h3", `They answered each other (turn ${last.turn})`), rows(x, last.answers.map((a) => `${a.name}: ${a.text}`))] : []),
  ];
}

// ---- the Game sheet: the scale of play, and the scenario's own beats ----
let beatDraft = { text: "", when: "" };
export function gameMore(x) {
  const g = x.g(), { el, button } = x, scale = el("div", undefined, "row"), nm = Object.assign(el("input", undefined, "plain"), { type: "text", maxLength: 80, placeholder: "Your character's name, if you step down to a person", value: g.character?.name || "" });
  nm.setAttribute("aria-label", "Your character's name");
  for (const k of SCALES) {
    const b = button(MODES[k][0], () => {
      const why = scaleProblem(g, k); if (why) return x.toast(why);
      if (crosses(nm.value)) return x.toast("Refused: nothing sexual involving minors.");
      x.sure(`Play on as ${MODES[k][1]}? Your country and its past stay as they are.${k === "citizen" ? " A citizen commands nothing: orders by card are dropped." : ""}`, "Play on", () => {
        switchScale(g, k); if (k !== "nation" && nm.value.trim() && !g.character.name) g.character.name = nm.value.trim().slice(0, 80);
        x.save(); x.bar(); x.open("game"); x.toast(`You now play as ${MODES[k][0].toLowerCase()}.`);
      });
    });
    b.setAttribute("aria-pressed", String(g.mode === k)); scale.append(b);
  }
  const script = g.script || [], text = Object.assign(el("textarea", undefined, "plain"), { rows: 2, maxLength: 240, value: beatDraft.text, placeholder: "A moment you script, for example: The old marshal dies, and the army mourns in the streets." }), when = el("select", undefined, "plain");
  when.append(new Option("whenever", ""), ...Object.keys(WHEN).map((k) => new Option(`when: ${k}`, k))); when.value = beatDraft.when;
  text.setAttribute("aria-label", "A scripted beat"); when.setAttribute("aria-label", "When it may come");
  text.oninput = () => { beatDraft.text = text.value; }; when.onchange = () => { beatDraft.when = when.value; };
  const add = button("Add the beat", () => {
    const got = keepScript([...script.map(({ text: t, when: w, from }) => ({ text: t, when: w, from })), { text: text.value, when: when.value ? [when.value] : [], from: g.turn }]);
    if (got.length === script.length) return x.toast(script.length >= 12 ? "Twelve beats at most." : "Write the moment in a sentence.");
    // ids already played keep their place: new beats go last
    g.script = got; beatDraft = { text: "", when: "" }; x.save(); x.open("game");
  });
  // fog of war, a setting on by default (ruling 149)
  const fog = el("label", undefined, "note"), box = Object.assign(el("input"), { type: "checkbox", checked: g.fog !== false });
  box.onchange = () => { x.toast(setFog(g, box.checked)); x.save(); x.refresh(); x.open("game"); };
  fog.append(box, " Fog of war: you see other countries only as well as you know them (neighbours, partners, enemies, talks). Off, every country's state and answers are in view.");
  // round 3: how restless the world is (rivals.js)
  const pace = el("div", undefined, "row");
  for (const [k, p] of Object.entries(PACE)) { const b = button(p.title, () => { x.toast(setPace(g, k)); x.save(); x.open("game"); }); b.setAttribute("aria-pressed", String(paceOf(g) === k)); pace.append(b); }
  return [
    el("h3", "Fog of war"), fog,
    el("h3", "How restless the world is"), el("p", `Now ${PACE[paceOf(g)].title.toLowerCase()}: ${PACE[paceOf(g)].says}. It sets how often other countries go to war, bind each other by pacts and tribute, and open a crisis, when the rules move them. It never changes an answer or a chance.`, "note"), pace,
    el("h3", "How you play"), el("p", `You play as ${MODES[g.mode][1]}. You may change the scale once a turn: standing goes to the new scale's own and your circle follows, each member to the matching seat.`, "note"), scale, ...(g.character?.name ? [] : [nm]),
    el("h3", "This scenario's own beats"), el("p", "Moments you script. Each comes once, on the first turn its condition holds, ahead of the rules' own beats; the AI writes it, and it changes no fact. They are saved with the scenario.", "note"),
    ...(script.length ? [rows(x, script.map((b, i) => [`${b.text} (${b.when.length ? `when: ${b.when.join(", ")}` : "whenever"}${(g.beats || []).some(([id]) => id === b.id) ? "; played" : ""})`, button("Remove", () => { g.script = script.filter((_, j) => j !== i); x.save(); x.open("game"); })]))] : []),
    text, line(x, when, add),
  ];
}

// ---- a foreign province's card: its terrain, what you know of its holder, and the clauses you could ask ----
export function cardMore(p, x) {
  const g = x.g(), G = x.geo(), me = g.player, b = G.owner(p.id), out = [];
  if (p.terrain) out.push(x.el("p", `${cap(p.terrain)} country.`, "note"));
  if (b === me) { if (g.unrest?.[me]?.id === p.id) out.push(x.el("p", `${g.unrest[me].rising ? "A rising" : "Unrest"} gathers here around ${g.unrest[me].who}.`, "warn")); return out; }
  // folded away until asked for, so the card stays short on a phone
  const more = x.el("details"), sum = x.el("summary", `What you know of ${x.name(b)}${g.mode === "citizen" ? "" : ", and pacts"}`, "note");
  sum.style.cursor = "pointer"; more.append(sum, x.el("p", knownLine(x, b), "note")); out.push(more);
  { const l = landsOf(g)[b], said = [l && `Founded by a rising in ${x.name(l.from)}${l.since ? `, ${x.fmtDate(l.since)}` : ""}.`, clauseWords(g, b, x.name, PACT.years)].filter(Boolean).join(" "); if (said) more.append(x.el("p", said, "note")); } // round 3
  if (g.mode === "citizen") return out;
  const box = x.el("div"), row = x.el("div", undefined, "row"), see = reads(x, b), notes = [];
  for (const [sub, label, text] of [["peace", "Non-aggression", `Propose a pact of non-aggression to ${x.name(b)} (${b}).`], ["tribute", "Tribute", `Demand a yearly tribute of ${x.name(b)} (${b}).`]]) {
    const a = pactAnswer(g, G, me, b, sub);
    if (a.no) continue;
    row.append(x.button(planned(g, "pact", sub, b) ? `${label}: ordered` : see ? `${label}: would ${a.ok ? "agree" : "refuse"}` : `${label}: ask`, () => give(x, { kind: "pact", sub, target: b, text })));
    if (see) notes.push(`${label}: ${a.why}.`);
  }
  const stands = pactOf(g, me, b) ? `A pact of non-aggression stands until ${Number(pactOf(g, me, b).since.slice(0, 4)) + PACT.years}. ` : tributeOf(g, me, b) ? `${x.name(b)} pays you tribute. ` : tributeOf(g, b, me) ? `You pay ${x.name(b)} tribute. ` : "";
  if (row.children.length || stands) { box.append(x.el("h3", "Pacts"), x.el("p", `${stands}${notes.join(" ")}${row.children.length ? " A pact of non-aggression lasts five years, and war between you would be a breach. A refused demand for tribute costs you a step of mandate and of relations." : ""}`.trim(), "note"), row); more.append(box); }
  return out;
}

// ---- map views ----
const MUTE = "#39434a", MINE = "#5b6a74", STATE = ["#b2452f", "#c98a3c", "#5d6b6e", "#4d8f77", "#3f9a5c"], TIER = ["#2a3236", "#6a6447", "#4a7fa8", "#d3dbe4"];
export const VIEWS = {
  fronts: ["Map: war fronts", { yours: ["#dfe5ec", "your side of a front"], foe: ["#c9553f", "your enemy's side"], other: ["#d9a43a", "other wars"] }],
  changed: ["Map: land changed", { won: ["#4f9a6b", "gained by you"], lost: ["#c9553f", "lost by you"], other: ["#d9a43a", "changed hands elsewhere"] }],
  claims: ["Map: claims", { yours: ["#d9a43a", "land you claim"], onyou: ["#c9553f", "your land, claimed by another"], other: ["#8d7f66", "other disputed land"] }],
  spheres: ["Map: spheres", { patron: ["", "a patron, in its own colour"], member: ["", "in its sphere, in a paler shade"] }],
  pacts: ["Map: pacts and tribute", { yours: ["#4f9a6b", "a pact of non-aggression with you"], pays: ["#d9a43a", "pays you tribute"], paid: ["#c9553f", "you pay it tribute"], bound: ["#4a7fa8", "bound by a pact with another"], tribute: ["#8d7f66", "pays tribute to another"] }],
  known: ["Map: what you know", { 3: [TIER[3], "clear"], 2: [TIER[2], "reported"], 1: [TIER[1], "rumoured"], 0: [TIER[0], "dark"] }],
  state: ["", { 0: [STATE[0], "in revolt"], 1: [STATE[1], "shaken"], 2: [STATE[2], "steady"], 3: [STATE[3], "calm"], 4: [STATE[4], "united"], x: [TIER[0], "unknown to you"], u: ["#6e1d12", "unrest"] }],
};
let memo = { key: "", data: null }, beside = { key: "", list: [] };
/** The player's neighbours, worked out once for each state of the map: a view asks for them for every country. */
function nearOf(x) { const g = x.g(), key = `${g.seed}|${g.turn}|${Object.entries(g.owners).join()}`; if (beside.key !== key) beside = { key, list: x.near() }; return beside.list; }
/** What a view shows, worked out once for each state of the game. */
function dataFor(view, x) {
  const g = x.g(), G = x.geo(), key = `${view}|${g.seed}|${g.turn}|${g.date}|${g.mode}|${g.wars.length}|${g.treaties.length}|${(g.pacts || []).length}|${Object.entries(g.owners).join()}|${Object.keys(g.unrest || {}).join()}|${Object.keys(g.seen || {}).join()}|${g.council?.seats?.foreign ? 1 : 0}`;
  if (memo.key === key) return memo.data;
  const data = view === "fronts" ? fronts(g, G) : view === "changed" ? changed(g, G) : view === "claims" ? claims(g, G) : view === "spheres" ? new Set(spheres(g, G).keys()) : view === "pacts" ? pactView(g) : view === "state" ? new Map(Object.entries(g.unrest || {}).filter(([c]) => reads(x, c)).map(([, u]) => [u.id, "u"])) : null;
  memo = { key, data };
  return data;
}
/** A country's fill on one of these views, or "" when the view is not one of them. */
export function viewFill(view, x, code) {
  const g = x.g();
  if (!g || !VIEWS[view]) return "";
  if (view === "known") return TIER[knownView(g, code, nearOf(x))];
  if (view === "state") { const k = knowledge(g, code, nearOf(x)).tier, n = seenGauge(g, code, "s", k)[0]; return n === null ? TIER[0] : STATE[n]; }
  if (view === "spheres") { const v = sphereView(g, x.geo(), code, dataFor(view, x)); return v.role === "patron" ? x.colour(v.patron) : v.role === "member" ? `color-mix(in srgb, ${x.colour(v.patron)} 50%, #cfd6da)` : MUTE; }
  if (view === "pacts") { const k = dataFor(view, x).get(code); return k ? VIEWS.pacts[1][k][0] : code === g.player ? MINE : MUTE; }
  return code === g.player ? MINE : MUTE;
}
/** A single province's tint on one of these views, or "". */
export function viewTint(view, x, id) {
  if (!x.g() || !["fronts", "changed", "claims", "state"].includes(view)) return "";
  const k = dataFor(view, x).get(id);
  return k ? VIEWS[view][1][k][0] : "";
}
/** Add these views to the map's list, and keep a legend under it for the view in hand. */
export function viewsInit(select, x, shown) {
  for (const [k, [title]] of Object.entries(VIEWS)) if (title) select.append(new Option(title, k));
  const box = x.el("div", undefined, "glass note"); box.id = "legend"; box.setAttribute("aria-live", "polite");
  Object.assign(box.style, { position: "fixed", right: "8px", zIndex: "4", padding: "6px 10px", margin: "0", maxWidth: "210px", display: "none" });
  select.after(box);
  Object.assign(document.getElementById("card").style, { maxHeight: "calc(100dvh - 300px)", overflowY: "auto" }); // a long card scrolls inside itself, never off the screen
  const draw = () => {
    const v = VIEWS[shown()], g = x.g(), small = matchMedia("(max-width: 640px)").matches;
    box.replaceChildren();
    if (!v || !g) { box.style.display = "none"; return; }
    for (const [, [colour, words]] of Object.entries(v[1])) {
      const item = x.el("div"), dot = x.el("span");
      Object.assign(dot.style, { display: "inline-block", width: "10px", height: "10px", marginRight: "6px", borderRadius: "2px", background: colour || "linear-gradient(90deg, #8a5fb5, #cfd6da)" });
      item.append(dot, words); box.append(item);
    }
    Object.assign(box.style, { display: "block", top: small ? "auto" : "118px", bottom: small ? "276px" : "auto" });
  };
  select.addEventListener("change", draw);
  return draw;
}
