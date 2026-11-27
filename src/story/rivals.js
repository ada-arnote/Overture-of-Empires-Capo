// SPDX-License-Identifier: AGPL-3.0-or-later
// The rules-only turn: what other countries do when no AI proposed anything for them (the AI is down, or its reply
// held no moves for other countries). Small on purpose, and every threshold is written here:
//   attack: a country at war attacks the enemy province it has the best chance against, when that chance is 45 or
//     more; one side of each war a turn, three attacks at most;
//   war: only on a neighbour it stands at -2 or lower with, is at least 2 stronger than, has no treaty or truce
//     with, and only when it has no war already; one a turn at most, and then one time in four;
//   treaty: one country a turn asks one neighbour for the next treaty up, when the answer would be yes; beyond
//     trade, only while one of the two is at war (blocs form around wars, not in a quiet world).
//   pact (round three, ruling 149): one country a turn, three times in ten, asks one neighbour it has no treaty
//     with for a pact of non-aggression, when the answer would be yes (pacts.js: the trade sum, +1 for a neighbour
//     both fear, needing 1). A country never declares war by rule on one it has a pact with;
//   tribute: three times in ten, one country that is steady at home demands a yearly tribute of a weaker neighbour
//     in trouble (at war, or shaken at home) that would pay (pacts.js: needing 4); never of one it has a treaty with.
//   The player's country is asked like any other, and answers for itself (ruling 154): a pact comes as an offer
//     card, and tribute as a demand card, only when the sum says the country would pay and no demand was refused
//     in the last two years.
// How restless the world is can be set for a game (PACE): calm, lively (the numbers above) or stormy. It changes
// how often a war, a pact, a demand for tribute and a crisis come, and nothing else.
// Peace needs no proposal: wars end by rule at the end of every turn (war.js).
// These are proposals like the AI's own: the same rules judge each one and write its receipt line. Which country
// moves is drawn from the game's seed and the turn, so a turn replays.
import { hash32 } from "./line.js";
import { treatyAnswer } from "./relations.js";
import { gaugeOf } from "./state.js";
import { mayDun, pactAnswer, pactOf } from "./pacts.js";
import { strengthOf, truceUntil } from "./war.js";
import { atWar, attackPlan, treatyOf, turnKey, warsOf } from "./worldrules.js";

export const RIVALS = { odds: 45, attacks: 3, grudge: -2, edge: 2, war: 25, treaties: 1 };
// How restless the world is. war, pact, tribute, crisis: the chance out of 100, each turn, of a war by rule, a
// pact, a demand for tribute, and a crisis opened by the rules (crisis.js). grudge and edge: how bitter a pair must
// be, and how much stronger the one that declares, before a war by rule.
export const PACE = {
  calm: { title: "Calm", says: "wars, pacts and crises come rarely", war: 10, grudge: -2, edge: 2, pact: 15, tribute: 15, crisis: 25 },
  lively: { title: "Lively", says: "the world as the rules were tuned", war: RIVALS.war, grudge: RIVALS.grudge, edge: RIVALS.edge, pact: 30, tribute: 30, crisis: 50 },
  stormy: { title: "Stormy", says: "old grudges come to war sooner, and crises come often", war: 50, grudge: -1, edge: 1, pact: 45, tribute: 50, crisis: 75 },
};
export const paceOf = (g) => (PACE[g?.pace] ? g.pace : "lively");
const rate = (g, k) => PACE[paceOf(g)][k];
/** The chance a crisis opens by rule in a turn, for crisis.js. */
export const crisisChance = (g) => rate(g, "crisis");
/** Set how restless the world is; returns the words to say. */
export function setPace(g, k) { if (!PACE[k]) return ""; if (k === "lively") delete g.pace; else g.pace = k; return `The world is now ${PACE[k].title.toLowerCase()}: ${PACE[k].says}.`; }
/** The pace from a save: one of the three, or the default. */
export const keepPace = (s) => ({ pace: PACE[s?.pace] && s.pace !== "lively" ? s.pace : undefined });
const NEXT = { "": "trade", trade: "defence", defence: "alliance" };

/** Which countries touch which by land: Map(code -> sorted codes). geo.all lists every province id. */
export function borders(geo) {
  const near = new Map();
  for (const id of geo.all || []) { const o = geo.owner(id); for (const n of geo.neighbours(id)) { const p = geo.owner(n); if (p !== o) near.set(o, (near.get(o) || new Set()).add(p)); } }
  return new Map([...near].sort(([a], [b]) => (a < b ? -1 : 1)).map(([c, set]) => [c, [...set].sort()]));
}

/** The enemy province a country has the best chance against: {id, chance}, or null when it can reach none. */
export function bestAttack(g, geo, c, foe, order = {}) {
  let best = null;
  for (const id of geo.all || []) {
    if (geo.owner(id) !== foe) continue;
    const a = attackPlan(g, geo, c, id, order);
    if (a.ok && (!best || a.chance > best.chance)) best = { id, chance: a.chance, plan: a };
  }
  return best;
}

/** The moves other countries make by rule this turn, at most six, as the AI would have proposed them. */
export function rivalMoves(g, geo) {
  const me = g.mode === "citizen" ? "" : g.player, near = borders(geo), moves = [], pick = (label, n) => hash32(g.seed, `${turnKey(g)}:rival:${label}`) % n;
  const move = (country, verb, target, detail = "") => moves.push({ action: 0, country, verb, target, detail });
  let n = 0;
  for (const w of g.wars) {
    if (n >= RIVALS.attacks) break;
    const [a, b] = w.pair.split("|"), first = pick(`side:${w.pair}`, 2) ? a : b, who = first === me ? (first === a ? b : a) : first, foe = who === a ? b : a;
    const best = bestAttack(g, geo, who, foe);
    if (best && best.chance >= RIVALS.odds) { move(who, "ATTACK", best.id); n++; }
  }
  const grudges = Object.entries(g.rel || {}).filter(([, [rel]]) => rel <= rate(g, "grudge")).map(([k]) => k).sort().flatMap((k) => { const [a, b] = k.split("|"); return [[a, b], [b, a]]; })
    .filter(([c, t]) => c !== me && near.get(c)?.includes(t) && !warsOf(g, c).length && !atWar(g, c, t) && !treatyOf(g, c, t) && !pactOf(g, c, t) && !truceUntil(g, c, t) && strengthOf(g, geo, c) - strengthOf(g, geo, t) >= rate(g, "edge"));
  if (grudges.length && pick("war", 100) < rate(g, "war")) { const [c, t] = grudges[pick("whom", grudges.length)]; move(c, "WAR", t); }
  const all = [...near.keys()].filter((c) => c !== me);
  for (let k = 0; k < RIVALS.treaties && all.length; k++) {
    const c = all[pick(`asks:${k}`, all.length)], list = near.get(c), t = list[pick(`of:${k}`, list.length)], kind = NEXT[treatyOf(g, c, t)?.kind || ""];
    if (kind && (kind === "trade" || warsOf(g, c).length || warsOf(g, t).length) && !atWar(g, c, t) && treatyAnswer(g, c, t, kind, (x) => strengthOf(g, geo, x)).ok) move(c, "TREATY", t, kind);
  }
  // round 3: a pact of non-aggression between two neighbours with no treaty, when the answer would be yes
  if (all.length && pick("pact", 100) < rate(g, "pact")) {
    const c = all[pick("pact:asks", all.length)], list = near.get(c).filter((t) => !treatyOf(g, c, t) && !(t === me && g.offers.some((o) => o.from === c && o.kind === "pact"))), t = list[pick("pact:of", list.length || 1)];
    if (t && pactAnswer(g, geo, t === me ? me : c, t === me ? c : t, "peace").ok) move(c, "PACT", t);
  }
  // round 3: tribute demanded of a weaker neighbour in trouble that would pay
  if (pick("tribute", 100) < rate(g, "tribute")) {
    const weak = [...new Set([...g.wars.flatMap((w) => w.pair.split("|")), ...Object.keys(g.gauge || {}).filter((c) => gaugeOf(g, c, "s") < 2)])].filter((c) => near.has(c)).sort();
    const asks = weak.flatMap((t) => near.get(t).filter((c) => c !== me && (t !== me || mayDun(g, c)) && gaugeOf(g, c, "s") >= 2 && pactAnswer(g, geo, c, t, "tribute").ok).map((c) => [c, t]));
    if (asks.length) { const [c, t] = asks[pick("tribute:whom", asks.length)]; move(c, "TRIBUTE", t); }
  }
  return moves;
}
