// SPDX-License-Identifier: AGPL-3.0-or-later
// The stacking game (an early version; its name is not chosen yet). Two players, twelve stones a side, on a hex board.
// Stones climb onto stones up to three high. Only the top stone of a stack acts, and each tier above the first adds 1 to
// a Courier's slide and a Slinger's range. A turn is one of: move or climb, strike (the struck stone goes to your pouch
// as yours), topple (knock a rival top stone to the cell behind), or drop a pouch stone beside one of your own.
// You may never leave your own Lodestone open to a strike; a player with no legal move loses, so trapping the rival
// Lodestone wins. Thirty quiet turns each, or two hundred turns each, end in a draw.
// After the first move the second player may swap sides. The opening is one of three set layouts, mirrored.
import { hexBoard } from "../hex.js";

export const KINDS = ["Lodestone", "Warden", "Courier", "Slinger", "Pebble"];
export const LODE = 0, WARDEN = 1, COURIER = 2, SLINGER = 3, PEBBLE = 4;
/** How many of each kind a side has. */
export const COUNT = [1, 1, 2, 2, 6];
export const RADIUS = 4, TALLEST = 3, LODE_TOP = 2;
/** Plies with no strike and no topple before a draw, and the longest game in plies. */
export const QUIET = 60, LONGEST = 400;
/** The six ways out of a cell, in turn round it: east, north-east, north-west, west, south-west, south-east. Opposite: +3. */
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
/** The two forward ways for each side: south moves up the board, north down it. */
const FORWARD = { south: [1, 2], north: [4, 5] };
/** The set openings, for the south side as [kind, q, r]; the north side is the same turned half round. */
export const LAYOUTS = [
  { name: "The wall", stones: [[LODE, -2, 4], [WARDEN, -1, 3], [COURIER, -4, 3], [COURIER, 1, 3], [SLINGER, -3, 3], [SLINGER, 0, 3], ...[-4, -3, -2, 0, 1, 2].map((q) => [PEBBLE, q, 2])] },
  { name: "The fan", stones: [[LODE, -2, 4], [WARDEN, -2, 3], [COURIER, -3, 4], [COURIER, -1, 4], [SLINGER, -4, 3], [SLINGER, 1, 3], ...[-4, -3, -2, 0, 1, 2].map((q) => [PEBBLE, q, 2])] },
  { name: "The vanguard", stones: [[LODE, -2, 3], [WARDEN, -1, 2], [COURIER, -4, 4], [COURIER, 0, 4], [SLINGER, -3, 3], [SLINGER, 0, 3], ...[-4, -3, -2, 0, 1, 2].map((q) => [PEBBLE, q, 2])] },
];

export const stoneOf = (seat, kind) => seat * 5 + kind;
export const ownerOf = (st) => (st >= 5 ? 1 : 0);
export const kindOf = (st) => st % 5;
export const boardOf = () => hexBoard(RADIUS);
let ways = null;
/** For each cell, the cell one step each way, or -1 off the board. */
export function stepsOf() {
  if (ways) return ways;
  const b = boardOf(), at = new Map(b.cells.map(([q, r], i) => [`${q},${r}`, i]));
  ways = b.cells.map(([q, r]) => DIRS.map(([a, c]) => at.get(`${q + a},${r + c}`) ?? -1));
  return ways;
}
export const rowOf = (i) => boardOf().cells[i][1];
export const cellAt = (q, r) => boardOf().cells.findIndex(([a, b]) => a === q && b === r);
/** A cell's name: its row as a letter from the top (A to I), then its place in the row from the left. */
export function nameOf(p, i) {
  const [q, r] = boardOf().cells[i];
  return String.fromCharCode(65 + r + RADIUS) + (q + RADIUS + 1 + Math.min(0, r));
}
export const sideOf = (p, s) => (s === p.south ? "south" : "north");
export const topOf = (p, i) => { const c = p.cells[i]; return c.length ? c[c.length - 1] : -1; };
/** Where a seat's Lodestone stands, or -1 (it never leaves the board, so -1 only in a made-up position). */
export const lodeOf = (p, s) => p.cells.findIndex((c) => c.length && c[c.length - 1] === stoneOf(s, LODE));
/** A Courier's slide or a Slinger's range from a tier: 2 at the first tier, one more for each tier above it. */
export const reachOf = (tier) => tier + 1;

/** A stone of `kind` at `tier` lands on cell j: may it move or climb there? */
function canLand(p, j, tier, kind) {
  const h = p.cells[j].length;
  if (h === 0) return true;
  const k = kindOf(p.cells[j][h - 1]);
  if (k === LODE || k === WARDEN) return false; // nothing stands on a Lodestone; nothing climbs a Warden
  if (kind === WARDEN) return false; // a Warden never climbs
  return h + 1 <= TALLEST && h <= tier && (kind !== LODE || h + 1 <= LODE_TOP); // one tier at a time
}
/** May a stone of `kind` at `tier` strike the top stone of cell j by stepping onto it? */
function canStrike(p, j, tier, kind, seat) {
  const h = p.cells[j].length;
  if (!h || ownerOf(p.cells[j][h - 1]) === seat || h > tier + 1) return false; // no more than one tier above itself
  if (kind === LODE) return h <= LODE_TOP;
  if (kind === WARDEN) return h === 1;
  return true;
}

/**
 * Every move a seat could make, before the rule that its own Lodestone may not be left open to a strike.
 * With `strikes` only the strikes: what the seat threatens.
 */
export function rawMoves(p, seat, strikes = false) {
  const out = [], step = stepsOf(), n = p.cells.length;
  for (let i = 0; i < n; i++) {
    const c = p.cells[i], tier = c.length;
    if (!tier || ownerOf(c[tier - 1]) !== seat) continue;
    const kind = kindOf(c[tier - 1]);
    const at = (j) => {
      if (!strikes && canLand(p, j, tier, kind)) out.push({ do: "move", from: i, to: j });
      if (kind !== SLINGER && canStrike(p, j, tier, kind, seat)) out.push({ do: "strike", from: i, to: j });
    };
    if (kind === COURIER || kind === SLINGER) {
      for (let d = 0; d < 6; d++) {
        let j = i;
        for (let k = 0; k < reachOf(tier); k++) {
          j = step[j][d];
          if (j < 0) break;
          if (kind === COURIER) { at(j); if (p.cells[j].length) break; continue; }
          if (k === 0 && !strikes && canLand(p, j, tier, kind)) out.push({ do: "move", from: i, to: j }); // a Slinger steps one
          if (p.cells[j].length) { if (canStrike(p, j, tier, kind, seat)) out.push({ do: "sling", from: i, to: j }); break; } // and slings at the first stone in a line
        }
      }
    } else {
      for (const d of kind === PEBBLE ? FORWARD[sideOf(p, seat)] : [0, 1, 2, 3, 4, 5]) { const j = step[i][d]; if (j >= 0) at(j); }
    }
    if (strikes) continue;
    // topple: beside a rival stack no taller than this stone, knock its top stone to the cell behind
    for (let d = 0; d < 6; d++) {
      const j = step[i][d];
      if (j < 0) continue;
      const h = p.cells[j].length, top = h ? p.cells[j][h - 1] : -1;
      if (!h || ownerOf(top) === seat || kindOf(top) === WARDEN || h > tier) continue;
      const b = step[j][d];
      if (b >= 0 && canLand(p, b, TALLEST, kindOf(top) === LODE ? LODE : PEBBLE)) out.push({ do: "topple", from: i, to: j });
    }
  }
  if (strikes) return out;
  // drops: a pouch stone onto an empty cell beside one of your own stacks, never beside the rival Lodestone
  const pouch = p.pouch[seat];
  if (pouch.some((v) => v > 0)) {
    const rival = lodeOf(p, 1 - seat);
    for (let j = 0; j < n; j++) {
      if (p.cells[j].length || !step[j].some((m) => m >= 0 && p.cells[m].length && ownerOf(topOf(p, m)) === seat) || (rival >= 0 && step[j].includes(rival))) continue;
      for (let k = 1; k < 5; k++) if (pouch[k] > 0) out.push({ do: "drop", kind: k, to: j });
    }
  }
  if (p.ply === 1 && p.rule.swap && !p.swapped) out.push({ do: "swap" });
  return out;
}
/** Is a seat's Lodestone open to a strike by the other seat? */
export function threatened(p, seat) {
  const at = lodeOf(p, seat);
  return at >= 0 && rawMoves(p, 1 - seat, true).some((m) => m.to === at);
}
/** Has a seat any legal move? Stops at the first. */
export const hasMove = (p, seat = p.seat) => rawMoves(p, seat).some((m) => ((m.do !== "strike" && m.do !== "sling") || kindOf(topOf(p, m.to)) !== LODE) && !threatened(make(p, m).position, seat));
/** The legal moves of the seat to move: those that leave its own Lodestone safe, and never a strike on a Lodestone. */
export function legalOf(p, seat = p.seat) {
  return rawMoves(p, seat).filter((m) => (m.do !== "strike" && m.do !== "sling") || kindOf(topOf(p, m.to)) !== LODE).filter((m) => !threatened(make(p, m).position, seat));
}

const copy = (p) => ({ ...p, cells: p.cells.map((c) => [...c]), pouch: p.pouch.map((x) => [...x]) });
/** A move made, with no test of the end: for the rules below and for bots that look ahead. */
export function make(before, m) {
  const p = copy(before), s = p.seat, events = [];
  let loud = false;
  if (m.do === "move") {
    const st = p.cells[m.from].pop();
    p.cells[m.to].push(st);
    events.push({ kind: "move", seat: s, from: m.from, to: m.to, stone: st, tier: p.cells[m.to].length });
  } else if (m.do === "strike" || m.do === "sling") {
    const st = m.do === "strike" ? p.cells[m.from].pop() : topOf(p, m.from), struck = p.cells[m.to].pop();
    if (m.do === "strike") p.cells[m.to].push(st);
    p.pouch[s][kindOf(struck)]++;
    loud = true;
    events.push({ kind: m.do, seat: s, from: m.from, to: m.to, stone: st, struck, tier: p.cells[m.to].length });
  } else if (m.do === "topple") {
    const d = stepsOf()[m.from].indexOf(m.to), behind = stepsOf()[m.to][d], st = p.cells[m.to].pop();
    p.cells[behind].push(st);
    loud = true;
    events.push({ kind: "topple", seat: s, from: m.from, to: m.to, behind, stone: topOf(p, m.from), knocked: st, tier: p.cells[behind].length });
  } else if (m.do === "drop") {
    p.pouch[s][m.kind]--;
    p.cells[m.to].push(stoneOf(s, m.kind));
    events.push({ kind: "drop", seat: s, to: m.to, stone: stoneOf(s, m.kind) });
  } else if (m.do === "swap") { // the second player takes the side that has moved; the first plays on with the other
    p.cells = p.cells.map((c) => c.map((st) => (st + 5) % 10));
    p.pouch = [p.pouch[1], p.pouch[0]];
    p.south = 1 - p.south;
    p.swapped = true;
    events.push({ kind: "swap", seat: s });
  }
  p.ply++;
  p.round = (p.ply >> 1) + 1;
  p.quiet = loud ? 0 : p.quiet + 1;
  p.seat = 1 - s;
  p.last = m.do === "swap" ? null : { from: m.from ?? -1, to: m.to, behind: events[0].behind ?? -1 };
  return { position: p, events };
}

function finish(p, winners, why, events) {
  p.over = { winners, why };
  events.push({ kind: "end", winners, why });
}

export const stacking = {
  id: "stacking",
  version: "1",
  options: {
    style: { values: ["ours"], normal: "ours" },
    seats: { values: [2], normal: 2 },
    layout: { values: ["drawn", 0, 1, 2], normal: "drawn" }, // a set opening, drawn from the seed or chosen
    swap: { values: [true, false], normal: true }, // after the first move the second player may take that side
  },
  setup(o, dice) {
    const b = boardOf(), layout = o.layout === "drawn" ? dice.below(LAYOUTS.length) : o.layout, cells = b.cells.map(() => []);
    for (const [kind, q, r] of LAYOUTS[layout].stones) { cells[cellAt(q, r)].push(stoneOf(0, kind)); cells[cellAt(-q, -r)].push(stoneOf(1, kind)); }
    return { seats: 2, seat: 0, south: 0, cells, pouch: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]], ply: 0, round: 1, quiet: 0, layout, swapped: false, classic: false, rule: { swap: o.swap }, last: null, over: null };
  },
  turn: (p) => (p.over ? null : p.seat),
  moves: (p) => legalOf(p),
  apply(before, m) {
    const { position: p, events } = make(before, m);
    if (threatened(p, p.seat)) events.push({ kind: "threat", seat: p.seat });
    if (!legalOf(p).length) finish(p, [1 - p.seat], threatened(p, p.seat) ? "the rival Lodestone is trapped" : "the rival has no legal move", events);
    else if (p.quiet >= QUIET) finish(p, [0, 1], `${QUIET / 2} turns each passed without a strike or a topple`, events);
    else if (p.ply >= LONGEST) finish(p, [0, 1], `the game reached its longest, ${LONGEST / 2} turns each`, events);
    return { position: p, events };
  },
  result: (p) => p.over,
};

/** Stones a seat holds: on the board and in its pouch. */
export const stonesOf = (p, s) => p.cells.reduce((n, c) => n + c.filter((st) => ownerOf(st) === s).length, 0) + p.pouch[s].reduce((a, b) => a + b, 0);
/** Stacks of two or more, as cell numbers. */
export const towersOf = (p) => p.cells.flatMap((c, i) => (c.length > 1 ? [i] : []));
