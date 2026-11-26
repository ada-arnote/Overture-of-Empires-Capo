// SPDX-License-Identifier: AGPL-3.0-or-later
// Bots for Grain and Glass: pick the next thing worth building, then trade towards it. They keep their hands under the
// spoilage line, send the toll gate where it hurts the leader most, chase the awards when they are close, and leave an
// offer standing when nobody takes one now. A bot trades only when the swap brings its next build closer (or is plain
// profit), never with a seat about to win, counters once when it wants the good but not the terms, draws a plan when
// the price is goods it can spare, and keeps a harvest plan until it finishes a build.
import { steps } from "../areas.js";
import { AWARD, COST, NONE, WASTE, answer, boardOf, canPay, depotSpots, glass, harvestOf, pointsOf, rateOf, roadOf, routeSpots, total } from "./rules.js";

export const TIERS = ["random", "easy", "normal"];
/** For measuring plans (tools/plans.mjs): seats listed in `seek` aim for a plan whenever their next build is `far` goods or more away and a plan is no further. Empty in play. */
export const trial = { seek: [], far: 2 };
const WAYS = { sum: [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1], high: [0, 1, 3, 5, 7, 9, 11] };

/** How much a hex yields in a round, in ways out of 36, for each good. */
function yieldOf(p, at, town = 1) {
  const { near } = boardOf(p), out = [0, 0, 0, 0];
  for (const c of [at, ...near[at]]) if (p.land[c] && p.good[c] !== WASTE && c !== p.gate) out[p.good[c]] += WAYS[p.rule.roll][p.num[c]] * town;
  return out;
}
/** What a seat gathers already, for each good. */
function haveOf(p, s) {
  const have = [0, 0, 0, 0];
  p.depot.forEach((o, i) => { if (o === s) yieldOf(p, i).forEach((v, k) => { have[k] += v; }); });
  return have;
}
/** How good a place is for a depot: what it yields, how many kinds, and a port. */
export function spotWorth(p, s, at, have = haveOf(p, s)) { return worthOf(p, s, at, have); }
function worthOf(p, s, at, have) {
  const y = yieldOf(p, at);
  return y.reduce((n, v, k) => n + v * (have[k] < 6 ? 3 : 2), 0) + y.filter((v) => v > 0).length * 4 + (p.port[at] !== NONE ? 5 : 0);
}
const lack = (h, cost) => cost.reduce((n, c, k) => n + Math.max(0, c - h[k]), 0);

/** What to aim for now: [cost, move]. A seat on trial (see `trial`) may aim for a plan instead. */
function aim(p, s) {
  const [cost, move] = target(p, s), h = p.hands[s];
  if (trial.seek.includes(s) && p.rule.plans && p.deck.length && lack(h, cost) >= trial.far && lack(h, COST.plan) <= lack(h, cost)) return [COST.plan, { do: "plan" }];
  return [cost, move];
}
/** The next build worth aiming for: [cost, move]. */
function target(p, s) {
  const towns = p.depot.flatMap((o, at) => (o === s && !p.town[at] ? [at] : [])), spots = depotSpots(p, s), have = haveOf(p, s), spotWorth = (q, seat, at) => worthOf(q, seat, at, have);
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
/**
 * Would a seat give `out` of good `a` for `inn` of good `b` from `other`? Yes when it leaves the seat nearer its next
 * build and costs less than the bank would, or when it is more goods for none it needs; never with a seat about to win.
 */
export function wants(p, s, a, out, b, inn, other, cost = aim(p, s)[0]) {
  const h = p.hands[s];
  if (h[a] < out || (other !== NONE && pointsOf(p, other) >= p.rule.goal - 2)) return false;
  const was = lack(h, cost), now = lack(h.map((v, g) => v - (g === a ? out : 0) + (g === b ? inn : 0)), cost);
  return now < was ? out < rateOf(p, s, a) : now === was && inn > out && total(h) - out + inn <= (p.rule.hand || 99); // and no profit that would only spoil
}
/** Routes still to lay to take the Great Road (0 when held or out of sight). */
function roadGap(p, s) {
  if (!p.rule.awards || p.road === s) return 0;
  return (p.road === NONE ? AWARD.road : roadOf(p, p.road) + 1) - roadOf(p, s);
}

function* plan(p, dice, tier) {
  const all = glass.moves(p), s = p.seat, h = p.hands[s];
  if (tier === "random") return dice.pick(all);
  if (p.phase === "open") return all.reduce((a, b) => (spotWorth(p, s, b.at) + dice.below(tier === "easy" ? 30 : 2) > spotWorth(p, s, a.at) ? b : a));
  if (p.phase === "spoil") { // lose what the next build needs least
    const [cost] = aim(p, s), keep = (m) => h[m.good] - cost[m.good];
    return all.reduce((a, b) => (keep(b) > keep(a) ? b : a));
  }
  if (p.phase === "toll") { // block a rival's best hex, never your own, and take from the one ahead
    const hurt = (at) => { let n = 0; for (const c of [at, ...boardOf(p).near[at]]) if (p.depot[c] !== NONE) n += (p.depot[c] === s ? -3 : 1 + pointsOf(p, p.depot[c])) * (p.town[c] ? 2 : 1); return n * WAYS[p.rule.roll][p.num[at]]; };
    const worth = (m) => hurt(m.at) * 4 + (m.from === undefined ? 0 : 8 + 2 * pointsOf(p, m.from) + Math.min(8, total(p.hands[m.from])));
    return all.reduce((a, b) => (worth(b) > worth(a) ? b : a));
  }
  if (p.phase === "works") return all.reduce((a, b) => (spotWorth(p, s, b.at) > spotWorth(p, s, a.at) ? b : a));
  yield;
  const has = (m) => all.find((x) => Object.keys(m).every((k) => x[k] === m[k]));
  const win = all.find((m) => ["town", "depot", "charter"].includes(m.do) && pointsOf(p, s) + (m.do === "depot" ? 1 : 2) >= p.rule.goal);
  if (win) return win;
  const [cost, target] = aim(p, s), go = has(target);
  for (const k of ["harvest", "works", "toll"]) {
    const u = has({ do: "use", plan: k });
    if (!u || (k === "works" && canPay(h, COST.route))) continue;
    // a harvest waits until its two goods bring the next build closer, unless the hand is nearly bare or another is held
    if (k === "harvest" && tier === "normal" && total(h) > 3 && p.held[s].filter((x) => x === k).length < 2 && lack(harvestOf(h), cost) >= lack(h, cost)) continue;
    return u;
  }
  // standing offers: take one the plain rule takes, from someone not about to win; withdraw one that no longer helps
  const take = all.find((m) => m.do === "take" && (tier === "normal" ? wants(p, s, m.get, m.k, m.give, m.n, m.from, cost) : answer(p, s, m.give, m.get, m.n, m.k) && pointsOf(p, m.from) < p.rule.goal - 2));
  if (take) return take;
  const stale = all.find((m) => m.do === "withdraw" && (h[m.give] <= cost[m.give] || h[m.get] >= cost[m.get]));
  if (stale) return stale;
  // the Great Road: lay the last route or two when it is in reach
  const gap = roadGap(p, s), routes = all.filter((m) => m.do === "route");
  if (gap > 0 && gap <= (tier === "easy" ? 1 : 2) && routes.length && (!go || go.do === "route" || gap === 1)) return go?.do === "route" ? go : routes.reduce((a, b) => (spotWorth(p, s, b.at) > spotWorth(p, s, a.at) ? b : a));
  if (go && tier !== "easy") return go;
  const charter = all.find((m) => m.do === "charter");
  if (charter) return charter;
  if (go) return go;
  // trade towards the target: give what is spare for what is short
  // an offer goes only to a seat expected to take it: one for one first, then two of a deep pile for one, where the bank asks more
  const short = [0, 1, 2, 3].filter((k) => h[k] < cost[k]), spare = [0, 1, 2, 3].filter((k) => h[k] > cost[k]).sort((a, b) => h[b] - h[a]);
  const aims = new Map(), costOf = (o) => { if (!aims.has(o)) aims.set(o, aim(p, o)[0]); return aims.get(o); };
  const takes = (m) => pointsOf(p, m.to) < p.rule.goal - 2 && (tier === "normal" ? wants(p, m.to, m.get, m.k, m.give, m.n, s, costOf(m.to)) : answer(p, m.to, m.give, m.get, m.n, m.k));
  for (const g of short) {
    for (const x of spare) {
      for (const n of tier === "normal" && h[x] - 2 >= cost[x] && rateOf(p, s, x) > 2 ? [1, 2] : [1]) {
        const offer = all.find((m) => m.do === "offer" && m.to !== NONE && m.give === x && m.get === g && m.n === n && m.k === 1 && takes(m));
        if (offer) return offer;
      }
      const swap = has({ do: "swap", give: x, get: g });
      if (swap && h[x] - rateOf(p, s, x) >= cost[x]) return swap;
      const sell = has({ do: "sell", good: x });
      if (sell && p.coin[s] < 4) return sell;
    }
    const buy = has({ do: "buy", good: g });
    if (buy) return buy;
  }
  const limit = p.rule.hand || 99, held = total(h);
  const extra = has({ do: "plan" });
  if (extra && (held > 8 || held > limit - 2)) return extra;
  if (extra && tier === "normal") { // a plan paid for with goods the next build does not need, a toll short of the Toll Warden, or a draw that may be the winning seal
    const now = lack(h.map((v, k) => v - COST.plan[k]), cost) - lack(h, cost);
    const chase = p.rule.awards && p.rule.gate && p.warden !== s && p.tolls[s] + p.held[s].filter((k) => k === "toll").length + 1 >= (p.warden === NONE ? AWARD.warden : p.tolls[p.warden] + 1);
    if (now <= 1 || (now <= 2 && (chase || held >= 7)) || pointsOf(p, s) >= p.rule.goal - 1) return extra;
  }
  const town = all.find((m) => m.do === "town");
  if (town) return town;
  if (held > limit) { // over the spoilage line: lay a route, or swap the biggest pile for the smallest
    if (routes.length) return routes.reduce((a, b) => (spotWorth(p, s, b.at) > spotWorth(p, s, a.at) ? b : a));
    const most = [0, 1, 2, 3].reduce((a, b) => (h[b] - cost[b] > h[a] - cost[a] ? b : a)), least = [0, 1, 2, 3].reduce((a, b) => (h[b] - cost[b] < h[a] - cost[a] ? b : a));
    const swap = has({ do: "swap", give: most, get: least });
    if (swap) return swap;
  }
  // nothing more this turn: leave one offer standing for anyone, the spare for the short
  if (tier !== "easy" && short.length && spare.length) { const post = has({ do: "offer", to: NONE, give: spare[0], get: short[0], n: 1, k: 1 }); if (post) return post; }
  return { do: "end" };
}

export function* thinking(p, dice, tier = "normal") {
  // a bot answers an offer now and never leaves one open. The easy bot answers by the plain rule; the full bot by what
  // its next build needs, and names other terms once when it wants the good: another good of its own, or two for one from the leader.
  if (p.phase === "answer") {
    const a = p.ask, s = p.seat, say = (yes) => ({ do: yes ? "accept" : "refuse" });
    if (a.countered) return say(tier === "normal" ? wants(p, s, a.give, a.n, a.get, a.k, a.to) : answer(p, s, a.get, a.give, a.k, a.n));
    if (tier !== "normal") return say(answer(p, s, a.give, a.get, a.n, a.k));
    const cost = aim(p, s)[0];
    if (wants(p, s, a.get, a.k, a.give, a.n, a.from, cost)) return say(true);
    if (p.hands[s][a.give] >= cost[a.give]) return say(false);
    const pts = Array.from({ length: p.seats }, (_, o) => pointsOf(p, o)), leads = pts[a.from] >= 5 && pts.every((v, o) => o === a.from || v < pts[a.from]);
    const terms = leads ? [[2, 1], [1, 1]] : [[1, 1], [2, 1]], all = glass.moves(p);
    for (const [n, k] of terms) {
      const c = all.find((m) => m.do === "counter" && m.n === n && m.k === k && wants(p, s, m.get, k, a.give, n, a.from, cost));
      if (c) return c;
    }
    return say(false);
  }
  return yield* plan(p, dice, tier);
}
export function choose(p, dice, tier) {
  const t = thinking(p, dice, tier);
  for (;;) { const s = t.next(); if (s.done) return s.value; }
}
