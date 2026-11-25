// SPDX-License-Identifier: AGPL-3.0-or-later
// Brass and Banners (working name). Place strength, attack with dice as often as you like, move once.
// Classic is the genre as it is remembered, on our own land and with our own numbers: no supply, no scoring, no capitals.
// Land starts neutral. Hold enough of it, or be the last one left.
import { areaBoard } from "../areas.js";

export const NONE = -1, ATTACK_DICE = 4, DEFEND_DICE = 3, SET = 3, SET_GAIN = 3;
const START = 4, NEUTRAL = 3, BASE = 3, PER = 3, LONG = 40, PERCENT = { 2: 65, 3: 65, 4: 65 };

export const boardOf = (p) => areaBoard(p.key);
export const cellsOf = (p, seat) => p.owner.reduce((n, o) => n + (o === seat ? 1 : 0), 0);
export const landOf = (p) => p.owner.length;
export const goalOf = (p) => Math.ceil((p.owner.length * PERCENT[p.seats]) / 100);
export const nameOf = (p, i) => boardOf(p).names[i];
export const bonusOf = (b, land) => Math.max(1, Math.floor(b.sizes[land] / 3));

/** The lands a seat holds whole. */
export function wholeOf(p, seat) {
  const b = boardOf(p);
  return b.sizes.map((_, k) => k).filter((k) => p.owner.every((o, i) => b.region[i] !== k || o === seat));
}
/** What a seat will be given to place at its turn, and why. */
export function muster(p, seat) {
  const b = boardOf(p), land = Math.floor(cellsOf(p, seat) / PER), lands = wholeOf(p, seat).reduce((n, k) => n + bonusOf(b, k), 0), set = p.banners[seat] >= SET ? SET_GAIN : 0;
  return { base: BASE, land, lands, set, all: BASE + land + lands + set };
}

// ---- dice ----
const tables = new Map();
/** How often each result comes up when a dice meet d dice: [attacker loses, defender loses, ways], of 6 to the power a + d. */
function results(a, d) {
  const k = a * 10 + d;
  if (tables.has(k)) return tables.get(k);
  const dice = a + d, ways = new Map(), roll = Array(dice).fill(1);
  for (;;) {
    const [x, y] = compare(roll.slice(0, a), roll.slice(a));
    ways.set(x * 10 + y, (ways.get(x * 10 + y) || 0) + 1);
    let i = 0;
    while (i < dice && roll[i] === 6) roll[i++] = 1;
    if (i === dice) break;
    roll[i]++;
  }
  const out = [...ways].map(([v, n]) => [Math.floor(v / 10), v % 10, n]);
  tables.set(k, out);
  return out;
}
/** Highest against highest. The lower die loses one; when they tie, both lose one. Returns [attacker loses, defender loses]. */
export function compare(A, D) {
  const x = [...A].sort((m, n) => n - m), y = [...D].sort((m, n) => n - m);
  let a = 0, d = 0;
  for (let i = 0; i < Math.min(x.length, y.length); i++) { if (x[i] >= y[i]) d++; if (x[i] <= y[i]) a++; }
  return [a, d];
}
const chances = new Map(), MILLION = 1000000;
/** The chance, in millionths, that `att` strength able to attack takes a place held by `def`, rolling until it is settled. */
export function odds(att, def) {
  if (att <= 0) return 0;
  if (def <= 0) return MILLION;
  const a = Math.min(att, 60), d = Math.min(def, 60), k = a * 100 + d;
  if (chances.has(k)) return chances.get(k);
  const m = Math.min(a, ATTACK_DICE), n = Math.min(d, DEFEND_DICE);
  let sum = 0, all = 0;
  for (const [x, y, w] of results(m, n)) { sum += w * odds(a - x, d - y); all += w; }
  const v = Math.floor(sum / all);
  chances.set(k, v);
  return v;
}

// ---- moves ----
const copy = (p) => ({ ...p, owner: [...p.owner], str: [...p.str], banners: [...p.banners], pend: p.pend ? { ...p.pend } : null });

/** The start of a seat's turn. Changes p. */
function begin(p, events) {
  const s = p.seat, m = muster(p, s);
  if (m.set) p.banners[s] -= SET;
  p.left = m.all;
  p.took = 0;
  p.phase = "place";
  events.push({ kind: "muster", seat: s, ...m });
}
function finish(p, winners, why, events) {
  p.over = { winners, why };
  p.phase = "over";
  events.push({ kind: "end", winners, why });
}
const living = (p) => Array.from({ length: p.seats }, (_, s) => s).filter((s) => p.owner.includes(s));

/** Won already? Changes p. */
function settle(p, events) {
  const live = living(p);
  if (live.length === 1) finish(p, live, "the only one left", events);
  else if (cellsOf(p, p.seat) >= goalOf(p)) finish(p, [p.seat], "held enough of the land", events);
}
/** Pass the turn. The first seat of a round rotates. Changes p. */
function pass(p, events) {
  const live = living(p);
  if (p.took) p.banners[p.seat]++;
  if (p.took) events.push({ kind: "banner", seat: p.seat, now: p.banners[p.seat] });
  do {
    if (++p.step === p.seats) {
      p.step = 0;
      p.round++;
      if (p.round > p.rounds) {
        const most = Math.max(...live.map((s) => cellsOf(p, s)));
        finish(p, live.filter((s) => cellsOf(p, s) === most), "held the most land at the end", events);
        return;
      }
    }
    p.seat = (p.step + p.round - 1) % p.seats;
  } while (!live.includes(p.seat));
  begin(p, events);
}

/** One volley, or volleys until it is settled. Changes p. */
function fight(p, m, dice, events) {
  const s = p.seat, was = p.owner[m.to], rolls = [], had = p.str[m.from];
  let held = p.str[m.to];
  do {
    const A = Array.from({ length: Math.min(ATTACK_DICE, p.str[m.from] - 1) }, () => dice.die()).sort((x, y) => y - x);
    const D = Array.from({ length: Math.min(DEFEND_DICE, held) }, () => dice.die()).sort((x, y) => y - x);
    const [a, d] = compare(A, D);
    p.str[m.from] -= a;
    held = Math.max(0, held - d);
    rolls.push([A, D]);
  } while (m.roll === "all" && held > 0 && p.str[m.from] > 1);
  if (held === 0 && p.str[m.from] < 2) held = 1; // nobody is left to walk in, so one defender holds on
  const won = held === 0, lost = { attacker: had - p.str[m.from], defender: p.str[m.to] - held };
  p.str[m.to] = held;
  events.push({ kind: "fight", seat: s, from: m.from, to: m.to, was, rolls, won, lost });
  if (!won) return;
  p.owner[m.to] = s;
  p.took++;
  p.str[m.to] = 1;
  p.str[m.from] -= 1;
  events.push({ kind: "take", seat: s, at: m.to, was });
  if (was !== NONE && !p.owner.includes(was)) { events.push({ kind: "out", seat: was, by: s }); p.banners[s] += p.banners[was]; p.banners[was] = 0; }
  settle(p, events);
  if (!p.over && p.str[m.from] > 1) { p.phase = "occupy"; p.pend = { from: m.from, to: m.to }; }
}

/** The different amounts worth offering between one and `n`: every amount when there are few. */
export function amounts(n) {
  if (n <= 12) return Array.from({ length: n }, (_, i) => i + 1);
  return [...new Set([1, 2, 3, 4, 5, Math.floor(n / 4), Math.floor(n / 2), Math.floor((n * 3) / 4), n - 1, n])].sort((a, b) => a - b);
}

export const banners = {
  id: "banners", version: "1",
  options: { style: { values: ["classic"], normal: "classic" }, seats: { values: [2, 3, 4], normal: 3 } },

  setup(o, dice) {
    const key = dice.below(0x40000000), b = areaBoard(key), at = dice.shuffle(b.starts[o.seats]);
    const p = { classic: true, key, seats: o.seats, owner: Array(b.n).fill(NONE), str: Array(b.n).fill(NEUTRAL), banners: Array(o.seats).fill(0), seat: 0, step: 0, round: 1, rounds: LONG, phase: "place", left: 0, took: 0, pend: null, over: null };
    at.forEach((a, s) => { p.owner[a] = s; p.str[a] = START; });
    begin(p, []);
    return p;
  },
  turn: (p) => (p.over ? null : p.seat),

  moves(p) {
    const { near } = boardOf(p), s = p.seat, out = [], mine = p.owner.flatMap((o, i) => (o === s ? [i] : []));
    if (p.phase === "place") return mine.flatMap((at) => amounts(p.left).map((n) => ({ do: "place", at, n })));
    if (p.phase === "occupy") return [0, ...amounts(p.str[p.pend.from] - 1)].map((n) => ({ do: "occupy", n }));
    for (const from of mine) if (p.str[from] > 1) for (const to of near[from]) if (p.owner[to] !== s) out.push({ do: "attack", from, to, roll: "once" }, { do: "attack", from, to, roll: "all" });
    for (const from of mine) {
      if (p.str[from] < 2) continue;
      const seen = new Set([from]), list = [from];
      for (let i = 0; i < list.length; i++) for (const m of near[list[i]]) if (!seen.has(m) && p.owner[m] === s) { seen.add(m); list.push(m); }
      for (const to of list.slice(1).sort((a, b) => a - b)) for (const n of amounts(p.str[from] - 1)) out.push({ do: "move", from, to, n });
    }
    return [{ do: "end" }, ...out];
  },

  apply(before, m, dice) {
    const p = copy(before), events = [], s = p.seat;
    if (m.do === "place") {
      p.str[m.at] += m.n;
      p.left -= m.n;
      events.push({ kind: "place", seat: s, at: m.at, n: m.n });
      if (!p.left) p.phase = "attack";
    } else if (m.do === "attack") fight(p, m, dice, events);
    else if (m.do === "occupy") {
      p.str[p.pend.from] -= m.n;
      p.str[p.pend.to] += m.n;
      events.push({ kind: "occupy", seat: s, to: p.pend.to, n: m.n + 1 });
      p.pend = null;
      p.phase = "attack";
    } else {
      if (m.do === "move") { p.str[m.from] -= m.n; p.str[m.to] += m.n; events.push({ kind: "move", seat: s, from: m.from, to: m.to, n: m.n }); } else events.push({ kind: "done", seat: s });
      pass(p, events);
    }
    return { position: p, events };
  },
  result: (p) => p.over,
};
