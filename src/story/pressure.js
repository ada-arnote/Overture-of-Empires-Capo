// SPDX-License-Identifier: AGPL-3.0-or-later
// Pressure on the player's country, by rule (rules version 6). Whole numbers, drawn from the game's seed, no AI.
// Something is done to the player early, and again from time to time, so the world is not only watched:
//   The first comes by the end of turn 2, 3 or 4 (drawn once from the seed), unless the world has already pressed
//   the player: a war, a demand, a demand for tribute, unrest. After that, once six months have been quiet, each
//   turn has a chance of another (calm 15, lively 30, stormy 50 in 100).
//   Which one comes is drawn from the seed, among those that can happen:
//     a demand: a neighbour with no treaty, at most one weaker than the player, opens a crisis over a border
//       province of the player's (crisis.js answers it; the player refuses or yields);
//     a border incident: a neighbour with no treaty sends patrols across. The player protests or lets it pass by
//       card. Let pass: a step of mandate lost. Protest: the neighbour adds up a score and says it (the gap in
//       might, 3 at most either way, +2 when a partner of the player at least as strong stands behind it, +1 when
//       it has a war to fight), needing 1. It apologises (a step of mandate won) or it rebuffs the protest
//       (relations fall a step, and the player holds a cause for five years);
//     a pact against the player: two neighbours, neither stronger than the player and neither pledged to it, sign
//       a defence treaty when their own sum for it, +2 for the neighbour they both fear, reaches 2. Each cools a
//       step toward the player, and a war on one is now a war on both;
//     unrest: a hard season takes a step of stability from a steady country, and unrest gathers (home.js).
// A call to arms needs no draw: when a defence or alliance partner of the player fights a country the player
// could fight too, it calls once. The player joins by declaring that war before the next turn ends (a step of
// mandate won, and relations warm a step) or does not: the treaty is cut back one rung (alliance to defence,
// defence to trade). The same partner does not call against the same enemy again for two years.
import { draw100, hash32 } from "./line.js";
import { monthsApart, relate, treatyAnswer } from "./relations.js";
import { addMonths, demandAnswer } from "./crisis.js";
import { gaugeOf, setCause } from "./state.js";
import { mightOf, strengthOf, truceUntil } from "./war.js";
import { atWar, treatiesOf, treatyOf, turnKey, warsOf } from "./worldrules.js";
import { paceOf } from "./rivals.js";

export const PRESS = { first: 2, span: 3, quiet: 6, chance: { calm: 15, lively: 30, stormy: 50 }, due: 3, again: 24, need: 1, fear: 2 };
const HARD = ["a hard winter and dear bread", "a strike that spread from the ports", "a failed harvest in the provinces", "a scandal over the army's pay"];
const DOWN = { alliance: "defence", defence: "trade" };
const pairOf = (a, b) => [a, b].sort().join("|");
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const stored = (g, a, b) => g.rel?.[pairOf(a, b)]?.[0] || 0;
const turnRel = (g, a, b, by, to) => { const k = pairOf(a, b), n = Math.max(-3, Math.min(3, stored(g, a, b) + by)); g.rel = { ...(g.rel || {}) }; if (n) g.rel[k] = [n, to]; else delete g.rel[k]; };

/** The countries beside the player's, by land or narrow sea: Map(code -> the player's provinces that touch it), sorted. */
export function beside(g, geo) {
  const me = g.player, out = new Map();
  for (const id of [...(geo.all || [])].sort()) {
    if (geo.owner(id) !== me) continue;
    for (const n of [...geo.neighbours(id), ...(geo.across?.(id) || [])]) { const c = geo.owner(n); if (c !== me) out.set(c, [...new Set([...(out.get(c) || []), id])]); }
  }
  return new Map([...out].sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Who would join `c` if `foe` declared war on it today: its defence and alliance partners free to fight. */
export const standBy = (g, c, foe) => treatiesOf(g, c).filter((t) => t.kind !== "trade" && t.with !== foe && !atWar(g, t.with, foe) && !treatyOf(g, t.with, foe) && !truceUntil(g, t.with, foe)).map((t) => t.with).sort();

/** What `c` would answer to the player's protest over a border incident, and why: {ok, score, need, why}. */
export function protestAnswer(g, geo, c) {
  const me = g.player, mm = mightOf(geo, me), mc = mightOf(geo, c), parts = [[`might ${mm} against ${mc}`, Math.max(-3, Math.min(3, mm - mc))]];
  const friend = treatiesOf(g, me).find((t) => t.kind !== "trade" && t.with !== c && mightOf(geo, t.with) >= mc);
  if (friend) parts.push([`${geo.name(friend.with)} stands behind it`, 2]);
  if (warsOf(g, c).length) parts.push(["another war to fight", 1]);
  const score = parts.reduce((n, [, v]) => n + v, 0);
  return { ok: score >= PRESS.need, score, need: PRESS.need, why: `${parts.map(([l, n]) => `${l} ${signed(n)}`).join(", ")}: ${score}, needing ${PRESS.need}` };
}

// ---- the four that are drawn: each returns a receipt line, or null when it cannot happen today ----
const MAKE = {
  demand(g, to, geo, near, pick) {
    const me = g.player, name = geo.name;
    if (g.crisis) return null;
    const list = [...near].filter(([c]) => !treatyOf(g, me, c) && !atWar(g, me, c) && geo.holds(c) && gaugeOf(g, c, "s") > 0 && mightOf(geo, c) >= mightOf(geo, me) - 1 && !(g.asked?.[`${c}>${me}`] && monthsApart(g.asked[`${c}>${me}`], to) < PRESS.again))
      .map(([c, ids]) => [c, ids.find((id) => id !== geo.home?.(me)) || ids[0]]).filter(([c, id]) => !demandAnswer(g, geo, c, me, id, to).no)
      .sort((x, y) => mightOf(geo, y[0]) - mightOf(geo, x[0]) || (x[0] < y[0] ? -1 : 1)).slice(0, 2);
    if (!list.length) return null;
    const [c, id] = list[pick("whom", list.length)], due = addMonths(to, PRESS.due);
    g.crisis = { a: c, b: me, id, since: to, due, by: "rules" };
    return { ok: true, country: c, text: `${name(c)}: demands ${geo.place(id).name} from ${name(me)}, to be answered by ${due}`, asks: [c, me, id, due], press: "demand" };
  },
  incident(g, to, geo, near, pick) {
    const me = g.player, list = [...near].filter(([c]) => !treatyOf(g, me, c) && !atWar(g, me, c) && geo.holds(c));
    if (!list.length || g.incident) return null;
    const [c, ids] = list[pick("whom", list.length)], id = ids[0];
    g.incident = { from: c, id, since: to };
    return { ok: true, country: c, text: `${geo.name(c)}: its patrols cross into ${geo.place(id).name}, and shots are exchanged; ${geo.name(me)} must answer`, press: "incident", at: id };
  },
  bloc(g, to, geo, near, pick) {
    const me = g.player, mm = mightOf(geo, me), free = [...near.keys()].filter((c) => geo.holds(c) && !atWar(g, me, c) && mightOf(geo, c) <= mm && !["defence", "alliance"].includes(treatyOf(g, me, c)?.kind)), pairs = [];
    for (const c of free) for (const t of free) {
      if (c >= t || atWar(g, c, t) || ["defence", "alliance"].includes(treatyOf(g, c, t)?.kind)) continue;
      const a = treatyAnswer(g, c, t, "defence", (x) => strengthOf(g, geo, x));
      if (a.score + PRESS.fear >= a.need) pairs.push([c, t, a]);
    }
    if (!pairs.length) return null;
    const [c, t, a] = pairs[pick("whom", pairs.length)], name = geo.name;
    g.treaties = [...g.treaties.filter((x) => x.pair !== pairOf(c, t)), { pair: pairOf(c, t), kind: "defence", since: to }];
    relate(g, ["treaty", c, t], new Set());
    for (const x of [c, t]) turnRel(g, me, x, -1, to);
    return { ok: true, country: c, text: `${name(c)} and ${name(t)}: sign a defence treaty, each wary of ${name(me)} (${a.why.replace(/: -?\d+, needing \d+$/, "")}, a neighbour both fear ${signed(PRESS.fear)}: ${a.score + PRESS.fear}, needing ${a.need})`, fact: ["treaty", c, t, "defence"], press: "bloc", wary: me };
  },
  unrest(g, to, geo, near, pick) {
    const me = g.player;
    if (gaugeOf(g, me, "s") !== 2 || g.unrest?.[me]) return null;
    const why = HARD[pick("why", HARD.length)];
    return { ok: true, country: me, text: `${geo.name(me)}: ${why}, and the streets grow restless`, gauge: [[me, "s", -1, why]], press: "unrest" };
  },
};

/** The answer to a border incident, at the end of the turn after it. */
function settleIncident(g, to, geo) {
  const k = g.incident, me = g.player, name = geo.name;
  if (!k || k.since >= to) return [];
  delete g.incident;
  const place = geo.place(k.id)?.name || "the border";
  if (atWar(g, me, k.from) || !geo.holds(k.from)) return [];
  if (k.answer !== "protest") return [{ ok: true, country: me, text: `${name(me)}: lets the incident at ${place} pass`, gauge: [[me, "m", -1, "a border incident left unanswered"]], incident: ["pass", k.from], at: k.id }];
  const a = protestAnswer(g, geo, k.from);
  if (a.ok) return [{ ok: true, country: k.from, text: `${name(k.from)}: apologises to ${name(me)} for the incident at ${place} (${a.why})`, gauge: [[me, "m", 1, "an apology won"]], incident: ["sorry", k.from], at: k.id }];
  turnRel(g, me, k.from, -1, to);
  setCause(g, me, k.from, `the border incident at ${place} in ${to.slice(0, 4)}`, to);
  return [{ ok: true, country: k.from, text: `${name(k.from)}: rejects ${name(me)}'s protest over ${place} (${a.why}); relations cool a step, and ${name(me)} holds a cause`, incident: ["rebuff", k.from], at: k.id }];
}

/** A partner's call to arms: answered at the end of the turn after it, and a new one made when a partner fights. */
function settleCall(g, to, geo) {
  const me = g.player, name = geo.name, lines = [], k = g.call;
  if (k && k.since < to) {
    delete g.call;
    const t = treatyOf(g, me, k.from);
    if (t && t.kind !== "trade" && geo.holds(k.from) && geo.holds(k.on)) {
      if (atWar(g, me, k.on)) { turnRel(g, me, k.from, 1, to); lines.push({ ok: true, country: k.from, text: `${name(k.from)}: thanks ${name(me)} for standing by its word against ${name(k.on)}`, gauge: [[me, "m", 1, "a pledge kept"]], call: ["kept", k.from, k.on] }); }
      else if (atWar(g, k.from, k.on)) { const was = t.kind; t.kind = DOWN[was]; t.since = to; delete t.old; lines.push({ ok: true, country: k.from, text: `${name(k.from)}: ${name(me)} did not answer its call against ${name(k.on)}, and their ${was} treaty is cut back to a ${t.kind} treaty`, call: ["cut", k.from, k.on, was] }); }
    }
  }
  if (g.call || gaugeOf(g, me, "s") === 0 || gaugeOf(g, me, "t") === 0) return lines;
  for (const { with: p, kind } of treatiesOf(g, me).filter((t) => t.kind !== "trade").sort((x, y) => (x.with < y.with ? -1 : 1))) {
    const foe = warsOf(g, p).sort().find((x) => x !== me && geo.holds(x) && !atWar(g, me, x) && !treatyOf(g, me, x) && !truceUntil(g, me, x) && !(g.called?.[`${p}>${x}`] && monthsApart(g.called[`${p}>${x}`], to) < PRESS.again));
    if (!foe || !geo.holds(p)) continue;
    g.call = { from: p, on: foe, since: to };
    g.called = { ...(g.called || {}), [`${p}>${foe}`]: to };
    lines.push({ ok: true, country: p, text: `${name(p)}: calls on ${name(me)} to join its war against ${name(foe)}, by their ${kind} treaty`, call: ["asks", p, foe], press: "call" });
    break;
  }
  return lines;
}

/**
 * The end of a turn, on its last day `to`, before the gauges move: an incident and a call are answered, a partner
 * at war may call, and the rules may press the player. receipt: the turn's lines so far. Returns receipt lines;
 * some carry `gauge` pushes for state.js.
 */
export function settlePressure(g, receipt, to, geo) {
  const me = g.player;
  if (g.mode === "citizen" || !geo.holds(me)) return [];
  const lines = [...settleIncident(g, to, geo), ...settleCall(g, to, geo)], p = g.press;
  // the world is already pressing: a war, a demand, tribute asked, unrest, an incident or a call still open
  const busy = warsOf(g, me).length > 0 || g.crisis?.b === me || !!g.due || !!g.unrest?.[me] || !!g.incident || !!g.call || receipt.some((r) => r.fact?.[0] === "took" && r.fact[2] === me);
  if (busy) { g.press = { at: to, n: p?.n || 1 }; return lines; }
  const due = p ? monthsApart(p.at, to) >= PRESS.quiet && draw100(g.seed, `${turnKey(g)}:press`) <= PRESS.chance[paceOf(g)] : g.turn >= PRESS.first + (hash32(g.seed, "press:first") % PRESS.span);
  if (!due) return lines;
  const near = beside(g, geo), pick = (label, n) => hash32(g.seed, `${turnKey(g)}:press:${label}`) % n, kinds = Object.keys(MAKE), from = pick("kind", kinds.length);
  for (let i = 0; i < kinds.length; i++) {
    const line = MAKE[kinds[(from + i) % kinds.length]](g, to, geo, near, pick);
    if (line) { lines.push(line); g.press = { at: to, n: (p?.n || 0) + 1 }; break; }
  }
  return lines;
}

/** Lines for the prompt while an incident or a call waits for the player. */
export function pressureLines(g, geo) {
  const out = [];
  if (g.incident) out.push(`- A border incident, kept by the rules: patrols of ${g.incident.from} crossed into ${g.incident.id} ${geo.place(g.incident.id)?.name || ""}. The player protests or lets it pass by card; never say how it ends.`);
  if (g.call) out.push(`- A call to arms, kept by the rules: ${g.call.from} asks the player's country to join its war on ${g.call.on}. Only the player's own WAR move joins it.`);
  return out;
}

/** Pressure from a save: countries and provinces on the map, dates as dates; what does not fit is dropped. */
export function keepPressure(s, known, isProvince) {
  const DATE = /^\d{4}-\d{2}-\d{2}$/, p = s.press, i = s.incident, c = s.call;
  return {
    press: p && typeof p === "object" && DATE.test(p.at || "") ? { at: p.at, n: Number.isInteger(p.n) && p.n > 0 ? p.n : 1 } : undefined,
    incident: i && typeof i === "object" && known(i.from) && isProvince(i.id) && DATE.test(i.since || "") ? { from: i.from, id: i.id, since: i.since, ...(i.answer === "protest" ? { answer: "protest" } : {}) } : undefined,
    call: c && typeof c === "object" && known(c.from) && known(c.on) && DATE.test(c.since || "") ? { from: c.from, on: c.on, since: c.since } : undefined,
    called: Object.fromEntries(Object.entries(s.called && typeof s.called === "object" ? s.called : {}).filter(([k, d]) => k.split(">").length === 2 && k.split(">").every(known) && DATE.test(d || ""))),
  };
}
