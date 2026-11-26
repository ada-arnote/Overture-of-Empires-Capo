// SPDX-License-Identifier: AGPL-3.0-or-later
// Spheres of influence, and two treaty clauses that bind: a pact of non-aggression, and tribute. Rules only.
// A sphere. A country stands in the sphere of a defence or alliance partner whose might is at least three above
// its own (the strongest such partner), and of any country it pays tribute to. Nothing is signed to make one: it
// is read from the treaties. The patron already shields it in a crisis and has a cause when it is attacked.
// A pact of non-aggression. Asked by card and answered by the sum a trade treaty uses, needing 1. It lasts five
// years. War between the two is not refused: it is a breach. The country that declares it is known for it for two
// years (every treaty answer counts it), loses a step of stability, and the other holds a cause for five years.
// Tribute. A country may demand a yearly tribute of a weaker one beside it, by land or across a narrow sea. The country asked adds up a score and says it:
// the gap in might (3 at most), +1 for another war to fight, +1 or +2 when it is shaken or in revolt, -2 when a
// treaty partner at least as strong as the asker stands behind it, -2 when its treasury is strained or empty. At 4
// it pays; otherwise it refuses, which costs the asker a step of mandate and of relations. While it pays, the
// payer's treasury settles one step lower and the receiver's one step higher (state.js), and signing it leaves the
// pair cool. It stops when the payer is no longer the weaker, when the two go to war, or after ten years;
// a payer that stops while still bound gives the receiver a cause.
import { monthsApart, treatyAnswer } from "./relations.js";
import { gaugeOf, gaugeWord, setCause } from "./state.js";
import { atWar, mightOf, treatiesOf, treatyOf, warsOf } from "./worldrules.js";
import { strengthOf } from "./war.js";

export const PACT = { need: 1, years: 5, tribute: 4, most: 10, gap: 3 };
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const pairOf = (a, b) => [a, b].sort().join("|");
export const pactOf = (g, a, b) => (g.pacts || []).find((p) => p.kind === "peace" && pairOf(p.a, p.b) === pairOf(a, b));
export const tributeOf = (g, to, from) => (g.pacts || []).find((p) => p.kind === "tribute" && p.a === to && p.b === from);

/** Whose sphere a country stands in, or "": the strongest much stronger partner, or the country it pays. */
export function sphereOf(g, geo, c) {
  const paid = (g.pacts || []).find((p) => p.kind === "tribute" && p.b === c)?.a, mine = mightOf(geo, c);
  const over = treatiesOf(g, c).filter((t) => t.kind !== "trade" && mightOf(geo, t.with) - mine >= PACT.gap).map((t) => t.with).sort((a, b) => mightOf(geo, b) - mightOf(geo, a) || (a < b ? -1 : 1));
  return over[0] || paid || "";
}
/** Every sphere that stands: Map(patron -> the countries in its sphere, sorted). */
export function spheres(g, geo) {
  const out = new Map(), seen = new Set([...g.treaties.filter((t) => t.kind !== "trade").flatMap((t) => t.pair.split("|")), ...(g.pacts || []).filter((p) => p.kind === "tribute").map((p) => p.b)]);
  for (const c of [...seen].sort()) { const p = geo.known(c) && geo.holds(c) ? sphereOf(g, geo, c) : ""; if (p) out.set(p, [...(out.get(p) || []), c]); }
  return out;
}

/** What `to` would answer if `from` asked it for a clause today: {no} when it cannot be asked, else {ok, score, need, why}. */
export function pactAnswer(g, geo, from, to, kind) {
  if (from === to || !geo.known(to) || !geo.holds(to)) return { no: "that is not a country with land" };
  if (atWar(g, from, to)) return { no: `at war with ${geo.name(to)}: make peace first` };
  if (kind === "peace") {
    if (pactOf(g, from, to)) return { no: "that pact already stands" };
    if (treatyOf(g, from, to) && treatyOf(g, from, to).kind !== "trade") return { no: "a stronger treaty already binds you" };
    const a = treatyAnswer(g, from, to, "trade", (c) => strengthOf(g, geo, c));
    return { ok: a.score >= PACT.need, score: a.score, need: PACT.need, why: a.why.replace(/needing \d+$/, `needing ${PACT.need}`) };
  }
  if (tributeOf(g, from, to)) return { no: "it already pays you tribute" };
  if (treatyOf(g, from, to)) return { no: `bound to ${geo.name(to)} by treaty; it must be ended first` };
  const ma = mightOf(geo, from), mb = mightOf(geo, to), s = gaugeOf(g, to, "s"), t = gaugeOf(g, to, "t");
  if (ma <= mb) return { no: `${geo.name(to)} is not the weaker of the two` };
  if (!(geo.all || []).some((id) => geo.owner(id) === from && [...geo.neighbours(id), ...(geo.across?.(id) || [])].some((n) => geo.owner(n) === to))) return { no: `${geo.name(to)} is not beside you by land or narrow sea` };
  const shield = treatiesOf(g, to).find((x) => x.kind !== "trade" && x.with !== from && mightOf(geo, x.with) >= ma);
  const parts = [[`might ${ma} against ${mb}`, Math.min(3, ma - mb)]];
  if (warsOf(g, to).length) parts.push(["another war to fight", 1]);
  if (s < 2) parts.push([`${gaugeWord("s", s)} at home`, 2 - s]);
  if (shield) parts.push([`${geo.name(shield.with)} stands behind it`, -2]);
  if (t < 2) parts.push([`its treasury ${gaugeWord("t", t)}`, -2]);
  const score = parts.reduce((n, [, v]) => n + v, 0);
  return { ok: score >= PACT.tribute, score, need: PACT.tribute, why: `${parts.map(([l, n]) => `${l} ${signed(n)}`).join(", ")}: ${score}, needing ${PACT.tribute}` };
}

const sour = (g, a, b, most, to) => { const k = pairOf(a, b), n = Math.min(g.rel?.[k]?.[0] || 0, most); g.rel = { ...(g.rel || {}), [k]: [Math.max(-3, n), to] }; };
const drop = (g, p) => { g.pacts = g.pacts.filter((x) => x !== p); };

/**
 * The end of a turn, on its last day, before the gauges move: the player's clauses asked by card are answered,
 * breaches are found in what the rules let happen, and clauses run out. receipt: the turn's lines so far.
 * plans: the orders by card that stand. Lines may carry `gauge` pushes.
 */
export function settlePacts(g, receipt, to, geo, plans = []) {
  const lines = [], name = geo.name, me = g.player, year = to.slice(0, 4);
  g.pacts ||= [];
  for (const r of receipt) {
    const [kind, a, b] = r.fact || [];
    if (kind !== "war") continue;
    const p = pactOf(g, a, b);
    if (p) {
      drop(g, p);
      if (r.verb === "WAR") { g.word = { ...(g.word || {}), [a]: to }; setCause(g, b, a, `a pact of non-aggression broken in ${year}`, to); lines.push({ ok: true, country: a, text: `${name(a)}: breaks its pact of non-aggression with ${name(b)}, and is known for it`, gauge: [[a, "s", -1, "a pact of non-aggression broken"]] }); }
    }
    for (const t of g.pacts.filter((x) => x.kind === "tribute" && pairOf(x.a, x.b) === pairOf(a, b))) drop(g, t);
  }
  for (const p of g.pacts.slice()) {
    if (!geo.known(p.a) || !geo.known(p.b) || !geo.holds(p.a) || !geo.holds(p.b)) { drop(g, p); continue; }
    const mine = p.a === me || p.b === me, months = monthsApart(p.since, to);
    if (p.kind === "peace" && months >= PACT.years * 12) { drop(g, p); if (mine) lines.push({ ok: true, text: `The pact of non-aggression between ${name(p.a)} and ${name(p.b)} runs out after ${PACT.years} years` }); }
    if (p.kind !== "tribute") continue;
    const stops = plans.some((x) => x.kind === "pact" && x.sub === "stop" && x.target === p.a && p.b === me);
    if (stops || mightOf(geo, p.b) >= mightOf(geo, p.a)) {
      drop(g, p); setCause(g, p.a, p.b, `tribute refused in ${year}`, to); sour(g, p.a, p.b, -2, to);
      lines.push({ ok: true, country: p.b, text: `${name(p.b)}: stops paying tribute to ${name(p.a)}${stops ? "" : ` (might ${mightOf(geo, p.b)} against ${mightOf(geo, p.a)}: no longer the weaker)`}` });
    } else if (months >= PACT.most * 12) { drop(g, p); if (mine) lines.push({ ok: true, text: `The tribute ${name(p.b)} paid ${name(p.a)} ends after ${PACT.most} years` }); }
  }
  if (g.mode === "citizen") return lines;
  for (const x of plans.filter((p) => p.kind === "pact" && p.sub !== "stop")) {
    const ans = pactAnswer(g, geo, me, x.target, x.sub), b = x.target, what = x.sub === "peace" ? "a pact of non-aggression" : "a yearly tribute";
    if (ans.no) { lines.push({ ok: false, country: me, text: `${name(me)}: ${what} with ${name(b) || b} is refused: ${ans.no}` }); continue; }
    if (x.sub === "peace") {
      if (ans.ok) g.pacts.push({ kind: "peace", a: [me, b].sort()[0], b: [me, b].sort()[1], since: to });
      lines.push({ ok: ans.ok, country: me, text: `${name(me)}: ${ans.ok ? "signs" : "proposes"} a pact of non-aggression ${ans.ok ? "with" : "to"} ${name(b)}, which ${ans.ok ? "agrees" : "refuses"} (${ans.why})` });
    } else if (ans.ok) {
      g.pacts.push({ kind: "tribute", a: me, b, since: to }); sour(g, me, b, -1, to);
      lines.push({ ok: true, country: b, text: `${name(b)}: agrees to pay ${name(me)} a yearly tribute rather than refuse it (${ans.why})`, gauge: [[me, "m", 1, "tribute agreed"]] });
    } else {
      sour(g, me, b, (g.rel?.[pairOf(me, b)]?.[0] || 0) - 1, to);
      lines.push({ ok: true, country: b, text: `${name(b)}: refuses ${name(me)}'s demand for tribute (${ans.why})`, gauge: [[me, "m", -1, "a demand for tribute refused"]] });
    }
  }
  return lines;
}

/** Lines for the prompt: the clauses the player's country is bound by, and the spheres around it. */
export function pactLines(g, geo, near = []) {
  const me = g.player, mine = (g.pacts || []).filter((p) => p.a === me || p.b === me).map((p) => (p.kind === "peace" ? `a pact of non-aggression with ${p.a === me ? p.b : p.a} until ${Number(p.since.slice(0, 4)) + PACT.years}` : p.a === me ? `${p.b} pays it tribute` : `it pays tribute to ${p.a}`));
  const close = new Set([me, ...near]), around = [...spheres(g, geo)].filter(([p, list]) => close.has(p) || list.some((c) => close.has(c))).slice(0, 6).map(([p, list]) => `${p} over ${list.slice(0, 6).join(", ")}`);
  return [
    ...(mine.length ? [`- Clauses that bind the player's country, kept by the rules (war on a pact partner is a breach, and costs it at home and abroad): ${mine.join("; ")}`] : []),
    ...(around.length ? [`- Spheres of influence near the player, read by the rules from treaties (a much stronger partner stands over each): ${around.join("; ")}`] : []),
  ];
}

/** Clauses from a save: two countries on the map, a kind the rules know, a date. */
export const keepPacts = (s, known) => ({ pacts: (Array.isArray(s.pacts) ? s.pacts : []).filter((p) => p && ["peace", "tribute"].includes(p.kind) && known(p.a) && known(p.b) && p.a !== p.b && /^\d{4}-\d{2}-\d{2}$/.test(p.since || "")).slice(0, 80).map((p) => ({ kind: p.kind, a: p.a, b: p.b, since: p.since })) });
