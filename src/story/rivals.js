// SPDX-License-Identifier: AGPL-3.0-or-later
// The rules-only turn: what other countries do when no AI proposed anything for them (the AI is down, or its reply
// held no moves for other countries). Small on purpose, and every threshold is written here:
//   attack: a country at war attacks the enemy province it has the best chance against, when that chance is 45 or
//     more; one side of each war a turn, three attacks at most;
//   war: only on a neighbour it stands at -2 or lower with, is at least 2 stronger than, has no treaty or truce
//     with, and only when it has no war already; one a turn at most, and then one time in four;
//   treaty: one country a turn asks one neighbour for the next treaty up, when the answer would be yes; beyond
//     trade, only while one of the two is at war (blocs form around wars, not in a quiet world).
// Peace needs no proposal: wars end by rule at the end of every turn (war.js).
// These are proposals like the AI's own: the same rules judge each one and write its receipt line. Which country
// moves is drawn from the game's seed and the turn, so a turn replays.
import { hash32 } from "./line.js";
import { relOf, treatyAnswer } from "./relations.js";
import { strengthOf, truceUntil } from "./war.js";
import { atWar, attackPlan, treatyOf, turnKey, warsOf } from "./worldrules.js";

export const RIVALS = { odds: 45, attacks: 3, grudge: -2, edge: 2, war: 25, treaties: 1 };
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
  const grudges = Object.entries(g.rel || {}).filter(([, [rel]]) => rel <= RIVALS.grudge).map(([k]) => k).sort().flatMap((k) => { const [a, b] = k.split("|"); return [[a, b], [b, a]]; })
    .filter(([c, t]) => c !== me && near.get(c)?.includes(t) && !warsOf(g, c).length && !atWar(g, c, t) && !treatyOf(g, c, t) && !truceUntil(g, c, t) && strengthOf(g, geo, c) - strengthOf(g, geo, t) >= RIVALS.edge);
  if (grudges.length && pick("war", 100) < RIVALS.war) { const [c, t] = grudges[pick("whom", grudges.length)]; move(c, "WAR", t); }
  const all = [...near.keys()].filter((c) => c !== me);
  for (let k = 0; k < RIVALS.treaties && all.length; k++) {
    const c = all[pick(`asks:${k}`, all.length)], list = near.get(c), t = list[pick(`of:${k}`, list.length)], kind = NEXT[treatyOf(g, c, t)?.kind || ""];
    if (kind && (kind === "trade" || warsOf(g, c).length || warsOf(g, t).length) && !atWar(g, c, t) && treatyAnswer(g, c, t, kind, (x) => strengthOf(g, geo, x)).ok) move(c, "TREATY", t, kind);
  }
  return moves;
}
