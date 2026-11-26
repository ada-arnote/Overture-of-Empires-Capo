// SPDX-License-Identifier: AGPL-3.0-or-later
// The Island Fable (working name). Joined land is a territory with one hall and its own purse. Units cost
// upkeep, guard their neighbours and take land. Cut a territory in two and the part without money starves.
// Traditional is the genre as it is remembered: a dealt island, woods that spread, forts, and as many actions as you like.
// Capo is our own small, quick game. Coda is every switch by hand. Expansions are added to any of them.
import { ISLES, SIZES, island, seaRoads } from "./islands.js";
import { hexBoard, joined } from "../hex.js";

export const NONE = -1, WOOD = 1, CAIRN = 2, FORT_GUARD = 2, FARM_PAYS = 3;
const PURSE = 6, MANY = 99, ROADS = 3;
const WAGES = { mild: [0, 1, 3, 6, 10], fair: [0, 2, 5, 11, 22], harsh: [0, 2, 6, 15, 34] };
/** What the rule sets set. Coda takes each of these as it is given. */
export const SWITCHES = {
  isle: { values: ISLES, normal: "round" }, size: { values: Object.keys(SIZES), normal: "medium" },
  start: { values: ["dealt", "homes"], normal: "dealt" }, actions: { values: [3, 6, MANY], normal: MANY }, ranks: { values: [3, 4], normal: 4 },
  price: { values: [5, 8, 10], normal: 8 }, wages: { values: Object.keys(WAGES), normal: "fair" }, woods: { values: ["none", "slow", "fast"], normal: "slow" },
  fort: { values: [0, 12, 18], normal: 12 }, goal: { values: [60, 75, 90, 100], normal: 75 }, limit: { values: [15, 30, 50], normal: 50 },
  order: { values: ["rotate", "fixed"], normal: "rotate" }, // rotate: the first seat moves on each round (measured fairer here, with the truce)
  opening: { values: ["truce", "open"], normal: "truce" }, // truce: nobody takes land from a rival in the first round
};
const normal = (over) => ({ ...Object.fromEntries(Object.entries(SWITCHES).map(([k, v]) => [k, v.normal])), ...over });
const SETS = {
  classic: (o) => normal({ isle: o.isle, size: o.size }),
  ours: (o) => ({ isle: "small", size: "tiny", start: "homes", actions: 3, ranks: 3, price: 5, wages: "mild", woods: "none", fort: 0, goal: { 2: 60, 3: 45 }[o.seats] || 45, limit: o.rounds, order: "rotate", opening: "truce" }),
};
export const EXPANSIONS = ["farms", "boats", "gales"];
const off = { values: [false, true], normal: false };

const radius = (p) => SIZES[p.rule.size].radius;
export const boardOf = (p) => hexBoard(radius(p));
export const cellsOf = (p, seat) => p.owner.reduce((n, o) => n + (o === seat ? 1 : 0), 0);
export const landOf = (p) => p.water.reduce((n, w) => n + (w ? 0 : 1), 0);
/** Traditional asks less of each player the more there are. */
export const goalOf = (p) => Math.ceil((landOf(p) * (p.style === "classic" ? { 2: 75, 3: 60, 4: 50, 5: 45, 6: 40 }[p.seats] : p.rule.goal)) / 100);
export const nameOf = (p, i) => { const [q, r] = boardOf(p).cells[i], R = radius(p); return String.fromCharCode(65 + r + R) + (q + R + 1 + Math.min(0, r)); };
export const raiseOf = (p) => p.rule.price;
export const upkeepOf = (p, rank) => WAGES[p.rule.wages][rank];
export const topOf = (p) => p.rule.ranks;
export const farmPrice = (p, cells) => 10 + 3 * cells.reduce((n, c) => n + p.farm[c], 0);

/** A seat's joined groups of land, each a list of cells. */
export function groupsOf(p, seat) {
  const { near } = boardOf(p), seen = new Set(), out = [];
  for (let i = 0; i < p.owner.length; i++) {
    if (p.owner[i] !== seat || seen.has(i)) continue;
    const g = joined(near, i, (m) => p.owner[m] === seat);
    for (const m of g) seen.add(m);
    out.push(g);
  }
  return out;
}
/** A seat's territories: groups of two or more, with their money. A hex with a wood on it earns nothing. */
export function territories(p, seat) {
  return groupsOf(p, seat).filter((g) => g.length > 1).map((cells) => {
    const hall = cells.find((c) => p.hall[c]), upkeep = cells.reduce((n, c) => n + upkeepOf(p, p.unit[c]), 0), income = cells.reduce((n, c) => n + (p.tree[c] ? 0 : 1) + (p.farm[c] ? FARM_PAYS : 0), 0);
    return { cells, hall, purse: p.purse[hall], income, upkeep, net: income - upkeep };
  });
}
/** How well a cell is guarded: the best unit or fort on it or beside it, or 1 for a hall. */
export function defence(p, c) {
  const o = p.owner[c];
  if (o === NONE) return 0;
  const on = (x) => Math.max(p.unit[x], p.hall[x], p.fort[x] ? FORT_GUARD : 0);
  let d = on(c);
  for (const m of boardOf(p).near[c]) if (p.owner[m] === o) d = Math.max(d, on(m));
  return d;
}
/** Can a unit of this rank take a place guarded like this? The highest rank takes anything. */
export const beats = (p, rank, guard) => rank > guard || rank === topOf(p) && rank === 4;

const copy = (p) => ({ ...p, owner: [...p.owner], unit: [...p.unit], moved: [...p.moved], hall: [...p.hall], purse: [...p.purse], tree: [...p.tree], fort: [...p.fort], farm: [...p.farm], landed: [...p.landed] });
const bare = (p, c) => { p.unit[c] = 0; p.moved[c] = 0; p.tree[c] = 0; p.fort[c] = 0; p.farm[c] = 0; p.landed[c] = 0; };

/** Give every territory of a seat exactly one hall. Changes p. A new hall goes on an empty hex if there is one;
 * if every hex holds something, the weakest unit makes room, and the log says so. */
function settle(p, seat, events = []) {
  if (seat === NONE) return;
  for (const g of groupsOf(p, seat)) {
    const halls = g.filter((c) => p.hall[c]);
    if (g.length === 1) { p.hall[g[0]] = 0; p.purse[g[0]] = 0; continue; }
    if (!halls.length) {
      const free = g.filter((c) => !p.unit[c] && !p.fort[c] && !p.farm[c]), open = free.filter((c) => !p.tree[c]), from = open.length ? open : free.length ? free : g;
      const loss = (c) => (from === g ? (p.unit[c] || 9) * 4 + p.fort[c] * 2 + p.farm[c] : 0), best = from.reduce((a, b) => (loss(b) < loss(a) || (loss(b) === loss(a) && p.order[b] < p.order[a]) ? b : a));
      if (from === g) events.push({ kind: "room", seat, at: best, rank: p.unit[best], fort: p.fort[best], farm: p.farm[best] });
      bare(p, best);
      p.hall[best] = 1;
      p.purse[best] = 0;
    } else if (halls.length > 1) {
      const keep = halls.reduce((a, b) => (p.purse[b] > p.purse[a] ? b : a)), sum = halls.reduce((n, h) => n + p.purse[h], 0);
      for (const h of halls) { p.hall[h] = 0; p.purse[h] = 0; }
      p.hall[keep] = 1;
      p.purse[keep] = sum;
    }
  }
}

/** How much of a taken hall's money the taker gets. All of it is lost: winning half tipped the two-seat game past its line. */
export const plunder = () => 0;

/** Put a unit on a cell of another owner. Changes p. */
function take(p, seat, c, rank, events) {
  const was = p.owner[c], before = was === NONE ? 0 : groupsOf(p, was).length, pot = p.hall[c] ? p.purse[c] : 0, farm = p.farm[c];
  p.owner[c] = seat;
  bare(p, c);
  p.unit[c] = rank;
  p.moved[c] = 1;
  p.farm[c] = farm; // fields are worth having
  p.hall[c] = 0;
  p.purse[c] = 0;
  const later = [];
  settle(p, seat, later);
  settle(p, was, later);
  const won = plunder(pot), mine = won ? territories(p, seat).find((t) => t.cells.includes(c)) : null;
  if (mine) p.purse[mine.hall] += won;
  events.push({ kind: "take", seat, at: c, was, rank, lost: pot - (mine ? won : 0), won: mine ? won : 0 });
  if (was !== NONE && groupsOf(p, was).length > before) events.push({ kind: "split", seat: was });
  events.push(...later);
}

/** One action, without passing the turn. Returns the new position and what happened. */
export function act(before, m) {
  const p = copy(before), events = [], s = p.seat;
  p.left -= 1;
  if (m.do === "fort") {
    p.purse[m.hall] -= p.rule.fort;
    p.fort[m.to] = 1;
    events.push({ kind: "fort", seat: s, at: m.to });
  } else if (m.do === "farm") {
    p.purse[m.hall] -= farmPrice(p, joined(boardOf(p).near, m.hall, (c) => p.owner[c] === s));
    p.farm[m.to] = 1;
    events.push({ kind: "farm", seat: s, at: m.to });
  } else if (m.do === "raise") {
    p.purse[m.hall] -= raiseOf(p);
    if (p.owner[m.to] !== s) take(p, s, m.to, 1, events);
    else if (p.unit[m.to]) { p.unit[m.to] += 1; events.push({ kind: "merge", seat: s, at: m.to, rank: p.unit[m.to], raised: true }); }
    else { p.unit[m.to] = 1; p.moved[m.to] = p.tree[m.to] ? 1 : 0; events.push({ kind: p.tree[m.to] ? "clear" : "raise", seat: s, at: m.to }); p.tree[m.to] = 0; }
  } else {
    const rank = p.unit[m.from];
    p.unit[m.from] = 0;
    p.moved[m.from] = 0;
    p.landed[m.from] = 0;
    if (p.owner[m.to] !== s) take(p, s, m.to, rank, events);
    else if (p.unit[m.to]) { p.unit[m.to] += rank; p.moved[m.to] = 1; events.push({ kind: "merge", seat: s, at: m.to, rank: p.unit[m.to] }); }
    else { p.unit[m.to] = rank; p.moved[m.to] = 1; events.push({ kind: p.tree[m.to] ? "clear" : "move", seat: s, from: m.from, at: m.to, to: m.to }); p.tree[m.to] = 0; }
    if (m.sea) { p.landed[m.to] = 1; settle(p, s, events); } // fed once, at the next turn of its seat
  }
  return { position: p, events };
}

/** The start of a seat's turn: units rest, territories earn and pay. Changes p. */
function begin(p, events) {
  const s = p.seat;
  p.left = p.rule.actions;
  for (let i = 0; i < p.owner.length; i++) if (p.owner[i] === s) p.moved[i] = 0;
  const alone = groupsOf(p, s).filter((g) => g.length === 1 && p.unit[g[0]] && !p.landed[g[0]]).map((g) => g[0]); // a landing party feeds itself once
  for (let i = 0; i < p.owner.length; i++) if (p.owner[i] === s) p.landed[i] = 0;
  for (const c of alone) { p.unit[c] = 0; if (p.rule.woods !== "none") p.tree[c] = CAIRN; }
  if (alone.length) events.push({ kind: "stranded", seat: s, cells: alone });
  for (const t of territories(p, s)) {
    const now = t.purse + t.net;
    p.purse[t.hall] = Math.max(0, now);
    if (now >= 0) continue;
    const lost = t.cells.filter((c) => p.unit[c]);
    for (const c of lost) { p.unit[c] = 0; if (p.rule.woods !== "none") p.tree[c] = CAIRN; }
    events.push({ kind: "starve", seat: s, cells: lost });
  }
}

/** A new round: cairns grow over and woods spread. Changes p. */
function nature(p, dice, events) {
  const { near } = boardOf(p), grown = [];
  if (p.rule.woods !== "none") {
    const slow = p.rule.woods === "slow" ? 2 : 1, wood = p.tree.map((t) => t === WOOD), empty = (i) => !p.water[i] && !p.tree[i] && !p.unit[i] && !p.hall[i] && !p.fort[i] && !p.farm[i];
    p.tree.forEach((t, i) => { if (t === CAIRN) { p.tree[i] = WOOD; grown.push(i); } });
    for (let i = 0; i < p.owner.length; i++) {
      if (!empty(i)) continue;
      const n = near[i].filter((m) => wood[m]).length;
      if (n && dice.below(slow * (n > 1 ? 7 : 26)) === 0) { p.tree[i] = WOOD; grown.push(i); }
    }
  }
  if (p.gale !== undefined) { // a gale keeps boats in and fells some woods
    p.gale = dice.below(4) === 0;
    if (p.gale) { const list = p.tree.flatMap((t, i) => (t === WOOD && dice.below(3) === 0 ? [i] : [])); for (const i of list) p.tree[i] = 0; events.push({ kind: "gale", cells: list }); }
  }
  if (grown.length) events.push({ kind: "woods", cells: grown });
}

function finish(p, winners, why, events) {
  p.over = { winners, why };
  events.push({ kind: "end", winners, why });
}

/** Win at once, or pass the turn when the actions are used or the seat stops. Changes p. */
function after(p, stop, dice, events) {
  const live = Array.from({ length: p.seats }, (_, s) => s).filter((s) => cellsOf(p, s) > 0);
  if (live.length === 1) return finish(p, live, "the only one left", events);
  if (cellsOf(p, p.seat) >= goalOf(p)) return finish(p, [p.seat], "held enough of the island", events);
  if (!stop && p.left > 0) return undefined;
  do {
    if (++p.step === p.seats) {
      p.step = 0;
      p.round++;
      if (p.round > p.rounds) {
        const most = Math.max(...live.map((s) => cellsOf(p, s)));
        return finish(p, live.filter((s) => cellsOf(p, s) === most), "held the most land at the end", events);
      }
      nature(p, dice, events);
    }
    p.seat = (p.step + (p.rule.order === "rotate" ? p.round - 1 : 0)) % p.seats;
  } while (!live.includes(p.seat));
  begin(p, events);
  return undefined;
}

/** Every land hex belongs to someone, the same number each, and every territory starts with a little money. */
function deal(p, b, dice) {
  const land = dice.shuffle(b.cells.map((_, i) => i).filter((i) => !p.water[i])), even = land.length - (land.length % p.seats);
  land.slice(0, even).forEach((c, i) => { p.owner[c] = i % p.seats; });
  for (let s = 0; s < p.seats; s++) {
    settle(p, s);
    for (const t of territories(p, s)) p.purse[t.hall] = Math.min(t.cells.length * 2, 10) + (p.seats === 2 ? 1 * s : 0); // the second of two moves later and starts a little richer
  }
}

export const fable = {
  id: "fable", version: "5",
  options: {
    style: { values: ["classic", "ours", "custom"], normal: "classic" }, seats: { values: [2, 3, 4, 5, 6], normal: 3 }, rounds: { values: [10, 14, 18], normal: 14 },
    ...SWITCHES, ...Object.fromEntries(EXPANSIONS.map((x) => [x, off])),
  },

  setup(o, dice) {
    const rule = SETS[o.style] ? SETS[o.style](o) : Object.fromEntries(Object.keys(SWITCHES).map((k) => [k, o[k]]));
    if (o.seats > 3 && rule.size === "tiny") rule.size = "small";
    const b = hexBoard(SIZES[rule.size].radius), zero = () => b.cells.map(() => 0), made = island(rule.isle, rule.size, o.seats, dice, rule.start === "homes");
    const p = { classic: o.style !== "ours", style: o.style, rule, boats: o.boats, farms: o.farms, seats: o.seats, rounds: rule.limit, water: made.water, order: dice.shuffle(b.cells.map((_, i) => i)), owner: b.cells.map(() => NONE), unit: zero(), moved: zero(), hall: zero(), purse: zero(), tree: zero(), fort: zero(), farm: zero(), landed: zero(), seat: 0, step: 0, round: 1, left: rule.actions, over: null };
    if (o.gales) p.gale = false;
    if (rule.start === "homes") {
      made.homes.forEach((h, s) => {
        p.owner[h] = s;
        p.hall[h] = 1;
        p.purse[h] = PURSE;
        for (const m of b.near[h].filter((x) => !p.water[x]).sort((x, y) => p.order[x] - p.order[y]).slice(0, 2)) p.owner[m] = s;
      });
    } else deal(p, b, dice);
    if (rule.woods !== "none") for (let i = 0; i < b.size; i++) if (!p.water[i] && !p.hall[i] && dice.below(9) === 0) p.tree[i] = WOOD;
    begin(p, []);
    return p;
  },
  turn: (p) => (p.over ? null : p.seat),

  /** Raise a unit, build, move a unit, or end the turn. */
  moves(p) {
    const { near } = boardOf(p), s = p.seat, out = [{ do: "end" }], roads = p.boats && !p.gale ? seaRoads(boardOf(p), p.water, ROADS) : null;
    const guard = new Map(), guarded = (c) => { if (!guard.has(c)) guard.set(c, defence(p, c)); return guard.get(c); };
    for (const t of territories(p, s)) {
      const inside = new Set(t.cells), edge = new Set();
      for (const c of t.cells) for (const m of near[c]) if (!inside.has(m) && !p.water[m] && p.owner[m] !== s) edge.add(m);
      const free = t.cells.filter((c) => !p.hall[c] && !p.fort[c] && !p.farm[c]);
      if (t.purse >= raiseOf(p)) {
        for (const c of edge) if (guarded(c) < 1) out.push({ do: "raise", hall: t.hall, to: c });
        for (const c of free) if (p.unit[c] < topOf(p)) out.push({ do: "raise", hall: t.hall, to: c });
      }
      if (p.rule.fort && t.purse >= p.rule.fort) for (const c of free) if (!p.unit[c] && !p.tree[c]) out.push({ do: "fort", hall: t.hall, to: c });
      if (p.farms && t.purse >= farmPrice(p, t.cells)) for (const c of free) if (!p.unit[c] && !p.tree[c] && near[c].some((m) => inside.has(m) && (p.hall[m] || p.farm[m]))) out.push({ do: "farm", hall: t.hall, to: c });
      for (const from of t.cells) {
        const rank = p.unit[from];
        if (!rank || p.moved[from]) continue;
        for (const c of edge) if (beats(p, rank, guarded(c))) out.push({ do: "move", from, to: c });
        for (const c of free) if (c !== from && (!p.unit[c] || p.unit[c] + rank <= topOf(p))) out.push({ do: "move", from, to: c });
      }
    }
    if (roads) {
      for (let from = 0; from < p.owner.length; from++) {
        const rank = p.unit[from];
        if (p.owner[from] !== s || !rank || p.moved[from]) continue;
        const home = new Set(joined(near, from, (m) => p.owner[m] === s));
        for (const c of roads[from]) {
          if (home.has(c) || (p.owner[c] !== s && [...home].some((h) => near[h].includes(c)))) continue; // reached on foot
          if (p.owner[c] !== s ? beats(p, rank, guarded(c)) : !p.hall[c] && !p.fort[c] && !p.farm[c] && (!p.unit[c] || p.unit[c] + rank <= topOf(p))) out.push({ do: "move", from, to: c, sea: true });
        }
      }
    }
    if (p.boats) { // a landing party on one hex may still step inland
      for (let from = 0; from < p.owner.length; from++) {
        const rank = p.unit[from];
        if (p.owner[from] !== s || !rank || p.moved[from] || near[from].some((m) => p.owner[m] === s)) continue;
        for (const c of near[from]) if (!p.water[c] && p.owner[c] !== s && beats(p, rank, guarded(c))) out.push({ do: "move", from, to: c });
      }
    }
    // the truce of the first round: land may be bought or walked into, but none taken from a rival yet
    if (p.rule.opening === "truce" && p.round === 1) return out.filter((m) => m.do === "end" || p.owner[m.to] === s || p.owner[m.to] === NONE);
    return out;
  },

  apply(before, m, dice) {
    const made = m.do === "end" ? { position: copy(before), events: [{ kind: "done", seat: before.seat }] } : act(before, m);
    after(made.position, m.do === "end", dice, made.events);
    return made;
  },
  result: (p) => p.over,
};
