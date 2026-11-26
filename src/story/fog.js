// SPDX-License-Identifier: AGPL-3.0-or-later
// Fog and rumours: what the player's side knows of each other country. Rules only: no AI decides it.
// The rules always keep the truth, and the turn's writer is told it. What the player is shown, and what chats and
// the council are told, goes by four tiers:
//   clear (3): your own country, and a defence or alliance partner. Everything, with its reasons.
//   reported (2): a trade partner, an enemy at war, a neighbour by land or narrow sea, a country in a crisis with
//     you, and anyone you talked with in the last year. Its gauges, and what it would answer, with the sum.
//   rumoured (1): a country you stand somewhere with, or talked with in the last three years. Its gauges as rumour:
//     each may be a step off (one time in three, fixed for the year by the game's seed). No answers.
//   dark (0): everyone else. Its name, its land and its might by the table.
// An Envoy on the council (the foreign seat, filled) lifts every country below clear by one tier.
// Other rules may teach the player something for a while: learn(g, country, tier, date). What is learned holds for
// a year, then stands one tier lower for two more.
import { draw100 } from "./line.js";
import { monthsApart } from "./relations.js";
import { GAUGES, gaugeOf, gaugeWord } from "./state.js";

export const TIERS = ["dark", "rumoured", "reported", "clear"];
export const FOG = { fresh: 12, stale: 36, off: 34 };
const has = (list, a, b, kinds) => list.some((x) => x.pair === [a, b].sort().join("|") && (!kinds || kinds.includes(x.kind)));

/** Teach the player's side something of a country: it is known at this tier from this date, unless more is known. */
export function learn(g, c, tier, date = g.date) {
  if (c === g.player || tierAt(g.seen?.[c], date) > tier) return;
  g.seen = { ...(g.seen || {}), [c]: [Math.max(1, Math.min(3, tier)), date] };
}
const tierAt = (seen, now) => { if (!seen) return 0; const m = monthsApart(seen[1], now); return m < FOG.fresh ? seen[0] : m < FOG.stale ? seen[0] - 1 : 0; };

/** How well the player's side knows a country today: {tier, word, why}. near: its neighbours by land or narrow sea. */
export function knowledge(g, c, near = [], now = g.date) {
  const me = g.player, learned = tierAt(g.seen?.[c], now);
  let [tier, why] = c === me ? [3, "your own country"] : has(g.treaties, me, c, ["defence", "alliance"]) ? [3, "a treaty partner"] : has(g.wars, me, c) ? [2, "an enemy at war"]
    : has(g.treaties, me, c) ? [2, "a trade partner"] : near.includes(c) ? [2, "a neighbour"] : g.crisis && [g.crisis.a, g.crisis.b].includes(me) && [g.crisis.a, g.crisis.b].includes(c) ? [2, "a crisis between you"]
    : g.rel?.[[me, c].sort().join("|")] ? [1, "dealings in the past"] : [0, "no border, treaty or talks"];
  if (learned > tier) [tier, why] = [learned, learned === g.seen[c][0] ? "talks or a report within the year" : "an old report"];
  if (tier < 3 && c !== me && g.mode !== "citizen" && g.council?.seats?.foreign) { tier++; why += ", and your Envoy"; }
  return { tier, word: TIERS[tier], why };
}

/** One gauge of a country as the player's side has it: [number or null, whether it is only rumour]. */
export function seenGauge(g, c, k, tier, now = g.date) {
  const n = gaugeOf(g, c, k);
  if (tier >= 2) return [n, false];
  if (tier < 1) return [null, false];
  const d = draw100(g.seed, `rumour:${c}:${k}:${now.slice(0, 4)}`);
  return [d > FOG.off ? n : Math.max(0, Math.min(4, n + (d % 2 ? 1 : -1))), true];
}
/** A country's three gauges in the player's words: "shaken, sound, trusted", "said to be ...", or "" when dark. */
export function seenWords(g, c, tier, now = g.date) {
  if (tier < 1) return "";
  return `${tier < 2 ? "said to be " : ""}${Object.keys(GAUGES).map((k) => gaugeWord(k, seenGauge(g, c, k, tier, now)[0])).join(", ")}`;
}

/** The end of a turn: a country talked with this turn is known as reported from today; old knowledge is dropped. */
export function settleFog(g, to) {
  for (const chat of g.chats || []) if (chat.messages.some((m) => m.turn === g.turn)) for (const c of chat.with) learn(g, c, 2, to);
  for (const [c, seen] of Object.entries(g.seen || {})) if (!tierAt(seen, to)) delete g.seen[c];
}

/** Lines for a chat or the council: what this side knows of the countries named, never more than its tier allows. */
export function fogLines(g, codes, near = []) {
  const told = [...new Set(codes)].filter((c) => c !== g.player).slice(0, 8).map((c) => { const k = knowledge(g, c, near), w = seenWords(g, c, k.tier); return `${c} ${w ? `${k.word}: ${w}` : "dark: nothing reliable"}`; });
  return told.length ? [`- What the player's side knows of others (stability, treasury, mandate). Speak only from this; a rumour may be wrong: ${told.join("; ")}`] : [];
}

/** What is learned, from a save: countries on the map, tiers 1 to 3, dates as dates. */
export const keepFog = (s, known) => ({ seen: Object.fromEntries(Object.entries(s.seen && typeof s.seen === "object" && !Array.isArray(s.seen) ? s.seen : {}).filter(([c, v]) => known(c) && Array.isArray(v) && [1, 2, 3].includes(v[0]) && /^\d{4}-\d{2}-\d{2}$/.test(v[1] || "")).map(([c, v]) => [c, [v[0], v[1]]])) });
