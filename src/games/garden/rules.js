// SPDX-License-Identifier: AGPL-3.0-or-later
// The garden game (working name; early). Two gardeners share a hex bed round a pond. Five kinds of plant stand on one wheel:
// each links with the kinds either side of it, overgrows the kind two steps on, and is overgrown by the kind two steps back.
// A turn sows a plant from your pouch, or shifts one of yours in a straight line; a shift may end on a rival plant it
// overgrows, which goes back to its owner's pouch. Two of your plants on one line with nothing between, of linking kinds,
// are linked, and a shift that makes a new link earns one free sow. Close a chain of links right round the pond to win;
// otherwise, at the turn limit, the count decides. The second gardener may swap sides after the first sow.
// Traditional is the genre as it is remembered: a wide bed, home beds to sow from, long shifts, most links at the end.
// Capo is our own quick game: a smaller bed, sow on any rim cell, short shifts, points at the end. Custom is every switch.
import { hexBoard } from "../hex.js";

export const NONE = -1, KINDS = 5, EACH = 3, POND = 1, WIN = 1000000;
/** The kinds, in order round the wheel. Working names. */
export const PLANTS = ["Reed", "Fern", "Sedge", "Thistle", "Clover"];
/** Two kinds link when they stand side by side on the wheel. */
export const linking = (a, b) => (a - b + KINDS) % KINDS === 1 || (b - a + KINDS) % KINDS === 1;
/** A kind overgrows the kind two steps on round the wheel. */
export const overgrows = (a, b) => (b - a + KINDS) % KINDS === 2;
/** What the rule sets set. Custom takes each of these as it is given. */
export const SWITCHES = {
  size: { values: [4, 5], normal: 5 }, // the bed's radius: 61 or 91 cells, the pond in the middle
  sowing: { values: ["beds", "rim"], normal: "beds" }, // beds: your three home beds; rim: any empty cell on the edge
  reach: { values: [2, 3, 4], normal: 3 }, // how far a shift may go
  bonus: { values: [true, false], normal: true }, // a shift that makes a new link earns a free sow
  overgrow: { values: ["pouch", "removed", "off"], normal: "pouch" }, // what happens to an overgrown plant
  limit: { values: [16, 24, 32, 40, 60], normal: 40 }, // turns each
  score: { values: ["links", "points"], normal: "links" }, // at the limit: links standing, or 1 a link standing and 2 an overgrowth
  swap: { values: [true, false], normal: true }, // the second gardener may take the first sow as their own
  called: { values: [true, false], normal: true }, // the game says when a gardener can close the ring with one move
};
const normal = () => Object.fromEntries(Object.entries(SWITCHES).map(([k, v]) => [k, v.normal]));
const SETS = {
  classic: () => normal(),
  ours: (o) => ({ ...normal(), size: 4, sowing: "rim", reach: 2, limit: o.rounds, score: "points" }),
};

// ---- the bed: cells, lines, the pond, the rim, home beds and the six parts round the pond ----
const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]; // round the compass: d and d + 3 are opposite ways
const beds = new Map();
/** The bed of a radius, worked out once. */
export function bedOf(radius) {
  if (beds.has(radius)) return beds.get(radius);
  const b = hexBoard(radius), at = new Map(b.cells.map(([q, r], i) => [`${q},${r}`, i]));
  const ring = b.cells.map(([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)));
  const step = b.cells.map(([q, r]) => DIRS.map(([a, c]) => at.get(`${q + a},${r + c}`) ?? NONE));
  const pond = ring.map((d) => d <= POND), rim = ring.map((d) => d === radius);
  const turn = b.cells.map(([q, r]) => at.get(`${-r},${q + r}`)); // a sixth of a turn round the pond: corner k goes to corner k + 1
  // each gardener's home beds: alternate corners of the rim, each with the rim cells beside it
  const home = [0, 1].map((s) => {
    const mine = b.cells.map(() => false);
    b.corners.forEach((c, k) => { if (k % 2 === s) for (const x of [c, ...b.near[c].filter((m) => rim[m])]) mine[x] = true; });
    return mine;
  });
  // the part round the pond a cell is in: the wedge between direction k and direction k + 1
  const sector = b.cells.map(([q, r]) => {
    for (let k = 0; k < 6; k++) {
      const [x1, y1] = DIRS[k], [x2, y2] = DIRS[(k + 1) % 6], a = q * y2 - r * x2, c = x1 * r - y1 * q; // the determinant is 1
      if (a >= 1 && c >= 0) return k;
    }
    return NONE;
  });
  const made = Object.freeze({ radius, size: b.size, cells: b.cells, near: b.near, corners: b.corners, ring, step, pond, rim, turn, home, sector });
  beds.set(radius, made);
  return made;
}
export const boardOf = (p) => bedOf(p.rule.size);
export const nameOf = (p, i) => { const [q, r] = boardOf(p).cells[i], R = p.rule.size; return String.fromCharCode(65 + r + R) + (q + R + 1 + Math.min(0, r)); };

// ---- links, chains and the ring ----
/** A gardener's links: [a, b, direction], each once. Two of their plants on one line, nothing between, of linking kinds. */
export function linksOf(p, seat) {
  const g = boardOf(p), out = [];
  for (let c = 0; c < p.owner.length; c++) {
    if (p.owner[c] !== seat) continue;
    for (let d = 0; d < 3; d++) {
      let x = g.step[c][d];
      while (x !== NONE && !g.pond[x] && p.owner[x] === NONE) x = g.step[x][d];
      if (x !== NONE && p.owner[x] === seat && linking(p.kind[c], p.kind[x])) out.push([c, x, d]);
    }
  }
  return out;
}
/**
 * Does a link cross the line from a point inside the pond, (1/2, 1/4) in the bed's own coordinates, going on in the first
 * direction? Counted in quarters, so in whole numbers. A chain that closes round the pond crosses it an odd number of times.
 */
function crosses(g, a, b) {
  const [qa, ra] = g.cells[a], [qb, rb] = g.cells[b];
  if ((ra <= 0) === (rb <= 0)) return 0;
  const x1 = 4 * qa, y1 = 4 * ra, x2 = 4 * qb, y2 = 4 * rb, d = y2 - y1, n = x1 * d + (x2 - x1) * (1 - y1) - 2 * d;
  return n * d > 0 ? 1 : 0;
}
/** A chain of a gardener's links that goes right round the pond, as its cells in order; or null. */
export function ringOf(p, seat, links = linksOf(p, seat)) {
  const g = boardOf(p), near = new Map();
  for (const [a, b] of links) {
    const w = crosses(g, a, b);
    if (!near.has(a)) near.set(a, []);
    if (!near.has(b)) near.set(b, []);
    near.get(a).push([b, w]);
    near.get(b).push([a, w]);
  }
  const side = new Map(), up = new Map();
  const path = (c) => { const out = []; for (let x = c; x !== undefined; x = up.get(x)) out.push(x); return out; };
  for (const start of [...near.keys()].sort((x, y) => x - y)) {
    if (side.has(start)) continue;
    side.set(start, 0);
    const list = [start];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      for (const [x, w] of near.get(c)) {
        if (!side.has(x)) { side.set(x, side.get(c) ^ w); up.set(x, c); list.push(x); continue; }
        if ((side.get(c) ^ side.get(x) ^ w) === 0) continue;
        // two ways round: the walk from c back to the start and from x back to it, joined where they meet
        const pc = path(c), px = path(x), seen = new Set(pc);
        const meet = px.find((y) => seen.has(y));
        return [...pc.slice(0, pc.indexOf(meet) + 1), ...px.slice(0, px.indexOf(meet)).reverse()];
      }
    }
  }
  return null;
}
/** How far round the pond a gardener's best chain reaches: the six parts it touches, plants and lines both; and the links. */
export function meterOf(p, seat, links = linksOf(p, seat)) {
  const g = boardOf(p), root = new Map(), find = (c) => { while (root.get(c) !== c) c = root.get(c); return c; };
  for (let c = 0; c < p.owner.length; c++) if (p.owner[c] === seat) root.set(c, c);
  for (const [a, b] of links) root.set(find(a), find(b));
  const parts = new Map(), add = (c, k) => { const r = find(c); parts.set(r, (parts.get(r) || 0) | (1 << k)); };
  for (const [a, b, d] of links) for (let x = a; ; x = g.step[x][d]) { add(a, g.sector[x]); if (x === b) break; }
  for (const c of root.keys()) add(c, g.sector[c]);
  let best = 0, mask = 0;
  for (const m of parts.values()) { let n = 0; for (let k = 0; k < 6; k++) if (m & (1 << k)) n++; if (n > best) { best = n; mask = m; } }
  return { links: links.length, parts: best, mask };
}
export const plantsOf = (p, seat) => p.owner.reduce((n, o) => n + (o === seat ? 1 : 0), 0);
export const pouchOf = (p, seat) => p.pouch[seat].reduce((n, k) => n + k, 0);
/** What the count at the limit counts: links standing, and in points 2 for each overgrowth as well. */
export const scoreOf = (p, seat) => linksOf(p, seat).length + (p.rule.score === "points" ? 2 * p.took[seat] : 0);

// ---- moves ----
/** The empty cells a gardener may sow on. */
export function sowable(p, seat) {
  const g = boardOf(p), out = [];
  for (let c = 0; c < p.owner.length; c++) if (p.owner[c] === NONE && !g.pond[c] && (p.rule.sowing === "rim" ? g.rim[c] : g.home[seat][c])) out.push(c);
  return out;
}
/** Where a plant may shift: along a line through empty cells, up to the reach; the last may hold a rival plant it overgrows. */
export function shiftsFrom(p, c) {
  const g = boardOf(p), out = [], seat = p.owner[c];
  for (let d = 0; d < 6; d++) {
    let x = c;
    for (let n = 0; n < p.rule.reach; n++) {
      x = g.step[x][d];
      if (x === NONE || g.pond[x]) break;
      if (p.owner[x] === NONE) { out.push(x); continue; }
      if (p.owner[x] !== seat && p.rule.overgrow !== "off" && overgrows(p.kind[c], p.kind[x])) out.push(x);
      break;
    }
  }
  return out;
}
/** Every sow and shift open to a gardener, whether or not it is their turn. */
export function movesFor(p, seat, { sow = true, shift = true } = {}) {
  const out = [];
  if (sow) {
    const cells = sowable(p, seat);
    for (let k = 0; k < KINDS; k++) if (p.pouch[seat][k] > 0) for (const to of cells) out.push({ do: "sow", kind: k, to });
  }
  if (shift) for (let c = 0; c < p.owner.length; c++) if (p.owner[c] === seat) for (const to of shiftsFrom(p, c)) out.push({ do: "shift", from: c, to });
  return out;
}
/** The moves that would close a ring for a gardener at once, if it were their turn. With `one`, stop at the first. */
export function closers(p, seat, one = false) {
  const out = [], q = { ...p, seat, free: false, offer: false };
  if (plantsOf(p, seat) + (pouchOf(p, seat) ? 1 : 0) < 4) return out; // the shortest ring has four plants
  for (const m of movesFor(q, seat)) {
    if (ringOf(place(q, m).position, seat)) { out.push(m); if (one) break; }
  }
  return out;
}

const copy = (p) => ({ ...p, owner: [...p.owner], kind: [...p.kind], pouch: p.pouch.map((x) => [...x]), took: [...p.took], made: [...p.made], warned: [...p.warned] });
const key = (a, b) => (a < b ? `${a}.${b}` : `${b}.${a}`);

/** Put a sow or shift on the bed, nothing more: no turn passes and no ring is looked for. */
function place(before, m) {
  const p = copy(before), s = p.seat, events = [];
  if (m.do === "sow") {
    p.owner[m.to] = s; p.kind[m.to] = m.kind; p.pouch[s][m.kind] -= 1;
    events.push({ kind: "sow", seat: s, plant: m.kind, at: m.to });
    return { position: p, events, fresh: 0 };
  }
  const had = new Set(linksOf(before, s).map(([a, b]) => key(a === m.from ? m.to : a, b === m.from ? m.to : b))), plant = p.kind[m.from];
  if (p.owner[m.to] !== NONE) {
    const was = p.owner[m.to], lost = p.kind[m.to];
    if (p.rule.overgrow === "pouch") p.pouch[was][lost] += 1;
    p.took[s] += 1;
    events.push({ kind: "overgrow", seat: s, plant, was, lost, at: m.to, back: p.rule.overgrow === "pouch" });
  }
  p.owner[m.to] = s; p.kind[m.to] = plant; p.owner[m.from] = NONE; p.kind[m.from] = NONE;
  events.unshift({ kind: "shift", seat: s, plant, from: m.from, at: m.to });
  const fresh = linksOf(p, s).filter(([a, b]) => !had.has(key(a, b))).length; // a link carried along by the shifted plant is not new
  if (fresh) { p.made[s] += fresh; events.push({ kind: "link", seat: s, n: fresh }); }
  return { position: p, events, fresh };
}

function finish(p, winners, why, events) {
  p.over = { winners, why };
  events.push({ kind: "end", winners, why });
}

/**
 * One move, with what follows it: the ring, the free sow, the turn passing and the limit. `call` also says when a
 * gardener has come within one move of closing (the bots leave it out: it does not change the game).
 */
export function step(before, m, call = false) {
  let made;
  if (m.do === "swap") {
    // the second gardener takes the first sow as their own: the bed turns a sixth round, so it stands on their side, and the pouches change hands
    const g = boardOf(before), p = copy(before);
    p.owner = p.owner.map(() => NONE); p.kind = p.kind.map(() => NONE);
    before.owner.forEach((o, c) => { if (o !== NONE) { p.owner[g.turn[c]] = 1 - o; p.kind[g.turn[c]] = before.kind[c]; } });
    p.pouch = [before.pouch[1], before.pouch[0]].map((x) => [...x]);
    made = { position: p, events: [{ kind: "swap", seat: p.seat }], fresh: 0 };
  } else if (m.do === "skip" || m.do === "pass") made = { position: copy(before), events: [{ kind: m.do, seat: before.seat }], fresh: 0 };
  else made = place(before, m);
  const { position: p, events, fresh } = made, s = p.seat;
  p.offer = false;
  const mine = ringOf(p, s), theirs = mine ? null : ringOf(p, 1 - s);
  if (mine || theirs) {
    const w = mine ? s : 1 - s;
    events.push({ kind: "ring", seat: w, cells: mine || theirs });
    finish(p, [w], "closed a ring round the pond", events);
    return { position: p, events };
  }
  if (m.do === "shift" && fresh && p.rule.bonus && pouchOf(p, s) && sowable(p, s).length) {
    p.free = true;
    events.push({ kind: "free", seat: s });
    return { position: p, events };
  }
  p.free = false;
  p.done += 1;
  if (p.done >= 2 * p.rounds) {
    const a = scoreOf(p, 0), b = scoreOf(p, 1), what = p.rule.score === "points" ? "points" : "links";
    finish(p, a === b ? [0, 1] : [a > b ? 0 : 1], a === b ? `had as many ${what} at the end` : `had the most ${what} at the end`, events);
    return { position: p, events };
  }
  p.seat = 1 - s;
  p.round = Math.floor(p.done / 2) + 1;
  p.offer = p.rule.swap && p.done === 1;
  if (call && p.rule.called) {
    for (const x of [p.seat, 1 - p.seat]) {
      const now = closers(p, x, true).length > 0;
      if (now && !p.warned[x]) events.push({ kind: "threat", seat: x });
      p.warned[x] = now ? 1 : 0;
    }
  }
  return { position: p, events };
}

export const garden = {
  id: "garden", version: "1",
  options: {
    style: { values: ["classic", "ours", "custom"], normal: "ours" }, seats: { values: [2], normal: 2 }, rounds: { values: [16, 24, 32], normal: 24 },
    ...SWITCHES,
  },

  setup(o) {
    const rule = SETS[o.style] ? SETS[o.style](o) : Object.fromEntries(Object.keys(SWITCHES).map((k) => [k, o[k]]));
    const g = bedOf(rule.size), none = () => g.cells.map(() => NONE);
    return {
      style: o.style, classic: o.style !== "ours", rule, seats: 2, owner: none(), kind: none(), pouch: [0, 1].map(() => Array(KINDS).fill(EACH)),
      took: [0, 0], made: [0, 0], warned: [0, 0], seat: 0, done: 0, round: 1, rounds: rule.limit, free: false, offer: false, over: null,
    };
  },
  turn: (p) => (p.over ? null : p.seat),

  /** A sow or a shift; after a shift that made a link, a free sow or a skip; for the second gardener's first turn, a swap too. */
  moves(p) {
    if (p.over) return [];
    if (p.free) return [...movesFor(p, p.seat, { shift: false }), { do: "skip" }];
    const out = movesFor(p, p.seat);
    if (p.offer) out.push({ do: "swap" });
    return out.length ? out : [{ do: "pass" }];
  },

  apply: (before, m) => step(before, m, true),
  result: (p) => p.over,
};
