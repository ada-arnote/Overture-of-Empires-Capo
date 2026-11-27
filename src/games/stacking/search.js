// SPDX-License-Identifier: AGPL-3.0-or-later
// The stacking game's search: its own flat position (three tiers a cell in one typed array) with make and unmake, the
// same moves as rules.js (the tests compare them on many positions), and an alpha-beta search held to a count of
// positions looked at, never to time, so the same position and seed give the same move on any device, in a worker or not.
// Whole numbers only. A move here is a number: kind of move (3 bits), from, to, and a stone kind or a direction.
import { FIRST, FORWARD, LODE, LONGEST, QUIET, WARDEN, COURIER, SLINGER, PEBBLE, stepsOf } from "./rules.js";

export const MOVE = 0, STRIKE = 1, SLING = 2, TOPPLE = 3, DROP = 4, SWAP = 5;
const code = (t, from, to, x = 0) => t | (from << 3) | (to << 10) | (x << 17);
const typeOf = (m) => m & 7, fromOf = (m) => (m >> 3) & 127, toOf = (m) => (m >> 10) & 127, xOf = (m) => (m >> 17) & 7;
export const WIN = 1000000;
/** A stone on the board is worth this much, by kind; height and place add to it. */
export const WORTH = [0, 30, 44, 40, 14];
const BUSY = 2400; // more steps a search may go below its root than this, and it stops going deeper

/** A small seeded stream, for the hash keys and for ties. */
function stream(seed) {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (t ^ (t >>> 14)) >>> 0; };
}
const KEYS = new Map();
function keysOf(n) {
  if (KEYS.has(n)) return KEYS.get(n);
  const r = stream(0x51ac), k = { stone: Uint32Array.from({ length: n * 30 }, r), pouch: Uint32Array.from({ length: 10 * 16 }, r), seat: r(), south: r() };
  KEYS.set(n, k);
  return k;
}
const near2 = new Map();
/** For each cell, the cells one or two steps away. */
function ringsOf(size) {
  if (near2.has(size)) return near2.get(size);
  const step = stepsOf(size), out = step.map((_, i) => { const s = new Set(); for (const a of step[i]) if (a >= 0) { s.add(a); for (const b of step[a]) if (b >= 0 && b !== i) s.add(b); } return Int16Array.from(s); });
  near2.set(size, out);
  return out;
}

/** The flat position, from a position of rules.js (in play, not in free placement). */
export function flat(p) {
  const size = p.size || 4, steps = stepsOf(size), n = steps.length, f = {
    n, size, step: Int16Array.from(steps.flat()), st: new Int8Array(n * 3).fill(-1), h: new Int8Array(n), pouch: new Int8Array(10), rows: Int8Array.from(steps.map((_, i) => rowAt(size, i))),
    seat: p.seat, south: p.south, ply: p.ply, began: p.began || 0, quiet: p.quiet, swapped: p.swapped ? 1 : 0, lode: [-1, -1], hash: 0,
    swap: !!p.rule.swap, drops: p.rule.drops !== false, topple: p.rule.topple !== false, limit: p.rule.limit || 0, goal: p.goal ? [p.goal.seat, p.goal.turns] : null,
    keys: keysOf(n), rings: ringsOf(size), undo: [], forward: 0,
  };
  p.cells.forEach((c, i) => c.forEach((st) => push(f, i, st)));
  for (let k = 0; k < 10; k++) { f.pouch[k] = p.pouch[k >= 5 ? 1 : 0][k % 5]; f.hash ^= f.keys.pouch[k * 16 + f.pouch[k]]; }
  if (f.seat) f.hash ^= f.keys.seat;
  if (f.south) f.hash ^= f.keys.south;
  return f;
}
const ROWS = new Map();
function rowAt(size, i) {
  if (!ROWS.has(size)) { const cells = []; for (let q = -size; q <= size; q++) for (let r = Math.max(-size, -q - size); r <= Math.min(size, -q + size); r++) cells.push(r); ROWS.set(size, cells); }
  return ROWS.get(size)[i];
}
function push(f, i, v) {
  const k = i * 3 + f.h[i];
  f.st[k] = v; f.h[i]++;
  f.hash ^= f.keys.stone[k * 10 + v];
  if (v % 5 === LODE) f.lode[v >= 5 ? 1 : 0] = i;
}
function pop(f, i) {
  f.h[i]--;
  const k = i * 3 + f.h[i], v = f.st[k];
  f.st[k] = -1;
  f.hash ^= f.keys.stone[k * 10 + v];
  return v;
}
function pouchAdd(f, k, d) { f.hash ^= f.keys.pouch[k * 16 + f.pouch[k]]; f.pouch[k] += d; f.hash ^= f.keys.pouch[k * 16 + f.pouch[k]]; }
const top = (f, i) => f.st[i * 3 + f.h[i] - 1];
const own = (v) => (v >= 5 ? 1 : 0);
const fwd = (f, s) => (s === f.south ? FORWARD.south : FORWARD.north);

function canLand(f, j, tier, kind) {
  const H = f.h[j];
  if (!H) return true;
  const k = top(f, j) % 5;
  if (k === LODE || k === WARDEN || kind === WARDEN) return false;
  return H + 1 <= 3 && H <= tier && (kind !== LODE || H + 1 <= 2);
}
function canStrike(f, j, tier, kind, s) {
  const H = f.h[j];
  if (!H || own(top(f, j)) === s || H > tier + 1) return false;
  if (kind === LODE) return H <= 2;
  if (kind === WARDEN) return H === 1;
  return true;
}
/** Can seat `by` strike the top stone of cell `at`? Looks outward from the cell: the first stone each way. */
export function attacked(f, at, by) {
  const H = f.h[at], step = f.step;
  if (!H) return false;
  for (let d = 0; d < 6; d++) {
    let j = at;
    for (let k = 1; k <= 4; k++) {
      j = step[j * 6 + d];
      if (j < 0) break;
      const t = f.h[j];
      if (!t) continue;
      const v = top(f, j);
      if (own(v) === by && H <= t + 1) {
        const kind = v % 5;
        if (kind === COURIER || kind === SLINGER) { if (k <= t + 1) return true; }
        else if (k === 1) {
          if (kind === PEBBLE) { const back = (d + 3) % 6, w = fwd(f, by); if (w[0] === back || w[1] === back) return true; }
          else if (kind === LODE) { if (H <= 2) return true; }
          else if (H === 1) return true; // a Warden
        }
      }
      break;
    }
  }
  return false;
}
export const inDanger = (f, s) => f.lode[s] >= 0 && attacked(f, f.lode[s], 1 - s);

/** Every move of the seat to move before the Lodestone rule, into `out` from `n`; returns the new length. `loud` only strikes and slings. */
export function moves(f, out, n = 0, loud = false) {
  const s = f.seat, step = f.step, N = f.n;
  for (let i = 0; i < N; i++) {
    const H = f.h[i];
    if (!H) continue;
    const v = top(f, i);
    if (own(v) !== s) continue;
    const kind = v % 5;
    if (kind === COURIER || kind === SLINGER) {
      for (let d = 0; d < 6; d++) {
        let j = i;
        for (let k = 0; k <= H; k++) {
          j = step[j * 6 + d];
          if (j < 0) break;
          const there = f.h[j];
          if (kind === COURIER) {
            if (!loud && canLand(f, j, H, kind)) out[n++] = code(MOVE, i, j);
            if (there && top(f, j) % 5 !== LODE && canStrike(f, j, H, kind, s)) out[n++] = code(STRIKE, i, j);
            if (there) break;
            continue;
          }
          if (k === 0 && !loud && canLand(f, j, H, kind)) out[n++] = code(MOVE, i, j);
          if (there) { if (top(f, j) % 5 !== LODE && canStrike(f, j, H, kind, s)) out[n++] = code(SLING, i, j); break; }
        }
      }
    } else {
      const dirs = kind === PEBBLE ? fwd(f, s) : null;
      for (let e = 0; e < (dirs ? 2 : 6); e++) {
        const d = dirs ? dirs[e] : e, j = step[i * 6 + d];
        if (j < 0) continue;
        if (!loud && canLand(f, j, H, kind)) out[n++] = code(MOVE, i, j);
        if (f.h[j] && top(f, j) % 5 !== LODE && canStrike(f, j, H, kind, s)) out[n++] = code(STRIKE, i, j);
      }
    }
    if (loud || !f.topple) continue;
    for (let d = 0; d < 6; d++) {
      const j = step[i * 6 + d];
      if (j < 0 || !f.h[j]) continue;
      const t = top(f, j);
      if (own(t) === s || t % 5 === WARDEN || f.h[j] > H) continue;
      const b = step[j * 6 + d];
      if (b >= 0 && canLand(f, b, 3, t % 5 === LODE ? LODE : PEBBLE)) out[n++] = code(TOPPLE, i, j, d);
    }
  }
  if (loud) return n;
  const base = s * 5;
  if (f.drops && (f.pouch[base + 1] | f.pouch[base + 2] | f.pouch[base + 3] | f.pouch[base + 4])) {
    const rival = f.lode[1 - s];
    for (let j = 0; j < N; j++) {
      if (f.h[j]) continue;
      let mine = false, near = false;
      for (let d = 0; d < 6; d++) { const m = step[j * 6 + d]; if (m < 0) continue; if (m === rival) near = true; if (f.h[m] && own(top(f, m)) === s) mine = true; }
      if (!mine || near) continue;
      for (let k = 1; k < 5; k++) if (f.pouch[base + k] > 0) out[n++] = code(DROP, 0, j, k);
    }
  }
  if (f.ply === f.began + 1 && f.swap && !f.swapped) out[n++] = code(SWAP, 0, 0);
  return n;
}

/** Make a move; unmake takes the last one back. */
export function make(f, m) {
  const t = typeOf(m), from = fromOf(m), to = toOf(m), x = xOf(m), s = f.seat;
  const rec = [m, f.quiet, f.lode[0], f.lode[1], -1];
  let loud = false;
  if (t === MOVE) push(f, to, pop(f, from));
  else if (t === STRIKE) { const v = pop(f, from), struck = pop(f, to); push(f, to, v); pouchAdd(f, s * 5 + (struck % 5), 1); rec[4] = struck; loud = true; }
  else if (t === SLING) { const struck = pop(f, to); pouchAdd(f, s * 5 + (struck % 5), 1); rec[4] = struck; loud = true; }
  else if (t === TOPPLE) { const v = pop(f, to); push(f, f.step[to * 6 + x], v); rec[4] = v; loud = true; }
  else if (t === DROP) { pouchAdd(f, s * 5 + x, -1); push(f, to, s * 5 + x); }
  else swapSides(f);
  f.quiet = loud ? 0 : f.quiet + 1;
  f.ply++;
  f.seat = 1 - s;
  f.hash ^= f.keys.seat;
  f.undo.push(rec);
}
function swapSides(f) {
  for (let i = 0; i < f.n * 3; i++) if (f.st[i] >= 0) { f.hash ^= f.keys.stone[i * 10 + f.st[i]]; f.st[i] = (f.st[i] + 5) % 10; f.hash ^= f.keys.stone[i * 10 + f.st[i]]; }
  for (let k = 0; k < 5; k++) { const a = f.pouch[k], b = f.pouch[k + 5]; pouchAdd(f, k, b - a); pouchAdd(f, k + 5, a - b); }
  f.south = 1 - f.south; f.hash ^= f.keys.south;
  f.swapped ^= 1;
  f.lode = [f.lode[1], f.lode[0]];
}
export function unmake(f) {
  const [m, quiet, l0, l1, extra] = f.undo.pop(), t = typeOf(m), from = fromOf(m), to = toOf(m), x = xOf(m);
  f.seat = 1 - f.seat; f.hash ^= f.keys.seat;
  f.ply--; f.quiet = quiet;
  const s = f.seat;
  if (t === MOVE) push(f, from, pop(f, to));
  else if (t === STRIKE) { const v = pop(f, to); push(f, to, extra); push(f, from, v); pouchAdd(f, s * 5 + (extra % 5), -1); }
  else if (t === SLING) { push(f, to, extra); pouchAdd(f, s * 5 + (extra % 5), -1); }
  else if (t === TOPPLE) push(f, to, pop(f, f.step[to * 6 + x]));
  else if (t === DROP) { pop(f, to); pouchAdd(f, s * 5 + x, 1); }
  else swapSides(f);
  f.lode[0] = l0; f.lode[1] = l1;
}
/** The legal moves of the seat to move: its own Lodestone is safe after each. */
export function legal(f) {
  const buf = new Int32Array(512), n = moves(f, buf), out = [], s = f.seat;
  for (let k = 0; k < n; k++) { make(f, buf[k]); if (!inDanger(f, s)) out.push(buf[k]); unmake(f); }
  return out;
}
/** A move as rules.js writes it. */
export function moveOf(f, m) {
  const t = typeOf(m), from = fromOf(m), to = toOf(m), x = xOf(m);
  if (t === MOVE) return { do: "move", from, to };
  if (t === STRIKE) return { do: "strike", from, to };
  if (t === SLING) return { do: "sling", from, to };
  if (t === TOPPLE) return { do: "topple", from, to };
  if (t === DROP) return { do: "drop", kind: x, to };
  return { do: "swap" };
}

/** How the board stands for the seat to move. */
export function evaluate(f) {
  const s = f.seat, N = f.n, size = f.size;
  let v = 0;
  for (let i = 0; i < N; i++) {
    const H = f.h[i];
    for (let k = 0; k < H; k++) {
      const st = f.st[i * 3 + k], kind = st % 5, mine = own(st) === s ? 1 : -1, last = k === H - 1;
      let w = WORTH[kind] - (last ? 0 : 7);
      if (last && kind !== LODE) w += 5 * k; // height is reach
      if (kind === PEBBLE) { const r = f.rows[i]; w += Math.max(0, own(st) === f.south ? size - 2 - r : r + size - 2) * 2; }
      v += mine * w;
    }
  }
  for (let k = 1; k < 5; k++) v += (f.pouch[s * 5 + k] - f.pouch[(1 - s) * 5 + k]) * ((WORTH[k] * 4) / 5 | 0);
  for (let t = 0; t < 2; t++) v += (t === s ? 1 : -1) * guard(f, t);
  if (f.limit) { // the count at the limit: tiers topped, worth more as it nears
    const left = f.limit * 2 - (f.ply - f.began);
    let c = s === 0 ? FIRST[f.size] : -FIRST[f.size];
    for (let i = 0; i < N; i++) if (f.h[i]) c += (own(top(f, i)) === s ? 1 : -1) * f.h[i];
    v += c * (left < 12 ? 24 : left < 30 ? 10 : 4);
  }
  return v;
}
/** The weights of a Lodestone's safety: a rival stone beside it and close by (and per tier), room to step, no room, one way out, open now. */
export const TUNE = { beside: 6, close: 4, tall: 2, room: 6, shut: 30, one: 12, open: 40 };
/** A Lodestone's safety, for its own seat: room to step to, friends beside it, rival stones close by, and whether it is open now. */
function guard(f, t) {
  const at = f.lode[t];
  if (at < 0) return 0;
  const step = f.step, tier = f.h[at];
  let v = 0, room = 0;
  for (let d = 0; d < 6; d++) {
    const m = step[at * 6 + d];
    if (m < 0) { v -= 3; continue; } // the edge hems it in
    if (!f.h[m]) { v += 2; if (!attacked0(f, m, 1 - t, at)) room++; continue; }
    const x = top(f, m);
    v += own(x) === t ? 3 : -TUNE.beside;
    if (own(x) !== t && f.h[m] <= tier + 1 && (f.h[m] <= 2) && x % 5 !== LODE) room++; // it could strike its way out
  }
  for (const m of f.rings[at]) if (f.h[m] && own(top(f, m)) !== t) v -= TUNE.close + TUNE.tall * f.h[m]; // rival stones close in
  v += room * TUNE.room - (room === 0 ? TUNE.shut : room === 1 ? TUNE.one : 0);
  if (attacked(f, at, 1 - t)) v -= TUNE.open;
  return v;
}
/** Would seat `by` strike an empty cell if the Lodestone of the other seat stood there (stepping from `from`)? */
function attacked0(f, m, by, from) {
  const k = m * 3;
  f.st[k] = (1 - by) * 5; f.h[m] = 1;
  const lift = f.h[from], hidden = f.st[from * 3 + lift - 1]; // the Lodestone leaves its cell, which may open a line
  f.h[from] = lift - 1; f.st[from * 3 + lift - 1] = -1;
  const hit = attacked(f, m, by);
  f.h[from] = lift; f.st[from * 3 + lift - 1] = hidden;
  f.st[k] = -1; f.h[m] = 0;
  return hit;
}

/** Has the game ended here? Its score for the seat to move, or null. */
function ended(f) {
  const played = f.ply - f.began;
  if (f.goal && f.seat === f.goal[0] && played >= f.goal[1] * 2) return -WIN + 500;
  if (f.quiet >= QUIET) return 0;
  if (f.limit && played >= f.limit * 2) {
    let c = f.seat === 0 ? FIRST[f.size] : -FIRST[f.size], held = 0; // the first player's addition; a tie goes to the side holding more stones
    for (let i = 0; i < f.n; i++) { if (f.h[i]) c += (own(top(f, i)) === f.seat ? 1 : -1) * f.h[i]; for (let k = 0; k < f.h[i]; k++) held += own(f.st[i * 3 + k]) === f.seat ? 1 : -1; }
    for (let k = 0; k < 5; k++) held += f.pouch[f.seat * 5 + k] - f.pouch[(1 - f.seat) * 5 + k];
    const lead = c || held;
    return lead > 0 ? WIN - 500 : lead < 0 ? -WIN + 500 : 0;
  }
  if (played >= LONGEST) return 0;
  return null;
}

/**
 * Search the flat position. o: { budget (positions to look at), depth (deepest, plies), table (keep seen positions),
 * noise (added to each root move's score, for the easy steps), seed }. Returns { move, score, depth, nodes, rank }.
 * A generator: it pauses after each move at the root, so a page without a worker can draw between them.
 */
export function* thinking(f, o = {}) {
  const budget = o.budget ?? 4000, most = o.depth ?? 64, rnd = stream((o.seed ?? 1) >>> 0), size = 1 << 16;
  const tKey = o.table ? new Uint32Array(size) : null, tData = o.table ? new Int32Array(size * 3) : null;
  const bufs = Array.from({ length: 96 }, () => new Int32Array(512)), killers = new Int32Array(96 * 2).fill(-1);
  let nodes = 0, out = false;
  const kindAt = (i) => (f.h[i] ? top(f, i) % 5 : -1);
  /** Strikes first, the best stone taken by the least; then topples, the remembered move, the killers, and the rest. */
  function order(buf, n, ply, hint) {
    const score = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      const m = buf[k], t = typeOf(m);
      let v = 0;
      if (m === hint) v = 1e6;
      else if (t === STRIKE || t === SLING) v = 1e5 + WORTH[kindAt(toOf(m))] * 16 - WORTH[kindAt(fromOf(m))];
      else if (t === TOPPLE) v = 9e4;
      else if (m === killers[ply * 2] || m === killers[ply * 2 + 1]) v = 8e4;
      else if (t === DROP) v = 100 + xOf(m);
      else if (t === MOVE && f.h[toOf(m)]) v = 300; // a climb
      score[k] = v;
    }
    for (let a = 1; a < n; a++) { const m = buf[a], v = score[a]; let b = a - 1; while (b >= 0 && score[b] < v) { buf[b + 1] = buf[b]; score[b + 1] = score[b]; b--; } buf[b + 1] = m; score[b + 1] = v; }
  }
  function quiet(alpha, beta, ply, q) {
    const stand = evaluate(f);
    if (stand >= beta || q >= 4 || ply >= 90) return stand;
    if (stand > alpha) alpha = stand;
    const buf = bufs[ply], n = moves(f, buf, 0, true), s = f.seat;
    let best = stand;
    order(buf, n, ply, -1);
    for (let k = 0; k < n; k++) {
      make(f, buf[k]);
      if (inDanger(f, s)) { unmake(f); continue; }
      nodes++;
      const v = -quiet(-beta, -alpha, ply + 1, q + 1);
      unmake(f);
      if (v > best) best = v;
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return best;
  }
  function search(depth, alpha, beta, ply, ext) {
    if (nodes >= budget) { out = true; return 0; }
    const done = ended(f);
    if (done !== null) return done;
    if (depth <= 0 || ply >= 80) return quiet(alpha, beta, ply, 0);
    const slot = tKey ? f.hash & (size - 1) : 0;
    let hint = -1;
    if (tKey && tKey[slot] === (f.hash ^ (f.quiet << 20)) >>> 0) {
      const d = tData[slot * 3], v = tData[slot * 3 + 1], flag = d & 3;
      hint = tData[slot * 3 + 2];
      if (d >> 2 >= depth && Math.abs(v) < WIN - 2000) { if (flag === 0 || (flag === 1 && v >= beta) || (flag === 2 && v <= alpha)) return v; }
    }
    const buf = bufs[ply], n = moves(f, buf), s = f.seat, a0 = alpha;
    order(buf, n, ply, hint);
    let best = -WIN * 2, bestMove = -1, count = 0;
    const held = o.reduce && inDanger(f, s); // no shortcuts while our own Lodestone is open
    for (let k = 0; k < n; k++) {
      const m = buf[k];
      make(f, m);
      if (inDanger(f, s)) { unmake(f); continue; }
      count++; nodes++;
      const check = ext < 3 && inDanger(f, 1 - s) ? 1 : 0; // a move that opens the rival Lodestone is looked at one step deeper
      let v;
      if (o.reduce && count > 1) { // the strongest step: later moves first with a narrow window, quiet late ones a step or two shallower, again in full if they surprise
        const t = typeOf(m), cut = !held && !check && depth >= 3 && count > 3 && (t === MOVE || t === DROP) && m !== killers[ply * 2] && m !== killers[ply * 2 + 1] ? (count > 10 ? 2 : 1) : 0;
        v = -search(depth - 1 + check - cut, -alpha - 1, -alpha, ply + 1, ext + check);
        if (!out && v > alpha && (cut || v < beta)) v = -search(depth - 1 + check, -beta, -alpha, ply + 1, ext + check);
      } else v = -search(depth - 1 + check, -beta, -alpha, ply + 1, ext + check);
      unmake(f);
      if (out) return 0;
      if (v > best) { best = v; bestMove = m; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) { if (typeOf(m) === MOVE || typeOf(m) === DROP) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; } break; }
    }
    if (!count) return -WIN + ply; // no legal move: lost, and sooner is worse
    if (tKey) { tKey[slot] = (f.hash ^ (f.quiet << 20)) >>> 0; tData[slot * 3] = (depth << 2) | (best <= a0 ? 2 : best >= beta ? 1 : 0); tData[slot * 3 + 1] = best; tData[slot * 3 + 2] = bestMove; }
    return best;
  }
  // the root: every legal move, in a seeded order so equal moves vary from game to game
  const all = legal(f);
  if (!all.length) return { move: -1, score: -WIN, depth: 0, nodes: 0, line: [] };
  for (let k = all.length - 1; k > 0; k--) { const j = rnd() % (k + 1); [all[k], all[j]] = [all[j], all[k]]; }
  const noise = all.map(() => (o.noise ? rnd() % (o.noise + 1) : 0));
  let rank = all.map((m, k) => ({ m, v: 0, k })), best = rank[0], reached = 0;
  for (let depth = 1; depth <= most && depth <= 64; depth++) {
    let alpha = -WIN * 2;
    const done = [];
    const prev = depth > 1 ? rank : null;
    if (depth === 1) { const b = new Int32Array(all), n = all.length; order(b, n, 0, -1); rank = Array.from(b.subarray(0, n), (m) => rank.find((r) => r.m === m)); }
    for (const r of rank) {
      make(f, r.m);
      nodes++;
      const check = inDanger(f, f.seat) ? 1 : 0;
      const v = -search(depth - 1 + check, -WIN * 2, o.noise ? WIN * 2 : -alpha, 1, check);
      unmake(f);
      if (out) break;
      r.v = (done.length && !o.noise && v <= alpha ? Math.min(v, alpha - 1) : v) + noise[r.k]; // a move no better than the best so far is known only to be no better
      done.push(r);
      if (r.v > alpha) alpha = r.v;
      yield;
    }
    if (out) { // a part-searched depth: a move that beat the last best at this depth is taken
      const top1 = done.reduce((a, r) => (r.v > a.v ? r : a), done[0]);
      if (prev && top1 && top1 !== done[0]) best = top1;
      break;
    }
    rank = done.sort((a, b) => b.v - a.v || a.k - b.k);
    best = rank[0];
    reached = depth;
    if (Math.abs(best.v) >= WIN - 2000 || nodes >= budget) break;
    if (nodes * 4 > budget * 3) break; // the next depth would not finish
  }
  return { move: best.m, score: best.v, depth: reached, nodes, rank: rank.map((r) => [r.m, r.v]) };
}
export function think(f, o) {
  const t = thinking(f, o);
  for (;;) { const s = t.next(); if (s.done) return s.value; }
}
