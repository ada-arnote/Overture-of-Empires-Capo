// SPDX-License-Identifier: AGPL-3.0-or-later
// An Inch of Ink in real time: the genre as it is played in a browser. Many nations, one pool of strength each,
// borders that creep, and a share of your strength sent with every attack. Time passes in ticks of half a second,
// so a game is still a list of moves and replays the same anywhere.
// Traditional is our own form of it: each nation an ink with one rule, places dealt by the seed, three ages with a mark
// and a card, a goal that eases late, and encircled land that soaks through ring by ring.
// Capo is "The Ink Dries": the short plain game. Wells only, no inks or marks; a capital whose cut-off land fades, and a page
// that dries from its edges inward until someone holds most of what is still wet.
import { CELLS, COLS, ROWS } from "../maps/world.js";

export const NONE = -1, PCTS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], TICK_MS = 500;
export const LIVE_MAPS = ["world", "continents", "islands"];
const START = 30, GOAL = 80, RANGE = 9, DEAL = 12, SPREAD = 14, EVEN = 12;
/** The ages start at these ticks, by map, each set at a share of how long its games run (the world's longest, continents' shortest),
 *  so that nearly every game sees Age II and the longer ones Age III. The world's Age III comes at 4:00 (version 12; it was 5:00),
 *  so a newcomer's Gentle game, won in a median of about four minutes, reaches it. In the last the goal eases a point every EASE ticks down to LOW.
 *  SAFE: the safety end, 30 minutes. WIND: how long Second wind lasts. */
export const AGE_AT = { world: [0, 240, 480], continents: [0, 150, 300], islands: [0, 180, 420] }, EASE = 60, LOW = 66, SAFE = 3600, WIND = 120;
export const agesOf = (p) => AGE_AT[p.map] || AGE_AT.world;
/** The Ink Dries. nations: how many; from: the tick the page starts to dry; span: ticks to dry it all, though a tenth (core) stays wet;
 *  goal: the share of the wet land that wins; fade: ticks before land cut off from its capital fades; wall: what the capital and its ring cost, times. */
export const DRIES = { nations: 12, from: 120, span: 600, core: 10, goal: 65, fade: 20, wall: 3 };
/** How hard the bots play. grow: their growth in tenths of yours; every: they act on one tick in this many; dare and bold: how much
 *  stronger (in tenths) a calm or a fierce bot must be to attack; you: how strong you look to them, in tenths; truce: ticks before
 *  they attack you; pile: how many of them attack you at once, at most; spare: whether a full bot leaves you alone unless you are worth attacking.
 *  Tuned in version 11 with tools/inchtiers.mjs: a newcomer wins Gentle most games in about four minutes, Normal is a fight, and
 *  Hard opens with a 20-second truce and is won by a careful player about one game in ten. */
export const RIVALS = {
  gentle: { grow: 8, every: 5, dare: 16, bold: 10, you: 15, truce: 240, pile: 1, spare: false },
  even: { grow: 8, every: 5, dare: 13, bold: 8, you: 12, truce: 60, pile: 2, spare: false },
  hard: { grow: 9, every: 5, dare: 13, bold: 8, you: 10, truce: 40, pile: 3, spare: false },
};
/** A truce you offer a neighbour (version 11). long: ticks it holds; gap: ticks after it ends before you can offer another;
 *  most: a neighbour holding more than this many times your strength will not take one. One at a time, kept by the rules. */
export const PACT = { long: 120, gap: 120, most: 2 };
/** Two people in one game (the open option `people`, played live between two browsers): seats 0 and 1 are people, the rest bots.
 *  A game for one has no `people`, and every rule below reads exactly as it did for it. */
export const person = (p, s) => s === p.human || (!!p.people && p.people.includes(s));
export const peopleOf = (p) => p.people || [p.human];
/** A person's truce, { to, until, next }, or null: yours in a game for one, each person's own in a game for two. */
export const pactIn = (p, h = p.human) => (p.pacts ? p.pacts[p.people.indexOf(h)] ?? null : h === p.human ? p.pact : null);
const setPact = (p, h, x) => { if (p.pacts) { p.pacts = [...p.pacts]; p.pacts[p.people.indexOf(h)] = x; } else p.pact = x; };
/** The neighbour a person (you, normally) keeps a truce with now, or NONE. */
export const pactOn = (p, h = p.human) => { const x = pactIn(p, h); return x && p.tick < x.until && p.alive[x.to] ? x.to : NONE; };
/** Why you cannot offer `o` a truce now, or "" when you can: "near" (not a living neighbour), "held" (a truce holds), "wait", "strong". */
export function pactWhy(p, b, o) {
  if (p.over || p.phase !== "play" || !p.alive[p.human] || !Number.isInteger(o) || o < 0 || o >= p.troops.length || person(p, o) || !p.alive[o] || !bordersOf(p, b)[p.human].has(o)) return "near";
  if (pactOn(p) !== NONE) return "held";
  const x = pactIn(p);
  if (x && p.tick < x.next) return "wait";
  return p.troops[o] > PACT.most * p.troops[p.human] ? "strong" : "";
}

// ---- the one table of attributes: read by the rules, the bots and the rules sheet. Whole numbers, or [top, bottom] fractions ----
/** Inks. empty: one empty cell in this many costs you 1 less; guard: what your land costs others more; reach: cells more a tick for each attack;
 *  land: a landing's price as a fraction of the cell; sail: sea cells more for boats; top: your limit as a fraction; each: growth per place. */
export const INKS = [
  { id: "lampblack", name: "Lampblack", rgb: [44, 44, 48], empty: 5, line: "Every fifth cell of empty land you take costs 1 less." },
  { id: "irongall", name: "Iron gall", rgb: [86, 98, 118], guard: 1, line: "Your land costs others 1 more to take." },
  { id: "vermilion", name: "Vermilion", rgb: [212, 70, 46], reach: 1, line: "Each of your attacks takes 1 more cell a tick." },
  { id: "indigo", name: "Indigo", rgb: [58, 66, 158], land: [1, 1], sail: 6, top: [11, 10], line: "Landings cost only the cell, not double; your boats reach 6 cells further; your limit is a tenth higher." },
  { id: "sepia", name: "Sepia", rgb: [132, 92, 56], top: [6, 5], line: "Your limit is a fifth higher." },
  { id: "gold", name: "Gold leaf", rgb: [216, 174, 60], each: 1, line: "+1 growth for each place you hold." },
];
/** Places, dealt by the seed, one per `rate` land cells, never within 6 cells of a bot's start. */
export const PLACES = [
  { id: "well", name: "Well", grow: 2, line: "+2 growth while you hold it." },
  { id: "quay", name: "Quay", sail: 3, line: "Your boats reach 3 cells further." },
  { id: "tower", name: "Tower", guard: 3, line: "It and the cells around it cost 3 more to take." },
  { id: "archive", name: "Archive", top: 60, line: "Your limit is 60 higher." },
];
export const PLACE_RATE = { none: 0, few: 240, normal: 120, many: 60 };
/** Age II: a mark for the rest of the game. Age III: a card, played once, when you like. */
export const MARKS = [
  { id: "broad", name: "Broad stroke", reach: 1, line: "Your attacks take 1 more cell a tick." },
  { id: "full", name: "Full pot", top: [5, 4], grow: 1, line: "Your limit is a quarter higher, and +1 growth." },
];
export const CARDS = [
  { id: "flood", name: "Flood", line: "Your next attack counts double." },
  { id: "wind", name: "Second wind", line: "Your growth doubles for 60 seconds." },
];
const PLAIN = {};
export const inkOf = (p, s) => (s >= 0 && p.ink?.[s] >= 0 ? INKS[p.ink[s]] : PLAIN);
export const markOf = (p, s) => (s >= 0 && p.mark?.[s] >= 0 ? MARKS[p.mark[s]] : PLAIN);
/** How many places of a kind (or of any kind, -1) a nation holds. */
export const held = (p, s, kind = -1) => p.places.reduce((n, [at, k]) => n + (p.owner[at] === s && (kind < 0 || k === kind) ? 1 : 0), 0);
export const ageOf = (p) => (!p.ages ? 1 : p.tick >= agesOf(p)[2] ? 3 : p.tick >= agesOf(p)[1] ? 2 : 1);

const NATIONS = ["Aster", "Bryn", "Caldo", "Dorran", "Elm", "Fenn", "Gale", "Harrow", "Isle", "Jarl", "Kest", "Lume", "Morrow", "Nesh", "Orra", "Pell", "Quill", "Rook", "Sable", "Tarn", "Ulm", "Vael", "Wren", "Yarrow", "Zeal", "Arden", "Brisk", "Corve", "Drey", "Ebon", "Fallow", "Grist", "Holm", "Ivo", "Juno", "Kell", "Lorn", "Mire", "Nox", "Oaken", "Pryor", "Rune", "Sorrel", "Thane", "Umber", "Vesk", "Wold", "Ysolde", "Zinn", "Amber"];
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
const made = new Map();

/** Every cell of a grid of COLS by ROWS small hexes, with its neighbours. */
function grid() {
  if (made.has("grid")) return made.get("grid");
  const cells = [], at = new Map();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const q = c - (r - (r & 1)) / 2; at.set(q * 1000 + r, cells.length); cells.push([q, r]); }
  const near = cells.map(([q, r]) => STEPS.map(([a, b]) => at.get((q + a) * 1000 + r + b)).filter((x) => x !== undefined));
  const g = { cells, near, n: cells.length };
  made.set("grid", g);
  return g;
}
/** Steps between two cells. */
export const apart = (b, i, j) => { const dq = b.cells[i][0] - b.cells[j][0], dr = b.cells[i][1] - b.cells[j][1]; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; };

/** The land of a map: the real coast, or land grown from the game's own dice. Hills are scattered the same way. */
export function liveBoard(map, key, chance) {
  const id = `${map}/${map === "world" ? 0 : key}`;
  if (made.has(id)) return made.get(id);
  const g = grid(), land = Array(g.n).fill(0), hill = Array(g.n).fill(0), dice = chance(`inch-live/${id}`);
  if (map === "world") {
    CELLS.forEach((line, r) => { let c = 0, many = ""; for (let i = 0; i < line.length; i++) { const s = line[i]; if (s === "~") { i++; land[r * COLS + c++] = 1; continue; } if (s >= "0" && s <= "9") { many += s; continue; } for (let k = 0; k < (Number(many) || 1); k++) land[r * COLS + c++] = s === "." ? 0 : 1; many = ""; } });
  } else {
    const blobs = map === "islands" ? 16 : 5, want = Math.floor(g.n * (map === "islands" ? 0.3 : 0.42)), inside = (i) => { const r = Math.floor(i / COLS), c = i % COLS; return r > 1 && r < ROWS - 2 && c > 1 && c < COLS - 2; };
    const seeds = Array.from({ length: blobs }, () => { for (;;) { const i = dice.below(g.n); if (inside(i)) return i; } }), size = seeds.map(() => 0), edge = seeds.map((s) => [s]);
    let total = 0;
    while (total < want) {
      const k = dice.below(blobs), list = edge[k];
      if (!list.length) continue;
      const pick = list.splice(dice.below(list.length), 1)[0];
      if (land[pick] || !inside(pick)) continue;
      land[pick] = 1; size[k]++; total++;
      for (const m of g.near[pick]) if (!land[m]) list.push(m);
      if (map === "islands" && size[k] > want / blobs * 1.6) edge[k] = [];
    }
  }
  const dry = land.flatMap((l, i) => (l ? [i] : []));
  for (let t = 0; t < Math.floor(dry.length / 40); t++) { // ranges of hills
    let at = dice.pick(dry);
    for (let s = 0; s < 12; s++) { hill[at] = 1; const next = g.near[at].filter((m) => land[m]); if (!next.length) break; at = dice.pick(next); }
  }
  const b = Object.freeze({ ...g, land, hill, dry, total: dry.length, ...seas(g, land, dry) });
  if (made.size > 12) made.clear();
  made.set(id, b);
  return b;
}

/** How many landmasses a map has, and how far boats must reach so that every one can be reached: at least RANGE sea cells. */
function seas(g, land, dry) {
  const mass = Array(g.n).fill(-1);
  let k = 0;
  for (const i of dry) {
    if (mass[i] >= 0) continue;
    const list = [i];
    mass[i] = k;
    for (let j = 0; j < list.length; j++) for (const m of g.near[list[j]]) if (land[m] && mass[m] < 0) { mass[m] = k; list.push(m); }
    k++;
  }
  // the shortest crossing from each landmass to each other, then the longest crossing a chain joining them all must make
  const gap = Array.from({ length: k }, () => Array(k).fill(g.n));
  for (let c = 0; c < k; c++) {
    const far = new Map(), list = [];
    for (let i = 0; i < g.n; i++) if (mass[i] === c) for (const m of g.near[i]) if (!land[m] && !far.has(m)) { far.set(m, 1); list.push(m); }
    for (let j = 0; j < list.length; j++) {
      const w = list[j], d = far.get(w);
      for (const m of g.near[w]) {
        if (land[m]) { if (mass[m] !== c && d < gap[c][mass[m]]) gap[c][mass[m]] = d; } else if (!far.has(m)) { far.set(m, d + 1); list.push(m); }
      }
    }
  }
  let range = RANGE;
  const joined = new Set([0]);
  while (joined.size < k) { // join the nearest landmass not yet joined, as a tree grows
    let best = g.n, to = -1;
    for (const a of joined) for (let c = 0; c < k; c++) if (!joined.has(c) && gap[a][c] < best) { best = gap[a][c]; to = c; }
    if (to < 0) break;
    joined.add(to);
    range = Math.max(range, best);
  }
  return { masses: k, range };
}

/** Where the page dries: each cell's turn, the land farthest from the middle of all the land first (ties by a fixed scramble);
 *  -1 for sea. A cell is wet while its turn is at least the number dried so far, so with nothing dried this is "is land". */
const ranks = new WeakMap();
export function dryRank(b) {
  if (ranks.has(b)) return ranks.get(b);
  let Q = 0, R = 0, mid = b.dry[0], best = -1;
  for (const i of b.dry) { Q += b.cells[i][0]; R += b.cells[i][1]; }
  for (const i of b.dry) { const c = b.total, dq = b.cells[i][0] * c - Q, dr = b.cells[i][1] * c - R, d = Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr); if (best < 0 || d < best) { best = d; mid = i; } }
  const rank = new Int32Array(b.n).fill(-1), far = b.dry.map((i) => [apart(b, i, mid), (i * 7919) % 104729, i]).sort((x, y) => y[0] - x[0] || x[1] - y[1]);
  far.forEach(([, , i], k) => { rank[i] = k; });
  ranks.set(b, rank);
  return rank;
}
/** How many cells of the page have dried by now. */
export const driedOf = (p) => (!p.dries || p.tick <= DRIES.from ? 0 : Math.min(p.total - Math.floor(p.total / DRIES.core), Math.floor((p.total * (p.tick - DRIES.from)) / DRIES.span)));
/** The land still wet, which is what the goal counts. */
export const wetOf = (p) => p.total - driedOf(p);
/** Whether a cell is wet land now. */
export const wetAt = (p, b, i) => dryRank(b)[i] >= driedOf(p);

// ---- the clock ----
export const landOf = (p, s) => p.land[s];
const cities = (p, s) => p.cities.reduce((n, c) => n + (p.owner[c] === s ? 1 : 0), 0);
const part = (x, f) => (f ? Math.floor((x * f[0]) / f[1]) : x);
/** The most strength a nation can hold: land, cities and archives, then its ink and its mark. */
export const maxOf = (p, s) => part(part(40 + 4 * p.land[s] + 80 * cities(p, s) + PLACES[3].top * held(p, s, 3), inkOf(p, s).top), markOf(p, s).top);
/** Growth each half second: land, saving, cities, wells, gold leaf and Full pot; doubled while Second wind blows. */
export const gainOf = (p, s) => (1 + Math.floor(p.land[s] / 10) + Math.floor(p.troops[s] / 60) + cities(p, s) + PLACES[0].grow * held(p, s, 0) + (inkOf(p, s).each || 0) * held(p, s) + (markOf(p, s).grow || 0)) * (p.wind?.[s] > p.tick ? 2 : 1);
/** What a cell costs `by` to take: more for hills, more where the owner holds much strength on little land, and the owner's guards.
 *  k: how many cells the attack has taken so far; for lampblack one empty cell in every `empty` costs 1 less. */
export function costOf(p, b, i, by, k = 0) {
  const o = p.owner[i], hill = b.hill[i] ? 3 : 0;
  const e = inkOf(p, by).empty;
  if (o === NONE) return 2 + hill - (e && (k + 1) % e === 0 ? 1 : 0);
  let tower = 0;
  for (const [at, k] of p.places) if (k === 2 && p.owner[at] === o && (at === i || b.near[at].includes(i))) { tower = PLACES[2].guard; break; }
  const price = 2 + hill + Math.floor(p.troops[o] / Math.max(1, p.land[o])) + (inkOf(p, o).guard || 0) + tower, c = p.cap ? p.cap[o] : NONE;
  return c >= 0 && (c === i || b.near[c].includes(i)) ? price * DRIES.wall : price;
}
/** The share of the land that wins: 80%, easing a point every 30 seconds of the last age, down to 66%. */
export const goalPercent = (p) => { if (p.dries) return DRIES.goal; const at = agesOf(p)[2]; return p.ease && p.tick > at ? Math.max(LOW, GOAL - Math.floor((p.tick - at) / EASE)) : GOAL; };
export const goalOf = (p) => Math.ceil((wetOf(p) * goalPercent(p)) / 100);

/** Who borders whom: for each nation, the set of owners beside its land (NONE for empty land). */
export function bordersOf(p, b) {
  const out = p.troops.map(() => new Set()), rank = dryRank(b), k = driedOf(p);
  for (let i = 0; i < b.n; i++) {
    const a = p.owner[i];
    if (a === NONE) continue;
    for (const m of b.near[i]) { const o = p.owner[m]; if (o !== a && rank[m] >= k) out[a].add(o); }
  }
  return out;
}

/** Start or strengthen an attack. A Flood held ready doubles it, and marks the attack (fl) as one that cannot be called back. Changes p. */
function send(p, by, to, troops, events) {
  if (troops <= 0) return;
  p.troops[by] -= troops;
  const flood = !!p.armed[by];
  if (flood) { p.armed[by] = 0; troops *= 2; }
  let a = p.attacks.find((x) => x.by === by && x.to === to);
  if (a) a.left += troops; else { p.attacks.push(a = { by, to, left: troops, got: 0 }); if (person(p, to) && events) events.push({ kind: "attacked", by, to }); }
  if (flood) a.fl = 1;
}
/** What calling an attack back costs: a quarter of what is left of it, rounded up. */
export const recallLoss = (left) => Math.ceil(left / 4);
/** Your attack on `to` that can be called back, or undefined: one under way that did not carry a Flood. */
export const recallable = (p, to) => p.attacks.find((a) => a.by === p.human && a.to === to && !a.fl);

export const tier = (p) => RIVALS[p.rivals] || RIVALS.even;

/** Whether a rival holds a place within two cells of a nation's land. */
function placeNear(p, b, s, o) {
  for (const [at] of p.places) if (p.owner[at] === o && b.near[at].some((m) => p.owner[m] === s || b.near[m].some((x) => p.owner[x] === s))) return true;
  return false;
}

/** Whether a bot leaves a person (you) alone just now: during the truce, and while as many others as its tier allows (pile) are attacking them already. */
function spared(p, s, h = p.human) {
  const t = tier(p);
  if (p.tick < t.truce || s === pactOn(p, h)) return true;
  return !!t.pile && !p.attacks.some((a) => a.by === s && a.to === h) && p.attacks.filter((a) => a.to === h).length >= t.pile;
}

/** The bots: each has a temper drawn at the start, and leans the way its ink pulls. They act now and then, never on every tick. */
function think(p, b, dice, borders, events) {
  const t = tier(p);
  for (let s = 0; s < p.troops.length; s++) {
    if (person(p, s) || !p.land[s] || dice.below(t.every)) continue;
    const ink = inkOf(p, s), top = maxOf(p, s), card = p.ages && p.tick >= agesOf(p)[2] && p.card[s] < 0;
    if (card && p.troops[s] * 10 < top * 4) { p.card[s] = 1; p.wind[s] = p.tick + WIND; } // Second wind when low
    const busy = p.attacks.some((a) => a.by === s), full = p.troops[s] * 10 >= top * 7;
    if (busy && !full) continue;
    const near = [...borders[s]], amount = Math.floor((p.troops[s] * (30 + p.temper[s] * 10)) / 100);
    // how strong a rival looks: you may look stronger than you are, and during the truce you are left alone; gold leaf and sepia see a rival with a place near as weaker
    const rivals = near.filter((o) => o !== NONE && !(person(p, o) && spared(p, s, o))), greedy = ink.each || ink.id === "sepia";
    const looks = (o) => { const x = person(p, o) ? Math.floor((p.troops[o] * t.you) / 10) : p.troops[o]; return greedy && p.places.length && placeNear(p, b, s, o) ? Math.floor((x * 9) / 10) : x; };
    if (near.includes(NONE) && (!rivals.length || dice.below(ink.empty ? 6 : 3))) { send(p, s, NONE, amount, events); continue; }
    const weak = rivals.length ? rivals.reduce((x, y) => (looks(y) * Math.max(1, p.land[x]) < looks(x) * Math.max(1, p.land[y]) ? y : x)) : null;
    const edge = (p.temper[s] > 2 ? t.bold : t.dare) - (ink.reach || ink.guard ? 1 : 0); // vermilion and iron gall dare with a tenth less
    if (weak !== null && p.troops[s] * 10 > looks(weak) * edge) {
      if (card && p.card[s] < 0) { p.card[s] = 0; p.armed[s] = 1; } // Flood goes at the weakest neighbour
      send(p, s, weak, amount, events);
      continue;
    }
    // nothing on foot worth taking: once full (indigo sooner), take to the boats, or else push at the weakest anyway
    if (!full && !ink.sail) continue;
    if (p.boats && !near.includes(NONE) && sail(p, b, s, events)) continue;
    if (!full) continue;
    if (weak !== null && !(t.spare && person(p, weak))) send(p, s, weak, amount, events);
  }
}

/** A bot sends half its strength by boat to the nearest coast it can take. Changes p. Returns whether it sailed. */
function sail(p, b, s, events) {
  const troops = Math.floor(p.troops[s] / 2), spare = (h) => tier(p).spare || spared(p, s, h);
  let best = -1, key = 0;
  for (const [at, d] of shores(p, b, s)) {
    if (troops <= landingPrice(p, b, at, s) || (person(p, p.owner[at]) && spare(p.owner[at]))) continue;
    const k = d * b.n + p.order[at]; // the nearest, and among those the game's own order
    if (best < 0 || k < key) { best = at; key = k; }
  }
  if (best < 0) return false;
  land(p, b, s, best, troops, events);
  return true;
}
/** Put troops ashore. A landing costs double (indigo 3/2); what is left goes on attacking. A failed landing loses one cell's price,
 *  and the rest comes home. Changes p. Returns whether it landed. */
function land(p, b, s, at, troops, events) {
  const was = p.owner[at], cost = landingPrice(p, b, at, s);
  if (troops <= cost) { p.troops[s] -= Math.min(troops, costOf(p, b, at, s)); return false; }
  p.troops[s] -= troops;
  if (was !== NONE) { p.land[was]--; p.troops[was] = Math.max(0, p.troops[was] - 1); }
  p.owner[at] = s;
  p.land[s]++;
  const a = p.attacks.find((x) => x.by === s && x.to === was);
  if (a) a.left += troops - cost; else { p.attacks.push({ by: s, to: was, left: troops - cost, got: 0 }); if (person(p, was) && s !== was && events) events.push({ kind: "attacked", by: s, to: was }); }
  return true;
}

/** Encircled land soaks through: a region of one owner, or of empty land, whose every neighbour is one nation's land (no sea,
 *  no edge of the map) passes its outer ring to that nation, one ring a tick. A landing on the ring breaks the circle; your land does not soak during the truce. Changes p. */
function soak(p, b, fell, events) {
  const seen = new Uint8Array(b.n), ring = [], rank = dryRank(b), k = driedOf(p);
  for (const i of b.dry) {
    if (seen[i] || rank[i] < k) continue;
    const o = p.owner[i], list = [i];
    let by = -2;
    seen[i] = 1;
    for (let j = 0; j < list.length; j++) {
      const c = list[j], near = b.near[c];
      if (near.length < 6) by = -3;
      for (const m of near) {
        if (rank[m] < k) { by = -3; continue; }
        const x = p.owner[m];
        if (x === o) { if (!seen[m]) { seen[m] = 1; list.push(m); } } else if (by === -2) by = x; else if (by !== x) by = -3;
      }
    }
    if (by >= 0 && !(person(p, o) && (p.tick < tier(p).truce || by === pactOn(p, o))) && !(person(p, by) && o !== NONE && o === pactOn(p, by))) for (const c of list) if (b.near[c].some((m) => p.owner[m] === by)) ring.push(c, by);
  }
  const closing = new Map(); // who is soaking up a person's land this tick
  for (let k = 0; k < ring.length; k += 2) {
    const c = ring[k], by = ring[k + 1], o = p.owner[c];
    if (person(p, o)) closing.set(by * 1000 + o, [by, o]);
    if (o !== NONE) { p.troops[o] = Math.max(0, p.troops[o] - Math.max(1, Math.floor(p.troops[o] / Math.max(1, p.land[o])))); p.land[o]--; fell.set(o, by); }
    p.owner[c] = by;
    p.land[by]++;
  }
  for (const [by, to] of closing.values()) events.push({ kind: "soaked", by, to });
}

/** The Ink Dries: the cells whose turn came this tick dry out and are lost to whoever held them. Changes p. */
function dry(p, b, events) {
  const now = driedOf(p), was = driedOf({ ...p, tick: p.tick - 1 }), rank = dryRank(b);
  if (now === was) return;
  if (!was) events.push({ kind: "dries" });
  for (const i of b.dry) if (rank[i] >= was && rank[i] < now && p.owner[i] !== NONE) { p.land[p.owner[i]]--; p.owner[i] = NONE; p.fade[i] = 0; }
}
/** The Ink Dries: a nation whose capital is lost (taken or dried) moves it to its largest piece and loses a quarter of its strength.
 *  Land not joined to the capital fades to empty after DRIES.fade ticks, unless both it and the capital's piece touch open water and
 *  boats are on (a boat lane joins them). Changes p. */
function hold(p, b, events) {
  const piece = new Int32Array(b.n).fill(-1), size = [], coast = [], first = [], rank = dryRank(b), k = driedOf(p);
  for (const i of b.dry) {
    const s = p.owner[i];
    if (s === NONE || piece[i] >= 0) continue;
    const n = size.length, list = [i];
    let sea = false;
    piece[i] = n;
    for (let j = 0; j < list.length; j++) for (const m of b.near[list[j]]) { if (rank[m] < k) sea = true; else if (p.owner[m] === s && piece[m] < 0) { piece[m] = n; list.push(m); } }
    size.push(list.length); coast.push(sea); first.push(i);
  }
  for (let s = 0; s < p.troops.length; s++) {
    if (!p.land[s] || (p.cap[s] >= 0 && p.owner[p.cap[s]] === s)) continue;
    let best = -1;
    for (let n = 0; n < size.length; n++) if (p.owner[first[n]] === s && (best < 0 || size[n] > size[best])) best = n;
    p.cap[s] = first[best];
    p.troops[s] -= Math.floor(p.troops[s] / 4);
    events.push({ kind: "capital", seat: s, at: p.cap[s] });
  }
  for (const i of b.dry) {
    const s = p.owner[i];
    if (s === NONE) continue;
    const home = piece[p.cap[s]];
    if (piece[i] === home || (p.boats && coast[piece[i]] && coast[home])) p.fade[i] = 0;
    else if (!p.fade[i]) p.fade[i] = p.tick;
    else if (p.tick - p.fade[i] >= DRIES.fade) { p.owner[i] = NONE; p.land[s]--; p.fade[i] = 0; }
  }
}

/** One tick: growth, the ages, the bots, then every attack pushes its border, then encircled land soaks. Changes p. */
function tick(p, b, dice, events) {
  p.tick++;
  for (let s = 0; s < p.troops.length; s++) {
    if (!p.land[s]) continue;
    const top = maxOf(p, s), g = gainOf(p, s), r = person(p, s) ? 10 : tier(p).grow;
    // a bot's growth is scaled by its tier, spread over the ticks in whole numbers
    const add = r === 10 ? g : Math.floor((g * r * p.tick) / 10) - Math.floor((g * r * (p.tick - 1)) / 10);
    p.troops[s] = p.troops[s] > top ? p.troops[s] - Math.ceil((p.troops[s] - top) / 10) : Math.min(top, p.troops[s] + add);
  }
  const ages = agesOf(p);
  if (p.ages && (p.tick === ages[1] || p.tick === ages[2])) {
    events.push({ kind: "age", age: p.tick === ages[1] ? 2 : 3 });
    // calm bots pick Full pot, fierce ones Broad stroke
    if (p.tick === ages[1]) for (let s = 0; s < p.troops.length; s++) if (!person(p, s) && p.land[s]) p.mark[s] = p.temper[s] < 2 ? 1 : 0;
  }
  const borders = bordersOf(p, b);
  for (const h of peopleOf(p)) { const x = pactIn(p, h); if (x && p.tick === x.until && p.alive[x.to]) events.push({ kind: "pactend", to: x.to, ...(p.people ? { seat: h } : {}) }); }
  think(p, b, dice, borders, events);
  // two nations attacking each other meet first: the smaller force is spent against the larger
  for (const a of p.attacks) {
    const o = a.to === NONE ? null : p.attacks.find((x) => x.by === a.to && x.to === a.by);
    if (o) { const m = Math.min(a.left, o.left); a.left -= m; o.left -= m; }
  }
  p.attacks = p.attacks.filter((a) => a.left > 0);
  // the cells each attack could take now, gathered in one pass over the map
  const front = p.attacks.map(() => []), which = new Map(p.attacks.map((a, k) => [a.by * 1000 + (a.to + 1), k])), rank = dryRank(b), dried = driedOf(p);
  for (let i = 0; i < b.n; i++) {
    const a = p.owner[i];
    if (a === NONE || !b.land[i]) continue;
    for (const m of b.near[i]) {
      if (rank[m] < dried || p.owner[m] === a) continue;
      const k = which.get(a * 1000 + (p.owner[m] + 1));
      if (k !== undefined) front[k].push(m);
    }
  }
  const done = [], fell = new Map(); // who last took land from each nation this tick
  p.attacks.forEach((a, k) => {
    const list = [...new Set(front[k])].sort((x, y) => p.order[x] - p.order[y]), many = Math.max(2, Math.ceil(list.length / 4)) + (inkOf(p, a.by).reach || 0) + (markOf(p, a.by).reach || 0);
    let taken = 0;
    for (const i of list) {
      if (taken >= many || p.owner[i] !== a.to) continue;
      const cost = costOf(p, b, i, a.by, a.got);
      if (a.left < cost) { a.left = 0; break; }
      a.left -= cost;
      if (a.to !== NONE) { p.troops[a.to] = Math.max(0, p.troops[a.to] - Math.max(1, Math.floor(p.troops[a.to] / Math.max(1, p.land[a.to])))); p.land[a.to]--; fell.set(a.to, a.by); }
      p.owner[i] = a.by;
      p.land[a.by]++;
      taken++;
      a.got++;
    }
    if (!list.length || !a.left || (a.to !== NONE && !p.land[a.to])) { p.troops[a.by] += a.left; done.push(k); }
  });
  p.attacks = p.attacks.filter((_, k) => !done.includes(k));
  soak(p, b, fell, events);
  if (p.dries) { dry(p, b, events); hold(p, b, events); }
  for (let s = 0; s < p.troops.length; s++) if (!p.land[s] && p.alive[s]) { p.alive[s] = 0; p.attacks = p.attacks.filter((a) => a.by !== s && a.to !== s); events.push({ kind: "out", seat: s, by: fell.has(s) ? fell.get(s) : NONE }); }
  // losing all your land does not end the game: you are out, and the others play on
  const top = p.land.reduce((x, v, s) => (v > p.land[x] ? s : x), 0);
  if (p.land[top] >= goalOf(p)) return finish(p, [top], "held most of the map", events);
  if (p.alive.filter(Boolean).length === 1) return finish(p, [top], "the only one left", events);
  if (p.limit && p.tick >= p.limit) return finish(p, [top], "held the most land when time ran out", events);
  return undefined;
}
function finish(p, winners, why, events) {
  p.over = { winners, why };
  events.push({ kind: "end", winners, why });
}

/** How far a nation's boats reach: the map's reach, more for indigo and for holding a quay. */
export const rangeOf = (p, b, s) => b.range + (inkOf(p, s).sail || 0) + (held(p, s, 1) ? PLACES[1].sail : 0);
/** Where a boat from a seat's coast can land, and how many sea cells away: coastal cells of others within its reach. */
export function shores(p, b, s = p.human) {
  const seen = new Map(), list = [], out = new Map(), reach = rangeOf(p, b, s), rank = dryRank(b), k0 = driedOf(p), wet = (i) => rank[i] >= k0; // dried land is crossed like the sea
  for (let i = 0; i < b.n; i++) if (p.owner[i] === s && b.near[i].some((m) => !wet(m))) for (const m of b.near[i]) if (!wet(m) && !seen.has(m)) { seen.set(m, 1); list.push(m); }
  for (let k = 0; k < list.length; k++) {
    const w = list[k], d = seen.get(w);
    for (const m of b.near[w]) {
      if (wet(m)) { if (p.owner[m] !== s && !out.has(m)) out.set(m, d); continue; }
      if (!seen.has(m) && d < reach) { seen.set(m, d + 1); list.push(m); }
    }
  }
  return out;
}
export const landings = (p, b, s = p.human) => new Set(shores(p, b, s).keys());
/** A boat must carry more than this to land on a cell. */
export const landingPrice = (p, b, at, s = p.human) => part(costOf(p, b, at, s), inkOf(p, s).land || [2, 1]);

/** The board a live position is played on. */
export const liveBoardOf = (p, chance) => liveBoard(p.map, p.key, chance);

/** Traditional fixes its own rules; Custom takes each switch as given. */
export function liveSetup(o, dice, chance) {
  // Traditional and Capo fix their own rules; Capo (The Ink Dries) draws its map and has no inks, places but wells, or ages
  const ours = o.style !== "custom", dries = o.style === "ours", two = o.people === 2, key = dice.below(0x40000000), map = dries ? LIVE_MAPS[dice.below(LIVE_MAPS.length)] : o.map;
  const b = liveBoard(map, key, chance), n = dries ? DRIES.nations : o.nations, inks = dries ? "off" : ours ? "chosen" : o.inks;
  // boats are always on where the map has more than one landmass, so that every map can be won
  const p = { live: true, classic: true, style: o.style, map, key: map === "world" ? 0 : key, human: 0, total: b.total, owner: Array(b.n).fill(NONE), order: dice.shuffle(b.cells.map((_, i) => i)), troops: Array(n).fill(START), land: Array(n).fill(0), alive: Array(n).fill(1), temper: Array.from({ length: n }, () => dice.below(4)), names: two ? dice.shuffle(NATIONS).slice(0, n) : ["You", ...dice.shuffle(NATIONS).slice(0, n - 1)], attacks: [], cities: [], boats: !!o.boats || b.masses > 1, building: !ours && !!o.cities, rivals: RIVALS[o.rivals] ? o.rivals : "gentle", tick: 0, limit: dries ? DRIES.from + DRIES.span : ours ? SAFE : 2 * o.time, phase: "spawn", seat: 0, round: 1, over: null, pact: null };
  p.rounds = p.limit;
  if (two) { p.people = [0, 1]; p.pacts = [null, null]; } // two people: seat 1 is the second, who starts where they choose, as you do
  // inks drawn by the seed from an even deck, so that six nations hold one of each; yours is drawn too, for "Draw for me"
  p.ink = inks === "off" ? Array(n).fill(NONE) : dice.shuffle(Array.from({ length: Math.ceil(n / 6) * 6 }, (_, k) => k % 6)).slice(0, n);
  p.choose = inks === "chosen";
  p.ages = !dries && (ours || !!o.ages);
  p.ease = !dries && (ours || !!o.ease);
  p.dries = dries;
  for (const k of ["mark", "card"]) p[k] = Array(n).fill(NONE);
  p.armed = Array(n).fill(0);
  p.wind = Array(n).fill(0);
  // starts are dealt for every seat (yours only as a suggestion), then evened out; the bots take theirs
  const spots = [];
  for (let s = 0; s < n; s++) spots.push(deal(p, b, dice, spots));
  even(b, spots);
  for (let s = 1; s < n; s++) if (!person(p, s)) claim(p, b, s, spots[s]);
  p.starts = spots;
  if (dries) { p.cap = spots.map((at, s) => (person(p, s) ? NONE : at)); p.fade = Array(b.n).fill(0); }
  // places: at least 6 cells from any bot's start and 4 from each other, the four kinds in turn
  const rate = PLACE_RATE[ours ? "normal" : o.places], want = rate ? Math.floor(b.total / rate) : 0;
  p.places = [];
  for (let t = 0; p.places.length < want && t < want * 40; t++) {
    const at = dice.pick(b.dry);
    if (spots.some((j) => apart(b, at, j) < 6) || p.places.some(([j]) => apart(b, at, j) < 4)) continue;
    p.places.push([at, dries ? 0 : p.places.length % PLACES.length]);
  }
  return p;
}
/** A start dealt evenly: of DEAL empty spots, the one farthest from every other start (up to SPREAD steps), then with the most
 *  land within two steps. -1 when none is found. */
export function deal(p, b, dice, spots) {
  let best = -1, score = -1;
  for (let t = 0; t < DEAL; t++) {
    const i = dice.pick(b.dry);
    if (p.owner[i] !== NONE) continue;
    let d = SPREAD;
    for (const j of spots) d = Math.min(d, apart(b, i, j));
    let room = 0;
    for (const m of b.near[i]) { room += b.land[m]; for (const x of b.near[m]) room += b.land[x]; }
    if (d * 100 + room > score) { score = d * 100 + room; best = i; }
  }
  return best;
}
/** Evens out the starts: each moves to the middle of the land nearer it than any other start, and now and then the start with the
 *  least of that land moves into the start with the most. The most even layout found is kept. Changes spots. */
function even(b, spots) {
  const n = spots.length;
  let keep = [...spots], top = 1, low = 0;
  for (let k = 0; k < EVEN; k++) {
    const sum = spots.map(() => [0, 0, 0]), far = spots.map(() => [-1, -1]);
    const whose = b.dry.map((i) => {
      let s = 0, d = b.n;
      spots.forEach((j, t) => { const e = apart(b, i, j); if (e < d) { d = e; s = t; } });
      sum[s][0] += b.cells[i][0]; sum[s][1] += b.cells[i][1]; sum[s][2]++;
      if (d > far[s][1]) far[s] = [i, d];
      return s;
    });
    const room = sum.map((x) => x[2]), most = room.indexOf(Math.max(...room)), least = room.indexOf(Math.min(...room));
    if (room[most] * low < top * room[least]) { keep = [...spots]; top = room[most]; low = room[least]; }
    if (k % 3 === 2 && room[most] * 2 > room[least] * 3 && far[most][0] >= 0) { spots[least] = far[most][0]; continue; }
    const best = spots.map(() => [-1, 0]);
    b.dry.forEach((i, t) => { // the cell nearest the middle, measured in whole numbers scaled by the region's size
      const s = whose[t], [Q, R, c] = sum[s], dq = b.cells[i][0] * c - Q, dr = b.cells[i][1] * c - R, d = Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr);
      if ((!spots.includes(i) || i === spots[s]) && (best[s][0] < 0 || d < best[s][1])) best[s] = [i, d];
    });
    for (let s = 0; s < n; s++) if (best[s][0] >= 0) spots[s] = best[s][0];
  }
  spots.splice(0, n, ...keep);
  // a start whose ring has less than half a hexagon of land within 5 steps, or beside another, moves to the nearest place with room
  const memo = new Map(), room = (i) => { if (!memo.has(i)) { const d = new Map([[i, 0]]), list = [i]; for (let k = 0; k < list.length; k++) for (const m of b.near[list[k]]) if (b.land[m] && !d.has(m) && d.get(list[k]) < 5) { d.set(m, d.get(list[k]) + 1); list.push(m); } memo.set(i, list.length); } return memo.get(i); };
  const roomy = (i) => [i, ...b.near[i]].every((c) => !b.land[c] || room(c) >= 46), close = (i, s) => spots.some((j, t) => t !== s && apart(b, i, j) < 3);
  for (let s = 0; s < n; s++) if (!roomy(spots[s]) || close(spots[s], s)) {
    const at = b.dry.reduce((x, i) => (close(i, s) || (x >= 0 && apart(b, i, spots[s]) >= apart(b, x, spots[s])) || !roomy(i) ? x : i), -1);
    if (at >= 0) spots[s] = at;
  }
}
function claim(p, b, s, i) {
  for (const c of [i, ...b.near[i]]) if (b.land[c] && p.owner[c] === NONE) { p.owner[c] = s; p.land[s]++; }
}
/** Where you may start: empty land with an empty ring, and no place in it. */
const startable = (p, b, i) => b.land[i] === 1 && p.owner[i] === NONE && b.near[i].every((m) => p.owner[m] === NONE) && !p.places.some(([at]) => at === i || b.near[i].includes(at));

/** A person's own moves, as the person to move (p.human). A person who has started waits in the spawn phase for the other. */
function ownMoves(p, b) {
  if (p.over) return [];
  if (p.phase === "spawn") return p.land[p.human] ? [] : b.dry.filter((i) => startable(p, b, i)).flatMap((at) => (p.choose ? INKS.map((k) => ({ do: "spawn", at, ink: k.id })) : [{ do: "spawn", at }]));
  const out = [{ do: "tick", n: 1 }, { do: "tick", n: 2 }, { do: "tick", n: 4 }], h = p.human, near = [...bordersOf(p, b)[h]];
  const kept = pactOn(p);
  for (const to of near) if (to === NONE || to !== kept) for (const pct of PCTS) out.push({ do: "attack", to, pct });
  for (const a of p.attacks) if (a.by === h && !a.fl) out.push({ do: "recall", to: a.to });
  if (p.boats) for (const at of landings(p, b)) if (p.owner[at] === NONE || p.owner[at] !== kept) for (const pct of PCTS) out.push({ do: "boat", at, pct });
  for (const to of near) if (to !== NONE && !pactWhy(p, b, to)) out.push({ do: "pact", to });
  if (p.building) for (let i = 0; i < b.n; i++) if (p.owner[i] === h && !p.cities.includes(i) && p.troops[h] >= cityPrice(p)) out.push({ do: "city", at: i });
  if (markDue(p)) for (const k of MARKS) out.push({ do: "mark", mark: k.id });
  if (cardDue(p)) for (const k of CARDS) out.push({ do: "card", card: k.id });
  return out;
}
/** The same position seen from another person's seat: what that person may do, and what their order changes. */
const as = (p, h) => (h === p.human ? p : { ...p, human: h });
/** Every move: in a game for two, the clock and each person's orders, each order naming its person (`by`). */
export function liveMoves(p, b) {
  if (!p.people) return ownMoves(p, b);
  if (p.over) return [];
  const out = p.phase === "play" ? [1, 2, 4].map((n) => ({ do: "tick", n })) : [];
  for (const h of p.people) for (const m of ownMoves(as(p, h), b)) if (m.do !== "tick") out.push({ ...m, by: h });
  return out;
}
/** One person's moves without the `by`, as the page offers them. */
export const liveMovesOf = (p, b, h = p.human) => ownMoves(as(p, h), b);
export const cityPrice = (p) => 60 * (1 + p.cities.filter((c) => p.owner[c] === p.human).length);
/** Whether your mark or your card is waiting to be chosen. */
export const markDue = (p) => p.ages && !!p.alive[p.human] && p.tick >= agesOf(p)[1] && p.mark[p.human] < 0;
export const cardDue = (p) => p.ages && !!p.alive[p.human] && p.tick >= agesOf(p)[2] && p.card[p.human] < 0;

/** Whether a move has exactly these keys and no others. */
const shaped = (m, ...keys) => !!m && typeof m === "object" && !Array.isArray(m) && Object.keys(m).length === keys.length && keys.every((k) => Object.hasOwn(m, k));
const KEYS = { tick: ["n"], attack: ["to", "pct"], recall: ["to"], pact: ["to"], boat: ["at", "pct"], city: ["at"], mark: ["mark"], card: ["card"] };
/** A quick check, so that a tick does not have to list every move to be allowed. It allows exactly what liveMoves lists. */
export function liveAllows(p, b, m) {
  if (p.people && m && typeof m === "object" && m.do !== "tick") {
    if (!Object.hasOwn(m, "by") || !p.people.includes(m.by)) return false;
    const { by, ...rest } = m;
    return ownAllows(as(p, by), b, rest);
  }
  return ownAllows(p, b, m);
}
function ownAllows(p, b, m) {
  if (p.over || !m || typeof m !== "object") return false;
  if (p.phase === "spawn") return !p.land[p.human] && m.do === "spawn" && shaped(m, "do", "at", ...(p.choose ? ["ink"] : [])) && Number.isInteger(m.at) && startable(p, b, m.at) && (!p.choose || INKS.some((k) => k.id === m.ink));
  if (!Object.hasOwn(KEYS, m.do) || !shaped(m, "do", ...KEYS[m.do])) return false;
  if (m.do === "tick") return [1, 2, 4].includes(m.n);
  if (m.do === "attack") return PCTS.includes(m.pct) && (m.to === NONE || (Number.isInteger(m.to) && m.to >= 0 && m.to < p.troops.length && m.to !== p.human && m.to !== pactOn(p))) && bordersOf(p, b)[p.human].has(m.to);
  if (m.do === "recall") return Number.isInteger(m.to) && !!recallable(p, m.to);
  if (m.do === "boat") return p.boats && PCTS.includes(m.pct) && Number.isInteger(m.at) && landings(p, b).has(m.at) && (p.owner[m.at] === NONE || p.owner[m.at] !== pactOn(p));
  if (m.do === "pact") return !pactWhy(p, b, m.to);
  if (m.do === "city") return p.building && Number.isInteger(m.at) && p.owner[m.at] === p.human && !p.cities.includes(m.at) && p.troops[p.human] >= cityPrice(p);
  if (m.do === "mark") return markDue(p) && MARKS.some((k) => k.id === m.mark);
  return cardDue(p) && CARDS.some((k) => k.id === m.card);
}

const copy = (p) => ({ ...p, owner: [...p.owner], troops: [...p.troops], land: [...p.land], alive: [...p.alive], attacks: p.attacks.map((a) => ({ ...a })), cities: [...p.cities], ink: [...p.ink], mark: [...p.mark], card: [...p.card], armed: [...p.armed], wind: [...p.wind], ...(p.dries ? { cap: [...p.cap], fade: [...p.fade] } : {}) });

export function liveApply(before, b, m, dice) {
  if (before.people && Object.hasOwn(m, "by")) { // an order of one of two people, applied from their seat
    const { by, ...rest } = m, r = ownApply(as(before, by), b, rest, dice);
    r.position.human = before.human;
    return r;
  }
  return ownApply(before, b, m, dice);
}
function ownApply(before, b, m, dice) {
  const p = copy(before), events = [], s = p.human;
  if (m.do === "spawn") { claim(p, b, s, m.at); if (p.dries) p.cap[s] = m.at; if (m.ink) p.ink[s] = INKS.findIndex((k) => k.id === m.ink); p.phase = peopleOf(p).every((h) => p.land[h]) ? "play" : "spawn"; events.push({ kind: "spawn", at: m.at, ...(p.people ? { seat: s } : {}) }); }
  else if (m.do === "attack") { send(p, s, m.to, Math.floor((p.troops[s] * m.pct) / 100)); events.push({ kind: "attack", seat: s, to: m.to, pct: m.pct }); }
  else if (m.do === "pact") { // a truce: attacks between you end, each side's strength coming home whole
    for (const a of p.attacks) if ((a.by === s && a.to === m.to) || (a.by === m.to && a.to === s)) p.troops[a.by] += a.left;
    p.attacks = p.attacks.filter((a) => !((a.by === s && a.to === m.to) || (a.by === m.to && a.to === s)));
    setPact(p, s, { to: m.to, until: p.tick + PACT.long, next: p.tick + PACT.long + PACT.gap });
    events.push({ kind: "pact", seat: s, to: m.to, until: p.tick + PACT.long });
  } else if (m.do === "recall") { // the attack ends where it stands: a quarter of what is left is lost, the rest comes home
    const a = recallable(p, m.to), lost = recallLoss(a.left);
    p.attacks = p.attacks.filter((x) => x !== a);
    p.troops[s] += a.left - lost;
    events.push({ kind: "recall", seat: s, to: m.to, back: a.left - lost, lost });
  } else if (m.do === "boat") {
    const had = p.troops[s], landed = land(p, b, s, m.at, Math.floor((had * m.pct) / 100));
    events.push({ kind: "boat", seat: s, at: m.at, landed, lost: landed ? 0 : had - p.troops[s] });
  } else if (m.do === "city") { p.troops[s] -= cityPrice(before); p.cities.push(m.at); events.push({ kind: "city", seat: s, at: m.at }); }
  else if (m.do === "mark") { p.mark[s] = MARKS.findIndex((k) => k.id === m.mark); events.push({ kind: "mark", seat: s, mark: m.mark }); }
  else if (m.do === "card") {
    const k = CARDS.findIndex((x) => x.id === m.card);
    p.card[s] = k;
    if (k === 0) p.armed[s] = 1; else p.wind[s] = p.tick + WIND;
    events.push({ kind: "card", seat: s, card: m.card });
  } else for (let k = 0; k < m.n && !p.over; k++) tick(p, b, dice, events);
  return { position: p, events };
}
