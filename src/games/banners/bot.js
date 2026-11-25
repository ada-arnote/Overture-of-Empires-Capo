// SPDX-License-Identifier: AGPL-3.0-or-later
// Bots for Brass and Banners. They see only what a player sees, and work out the same odds the player is shown.
import { NONE, banners, boardOf, bonusOf, cellsOf, goalOf, odds } from "./rules.js";
import { steps } from "../areas.js";

export const TIERS = ["random", "easy", "normal"];
const MILLION = 1000000;

/** How much a seat wants a place, in hundredths of one ordinary place. */
export function worth(p, seat, at) {
  const b = boardOf(p), land = b.region[at], o = p.owner[at];
  let v = 100, left = 0, whole = o !== NONE;
  for (let i = 0; i < p.owner.length; i++) if (b.region[i] === land) { if (p.owner[i] !== seat) left++; if (p.owner[i] !== o) whole = false; }
  const bonus = bonusOf(b, land);
  v += left === 1 ? 120 * bonus : Math.floor((60 * bonus) / left);
  if (o !== NONE) {
    v += 60;
    if (whole) v += 120 * bonus;
    const n = cellsOf(p, o);
    if (n <= 3) v += 400 - 100 * n; // about to be put out
    v += Math.max(0, n * 3 - cellsOf(p, seat)) ; // hold back whoever is ahead
  }
  return v;
}

const strongest = (p, seat, at) => boardOf(p).near[at].reduce((n, m) => (p.owner[m] !== NONE && p.owner[m] !== seat ? Math.max(n, p.str[m]) : n), 0);

/** The best attack a seat has with `extra` more strength at one place, as [value, to]. */
function best(p, seat, from, extra, floor) {
  let top = 0, to = -1;
  for (const m of boardOf(p).near[from]) {
    if (p.owner[m] === seat) continue;
    const o = odds(p.str[from] - 1 + extra, p.str[m]);
    if (o < floor) continue;
    const v = Math.floor((worth(p, seat, m) * o) / MILLION);
    if (v > top) { top = v; to = m; }
  }
  return [top, to];
}

function place(p, dice, noise) {
  const { near } = boardOf(p), s = p.seat, mine = p.owner.flatMap((o, i) => (o === s ? [i] : [])), edge = mine.filter((i) => near[i].some((m) => p.owner[m] !== s));
  let at = edge[0] ?? mine[0], score = -1;
  for (const i of edge) {
    let [v] = best(p, s, i, p.left, 350000);
    const threat = strongest(p, s, i);
    if (threat > p.str[i]) v += Math.floor((worth(p, s, i) * Math.max(0, odds(threat - 1, p.str[i]) - odds(threat - 1, p.str[i] + p.left))) / MILLION);
    v += dice.below(noise);
    if (v > score) { score = v; at = i; }
  }
  return { do: "place", at, n: p.left };
}

function attack(p, dice, noise, floor) {
  const { near } = boardOf(p), s = p.seat, goal = goalOf(p) - cellsOf(p, s);
  let pick = null, score = 0;
  for (let i = 0; i < p.owner.length; i++) {
    if (p.owner[i] !== s || p.str[i] < 2) continue;
    for (const m of near[i]) {
      if (p.owner[m] === s) continue;
      const o = odds(p.str[i] - 1, p.str[m]);
      if (o < (goal <= 2 ? Math.min(floor, 400000) : floor)) continue;
      // attack from where the rest of the strength is least needed
      const spare = near[i].some((x) => x !== m && p.owner[x] !== s) ? 0 : 25;
      const v = Math.floor((worth(p, s, m) * o) / MILLION) + spare + dice.below(noise);
      if (v > score) { score = v; pick = { do: "attack", from: i, to: m, roll: "all" }; }
    }
  }
  return pick;
}

function occupy(p) {
  const { near } = boardOf(p), s = p.seat, { from, to } = p.pend, n = p.str[from] - 1, open = (i) => near[i].some((m) => p.owner[m] !== s);
  if (!open(from)) return n;
  if (!open(to)) return 0;
  const [there] = best({ ...p, str: p.str.map((v, i) => (i === to ? v + n : v)) }, s, to, 0, 500000), [here] = best(p, s, from, 0, 500000);
  if (there === 0 && here === 0) return strongest(p, s, to) >= strongest(p, s, from) ? n : 0;
  return there >= here ? n : 0;
}

/** The last move: bring the largest idle strength towards the border that needs it. */
function move(p) {
  const { near } = boardOf(p), s = p.seat, open = (i) => near[i].some((m) => p.owner[m] !== s), mine = p.owner.flatMap((o, i) => (o === s ? [i] : []));
  const idle = mine.filter((i) => !open(i) && p.str[i] > 1);
  if (!idle.length) return null;
  const from = idle.reduce((a, b) => (p.str[b] > p.str[a] ? b : a)), d = steps(near, [from], (m) => p.owner[m] === s);
  const ends = mine.filter((i) => open(i) && d[i] > 0);
  if (!ends.length) return null;
  const need = (i) => strongest(p, s, i) - p.str[i], to = ends.reduce((a, b) => (need(b) > need(a) ? b : a));
  return { do: "move", from, to, n: p.str[from] - 1 };
}

function* plan(p, dice, tier) {
  if (tier === "random") {
    const all = banners.moves(p);
    if (p.phase === "attack") {
      const fights = all.filter((m) => m.do === "attack");
      return fights.length && dice.below(4) ? dice.pick(fights) : all[0];
    }
    return dice.pick(all);
  }
  const noise = tier === "easy" ? 160 : 6, floor = tier === "easy" ? 420000 : 600000;
  if (p.phase === "place") return place(p, dice, noise);
  yield;
  if (p.phase === "occupy") return { do: "occupy", n: tier === "easy" ? p.str[p.pend.from] - 1 : occupy(p) };
  return attack(p, dice, noise, floor) || move(p) || { do: "end" };
}

/** Choose a move a little at a time. `dice` breaks ties and drives random. */
export function* thinking(p, dice, tier = "normal") {
  const want = yield* plan(p, dice, tier), all = banners.moves(p);
  if (want.n === undefined) return want;
  // amounts are offered in steps when there are many: take the nearest one that is offered
  const same = all.filter((m) => m.do === want.do && m.at === want.at && m.from === want.from && m.to === want.to);
  return same.reduce((a, b) => (Math.abs(b.n - want.n) < Math.abs(a.n - want.n) ? b : a));
}

export function choose(p, dice, tier) {
  const t = thinking(p, dice, tier);
  for (;;) { const s = t.next(); if (s.done) return s.value; }
}
