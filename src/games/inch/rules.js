// SPDX-License-Identifier: AGPL-3.0-or-later
// An Inch of Ink (working name). Each seat has one pool of strength. On your turn land cut off from
// your home falls, your pool grows, and you pour part of it over a border, or wait.
import { hexBoard, joined } from "../hex.js";

export const NONE = -1;
const RADIUS = 4, START = 6, WALL = 1, HOME_WALL = 3, SURROUND = 4;
const SHARES = { third: (p) => Math.floor(p / 3), half: (p) => Math.floor(p / 2), all: (p) => p };
const WIN_PERCENT = { 2: 55, 3: 45 };

export const boardOf = () => hexBoard(RADIUS);
export const cellsOf = (p, seat) => p.owner.reduce((n, o) => n + (o === seat ? 1 : 0), 0);
export const goalOf = (p) => Math.ceil((p.owner.length * WIN_PERCENT[p.pool.length]) / 100);

function root(n) { // whole-number square root
  let r = 0;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

/** How much a seat's pool grows on its turn. */
export function growth(cells, pool) {
  // A flat base, then land (1.5 times its square root), then a little for saving. The base keeps a seat that is behind in the game.
  return 3 + Math.floor(root(9 * cells) / 2) + Math.floor(pool / 8);
}
export const poolLimit = (cells) => 3 * cells + 6;
/** How hard a rival's land is to take: their strength spread over their cells. */
export const density = (p, seat) => Math.ceil(p.pool[seat] / Math.max(1, cellsOf(p, seat)));

const copy = (p) => ({ ...p, owner: [...p.owner], pool: [...p.pool], home: [...p.home] });

/** The next cell a pour would take from `to`, and its price, or null. */
function cheapest(p, seat, to, dense) {
  const { near } = boardOf();
  let best = null;
  for (let i = 0; i < p.owner.length; i++) {
    if (p.owner[i] !== to) continue;
    const mine = near[i].reduce((n, m) => n + (p.owner[m] === seat ? 1 : 0), 0);
    if (!mine) continue;
    let price = p.cost[i] + dense + (to !== NONE ? WALL : 0) + (to !== NONE && p.home[to] === i ? HOME_WALL : 0);
    if (mine >= SURROUND) price = Math.ceil(price / 2);
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
    events.push({ kind: "home", seat: to, by: seat, to: p.home[to] });
    if (p.home[to] === NONE) { p.pool[to] = 0; break; }
  }
  p.pool[seat] += left;
  return { taken, spent: amount - left };
}

/** The first cell of a seat's largest joined group, or NONE when it has no land. */
function newHome(p, seat) {
  const { near } = boardOf(), seen = new Set();
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
  const s = p.seat, keep = new Set(joined(boardOf().near, p.home[s], (m) => p.owner[m] === s)), lost = [];
  for (let i = 0; i < p.owner.length; i++) if (p.owner[i] === s && !keep.has(i)) { p.owner[i] = NONE; lost.push(i); }
  if (lost.length) events.push({ kind: "cut", seat: s, cells: lost });
  const cells = keep.size, before = p.pool[s];
  p.pool[s] = Math.max(before, Math.min(poolLimit(cells), before + growth(cells, before)));
  events.push({ kind: "grow", seat: s, by: p.pool[s] - before });
}

function finish(p, seats, why, events) {
  p.over = { winners: seats, why };
  events.push({ kind: "end", winners: seats, why });
}

/** Move on to the next seat that still has land. The first seat of a round rotates. Changes p. */
function advance(p, events) {
  const n = p.pool.length, live = p.home.flatMap((h, s) => (h === NONE ? [] : [s]));
  if (live.length === 1) return finish(p, live, "the only one left", events);
  if (cellsOf(p, p.seat) >= goalOf(p)) return finish(p, [p.seat], "held enough of the land", events);
  do {
    if (++p.step === n) {
      p.step = 0;
      p.round++;
      if (p.round > p.rounds) {
        const most = Math.max(...live.map((s) => cellsOf(p, s)));
        return finish(p, live.filter((s) => cellsOf(p, s) === most), "held the most land at the end", events);
      }
    }
    p.seat = (p.step + p.round - 1) % n;
  } while (p.home[p.seat] === NONE);
  begin(p, events);
}

export const inch = {
  id: "inch", version: "1",
  options: { seats: { values: [2, 3], normal: 2 }, rounds: { values: [10, 16, 20], normal: 16 } },

  setup(o, dice) {
    const b = boardOf(), homes = dice.shuffle(o.seats === 2 ? [b.corners[0], b.corners[3]] : [b.corners[0], b.corners[2], b.corners[4]]);
    const cost = b.cells.map(() => (dice.below(4) === 0 ? 2 : 1)), owner = Array(b.size).fill(NONE);
    homes.forEach((h, s) => { cost[h] = 1; owner[h] = s; });
    const p = { owner, cost, order: dice.shuffle(b.cells.map((_, i) => i)), pool: Array(o.seats).fill(START), home: homes, seat: 0, step: 0, round: 1, rounds: o.rounds, over: null };
    begin(p, []);
    return p;
  },
  turn: (p) => (p.over ? null : p.seat),

  /** Wait, or pour a share at neutral land or at one rival. Only pours that take something are offered. */
  moves(p) {
    const s = p.seat, { near } = boardOf(), targets = new Set(), out = [{ do: "wait" }];
    p.owner.forEach((o, i) => { if (o === s) for (const m of near[i]) if (p.owner[m] !== s) targets.add(p.owner[m]); });
    for (const to of [...targets].sort((a, b) => a - b)) {
      const first = cheapest(p, s, to, to === NONE ? 0 : density(p, to)), seen = new Set();
      for (const share of ["all", "half", "third"]) {
        const amount = SHARES[share](p.pool[s]);
        if (amount >= first.price && !seen.has(amount)) { seen.add(amount); out.push({ do: "pour", to, share }); }
      }
    }
    return out;
  },

  apply(before, m) {
    const p = copy(before), events = [];
    if (m.do === "pour") {
      const r = pour(p, p.seat, m.to, SHARES[m.share](p.pool[p.seat]), events);
      events.unshift({ kind: "pour", seat: p.seat, to: m.to, spent: r.spent, taken: r.taken });
    } else events.push({ kind: "wait", seat: p.seat });
    advance(p, events);
    return { position: p, events };
  },
  result: (p) => p.over,
};
