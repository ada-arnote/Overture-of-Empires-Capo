// SPDX-License-Identifier: AGPL-3.0-or-later
// An Inch of Ink in real time: the genre as it is played in a browser. Many nations, one pool of strength each,
// borders that creep, and a share of your strength sent with every attack. Time passes in ticks of half a second,
// so a game is still a list of moves and replays the same anywhere.
import { CELLS, COLS, ROWS } from "../maps/world.js";

export const NONE = -1, PCTS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], TICK_MS = 500;
export const LIVE_MAPS = ["world", "continents", "islands"];
const START = 30, GOAL = 80, LIMIT = 1600, RANGE = 9;
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
  const b = Object.freeze({ ...g, land, hill, dry, total: dry.length });
  if (made.size > 12) made.clear();
  made.set(id, b);
  return b;
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

/** The bots: each has a temper drawn at the start. They act now and then, never on every tick. */
function think(p, b, dice, borders) {
  for (let s = 0; s < p.troops.length; s++) {
    if (s === p.human || !p.land[s] || dice.below(4)) continue;
    const busy = p.attacks.some((a) => a.by === s), full = p.troops[s] * 10 >= maxOf(p, s) * 7;
    if (busy && !full) continue;
    const near = [...borders[s]], share = 30 + p.temper[s] * 10;
    if (near.includes(NONE) && (!near.some((o) => o !== NONE) || dice.below(3))) { send(p, s, NONE, Math.floor((p.troops[s] * share) / 100)); continue; }
    const rivals = near.filter((o) => o !== NONE);
    if (!rivals.length) { if (p.boats && full && dice.below(3) === 0) sail(p, b, s, dice); continue; }
    const weak = rivals.reduce((x, y) => (p.troops[y] * Math.max(1, p.land[x]) < p.troops[x] * Math.max(1, p.land[y]) ? y : x));
    if (p.troops[s] > p.troops[weak] * (p.temper[s] > 2 ? 0.8 : 1.3) || full) send(p, s, weak, Math.floor((p.troops[s] * share) / 100));
  }
}

/** A bot with nowhere to go on foot sends a boat to the nearest shore it can reach. Changes p. */
function sail(p, b, s, dice) {
  const spots = [...landings(p, b, s)];
  if (!spots.length) return;
  land(p, b, s, dice.pick(spots), Math.floor(p.troops[s] / 2));
}
/** Put troops ashore. A landing costs double; what is left goes on attacking. Changes p. */
function land(p, b, s, at, troops) {
  const was = p.owner[at], cost = costOf(p, b, at) * 2;
  p.troops[s] -= troops;
  if (troops <= cost) return false;
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
    const top = maxOf(p, s);
    p.troops[s] = p.troops[s] > top ? p.troops[s] - Math.ceil((p.troops[s] - top) / 10) : Math.min(top, p.troops[s] + gainOf(p, s));
  }
  const borders = bordersOf(p, b);
  think(p, b, dice, borders);
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
  const top = p.land.reduce((x, v, s) => (v > p.land[x] ? s : x), 0);
  if (!p.land[p.human]) return finish(p, [top], "overran you", events);
  if (p.land[top] >= goalOf(p)) return finish(p, [top], "held most of the map", events);
  if (p.alive.filter(Boolean).length === 1) return finish(p, [top], "the only one left", events);
  if (p.tick >= p.limit) return finish(p, [top], "held the most land when time ran out", events);
  return undefined;
}
function finish(p, winners, why, events) {
  p.over = { winners, why };
  events.push({ kind: "end", winners, why });
}

/** Where a boat from a seat's coast can land: coastal cells of others within reach over water. */
export function landings(p, b, s = p.human) {
  const seen = new Map(), list = [];
  for (let i = 0; i < b.n; i++) if (p.owner[i] === s && b.near[i].some((m) => !b.land[m])) for (const m of b.near[i]) if (!b.land[m] && !seen.has(m)) { seen.set(m, 1); list.push(m); }
  const out = new Set();
  for (let k = 0; k < list.length; k++) {
    const w = list[k], d = seen.get(w);
    for (const m of b.near[w]) {
      if (b.land[m]) { if (p.owner[m] !== s) out.add(m); continue; }
      if (!seen.has(m) && d < RANGE) { seen.set(m, d + 1); list.push(m); }
    }
  }
  return out;
}

/** The board a live position is played on. */
export const liveBoardOf = (p, chance) => liveBoard(p.map, p.key, chance);

export function liveSetup(o, dice, chance) {
  const key = dice.below(0x40000000), b = liveBoard(o.map, key, chance), n = o.nations;
  const p = { live: true, classic: true, style: o.style, map: o.map, key: 0, human: 0, total: b.total, owner: Array(b.n).fill(NONE), order: dice.shuffle(b.cells.map((_, i) => i)), troops: Array(n).fill(START), land: Array(n).fill(0), alive: Array(n).fill(1), temper: Array.from({ length: n }, () => dice.below(4)), names: ["You", ...dice.shuffle(NATIONS).slice(0, n - 1)], attacks: [], cities: [], boats: !!o.boats || o.map === "islands", building: !!o.cities, tick: 0, limit: LIMIT, phase: "spawn", seat: 0, round: 1, rounds: LIMIT, over: null };
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
  if (p.building) for (let i = 0; i < b.n; i++) if (p.owner[i] === p.human && !p.cities.includes(i) && p.troops[p.human] >= cityPrice(p)) out.push({ do: "city", at: i });
  return out;
}
export const cityPrice = (p) => 60 * (1 + p.cities.filter((c) => p.owner[c] === p.human).length);

/** A quick check, so that a tick does not have to list every move to be allowed. */
export function liveAllows(p, b, m) {
  if (p.over) return false;
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
    const landed = land(p, b, s, m.at, Math.floor((p.troops[s] * m.pct) / 100));
    events.push({ kind: "boat", seat: s, at: m.at, landed });
  } else if (m.do === "city") { p.troops[s] -= cityPrice(before); p.cities.push(m.at); events.push({ kind: "city", seat: s, at: m.at }); }
  else for (let k = 0; k < m.n && !p.over; k++) tick(p, b, dice, events);
  return { position: p, events };
}
