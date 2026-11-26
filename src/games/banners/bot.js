// SPDX-License-Identifier: AGPL-3.0-or-later
// Bots for Brass and Banners. They see only what a player sees, and work out the same odds the player is shown.
import { FORT, HAND, NONE, banners, boardOf, bonusOf, cellsOf, goalOf, nearOf, odds, setsOf, setWorth } from "./rules.js";
import { steps } from "../areas.js";

export const TIERS = ["random", "easy", "normal"];
const MILLION = 1000000;

/** How much a seat wants a place, in hundredths of one ordinary place. */
export function worth(p, seat, at) {
  const b = boardOf(p), land = b.region[at], o = p.owner[at];
  let v = 100, left = 0, whole = o !== NONE;
  for (let i = 0; i < p.owner.length; i++) if (b.region[i] === land) { if (p.owner[i] !== seat) left++; if (p.owner[i] !== o) whole = false; }
  const bonus = bonusOf(b, land), g = p.goals?.[seat];
  v += left === 1 ? 120 * bonus : Math.floor((60 * bonus) / Math.max(1, left));
  if (g?.kind === "lands" && g.lands.includes(land)) v += 90;
  if (p.caps && p.caps.some((c, s) => c === at && s !== seat)) v += 260;
  if (o !== NONE) {
    v += 60;
    if (whole) v += 120 * bonus;
    const n = cellsOf(p, o);
    if (n <= 3) v += 400 - 100 * n + 60 * p.hands[o].length + (p.rule.spoils === "trade" && p.hands[seat].length + p.hands[o].length >= HAND ? 150 : 0); // about to be put out, and their cards handed in at once
    if (g?.kind === "rival" && g.seat === o) v += 70;
    if (p.leaders && p.leaders[o] === at) v += 70;
    v += Math.max(0, n * 3 - cellsOf(p, seat)); // hold back whoever is ahead
  }
  return v;
}

const strongest = (p, seat, at) => nearOf(p, at).reduce((n, m) => (p.owner[m] !== NONE && p.owner[m] !== seat ? Math.max(n, p.str[m]) : n), 0);

/** The best attack a seat has with `extra` more strength at one place, as [value, to]. */
function best(p, seat, from, extra, floor) {
  let top = 0, to = -1;
  for (const m of nearOf(p, from)) {
    if (p.owner[m] === seat) continue;
    const o = odds(p, from, m, p.str[from] - 1 + extra);
    if (o < floor) continue;
    const v = Math.floor((worth(p, seat, m) * o) / MILLION);
    if (v > top) { top = v; to = m; }
  }
  return [top, to];
}
const mineOf = (p) => p.owner.flatMap((o, i) => (o === p.seat ? [i] : []));
/** The chance a neighbour could take a place, with some more strength on it. */
function risk(p, at, more) {
  const foe = nearOf(p, at).filter((m) => p.owner[m] !== NONE && p.owner[m] !== p.seat).reduce((a, m) => (a < 0 || p.str[m] > p.str[a] ? m : a), -1);
  if (foe < 0) return 0;
  const q = { ...p, seat: p.owner[foe], str: p.str.map((v, i) => (i === at ? v + more : v)) };
  return odds(q, foe, at);
}

function place(p, dice, noise) {
  const s = p.seat, mine = mineOf(p), edge = mine.filter((i) => nearOf(p, i).some((m) => p.owner[m] !== s)), list = edge.length ? edge : mine;
  let at = list[0], score = -1;
  for (const i of list) {
    let [v] = best(p, s, i, p.left, 350000);
    const own = p.caps && p.caps[s] === i ? 320 : 0;
    if (strongest(p, s, i) > p.str[i] || own) v += Math.floor(((worth(p, s, i) + own) * Math.max(0, risk(p, i, 0) - risk(p, i, p.left))) / MILLION);
    v += dice.below(noise);
    if (v > score) { score = v; at = i; }
  }
  if (p.phase === "place" && p.forts && p.left >= FORT + 3 && !p.forts[at] && risk(p, at, 0) > 500000) return { do: "fort", at };
  return { do: "place", at, n: p.left };
}
/** Claim beside what you hold, and finish lands. */
function claim(p, dice) {
  const b = boardOf(p), s = p.seat, free = p.owner.flatMap((o, i) => (o === NONE ? [i] : []));
  const v = (i) => { const k = b.region[i], mine = p.owner.filter((o, c) => o === s && b.region[c] === k).length, theirs = p.owner.filter((o, c) => o !== s && o !== NONE && b.region[c] === k).length; return 30 * mine - 22 * theirs - 3 * b.sizes[k] + 8 * b.near[i].filter((m) => p.owner[m] === s).length + dice.below(6); };
  const list = free.map((i) => [v(i), i]);
  return { do: "claim", at: list.reduce((a, c) => (c[0] > a[0] ? c : a))[1] };
}

function attack(p, dice, noise, floor) {
  if (p.rule.opening === "truce" && p.round === 1) return null; // nobody strikes in the first round
  const s = p.seat, goal = goalOf(p) - cellsOf(p, s);
  let pick = null, score = 0;
  for (let i = 0; i < p.owner.length; i++) {
    if (p.owner[i] !== s || p.str[i] < 2) continue;
    if (p.caps && p.caps[s] === i && p.str[i] < 2 * strongest(p, s, i) && risk(p, i, 0) < 600000 && strongest(p, s, i) > 2) continue; // a capital is not emptied
    for (const m of nearOf(p, i)) {
      if (p.owner[m] === s) continue;
      const o = odds(p, i, m);
      if (o < (goal <= 2 ? Math.min(floor, 400000) : floor)) continue;
      // attack from where the rest of the strength is least needed
      const spare = nearOf(p, i).some((x) => x !== m && p.owner[x] !== s) ? 0 : 25;
      const v = Math.floor((worth(p, s, m) * o) / MILLION) + spare + dice.below(noise);
      if (v > score) { score = v; pick = { do: "attack", from: i, to: m, roll: "all" }; }
    }
  }
  return pick;
}

function occupy(p) {
  const s = p.seat, { from, to } = p.pend, n = p.str[from] - 1, open = (i) => nearOf(p, i).some((m) => p.owner[m] !== s);
  if (p.caps && p.caps[s] === from && strongest(p, s, from)) return Math.max(0, Math.min(n, p.str[from] - strongest(p, s, from) - 1));
  if (!open(from)) return n;
  if (!open(to)) return 0;
  const [there] = best({ ...p, str: p.str.map((v, i) => (i === to ? v + n : v)) }, s, to, 0, 500000), [here] = best(p, s, from, 0, 500000);
  if (there === 0 && here === 0) return strongest(p, s, to) >= strongest(p, s, from) ? n : 0;
  return there >= here ? n : 0;
}

/** The last move: bring the largest idle strength towards the border that needs it. */
function move(p) {
  const s = p.seat, b = boardOf(p), near = p.event === "storm" ? b.dry : b.near, open = (i) => near[i].some((m) => p.owner[m] !== s), mine = mineOf(p);
  const idle = mine.filter((i) => !open(i) && p.str[i] > 1);
  if (!idle.length) return null;
  const from = idle.reduce((a, c) => (p.str[c] > p.str[a] ? c : a)), d = steps(near, [from], (m) => p.owner[m] === s);
  const ends = mine.filter((i) => open(i) && d[i] > 0);
  if (!ends.length) return null;
  const need = (i) => strongest(p, s, i) - p.str[i], to = ends.reduce((a, c) => (need(c) > need(a) ? c : a));
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
  // the lesson's bot ("gentle", not offered at the table): it plays as easy, strikes nobody in round 1, then takes at most one province a turn, and only on good odds
  const gentle = tier === "gentle", noise = tier === "easy" || gentle ? 160 : 6, floor = gentle ? 700000 : tier === "easy" ? 420000 : 600000;
  if (gentle && p.phase === "attack" && (p.round < 2 || p.took)) return move(p) || { do: "end" };
  if (p.phase === "claim") return claim(p, dice);
  if (p.phase === "place") {
    const sets = setsOf(p, p.seat);
    if (sets.length) return { do: "trade", cards: sets.reduce((a, c) => (setWorth(p, p.seat, c) > setWorth(p, p.seat, a) ? c : a)) };
  }
  if (p.phase === "place" || p.phase === "setup") return place(p, dice, noise);
  yield;
  if (p.phase === "occupy") return { do: "occupy", n: tier === "easy" || gentle ? p.str[p.pend.from] - 1 : occupy(p) };
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
