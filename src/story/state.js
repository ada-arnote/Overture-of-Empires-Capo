// SPDX-License-Identifier: AGPL-3.0-or-later
// The state of a country, kept by the rules: three gauges in words, and the causes countries hold against each
// other. Whole numbers, no chance, no AI. Every gauge runs 0 to 4, starts in the middle, moves at most one step a
// turn and always for a reason the receipt gives.
//   Stability: land lost -1 (never below shaken), a war begun without a cause -1, peace +1 (to calm), an attack
//     thrown back +1, a quiet year after trouble +1, a year at war on an empty treasury -1.
//   Treasury: a year at war -1; a year at peace +1 up to sound, to full with a treaty, to overflowing with three.
//   Mandate: land taken +1, a demand met +1, a failed attack -1, a demand refused -1; after two years it drifts
//     back to the middle.
// What they do: a country in revolt (stability 0) declares no war and makes no attack; an empty treasury declares
// no war. Crises, ambitions and the turn's beat read them too.
// A cause for war lasts five years: land taken from you, a treaty ended on you, a demand refused. Land that was
// yours, land you claim and a treaty partner under attack are causes for as long as they are so. Peace settles
// the causes between two countries.
import { monthsApart } from "./relations.js";

export const GAUGES = {
  s: ["Stability", ["in revolt", "shaken", "steady", "calm", "united"]],
  t: ["Treasury", ["empty", "strained", "sound", "full", "overflowing"]],
  m: ["Mandate", ["rejected", "doubted", "accepted", "trusted", "acclaimed"]],
};
const MID = 2, LAPSE = 60;
export const gaugeOf = (g, c, k) => g.gauge?.[c]?.[k]?.[0] ?? MID;
export const gaugeWord = (k, n) => GAUGES[k][1][n];
/** A country's three gauges in words: "shaken, sound, trusted". */
export const gaugeWords = (g, c) => Object.keys(GAUGES).map((k) => gaugeWord(k, gaugeOf(g, c, k))).join(", ");
const fights = (g, c) => g.wars.filter((w) => w.pair.split("|").includes(c)).map((w) => w.pair.split("|").find((x) => x !== c));
const bound = (g, c, trade) => g.treaties.filter((t) => t.pair.split("|").includes(c) && (trade || t.kind !== "trade")).map((t) => t.pair.split("|").find((x) => x !== c));

/** Why `a` may go to war with `b` on the day `now`, in a few words, or "" when it has no cause. */
export function causeOf(g, geo, a, b, now = g.date) {
  const kept = g.cause?.[`${a}>${b}`];
  if (kept && monthsApart(kept[1], now) < LAPSE) return kept[0];
  for (const [id, o] of Object.entries(g.owners || {})) if (o === b && geo.place(id)?.country === a) return `${geo.place(id).name} was its own`;
  const claim = (geo.claimed?.() || []).find(([id, who]) => who === a && geo.owner(id) === b);
  if (claim) return `it claims ${geo.place(claim[0]).name}`;
  const friend = bound(g, a).find((p) => p !== b && fights(g, p).includes(b));
  return friend ? `its treaty with ${geo.name(friend)}` : "";
}
export const setCause = (g, a, b, why, now) => { g.cause = { ...(g.cause || {}), [`${a}>${b}`]: [why, now] }; };

/** The reason the rules stop a move before it is judged, or "": revolt at home, or an empty treasury. */
export function barred(g, m) {
  if (m.verb !== "WAR" && m.verb !== "ATTACK") return "";
  if (gaugeOf(g, m.country, "s") === 0) return `${m.verb.toLowerCase()} refused: it is in revolt at home, and no army marches`;
  return m.verb === "WAR" && gaugeOf(g, m.country, "t") === 0 ? "war refused: its treasury is empty" : "";
}

/**
 * The end of a turn, on its last day `to`: read what the rules let happen (the receipt's own facts), let time
 * pass, and move each gauge at most one step. Returns receipt lines for the player's country and its enemies.
 */
export function settleState(g, receipt, to, geo) {
  const push = new Map(), me = g.player, year = to.slice(0, 4), stamp = new Set();
  const add = (c, k, d, why, cap = 4, floor = 0) => { const key = `${c}:${k}`; push.set(key, [...(push.get(key) || []), [d, why, cap, floor]]); };
  for (const r of receipt) {
    const [kind, a, b] = r.fact || [];
    if (r.check?.band === "failed") { add(r.country, "m", -1, "an attack thrown back"); const o = geo.owner(r.check.key.split(":")[2]); if (o && o !== r.country) add(o, "s", 1, "an attack thrown back"); }
    if (r.crisis) { const [how, x, y] = r.crisis; if (how === "yield") { add(y, "s", -1, "land yielded under threat"); add(x, "m", 1, "a demand met"); } else add(x, "m", -1, "a demand refused"); }
    if (kind === "war") { if (!causeOf(g, geo, a, b, to)) add(a, "s", -1, `a war on ${geo.name(b)} without a cause`); stamp.add(a).add(b); }
    else if (kind === "took") { add(a, "m", 1, "land taken"); add(b, "s", -1, "land lost", 4, 1); setCause(g, b, a, `land taken in ${year}`, to); }
    else if (kind === "broke") setCause(g, b, a, `a treaty ended in ${year}`, to);
    else if (kind === "peace") { for (const c of [a, b]) { add(c, "s", 1, "peace", 3); stamp.add(c); } for (const k of [`${a}>${b}`, `${b}>${a}`]) delete g.cause?.[k]; }
    else if (kind === "fell") { delete g.gauge?.[a]; for (const k of Object.keys(g.cause || {})) if (k.split(">").includes(a)) delete g.cause[k]; }
  }
  g.gauge ||= {};
  const live = new Set([me, ...g.wars.flatMap((w) => w.pair.split("|")), ...Object.keys(g.gauge), ...[...push.keys()].map((k) => k.split(":")[0])]);
  for (const c of live) {
    if (!geo.known(c) || geo.holds(c) === 0) { delete g.gauge[c]; continue; }
    const e = (g.gauge[c] ||= {}), war = fights(g, c).length > 0, due = (k, n) => monthsApart(e[k][1], to) >= n;
    for (const k of Object.keys(GAUGES)) { e[k] ||= [MID, to, ""]; if (k === "t" && stamp.has(c)) e[k][1] = to; }
    const [s, t, m] = ["s", "t", "m"].map((k) => e[k][0]), deals = bound(g, c, true).length, top = deals >= 3 ? 4 : deals ? 3 : 2;
    if (due("t", 12)) { if (war) add(c, "t", -1, "a year at war"); else if (t < top) add(c, "t", 1, deals ? "a year of trade" : "a year of peace"); else if (t > top) add(c, "t", -1, "trade lost"); }
    if (due("s", 12)) { if (war && t === 0) add(c, "s", -1, "a year at war on an empty treasury"); else if (!war && s < MID) add(c, "s", 1, "a quiet year"); }
    if (m !== MID && due("m", 24)) add(c, "m", m > MID ? -1 : 1, "time passes");
  }
  const lines = [], foes = fights(g, me);
  for (const [key, list] of push) {
    const [c, k] = key.split(":"), e = g.gauge[c], net = Math.sign(list.reduce((n, [d]) => n + d, 0));
    if (!e || !net) continue;
    const [, why, cap, floor] = list.find(([d]) => d === net), old = e[k][0], next = Math.max(Math.min(old, floor), Math.min(Math.max(old, cap), old + net));
    if (next === old) continue;
    e[k] = [next, to, why];
    if (c === me || foes.includes(c)) lines.push({ ok: true, country: c, text: `${geo.name(c)}: its ${GAUGES[k][0].toLowerCase()} ${next > old ? "rises" : "falls"} to ${gaugeWord(k, next)} (${why})` });
  }
  // a country at rest, in the middle on every gauge and with no treaty to grow rich on, is not kept
  for (const [c, e] of Object.entries(g.gauge)) if (c !== me && !fights(g, c).length && !bound(g, c, true).length && Object.values(e).every(([n]) => n === MID)) delete g.gauge[c];
  return lines;
}

/** Lines for the prompt: the state of the player's country and of those it fights, and the causes it holds. */
export function stateLines(g, geo, near = []) {
  const me = g.player, list = [me, ...fights(g, me), ...near.filter((c) => g.gauge?.[c])].filter((c, i, all) => all.indexOf(c) === i).slice(0, 8);
  const causes = [...new Set([...near, ...Object.keys(g.cause || {}).filter((k) => k.startsWith(`${me}>`)).map((k) => k.split(">")[1])])].map((c) => [c, causeOf(g, geo, me, c)]).filter(([c, why]) => why && c !== me).slice(0, 6);
  return [
    `- The state of countries, kept by the rules (stability, treasury, mandate; any other country is steady, sound, accepted): ${list.map((c) => `${c} ${gaugeWords(g, c)}`).join("; ")}`,
    `- Causes for war the player's country holds (a war begun without one shakes it at home): ${causes.map(([c, why]) => `against ${c} (${why})`).join("; ") || "none"}`,
  ];
}

/** Gauges and causes from a save: only countries on the map, whole numbers 0 to 4, each with its date. */
export function keepState(s, known) {
  const DATE = /^\d{4}-\d{2}-\d{2}$/, obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const cell = (v) => Array.isArray(v) && Number.isInteger(v[0]) && v[0] >= 0 && v[0] <= 4 && DATE.test(v[1] || "");
  const gauge = Object.fromEntries(Object.entries(obj(s.gauge)).filter(([c, e]) => known(c) && e && typeof e === "object" && Object.keys(GAUGES).every((k) => cell(e[k])))
    .map(([c, e]) => [c, Object.fromEntries(Object.keys(GAUGES).map((k) => [k, [e[k][0], e[k][1], String(e[k][2] || "").slice(0, 80)]]))]));
  const cause = Object.fromEntries(Object.entries(obj(s.cause)).filter(([k, v]) => k.split(">").length === 2 && k.split(">").every(known) && Array.isArray(v) && typeof v[0] === "string" && DATE.test(v[1] || "")).map(([k, v]) => [k, [v[0].slice(0, 80), v[1]]]));
  return { gauge, cause };
}
