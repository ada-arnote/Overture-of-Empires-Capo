// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo's page for what the rules keep about your country: its three gauges, your ambition, an open crisis, causes
// for war, the press, the reckoning, and every past turn in full. The rules live in src/story (state.js,
// crisis.js, ambitions.js, beats.js); this file only shows them and takes orders. x is what the game page lends:
// {g() the game, geo(), name(code), near() neighbouring countries, el, button, fmtDate, save(), toast(text),
// open(sheet), act(text) adds an action, drop(text) removes one}.
import { GAUGES, causeOf, gaugeOf, gaugeWord } from "../src/story/state.js";
import { demand, demandAnswer } from "../src/story/crisis.js";
import { ambitionsFor, chooseAmbition, progress, reckoning } from "../src/story/ambitions.js";
import { papers } from "../src/story/beats.js";
import { NOTE, NOTE2 } from "../src/story/more.js";
import { cardMore, reads, realmMore, sceneSheet } from "./court.js";
export { backMore, keepMore } from "../src/story/more.js";
export { councilMore, dimBox, gameMore, knownFor, viewFill, viewTint, viewsInit } from "./court.js";
/** The words a converted game is told, once: which round of rules it was saved before. */
export const noteOf = (g) => (g.told === 2 ? NOTE2 : NOTE);
/** The sheets this lane adds to the page: the country's, and the scene. */
export const moreSheets = (x) => ({ realm: (b) => realmSheet(b, x), scene: (b) => sceneSheet(b, x) });

const rows = (x, items, empty) => {
  const ul = x.el("ul", undefined, "list");
  ul.append(...(items.length ? items : [empty]).map((t) => { const li = x.el("li"); li.append(...[t].flat().map((p) => (typeof p === "string" ? x.el("span", p) : p))); return li; }));
  return ul;
};
const facing = (g, me) => g.crisis && g.crisis.b === me && g.mode !== "citizen";

/** The crisis in words, with the answer buttons when it is the player's to answer. */
function crisisRow(x, back) {
  const g = x.g(), k = g.crisis, G = x.geo(), place = G.place(k.id).name, a = demandAnswer(g, G, k.a, k.b, k.id);
  const said = `${x.name(k.a)} demands ${place} from ${x.name(k.b)}, to be answered by ${x.fmtDate(k.due)}.`;
  if (!facing(g, g.player)) return [`${said} ${a.no ? "It may be overtaken by events." : reads(x, k.b) ? `By the rules today ${x.name(k.b)} would ${a.ok ? "yield" : "refuse"} (${a.why}).` : `You know too little of ${x.name(k.b)} to read its answer.`}`];
  const pick = (v, t) => { const b = x.button(t, () => { if (v) k.answer = v; else delete k.answer; x.save(); x.open(back); }); b.setAttribute("aria-pressed", String((k.answer || "") === v)); return b; };
  return [`${said} The answer is yours. Refuse, and they lose face but keep a grievance; yield, and the province is theirs on that day.`, pick("", "Refuse"), pick("yield", "Yield")];
}

/** The sheet under the country's name. */
export function realmSheet(box, x) {
  const g = x.g(), G = x.geo(), me = g.player, { el, button } = x, again = () => { x.save(); x.open("realm"); }, p = progress(g, G);
  const gauges = Object.entries(GAUGES).map(([k, [title]]) => { const e = g.gauge?.[me]?.[k], n = gaugeOf(g, me, k); return `${title}: ${gaugeWord(k, n)} (${n + 1} of 5)${e?.[2] ? `. Since ${x.fmtDate(e[1])}: ${e[2]}` : ""}.`; });
  const open = ambitionsFor(g, G).map((a) => [`${a.title}. ${a.said}.`, button("Choose", () => { chooseAmbition(g, G, a.id); again(); })]);
  const mine = x.near().map((c) => [c, causeOf(g, G, me, c), causeOf(g, G, c, me)]).filter(([, a, b]) => a || b).map(([c, a, b]) => `${x.name(c)}: ${[a && `you have a cause (${a})`, b && `it has a cause against you (${b})`].filter(Boolean).join("; ")}.`);
  const tale = reckoning(g, G, x.fmtDate);
  box.append(el("h2", x.name(me)), el("p", "Kept by the rules, never by the AI. The AI is told all of it each turn and writes the story around it.", "note"),
    el("h3", "The state of the country"), rows(x, gauges),
    el("p", "Each gauge moves one step a turn at most, always for a reason. In revolt: no war and no attack. An empty treasury: no new war. A year at war drains the treasury; treaties fill it in peace. A war begun without a cause shakes stability.", "note"),
    ...realmMore(x),
    el("h3", "Your ambition"), ...(p ? [rows(x, [[`${p.title}. ${p.said}: ${p.have} of ${p.need}.`, button("Give it up", () => { g.goal = null; again(); })]])] : [el("p", "Choose a goal. The rules count it, and only they can call it met.", "note"), rows(x, open, "Nothing left to choose.")]),
    ...(g.done?.length ? [rows(x, g.done.map((d) => `Met on ${x.fmtDate(d.date)}: ${d.said}.`))] : []),
    el("h3", "Crisis"), g.crisis ? rows(x, [crisisRow(x, "realm")]) : el("p", "None open. You can demand a province beside your own from its card. After quiet months the rules may open a crisis over land that changed hands or is in dispute.", "note"),
    el("h3", "Causes for war"), rows(x, mine, "None with your neighbours."),
    el("h3", "The press"), rows(x, papers(g, G).map(([n, s]) => `${n[0].toUpperCase()}${n.slice(1)}: ${s}.`)),
    el("h3", "The reckoning"), rows(x, tale), button("Copy", async () => { try { await navigator.clipboard.writeText(tale.join("\n")); x.toast("Copied."); } catch { x.toast("This browser would not copy it."); } }));
}

/** What should be seen at the top of Actions: a converted game's note, a demand to answer, an ambition to choose. */
export function notices(x) {
  const g = x.g(), out = [];
  // a demand whose action was removed was never made
  if (g.crisis?.by === "you" && g.crisis.since === g.date && !(g.actions || []).includes(g.crisis.text)) g.crisis = null;
  if (g.plans?.length) g.plans = g.plans.filter((p) => (g.actions || []).includes(p.text));
  if (g.told) out.push(x.el("p", noteOf(g), "warn"), x.button("Understood", () => { delete g.told; x.save(); x.open("actions"); }));
  if (facing(g, g.player)) out.push(x.el("h3", "A demand on you"), rows(x, [crisisRow(x, "actions")]));
  if (g.unrest?.[g.player] && g.mode !== "citizen" && !g.plans?.length) out.push(x.el("p", `${g.unrest[g.player].rising ? "A rising" : "Unrest"} at home, around ${g.unrest[g.player].who}.`, "warn"), x.button("Answer it", () => x.open("realm")));
  if (!g.goal && !g.done?.length) out.push(x.button("Choose an ambition", () => x.open("realm")));
  return out;
}

/** Everything this lane adds to a province's card: terrain, what is known of its holder, a demand, pacts. */
export const cardExtras = (p, x) => [...cardMore(p, x), ...[demandBox(p, x)].filter(Boolean)];

/** On a foreign province's card: what its holder would answer to a demand for it, and the order. Null when it cannot be asked. */
export function demandBox(p, x) {
  const g = x.g(), G = x.geo(), me = g.player, b = G.owner(p.id);
  if (g.mode === "citizen" || b === me || ![...G.neighbours(p.id), ...G.across(p.id)].some((n) => G.owner(n) === me)) return null;
  const a = demandAnswer(g, G, me, b, p.id), box = x.el("div"), text = `Demand ${p.name} (${p.id}) from ${x.name(b)}, to be answered in a month.`;
  if (a.no) return null;
  box.append(x.el("h3", "Demand"), x.el("p", `Its answer, by the rules: would ${a.ok ? "yield" : "refuse"} (${a.why}). A refusal costs you a step of mandate and of relations.`, "note"),
    x.button(g.crisis ? "A crisis is already open" : "Demand it", () => { const r = demand(g, G, p.id, text); if (!r.ok) return x.toast(r.why); x.act(text); }));
  return box;
}

/** Every turn the game still holds, newest first, each opening to its actions, events, press and receipt. */
export function turnsTab(box, x) {
  const g = x.g(), { el } = x;
  if (!g.log.length) { box.append(el("p", "Nothing yet.", "note")); return; }
  box.append(el("p", "Every turn the game still holds, in full. Open one to read it again.", "note"), ...g.log.slice().reverse().map((t) => {
    const d = el("details"), s = el("summary", `Turn ${t.turn || "?"}, ${x.fmtDate(t.from)} to ${x.fmtDate(t.to)}: ${t.summary || `${t.events.length} events`}`);
    d.append(s, ...(t.actions?.length ? [el("p", `You: ${t.actions.join(" ")}`, "note")] : []), ...t.events.map((e) => el("p", `${x.fmtDate(e.date)}, ${x.name(e.at)}. ${e.text}`)),
      ...(t.news || []).map((n) => el("p", `${n.outlet}: ${n.headline}. ${n.text}`, "note")), rows(x, (t.receipt || []).map((r) => `${r.ok ? "" : "Refused. "}${r.text}.`), "The rules decided nothing."));
    return d;
  }));
}


