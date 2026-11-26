// SPDX-License-Identifier: AGPL-3.0-or-later
// Grain and Glass (working name). Hexes yield goods when their number is rolled. Build routes from hex to hex,
// depots and towns in the hexes they reach, trade, and race to a points total.
// Traditional is the genre as it is played, on our own island, with our own goods, costs, cards and total: a raid roll
// that spoils big hands and moves the toll gate, which takes a good; two awards; a lean opening; offers that stand.
// Capo adds a market with falling prices and public charters. Custom is every switch by hand.
import { hexBoard, joined } from "../hex.js";

export const NONE = -1, GOODS = ["Grain", "Glass", "Clay", "Salt"], WASTE = -1;
export const COST = { route: [0, 0, 2, 2], depot: [2, 2, 2, 0], town: [0, 4, 0, 4], plan: [2, 2, 0, 2], ship: [0, 2, 0, 2], harbour: [2, 0, 4, 0] }; // a depot gathers from seven hexes, so things cost more
export const PLANS = ["harvest", "works", "toll", "seal"];
/** The least that wins each award: routes in one joined network (the Great Road), toll plans played (the Toll Warden). Each is worth 2. */
export const AWARD = { road: 5, warden: 2 };
/** The numbers that come up most, kept apart on the island. */
export const BUSY = { sum: [6, 8], high: [5, 6] };
const SIZES = { small: { radius: 5, land: 0 }, medium: { radius: 7, land: 0 }, large: { radius: 8, land: 24 } };
/** What the rule sets set. Custom takes each of these as it is given. */
export const SWITCHES = {
  size: { values: Object.keys(SIZES), normal: "medium" }, roll: { values: ["sum", "high"], normal: "sum" }, goal: { values: [8, 9, 10, 11, 12, 14], normal: 10 },
  market: { values: ["fixed", "falling"], normal: "fixed" }, charters: { values: [false, true], normal: false }, gate: { values: [false, true], normal: true },
  plans: { values: [false, true], normal: true }, offers: { values: [0, 1, 2, 3], normal: 2 }, limit: { values: [12, 16, 24, 40], normal: 40 }, actions: { values: [3, 99], normal: 99 },
  order: { values: ["fixed", "rotate"], normal: "fixed" }, // rotate: the first seat moves on each round
  hand: { values: [0, 9, 12, 16], normal: 12 }, // on a raid roll, a hand of more goods than this spoils by half; 0: never
  awards: { values: [false, true], normal: true }, // the Great Road and the Toll Warden
  opening: { values: ["lean", "full"], normal: "lean" }, // the second depot starts you with one of each good beside it, or one for every hex
};
const SETS = {
  classic: () => ({ size: "medium", roll: "sum", goal: 10, market: "fixed", charters: false, gate: true, plans: true, offers: 2, limit: 40, actions: 99, order: "fixed", hand: 12, awards: true, opening: "lean" }),
  ours: () => ({ size: "small", roll: "high", goal: 14, market: "falling", charters: true, gate: false, plans: false, offers: 1, limit: 16, actions: 3, order: "fixed", hand: 0, awards: false, opening: "full" }),
};
export const EXPANSIONS = ["ships", "harbours", "seasons"];
const off = { values: [false, true], normal: false };

// a small island grows by one ring at six seats, or its land would not fit inside the rim
const radiusOf = (size, seats) => SIZES[size].radius + (size === "small" && seats > 5 ? 1 : 0);
export const boardOf = (p) => hexBoard(radiusOf(p.rule.size, p.seats));
export const goalOf = (p) => p.rule.goal;
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]);
export const canPay = (hand, cost) => hand.every((v, i) => v >= cost[i]);
export const total = (hand) => hand.reduce((n, v) => n + v, 0);
/** The raid roll: a 7 when two dice are added, doubles when the higher die counts. */
export const raidRoll = (rule, [a, b]) => (rule.roll === "sum" ? a + b === 7 : a === b);

/** Points: depots, towns, seals, charters, two for joining two ports, two for each award held. */
export function pointsOf(p, s) {
  let n = p.seals[s] + 2 * p.charted[s] + (p.road === s ? 2 : 0) + (p.warden === s ? 2 : 0);
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
/** The most routes a seat has in one joined network of its routes and depots: what the Great Road counts. */
export function roadOf(p, s) {
  const { near } = boardOf(p), mine = (i) => p.route[i].includes(s) || p.depot[i] === s, seen = new Set();
  let most = 0;
  for (let i = 0; i < p.land.length; i++) {
    if (seen.has(i) || !p.route[i].includes(s)) continue;
    const g = joined(near, i, mine);
    for (const c of g) seen.add(c);
    most = Math.max(most, g.filter((c) => p.route[c].includes(s)).length);
  }
  return most;
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
/** Rivals the toll gate can take from at a hex: a depot on it or beside it, and a good in hand. */
export function victims(p, s, at) {
  const { near } = boardOf(p), out = new Set();
  for (const c of [at, ...near[at]]) { const o = p.depot[c]; if (o !== NONE && o !== s && total(p.hands[o]) > 0) out.add(o); }
  return [...out].sort((a, b) => a - b);
}
/** How many of a good a seat gives at the market for one of any other. */
export function rateOf(p, s, good) {
  let r = p.rule.market === "fixed" ? (p.event === "fair trade" ? 3 : 4) : 99;
  p.depot.forEach((o, i) => { if (o === s && p.port[i] !== NONE) r = Math.min(r, p.port[i] === good ? 2 : 3); if (o === s && p.harbour[i]) r = Math.min(r, 2); });
  return r;
}
/** What one good sells for at a falling market, in coin. */
export const priceOf = (p, good) => Math.max(1, 3 - p.sold[good]);
/** What a seat gets for selling one good: the market price, one more at a port or harbour it holds (two at a port for
 * that good), and one more in a season of fair trade. */
export function sellPrice(p, s, good) {
  let extra = 0;
  p.depot.forEach((o, i) => { if (o === s && p.port[i] !== NONE) extra = Math.max(extra, p.port[i] === good ? 2 : 1); if (o === s && p.harbour[i]) extra = Math.max(extra, 1); });
  return priceOf(p, good) + extra + (p.event === "fair trade" ? 1 : 0);
}

const copy = (p) => ({ ...p, hands: p.hands.map((h) => [...h]), coin: [...p.coin], route: p.route.map((r) => [...r]), depot: [...p.depot], town: [...p.town], harbour: [...p.harbour], deck: [...p.deck], held: p.held.map((h) => [...h]), seals: [...p.seals], charted: [...p.charted], sold: [...p.sold], charter: p.charter.map((c) => [...c]), offers: p.offers, roll: p.roll && [...p.roll], ask: p.ask ? { ...p.ask } : null, deals: p.deals.map((d) => ({ ...d })), spoil: [...p.spoil], back: p.back ? { ...p.back } : null, tolls: [...p.tolls], lit: [...p.lit] });

/** The harvest. Every hex with the number gives one good to each depot on it or beside it, two to a town. */
function harvest(p, n, double, events) {
  const { near } = boardOf(p), got = p.hands.map(() => [0, 0, 0, 0]), hexes = [];
  p.land.forEach((l, i) => {
    if (!l || p.num[i] !== n || p.gate === i || p.good[i] === WASTE) return;
    hexes.push(i);
    for (const c of [i, ...near[i]]) if (p.depot[c] !== NONE) got[p.depot[c]][p.good[i]] += (p.town[c] ? 2 : 1) * (double ? 2 : 1);
  });
  got.forEach((g, s) => { p.hands[s] = add(p.hands[s], g); });
  p.lit = hexes;
  events.push({ kind: "harvest", n, got, hexes, gate: p.gate !== NONE && p.num[p.gate] === n ? p.gate : NONE });
}
/** The first seat, from `from` on in turn order, that still has goods to lose to spoilage; or NONE. */
function spoiler(p, from) {
  for (let k = 0; k < p.seats; k++) { const s = (from + k) % p.seats; if (p.spoil[s] > 0) return s; }
  return NONE;
}
/** The start of a seat's turn: the roll, the harvest, and on a raid roll spoilage and the toll gate. Changes p. */
function begin(p, dice, events) {
  p.left = p.rule.actions;
  p.offers = p.rule.offers;
  p.played = 0;
  p.free = 0;
  p.sold = p.sold.map((v) => Math.max(0, v - 1));
  const a = dice.die(), b = dice.die(), n = p.rule.roll === "sum" ? a + b : Math.max(a, b), raid = raidRoll(p.rule, [a, b]);
  p.roll = [a, b];
  events.push({ kind: "roll", seat: p.seat, dice: [a, b], n, raid });
  harvest(p, n, p.rule.roll === "high" && a === b, events);
  p.phase = "main";
  if (p.event !== undefined) season(p, dice, events);
  if (!raid) return;
  const next = p.rule.gate ? "toll" : "main";
  p.spoil = p.hands.map((h) => (p.rule.hand && total(h) > p.rule.hand ? Math.floor(total(h) / 2) : 0));
  if (p.spoil.some((v) => v > 0)) {
    events.push({ kind: "spoils", lose: [...p.spoil] });
    p.back = { seat: p.seat, phase: next };
    p.phase = "spoil";
    p.seat = spoiler(p, p.seat);
  } else p.phase = next;
}
function season(p, dice, events) {
  if (p.step !== 0) return;
  p.event = dice.pick(["fair", "fair", "fair", "plenty", "drought", "fair trade"]);
  if (p.event === "plenty") p.hands = p.hands.map((h) => h.map((v, k) => v + (k === p.round % 4 ? 1 : 0)));
  if (p.event === "drought") p.hands = p.hands.map((h) => h.map((v, k) => (k === p.round % 4 ? Math.max(0, v - 1) : v)));
  if (p.event !== "fair") events.push({ kind: "season", what: p.event, good: p.round % 4 });
}
/** The awards go to the seat whose turn it is when it reaches the least or beats the holder. Only its count can have grown. */
function awards(p, events) {
  if (!p.rule.awards) return;
  for (const [key, count] of [["road", (s) => roadOf(p, s)], ["warden", (s) => p.tolls[s]]]) {
    const s = p.seat, was = p[key];
    if (was !== s && count(s) > (was === NONE ? AWARD[key] - 1 : count(was))) {
      p[key] = s;
      events.push({ kind: "award", what: key, seat: s, from: was, n: count(s) });
    }
  }
}
function finish(p, winners, why, events) {
  p.over = { winners, why };
  p.phase = "over";
  events.push({ kind: "end", winners, why });
}
function settle(p, events) {
  if (pointsOf(p, p.seat) >= goalOf(p)) finish(p, [p.seat], "reached the points", events);
}
/** Pass the turn. Offers still standing lapse when the round ends. Changes p. */
function pass(p, dice, events) {
  if (++p.step === p.seats) {
    p.step = 0;
    p.round++;
    if (p.deals.length) { events.push({ kind: "lapse", n: p.deals.length }); p.deals = []; }
    if (p.round > p.rounds) {
      const pts = Array.from({ length: p.seats }, (_, s) => pointsOf(p, s)), most = Math.max(...pts);
      return finish(p, pts.flatMap((v, s) => (v === most ? [s] : [])), "had the most points at the end", events);
    }
  }
  p.seat = (p.first + p.step + (p.rule.order === "rotate" ? p.round - 1 : 0)) % p.seats;
  return begin(p, dice, events);
}

/** The island: land grown from the middle, goods and numbers spread so that no two of the busiest numbers touch. */
/** Land grows with the number of players, so that everyone has room. */
export const landFor = (size, seats) => (size === "small" ? 20 + 8 * seats : 24 + 12 * seats + SIZES[size].land);
function island(rule, dice, seats) {
  const radius = radiusOf(rule.size, seats), land = landFor(rule.size, seats), b = hexBoard(radius), far = ([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
  const dry = new Set([b.cells.findIndex((c) => far(c) === 0)]);
  while (dry.size < land) {
    const edge = [...new Set([...dry].flatMap((i) => b.near[i]))].filter((i) => !dry.has(i) && far(b.cells[i]) < radius);
    const v = (i) => b.near[i].filter((m) => dry.has(m)).length * 3 - far(b.cells[i]) + dice.below(6);
    dry.add(edge.map((i) => [v(i), i]).reduce((x, y) => (y[0] > x[0] ? y : x))[1]);
  }
  const cells = dice.shuffle([...dry]), wastes = Math.max(1, Math.round(land / 24)), good = b.cells.map(() => WASTE), num = b.cells.map(() => 0);
  cells.slice(wastes).forEach((c, k) => { good[c] = k % 4; });
  // numbers: how often each comes up, spread over the producing hexes, the busiest kept apart. Two dice added never put
  // a 7 on the island: a 7 is the raid roll.
  const faces = rule.roll === "sum" ? [2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12] : [1, 2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6];
  const busy = BUSY[rule.roll];
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
  id: "glass", version: "3",
  options: {
    style: { values: ["classic", "ours", "custom"], normal: "classic" }, seats: { values: [2, 3, 4, 5, 6], normal: 3 },
    ...SWITCHES, ...Object.fromEntries(EXPANSIONS.map((x) => [x, off])),
  },
  setup(o, dice) {
    const rule = SETS[o.style] ? SETS[o.style](o) : Object.fromEntries(Object.keys(SWITCHES).map((k) => [k, o[k]]));
    const isle = island(rule, dice, o.seats), first = dice.below(o.seats), n = isle.land.length, zero = () => Array(n).fill(0);
    const p = { style: o.style, classic: o.style !== "ours", rule, seats: o.seats, ...isle, gate: rule.gate ? isle.gate : NONE, ships: o.ships, harbours: o.harbours,
      hands: Array.from({ length: o.seats }, () => [0, 0, 0, 0]), coin: Array(o.seats).fill(rule.market === "falling" ? 2 : 0), route: Array.from({ length: n }, () => []), depot: Array(n).fill(NONE), town: zero(), harbour: zero(),
      deck: rule.plans ? dice.shuffle([...Array(6).fill("harvest"), ...Array(5).fill("works"), ...(rule.gate ? Array(5).fill("toll") : []), ...Array(5).fill("seal")]) : [], held: Array.from({ length: o.seats }, () => []), seals: Array(o.seats).fill(0), charted: Array(o.seats).fill(0),
      sold: [0, 0, 0, 0], charter: rule.charters ? [0, 1, 2].map(() => dice.shuffle([0, 0, 1, 1, 2, 2, 3, 3]).slice(0, 6)) : [], first, seat: first, step: 0, round: 1, rounds: rule.limit, phase: "open", opened: 0, left: 0, offers: 0, played: 0, free: 0, roll: null, ask: null, over: null,
      deals: [], spoil: Array(o.seats).fill(0), back: null, tolls: Array(o.seats).fill(0), road: NONE, warden: NONE, lit: [] };
    if (o.seasons) p.event = "fair";
    return p;
  },
  turn: (p) => (p.over ? null : p.seat),

  moves(p) {
    const s = p.seat, h = p.hands[s], out = [];
    if (p.phase === "answer") return [{ do: "accept" }, { do: "refuse" }, { do: "hold" }]; // the asked player answers for themselves
    if (p.phase === "spoil") return [0, 1, 2, 3].flatMap((good) => (h[good] > 0 ? [{ do: "spoil", good }] : []));
    if (p.phase === "open") {
      const spots = p.opened % 2 ? routeSpots(p, s).filter((i) => p.land[i]) : depotSpots(p, s, true), any = p.land.flatMap((l, i) => (l && p.depot[i] === NONE && !p.route[i].includes(s) ? [i] : [])); // a crowded island: anywhere free
      return (spots.length ? spots : any).map((at) => ({ do: p.opened % 2 ? "route" : "depot", at }));
    }
    if (p.phase === "toll") return p.land.flatMap((l, at) => {
      if (!l || at === p.gate || p.good[at] === WASTE) return [];
      const from = victims(p, s, at);
      return from.length ? from.map((f) => ({ do: "toll", at, from: f })) : [{ do: "toll", at }];
    });
    if (p.phase === "works") return routeSpots(p, s).map((at) => ({ do: "route", at, free: true }));
    out.push({ do: "end" });
    for (const d of p.deals) {
      if (d.from === s) out.push({ do: "withdraw", to: d.to, give: d.give, get: d.get });
      else if ((d.to === s || d.to === NONE) && h[d.get] > 0 && p.hands[d.from][d.give] > 0) out.push({ do: "take", from: d.from, to: d.to, give: d.give, get: d.get });
    }
    if (p.left <= 0) return out;
    for (const at of routeSpots(p, s)) if (canPay(h, p.land[at] ? COST.route : COST.ship)) out.push({ do: "route", at });
    if (canPay(h, COST.depot)) for (const at of depotSpots(p, s)) out.push({ do: "depot", at });
    if (canPay(h, COST.town)) p.depot.forEach((o, at) => { if (o === s && !p.town[at]) out.push({ do: "town", at }); });
    if (p.harbours && canPay(h, COST.harbour)) p.depot.forEach((o, at) => { if (o === s && !p.harbour[at] && boardOf(p).near[at].some((m) => !p.land[m]) ) out.push({ do: "harbour", at }); });
    if (p.rule.plans && p.deck.length && canPay(h, COST.plan)) out.push({ do: "plan" });
    if (!p.played) for (const k of new Set(p.held[s])) out.push({ do: "use", plan: k });
    const mine = p.deals.filter((d) => d.from === s), open = p.offers > 0 && mine.length < p.rule.offers;
    for (let g = 0; g < 4; g++) {
      if (p.rule.market === "fixed") { const r = rateOf(p, s, g); if (h[g] >= r) for (let w = 0; w < 4; w++) if (w !== g) out.push({ do: "swap", give: g, get: w }); }
      else {
        if (h[g] > 0) out.push({ do: "sell", good: g });
        if (p.coin[s] >= 4) out.push({ do: "buy", good: g });
      }
      // an offer to one player, who answers now; or to anyone, which stands until taken, withdrawn or the round ends
      if (open && h[g] > 0) for (let o = NONE; o < p.seats; o++) if (o !== s) for (let w = 0; w < 4; w++) if (w !== g && (o === NONE || p.hands[o][w] > 0) && !mine.some((d) => d.to === o && d.give === g && d.get === w)) out.push({ do: "offer", to: o, give: g, get: w });
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
        if (p.opened >= 2 * p.seats) { // the second depot starts you off: one of each good beside it, or one for each hex
          const got = [0, 0, 0, 0];
          for (const c of [m.at, ...boardOf(p).near[m.at]]) if (p.land[c] && p.good[c] !== WASTE) got[p.good[c]]++;
          p.hands[s] = add(p.hands[s], p.rule.opening === "lean" ? got.map((v) => Math.min(1, v)) : got);
        }
      } else { spend(COST.depot); p.left--; }
      events.push({ kind: "depot", seat: s, at: m.at });
    } else if (m.do === "route") {
      p.route[m.at].push(s);
      p.route[m.at].sort((a, b) => a - b);
      if (p.phase === "main") { spend(p.land[m.at] ? COST.route : COST.ship); p.left--; }
      events.push({ kind: "route", seat: s, at: m.at, sea: !p.land[m.at] });
      if (p.phase === "works" && --p.free <= 0) p.phase = "main";
      awards(p, events);
    } else if (m.do === "town") { spend(COST.town); p.town[m.at] = 1; p.left--; events.push({ kind: "town", seat: s, at: m.at }); }
    else if (m.do === "harbour") { spend(COST.harbour); p.harbour[m.at] = 1; p.left--; events.push({ kind: "harbour", seat: s, at: m.at }); }
    else if (m.do === "toll") { // the gate moves, and takes one good, drawn blind, from a rival beside it
      p.gate = m.at; p.phase = "main";
      let good = NONE;
      if (m.from !== undefined) {
        let r = dice.below(total(p.hands[m.from]));
        good = p.hands[m.from].findIndex((v) => (r -= v) < 0);
        p.hands[m.from][good]--; p.hands[s][good]++;
      }
      events.push({ kind: "toll", seat: s, at: m.at, from: m.from ?? NONE, good });
    } else if (m.do === "spoil") {
      p.hands[s][m.good]--; p.spoil[s]--;
      events.push({ kind: "spoil", seat: s, good: m.good, left: p.spoil[s] });
      const next = spoiler(p, s);
      if (next === NONE) { p.seat = p.back.seat; p.phase = p.back.phase; p.back = null; } else p.seat = next;
      return { position: p, events };
    } else if (m.do === "plan") { spend(COST.plan); const k = p.deck.pop(); if (k === "seal") p.seals[s]++; else p.held[s].push(k); p.left--; events.push({ kind: "plan", seat: s, seal: k === "seal" }); }
    else if (m.do === "use") {
      p.held[s].splice(p.held[s].indexOf(m.plan), 1);
      p.played = 1;
      if (m.plan === "harvest") { const need = [0, 1, 2, 3].sort((a, b) => p.hands[s][a] - p.hands[s][b] || a - b).slice(0, 2); for (const g of need) p.hands[s][g]++; }
      if (m.plan === "works") { p.free = 2; if (routeSpots(p, s).length) p.phase = "works"; }
      if (m.plan === "toll" && p.gate !== NONE) { p.phase = "toll"; p.tolls[s]++; }
      events.push({ kind: "use", seat: s, plan: m.plan });
      if (m.plan === "toll") awards(p, events);
    } else if (m.do === "swap") { p.hands[s][m.give] -= rateOf(p, s, m.give); p.hands[s][m.get]++; events.push({ kind: "swap", seat: s, give: m.give, get: m.get, n: rateOf(before, s, m.give) }); }
    else if (m.do === "sell") { p.coin[s] += sellPrice(p, s, m.good); p.hands[s][m.good]--; p.sold[m.good]++; events.push({ kind: "sell", seat: s, good: m.good }); }
    else if (m.do === "buy") { p.coin[s] -= 4; p.hands[s][m.good]++; events.push({ kind: "buy", seat: s, good: m.good }); }
    else if (m.do === "offer") {
      p.offers--;
      if (m.to === NONE) { p.deals.push({ from: s, to: NONE, give: m.give, get: m.get }); events.push({ kind: "post", seat: s, to: NONE, give: m.give, get: m.get }); }
      else {
        // an offer to one player is a question: the turn goes to them, they take it, turn it down or leave it open, and it comes back
        p.ask = { from: s, to: m.to, give: m.give, get: m.get, phase: p.phase };
        p.phase = "answer"; p.seat = m.to;
        events.push({ kind: "ask", seat: s, to: m.to, give: m.give, get: m.get });
        return { position: p, events };
      }
    } else if (m.do === "accept" || m.do === "refuse" || m.do === "hold") {
      const a = p.ask, yes = m.do === "accept" && p.hands[a.from][a.give] > 0 && p.hands[a.to][a.get] > 0;
      if (yes) { p.hands[a.from][a.give]--; p.hands[a.from][a.get]++; p.hands[a.to][a.give]++; p.hands[a.to][a.get]--; }
      if (m.do === "hold") { p.deals.push({ from: a.from, to: a.to, give: a.give, get: a.get }); events.push({ kind: "post", seat: a.from, to: a.to, give: a.give, get: a.get }); }
      else events.push({ kind: "offer", seat: a.from, to: a.to, give: a.give, get: a.get, yes });
      p.seat = a.from; p.phase = a.phase; p.ask = null;
      return { position: p, events };
    } else if (m.do === "take" || m.do === "withdraw") {
      const k = p.deals.findIndex((d) => d.from === (m.do === "take" ? m.from : s) && d.to === m.to && d.give === m.give && d.get === m.get), d = p.deals[k];
      p.deals.splice(k, 1);
      if (m.do === "take") { p.hands[d.from][d.give]--; p.hands[d.from][d.get]++; p.hands[s][d.give]++; p.hands[s][d.get]--; }
      events.push({ kind: m.do, seat: s, from: d.from, to: d.to, give: d.give, get: d.get });
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
