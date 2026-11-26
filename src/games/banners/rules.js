// SPDX-License-Identifier: AGPL-3.0-or-later
// Brass and Banners (working name). Place strength, attack with dice as often as you like, move once.
// Three sets of rules: Traditional is the genre as it is remembered, Capo is our own quicker game, Coda is every switch by hand.
// Expansions are added to any of them.
import { MAPS, areaBoard, bonusOf, bordersOf } from "../areas.js";
// what a land pays is kept with the board maker, which reads the same rule to keep lands even
export { bonusOf, bordersOf } from "../areas.js";
import { DICE, odds as chanceOf, meet, toll as tollOf } from "./dice.js";

export const NONE = -1, HAND = 5, FORT = 4;
const BASE = 3, PER = 3, WILD = 3;
/** What the rule sets set. Coda takes each of these as it is given. */
export const SWITCHES = {
  start: { values: ["dealt", "claimed", "far"], normal: "dealt" },
  dice: { values: Object.keys(DICE), normal: "standard" },
  muster: { values: ["floor", "plus"], normal: "floor" }, // floor: 1 for every three provinces, at least 3; plus: 3 more on top of that
  cards: { values: ["rising", "flat", "none"], normal: "rising" },
  goal: { values: [65, 80, 100], normal: 80 },
  rounds: { values: [10, 12, 20, 40, 0], normal: 40 }, // 0: no limit, play until one side wins (a safety stop at SAFETY rounds)
  order: { values: ["fixed", "rotate"], normal: "fixed" }, // rotate: the first seat moves on each round
  opening: { values: ["open", "lean", "grade", "truce"], normal: "open" }, // lean: at two seats the first seat musters a third on its first turn; grade: in round 1 each seat musters its share by its place in the order (1 of n parts, 2 of n, up to all); truce: nobody attacks in the first round
  neutral: { values: [1, 2, 3], normal: 2 },
  spoils: { values: ["trade", "wait"], normal: "trade" }, // trade: put a player out, take their cards, and hand in at once while you hold five or more
  score: { values: ["land", "rounds"], normal: "land" }, // rounds: from round 2 each seat scores what it holds at the start of its turn, and once more at the end; the most points wins when the rounds run out
  luck: { values: ["fair", "bag"], normal: "fair" }, // bag: every die is drawn from an open bag of throws (see BAG), so each face comes up as often as the others
};
/** The bag of throws: six of each face. A die is drawn from what is left; when fewer than LOW are left, a fresh set goes in. */
export const BAG = { each: 6, low: 12 };
const SETS = {
  classic: { start: "dealt", dice: "standard", muster: "floor", cards: "rising", goal: 100, rounds: 0, neutral: 2, order: "fixed", opening: "lean", spoils: "trade", score: "land", luck: "fair" },
  ours: { start: "far", dice: "even", muster: "plus", cards: "flat", goal: 65, rounds: 10, neutral: 3, order: "fixed", opening: "grade", spoils: "wait", score: "rounds", luck: "fair" },
};
export const EXPANSIONS = ["forts", "leaders", "capitals", "secrets", "events"];
const off = { values: [false, true], normal: false };

export const boardOf = (p) => areaBoard(p.key, p.map);
export const cellsOf = (p, seat) => p.owner.reduce((n, o) => n + (o === seat ? 1 : 0), 0);
export const landOf = (p) => p.owner.length;
export const goalOf = (p) => Math.ceil((p.owner.length * p.rule.goal) / 100);
export const nameOf = (p, i) => boardOf(p).names[i];
export const suitOf = (p, card) => (card >= p.owner.length ? WILD : card % 3);
const mineOf = (p, s) => p.owner.flatMap((o, i) => (o === s ? [i] : []));
const living = (p) => Array.from({ length: p.seats }, (_, s) => s).filter((s) => p.owner.includes(s));

/** Places that can be reached from a place now. In a storm nobody crosses water. */
export function nearOf(p, i) {
  const b = boardOf(p);
  return p.event === "storm" ? b.dry[i] : b.near[i];
}
/** The lands a seat holds whole. */
export function wholeOf(p, seat) {
  const b = boardOf(p);
  return b.sizes.map((_, k) => k).filter((k) => p.owner.every((o, i) => b.region[i] !== k || o === seat));
}
/** What a seat will be given to place at its turn, and why. Cards come on top. */
export function muster(p, seat) {
  const b = boardOf(p), plus = p.rule.muster === "plus", base = plus ? BASE : 0, land = plus ? Math.floor(cellsOf(p, seat) / PER) : Math.max(BASE, Math.floor(cellsOf(p, seat) / PER));
  const lands = wholeOf(p, seat).reduce((n, k) => n + bonusOf(b, k), 0), event = p.event === "harvest" ? 2 : 0;
  return { base, land, lands, event, all: base + land + lands + event };
}
/** What a seat scores for what it holds now, under scored rounds: 1 for every three provinces, each whole land's bonus, 2 for each capital. */
export function gain(p, seat) {
  const b = boardOf(p);
  return Math.floor(cellsOf(p, seat) / PER) + wholeOf(p, seat).reduce((n, k) => n + bonusOf(b, k), 0) + (p.caps ? 2 * capsHeld(p, seat) : 0);
}
/** How a fight stands: the dice rule with leaders and forts counted in. */
export function terms(p, from, to) {
  const d = DICE[p.rule.dice], o = p.owner[to];
  return { a: d.a, d: d.d + (p.forts?.[to] ? 1 : 0), tie: d.tie, up: p.leaders && p.leaders[p.seat] === from ? 1 : 0, down: (p.leaders && o !== NONE && p.leaders[o] === to ? 1 : 0) + (p.caps && o !== NONE && p.caps[o] === to ? 1 : 0) };
}
/** The chance, in millionths, of taking a place by rolling until it is settled. `att` is the strength able to attack. */
export const odds = (p, from, to, att = p.str[from] - 1) => chanceOf(att, p.str[to], terms(p, from, to));
/** What rolling it out is likely to cost the attacker, in thousandths of one strength. */
export const toll = (p, from, to, att = p.str[from] - 1) => tollOf(att, p.str[to], terms(p, from, to));

// ---- cards ----
/** Sets a seat can hand in: three of a kind, or one of each. A wild card stands for any. One offer for each shape. */
export function setsOf(p, seat) {
  const hand = p.hands[seat], by = [0, 1, 2, WILD].map((k) => hand.filter((c) => suitOf(p, c) === k).sort((a, b) => (p.owner[b] === seat ? 1 : 0) - (p.owner[a] === seat ? 1 : 0) || a - b)), out = [];
  for (let k = 0; k < 3; k++) for (let w = 0; w <= 2; w++) if (by[k].length >= 3 - w && by[WILD].length >= w) out.push([...by[k].slice(0, 3 - w), ...by[WILD].slice(0, w)]);
  for (let w = 0; w <= 2; w++) {
    if (by[WILD].length < w) continue;
    const have = [0, 1, 2].filter((k) => by[k].length);
    if (have.length < 3 - w) continue;
    out.push([...have.slice(0, 3 - w).map((k) => by[k][0]), ...by[WILD].slice(0, w)]);
  }
  const seen = new Set();
  return out.map((s) => s.sort((a, b) => a - b)).filter((s) => { const k = s.join(); if (seen.has(k)) return false; seen.add(k); return true; });
}
/** What a set is worth: more each time anyone hands one in, or always the same. One more for each card of a place you hold. */
export function setWorth(p, seat, cards) {
  const kinds = new Set(cards.map((c) => suitOf(p, c)).filter((k) => k !== WILD)).size;
  const base = p.rule.cards === "rising" ? (p.traded < 6 ? [5, 7, 9, 12, 15, 18][p.traded] : 18 + 3 * (p.traded - 5)) : kinds > 1 ? 8 : 5;
  return base + cards.filter((c) => p.owner[c] === seat).length;
}
function draw(p, dice) {
  if (!p.deck.length) { p.deck = dice.shuffle(p.spent); p.spent = []; }
  return p.deck.length ? p.deck.pop() : null;
}

// ---- turns ----
const copy = (p) => ({ ...p, owner: [...p.owner], str: [...p.str], hands: p.hands.map((h) => [...h]), deck: [...p.deck], spent: [...p.spent], reserve: [...p.reserve], outBy: [...p.outBy], back: [...p.back], points: p.points && [...p.points], forts: p.forts && [...p.forts], leaders: p.leaders && [...p.leaders], caps: p.caps && [...p.caps], goals: p.goals && p.goals.map((g) => ({ ...g })), pend: p.pend ? { ...p.pend } : null, bag: p.bag && [...p.bag] });

/** The start of a seat's turn. Changes p. */
function begin(p, events) {
  // who moves first moves with less: lean, at two seats, gives the first seat a third of its fresh armies on its first turn;
  // grade gives each seat in round 1 its place in the order in parts of the whole, so the last to move has all of it
  const s = p.seat, m = muster(p, s), first = p.round === 1, how = p.rule.opening;
  p.left = first && how === "lean" && p.seats === 2 && p.step === 0 ? Math.floor(m.all / 3) : first && how === "grade" ? Math.floor((m.all * (p.seats + p.step)) / (2 * p.seats - 1)) : m.all;
  p.took = 0;
  p.phase = p.left ? "place" : "attack";
  if (p.leaders && p.leaders[s] === NONE && p.round >= p.back[s]) { // a lost leader comes back where the seat is strongest
    const mine = mineOf(p, s);
    p.leaders[s] = mine.reduce((a, b) => (p.str[b] > p.str[a] ? b : a));
    events.push({ kind: "leader", seat: s, at: p.leaders[s] });
  }
  events.push({ kind: "muster", seat: s, ...m });
  // scored rounds: what you still hold when your turn comes round again counts, so every seat is scored after the others have answered
  if (p.points && !first) { const n = gain(p, s); p.points[s] += n; events.push({ kind: "score", seat: s, n, all: p.points[s] }); }
  // what you hold at the start of your own turn counts, so the others have had a round to answer
  if (p.round > 2 && p.caps && p.owner[p.caps[s]] === s && capsHeld(p, s) >= capsToWin(p)) finish(p, [s], "held the capitals", events);
  else if (p.round > 2 && reached(p, s)) finish(p, [s], "reached a secret goal", events);
}
function finish(p, winners, why, events) {
  p.over = { winners, why };
  p.phase = "over";
  events.push({ kind: "end", winners, why });
}

/** Has a seat reached its secret goal? */
export function reached(p, seat) {
  const g = p.goals?.[seat];
  if (!g) return false;
  if (g.kind === "lands") { const w = wholeOf(p, seat); return g.lands.every((k) => w.includes(k)); }
  if (g.kind === "strong") return p.owner.filter((o, i) => o === seat && p.str[i] >= 3).length >= g.many;
  if (g.kind === "rival" && g.seat !== seat && p.outBy[g.seat] === seat) return true;
  const share = g.kind === "share" ? g.many : Math.ceil((p.owner.length * 45) / 100);
  return (g.kind === "share" || p.outBy[g.seat] !== NONE) && cellsOf(p, seat) >= share;
}
/** How many capitals win: more than half, your own among them. */
export const capsToWin = (p) => Math.floor(p.seats / 2) + 1;
export const capsHeld = (p, seat) => p.caps.filter((c) => p.owner[c] === seat).length;

/** Won already? Changes p. */
function settle(p, events) {
  const s = p.seat, live = living(p);
  if (live.length === 1) finish(p, live, "the only one left", events);
  else if (cellsOf(p, s) >= goalOf(p)) finish(p, [s], "held enough of the land", events);
}

/** A new round: the weather, if it is being played with. Changes p. */
function weather(p, dice, events) {
  if (p.event === undefined) return;
  p.event = dice.pick(["calm", "calm", "calm", "harvest", "storm", "unrest"]);
  if (p.event === "unrest") {
    const live = living(p), most = live.reduce((a, b) => (cellsOf(p, b) > cellsOf(p, a) ? b : a)), mine = mineOf(p, most);
    if (mine.length > 3) {
      const low = Math.min(...mine.map((i) => p.str[i])), at = dice.pick(mine.filter((i) => p.str[i] === low));
      p.owner[at] = NONE;
      if (p.leaders && p.leaders[most] === at) { p.leaders[most] = NONE; p.back[most] = p.round + 2; }
      events.push({ kind: "event", what: "unrest", at, seat: most });
      return;
    }
    p.event = "calm";
  }
  if (p.event !== "calm") events.push({ kind: "event", what: p.event });
}

/** The end of scored rounds: everyone left scores once more, and the most points wins; level on points, the most land. Changes p. */
function tally(p, live, events) {
  for (const s of live) { const n = gain(p, s); p.points[s] += n; events.push({ kind: "score", seat: s, n, all: p.points[s], last: true }); }
  const top = Math.max(...live.map((s) => p.points[s])), level = live.filter((s) => p.points[s] === top), most = Math.max(...level.map((s) => cellsOf(p, s)));
  return finish(p, level.filter((s) => cellsOf(p, s) === most), "scored the most over the rounds", events);
}
/** A game with no round limit still ends after this many rounds, on the most land, for players who will never break a stalemate. */
export const SAFETY = 100;
/** Pass the turn: seats in a fixed order, or with the first seat moving on each round when the rules say so. Changes p. */
function pass(p, dice, events) {
  const live = living(p);
  if (p.took && p.rule.cards !== "none") {
    const c = draw(p, dice);
    if (c !== null) { p.hands[p.seat].push(c); events.push({ kind: "card", seat: p.seat, card: c }); }
  }
  do {
    if (++p.step === p.seats) {
      p.step = 0;
      p.round++;
      if (p.round > (p.rounds || SAFETY)) {
        if (p.points) return tally(p, live, events);
        const most = Math.max(...live.map((s) => cellsOf(p, s)));
        return finish(p, live.filter((s) => cellsOf(p, s) === most), p.rounds ? "held the most land at the end" : "held the most land when the long war was called off", events);
      }
      weather(p, dice, events);
    }
    p.seat = (p.step + (p.rule.order === "rotate" ? p.round - 1 : 0)) % p.seats;
  } while (!p.owner.includes(p.seat));
  begin(p, events);
  return undefined;
}

// ---- the start ----
/** Who claims, or places at the start, next. Changes p. */
function opening(p, dice, events) {
  if (p.phase === "claim") {
    if (p.owner.includes(NONE)) { // back and forth, so that nobody always has the last word
      const c = p.owner.filter((o) => o !== NONE).length, k = c % p.seats;
      p.seat = Math.floor(c / p.seats) % 2 ? p.seats - 1 - k : k;
      return;
    }
    p.phase = "setup";
    p.seat = p.seats - 1;
  }
  if (p.reserve.some((r) => r > 0)) {
    do p.seat = (p.seat + 1) % p.seats; while (!p.reserve[p.seat]);
    p.left = Math.min(5, p.reserve[p.seat]);
    return;
  }
  p.seat = 0;
  if (p.caps) p.caps = p.caps.map((c, s) => { const mine = mineOf(p, s); return mine.reduce((a, b) => (p.str[b] > p.str[a] ? b : a)); });
  if (p.leaders) p.leaders = p.leaders.map((_, s) => { const mine = mineOf(p, s); return mine.reduce((a, b) => (p.str[b] > p.str[a] ? b : a)); });
  events.push({ kind: "ready" });
  begin(p, events);
}

// ---- fights ----
/** Seat `was` has no land left. Changes p. */
function out(p, was, by, events) {
  p.outBy[was] = by;
  p.hands[by].push(...p.hands[was]);
  p.hands[was] = [];
  events.push({ kind: "out", seat: was, by });
}
/** After a knockout, under the trade rule: holding five cards or more with a set to hand in, hand in now and place it before attacking on. Changes p. */
function spoils(p, events) {
  if (p.over || p.rule.spoils !== "trade" || p.hands[p.seat].length < HAND || !setsOf(p, p.seat).length) return;
  p.phase = "place";
  events.push({ kind: "spoils", seat: p.seat, n: p.hands[p.seat].length });
}
/** One die: thrown fair, or drawn from the open bag of throws, which is topped up with a fresh set when it runs low. Changes p. */
function throwOne(p, dice) {
  if (!p.bag) return dice.die();
  if (p.bag.reduce((n, c) => n + c, 0) < BAG.low) p.bag = p.bag.map((c) => c + BAG.each);
  let r = dice.below(p.bag.reduce((n, c) => n + c, 0)), face = 0;
  while (r >= p.bag[face]) r -= p.bag[face++];
  p.bag[face]--;
  return face + 1;
}
/** One volley, or volleys until it is settled. Changes p. */
function fight(p, m, dice, events) {
  const s = p.seat, was = p.owner[m.to], rolls = [], had = p.str[m.from], how = terms(p, m.from, m.to);
  let held = p.str[m.to];
  do {
    const A = Array.from({ length: Math.min(how.a, p.str[m.from] - 1) }, () => throwOne(p, dice)).sort((x, y) => y - x);
    const D = Array.from({ length: Math.min(how.d, held) }, () => throwOne(p, dice)).sort((x, y) => y - x);
    const [a, d] = meet(A, D, how);
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
  if (p.leaders && was !== NONE && p.leaders[was] === m.to) { p.leaders[was] = NONE; p.back[was] = p.round + 2; events.push({ kind: "leaderlost", seat: was, by: s }); }
  const knocked = was !== NONE && !p.owner.includes(was);
  if (knocked) out(p, was, s, events);
  settle(p, events);
  if (p.over) return;
  if (p.str[m.from] > 1) { p.phase = "occupy"; p.pend = { from: m.from, to: m.to, ...(knocked ? { out: was } : {}) }; return; }
  if (p.leaders?.[s] === m.from) p.leaders[s] = m.to;
  if (knocked) spoils(p, events);
}

/** Every amount from one to `n`: a stack can be split exactly. */
export const amounts = (n) => Array.from({ length: Math.max(0, n) }, (_, i) => i + 1);

export const banners = {
  id: "banners", version: "7",
  options: {
    style: { values: ["classic", "ours", "custom"], normal: "classic" }, seats: { values: [2, 3, 4, 5, 6], normal: 4 }, map: { values: MAPS, normal: "world" },
    ...SWITCHES, ...Object.fromEntries(EXPANSIONS.map((x) => [x, off])),
  },

  setup(o, dice) {
    const key = dice.below(0x40000000), b = areaBoard(key, o.map), all = b.near.map((_, i) => i);
    const rule = SETS[o.style] ? { ...SETS[o.style] } : Object.fromEntries(Object.keys(SWITCHES).map((k) => [k, o[k]])), each = Math.floor(b.n / o.seats);
    const p = { classic: true, style: o.style, rule, key, map: o.map, seats: o.seats, owner: Array(b.n).fill(NONE), str: Array(b.n).fill(rule.neutral), hands: Array.from({ length: o.seats }, () => []), deck: [], spent: [], traded: 0, reserve: Array(o.seats).fill(0), outBy: Array(o.seats).fill(NONE), seat: 0, step: 0, round: 1, rounds: rule.rounds, phase: "place", left: 0, took: 0, pend: null, over: null, forts: null, leaders: null, back: Array(o.seats).fill(0), caps: null, goals: null, points: rule.score === "rounds" && rule.rounds ? Array(o.seats).fill(0) : null, bag: rule.luck === "bag" ? Array(6).fill(BAG.each) : null };
    if (rule.cards !== "none") p.deck = dice.shuffle([...all, b.n, b.n + 1]);
    if (o.forts) p.forts = all.map(() => 0);
    if (o.leaders) p.leaders = Array(o.seats).fill(NONE);
    if (o.capitals) p.caps = Array(o.seats).fill(0);
    if (o.events) p.event = "calm";
    if (o.secrets) {
      const lands = b.lands.map((_, k) => k), pairs = lands.flatMap((x) => lands.filter((y) => y > x && b.sizes[x] + b.sizes[y] >= b.n / 6 && b.sizes[x] + b.sizes[y] <= b.n / 3.4).map((y) => [x, y]));
      const all = dice.shuffle([...dice.shuffle(pairs).slice(0, 5).map((x) => ({ kind: "lands", lands: x })), { kind: "share", many: Math.ceil((b.n * 45) / 100) }, { kind: "strong", many: Math.ceil((b.n * 30) / 100) }, ...Array.from({ length: o.seats > 2 ? o.seats : 0 }, (_, s) => ({ kind: "rival", seat: s }))]);
      p.goals = Array.from({ length: o.seats }, (_, s) => { const k = all.findIndex((g) => g.kind !== "rival" || g.seat !== s); return all.splice(k, 1)[0]; });
    }
    if (rule.start === "far") {
      const at = dice.shuffle(b.starts[o.seats]);
      at.forEach((a, s) => { p.owner[a] = s; p.str[a] = 4; });
      if (p.caps) p.caps = [...at];
      if (p.leaders) p.leaders = [...at];
      begin(p, []);
      return p;
    }
    p.reserve = Array(o.seats).fill(Math.max(6, each));
    if (rule.start === "claimed") { p.phase = "claim"; p.str = p.str.map(() => 0); return p; }
    dice.shuffle(all).slice(0, each * o.seats).forEach((i, k) => { p.owner[i] = k % o.seats; p.str[i] = 1; });
    p.phase = "setup";
    p.seat = o.seats - 1;
    opening(p, dice, []);
    return p;
  },
  turn: (p) => (p.over ? null : p.seat),

  moves(p) {
    const s = p.seat, out = [], mine = mineOf(p, s);
    if (p.phase === "claim") return p.owner.flatMap((o, at) => (o === NONE ? [{ do: "claim", at }] : []));
    if (p.phase === "occupy") return [0, ...amounts(p.str[p.pend.from] - 1)].map((n) => ({ do: "occupy", n }));
    const place = () => mine.flatMap((at) => amounts(p.left).map((n) => ({ do: "place", at, n })));
    if (p.phase === "setup") return place();
    if (p.phase === "place") {
      const sets = setsOf(p, s).map((cards) => ({ do: "trade", cards }));
      if (p.hands[s].length >= HAND && sets.length) return sets;
      return [...place(), ...sets, ...(p.forts && p.left >= FORT ? mine.filter((at) => !p.forts[at]).map((at) => ({ do: "fort", at })) : [])];
    }
    const truce = p.rule.opening === "truce" && p.round === 1; // the first round is for placing, not striking
    if (!truce) for (const from of mine) if (p.str[from] > 1) for (const to of nearOf(p, from)) if (p.owner[to] !== s) out.push({ do: "attack", from, to, roll: "once" }, { do: "attack", from, to, roll: "all" });
    for (const from of mine) {
      if (p.str[from] < 2) continue;
      const seen = new Set([from]), list = [from];
      for (let i = 0; i < list.length; i++) for (const m of nearOf(p, list[i])) if (!seen.has(m) && p.owner[m] === s) { seen.add(m); list.push(m); }
      for (const to of list.slice(1).sort((a, b) => a - b)) for (const n of amounts(p.str[from] - 1)) out.push({ do: "move", from, to, n });
    }
    return [{ do: "end" }, ...out];
  },

  apply(before, m, dice) {
    const p = copy(before), events = [], s = p.seat;
    if (m.do === "claim") {
      p.owner[m.at] = s;
      p.str[m.at] = 1;
      events.push({ kind: "claim", seat: s, at: m.at });
      opening(p, dice, events);
    } else if (m.do === "place") {
      p.str[m.at] += m.n;
      p.left -= m.n;
      events.push({ kind: "place", seat: s, at: m.at, n: m.n });
      if (p.phase === "setup") { p.reserve[s] -= m.n; if (!p.left) opening(p, dice, events); } else if (!p.left) { p.phase = "attack"; settle(p, events); }
    } else if (m.do === "trade") {
      const n = setWorth(p, s, m.cards);
      p.hands[s] = p.hands[s].filter((c) => !m.cards.includes(c));
      p.spent.push(...m.cards);
      p.traded++;
      p.left += n;
      events.push({ kind: "trade", seat: s, n, cards: m.cards });
    } else if (m.do === "fort") {
      p.forts[m.at] = 1;
      p.left -= FORT;
      events.push({ kind: "fort", seat: s, at: m.at });
      if (!p.left) p.phase = "attack";
    } else if (m.do === "attack") fight(p, m, dice, events);
    else if (m.do === "occupy") {
      const { from, to } = p.pend;
      p.str[from] -= m.n;
      p.str[to] += m.n;
      if (p.leaders?.[s] === from && p.str[to] >= p.str[from]) p.leaders[s] = to; // a leader goes with the larger part
      events.push({ kind: "occupy", seat: s, to, n: m.n + 1 });
      const knocked = p.pend.out !== undefined;
      p.pend = null;
      p.phase = "attack";
      settle(p, events);
      if (knocked) spoils(p, events);
    } else {
      if (m.do === "move") {
        p.str[m.from] -= m.n;
        p.str[m.to] += m.n;
        if (p.leaders?.[s] === m.from && m.n >= p.str[m.from]) p.leaders[s] = m.to;
        events.push({ kind: "move", seat: s, from: m.from, to: m.to, n: m.n });
      } else events.push({ kind: "done", seat: s });
      settle(p, events);
      if (!p.over) pass(p, dice, events);
    }
    return { position: p, events };
  },
  result: (p) => p.over,
};
