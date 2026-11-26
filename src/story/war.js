// SPDX-License-Identifier: AGPL-3.0-or-later
// Wars that end, and strength that changes. Rules only: whole numbers, no chance, no AI.
// Weariness, 0 to 6, for each side of a war: one point for every six months it has run, and one for every two
// provinces lost in it.
// Peace gets an answer, as treaties do. The side asked adds up a score and says it: its weariness, +1 for every
// province between the two in the war's score, at most +3 (the side ahead keeps what it took, the side behind stops
// the loss), and +1 when it has another war to fight. It needs 4.
// The terms are always the same: each keeps the land it holds. So the side ahead keeps what it took, and the side
// behind may ask for nothing.
// At the end of every turn, whatever the AI wrote: two other countries that would both say yes make peace; a
// country at war with the player that would say yes offers peace; and when either side reaches weariness 6 the
// rules make a white peace, for anyone. A truce of two years follows every peace: war between the two is refused.
// Strength: a country's might in a check is its might from the table, less one while its weariness is 3 or more,
// less one once it has lost a third of the land it began the game with, plus one once it has gained a third. Still
// 1 to 10, and shown with its parts.
import { monthsApart, relate } from "./relations.js";

// Invented numbers for a fiction, from 1 to 10. Countries not listed get 2, or 3 if they hold twelve provinces or more.
export const MIGHT = {
  USA: 10, CHN: 9, RUS: 9, IND: 8, GBR: 7, FRA: 7, DEU: 7, JPN: 7, KOR: 6, TUR: 6, ISR: 6, PAK: 6, IRN: 6, BRA: 6, ITA: 6, UKR: 5,
  EGY: 5, SAU: 5, AUS: 5, CAN: 5, IDN: 5, POL: 5, ESP: 5, VNM: 5, PRK: 5, TWN: 5, MEX: 4, THA: 4, ARG: 4, COL: 4, CHL: 4, ZAF: 4,
  NGA: 4, ETH: 4, DZA: 4, MAR: 4, IRQ: 4, GRC: 4, SWE: 4, NOR: 4, NLD: 4, KAZ: 4, PHL: 4, MYS: 4, SGP: 4, ARE: 4, FIN: 4, BLR: 3,
  PER: 3, VEN: 3, CUB: 3, SYR: 3, UZB: 3, MMR: 3, BGD: 3, NZL: 3, BEL: 3, CHE: 3, AUT: 3, PRT: 3, ROU: 3, CZE: 3, HUN: 3, AZE: 3,
  ARM: 2, GEO: 2, BOL: 2, ECU: 2, PRY: 2, URY: 2,
};
// the Game Master may set a country's might; otherwise the table, then size
export const mightOf = (geo, c) => geo.might?.(c) ?? MIGHT[c] ?? (geo.holds(c) >= 12 ? 3 : 2);

export const WAR = { step: 6, lost: 2, slow: 3, lead: 3, need: 4, most: 6, truce: 24 };
const pair = (a, b) => [a, b].sort().join("|");
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const warOf = (g, a, b) => g.wars.find((w) => w.pair === pair(a, b));
const took = (w, c) => w.took?.[c] || 0;
const foes = (g, c) => g.wars.filter((w) => w.pair.split("|").includes(c)).map((w) => w.pair.split("|").find((x) => x !== c));

/** Count one province taken in a war, for the war's score. */
export function countTaken(g, by, from) { const w = warOf(g, by, from); if (w) w.took = { ...(w.took || {}), [by]: took(w, by) + 1 }; }

/** How weary `c` is of its war with `foe` on a date: 0 to 6. */
export function weariness(g, c, foe, date = g.date) {
  const w = warOf(g, c, foe);
  return w ? Math.min(WAR.most, Math.floor(monthsApart(w.since, date) / WAR.step) + Math.floor(took(w, foe) / WAR.lost)) : 0;
}
/** A country's weariness: that of the war that has worn it most. */
export const wearyOf = (g, c, date = g.date) => Math.max(0, ...foes(g, c).map((f) => weariness(g, c, f, date)));

/** The land a country began the game with: what the map gives it, as changed by the game's starting world. */
function landAtStart(g, geo, c) {
  let n = geo.holds(c);
  for (const [id, o] of Object.entries(g.owners)) n += (geo.place(id).country === c) - (o === c);
  for (const [id, o] of Object.entries(g.start || {})) n += (o === c) - (geo.place(id).country === c);
  return n;
}

/** A country's strength now: {base, parts: [[label, value]], might}, might from 1 to 10. */
export function strength(g, geo, c) {
  const base = mightOf(geo, c), parts = [], now = geo.holds(c), was = landAtStart(g, geo, c);
  if (wearyOf(g, c) >= WAR.slow) parts.push(["weary of war", -1]);
  if (was > 0 && now * 3 <= was * 2) parts.push(["a third of its land lost", -1]);
  if (was > 0 && now * 3 >= was * 4) parts.push(["a third more land than it began with", 1]);
  if (g.sabot?.[c] > g.date) parts.push(["sabotaged", -1]); // missions hook: a year, from missions.js
  return { base, parts, might: Math.max(1, Math.min(10, base + parts.reduce((s, [, n]) => s + n, 0))) };
}
export const strengthOf = (g, geo, c) => strength(g, geo, c).might;
/** Strength in words: "might 4 (5 by the table, weary of war -1)". */
export const strengthLine = (s) => `might ${s.might}${s.parts.length ? ` (${s.base} by the table, ${s.parts.map(([l, n]) => `${l} ${signed(n)}`).join(", ")})` : ""}`;

/** Whether `to` would make peace with `from` on a date, and why: {ok, score, need, parts, why}. */
export function peaceAnswer(g, from, to, date = g.date) {
  const w = warOf(g, from, to), tired = weariness(g, to, from, date), net = w ? took(w, to) - took(w, from) : 0, parts = [];
  if (tired) parts.push([`weary of war ${tired} of ${WAR.most}`, tired]);
  if (net > 0) parts.push([`it is ${net} ahead and keeps what it took`, Math.min(WAR.lead, net)]);
  if (net < 0) parts.push([`it is ${-net} behind and losing land`, Math.min(WAR.lead, -net)]);
  if (foes(g, to).length > 1) parts.push(["another war to fight", 1]);
  const score = parts.reduce((s, [, n]) => s + n, 0);
  return { ok: !!w && score >= WAR.need, score, need: WAR.need, parts, why: `${parts.map(([l, n]) => `${l} ${signed(n)}`).join(", ") || "no reason yet to stop"}: ${score}, needing ${WAR.need}` };
}

/** Whether a truce stands between two countries on the game's date, and until when ("" when none). */
export function truceUntil(g, a, b) {
  const at = g.truce?.[pair(a, b)];
  if (!at || monthsApart(at, g.date) >= WAR.truce) return "";
  return `${Number(at.slice(0, 4)) + WAR.truce / 12}${at.slice(4, 7)}`;
}

/** End a war on a date: each keeps the land it holds, a truce begins, and a peace offer between them is spent. */
export function endWar(g, a, b, date = g.date) {
  g.wars = g.wars.filter((w) => w.pair !== pair(a, b));
  g.truce = { ...(g.truce || {}), [pair(a, b)]: date };
  g.offers = (g.offers || []).filter((o) => !(o.kind === "peace" && [a, b].includes(o.from) && [a, b].includes(g.player)));
}

/**
 * The end of a turn, on its last day: wars end by rule where the rules say they do, and truces run out.
 * Returns receipt lines, each one sentence; a peace carries its fact for relations and the chronicle.
 */
export function settleWars(g, to, name) {
  const lines = [], rose = new Set(), me = g.mode === "citizen" ? "" : g.player;
  const peace = (a, b, text) => { endWar(g, a, b, to); relate(g, ["peace", a, b], rose); lines.push({ ok: true, text, fact: ["peace", a, b] }); };
  for (const w of g.wars.slice()) {
    const [a, b] = w.pair.split("|"), wa = weariness(g, a, b, to), wb = weariness(g, b, a, to);
    if (wa >= WAR.most || wb >= WAR.most) { peace(a, b, `${name(a)} and ${name(b)}: worn out by their war (weariness ${wa} and ${wb} of ${WAR.most}), they stop by rule; a white peace, each keeps the land it holds`); continue; }
    if (a === me || b === me) {
      const foe = a === me ? b : a, ans = peaceAnswer(g, me, foe, to);
      if (ans.ok && !g.offers.some((o) => o.from === foe && o.kind === "peace")) { g.offers.push({ from: foe, kind: "peace", date: to }); lines.push({ ok: true, text: `${name(foe)}: offers you peace by rule (${ans.why}); accept it from your actions` }); }
      continue;
    }
    const x = peaceAnswer(g, a, b, to), y = peaceAnswer(g, b, a, to);
    if (x.ok && y.ok) peace(a, b, `${name(a)} and ${name(b)}: make peace by rule, both ready to stop (${name(a)}: ${y.why}; ${name(b)}: ${x.why}); each keeps the land it holds`);
  }
  for (const [k, at] of Object.entries(g.truce || {})) if (monthsApart(at, to) >= WAR.truce) delete g.truce[k];
  return lines;
}
