// SPDX-License-Identifier: AGPL-3.0-or-later
// Grain and Glass (working name). Hexes yield goods when their number is rolled. Build routes from hex to hex,
// depots and towns in the hexes they reach, trade, and race to a points total.
// Traditional is the genre as it is remembered, with our own island, goods, costs, cards and total.
// Capo adds a market with falling prices and public charters. Custom is every switch by hand.
import { hexBoard, joined } from "../hex.js";

export const NONE = -1, GOODS = ["Grain", "Glass", "Clay", "Salt"], WASTE = -1;
export const COST = { route: [0, 0, 2, 2], depot: [2, 2, 2, 0], town: [0, 4, 0, 4], plan: [2, 2, 0, 2], ship: [0, 2, 0, 2], harbour: [2, 0, 4, 0] }; // a depot gathers from seven hexes, so things cost more
export const PLANS = ["harvest", "works", "toll", "seal"];
const SIZES = { small: { radius: 5, land: 0 }, medium: { radius: 7, land: 0 }, large: { radius: 8, land: 24 } };
/** What the rule sets set. Custom takes each of these as it is given. */
export const SWITCHES = {
  size: { values: Object.keys(SIZES), normal: "medium" }, roll: { values: ["sum", "high"], normal: "sum" }, goal: { values: [8, 9, 10, 11, 12, 14], normal: 10 },
  market: { values: ["fixed", "falling"], normal: "fixed" }, charters: { values: [false, true], normal: false }, gate: { values: [false, true], normal: true },
  plans: { values: [false, true], normal: true }, offers: { values: [0, 1, 2, 3], normal: 2 }, limit: { values: [12, 16, 24, 40], normal: 40 }, actions: { values: [3, 99], normal: 99 },
};
const SETS = {
  classic: () => ({ size: "medium", roll: "sum", goal: 10, market: "fixed", charters: false, gate: true, plans: true, offers: 2, limit: 40, actions: 99 }),
  ours: () => ({ size: "small", roll: "high", goal: 14, market: "falling", charters: true, gate: false, plans: false, offers: 1, limit: 16, actions: 3 }),
};
export const EXPANSIONS = ["ships", "harbours", "seasons"];
const off = { values: [false, true], normal: false };

export const boardOf = (p) => hexBoard(SIZES[p.rule.size].radius);
export const goalOf = (p) => p.rule.goal;
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]);
export const canPay = (hand, cost) => hand.every((v, i) => v >= cost[i]);

/** Points: depots, towns, seals, charters, and two for joining two ports. */
export function pointsOf(p, s) {
  let n = p.seals[s] + 2 * p.charted[s];
  p.depot.forEach((o, i) => { if (o === s) n += p.town[i] ? 2 : 1; });
  if (p.rule.charters && joinedPorts(p, s)) n += 2;
  return n;
}
/** Does a seat's network join two ports? */
export function joinedPorts(p, s) {
  const { near } = boardOf(p), mine = (i) => p.route[i].includes(s) || p.depot[i] === s;
  const seen = new Set();
  for (let i = 0; i < p.land.length; i++) {
    if (!mine(i) || seen.has(i) || p.port[i] === NONE) continue;
    const g = joined(near, i, mine);
    for (const c of g) seen.add(c);
    if (g.filter((c) => p.port[c] !== NONE).length >= 2) return true;
  }
  return false;
}
/** Hexes a seat's routes and depots reach. */
export function reachOf(p, s) {
  const out = new Set();
  p.land.forEach((l, i) => { if (p.route[i].includes(s) || p.depot[i] === s) out.add(i); });
  return out;
}
/** Where a seat may put a route: land (or sea with ships) beside what it reaches, without its own route already. */
export function routeSpots(p, s) {
  const { near } = boardOf(p), mine = reachOf(p, s), out = new Set();
  for (const i of mine) for (const m of near[i]) if (!p.route[m].includes(s) && p.depot[m] !== s && (p.land[m] || (p.ships && near[m].some((x) => p.land[x])))) out.add(m);
  return [...out].sort((a, b) => a - b);
}
/** Where a seat may put a depot: land it reaches (or anywhere in the opening), with no depot on it or beside it. */
export function depotSpots(p, s, opening = false) {
  const { near } = boardOf(p), mine = reachOf(p, s);
  return p.land.flatMap((l, i) => (l && p.depot[i] === NONE && near[i].every((m) => p.depot[m] === NONE) && (opening || mine.has(i)) ? [i] : []));
}
/** How many of a good a seat gives at the market for one of any other. */
export function rateOf(p, s, good) {
  let r = p.rule.market === "fixed" ? 4 : 99;
  p.depot.forEach((o, i) => { if (o === s && p.port[i] !== NONE) r = Math.min(r, p.port[i] === good ? 2 : 3); if (o === s && p.harbour[i]) r = Math.min(r, 2); });
  return r;
}
/** What one good sells for at a falling market, in coin. */
export const priceOf = (p, good) => Math.max(1, 3 - p.sold[good]);

const copy = (p) => ({ ...p, hands: p.hands.map((h) => [...h]), coin: [...p.coin], route: p.route.map((r) => [...r]), depot: [...p.depot], town: [...p.town], harbour: [...p.harbour], deck: [...p.deck], held: p.held.map((h) => [...h]), seals: [...p.seals], charted: [...p.charted], sold: [...p.sold], charter: p.charter.map((c) => [...c]), offers: p.offers, roll: p.roll && [...p.roll] });

/** The harvest. Every hex with the number gives one good to each depot on it or beside it, two to a town. */
function harvest(p, n, double, events) {
  const { near } = boardOf(p), got = p.hands.map(() => [0, 0, 0, 0]);
  p.land.forEach((l, i) => {
    if (!l || p.num[i] !== n || p.gate === i || p.good[i] === WASTE) return;
    for (const c of [i, ...near[i]]) if (p.depot[c] !== NONE) got[p.depot[c]][p.good[i]] += (p.town[c] ? 2 : 1) * (double ? 2 : 1);
  });
  got.forEach((g, s) => { p.hands[s] = add(p.hands[s], g); });
  events.push({ kind: "harvest", n, got });
}
/** The start of a seat's turn: the roll. Changes p. */
function begin(p, dice, events) {
  p.left = p.rule.actions;
  p.offers = p.rule.offers;
  p.played = 0;
  p.free = 0;
  p.sold = p.sold.map((v) => Math.max(0, v - 1));
  const a = dice.die(), b = dice.die(), n = p.rule.roll === "sum" ? a + b : Math.max(a, b);
  p.roll = [a, b];
  events.push({ kind: "roll", seat: p.seat, dice: [a, b], n });
  harvest(p, n, p.rule.roll === "high" && a === b, events);
  p.phase = p.rule.gate && a === b ? "toll" : "main";
  if (p.event !== undefined) season(p, dice, events);
}
function season(p, dice, events) {
  if (p.step !== 0) return;
  p.event = dice.pick(["fair", "fair", "fair", "plenty", "drought", "fair trade"]);
  if (p.event === "plenty") p.hands = p.hands.map((h) => h.map((v, k) => v + (k === p.round % 4 ? 1 : 0)));
  if (p.event !== "fair") events.push({ kind: "season", what: p.event, good: p.round % 4 });
}
function finish(p, winners, why, events) {
  p.over = { winners, why };
  p.phase = "over";
  events.push({ kind: "end", winners, why });
}
function settle(p, events) {
  if (pointsOf(p, p.seat) >= goalOf(p)) finish(p, [p.seat], "reached the points", events);
}
/** Pass the turn. The first seat of a round rotates. Changes p. */
function pass(p, dice, events) {
  if (++p.step === p.seats) {
    p.step = 0;
    p.round++;
    if (p.round > p.rounds) {
      const pts = Array.from({ length: p.seats }, (_, s) => pointsOf(p, s)), most = Math.max(...pts);
      return finish(p, pts.flatMap((v, s) => (v === most ? [s] : [])), "had the most points at the end", events);
    }
  }
  p.seat = (p.first + p.step + p.round - 1) % p.seats;
  return begin(p, dice, events);
}

/** The island: land grown from the middle, goods and numbers spread so that no two of the busiest numbers touch. */
/** Land grows with the number of players, so that everyone has room. */
export const landFor = (size, seats) => (size === "small" ? 20 + 8 * seats : 24 + 12 * seats + SIZES[size].land);
function island(rule, dice, seats) {
  const { radius } = SIZES[rule.size], land = landFor(rule.size, seats), b = hexBoard(radius), far = ([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
  const dry = new Set([b.cells.findIndex((c) => far(c) === 0)]);
  while (dry.size < land) {
    const edge = [...new Set([...dry].flatMap((i) => b.near[i]))].filter((i) => !dry.has(i) && far(b.cells[i]) < radius);
    const v = (i) => b.near[i].filter((m) => dry.has(m)).length * 3 - far(b.cells[i]) + dice.below(6);
    dry.add(edge.map((i) => [v(i), i]).reduce((x, y) => (y[0] > x[0] ? y : x))[1]);
  }
  const cells = dice.shuffle([...dry]), wastes = Math.max(1, Math.round(land / 24)), good = b.cells.map(() => WASTE), num = b.cells.map(() => 0);
  cells.slice(wastes).forEach((c, k) => { good[c] = k % 4; });
  // numbers: how often each comes up, spread over the producing hexes, the busiest kept apart
  const faces = rule.roll === "sum" ? [2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12] : [1, 2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6];
  const busy = rule.roll === "sum" ? [6, 7, 8] : [5, 6];
  for (let t = 0; t < 30; t++) {
    const work = cells.slice(wastes), list = [];
    while (list.length < work.length) list.push(...dice.shuffle(faces));
    work.forEach((c, k) => { num[c] = list[k]; });
    if (!work.some((c) => busy.includes(num[c]) && b.near[c].some((m) => busy.includes(num[m]) && good[m] !== WASTE))) break;
  }
  const coast = [...dry].filter((i) => b.near[i].length < 6 || b.near[i].some((m) => !dry.has(m))), port = b.cells.map(() => NONE), ports = dice.shuffle(coast).slice(0, Math.max(4, Math.round(land / 9)));
  ports.forEach((c, k) => { port[c] = k < 4 ? k : 4; });
  return { land: b.cells.map((_, i) => (dry.has(i) ? 1 : 0)), good, num, port, gate: cells.slice(0, wastes)[0] };
}

export const glass = {
  id: "glass", version: "1",
  options: {
    style: { values: ["classic", "ours", "custom"], normal: "classic" }, seats: { values: [2, 3, 4, 5, 6], normal: 3 },
    ...SWITCHES, ...Object.fromEntries(EXPANSIONS.map((x) => [x, off])),
  },
  setup(o, dice) {
    const rule = SETS[o.style] ? SETS[o.style](o) : Object.fromEntries(Object.keys(SWITCHES).map((k) => [k, o[k]]));
        const isle = island(rule, dice, o.seats), first = dice.below(o.seats), n = isle.land.length, zero = () => Array(n).fill(0);
    const p = { style: o.style, classic: o.style !== "ours", rule, seats: o.seats, ...isle, gate: rule.gate ? isle.gate : NONE, ships: o.ships, harbours: o.harbours,
      hands: Array.from({ length: o.seats }, () => [0, 0, 0, 0]), coin: Array(o.seats).fill(rule.market === "falling" ? 2 : 0), route: Array.from({ length: n }, () => []), depot: Array(n).fill(NONE), town: zero(), harbour: zero(),
      deck: rule.plans ? dice.shuffle([...Array(6).fill("harvest"), ...Array(5).fill("works"), ...Array(5).fill("toll"), ...Array(5).fill("seal")]) : [], held: Array.from({ length: o.seats }, () => []), seals: Array(o.seats).fill(0), charted: Array(o.seats).fill(0),
      sold: [0, 0, 0, 0], charter: rule.charters ? [0, 1, 2].map(() => dice.shuffle([0, 0, 1, 1, 2, 2, 3, 3]).slice(0, 6)) : [], first, seat: first, step: 0, round: 1, rounds: rule.limit, phase: "open", opened: 0, left: 0, offers: 0, played: 0, free: 0, roll: null, over: null };
    if (o.seasons) p.event = "fair";
    return p;
  },
  turn: (p) => (p.over ? null : p.seat),

  moves(p) {
    const s = p.seat, h = p.hands[s], out = [];
    if (p.phase === "open") {
      const spots = p.opened % 2 ? routeSpots(p, s).filter((i) => p.land[i]) : depotSpots(p, s, true), any = p.land.flatMap((l, i) => (l && p.depot[i] === NONE && !p.route[i].includes(s) ? [i] : [])); // a crowded island: anywhere free
      return (spots.length ? spots : any).map((at) => ({ do: p.opened % 2 ? "route" : "depot", at }));
    }
    if (p.phase === "toll") return p.land.flatMap((l, at) => (l && at !== p.gate && p.good[at] !== WASTE ? [{ do: "toll", at }] : []));
    if (p.phase === "works") return routeSpots(p, s).map((at) => ({ do: "route", at, free: true }));
    out.push({ do: "end" });
    if (p.left <= 0) return out;
    if (canPay(h, COST.route)) for (const at of routeSpots(p, s)) if (p.land[at] || canPay(h, COST.ship)) out.push({ do: "route", at });
    if (canPay(h, COST.depot)) for (const at of depotSpots(p, s)) out.push({ do: "depot", at });
    if (canPay(h, COST.town)) p.depot.forEach((o, at) => { if (o === s && !p.town[at]) out.push({ do: "town", at }); });
    if (p.harbours && canPay(h, COST.harbour)) p.depot.forEach((o, at) => { if (o === s && !p.harbour[at] && boardOf(p).near[at].some((m) => !p.land[m]) ) out.push({ do: "harbour", at }); });
    if (p.rule.plans && p.deck.length && canPay(h, COST.plan)) out.push({ do: "plan" });
    if (!p.played) for (const k of new Set(p.held[s])) out.push({ do: "use", plan: k });
    for (let g = 0; g < 4; g++) {
      if (p.rule.market === "fixed") { const r = rateOf(p, s, g); if (h[g] >= r) for (let w = 0; w < 4; w++) if (w !== g) out.push({ do: "swap", give: g, get: w }); }
      else {
        if (h[g] > 0) out.push({ do: "sell", good: g });
        if (p.coin[s] >= 4) out.push({ do: "buy", good: g });
      }
      if (p.offers > 0 && h[g] > 0) for (let o = 0; o < p.seats; o++) if (o !== s) for (let w = 0; w < 4; w++) if (w !== g && p.hands[o][w] > 0) out.push({ do: "offer", to: o, give: g, get: w });
    }
    if (p.rule.charters) p.charter.forEach((c, k) => { const need = [0, 1, 2, 3].map((g) => c.filter((x) => x === g).length); if (canPay(h, need)) out.push({ do: "charter", k }); });
    return out;
  },

  apply(before, m, dice) {
    const p = copy(before), s = p.seat, events = [];
    const spend = (cost) => { p.hands[s] = add(p.hands[s], cost, -1); };
    if (m.do === "depot") {
      p.depot[m.at] = s;
      if (p.phase === "open") {
        if (p.opened >= 2 * p.seats) for (const c of [m.at, ...boardOf(p).near[m.at]]) if (p.land[c] && p.good[c] !== WASTE) p.hands[s][p.good[c]]++; // the second depot starts you off
      } else { spend(COST.depot); p.left--; }
      events.push({ kind: "depot", seat: s, at: m.at });
    } else if (m.do === "route") {
      p.route[m.at].push(s);
      p.route[m.at].sort((a, b) => a - b);
      if (p.phase === "main") { spend(p.land[m.at] ? COST.route : COST.ship); p.left--; }
      events.push({ kind: "route", seat: s, at: m.at, sea: !p.land[m.at] });
      if (p.phase === "works" && --p.free <= 0) p.phase = "main";
    } else if (m.do === "town") { spend(COST.town); p.town[m.at] = 1; p.left--; events.push({ kind: "town", seat: s, at: m.at }); }
    else if (m.do === "harbour") { spend(COST.harbour); p.harbour[m.at] = 1; p.left--; events.push({ kind: "harbour", seat: s, at: m.at }); }
    else if (m.do === "toll") { p.gate = m.at; p.phase = "main"; events.push({ kind: "toll", seat: s, at: m.at }); }
    else if (m.do === "plan") { spend(COST.plan); const k = p.deck.pop(); if (k === "seal") p.seals[s]++; else p.held[s].push(k); p.left--; events.push({ kind: "plan", seat: s, seal: k === "seal" }); }
    else if (m.do === "use") {
      p.held[s].splice(p.held[s].indexOf(m.plan), 1);
      p.played = 1;
      if (m.plan === "harvest") { const need = [0, 1, 2, 3].sort((a, b) => p.hands[s][a] - p.hands[s][b] || a - b).slice(0, 2); for (const g of need) p.hands[s][g]++; }
      if (m.plan === "works") { p.free = 2; if (routeSpots(p, s).length) p.phase = "works"; }
      if (m.plan === "toll" && p.gate !== NONE) p.phase = "toll";
      events.push({ kind: "use", seat: s, plan: m.plan });
    } else if (m.do === "swap") { p.hands[s][m.give] -= rateOf(p, s, m.give); p.hands[s][m.get]++; events.push({ kind: "swap", seat: s, give: m.give, get: m.get, n: rateOf(before, s, m.give) }); }
    else if (m.do === "sell") { p.coin[s] += priceOf(p, m.good); p.hands[s][m.good]--; p.sold[m.good]++; events.push({ kind: "sell", seat: s, good: m.good }); }
    else if (m.do === "buy") { p.coin[s] -= 4; p.hands[s][m.good]++; events.push({ kind: "buy", seat: s, good: m.good }); }
    else if (m.do === "offer") {
      p.offers--;
      const yes = answer(p, m.to, m.give, m.get);
      if (yes) { p.hands[s][m.give]--; p.hands[s][m.get]++; p.hands[m.to][m.give]++; p.hands[m.to][m.get]--; }
      events.push({ kind: "offer", seat: s, to: m.to, give: m.give, get: m.get, yes });
    } else if (m.do === "charter") {
      const c = p.charter[m.k];
      spend([0, 1, 2, 3].map((g) => c.filter((x) => x === g).length));
      p.charted[s]++;
      p.charter[m.k] = dice.shuffle([0, 0, 1, 1, 2, 2, 3, 3]).slice(0, 6);
      p.left--;
      events.push({ kind: "charter", seat: s });
    }
    if (p.phase === "open") {
      p.opened++;
      const round = Math.floor(p.opened / 2), back = round >= p.seats;
      // the second of two starts with one of each
      if (round >= 2 * p.seats) { if (p.seats === 2 && p.style !== "ours") p.hands[(p.first + 1) % 2] = p.hands[(p.first + 1) % 2].map((v) => v + 1); p.seat = p.first; begin(p, dice, events); } else if (p.opened % 2 === 0) p.seat = (p.first + (back ? 2 * p.seats - 1 - round : round)) % p.seats; // there and back, from a first player drawn by dice
      return { position: p, events };
    }
    if (m.do === "end") { events.push({ kind: "done", seat: s }); pass(p, dice, events); } else settle(p, events);
    return { position: p, events };
  },
  result: (p) => p.over,
};

/** Does a seat take a one-for-one swap? Plainly, so that a player can see why: it gives what it has most of, for what it has least of. */
export function answer(p, seat, give, get) {
  const h = p.hands[seat];
  if (h[get] < 1) return false;
  return h[get] >= 2 && h[give] <= h[get] - 1;
}
