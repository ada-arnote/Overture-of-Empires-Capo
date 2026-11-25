// SPDX-License-Identifier: AGPL-3.0-or-later
// Bots for Grain and Glass: pick the next thing worth building, then trade towards it.
import { steps } from "../areas.js";
import { COST, NONE, WASTE, boardOf, canPay, depotSpots, glass, pointsOf, rateOf, routeSpots } from "./rules.js";

export const TIERS = ["random", "easy", "normal"];
const WAYS = { sum: [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1], high: [0, 1, 3, 5, 7, 9, 11] };

/** How much a hex yields in a round, in ways out of 36, for each good. */
function yieldOf(p, at, town = 1) {
  const { near } = boardOf(p), out = [0, 0, 0, 0];
  for (const c of [at, ...near[at]]) if (p.land[c] && p.good[c] !== WASTE && c !== p.gate) out[p.good[c]] += WAYS[p.rule.roll][p.num[c]] * town;
  return out;
}
/** How good a place is for a depot: what it yields, how many kinds, and a port. */
export function spotWorth(p, s, at) {
  const y = yieldOf(p, at), have = [0, 0, 0, 0];
  p.depot.forEach((o, i) => { if (o === s) yieldOf(p, i).forEach((v, k) => { have[k] += v; }); });
  return y.reduce((n, v, k) => n + v * (have[k] < 6 ? 3 : 2), 0) + y.filter((v) => v > 0).length * 4 + (p.port[at] !== NONE ? 5 : 0);
}
const lack = (h, cost) => cost.reduce((n, c, k) => n + Math.max(0, c - h[k]), 0);

/** What to aim for now: [cost, move]. */
function aim(p, s) {
  const towns = p.depot.flatMap((o, at) => (o === s && !p.town[at] ? [at] : [])), spots = depotSpots(p, s);
  const best = (list, f) => (list.length ? list.reduce((a, b) => (f(b) > f(a) ? b : a)) : undefined);
  if (spots.length) return [COST.depot, { do: "depot", at: best(spots, (i) => spotWorth(p, s, i)) }];
  if (towns.length && lack(p.hands[s], COST.town) <= 2) return [COST.town, { do: "town", at: best(towns, (i) => spotWorth(p, s, i)) }];
  // reach towards the best free place within three steps
  const { near } = boardOf(p), open = depotSpots({ ...p, route: p.route.map(() => [s]) }, s), from = routeSpots(p, s).filter((i) => p.land[i]);
  if (open.length && from.length) { // the nearest good free place, by land, and the first step towards it
    const d = steps(near, from, (i) => p.land[i]), goal = best(open.filter((i) => d[i] >= 0), (i) => spotWorth(p, s, i) * 3 - 14 * d[i]);
    if (goal !== undefined) {
      const back = steps(near, [goal], (i) => p.land[i]);
      return [COST.route, { do: "route", at: best(from.filter((f) => back[f] >= 0), (f) => -back[f] * 10 + spotWorth(p, s, f)) ?? from[0] }];
    }
  }
  if (towns.length) return [COST.town, { do: "town", at: best(towns, (i) => spotWorth(p, s, i)) }];
  return [COST.plan, { do: "plan" }];
}

function* plan(p, dice, tier) {
  const all = glass.moves(p), s = p.seat, h = p.hands[s];
  if (tier === "random") return dice.pick(all);
  if (p.phase === "open") return all.reduce((a, b) => (spotWorth(p, s, b.at) + dice.below(tier === "easy" ? 30 : 2) > spotWorth(p, s, a.at) ? b : a));
  if (p.phase === "toll") { // block a rival's best hex, never your own
    const hurt = (at) => { let n = 0; for (const c of [at, ...boardOf(p).near[at]]) if (p.depot[c] !== NONE) n += (p.depot[c] === s ? -3 : 1 + pointsOf(p, p.depot[c])) * (p.town[c] ? 2 : 1); return n * WAYS[p.rule.roll][p.num[at]]; };
    return all.reduce((a, b) => (hurt(b.at) > hurt(a.at) ? b : a));
  }
  if (p.phase === "works") return all.reduce((a, b) => (spotWorth(p, s, b.at) > spotWorth(p, s, a.at) ? b : a));
  yield;
  const has = (m) => all.find((x) => Object.keys(m).every((k) => x[k] === m[k]));
  const win = all.find((m) => ["town", "depot", "charter"].includes(m.do) && pointsOf(p, s) + (m.do === "depot" ? 1 : 2) >= p.rule.goal);
  if (win) return win;
  for (const k of ["harvest", "works", "toll"]) { const u = has({ do: "use", plan: k }); if (u && (k !== "works" || canPay(h, COST.route) === false)) return u; }
  const [cost, target] = aim(p, s), go = has(target);
  if (go && tier !== "easy") return go;
  const charter = all.find((m) => m.do === "charter");
  if (charter) return charter;
  if (go) return go;
  // trade towards the target: give what is spare for what is short
  const short = [0, 1, 2, 3].filter((k) => h[k] < cost[k]), spare = [0, 1, 2, 3].filter((k) => h[k] > cost[k]).sort((a, b) => h[b] - h[a]);
  for (const g of short) {
    for (const x of spare) {
      const offer = all.find((m) => m.do === "offer" && m.give === x && m.get === g && p.hands[m.to][g] >= 2 && p.hands[m.to][x] <= p.hands[m.to][g] - 1);
      if (offer && pointsOf(p, offer.to) < p.rule.goal - 2) return offer;
      const swap = has({ do: "swap", give: x, get: g });
      if (swap && h[x] - rateOf(p, s, x) >= cost[x]) return swap;
      const sell = has({ do: "sell", good: x });
      if (sell && p.coin[s] < 4) return sell;
    }
    const buy = has({ do: "buy", good: g });
    if (buy) return buy;
  }
  const extra = has({ do: "plan" });
  if (extra && h.reduce((n, v) => n + v, 0) > 8) return extra;
  const town = all.find((m) => m.do === "town");
  if (town) return town;
  return { do: "end" };
}

export function* thinking(p, dice, tier = "normal") { return yield* plan(p, dice, tier); }
export function choose(p, dice, tier) {
  const t = thinking(p, dice, tier);
  for (;;) { const s = t.next(); if (s.done) return s.value; }
}
