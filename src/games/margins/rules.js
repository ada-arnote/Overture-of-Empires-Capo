// SPDX-License-Identifier: AGPL-3.0-or-later
// Margins of Trust: three to five seats round an inner sea. Each season every seat writes one order for each province
// it holds, in secret; when the last sheet is sealed, all are revealed and resolved at once (resolve.js), each order
// with its reason. Spring, autumn, then winter: ports grow, supply trims. Whole numbers only, no dice, no clock.
//
// A move is one order, { do: "order", at, kind, ... }, then { do: "done" } seals the sheet. The seat to write is the
// lowest one still in that has not sealed. Unordered provinces hold.
//   hold                      { kind: "hold" }
//   move n to a neighbour     { kind: "move", to, n }      leaving at least 1; port to port across the sea needs a transport
//   support a seat            { kind: "support", to, seat } its move into `to`, or its hold of `to` if it holds it
//   transport (ports only)    { kind: "transport", a, b }  carries a move between two ports, a < b
// Traditional: more than half the ports at a winter wins; when the years run out, the most ports (ties shared).
// Capo: points at each winter (1 a port; in each land, 3 for the most provinces and 1 for the next); the most after
// the last winter wins, more ports breaking a tie.
import { bySea, mapOf } from "./map.js";
import { resolve } from "./resolve.js";

export { mapOf, bySea } from "./map.js";
export const VERSION = "1";
export const NONE = -1;
export const YEARS = { classic: 8, ours: 4 };
export const HALVES = ["Spring", "Autumn"];
export const KINDS = ["hold", "move", "support", "transport"];

export const boardOf = (p) => mapOf(p.seats);
export const nameOf = (p, i) => boardOf(p).names[i];
export const mineOf = (p, s) => p.owner.flatMap((o, i) => (o === s ? [i] : []));
export const portsOf = (p, s) => p.owner.reduce((n, o, i) => n + (o === s && boardOf(p).port[i] ? 1 : 0), 0);
export const strengthOf = (p, s) => p.owner.reduce((n, o, i) => n + (o === s ? p.str[i] : 0), 0);
export const alive = (p, s) => p.owner.includes(s);
/** Supply: what a seat may keep through winter. 1 for each province, 2 more for each port. */
export const supplyOf = (p, s) => mineOf(p, s).length + 2 * portsOf(p, s);
export const toWin = (p) => Math.floor(boardOf(p).ports / 2) + 1;
export const seasonText = (p) => `${HALVES[p.half]}, year ${p.year} of ${p.years}`;

const copy = (p) => ({ ...p, owner: [...p.owner], str: [...p.str], orders: p.orders.map((l) => l.map((o) => ({ ...o }))), done: [...p.done], points: p.points && [...p.points] });
const next = (p) => { for (let s = 0; s < p.seats; s++) if (!p.done[s]) return s; return NONE; };
const isInt = (v) => Number.isSafeInteger(v);

/** Every order one province may be given now, by the seat that holds it. */
export function ordersAt(p, at) {
  const b = boardOf(p), s = p.owner[at], out = [{ at, kind: "hold" }], str = p.str[at];
  if (s < 0) return [];
  for (let to = 0; to < b.n; to++) {
    if (!(b.near[at].includes(to) || bySea(b, at, to))) continue;
    for (let n = 1; n < str; n++) out.push({ at, kind: "move", to, n });
  }
  for (const to of b.near[at]) for (let k = 0; k < p.seats; k++) if (alive(p, k)) out.push({ at, kind: "support", to, seat: k });
  if (b.port[at]) for (let a = 0; a < b.n; a++) for (let c = a + 1; c < b.n; c++) if (bySea(b, a, c)) out.push({ at, kind: "transport", a, b: c });
  return out;
}

/** A quick yes or no for one order, the same answer the full list gives. */
export function orderOk(p, o) {
  const b = boardOf(p), s = p.seat, keys = Object.keys(o).sort().join();
  if (!o || !isInt(o.at) || o.at < 0 || o.at >= b.n || p.owner[o.at] !== s || p.orders[s].some((x) => x.at === o.at)) return false;
  if (o.kind === "hold") return keys === "at,do,kind";
  if (o.kind === "move") return keys === "at,do,kind,n,to" && isInt(o.to) && isInt(o.n) && o.n >= 1 && o.n < p.str[o.at] && o.to >= 0 && o.to < b.n && (b.near[o.at].includes(o.to) || bySea(b, o.at, o.to));
  if (o.kind === "support") return keys === "at,do,kind,seat,to" && isInt(o.to) && isInt(o.seat) && b.near[o.at].includes(o.to) && o.seat >= 0 && o.seat < p.seats && alive(p, o.seat);
  if (o.kind === "transport") return keys === "a,at,b,do,kind" && b.port[o.at] && isInt(o.a) && isInt(o.b) && o.a < o.b && o.a >= 0 && o.b < b.n && bySea(b, o.a, o.b);
  return false;
}

/** Winter: each port held grows 1 there; then strength past supply is lost from the strongest provinces, never below 1
 * (of equal ones, the first counting round the sea from the seat's own march). */
function winter(p, events) {
  const b = boardOf(p);
  for (let s = 0; s < p.seats; s++) {
    if (!alive(p, s)) continue;
    let grew = 0, lost = 0;
    for (let i = 0; i < b.n; i++) if (p.owner[i] === s && b.port[i]) { p.str[i]++; grew++; }
    const cap = supplyOf(p, s);
    for (let over = strengthOf(p, s) - cap; over > 0; over--) {
      let top = -1;
      for (let k = 0; k < b.n; k++) { const i = (k + 8 * s) % b.n; if (p.owner[i] === s && p.str[i] > 1 && (top < 0 || p.str[i] > p.str[top])) top = i; } // counted from the seat's own march, so ties fall alike for every seat
      if (top < 0) break;
      p.str[top]--;
      lost++;
    }
    events.push({ kind: "winter", seat: s, grew, lost, supply: cap });
  }
  if (p.points) {
    const got = Array(p.seats).fill(0);
    for (let s = 0; s < p.seats; s++) got[s] = portsOf(p, s);
    for (let k = 0; k < b.lands.length; k++) {
      const held = Array(p.seats).fill(0);
      p.owner.forEach((o, i) => { if (o >= 0 && b.land[i] === k) held[o]++; });
      const ranks = [...new Set(held.filter((v) => v > 0))].sort((x, y) => y - x);
      const first = held.flatMap((v, s) => (v > 0 && v === ranks[0] ? [s] : []));
      if (first.length === 1) {
        got[first[0]] += 3;
        if (ranks[1]) { const second = held.flatMap((v, s) => (v === ranks[1] ? [s] : [])); if (second.length === 1) got[second[0]] += 1; }
      } else for (const s of first) got[s] += 1; // a tie for the most: each scores as the next
    }
    for (let s = 0; s < p.seats; s++) if (alive(p, s)) { p.points[s] += got[s]; events.push({ kind: "score", seat: s, n: got[s], all: p.points[s] }); }
  }
}

/** The most of a figure, and who has it. */
const most = (p, f) => { const v = Array.from({ length: p.seats }, (_, s) => (alive(p, s) ? f(s) : -1)), top = Math.max(...v); return v.flatMap((x, s) => (x === top ? [s] : [])); };

function ending(p, winterNow) {
  const left = Array.from({ length: p.seats }, (_, s) => s).filter((s) => alive(p, s));
  if (left.length === 1) return { winners: left, why: "is the last one holding land" };
  if (!winterNow) return null;
  if (p.style === "classic") {
    const big = left.find((s) => portsOf(p, s) >= toWin(p));
    if (big !== undefined) return { winners: [big], why: `held ${portsOf(p, big)} of the ${boardOf(p).ports} ports at a winter` };
    if (p.year >= p.years) return { winners: most(p, (s) => portsOf(p, s)), why: "held the most ports when the years ran out" };
    return null;
  }
  if (p.year < p.years) return null;
  const top = most(p, (s) => p.points[s]), best = top.length > 1 ? top.filter((s) => portsOf(p, s) === Math.max(...top.map((x) => portsOf(p, x)))) : top;
  return { winners: best, why: best.length > 1 ? "share the most points and ports" : top.length > 1 ? "scored the most points, and held more ports" : "scored the most points" };
}

/** All sheets are in: reveal them, then winter after autumn, then the next season. */
function season(p, events) {
  const b = boardOf(p), r = resolve(b, p.owner, p.str, p.orders);
  events.push({ kind: "reveal", year: p.year, half: p.half });
  for (const x of r.results) events.push({ kind: "order", seat: x.of, r: x });
  for (const t of r.takes) events.push({ kind: "take", ...t });
  const was = Array.from({ length: p.seats }, (_, s) => alive(p, s));
  p.owner = r.owner;
  p.str = r.str;
  const winterNow = p.half === 1;
  if (winterNow) winter(p, events);
  for (let s = 0; s < p.seats; s++) if (was[s] && !alive(p, s)) events.push({ kind: "out", seat: s });
  p.over = ending(p, winterNow);
  if (p.over) { p.seat = NONE; p.orders = p.orders.map(() => []); return; }
  if (winterNow) { p.year++; p.half = 0; } else p.half = 1;
  p.round++;
  p.orders = p.orders.map(() => []);
  p.done = Array.from({ length: p.seats }, (_, s) => !alive(p, s));
  p.seat = next(p);
}

export const margins = {
  id: "margins", version: VERSION,
  options: { style: { values: ["classic", "ours"], normal: "classic" }, seats: { values: [3, 4, 5], normal: 4 }, years: { values: [0, 2, 3, 4, 6, 8], normal: 0 } },

  setup(o, dice) {
    // key: drawn from the seed, for the bots' own choices; the land and the starts are the same in every game
    const b = mapOf(o.seats), p = { key: dice.below(0x40000000), style: o.style, classic: o.style === "classic", seats: o.seats, years: o.years || YEARS[o.style], year: 1, half: 0, round: 1, owner: Array(b.n).fill(NONE), str: Array(b.n).fill(0), orders: Array.from({ length: o.seats }, () => []), done: Array(o.seats).fill(false), seat: 0, points: o.style === "ours" ? Array(o.seats).fill(0) : null, over: null };
    b.starts.forEach((list, s) => { for (const [at, n] of list) { p.owner[at] = s; p.str[at] = n; } });
    return p;
  },
  turn: (p) => (p.over ? null : p.seat),
  moves(p) {
    if (p.over) return [];
    const s = p.seat, written = new Set(p.orders[s].map((o) => o.at));
    return [{ do: "done" }, ...mineOf(p, s).filter((at) => !written.has(at)).flatMap((at) => ordersAt(p, at).map((o) => ({ do: "order", ...o })))];
  },
  allows: (p, m) => !p.over && !!m && (m.do === "done" ? Object.keys(m).length === 1 : m.do === "order" && orderOk(p, m)),
  apply(before, m) {
    const p = copy(before), events = [], s = p.seat;
    if (m.do === "order") {
      const { do: _, ...o } = m;
      p.orders[s].push(o);
      return { position: p, events }; // a sealed sheet says nothing until the reveal
    }
    p.done[s] = true;
    events.push({ kind: "sealed", seat: s });
    p.seat = next(p);
    if (p.seat === NONE) season(p, events);
    return { position: p, events };
  },
  result: (p) => p.over,
};

/** One plain sentence for an order's outcome. name(i): a place's name; who(s): a seat's name. */
export function reason(r, name, who) {
  const at = name(r.at), to = r.to !== undefined ? name(r.to) : "";
  const home = r.kind === "move" && r.code !== "took" && r.code !== "joined" && r.code !== "fell" ? (r.gone ? ` ${at} was taken meanwhile, so they were lost.` : r.back ? ` ${r.back} came home to ${at}.` : " None came home: a bounce costs 1.") : "";
  const by = r.by !== undefined ? name(r.by) : "";
  switch (`${r.kind}/${r.code}`) {
    case "hold/held": return `${at} held. Nobody attacked it.`;
    case "hold/stood": return `${at} held: attacked with ${r.power}, defended with ${r.against}.`;
    case "hold/lost": return `${at} was taken by ${who(r.with)}: ${r.power} against ${r.against}.`;
    case "move/took": return `${r.n} moved from ${at}${r.sea ? " by sea" : ""} and took ${to}${r.was >= 0 ? ` from ${who(r.was)}` : ""}: ${r.power} against ${r.against}.`;
    case "move/joined": return `${r.n} moved from ${at} into ${to}, already yours.`;
    case "move/fell": return `${r.n} moved from ${at} into ${to}, but ${to} fell to ${who(r.with)} and they fell with it.`;
    case "move/held-off": return `${r.n} from ${at} bounced off ${to}: ${r.power} against a defence of ${r.against}.${home}`;
    case "move/tie": return `${r.n} from ${at} bounced off ${to}: tied with ${who(r.with)} at ${r.power}.${home}`;
    case "move/outdone": return `${r.n} from ${at} bounced off ${to}: ${who(r.with)} came stronger, ${r.against} against ${r.power}.${home}`;
    case "move/swap": return `${r.n} from ${at} bounced: ${who(r.with)} moved from ${to} the other way, ${r.against} against ${r.power}.${home}`;
    case "move/no-transport": return `${r.n} from ${at} could not cross to ${to}: ${r.by !== undefined ? `the transport at ${by} was cut` : "no transport stood for that crossing"}.${home}`;
    case "support/given": return r.hold ? `${at} supported ${who(r.seat)}'s hold of ${to}: 1 more to defend.` : `${at} supported ${who(r.seat)}'s move into ${to}: 1 more to attack.`;
    case "support/cut": return `${at}'s support was cut: ${at} was attacked from ${by}.`;
    case "support/void": return `${at}'s support went unused: ${who(r.seat)} neither moved into nor held ${to}.`;
    case "transport/carried": return `${at} carried the crossing between ${name(r.a)} and ${name(r.b)}.`;
    case "transport/cut": return `${at}'s transport was cut: ${at} was attacked from ${by}.`;
    case "transport/void": return `${at} stood ready to carry between ${name(r.a)} and ${name(r.b)}, but nobody crossed.`;
    default: return `${at}: ${r.kind}.`;
  }
}

/** An order as written, in a few words. */
export function orderText(o, name, who) {
  if (o.kind === "move") return `Move ${o.n} to ${name(o.to)}`;
  if (o.kind === "support") return `Support ${who(o.seat)} at ${name(o.to)}`;
  if (o.kind === "transport") return `Carry ${name(o.a)} to ${name(o.b)}`;
  return "Hold";
}
