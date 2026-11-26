// SPDX-License-Identifier: AGPL-3.0-or-later
// An Inch of Ink in real time: the genre as it is played in a browser. Many nations, one pool of strength each,
// borders that creep, and a share of your strength sent with every attack. Time passes in ticks of half a second,
// so a game is still a list of moves and replays the same anywhere.
import { CELLS, COLS, ROWS } from "../maps/world.js";

export const NONE = -1, PCTS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], TICK_MS = 500;
export const LIVE_MAPS = ["world", "continents", "islands"];
const START = 30, GOAL = 80, TIME = 800, RANGE = 9;
/** How hard the bots play. grow: their growth in tenths of yours; every: they act on one tick in this many; dare and bold: how much
 *  stronger (in tenths) a calm or a fierce bot must be to attack; you: how strong you look to them, in tenths; truce: ticks before
 *  they attack you; spare: whether a full bot leaves you alone unless you are worth attacking. */
export const RIVALS = {
  gentle: { grow: 7, every: 5, dare: 16, bold: 10, you: 20, truce: 360, spare: true },
  even: { grow: 10, every: 4, dare: 13, bold: 8, you: 10, truce: 0, spare: false },
  hard: { grow: 13, every: 3, dare: 11, bold: 7, you: 8, truce: 0, spare: false },
};
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

// ---- the clock ----
export const landOf = (p, s) => p.land[s];
export const maxOf = (p, s) => 40 + 4 * p.land[s] + 80 * p.cities.filter((c) => p.owner[c] === s).length;
export const gainOf = (p, s) => 1 + Math.floor(p.land[s] / 10) + Math.floor(p.troops[s] / 60) + p.cities.filter((c) => p.owner[c] === s).length;
/** What a cell costs to take: more for hills, and more where the owner holds much strength on little land. */
export function costOf(p, b, i) {
  const o = p.owner[i];
  return 2 + (b.hill[i] ? 3 : 0) + (o === NONE ? 0 : Math.floor(p.troops[o] / Math.max(1, p.land[o])));
}
export const goalOf = (p) => Math.ceil((p.total * GOAL) / 100);

/** Who borders whom: for each nation, the set of owners beside its land (NONE for empty land). */
export function bordersOf(p, b) {
  const out = p.troops.map(() => new Set());
  for (let i = 0; i < b.n; i++) {
    const a = p.owner[i];
    if (a === NONE) continue;
    for (const m of b.near[i]) { const o = p.owner[m]; if (o !== a && b.land[m]) out[a].add(o); }
  }
  return out;
}

/** Start or strengthen an attack. Changes p. */
function send(p, by, to, troops) {
  if (troops <= 0) return;
  p.troops[by] -= troops;
  const a = p.attacks.find((x) => x.by === by && x.to === to);
  if (a) a.left += troops; else p.attacks.push({ by, to, left: troops });
}

export const tier = (p) => RIVALS[p.rivals] || RIVALS.even;

/** The bots: each has a temper drawn at the start. They act now and then, never on every tick. */
function think(p, b, dice, borders) {
  const t = tier(p);
  for (let s = 0; s < p.troops.length; s++) {
    if (s === p.human || !p.land[s] || dice.below(t.every)) continue;
    const busy = p.attacks.some((a) => a.by === s), full = p.troops[s] * 10 >= maxOf(p, s) * 7;
    if (busy && !full) continue;
    const near = [...borders[s]], amount = Math.floor((p.troops[s] * (30 + p.temper[s] * 10)) / 100);
    // how strong a rival looks: you may look stronger than you are, and during the truce you are left alone
    const rivals = near.filter((o) => o !== NONE && !(o === p.human && p.tick < t.truce)), looks = (o) => (o === p.human ? Math.floor((p.troops[o] * t.you) / 10) : p.troops[o]);
    if (near.includes(NONE) && (!rivals.length || dice.below(3))) { send(p, s, NONE, amount); continue; }
    const weak = rivals.length ? rivals.reduce((x, y) => (looks(y) * Math.max(1, p.land[x]) < looks(x) * Math.max(1, p.land[y]) ? y : x)) : null;
    if (weak !== null && p.troops[s] * 10 > looks(weak) * (p.temper[s] > 2 ? t.bold : t.dare)) { send(p, s, weak, amount); continue; }
    // nothing on foot worth taking: once full, take to the boats, or else push at the weakest anyway
    if (!full) continue;
    if (p.boats && !near.includes(NONE) && sail(p, b, s)) continue;
    if (weak !== null && !(t.spare && weak === p.human)) send(p, s, weak, amount);
  }
}

/** A bot sends half its strength by boat to the nearest coast it can take. Changes p. Returns whether it sailed. */
function sail(p, b, s) {
  const troops = Math.floor(p.troops[s] / 2), t = tier(p), spare = t.spare || p.tick < t.truce;
  let best = -1, key = 0;
  for (const [at, d] of shores(p, b, s)) {
    if (troops <= costOf(p, b, at) * 2 || (spare && p.owner[at] === p.human)) continue;
    const k = d * b.n + p.order[at]; // the nearest, and among those the game's own order
    if (best < 0 || k < key) { best = at; key = k; }
  }
  if (best < 0) return false;
  land(p, b, s, best, troops);
  return true;
}
/** Put troops ashore. A landing costs double; what is left goes on attacking. A failed landing loses one cell's price,
 *  and the rest comes home. Changes p. Returns whether it landed. */
function land(p, b, s, at, troops) {
  const was = p.owner[at], cost = costOf(p, b, at) * 2;
  if (troops <= cost) { p.troops[s] -= Math.min(troops, costOf(p, b, at)); return false; }
  p.troops[s] -= troops;
  if (was !== NONE) { p.land[was]--; p.troops[was] = Math.max(0, p.troops[was] - 1); }
  p.owner[at] = s;
  p.land[s]++;
  const a = p.attacks.find((x) => x.by === s && x.to === was);
  if (a) a.left += troops - cost; else p.attacks.push({ by: s, to: was, left: troops - cost });
  return true;
}

/** One tick: growth, the bots, then every attack pushes its border. Changes p. */
function tick(p, b, dice, events) {
  p.tick++;
  for (let s = 0; s < p.troops.length; s++) {
    if (!p.land[s]) continue;
    const top = maxOf(p, s), g = gainOf(p, s), r = s === p.human ? 10 : tier(p).grow;
    // a bot's growth is scaled by its tier, spread over the ticks in whole numbers
    const add = r === 10 ? g : Math.floor((g * r * p.tick) / 10) - Math.floor((g * r * (p.tick - 1)) / 10);
    p.troops[s] = p.troops[s] > top ? p.troops[s] - Math.ceil((p.troops[s] - top) / 10) : Math.min(top, p.troops[s] + add);
  }
  const borders = bordersOf(p, b);
  think(p, b, dice, borders);
  // two nations attacking each other meet first: the smaller force is spent against the larger
  for (const a of p.attacks) {
    const o = a.to === NONE ? null : p.attacks.find((x) => x.by === a.to && x.to === a.by);
    if (o) { const m = Math.min(a.left, o.left); a.left -= m; o.left -= m; }
  }
  p.attacks = p.attacks.filter((a) => a.left > 0);
  // the cells each attack could take now, gathered in one pass over the map
  const front = p.attacks.map(() => []), which = new Map(p.attacks.map((a, k) => [a.by * 1000 + (a.to + 1), k]));
  for (let i = 0; i < b.n; i++) {
    const a = p.owner[i];
    if (a === NONE || !b.land[i]) continue;
    for (const m of b.near[i]) {
      if (!b.land[m] || p.owner[m] === a) continue;
      const k = which.get(a * 1000 + (p.owner[m] + 1));
      if (k !== undefined) front[k].push(m);
    }
  }
  const done = [];
  p.attacks.forEach((a, k) => {
    const list = [...new Set(front[k])].sort((x, y) => p.order[x] - p.order[y]), many = Math.max(2, Math.ceil(list.length / 4));
    let taken = 0;
    for (const i of list) {
      if (taken >= many || p.owner[i] !== a.to) continue;
      const cost = costOf(p, b, i);
      if (a.left < cost) { a.left = 0; break; }
      a.left -= cost;
      if (a.to !== NONE) { p.troops[a.to] = Math.max(0, p.troops[a.to] - Math.max(1, Math.floor(p.troops[a.to] / Math.max(1, p.land[a.to])))); p.land[a.to]--; }
      p.owner[i] = a.by;
      p.land[a.by]++;
      taken++;
    }
    if (!list.length || !a.left || (a.to !== NONE && !p.land[a.to])) { p.troops[a.by] += a.left; done.push(k); }
  });
  p.attacks = p.attacks.filter((_, k) => !done.includes(k));
  for (let s = 0; s < p.troops.length; s++) if (!p.land[s] && p.alive[s]) { p.alive[s] = 0; p.attacks = p.attacks.filter((a) => a.by !== s); events.push({ kind: "out", seat: s }); }
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

/** Where a boat from a seat's coast can land, and how many sea cells away: coastal cells of others within the map's reach. */
export function shores(p, b, s = p.human) {
  const seen = new Map(), list = [], out = new Map();
  for (let i = 0; i < b.n; i++) if (p.owner[i] === s && b.near[i].some((m) => !b.land[m])) for (const m of b.near[i]) if (!b.land[m] && !seen.has(m)) { seen.set(m, 1); list.push(m); }
  for (let k = 0; k < list.length; k++) {
    const w = list[k], d = seen.get(w);
    for (const m of b.near[w]) {
      if (b.land[m]) { if (p.owner[m] !== s && !out.has(m)) out.set(m, d); continue; }
      if (!seen.has(m) && d < b.range) { seen.set(m, d + 1); list.push(m); }
    }
  }
  return out;
}
export const landings = (p, b, s = p.human) => new Set(shores(p, b, s).keys());
/** A boat must carry more than this to land on a cell. */
export const landingPrice = (p, b, at) => costOf(p, b, at) * 2;

/** The board a live position is played on. */
export const liveBoardOf = (p, chance) => liveBoard(p.map, p.key, chance);

export function liveSetup(o, dice, chance) {
  const key = dice.below(0x40000000), b = liveBoard(o.map, key, chance), n = o.nations, limit = 2 * (o.time ?? TIME);
  // boats are always on where the map has more than one landmass, so that every map can be won
  const p = { live: true, classic: true, style: o.style, map: o.map, key: 0, human: 0, total: b.total, owner: Array(b.n).fill(NONE), order: dice.shuffle(b.cells.map((_, i) => i)), troops: Array(n).fill(START), land: Array(n).fill(0), alive: Array(n).fill(1), temper: Array.from({ length: n }, () => dice.below(4)), names: ["You", ...dice.shuffle(NATIONS).slice(0, n - 1)], attacks: [], cities: [], boats: !!o.boats || b.masses > 1, building: !!o.cities, rivals: RIVALS[o.rivals] ? o.rivals : "gentle", tick: 0, limit, phase: "spawn", seat: 0, round: 1, rounds: limit, over: null };
  p.key = o.map === "world" ? 0 : key;
  // bots start far apart
  const spots = [], far = (i) => spots.every((j) => Math.abs(b.cells[i][0] - b.cells[j][0]) + Math.abs(b.cells[i][1] - b.cells[j][1]) > 7);
  for (let s = 1; s < n; s++) { for (let t = 0; t < 60; t++) { const i = dice.pick(b.dry); if (p.owner[i] === NONE && far(i)) { spots.push(i); claim(p, b, s, i); break; } } }
  return p;
}
function claim(p, b, s, i) {
  for (const c of [i, ...b.near[i]]) if (b.land[c] && p.owner[c] === NONE) { p.owner[c] = s; p.land[s]++; }
}

export function liveMoves(p, b) {
  if (p.over) return [];
  if (p.phase === "spawn") return b.dry.filter((i) => p.owner[i] === NONE && b.near[i].every((m) => p.owner[m] === NONE)).map((at) => ({ do: "spawn", at }));
  const out = [{ do: "tick", n: 1 }, { do: "tick", n: 2 }, { do: "tick", n: 4 }], near = [...bordersOf(p, b)[p.human]];
  for (const to of near) for (const pct of PCTS) out.push({ do: "attack", to, pct });
  if (p.boats) for (const at of landings(p, b)) for (const pct of PCTS) out.push({ do: "boat", at, pct });
  if (p.building) for (let i = 0; i < b.n; i++) if (p.owner[i] === p.human && !p.cities.includes(i) && p.troops[p.human] >= cityPrice(p)) out.push({ do: "city", at: i });
  return out;
}
export const cityPrice = (p) => 60 * (1 + p.cities.filter((c) => p.owner[c] === p.human).length);

/** Whether a move has exactly these keys and no others. */
const shaped = (m, ...keys) => !!m && typeof m === "object" && !Array.isArray(m) && Object.keys(m).length === keys.length && keys.every((k) => Object.hasOwn(m, k));
/** A quick check, so that a tick does not have to list every move to be allowed. It allows exactly what liveMoves lists. */
export function liveAllows(p, b, m) {
  if (p.over || !shaped(m, "do", m?.do === "tick" ? "n" : m?.do === "attack" ? "to" : "at", ...(m?.do === "attack" || m?.do === "boat" ? ["pct"] : []))) return false;
  if (p.phase === "spawn") return m.do === "spawn" && Number.isInteger(m.at) && b.land[m.at] === 1 && p.owner[m.at] === NONE && b.near[m.at].every((x) => p.owner[x] === NONE);
  if (m.do === "tick") return [1, 2, 4].includes(m.n);
  if (m.do === "attack") return PCTS.includes(m.pct) && (m.to === NONE || (Number.isInteger(m.to) && m.to > 0 && m.to < p.troops.length)) && bordersOf(p, b)[p.human].has(m.to);
  if (m.do === "boat") return p.boats && PCTS.includes(m.pct) && Number.isInteger(m.at) && landings(p, b).has(m.at);
  if (m.do === "city") return p.building && Number.isInteger(m.at) && p.owner[m.at] === p.human && !p.cities.includes(m.at) && p.troops[p.human] >= cityPrice(p);
  return false;
}

const copy = (p) => ({ ...p, owner: [...p.owner], troops: [...p.troops], land: [...p.land], alive: [...p.alive], attacks: p.attacks.map((a) => ({ ...a })), cities: [...p.cities] });

export function liveApply(before, b, m, dice) {
  const p = copy(before), events = [], s = p.human;
  if (m.do === "spawn") { claim(p, b, s, m.at); p.phase = "play"; events.push({ kind: "spawn", at: m.at }); }
  else if (m.do === "attack") { send(p, s, m.to, Math.floor((p.troops[s] * m.pct) / 100)); events.push({ kind: "attack", seat: s, to: m.to, pct: m.pct }); }
  else if (m.do === "boat") {
    const had = p.troops[s], landed = land(p, b, s, m.at, Math.floor((had * m.pct) / 100));
    events.push({ kind: "boat", seat: s, at: m.at, landed, lost: landed ? 0 : had - p.troops[s] });
  } else if (m.do === "city") { p.troops[s] -= cityPrice(before); p.cities.push(m.at); events.push({ kind: "city", seat: s, at: m.at }); }
  else for (let k = 0; k < m.n && !p.over; k++) tick(p, b, dice, events);
  return { position: p, events };
}
