// SPDX-License-Identifier: AGPL-3.0-or-later
// The Island Fable (working name). Joined land is a territory with one hall and its own purse. Units cost
// upkeep, guard their neighbours and take land. Cut a territory in two and the part without money starves.
// Classic is the genre as it is remembered: a bigger island dealt out at the start, and as many actions as you like.
import { hexBoard, joined } from "../hex.js";

export const NONE = -1, ACTIONS = 3, TOP = 3;
export const UPKEEP = [0, 1, 3, 6];
const RAISE = 5, CLASSIC_RAISE = 8, WATER = 5, PURSE = 6, WIN_PERCENT = { 2: 60, 3: 45 }, CLASSIC_PERCENT = 70, CLASSIC_WATER = 13, CLASSIC_PURSE = 4, LONG = 40, MANY = 99;

const radius = (p) => (p?.classic ? 4 : 3);
/** What a scout costs. Classic has no limit on actions, so the price does that work. */
export const raiseOf = (p) => (p.classic ? CLASSIC_RAISE : RAISE);
export const boardOf = (p) => hexBoard(radius(p));
export const cellsOf = (p, seat) => p.owner.reduce((n, o) => n + (o === seat ? 1 : 0), 0);
export const landOf = (p) => p.water.reduce((n, w) => n + (w ? 0 : 1), 0);
export const goalOf = (p) => Math.ceil((landOf(p) * (p.classic ? CLASSIC_PERCENT : WIN_PERCENT[p.seats])) / 100);
export const nameOf = (p, i) => { const [q, r] = boardOf(p).cells[i], R = radius(p); return String.fromCharCode(65 + r + R) + (q + R + 1 + Math.min(0, r)); };

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
/** A seat's territories: groups of two or more, with their money. */
export function territories(p, seat) {
  return groupsOf(p, seat).filter((g) => g.length > 1).map((cells) => {
    const hall = cells.find((c) => p.hall[c]), upkeep = cells.reduce((n, c) => n + UPKEEP[p.unit[c]], 0);
    return { cells, hall, purse: p.purse[hall], income: cells.length, upkeep, net: cells.length - upkeep };
  });
}
/** How well a cell is defended: the best unit on it or beside it, or 1 for a hall. */
export function defence(p, c) {
  const o = p.owner[c];
  if (o === NONE) return 0;
  let d = Math.max(p.unit[c], p.hall[c]);
  for (const m of boardOf(p).near[c]) if (p.owner[m] === o) d = Math.max(d, p.unit[m], p.hall[m]);
  return d;
}

const copy = (p) => ({ ...p, owner: [...p.owner], unit: [...p.unit], moved: [...p.moved], hall: [...p.hall], purse: [...p.purse] });

/** Give every territory of a seat exactly one hall. Changes p. */
function settle(p, seat) {
  if (seat === NONE) return;
  for (const g of groupsOf(p, seat)) {
    const halls = g.filter((c) => p.hall[c]);
    if (g.length === 1) { p.hall[g[0]] = 0; p.purse[g[0]] = 0; continue; }
    if (!halls.length) {
      const free = g.filter((c) => !p.unit[c]), from = free.length ? free : g;
      const best = from.reduce((a, b) => (p.order[b] < p.order[a] ? b : a));
      p.unit[best] = 0;
      p.moved[best] = 0;
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
  const was = p.owner[c], before = was === NONE ? 0 : groupsOf(p, was).length, pot = p.hall[c] ? p.purse[c] : 0;
  p.owner[c] = seat;
  p.unit[c] = rank;
  p.moved[c] = 1;
  p.hall[c] = 0;
  p.purse[c] = 0;
  settle(p, seat);
  settle(p, was);
  const won = plunder(pot), mine = won ? territories(p, seat).find((t) => t.cells.includes(c)) : null;
  if (mine) p.purse[mine.hall] += won;
  events.push({ kind: "take", seat, at: c, was, rank, lost: pot - (mine ? won : 0), won: mine ? won : 0 });
  if (was !== NONE && groupsOf(p, was).length > before) events.push({ kind: "split", seat: was });
}

/** One action, without passing the turn. Returns the new position and what happened. */
export function act(before, m) {
  const p = copy(before), events = [], s = p.seat;
  p.left -= 1;
  if (m.do === "raise") {
    p.purse[m.hall] -= raiseOf(p);
    if (p.owner[m.to] !== s) take(p, s, m.to, 1, events);
    else if (p.unit[m.to]) { p.unit[m.to] += 1; events.push({ kind: "merge", seat: s, at: m.to, rank: p.unit[m.to], raised: true }); }
    else { p.unit[m.to] = 1; p.moved[m.to] = 0; events.push({ kind: "raise", seat: s, at: m.to }); }
  } else {
    const rank = p.unit[m.from];
    p.unit[m.from] = 0;
    p.moved[m.from] = 0;
    if (p.owner[m.to] !== s) take(p, s, m.to, rank, events);
    else if (p.unit[m.to]) { p.unit[m.to] += rank; p.moved[m.to] = 1; events.push({ kind: "merge", seat: s, at: m.to, rank: p.unit[m.to] }); }
    else { p.unit[m.to] = rank; p.moved[m.to] = 1; events.push({ kind: "move", seat: s, from: m.from, to: m.to }); }
  }
  return { position: p, events };
}

/** The start of a seat's turn: units rest, territories earn and pay. Changes p. */
function begin(p, events) {
  const s = p.seat;
  p.left = p.classic ? MANY : ACTIONS;
  for (let i = 0; i < p.owner.length; i++) if (p.owner[i] === s) p.moved[i] = 0;
  const alone = groupsOf(p, s).filter((g) => g.length === 1 && p.unit[g[0]]).map((g) => g[0]);
  for (const c of alone) p.unit[c] = 0;
  if (alone.length) events.push({ kind: "stranded", seat: s, cells: alone });
  for (const t of territories(p, s)) {
    const now = t.purse + t.net;
    p.purse[t.hall] = Math.max(0, now);
    if (now >= 0) continue;
    const lost = t.cells.filter((c) => p.unit[c]);
    for (const c of lost) p.unit[c] = 0;
    events.push({ kind: "starve", seat: s, cells: lost });
  }
}

function finish(p, winners, why, events) {
  p.over = { winners, why };
  events.push({ kind: "end", winners, why });
}

/** Win at once, or pass the turn when the actions are used or the seat stops. Changes p. */
function after(p, stop, events) {
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
    }
    p.seat = (p.step + p.round - 1) % p.seats;
  } while (!live.includes(p.seat));
  begin(p, events);
  return undefined;
}

/** Drop some cells into the sea, away from the homes, keeping the island in one piece. */
function sea(b, homes, dice, many) {
  const water = b.cells.map(() => 0), kept = new Set(homes.flatMap((h) => [h, ...b.near[h]]));
  let left = many;
  for (const c of dice.shuffle(b.cells.map((_, i) => i))) {
    if (!left || kept.has(c)) continue;
    water[c] = 1;
    const first = water.indexOf(0), size = joined(b.near, first, (m) => !water[m]).length;
    if (size !== water.filter((w) => !w).length) water[c] = 0; else left--;
  }
  return water;
}

/** Classic: every land hex belongs to someone, the same number each, and every territory starts with a little money. */
function deal(p, b, dice) {
  const land = dice.shuffle(b.cells.map((_, i) => i).filter((i) => !p.water[i])), even = land.length - (land.length % p.seats);
  land.slice(0, even).forEach((c, i) => { p.owner[c] = i % p.seats; });
  for (let s = 0; s < p.seats; s++) {
    settle(p, s);
    for (const t of territories(p, s)) p.purse[t.hall] = CLASSIC_PURSE;
  }
}

export const fable = {
  id: "fable", version: "2",
  options: { style: { values: ["classic", "ours"], normal: "classic" }, seats: { values: [2, 3], normal: 2 }, rounds: { values: [10, 14, 18], normal: 14 } },

  setup(o, dice) {
    const classic = o.style === "classic", b = boardOf({ classic }), zero = () => b.cells.map(() => 0), homes = classic ? [] : dice.shuffle(o.seats === 2 ? [b.corners[0], b.corners[3]] : [b.corners[0], b.corners[2], b.corners[4]]);
    const p = { classic, seats: o.seats, rounds: classic ? LONG : o.rounds, water: sea(b, homes, dice, classic ? CLASSIC_WATER : WATER), order: dice.shuffle(b.cells.map((_, i) => i)), owner: b.cells.map(() => NONE), unit: zero(), moved: zero(), hall: zero(), purse: zero(), seat: 0, step: 0, round: 1, left: ACTIONS, over: null };
    homes.forEach((h, s) => {
      p.owner[h] = s;
      p.hall[h] = 1;
      p.purse[h] = PURSE;
      for (const m of [...b.near[h]].sort((x, y) => p.order[x] - p.order[y]).slice(0, 2)) p.owner[m] = s;
    });
    if (classic) deal(p, b, dice);
    begin(p, []);
    return p;
  },
  turn: (p) => (p.over ? null : p.seat),

  /** Raise a unit, move a unit, or end the turn. */
  moves(p) {
    const { near } = boardOf(p), s = p.seat, out = [{ do: "end" }];
    for (const t of territories(p, s)) {
      const inside = new Set(t.cells), edge = new Map();
      for (const c of t.cells) for (const m of near[c]) if (!inside.has(m) && !p.water[m] && p.owner[m] !== s && !edge.has(m)) edge.set(m, defence(p, m));
      if (t.purse >= raiseOf(p)) {
        for (const [c, d] of edge) if (d < 1) out.push({ do: "raise", hall: t.hall, to: c });
        for (const c of t.cells) if (!p.hall[c] && p.unit[c] < TOP) out.push({ do: "raise", hall: t.hall, to: c });
      }
      for (const from of t.cells) {
        const rank = p.unit[from];
        if (!rank || p.moved[from]) continue;
        for (const [c, d] of edge) if (d < rank) out.push({ do: "move", from, to: c });
        for (const c of t.cells) if (c !== from && !p.hall[c] && (!p.unit[c] || p.unit[c] + rank <= TOP)) out.push({ do: "move", from, to: c });
      }
    }
    return out;
  },

  apply(before, m) {
    const made = m.do === "end" ? { position: copy(before), events: [{ kind: "done", seat: before.seat }] } : act(before, m);
    after(made.position, m.do === "end", made.events);
    return made;
  },
  result: (p) => p.over,
};
