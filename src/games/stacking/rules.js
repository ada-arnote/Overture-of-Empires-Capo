// SPDX-License-Identifier: AGPL-3.0-or-later
// The stacking game (an early version; its name is not chosen yet). Two players on a hex board.
// Stones climb onto stones up to three high. Only the top stone of a stack acts, and each tier above the first adds 1 to
// a Courier's slide and a Slinger's range. A turn is one of: move or climb, strike (the struck stone goes to your pouch
// as yours), topple (knock a rival top stone to the cell behind), or drop a pouch stone beside one of your own.
// You may never leave your own Lodestone open to a strike; a player with no legal move loses, so trapping the rival
// Lodestone wins. Thirty quiet turns each, or two hundred turns each, end in a draw.
// Traditional: 61 cells, twelve stones a side, a set opening drawn from three (or free placement), and a count after 40 turns
// each, as in Capo, with 1 added for the first player (version 3: between strong players the trap alone drew nearly every game). Capo: the quick set,
// 37 cells, nine stones a side, a set opening drawn from three, and after 30 turns each the higher count of tiers topped wins
// (the first player adds 2, as the second player has the last move; a tie goes to the side holding more stones).
// Custom: size, opening, swap, the count, drops and an extra Pebble for the second player. After the first move of play
// the second player may swap sides.
import { hexBoard } from "../hex.js";

export const KINDS = ["Lodestone", "Warden", "Courier", "Slinger", "Pebble"];
export const LODE = 0, WARDEN = 1, COURIER = 2, SLINGER = 3, PEBBLE = 4;
/** How many of each kind a side has: on the large board, and in the small Capo set. */
export const COUNT = [1, 1, 2, 2, 6], SMALL = [1, 1, 2, 1, 4];
export const RADIUS = 4, TALLEST = 3, LODE_TOP = 2;
/** Plies with no strike and no topple before a draw, and the longest game in plies. */
export const QUIET = 60, LONGEST = 400;
/** At the count, the first player adds this to their tiers topped, as the second player has the last move: 1 on the large board, 2 on the small.
 *  A tie goes to the side holding more stones. */
export const FIRST = { 4: 1, 3: 2 };
export const firstOf = (p) => FIRST[sizeOf(p)];
/** In free placement a side places at least this many stones before it may stop; the rest wait in its pouch. */
export const PLACE_LEAST = 8;
/** The six ways out of a cell, in turn round it: east, north-east, north-west, west, south-west, south-east. Opposite: +3. */
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
/** The two forward ways for each side: south moves up the board, north down it. */
export const FORWARD = { south: [1, 2], north: [4, 5] };
/** The set openings, for the south side as [kind, q, r]; the north side is the same turned half round. */
export const LAYOUTS = [
  { name: "The wall", stones: [[LODE, -2, 4], [WARDEN, -1, 3], [COURIER, -4, 3], [COURIER, 1, 3], [SLINGER, -3, 3], [SLINGER, 0, 3], ...[-4, -3, -2, 0, 1, 2].map((q) => [PEBBLE, q, 2])] },
  { name: "The fan", stones: [[LODE, -2, 4], [WARDEN, -2, 3], [COURIER, -3, 4], [COURIER, -1, 4], [SLINGER, -4, 3], [SLINGER, 1, 3], ...[-4, -3, -2, 0, 1, 2].map((q) => [PEBBLE, q, 2])] },
  { name: "The vanguard", stones: [[LODE, -2, 3], [WARDEN, -1, 2], [COURIER, -4, 4], [COURIER, 0, 4], [SLINGER, -3, 3], [SLINGER, 0, 3], ...[-4, -3, -2, 0, 1, 2].map((q) => [PEBBLE, q, 2])] },
];
/** The small board's set openings (Capo): nine stones in the three home rows. */
export const LAYOUTS_SMALL = [
  { name: "The wall", stones: [[LODE, -2, 3], [WARDEN, -1, 2], [COURIER, -3, 3], [COURIER, 0, 3], [SLINGER, -2, 2], ...[-2, -1, 0, 1].map((q) => [PEBBLE, q, 1])] },
  { name: "The fan", stones: [[LODE, -1, 3], [WARDEN, -2, 3], [COURIER, -3, 2], [COURIER, 1, 2], [SLINGER, -1, 2], ...[-3, -1, 0, 2].map((q) => [PEBBLE, q, 1])] },
  { name: "The vanguard", stones: [[LODE, -1, 3], [WARDEN, 0, 2], [COURIER, -3, 3], [COURIER, -2, 2], [SLINGER, -1, 1], ...[-3, -2, 0, 1].map((q) => [PEBBLE, q, 1])] },
];

export const stoneOf = (seat, kind) => seat * 5 + kind;
export const ownerOf = (st) => (st >= 5 ? 1 : 0);
export const kindOf = (st) => st % 5;
/** A position's board radius: 4 (61 cells) or 3 (37). */
export const sizeOf = (p) => p?.size || RADIUS;
export const boardOf = (size = RADIUS) => hexBoard(size);
const ways = new Map(), places = new Map();
/** For each cell, the cell one step each way, or -1 off the board. */
export function stepsOf(size = RADIUS) {
  if (ways.has(size)) return ways.get(size);
  const b = boardOf(size), at = new Map(b.cells.map(([q, r], i) => [`${q},${r}`, i]));
  const w = b.cells.map(([q, r]) => DIRS.map(([a, c]) => at.get(`${q + a},${r + c}`) ?? -1));
  ways.set(size, w);
  return w;
}
export const rowOf = (i, size = RADIUS) => boardOf(size).cells[i][1];
export function cellAt(q, r, size = RADIUS) {
  if (!places.has(size)) places.set(size, new Map(boardOf(size).cells.map(([a, b], i) => [`${a},${b}`, i])));
  return places.get(size).get(`${q},${r}`) ?? -1;
}
/** A cell's name: its row as a letter from the top (A to I, or A to G), then its place in the row from the left. */
export function nameOf(p, i) {
  const size = sizeOf(p), [q, r] = boardOf(size).cells[i];
  return String.fromCharCode(65 + r + size) + (q + size + 1 + Math.min(0, r));
}
export const sideOf = (p, s) => (s === p.south ? "south" : "north");
/** A seat's home rows: its three nearest rows. */
export const homeOf = (p, s, i) => { const r = rowOf(i, sizeOf(p)); return sideOf(p, s) === "south" ? r >= sizeOf(p) - 2 : r <= 2 - sizeOf(p); };
export const topOf = (p, i) => { const c = p.cells[i]; return c.length ? c[c.length - 1] : -1; };
/** Where a seat's Lodestone stands, or -1 (it never leaves the board once placed). */
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

/** Placements in free placement: the Lodestone first, then any stone in hand on an empty home cell; a stop once enough are down. */
function placements(p, seat) {
  const out = [], hand = p.hand[seat], down = p.placed[seat];
  for (let j = 0; j < p.cells.length; j++) {
    if (p.cells[j].length || !homeOf(p, seat, j)) continue;
    for (let k = 0; k < 5; k++) if (hand[k] > 0 && (down > 0 || k === LODE)) out.push({ do: "place", kind: k, to: j });
  }
  return out;
}
const handLeft = (p, s) => p.hand[s].reduce((a, b) => a + b, 0);

/**
 * Every move a seat could make, before the rule that its own Lodestone may not be left open to a strike.
 * With `strikes` only the strikes: what the seat threatens.
 */
export function rawMoves(p, seat, strikes = false) {
  if (p.phase === "place") return strikes ? [] : placements(p, seat);
  const out = [], step = stepsOf(sizeOf(p)), n = p.cells.length;
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
    if (strikes || p.rule.topple === false) continue;
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
  if (p.rule.drops !== false && pouch.some((v) => v > 0)) {
    const rival = lodeOf(p, 1 - seat);
    for (let j = 0; j < n; j++) {
      if (p.cells[j].length || !step[j].some((m) => m >= 0 && p.cells[m].length && ownerOf(topOf(p, m)) === seat) || (rival >= 0 && step[j].includes(rival))) continue;
      for (let k = 1; k < 5; k++) if (pouch[k] > 0) out.push({ do: "drop", kind: k, to: j });
    }
  }
  if (p.ply === (p.began || 0) + 1 && p.rule.swap && !p.swapped) out.push({ do: "swap" });
  return out;
}
/** Is a seat's Lodestone open to a strike by the other seat? */
export function threatened(p, seat) {
  const at = lodeOf(p, seat);
  return at >= 0 && p.phase !== "place" && rawMoves(p, 1 - seat, true).some((m) => m.to === at);
}
/** Would a stone on the board strike either Lodestone? In free placement a stone may not be put down where it would. */
const reaches = (p) => [0, 1].some((s) => { const at = lodeOf(p, s); return at >= 0 && rawMoves({ ...p, phase: "play" }, 1 - s, true).some((m) => m.to === at); });
const safe = (p, seat, m) => (p.phase === "place" ? m.do === "stop" || !reaches(make(p, m).position) : (m.do !== "strike" && m.do !== "sling") || kindOf(topOf(p, m.to)) !== LODE);
/** Has a seat any legal move? Stops at the first. */
export const hasMove = (p, seat = p.seat) => legalOf(p, seat, true).length > 0;
/** The legal moves of the seat to move: those that leave its own Lodestone safe, and never a strike on a Lodestone. */
export function legalOf(p, seat = p.seat, first = false) {
  const out = [];
  for (const m of rawMoves(p, seat)) {
    if (!safe(p, seat, m) || (p.phase !== "place" && threatened(make(p, m).position, seat))) continue;
    out.push(m);
    if (first) return out;
  }
  if (p.phase === "place" && (p.placed[seat] >= PLACE_LEAST || !out.length)) out.push({ do: "stop" }); // enough are down, or nothing more fits
  return out;
}

const copy = (p) => ({ ...p, cells: p.cells.map((c) => [...c]), pouch: p.pouch.map((x) => [...x]), ...(p.hand ? { hand: p.hand.map((x) => [...x]), placed: [...p.placed], stopped: [...p.stopped] } : {}) });
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
    const step = stepsOf(sizeOf(p)), d = step[m.from].indexOf(m.to), behind = step[m.to][d], st = p.cells[m.to].pop();
    p.cells[behind].push(st);
    loud = true;
    events.push({ kind: "topple", seat: s, from: m.from, to: m.to, behind, stone: topOf(p, m.from), knocked: st, tier: p.cells[behind].length });
  } else if (m.do === "drop") {
    p.pouch[s][m.kind]--;
    p.cells[m.to].push(stoneOf(s, m.kind));
    events.push({ kind: "drop", seat: s, to: m.to, stone: stoneOf(s, m.kind) });
  } else if (m.do === "place") {
    p.hand[s][m.kind]--;
    p.placed[s]++;
    p.cells[m.to].push(stoneOf(s, m.kind));
    events.push({ kind: "place", seat: s, to: m.to, stone: stoneOf(s, m.kind) });
  } else if (m.do === "stop") {
    p.stopped[s] = true;
    events.push({ kind: "stop", seat: s, kept: handLeft(p, s) });
  } else if (m.do === "swap") { // the second player takes the side that has moved; the first plays on with the other
    p.cells = p.cells.map((c) => c.map((st) => (st + 5) % 10));
    p.pouch = [p.pouch[1], p.pouch[0]];
    p.south = 1 - p.south;
    p.swapped = true;
    events.push({ kind: "swap", seat: s });
  }
  p.ply++;
  p.round = ((p.ply - (p.began || 0)) >> 1) + 1;
  p.seat = 1 - s;
  if (p.phase === "place") {
    for (const t of [0, 1]) if (!p.stopped[t] && !handLeft(p, t)) p.stopped[t] = true; // all down: done
    if (p.stopped[0] && p.stopped[1]) { // play begins, the first player to move; what was not placed waits in the pouch
      for (const t of [0, 1]) for (let k = 0; k < 5; k++) p.pouch[t][k] += p.hand[t][k];
      p.phase = "play"; p.seat = 0; p.began = p.ply; p.round = 1; p.quiet = 0;
      delete p.hand; delete p.placed; delete p.stopped;
      events.push({ kind: "begin" });
    } else if (p.stopped[p.seat]) p.seat = 1 - p.seat; // the other places on alone
  } else p.quiet = loud ? 0 : p.quiet + 1;
  p.last = m.do === "swap" || m.do === "stop" ? null : { from: m.from ?? -1, to: m.to, behind: events[0].behind ?? -1 };
  return { position: p, events };
}

/** The count at a turn limit: for each stack a seat tops, its height. */
export const countOf = (p, s) => p.cells.reduce((n, c) => n + (c.length && ownerOf(c[c.length - 1]) === s ? c.length : 0), 0);

function finish(p, winners, why, events) {
  p.over = { winners, why };
  events.push({ kind: "end", winners, why });
}
/** The rules a style stands for: Traditional and Capo are fixed but for Traditional's opening; Custom takes every switch. */
export function ruleOf(o) {
  if (o.style === "ours") return { size: 3, opening: "set", swap: true, limit: 30, drops: true, topple: true, extra: false };
  if (o.style === "classic") return { size: 4, opening: o.opening, swap: true, limit: 40, drops: true, topple: true, extra: false };
  return { size: o.size, opening: o.opening, swap: o.swap, limit: o.limit, drops: o.drops, topple: true, extra: o.extra };
}
const small = (rule) => rule.size === 3;
/** A puzzle's start, an open option: { cells: [[cell, ...stones]], pouch: [[5], [5]], seat, south, turns }. */
function puzzleOk(v, size = 3) {
  const n = boardOf(size).size, stone = (x) => Number.isInteger(x) && x >= 0 && x < 10, five = (a) => Array.isArray(a) && a.length === 5 && a.every((x) => Number.isInteger(x) && x >= 0 && x <= 12);
  return !!v && typeof v === "object" && Array.isArray(v.cells) && v.cells.length <= n && v.cells.every((c) => Array.isArray(c) && c.length >= 2 && c.length <= 4 && Number.isInteger(c[0]) && c[0] >= 0 && c[0] < n && c.slice(1).every(stone))
    && new Set(v.cells.map((c) => c[0])).size === v.cells.length && Array.isArray(v.pouch) && v.pouch.length === 2 && v.pouch.every(five) && [0, 1].includes(v.seat) && [0, 1].includes(v.south) && Number.isInteger(v.turns) && v.turns >= 1 && v.turns <= 9
    && [0, 1].every((s) => v.cells.filter((c) => c.slice(1).includes(stoneOf(s, LODE))).length === 1);
}

export const stacking = {
  id: "stacking",
  version: "3",
  options: {
    style: { values: ["classic", "ours", "custom"], normal: "classic" }, // Traditional, Capo (the quick small set), Custom
    seats: { values: [2], normal: 2 },
    size: { values: [4, 3], normal: 4 }, // Custom: the board's radius, 61 or 37 cells
    opening: { values: ["set", "free"], normal: "set" }, // Traditional and Custom: a set layout, or free placement
    layout: { values: ["drawn", 0, 1, 2], normal: "drawn" }, // a set opening, drawn from the seed or chosen
    swap: { values: [true, false], normal: true }, // Custom: after the first move the second player may take that side
    limit: { values: [0, 20, 30, 40], normal: 0 }, // Custom: after this many turns each, the higher count of tiers topped wins
    drops: { values: [true, false], normal: true }, // Custom: pouch stones may be dropped
    extra: { values: [false, true], normal: false }, // Custom: the second player starts with a Pebble in the pouch
    puzzle: { check: (v) => v === null || puzzleOk(v), normal: null }, // a puzzle's start on the small board: the solver must trap within `turns`
  },
  setup(o, dice) {
    const rule = o.puzzle ? { size: 3, opening: "set", swap: false, limit: 0, drops: true, topple: true, extra: false } : ruleOf(o);
    const b = boardOf(rule.size), cells = b.cells.map(() => []), sets = small(rule) ? LAYOUTS_SMALL : LAYOUTS, count = small(rule) ? SMALL : COUNT;
    const p = { seats: 2, seat: 0, south: 0, size: rule.size, cells, pouch: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]], ply: 0, round: 1, quiet: 0, began: 0, layout: -1, phase: "play", swapped: false, rule, last: null, over: null };
    if (o.puzzle) {
      for (const [i, ...stones] of o.puzzle.cells) cells[i].push(...stones);
      Object.assign(p, { pouch: o.puzzle.pouch.map((x) => [...x]), seat: o.puzzle.seat, south: o.puzzle.south, goal: { seat: o.puzzle.seat, turns: o.puzzle.turns } });
      return p;
    }
    if (rule.opening === "free") Object.assign(p, { phase: "place", hand: [[...count], [...count]], placed: [0, 0], stopped: [false, false] });
    else {
      p.layout = o.layout === "drawn" ? dice.below(sets.length) : o.layout;
      for (const [kind, q, r] of sets[p.layout].stones) { cells[cellAt(q, r, rule.size)].push(stoneOf(0, kind)); cells[cellAt(-q, -r, rule.size)].push(stoneOf(1, kind)); }
    }
    if (rule.extra) p.pouch[1][PEBBLE]++;
    return p;
  },
  turn: (p) => (p.over ? null : p.seat),
  moves: (p) => legalOf(p),
  apply(before, m) {
    const { position: p, events } = make(before, m);
    if (p.phase === "place") return { position: p, events };
    if (threatened(p, p.seat)) events.push({ kind: "threat", seat: p.seat });
    const played = p.ply - p.began;
    if (!hasMove(p)) finish(p, [1 - p.seat], threatened(p, p.seat) ? "the rival Lodestone is trapped" : "the rival has no legal move", events);
    else if (p.goal && p.seat === p.goal.seat && played >= p.goal.turns * 2) finish(p, [1 - p.goal.seat], `the Lodestone was not trapped within ${p.goal.turns} turn${p.goal.turns > 1 ? "s" : ""}`, events);
    else if (p.quiet >= QUIET) finish(p, [0, 1], `${QUIET / 2} turns each passed without a strike or a topple`, events);
    else if (p.rule.limit && played >= p.rule.limit * 2) {
      const a = countOf(p, 0) + firstOf(p), b = countOf(p, 1), held = stonesOf(p, 0) - stonesOf(p, 1), lead = a - b || held;
      finish(p, lead ? [lead > 0 ? 0 : 1] : [0, 1], `after ${p.rule.limit} turns each, tiers topped ${a} to ${b} with the first player's ${firstOf(p)}${a === b ? held ? ", and more stones held" : ", and stones held level" : ""}`, events);
    } else if (played >= LONGEST) finish(p, [0, 1], `the game reached its longest, ${LONGEST / 2} turns each`, events);
    return { position: p, events };
  },
  result: (p) => p.over,
};

/** Stones a seat holds: on the board, in its pouch and still in hand. */
export const stonesOf = (p, s) => p.cells.reduce((n, c) => n + c.filter((st) => ownerOf(st) === s).length, 0) + p.pouch[s].reduce((a, b) => a + b, 0) + (p.hand ? handLeft(p, s) : 0);
/** Stones a side starts with. */
export const setOf = (p) => (sizeOf(p) === 3 ? SMALL : COUNT).reduce((a, b) => a + b, 0);
/** Stacks of two or more, as cell numbers. */
export const towersOf = (p) => p.cells.flatMap((c, i) => (c.length > 1 ? [i] : []));
