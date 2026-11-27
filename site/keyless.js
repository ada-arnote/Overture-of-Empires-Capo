// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo with no AI, as a game on its own terms (cold review 3, fixes 6 to 8). This file only shows and takes
// orders; the rules live in src/story (gazette.js, pressure.js, ambitions.js, relations.js).
//   the gazette: a turn the rules moved, told as a short piece of prose, with the sums behind "Why";
//   pressure: a border incident and a partner's call to arms, answered from Actions;
//   war from the province card: declare one or join one, with the cause, the sides and the odds before the order;
//   what a treaty does, in numbers, and the player's pledged partners edged in green on the map;
//   an ending: the moment an ambition is met, the next one offered, and the end of a country.
// x is what the game page lends (as site/realm.js): {g(), geo(), name(code), el, button, fmtDate, save(), toast(),
// open(sheet), order(o), bar(), refresh(), back(), fresh(), reports(entry)}.
import { gazette, wordDate } from "../src/story/gazette.js";
import { papers } from "../src/story/beats.js";
import { AMBITIONS, ambitionsFor, chooseAmbition, progress, reckoning } from "../src/story/ambitions.js";
import { protestAnswer, standBy } from "../src/story/pressure.js";
import { causeOf, gaugeOf } from "../src/story/state.js";
import { pledges, treatyName } from "../src/story/relations.js";
import { pactOf } from "../src/story/pacts.js";
import { strengthOf, truceUntil } from "../src/story/war.js";
import { atWar, attackPlan, treatiesOf, treatyOf, warsOf } from "../src/story/worldrules.js";
import { oddsLine } from "../src/story/check.js";
import { fictionTag } from "./accept.js";

const words = (t) => String(t).replace(/\b(\d{4}-\d{2}(?:-\d{2})?)\b/g, (d) => wordDate(d)); // dates in words, wherever the receipt wrote them as numbers
const facing = (g) => g.mode !== "citizen";

// ---- the gazette ----
/** What waits for the player's answer, as [words, where to answer it]. */
function waiting(x) {
  const g = x.g(), me = g.player, out = [];
  if (!facing(g)) return out;
  if (g.crisis?.b === me) out.push([`${x.name(g.crisis.a)} demands ${x.geo().place(g.crisis.id).name}. Your answer is due by ${x.fmtDate(g.crisis.due)}.`, "actions"]);
  if (g.due) out.push([`${x.name(g.due.from)} demands a yearly tribute. Pay or refuse before this turn ends.`, "actions"]);
  if (g.incident) out.push([`A border incident with ${x.name(g.incident.from)} waits for your answer.`, "actions"]);
  if (g.call) out.push([`${x.name(g.call.from)} has called you to its war against ${x.name(g.call.on)}.`, "actions"]);
  if (g.unrest?.[me]) out.push([`${g.unrest[me].rising ? "A rising" : "Unrest"} at home, around ${g.unrest[me].who}.`, "realm"]);
  if (g.offers.length) out.push([`${g.offers.length === 1 ? "An offer waits" : `${g.offers.length} offers wait`} for your answer.`, "actions"]);
  return out;
}

/** The receipt as a list: a tick for what went your way, a cross for a refusal or a failed check, a dot for news. */
function receiptList(entry, x) {
  const g = x.g(), list = x.el("ul", undefined, "list");
  const kind = (r) => (r.offer || r.press || r.call || r.incident ? "news" : !r.ok ? "no" : r.check?.band === "failed" ? "lost" : r.country === g.player && (r.check || r.fact) ? "yes" : "news");
  list.append(...(entry.receipt || []).map((r) => { const k = kind(r), li = x.el("li", undefined, k); li.append(x.el("span", { yes: "✓", no: "✗", lost: "✗", news: "•" }[k], "mark"), x.el("span", `${words(r.text).replace(/[.!?]$/, "")}.`)); return li; }));
  return list;
}

/** The Ledger's first tab for a turn the rules moved alone: the gazette, what waits for an answer, and the sums behind Why. */
export function gazetteView(box, entry, x) {
  const g = x.g(), { el, button } = x, z = gazette(g, entry, x.geo()), sheet = el("article", undefined, "gazette"), head = el("p", undefined, "masthead"), latest = entry === g.log[g.log.length - 1];
  head.append(el("b", papers(g, x.geo())[0][0].replace(/^the /, "The ")), " ", fictionTag(el), el("small", `${x.fmtDate(entry.from)} to ${x.fmtDate(entry.to)}. Written by the rules from what happened; no AI.`));
  sheet.append(head, el("h3", x.name(g.player)), el("p", z.home.join(" ")));
  if (z.abroad.length) sheet.append(el("h3", "Abroad"), el("p", `${z.abroad.join(" ")}${z.more ? ` And ${z.more} lesser matter${z.more > 1 ? "s" : ""}, listed under Why.` : ""}`));
  box.append(sheet);
  if (latest) for (const [text, where] of waiting(x)) { const r = el("div", undefined, "press"); r.append(el("span", text), button(where === "realm" ? "Answer it" : "Answer", () => x.open(where))); box.append(r); }
  if (entry.receipt?.length) {
    const why = el("details", undefined, "why"), s = el("summary", `Why: the ${entry.receipt.length} thing${entry.receipt.length > 1 ? "s" : ""} the rules decided, with the sums`);
    why.append(s, receiptList(entry, x), ...x.reports(entry));
    box.append(why);
  }
}

// ---- pressure: what is answered from Actions ----
/** Cards at the top of Actions: a border incident with its two answers, and a partner's call to arms. */
export function pressNotices(x) {
  const g = x.g(), G = x.geo(), { el, button } = x, out = [], me = g.player;
  if (!facing(g)) return out;
  const card = (title, text, ...btns) => { const ul = el("ul", undefined, "list"), li = el("li"); li.append(el("span", text), ...btns); ul.append(li); out.push(el("h3", title), ul); };
  if (g.incident) {
    const k = g.incident, a = protestAnswer(g, G, k.from), pick = (v, t) => { const b = button(t, () => { if (v) k.answer = v; else delete k.answer; x.save(); x.open("actions"); }); b.setAttribute("aria-pressed", String((k.answer || "") === v)); return b; };
    card("A border incident", `Patrols from ${x.name(k.from)} crossed into ${G.place(k.id).name}. Let it pass, and your mandate falls a step. Protest, and by the rules today ${x.name(k.from)} would ${a.ok ? "apologise, and your mandate rises a step" : "reject it: relations cool a step, and you hold a cause for war"} (${a.why}). Answered when this turn ends.`, pick("", "Let it pass"), pick("protest", "Protest"));
  }
  if (g.call) {
    const k = g.call, kind = treatyOf(g, me, k.from)?.kind || "defence", text = `Join ${x.name(k.from)}: declare war on ${x.name(k.on)}.`, has = (g.orders || []).some((o) => o.verb === "WAR" && o.target === k.on);
    card("A call to arms", `${x.name(k.from)} is at war with ${x.name(k.on)} and calls on you, by your ${kind} treaty. Join before this turn ends: your mandate rises a step and ${x.name(k.from)} warms to you. Stay out, and the treaty is cut back to ${kind === "alliance" ? "a defence treaty" : "a trade treaty"}. ${sides(x, k.on)}`,
      ...(has ? [el("b", "Joining")] : [button("Join the war", () => x.order({ text, verb: "WAR", target: k.on, detail: "" }))]));
  }
  return out;
}

// ---- war from the province card ----
/** The two sides a war on `c` would have today, in a sentence. */
function sides(x, c) {
  const g = x.g(), G = x.geo(), me = g.player, m = (k) => strengthOf(g, G, k), their = standBy(g, c, me);
  return `Might: yours ${m(me)}, ${x.name(c)} ${m(c)}${their.length ? `; ${their.map((k) => `${x.name(k)} (${m(k)})`).join(", ")} would join against you by treaty` : ""}.`;
}
/** Why a war on `c` cannot be declared today, or "". */
function barredFrom(x, c) {
  const g = x.g(), me = g.player, t = treatyOf(g, me, c), truce = truceUntil(g, me, c);
  if (t) return `You are bound to ${x.name(c)} by ${treatyName(t.kind)}: it must be ended first.`;
  if (truce) return `A truce holds until ${wordDate(truce)}.`;
  if (gaugeOf(g, me, "s") === 0) return "Your country is in revolt: no army marches.";
  return gaugeOf(g, me, "t") === 0 ? "Your treasury is empty: no new war." : "";
}
/** On a foreign province's card: declare war on its holder, or join a war it or its enemies fight. Nodes for the card. */
export function warCard(p, x) {
  const g = x.g(), G = x.geo(), me = g.player, c = G.owner(p.id), { el, button } = x;
  if (!facing(g) || c === me || !G.holds(me)) return [];
  const box = el("div"), row = el("div", undefined, "row"), ordered = (t) => (g.orders || []).some((o) => o.verb === "WAR" && o.target === t), war = (t, label, text, cls) => (ordered(t) ? el("b", `Ordered: war on ${x.name(t)}`) : button(label, () => x.order({ text, verb: "WAR", target: t, detail: "" }), cls));
  const notes = [];
  if (!atWar(g, me, c)) {
    const no = barredFrom(x, c), cause = causeOf(g, G, me, c), foes = warsOf(g, c).filter((f) => f !== me), t = treatyOf(g, me, c);
    // the odds against this province, were the war already on: the same plan the attack order uses
    const then = { ...g, wars: [...g.wars, { pair: [me, c].sort().join("|"), since: g.date, by: me }] }, a = attackPlan(then, G, me, p.id, {});
    notes.push(cause ? `You have a cause: ${cause}.` : "You have no cause: a war begun without one costs a step of stability.", sides(x, c));
    if (pactOf(g, me, c)) notes.push("A pact of non-aggression stands: war breaks it, costs a step of stability, and is held against you for two years.");
    if (a.ok) notes.push(`An attack on ${p.name} would then stand at ${oddsLine(a.chance)}.`);
    if (no) notes.push(no);
    else row.append(war(c, foes.length ? `Join the war on ${x.name(c)}` : "Declare war", foes.length ? `Join ${foes.slice(0, 2).map(x.name).join(" and ")} against ${x.name(c)}: declare war on ${x.name(c)}.` : `Declare war on ${x.name(c)}.`, "go"));
    if (foes.length) notes.push(`${x.name(c)} is at war with ${foes.map(x.name).join(", ")}.`);
    if (t) row.append((g.orders || []).some((o) => o.verb === "BREAK" && o.target === c) ? el("b", "Ordered: the treaty ends") : button("End the treaty", () => x.order({ text: `End our ${t.kind} treaty with ${x.name(c)}.`, verb: "BREAK", target: c, detail: "" })));
    if (t) notes.push("Ending a treaty costs two steps of relations, gives them a cause, and every country counts it against you for two years.");
    // its enemies, when it is a partner or you have no quarrel with it: stand beside it
    for (const f of foes.slice(0, 3)) if (!atWar(g, me, f) && !barredFrom(x, f)) row.append(war(f, `Join ${x.name(c)} against ${x.name(f)}`, `Join ${x.name(c)}: declare war on ${x.name(f)}.`));
  }
  if (!notes.length && !row.children.length) return [];
  box.append(el("h3", "War"), ...notes.map((n) => el("p", n, "note")), row);
  return [box];
}

// ---- treaties: what they do, in numbers ----
/** A note for the treaty box on a country's card: what each kind changes, and what your pledges come to today. */
export function treatyMeans(c, x) {
  const g = x.g(), G = x.geo(), me = g.player, mine = treatiesOf(g, me), n = mine.length, given = pledges(g, me), top = n >= 3 ? "overflowing" : n ? "full" : "sound";
  const mates = mine.filter((t) => t.kind !== "trade").map((t) => t.with), sum = mates.reduce((s, k) => s + strengthOf(g, G, k), 0);
  return [x.el("p", `What treaties do. Trade: your treasury may fill further (you hold ${n} treat${n === 1 ? "y" : "ies"}; in peace it can reach ${top}${n >= 3 ? "" : ", and three make it overflowing"}). Defence and alliance are pledges: the partner fights if you are attacked, shields you when land is demanded of you, and may call you to its wars; stay out, and the treaty is cut back a rung. You have given ${given} pledge${given === 1 ? "" : "s"}${mates.length ? ` (${mates.map(x.name).join(", ")}: might ${sum} in all behind you)` : ""}. A stronger treaty wants the last one a year old, and each pledge beyond the first makes the next harder to win. Pledged partners are edged in green on the map.`, "note")];
}
/** The countries pledged to the player by defence or alliance, for the map's green edge. */
export const pledged = (g) => (g && facing(g) ? treatiesOf(g, g.player).filter((t) => t.kind !== "trade").map((t) => t.with).sort() : []);

// ---- the ambition in the top bar, and the endings ----
/** The ambition beside the country's name: what it is and how far along, or a way to choose one. */
export function ambitionChip(x) {
  const g = x.g(), p = progress(g, x.geo()), b = x.el("button", undefined, "amb");
  b.type = "button"; b.onclick = () => x.open("realm");
  if (g.over) { b.append("Ended"); b.title = "This country's story has ended"; b.onclick = () => endScreen(x, "lost"); return b; }
  if (!p) { b.append(x.el("span", g.done?.length ? "Choose your next ambition" : "Choose an ambition", "long"), x.el("span", "Goal?", "short")); b.classList.add("ask"); b.setAttribute("aria-label", "Choose an ambition"); return b; }
  const bar = x.el("span", undefined, "meter"), fill = x.el("i");
  fill.style.width = `${Math.round((100 * p.have) / p.need)}%`; bar.append(fill);
  b.append(x.el("span", `${p.title} ${p.have}/${p.need}`, "long"), x.el("span", `Goal ${p.have}/${p.need}`, "short"), bar);
  b.title = `Your ambition: ${p.said}. ${p.have} of ${p.need}.`; b.setAttribute("aria-label", b.title);
  return b;
}

const RANK = ["", "An ambition met", "A second ambition met", "A reign to remember"];
/** The screen for an ambition met ("won") or a country that has lost its last land ("lost"). */
export function endScreen(x, how) {
  const g = x.g(), G = x.geo(), { el, button } = x, me = x.name(g.player), d = el("dialog", undefined, `panel ending ${how}`), row = el("div", undefined, "row"), back = document.activeElement;
  document.querySelector("dialog.ending")?.remove();
  d.onclose = () => { d.remove(); if (back?.isConnected) back.focus({ preventScroll: true }); };
  const tale = el("ul"); tale.append(...reckoning(g, G, x.fmtDate).map((t) => el("li", t)));
  if (how === "won") {
    const last = g.done[g.done.length - 1], n = g.done.length, next = ambitionsFor(g, G), list = el("div", undefined, "stack");
    list.append(...next.slice(0, 6).map((a) => { const b = button("", () => { chooseAmbition(g, G, a.id); x.save(); x.bar(); d.close(); x.toast(`Your ambition: ${a.title}.`); }); b.append(el("b", a.title), el("small", ` ${a.said}.`)); return b; }));
    row.append(button(next.length ? "Play on, and choose later" : "Play on", () => d.close(), next.length ? "plain" : "go"));
    d.append(el("p", RANK[Math.min(n, 3)], "eyebrow"), el("h2", AMBITIONS[last.id]?.title || "Your ambition"), el("p", `${last.said}. ${me} has done it, on ${x.fmtDate(last.date)}, in turn ${last.turn}. The rules counted it; nobody can take it back.`),
      el("h3", "The reckoning"), tale, ...(next.length ? [el("h3", "What next?"), el("p", "The game goes on for as long as you like. Choose the next thing to reach for.", "note"), list] : [el("p", "There is nothing left to choose: you have met them all.", "note")]), row);
  } else {
    row.append(button("Take back a turn", () => { d.close(); x.back(); }, "go"), button("New game", () => { d.close(); x.fresh(); }), button("Watch the world go on", () => d.close()));
    d.append(el("p", "The end", "eyebrow"), el("h2", `${me} is no more`), el("p", `On ${x.fmtDate(g.over.date)}, in turn ${g.over.turn}, ${me} lost the last of its land. No order of yours will be carried out now. You can take the last turn back and try another way, begin again, or stay and watch what the world does next.`),
      el("h3", "The reckoning"), tale, row);
  }
  document.body.append(d); d.showModal();
  (d.querySelector("h2")).tabIndex = -1; d.querySelector("h2").focus({ preventScroll: true });
}
/** After a turn: the screen its receipt calls for, if any. Returns true when one opened. */
export function endings(x, entry) {
  const how = (entry.receipt || []).some((r) => r.over) ? "lost" : (entry.receipt || []).some((r) => r.met) ? "won" : "";
  if (how) endScreen(x, how);
  return !!how;
}
