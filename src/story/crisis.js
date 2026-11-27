// SPDX-License-Identifier: AGPL-3.0-or-later
// Crises: one country demands one province of another, with a day by which it must be answered. Rules only.
// The country asked adds up a score and says it, as it does for a treaty: the gap in might (at most 3 either way),
// +2 when the asker has a cause, +1 when the country asked has another war to fight, +1 or +2 when it is shaken or
// in revolt at home, -2 when a treaty partner at least as strong as the asker stands behind it, -2 for its
// heartland, -2 when the same demand was made in the last two years. At 4 or more it yields the province rather
// than fight; otherwise it refuses. The player answers for their own country. One crisis is open at a time.
// A yielded province leaves the pair bitter and gives the loser a cause. A refusal costs the asker a step of
// mandate and a step of relations, and keeps alive the cause it already had; a demand made without a cause never
// makes one.
// The world also moves on its own: after six quiet months the rules may open a crisis over land that changed
// hands or land in dispute (an even chance each turn, drawn from the game's seed), near the player when they can.
import { draw100, hash32 } from "./line.js";
import { monthsApart } from "./relations.js";
import { atWar, mightOf, treatiesOf, treatyOf, turnKey, warsOf } from "./worldrules.js";
import { causeOf, gaugeOf, gaugeWord, setCause } from "./state.js";
// round 3 hook: how restless the world is
import { crisisChance } from "./rivals.js";

export const CRISIS = { need: 4, quiet: 6, chance: 50, due: 3, mine: 1, again: 24 };
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
/**
 * A date some whole months on, never past the 28th, so every month has it. Whole numbers only, never a Date: the
 * year keeps its four digits ("0912"), as every date in a game does, so dates before the year 1000 still sort as text.
 */
export function addMonths(iso, n) {
  const [y, m, d] = iso.split("-").map(Number), k = y * 12 + (m - 1) + n, pad = (v, w) => String(v).padStart(w, "0");
  return `${pad(Math.floor(k / 12), 4)}-${pad((k % 12) + 1, 2)}-${pad(Math.min(d, 28), 2)}`;
}

/**
 * What `b` would answer if `a` demanded the province `id` on the day `now`, and why, before it is asked or after.
 * Returns {no} when the demand cannot be made at all, else {ok, score, need, parts, why}.
 */
export function demandAnswer(g, geo, a, b, id, now = g.date) {
  const place = geo.place(id)?.name;
  if (!place || geo.owner(id) !== b || a === b || !geo.holds(a)) return { no: "that land is not held by another country" };
  if (atWar(g, a, b)) return { no: `at war with ${geo.name(b)}: land is taken by arms now` };
  if (treatyOf(g, a, b)) return { no: `bound to ${geo.name(b)} by treaty; it must be ended first` };
  if (geo.holds(b) <= 1) return { no: `${place} is the last land ${geo.name(b)} holds` };
  const ma = mightOf(geo, a), mb = mightOf(geo, b), s = gaugeOf(g, b, "s"), cause = causeOf(g, geo, a, b, now), asked = g.asked?.[`${a}>${b}`];
  const shield = treatiesOf(g, b).find((t) => t.kind !== "trade" && t.with !== a && mightOf(geo, t.with) >= ma);
  const parts = [[`might ${ma} against ${mb}`, Math.max(-3, Math.min(3, ma - mb))]];
  if (cause) parts.push([`a cause (${cause})`, 2]);
  if (warsOf(g, b).length) parts.push(["another war to fight", 1]);
  if (s < 2) parts.push([`${gaugeWord("s", s)} at home`, 2 - s]);
  if (shield) parts.push([`${geo.name(shield.with)} stands behind it`, -2]);
  if (geo.home?.(b) === id) parts.push(["its heartland", -2]);
  if (asked && monthsApart(asked, now) < CRISIS.again) parts.push(["a demand made before", -2]);
  const score = parts.reduce((n, [, v]) => n + v, 0);
  return { ok: score >= CRISIS.need, score, need: CRISIS.need, cause, parts, why: `${parts.map(([l, n]) => `${l} ${signed(n)}`).join(", ")}: ${score}, needing ${CRISIS.need}` };
}

/** The player demands a province by card. text is the action that carries it. Returns {ok, why}. */
export function demand(g, geo, id, text) {
  const me = g.player, b = geo.owner(id);
  if (g.mode === "citizen") return { ok: false, why: "As a citizen you do not speak for the country." };
  if (g.crisis) return { ok: false, why: "Another crisis is still open: one at a time." };
  if (![...geo.neighbours(id), ...(geo.across?.(id) || [])].some((n) => geo.owner(n) === me)) return { ok: false, why: "You can demand only land next to your own, or across a narrow sea from it." };
  const a = demandAnswer(g, geo, me, b, id);
  if (a.no) return { ok: false, why: `Refused: ${a.no}.` };
  g.crisis = { a: me, b, id, since: g.date, due: addMonths(g.date, CRISIS.mine), by: "you", text };
  return { ok: true, why: a.why };
}

const sour = (g, a, b, n, to) => { const k = [a, b].sort().join("|"); g.rel = { ...(g.rel || {}), [k]: [Math.max(-3, n), to] }; if (!n) delete g.rel[k]; };
const stored = (g, a, b) => g.rel?.[[a, b].sort().join("|")]?.[0] || 0;

/**
 * The end of a turn, on its last day `to`: an open crisis is answered once its day has come, and after a quiet
 * stretch the rules may open one. actions are the turn's actions. Returns receipt lines.
 */
export function settleCrisis(g, to, geo, actions = []) {
  const k = g.crisis, lines = [], me = g.player, name = geo.name;
  if (k) {
    const place = geo.place(k.id)?.name, opened = k.by === "you" && k.since === g.date, ans = demandAnswer(g, geo, k.a, k.b, k.id, to);
    if (opened && !actions.includes(k.text)) { g.crisis = null; return lines; }
    if (ans.no) { g.crisis = null; g.calm = to; return [{ ok: true, country: k.a, text: `${name(k.a)}: its demand for ${place || "the province"} is overtaken by events` }]; }
    if (opened) lines.push({ ok: true, country: k.a, text: `${name(k.a)}: demands ${place} from ${name(k.b)}, to be answered by ${k.due}`, asks: [k.a, k.b, k.id, k.due] });
    if (to < k.due) return lines;
    const own = k.b === me && g.mode !== "citizen", yes = own ? k.answer === "yield" : ans.ok, year = to.slice(0, 4), why = own ? "your own answer" : ans.why;
    if (yes) {
      if (geo.place(k.id).country === k.a) delete g.owners[k.id]; else g.owners[k.id] = k.a;
      sour(g, k.a, k.b, Math.min(stored(g, k.a, k.b), -2), to);
      setCause(g, k.b, k.a, `land yielded under threat in ${year}`, to);
      lines.push({ ok: true, country: k.b, text: `${name(k.b)}: yields ${place} to ${name(k.a)} rather than fight (${why})`, fact: ["gave", k.b, k.a, 1], crisis: ["yield", k.a, k.b], land: k.id });
    } else {
      sour(g, k.a, k.b, stored(g, k.a, k.b) - 1, to);
      if (ans.cause) setCause(g, k.a, k.b, `its demand for ${place} was refused in ${year}`, to);
      lines.push({ ok: true, country: k.b, text: `${name(k.b)}: refuses ${name(k.a)}'s demand for ${place} (${why})`, crisis: ["refuse", k.a, k.b], land: k.id });
    }
    g.asked = { ...(g.asked || {}), [`${k.a}>${k.b}`]: to }; g.calm = to; g.crisis = null;
    return lines;
  }
  if (!g.calm) { g.calm = to; return lines; }
  if (monthsApart(g.calm, to) < CRISIS.quiet || draw100(g.seed, `${turnKey(g)}:crisis`) > crisisChance(g)) return lines;
  // who might press whom: the old holder of land that changed hands, and the claimant of land in dispute
  const pool = [[], []], seen = new Set(), stakes = [...Object.keys(g.owners || {}).map((id) => [id, geo.place(id)?.country]), ...(geo.claimed?.() || [])];
  for (const [id, a] of stakes) {
    const b = geo.owner(id), key = `${a}>${b}`;
    if (!a || a === me || a === b || seen.has(key) || !geo.known(a) || !geo.holds(a) || gaugeOf(g, a, "s") === 0 || mightOf(geo, a) < mightOf(geo, b) - 1) continue;
    const ans = demandAnswer(g, geo, a, b, id, to);
    if (ans.no || ans.score < CRISIS.need - 2) continue;
    seen.add(key);
    pool[b === me || geo.neighbours(id).some((n) => geo.owner(n) === me) ? 0 : 1].push([a, b, id]);
  }
  const from = (pool[0].length ? pool[0] : pool[1]).sort((x, y) => (x[2] < y[2] ? -1 : 1));
  if (!from.length) return lines;
  const [a, b, id] = from[hash32(g.seed, `${turnKey(g)}:crisis:pick`) % from.length];
  g.crisis = { a, b, id, since: to, due: addMonths(to, CRISIS.due), by: "rules" };
  return [{ ok: true, country: a, text: `${name(a)}: demands ${geo.place(id).name} from ${name(b)}, to be answered by ${g.crisis.due}`, asks: [a, b, id, g.crisis.due] }];
}

/** A line for the prompt while a crisis is open. */
export const crisisLines = (g, geo) => (g.crisis ? [`- A crisis, kept by the rules: ${g.crisis.a} demands ${g.crisis.id} ${geo.place(g.crisis.id)?.name || ""} from ${g.crisis.b}, to be answered by ${g.crisis.due}. Write the tension and the talk around it; never say how it ends. The rules answer on that day, and you will read it under RECEIPT.`] : []);

/** A crisis from a save: both countries and the province on the map, dates as dates; otherwise none. */
export function keepCrisis(s, known, isProvince) {
  const DATE = /^\d{4}-\d{2}-\d{2}$/, k = s.crisis, ok = k && typeof k === "object" && known(k.a) && known(k.b) && isProvince(k.id) && DATE.test(k.since || "") && DATE.test(k.due || "");
  const asked = Object.fromEntries(Object.entries(s.asked && typeof s.asked === "object" ? s.asked : {}).filter(([p, d]) => p.split(">").length === 2 && p.split(">").every(known) && DATE.test(d || "")));
  return { crisis: ok ? { a: k.a, b: k.b, id: k.id, since: k.since, due: k.due, by: k.by === "you" ? "you" : "rules", ...(typeof k.text === "string" ? { text: k.text.slice(0, 300) } : {}), ...(k.answer === "yield" ? { answer: "yield" } : {}) } : null, asked, calm: DATE.test(s.calm || "") ? s.calm : "" };
}
