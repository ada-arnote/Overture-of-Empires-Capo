// SPDX-License-Identifier: AGPL-3.0-or-later
// Home politics: what each seat of the council cares for, and unrest with a face. Rules only; the AI narrates.
// Cares. Every seat cares for two things from a fixed list: one that comes with the office (the Treasurer, a full
// treasury) and one dealt to the person from the game's seed and their name. Each care is pleased (+1), easy (0) or
// displeased (-1) by what the rules already keep, so a member's mood runs from -2 to +2. Every six months each
// member's favour moves one step toward their mood, and the receipt says which care moved it. Mood alone never
// takes favour to -3: only what the player does makes a member resign.
// Unrest. When a country's stability falls to shaken, the rules name a figure and a province where trouble gathers.
// At in revolt it is a rising (the country declares no war and makes no attack, as before). A rising a year old
// hands a province taken from another country back to it, or else costs a step of mandate. Unrest fades when
// stability is steady again.
// The player's two answers, by card: meet their terms (a step of treasury buys a step of stability), or move
// against them, on the check: skill 3 (or the Interior's own skill) against 3, 4 for a rising, with mandate, an
// empty treasury and a war abroad as its parts. Clean: a step of stability. Costly: the same, and a step of mandate
// lost. Failed: a step of mandate lost, and unrest not yet a rising loses a step of stability too.
import { chanceOf, check, checkLine } from "./check.js";
import { hash32 } from "./line.js";
import { monthsApart } from "./relations.js";
import { gaugeOf, gaugeWord } from "./state.js";
import { commandOf, turnKey } from "./worldrules.js";

export const HOME = { drift: 6, year: 12, skill: 3, unrest: 3, rising: 4 };
const band = (n) => (n >= 3 ? 1 : n <= 1 ? -1 : 0);
const wars = (g, c) => g.wars.filter((w) => w.pair.split("|").includes(c)).length;
const deals = (g, c) => g.treaties.filter((t) => t.pair.split("|").includes(c)).length;
// [what it is called, how it reads the game: -1, 0 or 1, the words for why]
export const CARES = {
  order: ["order at home", (x) => band(x.s), (x) => `stability ${gaugeWord("s", x.s)}`],
  purse: ["a full treasury", (x) => band(x.t), (x) => `the treasury ${gaugeWord("t", x.t)}`],
  glory: ["the country's name", (x) => band(x.m), (x) => `mandate ${gaugeWord("m", x.m)}`],
  peace: ["peace", (x) => (x.wars ? -1 : x.deals ? 1 : 0), (x) => (x.wars ? "the country at war" : "peace, and treaties to keep it")],
  friends: ["friends abroad", (x) => (x.deals >= 2 ? 1 : !x.deals && x.wars ? -1 : 0), (x) => (x.deals >= 2 ? `${x.deals} treaties` : "a war with no friend abroad")],
  rise: ["your own rise", (x) => (x.standing >= 4 ? 1 : x.standing <= 1 ? -1 : 0), (x) => `your standing ${x.standing} of 5`],
  means: ["money in the house", (x) => band(x.p), (x) => `your means ${x.p + 1} of 5`],
};
const OFFICE = { war: "glory", treasury: "purse", foreign: "friends", home: "order", outsider: "peace", staff: "order", ally: "glory", rival: "rise", deputy: "order", banker: "purse", region: "peace", family: "means", friend: "rise", employer: "purse", steward: "means", neighbour: "peace", worker: "means", priest: "peace", smuggler: "purse" };
const facts = (g) => { const c = g.player; return { s: gaugeOf(g, c, "s"), t: gaugeOf(g, c, "t"), m: gaugeOf(g, c, "m"), wars: wars(g, c), deals: deals(g, c), standing: g.standing || 5, p: g.self?.p?.[0] ?? 2 }; };

/** The two things a member cares for: their office's, and one of their own dealt from the seed and their name. */
export function caresOf(g, seat, m) {
  const first = OFFICE[seat] || "order", pool = Object.keys(CARES).filter((k) => k !== first && (g.mode !== "nation" || (k !== "rise" && k !== "means")));
  return [first, pool[hash32(g.seed, `care:${m.name}`) % pool.length]];
}
/** A member's mood, -2 to 2, with each care's part in it: {mood, parts: [[care, -1 | 0 | 1, why]]}. */
export function moodOf(g, seat, m) {
  const x = facts(g), parts = caresOf(g, seat, m).map((k) => [k, CARES[k][1](x), CARES[k][2](x)]);
  return { mood: parts.reduce((n, [, v]) => n + v, 0), parts };
}

const TITLES = ["Colonel", "Governor", "Mayor", "Judge", "Captain", "Tribune", "Deputy", "Preacher"];
/** Where trouble gathers in a country and around whom: land taken from another first, else away from its heartland. */
function seatOf(g, geo, c, to) {
  const held = (geo.all || []).filter((id) => geo.owner(id) === c).sort(), taken = held.filter((id) => geo.place(id).country !== c), away = held.filter((id) => id !== geo.home?.(c));
  const pool = taken.length ? taken : away.length ? away : held, id = pool[hash32(g.seed, `unrest:${c}:${to}`) % (pool.length || 1)];
  return id ? { id, who: `the ${TITLES[hash32(g.seed, `rebel:${c}:${to}`) % TITLES.length]} of ${geo.place(id).name}`, since: to } : null;
}

/** What moving against the unrest would take, before it is ordered: the plan the check will use and its chance. */
export function quellPlan(g, geo, c = g.player) {
  const u = g.unrest?.[c], m = c === g.player && g.mode !== "citizen" ? g.council?.seats?.home : null;
  if (!u) return { ok: false, why: "there is no unrest to answer" };
  const mandate = gaugeOf(g, c, "m"), plan = { mission: `quell:${c}:${u.since}`, checkpoint: "streets", person: m?.name || "-", who: m?.name || "the police", role: "interior", skill: m ? commandOf(g, m) : HOME.skill, difficulty: u.rising ? HOME.rising : HOME.unrest,
    parts: [[`mandate ${gaugeWord("m", mandate)}`, (mandate - 2) * 5], gaugeOf(g, c, "t") === 0 ? ["an empty treasury", -10] : ["", 0], wars(g, c) ? ["a war abroad", -5] : ["", 0]] };
  return { ok: true, plan, chance: chanceOf(plan).chance, who: u.who, lead: plan.who };
}
/** Whether the country can meet the unrest's terms today, or why not. */
export const termsFor = (g, c = g.player) => (!g.unrest?.[c] ? "there is no unrest to answer" : gaugeOf(g, c, "t") === 0 ? "the treasury is empty: there is nothing to offer" : "");

/**
 * Before the gauges move, on the turn's last day: the player's answer to unrest is carried out, and a rising a
 * year old takes its toll. plans are the turn's orders by card that stand. Lines may carry `gauge` pushes.
 */
export function settleUnrest(g, to, geo, plans = []) {
  const lines = [], me = g.player, name = geo.name;
  const mine = g.unrest?.[me];
  if (mine && g.mode !== "citizen" && plans.some((p) => p.kind === "terms") && !termsFor(g)) {
    lines.push({ ok: true, country: me, text: `${name(me)}: meets the terms of ${mine.who}, and the treasury pays`, gauge: [[me, "t", -1, "terms paid to end unrest"], [me, "s", 1, "the unrest's terms met"]] });
  } else if (mine && g.mode !== "citizen" && plans.some((p) => p.kind === "quell")) {
    const q = quellPlan(g, geo), beat = check(g.seed, { ...q.plan, turn: turnKey(g) }), how = `(${checkLine(beat)})`, lost = [me, "m", -1, beat.band === "costly" ? "blood in the streets" : "a crackdown that failed"];
    if (beat.band === "failed") lines.push({ ok: true, country: me, roll: beat, text: `${name(me)}: moves against ${mine.who} and fails ${how}`, gauge: [lost, ...(mine.rising ? [] : [[me, "s", -1, "a crackdown that failed"]])] });
    else lines.push({ ok: true, country: me, roll: beat, text: `${name(me)}: moves against ${mine.who} and scatters them${beat.band === "costly" ? ", at a price in blood" : ""} ${how}`, gauge: [[me, "s", 1, "unrest put down"], ...(beat.band === "costly" ? [lost] : [])] });
  }
  for (const [c, u] of Object.entries(g.unrest || {}).sort()) {
    if (!u.rising || monthsApart(u.at || u.since, to) < HOME.year) continue;
    u.at = to;
    const old = geo.place(u.id)?.country;
    if (geo.owner(u.id) === c && old !== c && geo.holds(old) > 0 && geo.holds(c) > 1 && !g.wars.some((w) => w.pair === [c, old].sort().join("|"))) {
      delete g.owners[u.id];
      lines.push({ ok: true, country: c, text: `${name(c)}: the rising of ${u.who} hands ${geo.place(u.id).name} back to ${name(old)}, a year unanswered`, fact: ["gave", c, old, 1] });
      delete g.unrest[c];
    } else lines.push({ ok: true, country: c, text: `${name(c)}: the rising of ${u.who} stands a year unanswered`, gauge: [[c, "m", -1, "a rising unanswered"]] });
  }
  return lines;
}

/**
 * After the gauges have moved: unrest gathers, rises, eases or fades with each country's stability, and every six
 * months the council's favour moves a step toward each member's mood. Returns receipt lines.
 */
export function settleHome(g, to, geo) {
  const lines = [], me = g.player, name = geo.name, foes = g.wars.filter((w) => w.pair.split("|").includes(me)).flatMap((w) => w.pair.split("|"));
  const say = (c, text) => { if (c === me || foes.includes(c)) lines.push({ ok: true, country: c, text: `${name(c)}: ${text}` }); };
  g.unrest ||= {};
  for (const c of [...new Set([...Object.keys(g.gauge || {}), ...Object.keys(g.unrest)])].sort()) {
    const s = gaugeOf(g, c, "s"), u = g.unrest[c], word = `stability ${gaugeWord("s", s)}`;
    if (u && (s >= 2 || !geo.known(c) || geo.owner(u.id) !== c)) { delete g.unrest[c]; if (s >= 2) say(c, `the unrest around ${u.who} fades (${word})`); continue; }
    if (!u && s <= 1) {
      const n = seatOf(g, geo, c, to);
      if (!n) continue;
      g.unrest[c] = s === 0 ? { ...n, rising: true, at: to } : n;
      say(c, s === 0 ? `${n.who} raises ${geo.place(n.id).name} in revolt (${word})` : `unrest gathers in ${geo.place(n.id).name} around ${n.who} (${word})`);
    } else if (u && s === 0 && !u.rising) { Object.assign(u, { rising: true, at: to }); say(c, `${u.who} raises ${geo.place(u.id).name} in revolt (${word})`); }
    else if (u?.rising && s >= 1) { delete u.rising; delete u.at; say(c, `the rising of ${u.who} is over, though the unrest is not (${word})`); }
  }
  const h = (g.home ||= { at: to });
  if (g.council && monthsApart(h.at, to) >= HOME.drift) {
    h.at = to;
    for (const [seat, m] of Object.entries(g.council.seats)) {
      if (!m) continue;
      const { mood, parts } = moodOf(g, seat, m), step = Math.sign(mood - m.favour), why = parts.find(([, v]) => v === step) || parts.find(([, v]) => v);
      if (!step || !why) continue;
      m.favour += step;
      lines.push({ ok: true, text: `${m.name}: ${step > 0 ? "warms to you" : "cools toward you"} (favour ${m.favour}): they care for ${CARES[why[0]][0]}, and see ${why[2]}` });
    }
  }
  return lines;
}

/** A line for the prompt: unrest in the player's country and in those it fights. */
export function homeLines(g, geo) {
  const me = g.player, list = [me, ...g.wars.filter((w) => w.pair.split("|").includes(me)).map((w) => w.pair.split("|").find((c) => c !== me))].filter((c) => g.unrest?.[c]);
  return list.length ? [`- Unrest, kept by the rules: ${list.map((c) => { const u = g.unrest[c]; return `in ${c}, ${u.rising ? "a rising" : "unrest"} in ${u.id} ${geo.place(u.id)?.name || ""} around ${u.who}`; }).join("; ")}. Give each figure a voice and a cause; you may name them with a PERSON line. Never say how it ends: the rules decide.`] : [];
}

/** Unrest and the council's clock from a save: countries and provinces on the map, dates as dates. */
export function keepHome(s, known, isProvince) {
  const DATE = /^\d{4}-\d{2}-\d{2}$/, obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const unrest = Object.fromEntries(Object.entries(obj(s.unrest)).filter(([c, u]) => known(c) && u && isProvince(u.id) && typeof u.who === "string" && DATE.test(u.since || ""))
    .map(([c, u]) => [c, { id: u.id, who: u.who.slice(0, 80), since: u.since, ...(u.rising ? { rising: true, at: DATE.test(u.at || "") ? u.at : u.since } : {}) }]));
  return { unrest, home: DATE.test(s.home?.at || "") ? { at: s.home.at } : undefined };
}
