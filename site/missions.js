// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo's page for solo missions (ruling 124, step M1): the order on a province card with its odds before it is
// given, the roster on the council sheet, and each mission step by step in the Ledger. The rules are in
// src/story/missions.js, roster.js and missiontext.js; this file only shows them and takes orders. x is what the
// game page lends: {g() the game, geo(), name(code), el, button, fmtDate, save(), toast(text), open(sheet)}.
import { KINDS, MOST, ORDERS, WAYS, alertOf, heldBy, inRole, keepSends, missionOddsLine, people, planMission, scouted, send } from "../src/story/missions.js";
import { TIMES, keepRoster, recordOf } from "../src/story/roster.js";
import { report } from "../src/story/missiontext.js";
import { partsLine } from "../src/story/check.js";
import { SEATS } from "../src/story/talk.js";
/** A checked game with its missions checked too: what does not fit the map is dropped, what is missing starts empty. */
export const keepMissions = (s, known) => (s ? { ...s, roster: keepRoster(s, known), ...keepSends(s, known) } : s);

const cap = (s) => `${s[0].toUpperCase()}${s.slice(1)}`;
const seatName = (seat) => (seat === "field" ? "Field agent" : Object.values(SEATS).flat().find(([k]) => k === seat)?.[1] || seat);
const stateWords = (x, p) => (p.st === "fit" ? "fit" : p.st === "held" ? `held by ${x.name(p.by)} until turn ${p.until} unless rescued` : `${p.st} until turn ${p.until}`);
let pick = { kind: "scout", who: "", way: "quiet", fail: "again", hunted: "withdraw" };

/** The mission order for the country that holds a province, with the odds before it is given. again() redraws the card. */
export function missionBox(c, x, again) {
  const g = x.g(), G = x.geo(), { el, button } = x;
  if (g.mode === "citizen" || c === g.player) return null;
  const box = el("div"), list = people(g), held = heldBy(g, c), out = (p) => p.st !== "fit" || (g.sends || []).some((m) => m.who === p.name && m.target !== c && (g.actions || []).includes(m.text));
  const select = (label, options, key) => {
    const s = el("select", undefined, "plain"); s.append(...options.map(([v, t, off]) => Object.assign(new Option(t, v), { disabled: !!off })));
    s.value = pick[key]; s.style.maxWidth = "100%"; s.setAttribute("aria-label", label); s.onchange = () => { pick = { ...pick, [key]: s.value }; again(); };
    return s;
  };
  if (pick.kind === "rescue" && !held.length) pick.kind = "scout";
  if (!list.some((p) => p.name === pick.who && !out(p))) pick.who = (list.find((p) => p.seat === "field" && !out(p)) || list.find((p) => !out(p)) || list[0]).name;
  const m = { ...pick, target: c }, plan = planMission(g, G, m), ordered = (g.sends || []).find((s) => s.target === c && (g.actions || []).includes(s.text));
  const know = scouted(g, c), alert = alertOf(g, c);
  box.append(el("h3", "Missions"),
    el("p", `One of your people goes alone, by your plan; you do not steer. ${x.name(c)}'s watch is ${plan.ok ? plan.watch : "unknown"} (half its might, rounded up${alert ? `, and its alert of ${alert}` : ""}).${know ? ` You scouted it: +10 there until ${x.fmtDate(know)}.` : ""}${held.length ? ` It holds ${held.join(" and ")}.` : ""}`, "note"),
    select("What to do", [["scout", "Scout: learn its watch (missions there +10 for a year)"], ["sabotage", "Sabotage: its might one lower for a year"], ...(held.length ? [["rescue", `Rescue ${held.join(" and ")}`]] : [])], "kind"),
    select("Who goes", list.map((p) => [p.name, `${p.name}, ${seatName(p.seat).toLowerCase()}: skill ${p.skill}${inRole(pick.kind, p.seat) ? "" : ", out of role (-20)"}${p.st === "fit" ? "" : `, ${p.st}`}`, out(p)]), "who"),
    select("How", Object.entries(WAYS).map(([k, [, said]]) => [k, `${cap(k)}: ${said}`]), "way"),
    select("If a step fails", Object.entries(ORDERS.fail).map(([k, t]) => [k, `If a step fails: ${t}`]), "fail"),
    select("If hunted", Object.entries(ORDERS.hunted).map(([k, t]) => [k, `If hunted (alarm 2): ${t}`]), "hunted"));
  if (!plan.ok) { box.append(el("p", `Cannot send: ${plan.why}.`, "note")); return box; }
  const parts = partsLine(plan.first), odds = el("p", `The whole mission: ${missionOddsLine(plan.odds)}.`), row = el("div", undefined, "row");
  odds.setAttribute("aria-live", "polite");
  row.append(button(ordered ? "Change the order" : "Order the mission", () => {
    send(g, m, `Send ${m.who} ${{ scout: "to scout", sabotage: "on a sabotage mission in", rescue: `to bring ${held.join(" and ")} home from` }[m.kind]} ${x.name(c)} (${c}), ${m.way}.`);
    x.save(); x.toast("Ordered: it is in your actions."); again();
  }, "go"));
  box.append(el("p", `Going in: skill ${plan.p.skill} against watch ${plan.watch}${parts ? `, ${parts}` : ""}: chance ${plan.first.chance} of 100 (never above 75). Then the task, then the way out.`, "note"), odds,
    el("p", `Clean: done and barely noticed. Costly: done, but they are hurt or ${x.name(c)} is roused. Failed: not done, and home. Held: taken, until a rescue or ${TIMES.held} turns pass. ${plan.p.name} leads no attack and gives no counsel this turn.${ordered ? ` Ordered now: ${ordered.who}, ${ordered.kind}, ${ordered.way}.` : ""} At most ${MOST} missions a turn.`, "note"), row);
  return box;
}

/** The council sheet's part: everyone who can be sent, how they are, and their record. */
export function rosterRows(x) {
  const g = x.g(), { el } = x, list = people(g);
  if (!list.length) return [];
  const ul = el("ul", undefined, "list");
  ul.append(...list.map((p) => {
    const li = el("li"), n = recordOf(g, p.name), sent = (g.sends || []).find((m) => m.who === p.name && (g.actions || []).includes(m.text)), total = n.reduce((a, b) => a + b, 0);
    li.append(el("span", `${p.name}, ${seatName(p.seat).toLowerCase()}: skill ${p.skill} of 5. ${sent ? `Ordered out this turn, to ${x.name(sent.target)}` : cap(stateWords(x, p))}.${total ? ` Missions: ${n[0]} clean, ${n[1]} costly, ${n[2]} failed, ${n[3]} held.` : ""}`));
    return li;
  }));
  return [el("h3", "Who can be sent"), el("p", "Your council and two field agents, dealt by the rules. Tap a province of another country to send one of them to scout it, to sabotage it, or to bring home someone it holds. The odds are shown before you order. Anyone sent, hurt or held leads no attack and gives no counsel.", "note"), ul];
}

/** The Ledger's part: each mission of a turn, step by step, told from its record with the rules' numbers beside it. */
export function missionReports(turn, x) {
  const g = x.g(), { el } = x, out = [];
  for (const r of (turn?.receipt || []).filter((q) => q.mission)) {
    const rec = r.mission, ol = el("ol", undefined, "feed");
    ol.append(...report(g.seed, rec, x.name(rec.target)).map((b) => { const li = el("li"); li.append(el("div", `${b.step === "task" ? "The task" : b.step === "enter" ? "Going in" : "Coming out"}: ${b.band}`, "note"), el("p", b.text), el("div", `${cap(b.numbers)}.`, "note")); return li; }));
    out.push(el("p", `${rec.who}, ${KINDS[rec.kind][0].toLowerCase()} in ${x.name(rec.target)}, ${rec.way}: alarm ${rec.alarm} of 3.`, "note"), ol);
  }
  return out.length ? [el("h3", "Missions, step by step"), ...out] : [];
}
