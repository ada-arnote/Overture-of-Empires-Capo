// SPDX-License-Identifier: AGPL-3.0-or-later
// Ambitions: a goal the player chooses from a fixed list, which only the rules can call met. No chance, no AI.
// Each is a count the rules already keep (provinces, treaties, gauges, years, standing) against a number fixed on
// the day it is chosen. The AI is told the ambition and how far along it is, so the story can lean toward it; it
// cannot say it is met. When it is, the receipt says so, the game goes on, and another may be chosen.
// The reckoning is the game so far in a few lines, counted by code from what the rules decided.
import { monthsApart } from "./relations.js";
import { gaugeOf, gaugeWords } from "./state.js";
import { spheres } from "./pacts.js";
import { meansOf } from "./scale.js";

const pacts = (g, trade) => g.treaties.filter((t) => t.pair.split("|").includes(g.player) && (trade || t.kind !== "trade")).length;
const atWar = (g) => g.wars.some((w) => w.pair.split("|").includes(g.player));
const years = (o, now) => Math.floor(monthsApart(o.mark, now) / 12);
/** Provinces the player's country claims or once held, and does not hold: at most twelve. */
const wanted = (g, geo) => [...new Set([...Object.keys(g.owners || {}).filter((id) => geo.place(id)?.country === g.player), ...(geo.claimed?.() || []).filter(([, who]) => who === g.player).map(([id]) => id)])].filter((id) => geo.owner(id) !== g.player).sort().slice(0, 12);

// modes: n nation, l leader, c citizen. begin fixes the numbers on the day it is chosen; have counts today.
export const AMBITIONS = {
  grow: { title: "A greater country", modes: "nl", begin: (g, geo) => { const base = geo.holds(g.player); return { need: base + Math.max(2, Math.ceil(base / 4)) }; }, said: (o) => `Hold ${o.need} provinces`, have: (g, geo) => geo.holds(g.player) },
  restore: { title: "What was ours", modes: "nl", begin: (g, geo) => { const ids = wanted(g, geo); return { ids, need: ids.length }; }, said: (o) => `Hold the ${o.need} province${o.need > 1 ? "s" : ""} you claim or have lost`, have: (g, geo, o) => o.ids.filter((id) => geo.owner(id) === g.player).length },
  friends: { title: "A ring of friends", modes: "nl", begin: () => ({ need: 3 }), said: () => "Hold three defence or alliance treaties at once", have: (g) => pacts(g, false) },
  trade: { title: "A trading power", modes: "nl", begin: () => ({ need: 6 }), said: () => "Hold five treaties of any kind, with a full treasury", have: (g) => Math.min(5, pacts(g, true)) + (gaugeOf(g, g.player, "t") >= 3 ? 1 : 0) },
  golden: { title: "A golden age", modes: "nl", begin: () => ({ need: 3 }), said: () => "Stability calm, treasury full and mandate trusted, all at once", have: (g) => ["s", "t", "m"].filter((k) => gaugeOf(g, g.player, k) >= 3).length },
  peace: { title: "The long peace", modes: "nlc", begin: () => ({ need: 5 }), said: () => "Five years without a war", have: (g, geo, o, now) => years(o, now), broken: (g) => atWar(g) },
  whole: { title: "Unbroken", modes: "nl", begin: () => ({ need: 10 }), said: () => "Ten years without holding less land than today", have: (g, geo, o, now) => years(o, now), broken: (g, geo, o) => geo.holds(g.player) < o.base },
  sphere: { title: "A sphere of your own", modes: "nl", begin: () => ({ need: 3 }), said: () => "Hold three countries in your sphere of influence", have: (g, geo) => (spheres(g, geo).get(g.player) || []).length },
  comfort: { title: "A house in order", modes: "lc", begin: () => ({ need: 4 }), said: () => "Bring your own means to comfortable (4 of 5)", have: (g) => meansOf(g) + 1 },
  rise: { title: "A name in the land", modes: "c", begin: () => ({ need: 4 }), said: () => "Become a national figure (standing 4 of 5)", have: (g) => g.standing || 2 },
};

/** The ambitions open to this game today: [{id, title, said}]. One already met in this game is not offered again. */
export function ambitionsFor(g, geo) {
  const met = new Set((g.done || []).map((d) => d.id));
  return Object.entries(AMBITIONS).filter(([id, a]) => a.modes.includes(g.mode[0]) && !met.has(id)).map(([id, a]) => ({ id, title: a.title, o: a.begin(g, geo) }))
    .filter((x) => x.o.need > 0 && AMBITIONS[x.id].have(g, geo, { ...x.o, mark: g.date }, g.date) < x.o.need).map((x) => ({ id: x.id, title: x.title, said: AMBITIONS[x.id].said(x.o) }));
}
/** Choose one. Returns true when it was open to choose. */
export function chooseAmbition(g, geo, id) {
  if (!ambitionsFor(g, geo).some((x) => x.id === id)) return false;
  g.goal = { id, since: g.date, mark: g.date, base: geo.holds(g.player), ...AMBITIONS[id].begin(g, geo) };
  return true;
}
/** Where the ambition stands on the day `now`: {title, said, have, need}, or null when none is chosen. */
export function progress(g, geo, now = g.date) {
  const o = g.goal, a = o && AMBITIONS[o.id];
  return a ? { title: a.title, said: a.said(o), have: Math.max(0, Math.min(o.need, a.have(g, geo, o, now))), need: o.need } : null;
}

/** The end of a turn: count what the turn did for the reckoning, and say so when the ambition is met. */
export function settleAmbition(g, receipt, to, geo) {
  const me = g.player, t = (g.tally ||= { from: g.date, base: geo.holds(me), wars: 0, won: 0, lost: 0, pacts: 0, peaces: 0 }), o = g.goal, a = o && AMBITIONS[o.id];
  for (const { fact: [kind, x, y] = [] } of receipt) {
    if (kind === "war" && (x === me || y === me)) t.wars++;
    if (kind === "peace" && (x === me || y === me)) t.peaces++;
    if (kind === "treaty" && (x === me || y === me)) t.pacts++;
    if ((kind === "took" && x === me) || (kind === "gave" && y === me)) t.won++;
    if ((kind === "took" && y === me) || (kind === "gave" && x === me)) t.lost++;
  }
  // keyless hook: a country that holds no land is over (rules version 6); the world may still be watched
  if (g.mode !== "citizen" && !g.over && geo.holds(me) === 0) { g.over = { turn: g.turn, date: to }; g.goal = null; return [{ ok: true, country: me, text: `${geo.name(me)}: holds no land; its story as a country ends here`, over: 1 }]; }
  if (!a) return [];
  if (a.broken?.(g, geo, o)) o.mark = to;
  const p = progress(g, geo, to);
  if (p.have < p.need) return [];
  g.done = [...(g.done || []), { id: o.id, said: p.said, turn: g.turn, date: to }].slice(-12);
  g.goal = null;
  return [{ ok: true, country: me, text: `${geo.name(me)}: its ambition is met, "${p.title}" (${p.said.toLowerCase()})`, met: o.id }];
}

/** A line for the prompt: the ambition and how far along it is. */
export function ambitionLines(g, geo) {
  const p = progress(g, geo);
  return p ? [`- The player's ambition, counted by the rules: ${p.said} (now ${p.have} of ${p.need}). The story may lean toward it. Only the rules say when it is met.`] : [];
}

/** The game so far in a few lines, counted by code. */
export function reckoning(g, geo, fmt = (d) => d) {
  const me = g.player, t = g.tally || { from: g.date, base: geo.holds(me), wars: 0, won: 0, lost: 0, pacts: 0, peaces: 0 }, n = g.turn - 1;
  return [
    `${geo.name(me)}, ${fmt(t.from)} to ${fmt(g.date)}: ${n} turn${n === 1 ? "" : "s"}${g.branch ? `, ${g.branch} played again after a take-back` : ""}.`,
    `Land: ${t.base} provinces then, ${geo.holds(me)} now (${t.won} gained, ${t.lost} lost).`,
    `Wars begun or joined: ${t.wars}. Wars ended in peace: ${t.peaces}. Treaties signed: ${t.pacts}.`,
    `The country today: ${gaugeWords(g, me)} (stability, treasury, mandate).`,
    `Ambitions met: ${(g.done || []).map((d) => `${d.said} (${d.date.slice(0, 4)})`).join("; ") || "none yet"}.`,
  ];
}

/** An ambition, the ones met and the tally from a save, checked against the map. */
export function keepAmbition(s, isProvince) {
  const DATE = /^\d{4}-\d{2}-\d{2}$/, o = s.goal, int = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
  const ok = o && typeof o === "object" && AMBITIONS[o.id] && DATE.test(o.since || "") && DATE.test(o.mark || "") && Number.isInteger(o.need) && o.need > 0;
  const goal = ok ? { id: o.id, since: o.since, mark: o.mark, base: int(o.base), need: o.need, ...(o.id === "restore" ? { ids: (Array.isArray(o.ids) ? o.ids : []).filter(isProvince).slice(0, 12) } : {}) } : null;
  const done = (Array.isArray(s.done) ? s.done : []).filter((d) => d && AMBITIONS[d.id] && typeof d.said === "string" && DATE.test(d.date || "")).map((d) => ({ id: d.id, said: d.said.slice(0, 120), turn: int(d.turn), date: d.date })).slice(-12);
  const t = s.tally, tally = t && typeof t === "object" && DATE.test(t.from || "") ? { from: t.from, base: int(t.base), wars: int(t.wars), won: int(t.won), lost: int(t.lost), pacts: int(t.pacts), peaces: int(t.peaces) } : undefined;
  const over = s.over && typeof s.over === "object" && DATE.test(s.over.date || "") ? { turn: int(s.over.turn), date: s.over.date } : undefined;
  return { goal: goal && (goal.id !== "restore" || goal.ids.length === goal.need) ? goal : null, done, ...(tally ? { tally } : {}), over };
}
