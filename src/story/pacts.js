// SPDX-License-Identifier: AGPL-3.0-or-later
// Spheres of influence, and two treaty clauses that bind: a pact of non-aggression, and tribute. Rules only.
// A sphere. A country stands in the sphere of a defence or alliance partner whose might is at least three above
// its own (the strongest such partner), and of any country it pays tribute to. Nothing is signed to make one: it
// is read from the treaties. The patron already shields it in a crisis and has a cause when it is attacked.
// A pact of non-aggression. Asked by card or by a PACT move and answered by the sum a trade treaty uses, +1 when a
// country at least two stronger than both stands beside both by land (small neighbours bind each other in a great
// power's shadow), needing 1. It lasts five years. War between the two is not refused: it is a breach. The country that declares it is known for it for two
// years (every treaty answer counts it), loses a step of stability, and the other holds a cause for five years.
// Tribute. A country may demand a yearly tribute of a weaker one beside it, by land or across a narrow sea. The country asked adds up a score and says it:
// the gap in might (3 at most), +1 for another war to fight, +1 or +2 when it is shaken or in revolt, -2 when a
// treaty partner at least as strong as the asker stands behind it, -2 when its treasury is strained or empty. At 4
// it pays; otherwise it refuses, which costs the asker a step of mandate and of relations. While it pays, the
// payer's treasury settles one step lower and the receiver's one step higher (state.js), and signing it leaves the
// pair cool. A country pays one other at a time. It stops when the payer is no longer the weaker, when the two go to war, or after ten years;
// a payer that stops while still bound gives the receiver a cause.
// Round three (ruling 149): every country is bound by the same rules. A PACT or TRIBUTE move, from the AI or from
// the rules-only turn (rivals.js), is answered by the sums above and written in the receipt and the chronicle.
// Nobody is made to bind the player's country: a pact meant for it says whether it would be agreed, and the
// player asks from the card; tribute is never demanded of the player by a move.
import { monthsApart, treatyAnswer } from "./relations.js";
import { gaugeOf, gaugeWord, setCause } from "./state.js";
import { mightOf, strengthOf } from "./war.js";

export const PACT = { need: 1, years: 5, tribute: 4, most: 10, gap: 3, fear: 2 };
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const pairOf = (a, b) => [a, b].sort().join("|");
// read from the game as worldrules.js reads them; kept here so that file can judge PACT and TRIBUTE moves by this one
const other = (p, c) => p.split("|").find((x) => x !== c);
const atWar = (g, a, b) => g.wars.some((w) => w.pair === pairOf(a, b));
const treatyOf = (g, a, b) => g.treaties.find((t) => t.pair === pairOf(a, b));
const warsOf = (g, c) => g.wars.filter((w) => w.pair.split("|").includes(c)).map((w) => other(w.pair, c));
const treatiesOf = (g, c) => g.treaties.filter((t) => t.pair.split("|").includes(c)).map((t) => ({ with: other(t.pair, c), kind: t.kind }));
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

/** The strongest country beside both by land that is at least two stronger than either, or "": what two small neighbours both fear. */
export function fearOf(g, geo, a, b) {
  const near = { [a]: new Set(), [b]: new Set() }, top = Math.max(mightOf(geo, a), mightOf(geo, b)) + PACT.fear;
  for (const id of geo.all || []) { const o = geo.owner(id); if (o === a || o === b) for (const n of geo.neighbours(id)) near[o].add(geo.owner(n)); }
  const kept = (c) => treatiesOf(g, c).filter((t) => t.kind !== "trade").map((t) => t.with), safe = new Set([a, b, ...kept(a), ...kept(b)]);
  return [...near[a]].filter((c) => near[b].has(c) && !safe.has(c) && mightOf(geo, c) >= top).sort((x, y) => mightOf(geo, y) - mightOf(geo, x) || (x < y ? -1 : 1))[0] || "";
}

/** What `to` would answer if `from` asked it for a clause today: {no} when it cannot be asked, else {ok, score, need, why}. */
export function pactAnswer(g, geo, from, to, kind) {
  if (from === to || !geo.known(to) || !geo.holds(to)) return { no: "that is not a country with land" };
  if (atWar(g, from, to)) return { no: `at war with ${geo.name(to)}: make peace first` };
  if (kind === "peace") {
    if (pactOf(g, from, to)) return { no: "that pact already stands" };
    if (treatyOf(g, from, to) && treatyOf(g, from, to).kind !== "trade") return { no: "a stronger treaty already binds you" };
    const a = treatyAnswer(g, from, to, "trade", (c) => strengthOf(g, geo, c)), fear = fearOf(g, geo, from, to);
    const parts = [...a.parts, ...(fear ? [[`${geo.name(fear)} beside both and stronger than both`, 1]] : [])], score = parts.reduce((n, [, v]) => n + v, 0);
    return { ok: score >= PACT.need, score, need: PACT.need, why: `${parts.map(([l, n]) => `${l} ${signed(n)}`).join(", ")}: ${score}, needing ${PACT.need}` };
  }
  if (tributeOf(g, from, to)) return { no: "it already pays you tribute" };
  const lord = (g.pacts || []).find((p) => p.kind === "tribute" && p.b === to)?.a; // round 3: one country is paid, not two
  if (lord) return { no: `${geo.name(to)} already pays tribute to ${geo.name(lord)}` };
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
 * One country asks another for a clause on a day, and the answer is carried out: the one rule behind the player's
 * card, an AI's move and the rules-only turn. Returns {no} when it cannot be asked, else {ok, as, text, fact, gauge}:
 * `as` is the country the receipt line speaks for, `text` its words after the name.
 */
export function askClause(g, geo, from, to, kind, date) {
  const ans = pactAnswer(g, geo, from, to, kind), name = geo.name, [a, b] = [from, to].sort();
  if (ans.no) return { no: ans.no };
  g.pacts ||= [];
  if (kind === "peace") {
    if (ans.ok) g.pacts.push({ kind: "peace", a, b, since: date });
    return { ok: ans.ok, as: from, text: `${ans.ok ? "signs" : "proposes"} a pact of non-aggression ${ans.ok ? "with" : "to"} ${name(to)}, which ${ans.ok ? "agrees" : "refuses"} (${ans.why})`, ...(ans.ok ? { fact: ["pact", a, b] } : {}) };
  }
  if (ans.ok) {
    g.pacts.push({ kind: "tribute", a: from, b: to, since: date }); sour(g, from, to, -1, date);
    return { ok: true, as: to, text: `agrees to pay ${name(from)} a yearly tribute rather than refuse it (${ans.why})`, gauge: [[from, "m", 1, "tribute agreed"]], fact: ["tribute", to, from] };
  }
  sour(g, from, to, (g.rel?.[pairOf(from, to)]?.[0] || 0) - 1, date);
  return { ok: true, as: to, text: `refuses ${name(from)}'s demand for tribute (${ans.why})`, gauge: [[from, "m", -1, "a demand for tribute refused"]] };
}

/** A PACT or TRIBUTE move, judged as any other move is (worldrules.js): {ok, why, as, fact, gauge}. */
export function clauseMove(g, m, geo, { isMe }) {
  const c = m.country, t = m.target, kind = m.verb === "PACT" ? "peace" : "tribute", what = kind === "peace" ? "a pact of non-aggression" : "a yearly tribute";
  if (!geo.known(t) || t === c) return { ok: false, why: `${what} refused: "${m.target}" is not a country` };
  if (t === g.player && g.mode !== "citizen" && !isMe) {
    if (kind === "tribute") return { ok: false, why: "would demand a yearly tribute of you, but no move binds your country: nothing is owed" };
    const a = pactAnswer(g, geo, t, c, "peace");
    return { ok: false, why: a.no ? `would offer you a pact of non-aggression, but cannot (${a.no})` : `would ${a.ok ? "sign" : "not sign"} a pact of non-aggression with you (${a.why}); it is yours to propose, from its card` };
  }
  // the player's own order by card for the same clause is this move: it is not asked twice
  if (isMe) g.plans = (g.plans || []).filter((p) => !(p.kind === "pact" && p.sub === kind && p.target === t));
  const r = askClause(g, geo, c, t, kind, g.date);
  return r.no ? { ok: false, why: `${what} with ${geo.name(t)} is refused: ${r.no}` } : { ok: r.ok, why: r.text, as: r.as, fact: r.fact, gauge: r.gauge };
}

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
    const b = x.target, what = x.sub === "peace" ? "a pact of non-aggression" : "a yearly tribute", r = askClause(g, geo, me, b, x.sub, to);
    if (r.no) lines.push({ ok: false, country: me, text: `${name(me)}: ${what} with ${name(b) || b} is refused: ${r.no}` });
    else lines.push({ ok: r.ok, country: r.as, text: `${name(r.as)}: ${r.text}`, ...(r.fact ? { fact: r.fact } : {}), ...(r.gauge ? { gauge: r.gauge } : {}) });
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
