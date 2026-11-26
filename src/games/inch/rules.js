// SPDX-License-Identifier: AGPL-3.0-or-later
// An Inch of Ink (working name). Each seat has one pool of strength. On your turn land cut off from
// your home falls, your pool grows, and you pour part of it over a border, or wait.
// Classic is the genre as it is remembered: a wider map, no cut-off rule, no homes to storm, and play until one holds most of it.
import { hexBoard, joined } from "../hex.js";
import { canon, chance, seedState } from "../../core/index.js";
import { LIVE_MAPS, liveAllows, liveApply, liveBoardOf, liveMoves, liveSetup } from "./live.js";

const roller = (text) => chance(seedState(text));
export const liveBoardFor = (p) => liveBoardOf(p, roller);

export const NONE = -1;
const START = 6, WALL = 1, HOME_WALL = 3, SURROUND = 4, LONG = 40;
const SHARES = { quarter: (p) => Math.floor(p / 4), third: (p) => Math.floor(p / 3), half: (p) => Math.floor(p / 2), most: (p) => Math.floor((p * 3) / 4), all: (p) => p };
/** What the rule sets set. Custom takes each of these as it is given. */
export const SWITCHES = {
  size: { values: [4, 5], normal: 5 }, cut: { values: [false, true], normal: false }, walls: { values: [false, true], normal: false },
  shares: { values: ["four", "three"], normal: "four" }, growth: { values: ["rising", "saving"], normal: "rising" }, goal: { values: [45, 55, 60, 70], normal: 60 },
  drawn: { values: [false, true], normal: true }, limit: { values: [10, 16, 20, 40], normal: 40 }, live: { values: [false, true], normal: false },
};
const SETS = {
  classic: (o) => ({ size: 5, cut: false, walls: false, shares: "four", growth: "rising", goal: CLASSIC_PERCENT[o.seats], drawn: o.seats > 2, limit: LONG }),
  ours: (o) => ({ size: 4, cut: true, walls: true, shares: "three", growth: "saving", goal: WIN_PERCENT[o.seats], drawn: false, limit: o.rounds }),
};
export const sharesOf = (p) => (p.rule.shares === "four" ? ["quarter", "half", "most", "all"] : ["third", "half", "all"]);
const WIN_PERCENT = { 2: 55, 3: 45 }, CLASSIC_PERCENT = { 2: 60, 3: 55 };

export const boardOf = (p) => hexBoard(p.rule.size);
export const cellsOf = (p, seat) => p.owner.reduce((n, o) => n + (o === seat ? 1 : 0), 0);
export const goalOf = (p) => Math.ceil((p.owner.length * p.rule.goal) / 100);

function root(n) { // whole-number square root
  let r = 0;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

/** How much a seat's pool grows on its turn. */
export function growth(p, seat, cells = cellsOf(p, seat)) {
  // Classic: land counts in full, and every round brings more to everyone, so a long game cannot stand still.
  if (p.rule.growth === "rising") return 3 + Math.floor(cells / 3) + Math.floor(p.round / 2);
  // A flat base, then land (1.5 times its square root), then a little for saving. The base keeps a seat that is behind in the game.
  return 3 + Math.floor(root(9 * cells) / 2) + Math.floor(p.pool[seat] / 8);
}
export const poolLimit = (cells) => 3 * cells + 6;
/** How hard a rival's land is to take: their strength spread over their cells. */
export const density = (p, seat) => Math.ceil(p.pool[seat] / Math.max(1, cellsOf(p, seat)));

const copy = (p) => ({ ...p, owner: [...p.owner], pool: [...p.pool], turns: [...p.turns], home: [...p.home] });

/** The next cell a pour would take from `to`, and its price, or null. */
function cheapest(p, seat, to, dense) {
  const { near } = boardOf(p);
  let best = null;
  for (let i = 0; i < p.owner.length; i++) {
    if (p.owner[i] !== to) continue;
    const mine = near[i].reduce((n, m) => n + (p.owner[m] === seat ? 1 : 0), 0);
    if (!mine) continue;
    let price = p.cost[i] + dense + (to !== NONE ? WALL : 0) + (to !== NONE && p.rule.walls && p.home[to] === i ? HOME_WALL : 0);
    if (mine >= SURROUND && p.rule.walls) price = Math.ceil(price / 2);
    if (!best || price < best.price || (price === best.price && p.order[i] < p.order[best.cell])) best = { cell: i, price };
  }
  return best;
}

/** Pour `amount` from a seat at `to`. Changes p. Returns the cells taken and what happened to homes. */
function pour(p, seat, to, amount, events) {
  const dense = to === NONE ? 0 : density(p, to), taken = [];
  let left = amount;
  p.pool[seat] -= amount;
  for (;;) {
    const c = cheapest(p, seat, to, dense);
    if (!c || c.price > left) break;
    left -= c.price;
    p.owner[c.cell] = seat;
    taken.push(c.cell);
    if (to === NONE) continue;
    p.pool[to] = Math.max(0, p.pool[to] - dense);
    if (c.cell !== p.home[to]) continue;
    p.home[to] = newHome(p, to);
    if (p.rule.walls || p.rule.cut || p.home[to] === NONE) events.push({ kind: "home", seat: to, by: seat, to: p.home[to] });
    if (p.home[to] === NONE) { p.pool[to] = 0; break; }
  }
  p.pool[seat] += left;
  return { taken, spent: amount - left };
}

/** The first cell of a seat's largest joined group, or NONE when it has no land. */
function newHome(p, seat) {
  const { near } = boardOf(p), seen = new Set();
  let best = [];
  for (let i = 0; i < p.owner.length; i++) {
    if (p.owner[i] !== seat || seen.has(i)) continue;
    const group = joined(near, i, (m) => p.owner[m] === seat);
    for (const m of group) seen.add(m);
    if (group.length > best.length) best = group;
  }
  return best.length ? Math.min(...best) : NONE;
}

/** The start of a seat's turn: cut-off land falls, then the pool grows. Changes p. */
function begin(p, events) {
  const s = p.seat, keep = new Set(joined(boardOf(p).near, p.home[s], (m) => p.owner[m] === s)), lost = [];
  if (p.rule.cut) for (let i = 0; i < p.owner.length; i++) if (p.owner[i] === s && !keep.has(i)) { p.owner[i] = NONE; lost.push(i); }
  if (lost.length) events.push({ kind: "cut", seat: s, cells: lost });
  const cells = p.rule.cut ? keep.size : cellsOf(p, s), before = p.pool[s];
  p.pool[s] = Math.max(before, Math.min(poolLimit(cells), before + growth(p, s, cells)));
  events.push({ kind: "grow", seat: s, by: p.pool[s] - before });
}

function finish(p, seats, why, events) {
  p.over = { winners: seats, why };
  events.push({ kind: "end", winners: seats, why });
}

/** Move on to the next seat that still has land. The first seat of a round rotates; in a Classic game of three the order is drawn. Changes p. */
function advance(p, events, dice) {
  const n = p.pool.length, live = p.home.flatMap((h, s) => (h === NONE ? [] : [s]));
  if (live.length === 1) return finish(p, live, "the only one left", events);
  if (cellsOf(p, p.seat) >= goalOf(p)) return finish(p, [p.seat], "held enough of the land", events);
  do {
    if (++p.step === n) {
      p.step = 0;
      p.round++;
      if (n > 2 && p.rule.drawn && dice) { p.turns = dice.shuffle(p.turns); events.push({ kind: "order", turns: p.turns.filter((s) => p.home[s] !== NONE), round: p.round }); }
      if (p.round > p.rounds) {
        const most = Math.max(...live.map((s) => cellsOf(p, s)));
        return finish(p, live.filter((s) => cellsOf(p, s) === most), "held the most land at the end", events);
      }
    }
    p.seat = n > 2 && p.rule.drawn ? p.turns[p.step] : (p.step + p.round - 1) % n;
  } while (p.home[p.seat] === NONE);
  begin(p, events);
}

export const inch = {
  id: "inch", version: "6",
  options: { style: { values: ["classic", "ours", "custom"], normal: "classic" }, seats: { values: [2, 3], normal: 2 }, rounds: { values: [10, 16, 20], normal: 16 }, map: { values: LIVE_MAPS, normal: "world" }, nations: { values: [8, 12, 20, 30, 50], normal: 20 }, cities: { values: [false, true], normal: false }, boats: { values: [false, true], normal: false }, rivals: { values: ["gentle", "even", "hard"], normal: "gentle" }, time: { values: [600, 800, 1800, 0], normal: 800 }, ...SWITCHES },

  setup(o, dice) {
    if (o.style === "classic" || (o.style === "custom" && o.live)) return liveSetup(o, dice, roller);
    const classic = o.style !== "ours", rule = SETS[o.style] ? SETS[o.style](o) : Object.fromEntries(Object.keys(SWITCHES).map((k) => [k, o[k]])), b = hexBoard(rule.size), homes = dice.shuffle(o.seats === 2 ? [b.corners[0], b.corners[3]] : [b.corners[0], b.corners[2], b.corners[4]]);
    const cost = b.cells.map(() => (dice.below(4) === 0 ? 2 : 1)), owner = Array(b.size).fill(NONE);
    homes.forEach((h, s) => { cost[h] = 1; owner[h] = s; });
    const p = { classic, style: o.style, rule, owner, cost, order: dice.shuffle(b.cells.map((_, i) => i)), pool: Array(o.seats).fill(START), home: homes, turns: Array.from({ length: o.seats }, (_, s) => s), seat: 0, step: 0, round: 1, rounds: rule.limit, over: null };
    begin(p, []);
    return p;
  },
  turn: (p) => (p.over ? null : p.live ? p.human : p.seat),
  allows: (p, m) => { if (p.live) return liveAllows(p, liveBoardFor(p), m); const want = canon(m); return inch.moves(p).some((x) => canon(x) === want); }, // the order of keys does not matter

  /** Wait, or pour a share at neutral land or at one rival. Only pours that take something are offered. */
  moves(p) {
    if (p.live) return liveMoves(p, liveBoardFor(p));
    const s = p.seat, { near } = boardOf(p), targets = new Set(), out = [{ do: "wait" }];
    p.owner.forEach((o, i) => { if (o === s) for (const m of near[i]) if (p.owner[m] !== s) targets.add(p.owner[m]); });
    for (const to of [...targets].sort((a, b) => a - b)) {
      const first = cheapest(p, s, to, to === NONE ? 0 : density(p, to)), seen = new Set();
      for (const share of [...sharesOf(p)].reverse()) {
        const amount = SHARES[share](p.pool[s]);
        if (amount >= first.price && !seen.has(amount)) { seen.add(amount); out.push({ do: "pour", to, share }); }
      }
    }
    return out;
  },

  apply(before, m, dice) {
    if (before.live) return liveApply(before, liveBoardFor(before), m, dice);
    const p = copy(before), events = [];
    if (m.do === "pour") {
      const r = pour(p, p.seat, m.to, SHARES[m.share](p.pool[p.seat]), events);
      events.unshift({ kind: "pour", seat: p.seat, to: m.to, spent: r.spent, taken: r.taken });
    } else events.push({ kind: "wait", seat: p.seat });
    advance(p, events, dice);
    return { position: p, events };
  },
  result: (p) => p.over,
};
