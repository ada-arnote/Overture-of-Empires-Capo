// SPDX-License-Identifier: AGPL-3.0-or-later
// Sheet bots for Margins of Trust. A bot plans its whole sheet from the open board alone (who holds what, how strong,
// the season), then writes it one order at a time and seals it. It never reads anyone's sheet, its own excepted, so
// sealed sheets cannot sway it; the same board always gives the same sheet.
//   easy: takes empty land and pokes at the weakest neighbour, keeping nothing back.
//   normal: weighs ports, keeps back half of what could strike each province, supports its own attacks and holds,
//           and leans on whoever leads.
//   hard: keeps back all of it, and also crosses the sea with a transport of its own.
// Promises (forms.js) are not made or answered yet: bots play without talk for now.
import { chance, seedState } from "../../core/index.js";
import { NONE, alive, boardOf, bySea, mineOf, portsOf } from "./rules.js";

export const TIERS = ["easy", "normal", "hard"];
const CARE = { easy: 0, normal: 1, hard: 2, gentle: 0 }; // halves of the threat kept back at home

/** For each province, the most one rival seat could bring against it by land next season. */
export function threats(p, seat) {
  const b = boardOf(p), out = Array(b.n).fill(0);
  for (let t = 0; t < b.n; t++) {
    const by = new Map();
    for (const j of b.near[t]) { const o = p.owner[j]; if (o >= 0 && o !== seat && p.str[j] > 1) by.set(o, (by.get(o) || 0) + p.str[j] - 1); }
    out[t] = Math.max(0, ...by.values());
  }
  return out;
}

/** The seats that lead in ports, ahead of this one: every seat tied at the top, so no number is singled out. */
function leaders(p, seat) {
  const ports = Array.from({ length: p.seats }, (_, s) => (s !== seat && alive(p, s) ? portsOf(p, s) : -1)), most = Math.max(...ports);
  return most > portsOf(p, seat) ? ports.flatMap((v, s) => (v === most ? [s] : [])) : [];
}

/** Steps from each province to the nearest one this seat does not hold. */
function toFront(p, seat) {
  const b = boardOf(p), d = Array(b.n).fill(-1), list = [];
  for (let i = 0; i < b.n; i++) if (p.owner[i] !== seat) { d[i] = 0; list.push(i); }
  for (let k = 0; k < list.length; k++) for (const j of b.near[list[k]]) if (d[j] < 0) { d[j] = d[list[k]] + 1; list.push(j); }
  return d;
}

/** The whole sheet: a list of orders, holds left out (an unordered province holds). */
export function plan(p, seat, tier = "normal") {
  const b = boardOf(p), threat = threats(p, seat), lead = leaders(p, seat), care = CARE[tier] ?? 1;
  const dice = chance(seedState(`margins-bot/${p.key}/${p.seats}/${p.year}/${p.half}/${seat}/${tier}/${p.owner.join()}/${p.str.join()}`));
  const spare = (i) => Math.max(0, p.str[i] - 1 - Math.floor((threat[i] * care) / 2));
  const used = new Set(), sheet = [];
  // every list is walked in a random order of the game's own, never by number: numbers run round the sea from seat 0,
  // so walking by number would treat seat 0's march differently from the others
  const rank = dice.shuffle(b.names.map((_, i) => i)), tie = (x, y) => rank.indexOf(x) - rank.indexOf(y), mine = mineOf(p, seat).sort(tie);
  const worth = (t) => (b.port[t] ? 30 : 10) + (lead.includes(p.owner[t]) ? 12 : 0) + (p.owner[t] === NONE ? 6 : 0) + dice.below(tier === "easy" ? 24 : 12);
  // attacks: the best targets first, each from the neighbour with most to spare, backed by others beside it
  const targets = [...new Set(mine.flatMap((i) => b.near[i]).filter((t) => p.owner[t] !== seat))].sort(tie);
  const ranked = targets.map((t) => ({ t, need: (p.owner[t] === NONE ? 0 : p.str[t]) + 1, v: worth(t) })).sort((x, y) => y.v * x.need - x.v * y.need || tie(x.t, y.t));
  for (const { t, need } of ranked) {
    const from = b.near[t].filter((i) => p.owner[i] === seat && !used.has(i) && spare(i) > 0).sort((x, y) => spare(y) - spare(x) || tie(x, y));
    if (!from.length) continue;
    const go = from[0], helpers = tier === "easy" ? [] : b.near[t].filter((i) => p.owner[i] === seat && !used.has(i) && i !== go).sort(tie);
    const n = Math.min(spare(go), need + (tier === "easy" ? 0 : 1)), backing = Math.max(0, need - n);
    if (n + Math.min(backing, helpers.length) < need) continue;
    used.add(go);
    sheet.push({ at: go, kind: "move", to: t, n });
    for (const h of helpers.slice(0, backing)) { used.add(h); sheet.push({ at: h, kind: "support", to: t, seat }); }
  }
  // the hard bot crosses the sea: a port with strength to spare, a weak port across the water, and its own transport
  if (tier === "hard") {
    const ports = mine.filter((i) => b.port[i] && !used.has(i));
    for (const go of ports) {
      if (used.has(go) || spare(go) < 2) continue;
      const aim = b.port.map((x, t) => t).filter((t) => bySea(b, go, t) && p.owner[t] !== seat && p.str[t] + 1 <= spare(go)).sort((x, y) => p.str[x] - p.str[y] || tie(x, y))[0];
      const carrier = ports.find((c) => c !== go && !used.has(c));
      if (aim === undefined || carrier === undefined) continue;
      used.add(go); used.add(carrier);
      sheet.push({ at: go, kind: "move", to: aim, n: spare(go) }, { at: carrier, kind: "transport", a: Math.min(go, aim), b: Math.max(go, aim) });
    }
  }
  // what is left: back up a neighbour in danger, or send strength from safe land towards the front
  const front = toFront(p, seat);
  for (const i of mine) {
    if (used.has(i)) continue;
    const danger = tier === "easy" ? undefined : [...b.near[i]].sort(tie).find((j) => p.owner[j] === seat && threat[j] >= p.str[j] && threat[j] > 0 && !sheet.some((o) => o.at === j && o.kind === "move"));
    if (danger !== undefined && threat[i] === 0) { used.add(i); sheet.push({ at: i, kind: "support", to: danger, seat }); continue; }
    if (front[i] > 1 && p.str[i] > 1) {
      const to = b.near[i].filter((j) => p.owner[j] === seat).sort((x, y) => front[x] - front[y] || tie(x, y))[0];
      if (to !== undefined && front[to] < front[i]) { used.add(i); sheet.push({ at: i, kind: "move", to, n: p.str[i] - 1 }); }
    }
  }
  return sheet.sort((x, y) => x.at - y.at);
}

/** The next move: the next planned order not yet written, else seal. */
export function choose(p, dice, tier = "normal") {
  const seat = p.seat, done = new Set(p.orders[seat].map((o) => o.at));
  const o = plan(p, seat, tier).find((x) => !done.has(x.at));
  return o ? { do: "order", ...o } : { do: "done" };
}

export function* thinking(p, dice, kind) {
  return choose(p, dice, kind);
}
