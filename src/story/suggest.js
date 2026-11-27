// SPDX-License-Identifier: AGPL-3.0-or-later
// Suggested actions, built from the state of the game and never by an AI: each is an order the player could give by
// card, shown with the answer or the odds the rules would give it today. At most six: peace with each enemy and the
// best attack against it, then the next treaty up with neighbours who would agree.
import { oddsLine } from "./check.js";
import { treatyAnswer, treatyName } from "./relations.js";
import { peaceAnswer, strengthOf } from "./war.js";
import { bestAttack, borders } from "./rivals.js";
import { atWar, treatyOf, warsOf } from "./worldrules.js";

const NEXT = { "": "trade", trade: "defence", defence: "alliance" };

/** [{text, verb, target, detail, seat, approach, note}]: text is the action, note what the rules would answer. */
export function suggest(g, geo) {
  if (g.mode === "citizen") return [];
  const me = g.player, out = [], taken = (verb, target) => (g.orders || []).some((o) => (o.verb || "ATTACK") === verb && o.target === target);
  // keyless hook: a partner's call to arms comes first (pressure.js)
  if (g.call && !taken("WAR", g.call.on)) out.push({ text: `Join ${geo.name(g.call.from)}: declare war on ${geo.name(g.call.on)}.`, verb: "WAR", target: g.call.on, detail: "", note: `${geo.name(g.call.from)} has called you to its war, by your treaty` });
  for (const foe of warsOf(g, me).slice(0, 2)) {
    const offered = g.offers.some((o) => o.from === foe && o.kind === "peace"), a = peaceAnswer(g, me, foe);
    if (!offered && !taken("PEACE", foe)) out.push({ text: `Propose peace to ${geo.name(foe)} (${foe}).`, verb: "PEACE", target: foe, detail: "", note: `${geo.name(foe)} would ${a.ok ? "agree" : "refuse"} (${a.why})` });
    const best = bestAttack(g, geo, me, foe);
    if (best && !taken("ATTACK", best.id)) out.push({ text: `Attack ${geo.place(best.id).name} (${best.id}), led by ${best.plan.boss.seat === "generals" ? "our generals" : best.plan.boss.name}, steady.`, verb: "ATTACK", target: best.id, seat: best.plan.boss.seat, approach: "steady", note: `odds: ${oddsLine(best.chance)}` });
  }
  for (const c of borders(geo).get(me) || []) {
    const kind = NEXT[treatyOf(g, me, c)?.kind || ""];
    if (out.length >= 6) break;
    if (!kind || atWar(g, me, c) || taken("TREATY", c) || g.offers.some((o) => o.from === c)) continue;
    const a = treatyAnswer(g, me, c, kind, (x) => strengthOf(g, geo, x));
    if (a.ok) out.push({ text: `Propose ${treatyName(kind)} to ${geo.name(c)} (${c}).`, verb: "TREATY", target: c, detail: kind, note: `${geo.name(c)} would agree (${a.why})` });
  }
  return out.slice(0, 6);
}
