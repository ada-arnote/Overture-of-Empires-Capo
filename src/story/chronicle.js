// SPDX-License-Identifier: AGPL-3.0-or-later
// The chronicle: the story's memory, built by code and never by an AI call. Each turn leaves one line: what the
// rules decided (from the receipt's own records) and the one sentence the turn was told in. The newest nine turns
// stay as lines; older ones fold, ten turns at a time, into an era line; past four eras the two oldest join. So the
// chronicle a prompt carries is the same size at turn 200 as at turn 20, and nothing in it was made up to fit.
import { treatyName } from "./relations.js";

export const KEEP = { recent: 3, turns: 6, eras: 4, span: 10, line: 130, era: 110, told: 320, facts: 8 };
const ORDER = ["fell", "war", "peace", "took", "treaty", "broke", "gave", "no", "thread"];
const clip = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 3).trimEnd()}...` : t; };
const key = (f) => f.slice(0, f[0] === "treaty" || f[0] === "no" ? 4 : 3).join(":");
const counted = (k) => k === "took" || k === "gave";

/** Facts joined into one short list: land taken and handed over is counted, the rest named once; the gravest first. */
export function joinFacts(lists) {
  const seen = new Map();
  for (const f of lists.flat()) {
    if (!Array.isArray(f) || !ORDER.includes(f[0])) continue;
    const k = key(f), old = seen.get(k);
    if (old && counted(f[0])) old[3] += f[3] || 1;
    else if (!old) seen.set(k, counted(f[0]) ? [f[0], f[1], f[2], f[3] || 1] : [...f]);
  }
  return [...seen.values()].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0])).slice(0, KEEP.facts);
}
/** What the rules let happen in one turn, from its receipt. */
export const factsOf = (receipt) => joinFacts([(receipt || []).filter((r) => r.fact).map((r) => r.fact)]);

const WORDS = {
  fell: (n, a) => `${n(a)} lost its last land`,
  war: (n, a, b) => `${n(a)} declared war on ${n(b)}`,
  peace: (n, a, b) => `${n(a)} and ${n(b)} made peace`,
  took: (n, a, b, k) => `${n(a)} took ${k} province${k > 1 ? "s" : ""} from ${n(b)}`,
  treaty: (n, a, b, k) => `${n(a)} and ${n(b)} signed ${treatyName(k)}`,
  broke: (n, a, b) => `${n(a)} ended its treaty with ${n(b)}`,
  gave: (n, a, b, k) => `${n(a)} handed ${k} province${k > 1 ? "s" : ""} to ${n(b)}`,
  no: (n, a, b, k) => `${n(b)} refused ${n(a)} ${treatyName(k)}`,
  thread: (n, a) => `the thread "${a}" closed`,
};
/** Facts in words, with country names from name(code). */
export const factWords = (facts, name) => (facts || []).map(([k, ...rest]) => WORDS[k](name, ...rest)).join("; ");

/** Add one finished turn to the chronicle and fold what has grown old. entry is the turn's log entry. */
export function remember(g, entry) {
  const c = (g.chron ||= { eras: [], turns: [] });
  c.turns.push({ t: entry.turn, from: entry.from, to: entry.to, s: clip(entry.summary, 300), f: factsOf(entry.receipt), ...(entry.branch ? { b: entry.branch } : {}) });
  while (c.turns.length > KEEP.recent + KEEP.turns) {
    const old = c.turns.shift(), era = c.eras[c.eras.length - 1];
    if (era && era.n < KEEP.span) Object.assign(era, { t1: old.t, to: old.to, n: era.n + 1, f: joinFacts([era.f, old.f]), s: [era.s[0], clip(old.s, 70)] });
    else c.eras.push({ t0: old.t, t1: old.t, from: old.from, to: old.to, n: 1, f: old.f, s: [clip(old.s, 70)] });
  }
  while (c.eras.length > KEEP.eras) {
    const [a, b] = c.eras.splice(0, 2);
    c.eras.unshift({ t0: a.t0, t1: b.t1, from: a.from, to: b.to, n: KEEP.span, f: joinFacts([a.f, b.f]), s: [a.s[0], b.s[b.s.length - 1]] });
  }
  return c;
}

/** A chronicle for a game saved before there was one, from the turns its log still holds. */
export function chronicleFrom(log, nextTurn) {
  const g = { chron: { eras: [], turns: [] } };
  log.forEach((t, i) => remember(g, { ...t, turn: t.turn || nextTurn - log.length + i }));
  return g.chron;
}

const line = (facts, told, n) => clip([facts, told].filter(Boolean).join(". "), n);
/**
 * The chronicle as prompt lines, oldest first: eras, then older turns, then the last three turns told more fully.
 * Never more than four eras and nine turns, each clipped, whatever the length of the game. With eras false the era
 * lines are left out: they are the first thing a prompt that has grown too long gives up.
 */
export function chronicleLines(g, name, eras = true) {
  const c = g.chron || { eras: [], turns: [] }, cut = Math.max(0, c.turns.length - KEEP.recent);
  return [
    ...(eras ? c.eras : []).map((e) => `- ${e.from.slice(0, 7)} to ${e.to.slice(0, 7)}, turns ${e.t0} to ${e.t1}: ${line(factWords(e.f, name), [...new Set(e.s)].filter(Boolean).join(" ... "), KEEP.era)}`),
    ...c.turns.map((t, i) => `- ${t.from} to ${t.to}: ${line(factWords(t.f, name), t.s, i < cut ? KEEP.line : KEEP.told) || "no summary"}`),
  ];
}
