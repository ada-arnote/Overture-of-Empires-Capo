// SPDX-License-Identifier: AGPL-3.0-or-later
// The map report card: every built-in board, and a spread of seeds for every map option the games offer, checked for
// land in one piece (or reachable as the rules allow), sane groups, names, and fair starts at every seat count offered.
// The boards come from each game's own setup, so the card always reads the rules as they are now.
// node tools/report.mjs              the full sweep (40 seeds a kind), a table and the to-do list
// node tools/report.mjs --seeds 200  more seeds; --quick for the gate's sweep; --json for the raw counts
// The gate (tools/check.mjs) runs the quick sweep. It stops on a failed check that is not on the to-do list below,
// and lists the to-do failures as notes. Exit code here: 1 only when a check outside the to-do list fails.
import { pathToFileURL } from "node:url";
import { createMatch } from "../src/core/index.js";
import { steps } from "../src/games/areas.js";
import { joined } from "../src/games/hex.js";
import { banners, boardOf as areaOf, bonusOf } from "../src/games/banners/rules.js";
import { fable, boardOf as fableOf, nameOf as fableName } from "../src/games/fable/rules.js";
import { SIZES as FABLE_SIZES, seaRoads } from "../src/games/fable/islands.js";
import { glass, boardOf as glassOf, landFor } from "../src/games/glass/rules.js";
import { inch, boardOf as inchOf, liveBoardFor } from "../src/games/inch/rules.js";

/** The tolerances, stated once. Section 4.4 of docs/reviews/2026-11-25/lane3-maps.md gives most of them. */
export const T = {
  provinces: [12, 120], cells: 5, ratio: 6, bonus: 2.5, dead: 2, degree: [3, 5], // area boards
  apart: 2, room: 3, // area starts: no two homes side by side; own provinces within 2 steps differ by at most 3
  land: 10, boats: 3, isleApart: 3, isleRoom: 15, // islands: land within 10% of the size; boat reach (Fable's ROADS); homes 3 apart; own land within 3 steps within 15%
  yield: 1.5, draft: 25, // Glass: production per good within 1.5 times; a greedy snake draft of depots within 25% between seats
  inchRoom: 2, liveRoom: 2, // Inch turns: hills within 2 steps of each home differ by at most 2; real time: land within 5 steps of a spawn within 2 times
};
/** Each check: hard (lane 3 calls it a fail) or warn (a warning there), and what it asks. */
export const CHECKS = {
  "area.count": ["hard", `${T.provinces[0]} to ${T.provinces[1]} provinces`],
  "area.piece": ["hard", "every province in one piece"],
  "area.small": ["hard", `every province at least ${T.cells} cells`],
  "area.whole": ["hard", "neighbours both ways, and every province reachable from every other"],
  "area.links": ["hard", "crossings join two provinces that do not already touch, ends inside them"],
  "area.names": ["hard", "every province and land named, no name twice"],
  "area.lands": ["hard", "every province in one land, every land with provinces and joined"],
  "area.labels": ["hard", "every label cell inside its province"],
  "area.ratio": ["warn", `largest province at most ${T.ratio} times the smallest`],
  "area.bonus": ["warn", `bonus per border province, best land at most ${T.bonus} times the worst`],
  "area.dead": ["warn", `at most ${T.dead} dead ends (one link)`],
  "area.degree": ["warn", `mean links per province ${T.degree[0]} to ${T.degree[1]}`],
  "area.start": ["hard", "a start for each seat at every seat count, all different"],
  "area.apart": ["warn", `homes at least ${T.apart} steps apart at every seat count`],
  "area.room": ["warn", `own provinces within 2 steps of each home differ by at most ${T.room}, every seat count`],
  "isle.size": ["hard", `land within ${T.land}% of the size's land`],
  "isle.piece": ["warn", "land in one piece on foot"],
  "isle.reach": ["hard", `every land cell reachable on foot or by boat (${T.boats} sea cells)`],
  "isle.names": ["hard", "every land cell named, no name twice"],
  "isle.deal": ["hard", "dealt start: every seat the same number of cells"],
  "isle.homes": ["hard", "homes start: one home a seat, on land, with two land neighbours"],
  "isle.alone": ["warn", "no home alone on its piece of land"],
  "isle.apart": ["warn", `homes at least ${T.isleApart} steps apart on foot`],
  "isle.room": ["warn", `own land within 3 steps of each home within ${T.isleRoom}% of the most`],
  "glass.size": ["hard", "land as the rules ask for the seats, in one piece"],
  "glass.goods": ["hard", "every good on the island, counts within 1"],
  "glass.numbers": ["hard", "every producing hex has a number the roll can make"],
  "glass.ports": ["hard", "at least 4 ports, every good's port, all on the coast"],
  "glass.busy": ["warn", "no two of the busiest numbers side by side"],
  "glass.yield": ["warn", `production per good within ${T.yield} times`],
  "glass.portgap": ["warn", "no two ports side by side"],
  "glass.draft": ["warn", `greedy snake draft of two depots each: seats within ${T.draft}% of the best`],
  "inch.homes": ["hard", "a home a seat, all equally far apart"],
  "inch.room": ["warn", `hills within 2 steps of each home differ by at most ${T.inchRoom}`],
  "live.reach": ["hard", "every land cell reachable on foot or by boat within the map's range"],
  "live.free": ["hard", "somewhere left for the player to start"],
  "live.names": ["hard", "every nation named, no name twice"],
  "live.spawn": ["warn", "every nation placed at the start"],
  "live.room": ["warn", `land within 5 steps of each nation's start within ${T.liveRoom} times`],
};
/** Checks the current maps fail, by kind of board: the to-do list. The gate notes these and stops on any other failure.
 * Left on purpose, as fixing them would change a game's feel: Arms with 6 seats, on the small island (48 land, 8 cells a
 * home) the thin arms often leave one home a cell short of 15%; with the higher die, 5 and 6 are half of all numbers, too
 * many to keep apart. */
const FAILING = {
  "fable homes arms": "isle.room",
  ...Object.fromEntries(["small", "medium", "large"].map((s) => [`glass ${s} high`, "glass.busy"])),
};
export const TODO = Object.entries(FAILING).flatMap(([kind, ids]) => ids.split(" ").map((id) => `${kind}|${id}`));

const unique = (list) => list.every((x) => typeof x === "string" && x.trim()) && new Set(list).size === list.length;
const spreadOf = (v) => [Math.min(...v), Math.max(...v)];
const fixed = (x) => (Number.isFinite(x) ? Number(x.toFixed(1)) : x);
/** Neighbours of small hexes given as [q, r]. */
function hexNear(cells) {
  const at = new Map(cells.map(([q, r], i) => [`${q},${r}`, i]));
  return cells.map(([q, r]) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].map(([a, b]) => at.get(`${q + a},${r + b}`)).filter((x) => x !== undefined));
}
/** Places each home has to itself: nearer to it than to any other home, within `reach` steps. Distances are given. */
function ownRoom(ds, reach) {
  const room = ds.map(() => 0);
  for (let i = 0; i < ds[0].length; i++) {
    const v = ds.map((d) => (d[i] < 0 ? Infinity : d[i])), low = Math.min(...v);
    if (low <= reach && v.filter((x) => x === low).length === 1) room[v.indexOf(low)]++;
  }
  return room;
}

/** A province board (Brass and Banners): b as areaBoard makes it. seats: the seat counts offered. */
export function areaCard(b, { seats = [2, 3, 4, 5, 6], bonus = (k) => bonusOf(b, k), t = T } = {}) {
  const out = [], put = (id, ok, say) => out.push({ id, ok: !!ok, say: String(say) });
  const n = b.n, fine = hexNear(b.fine), cells = Array.from({ length: n }, () => []), name = (k) => b.names[k] || `#${k}`;
  b.of.forEach((o, i) => { if (o >= 0) cells[o]?.push(i); });
  put("area.count", n >= t.provinces[0] && n <= t.provinces[1], `${n} provinces`);
  const split = cells.findIndex((c) => !c.length || joined(fine, c[0], (m) => b.of[m] === b.of[c[0]]).length !== c.length);
  put("area.piece", split < 0, split < 0 ? "all whole" : `${name(split)} is in ${cells[split].length ? "pieces" : "no cells"}`);
  const sizes = cells.map((c) => c.length), [lo, hi] = spreadOf(sizes);
  put("area.small", lo >= t.cells, `smallest ${lo} cells (${name(sizes.indexOf(lo))})`);
  put("area.ratio", hi <= t.ratio * lo, `${lo} to ${hi} cells, ${fixed(hi / Math.max(1, lo))} times`);
  const oneWay = b.near.findIndex((list, i) => list.some((m) => m === i || !b.near[m]?.includes(i))), reach = joined(b.near, 0, () => true).length;
  put("area.whole", oneWay < 0 && reach === n, oneWay >= 0 ? `${name(oneWay)} has a one-way neighbour` : `${reach} of ${n} reachable`);
  const badLink = b.links.findIndex(([x, y], k) => x === y || !b.near[x]?.includes(y) || b.dry[x]?.includes(y) || !b.ends?.[k] || b.of[b.ends[k][0]] !== x || b.of[b.ends[k][1]] !== y);
  put("area.links", badLink < 0, badLink < 0 ? `${b.links.length} crossings` : `crossing ${b.links[badLink].map(name).join(" to ")}`);
  put("area.names", b.names.length === n && unique(b.names) && unique(b.lands), `${b.names.length} names for ${n} provinces, ${b.lands.length} lands`);
  const lands = b.lands.map((_, k) => cells.map((_, i) => i).filter((i) => b.region[i] === k));
  const badLand = lands.findIndex((P, k) => !P.length || b.sizes[k] !== P.length || joined(b.near, P[0], (m) => b.region[m] === k).length !== P.length);
  put("area.lands", b.region.length === n && b.region.every((k) => k >= 0 && k < lands.length) && badLand < 0, badLand < 0 ? `${lands.length} lands` : `${b.lands[badLand]} is empty or split`);
  const offLabel = b.mid.findIndex((c, k) => b.of[c] !== k);
  put("area.labels", b.mid.length === n && offLabel < 0, offLabel < 0 ? "all inside" : `${name(offLabel)}'s label is outside it`);
  const per = lands.map((P, k) => bonus(k) / Math.max(1, P.filter((i) => b.near[i].some((m) => b.region[m] !== k)).length)), [pl, ph] = spreadOf(per);
  put("area.bonus", ph <= t.bonus * pl, `${b.lands[per.indexOf(ph)]} ${fixed(ph)} a border province, ${b.lands[per.indexOf(pl)]} ${fixed(pl)}: ${fixed(ph / pl)} times`);
  const dead = b.near.filter((l) => l.length === 1).length, mean = b.near.reduce((s, l) => s + l.length, 0) / n;
  put("area.dead", dead <= t.dead, `${dead} dead ends`);
  put("area.degree", mean >= t.degree[0] && mean <= t.degree[1], `mean ${fixed(mean)} links`);
  const bad = { start: [], apart: [], room: [] };
  for (const s of seats) {
    const at = b.starts?.[s];
    if (!Array.isArray(at) || at.length !== s || new Set(at).size !== s || at.some((a) => !(a >= 0 && a < n))) { bad.start.push(s); continue; }
    const ds = at.map((a) => steps(b.near, [a])), apart = Math.min(...at.flatMap((a, i) => at.map((c, j) => (i === j ? 99 : ds[i][c])))), [rl, rh] = spreadOf(ownRoom(ds, 2));
    if (apart < t.apart) bad.apart.push(`${s} seats: ${apart} apart`);
    if (rh - rl > t.room) bad.room.push(`${s} seats: ${rl} to ${rh}`);
  }
  put("area.start", !bad.start.length, bad.start.length ? `none for ${bad.start.join(", ")} seats` : "all seat counts");
  put("area.apart", !bad.apart.length, bad.apart.join("; ") || "fine");
  put("area.room", !bad.room.length, bad.room.join("; ") || "fine");
  return out;
}

/** A hex island (The Island Fable): b a hex board, water 1 for sea. homes or owner say how it starts. */
export function isleCard(b, water, { want = 0, seats = 0, homes = null, owner = null, name = null, t = T } = {}) {
  const out = [], put = (id, ok, say) => out.push({ id, ok: !!ok, say: String(say) });
  const land = b.cells.map((_, i) => i).filter((i) => !water[i]), dry = (m) => !water[m];
  const piece = (i) => joined(b.near, i, dry), pieces = [];
  for (const i of land) if (!pieces.some((p) => p.has(i))) pieces.push(new Set(piece(i)));
  if (want) put("isle.size", Math.abs(land.length - want) * 100 <= t.land * want, `${land.length} land of ${want}`);
  put("isle.piece", pieces.length === 1, `${pieces.length} pieces (${pieces.map((p) => p.size).join(", ")})`);
  const roads = seaRoads(b, water, t.boats), seen = new Set([land[0]]), list = [land[0]];
  for (let k = 0; k < list.length; k++) for (const m of [...b.near[list[k]].filter(dry), ...roads[list[k]]]) if (!seen.has(m)) { seen.add(m); list.push(m); }
  put("isle.reach", seen.size === land.length, `${seen.size} of ${land.length} reachable`);
  if (name) put("isle.names", unique(land.map(name)), `${land.length} names`);
  if (owner && !homes) {
    const held = Array.from({ length: seats }, (_, s) => owner.filter((o) => o === s).length), [lo, hi] = spreadOf(held);
    put("isle.deal", lo === hi && lo > 0, `${lo} to ${hi} cells a seat`);
  }
  if (!homes) return out;
  const okHomes = homes.length === seats && new Set(homes).size === seats && homes.every((h) => !water[h] && b.near[h].filter(dry).length >= 2);
  put("isle.homes", okHomes, `${homes.length} homes for ${seats} seats`);
  if (!okHomes) return out;
  const alone = homes.filter((h) => homes.filter((o) => pieces.find((p) => p.has(h)).has(o)).length === 1).length;
  put("isle.alone", !alone, `${alone} homes alone on their land`);
  const ds = homes.map((h) => steps(b.near, [h], dry)), gaps = homes.map((h, i) => Math.min(...homes.map((o, j) => (i === j || ds[i][o] < 0 ? 99 : ds[i][o]))));
  put("isle.apart", Math.min(...gaps) >= t.isleApart, `nearest rival ${Math.min(...gaps)} to ${Math.max(...gaps)} steps`);
  const [lo, hi] = spreadOf(ownRoom(ds, 3));
  put("isle.room", (hi - lo) * 100 <= t.isleRoom * hi, `own land within 3 steps ${lo} to ${hi} cells, ${fixed(((hi - lo) * 100) / hi)}%`);
  return out;
}

/** Ways out of 36 that a number comes up: two dice added, or the higher of two. */
const waysOf = (roll, x) => (roll === "sum" ? (x >= 2 && x <= 12 ? 6 - Math.abs(7 - x) : 0) : x >= 1 && x <= 6 ? 2 * x - 1 : 0);
/** A Grain and Glass island: p is its opening position. */
export function glassCard(b, p, { t = T } = {}) {
  const out = [], put = (id, ok, say) => out.push({ id, ok: !!ok, say: String(say) });
  const land = p.land.flatMap((l, i) => (l ? [i] : [])), work = land.filter((i) => p.good[i] >= 0), roll = p.rule.roll, want = landFor(p.rule.size, p.seats);
  put("glass.size", land.length === want && joined(b.near, land[0], (m) => p.land[m]).length === land.length, `${land.length} land of ${want}`);
  const count = [0, 1, 2, 3].map((g) => work.filter((i) => p.good[i] === g).length), [cl, ch] = spreadOf(count);
  put("glass.goods", cl > 0 && ch - cl <= 1, `${count.join(" / ")} hexes a good`);
  put("glass.numbers", work.every((i) => waysOf(roll, p.num[i]) > 0), `${work.length} producing hexes`);
  const top = Math.max(...[...Array(13).keys()].map((x) => waysOf(roll, x))), busy = (i) => p.good[i] >= 0 && p.land[i] && waysOf(roll, p.num[i]) * 4 >= top * 3;
  const touch = work.filter((i) => busy(i) && b.near[i].some(busy)).length;
  put("glass.busy", !touch, `${touch} busiest hexes touch another`);
  const made = [0, 1, 2, 3].map((g) => work.filter((i) => p.good[i] === g && i !== p.gate).reduce((s, i) => s + waysOf(roll, p.num[i]), 0)), [yl, yh] = spreadOf(made);
  put("glass.yield", yh <= t.yield * yl, `${made.join(" / ")} ways a good, ${fixed(yh / Math.max(1, yl))} times`);
  const ports = land.filter((i) => p.port[i] >= 0), coast = (i) => b.near[i].length < 6 || b.near[i].some((m) => !p.land[m]);
  put("glass.ports", ports.length >= 4 && [0, 1, 2, 3].every((k) => ports.some((i) => p.port[i] === k)) && ports.every(coast), `${ports.length} ports`);
  const side = ports.filter((i) => b.near[i].some((m) => p.port[m] >= 0)).length;
  put("glass.portgap", !side, `${side} ports beside another`);
  // a snake draft of depots, each seat taking the best free spot for what it gathers (the hex and its six neighbours)
  const gather = (i) => [i, ...b.near[i]].reduce((s, c) => s + (p.land[c] && p.good[c] >= 0 && c !== p.gate ? waysOf(roll, p.num[c]) : 0), 0);
  const taken = new Set(), score = Array(p.seats).fill(0);
  for (let k = 0; k < 2 * p.seats; k++) {
    const s = k < p.seats ? k : 2 * p.seats - 1 - k, free = land.filter((i) => !taken.has(i) && b.near[i].every((m) => !taken.has(m)));
    if (!free.length) break;
    const at = free.reduce((x, y) => (gather(y) > gather(x) ? y : x));
    taken.add(at);
    score[s] += gather(at);
  }
  const [dl, dh] = spreadOf(score);
  put("glass.draft", (dh - dl) * 100 <= t.draft * dh, `${score.join(" / ")} ways by seat, ${fixed(((dh - dl) * 100) / Math.max(1, dh))}%`);
  return out;
}

/** An Inch of Ink in turns: homes and the price of each cell. */
export function inchCard(b, homes, cost, { t = T } = {}) {
  const out = [], put = (id, ok, say) => out.push({ id, ok: !!ok, say: String(say) });
  const ds = homes.map((h) => steps(b.near, [h])), gaps = homes.flatMap((h, i) => homes.slice(i + 1).map((o) => ds[i][o]));
  put("inch.homes", new Set(homes).size === homes.length && new Set(gaps).size === 1, `homes ${gaps.join(", ")} apart`);
  const hills = ds.map((d) => cost.reduce((s, c, i) => s + (d[i] > 0 && d[i] <= 2 ? c - 1 : 0), 0)), [lo, hi] = spreadOf(hills);
  put("inch.room", hi - lo <= t.inchRoom, `${hills.join(" / ")} hills within 2 steps`);
  return out;
}

/** An Inch of Ink in real time: b the live board, p the opening (bots placed, the player still to start). */
export function liveCard(b, p, { t = T, free = 1 } = {}) {
  const out = [], put = (id, ok, say) => out.push({ id, ok: !!ok, say: String(say) });
  const seen = new Uint8Array(b.n), list = [b.dry[0]], sea = new Map();
  seen[b.dry[0]] = 1;
  for (let k = 0; k < list.length; k++) { // walk the land; from each coast, sail up to the map's range
    const i = list[k], wet = b.near[i].filter((m) => !b.land[m] && (sea.get(m) ?? 99) > 1), ring = wet.map((m) => [m, 1]);
    for (const [m] of ring) sea.set(m, 1);
    for (let j = 0; j < ring.length; j++) for (const x of b.near[ring[j][0]]) { if (b.land[x]) { if (!seen[x]) { seen[x] = 1; list.push(x); } } else if (ring[j][1] < b.range && (sea.get(x) ?? 99) > ring[j][1] + 1) { sea.set(x, ring[j][1] + 1); ring.push([x, ring[j][1] + 1]); } }
    for (const m of b.near[i]) if (b.land[m] && !seen[m]) { seen[m] = 1; list.push(m); }
  }
  put("live.reach", list.length === b.total, `${list.length} of ${b.total} land cells, ${b.masses} landmasses, range ${b.range}`);
  put("live.free", free > 0, `${free} places to start`);
  put("live.names", p.names.length === p.troops.length && unique(p.names), `${p.names.length} names`);
  const placed = p.land.slice(1).filter((x) => x > 0).length;
  put("live.spawn", placed === p.troops.length - 1, `${placed} of ${p.troops.length - 1} nations placed`);
  const room = [];
  for (let s = 1; s < p.troops.length; s++) { const at = p.owner.indexOf(s); if (at >= 0) room.push(steps(b.near, [at], (m) => b.land[m]).filter((d) => d >= 0 && d <= 5).length); }
  const [lo, hi] = spreadOf(room);
  put("live.room", hi <= t.liveRoom * lo, `${lo} to ${hi} land cells within 5 steps`);
  return out;
}

/** Every kind of board, with a few seeds each. Returns rows of { kind, id, boards, failed, say, where }. */
export function sweep({ seeds = 40 } = {}) {
  const rows = new Map(), note = (kind, where, results) => {
    for (const r of results) {
      const k = `${kind}|${r.id}`, row = rows.get(k) || rows.set(k, { kind, id: r.id, boards: 0, failed: 0, say: r.say, where }).get(k);
      row.boards++;
      if (!r.ok) { if (!row.failed) Object.assign(row, { say: r.say, where }); row.failed++; }
    }
  };
  const open = (game, options, seed) => createMatch(game, { seed, options }).position, many = (k) => Array.from({ length: k }, (_, i) => `card ${i + 1}`);
  const seatsOf = (game) => game.options.seats.values;
  for (const map of banners.options.map.values) {
    for (const seed of many(map === "world" ? 1 : seeds)) note(`banners ${map}`, seed, areaCard(areaOf(open(banners, { map, seats: 2 }, seed)), { seats: seatsOf(banners) }));
  }
  const fableSeeds = Math.max(1, Math.ceil(seeds / 4));
  for (const seats of seatsOf(fable)) {
    for (const seed of many(fableSeeds)) {
      const capo = open(fable, { style: "ours", seats }, seed), b = fableOf(capo);
      note("fable capo", `${seats} seats, ${seed}`, isleCard(b, capo.water, { seats, homes: capo.owner.flatMap((o, i) => (capo.hall[i] ? [i] : [])).sort((x, y) => capo.owner[x] - capo.owner[y]), name: (i) => fableName(capo, i) }));
      for (const isle of fable.options.isle.values) for (const size of fable.options.size.values) {
        const where = `${size}, ${seats} seats, ${seed}`, p = open(fable, { style: "classic", isle, size, seats }, seed), q = open(fable, { style: "custom", isle, size, seats, start: "homes" }, seed);
        note(`fable ${isle}`, where, isleCard(fableOf(p), p.water, { want: FABLE_SIZES[p.rule.size].land, seats, owner: p.owner, name: (i) => fableName(p, i) }));
        note(`fable homes ${isle}`, where, isleCard(fableOf(q), q.water, { seats, homes: q.owner.flatMap((o, i) => (q.hall[i] ? [i] : [])).sort((x, y) => q.owner[x] - q.owner[y]) }));
      }
    }
  }
  for (const size of glass.options.size.values) for (const roll of glass.options.roll.values) for (const seats of seatsOf(glass)) {
    for (const seed of many(fableSeeds)) { const p = open(glass, { style: "custom", size, roll, seats }, seed); note(`glass ${size} ${roll}`, `${seats} seats, ${seed}`, glassCard(glassOf(p), p)); }
  }
  for (const size of inch.options.size.values) for (const seats of seatsOf(inch)) {
    for (const seed of many(seeds)) { const p = open(inch, { style: "custom", live: false, size, seats }, seed); note(`inch turns ${size}`, `${seats} seats, ${seed}`, inchCard(inchOf(p), p.home, p.cost)); }
  }
  for (const map of inch.options.map.values) for (const nations of inch.options.nations.values) {
    for (const seed of many(map === "world" ? 1 : fableSeeds)) { const p = open(inch, { style: "classic", map, nations }, seed); note(`inch live ${map}`, `${nations} nations, ${seed}`, liveCard(liveBoardFor(p), p, { free: inch.moves(p).length })); }
  }
  return [...rows.values()];
}

/** What the gate makes of a sweep: stops for failures off the to-do list, notes for the rest. */
export function verdict(rows, { todo = TODO, unseen = false } = {}) {
  const bad = [], kinds = new Map(), list = new Set(todo);
  for (const r of rows) {
    if (r.failed && !list.has(`${r.kind}|${r.id}`)) bad.push(`map card: ${r.kind} ${r.id} failed ${r.failed} of ${r.boards} (${r.where}: ${r.say})`);
    else if (r.failed) kinds.set(r.kind, [...(kinds.get(r.kind) || []), `${r.id} ${r.failed}/${r.boards}`]);
  }
  const note = [...kinds].map(([kind, ids]) => `map card to-do, ${kind}: ${ids.join(", ")}`), passing = todo.filter((k) => !rows.some((r) => `${r.kind}|${r.id}` === k && r.failed));
  if (unseen && passing.length) note.push(`map card: on the to-do list but not seen failing in this sweep: ${passing.join(", ")}`);
  if (note.length) note.push("map card: node tools/report.mjs for the full sweep and what each check asks");
  return { bad, note };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => (process.argv.includes(k) ? Number(process.argv[process.argv.indexOf(k) + 1]) : d), t0 = Date.now();
  const seeds = process.argv.includes("--quick") ? 2 : arg("--seeds", 40), rows = sweep({ seeds }), v = verdict(rows, { unseen: true });
  if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 1));
  else {
    console.log(`| Kind | Check | Level | Asks | Boards | Failed | First failure, or a sample |\n|---|---|---|---|---|---|---|`);
    for (const r of rows) console.log(`| ${r.kind} | ${r.id} | ${CHECKS[r.id][0]} | ${CHECKS[r.id][1]} | ${r.boards} | ${r.failed ? `**${r.failed}**` : 0} | ${r.failed ? `${r.where}: ` : ""}${r.say} |`);
    console.log("\nTo do (fails on current maps):");
    for (const r of rows.filter((x) => x.failed)) console.log(`- [ ] ${r.kind}: ${r.id} (${CHECKS[r.id][0]}), ${r.failed} of ${r.boards} boards. ${r.where}: ${r.say}`);
  }
  for (const n of v.note.filter((x) => x.startsWith("map card: on"))) console.log("note  " + n);
  for (const b of v.bad) console.log("STOP  " + b);
  console.log(`${rows.reduce((s, r) => s + r.boards, 0)} checks on ${seeds} seeds a kind, ${rows.filter((r) => r.failed).length} of ${rows.length} kind-checks fail, ${v.bad.length} outside the to-do list. ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
  process.exitCode = v.bad.length ? 1 : 0;
}
