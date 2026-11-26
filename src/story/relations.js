// SPDX-License-Identifier: AGPL-3.0-or-later
// Relations, and the answer a country gives to a treaty. Rules only: whole numbers, no chance, no AI.
// Every pair of countries stands somewhere from -3 (hostile) to +3 (close). Only what countries do moves it:
//   war: -3 at once, for both sides and every ally who joins. Peace: up to -2.
//   a treaty signed: +1. A treaty ended: -2, and the one who ended it is known for it for two years.
//   a province handed over by agreement: +1. A pair rises at most one step a turn.
//   left alone, a bad relation eases one step a year, and a good one with no treaty cools one step in two years.
// A country asked for a treaty adds up a score and says it: twice the relation, +2 for a shared enemy, -3 when the
// asker is tied to its enemy, -3 when the asker fights its partner, -2 for a treaty the asker ended in the last two
// years, and for defence or alliance +1 for a much stronger asker or -1 for a much weaker one. Trade needs 0,
// defence 2, an alliance 4. The same sum answers the player and every other country.

export const REL = ["hostile", "bitter", "cool", "neutral", "warm", "friendly", "close"];
export const NEED = { trade: 0, defence: 2, alliance: 4 };
/** A kind of treaty in words: "a trade treaty", "an alliance treaty". */
export const treatyName = (kind) => `${kind === "alliance" ? "an" : "a"} ${kind} treaty`;
const pair = (a, b) => [a, b].sort().join("|");
const clamp = (n) => Math.max(-3, Math.min(3, n));
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const fighting = (g, c) => g.wars.filter((w) => w.pair.split("|").includes(c)).map((w) => w.pair.split("|").find((x) => x !== c));
const partners = (g, c) => g.treaties.filter((t) => t.pair.split("|").includes(c)).map((t) => t.pair.split("|").find((x) => x !== c));
/** Whole months from one date to a later one, both YYYY-MM-DD. */
export function monthsApart(a, b) {
  const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}

/** Where two countries stand, -3 to 3. At war is always -3; a treaty is never below +1; unknown pairs are 0. */
export function relOf(g, a, b) {
  const k = pair(a, b);
  if (g.wars.some((w) => w.pair === k)) return -3;
  const n = g.rel?.[k]?.[0] || 0;
  return n < 1 && g.treaties.some((t) => t.pair === k) ? 1 : n;
}
export const relWord = (n) => REL[clamp(n) + 3];
const put = (g, a, b, n) => { g.rel ||= {}; if (clamp(n)) g.rel[pair(a, b)] = [clamp(n), g.date]; else delete g.rel[pair(a, b)]; };

/**
 * Move relations for one thing the rules let happen. fact: [kind, a, b] as the receipt records it.
 * rose: the pairs that have already risen this turn (a Set the caller keeps for the turn).
 */
export function relate(g, fact, rose) {
  const [kind, a, b] = fact, k = pair(a, b || a), now = b ? relOf(g, a, b) : 0;
  // a new treaty lifts what was stored (the treaty itself already reads as warm); a handover lifts where they stand
  const up = (from) => { if (!rose.has(k)) { rose.add(k); put(g, a, b, from + 1); } };
  if (kind === "war") put(g, a, b, -3);
  else if (kind === "peace") put(g, a, b, -2);
  else if (kind === "treaty") up(g.rel?.[k]?.[0] || 0);
  else if (kind === "gave") up(now);
  else if (kind === "broke") { put(g, a, b, now - 2); g.word = { ...(g.word || {}), [a]: g.date }; }
  else if (kind === "fell") for (const p of Object.keys(g.rel || {})) if (p.split("|").includes(a)) delete g.rel[p];
}

/**
 * The end of a turn, on its last day: relations left alone drift toward neutral, and offers to the player that are a
 * year old, or that no longer make sense, lapse. Returns receipt lines for what the player would notice.
 */
export function settleRelations(g, to, name) {
  const lines = [], me = g.player;
  for (const [k, [n, at]] of Object.entries(g.rel || {})) {
    const [a, b] = k.split("|"), months = monthsApart(at, to), bound = g.treaties.some((t) => t.pair === k);
    if (g.wars.some((w) => w.pair === k)) continue;
    const next = n < 0 && months >= 12 ? n + 1 : n > 0 && !bound && months >= 24 ? n - 1 : n;
    if (next === n) continue;
    if (next) g.rel[k] = [next, to]; else delete g.rel[k];
    if (a === me || b === me) lines.push({ ok: true, text: `${name(a === me ? b : a)}: with time, its relations with ${name(me)} ${next > n ? "ease" : "cool"} to ${relWord(next)} (${signed(next)})` });
  }
  const seen = new Set();
  g.offers = (g.offers || []).filter((o) => {
    const k = `${o.from}:${o.kind}`, war = g.wars.some((w) => w.pair === pair(o.from, me));
    if (seen.has(k) || monthsApart(o.date, to) >= 12 || (o.kind === "peace") !== war) return false;
    seen.add(k); return true;
  });
  for (const [c, at] of Object.entries(g.word || {})) if (monthsApart(at, to) >= 24) delete g.word[c];
  return lines;
}

/**
 * Whether `to` would sign a treaty of this kind with `from`, and why, before it is asked or after.
 * might(code) gives a country's might. Returns {ok, score, need, parts: [[label, value]], why}.
 */
export function treatyAnswer(g, from, to, kind, might) {
  const rel = relOf(g, from, to), need = NEED[kind] ?? 0, parts = [[`relations ${relWord(rel)}`, 2 * rel]];
  const foes = fighting(g, to), mine = fighting(g, from), gap = might(from) - might(to);
  if (mine.some((c) => foes.includes(c))) parts.push(["a shared enemy", 2]);
  const tied = partners(g, from).find((c) => foes.includes(c)), fought = partners(g, to).find((c) => c !== from && mine.includes(c));
  if (tied) parts.push([`a treaty with its enemy ${tied}`, -3]);
  if (fought) parts.push([`a war with its partner ${fought}`, -3]);
  if (g.word?.[from]) parts.push([`a treaty ended in ${g.word[from].slice(0, 4)}`, -2]);
  if (kind !== "trade" && gap >= 2) parts.push(["a much stronger partner", 1]);
  if (kind !== "trade" && gap <= -4) parts.push(["a much weaker partner", -1]);
  const score = parts.reduce((s, [, n]) => s + n, 0);
  return { ok: score >= need, score, need, parts, why: `${parts.map(([l, n]) => `${l} ${signed(n)}`).join(", ")}: ${score}, needing ${need}` };
}

/** Lines for the prompt: where the player's country stands with others, the strongest feelings first, at most twelve. */
export function relationLines(g) {
  const me = g.player, seen = new Map();
  for (const k of [...Object.keys(g.rel || {}), ...g.wars.map((w) => w.pair), ...g.treaties.map((t) => t.pair)]) {
    const other = k.split("|").includes(me) && k.split("|").find((c) => c !== me);
    if (other && relOf(g, me, other)) seen.set(other, relOf(g, me, other));
  }
  const list = [...seen].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]) || (x[0] < y[0] ? -1 : 1)).slice(0, 12);
  return [`- Relations with the player's country, from -3 hostile to +3 close (others are neutral): ${list.map(([c, n]) => `${c} ${relWord(n)} ${signed(n)}`).join(", ") || "all neutral"}`];
}
