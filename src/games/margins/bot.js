// SPDX-License-Identifier: AGPL-3.0-or-later
// Bots for Margins of Trust. A bot plans from the open board, the talk and the ledger alone. It never reads anyone's
// sheet, its own excepted, so sealed sheets cannot sway it; the same board and talk always give the same choices.
//   easy: says nothing, accepts no bargain, takes empty land and pokes at the weakest neighbour, keeping nothing back.
//   normal: picks one rival to press (whoever leads it in ports, else the weakest front), offers the others a pact of
//           no strikes and asks them to back its attack; keeps back half of what could strike each province, masses
//           on the rival it presses, supports its own attacks and holds.
//   hard: the same, keeping back all of it, counting the defender's supports, and crossing the sea with a transport.
// Every bot seat has a character (forms.js CAST), drawn at the start and shown to all. The character decides, when a
// promise stands in the bot's way, whether it keeps it or breaks it, exactly as its public line says; and which
// bargains it offers and accepts. Promises made to a bot count as far as it trusts the seat that made them: a seat
// trusted not to strike is not guarded against, and a support promised to a bot's attack is counted.
import { chance, seedState } from "../../core/index.js";
import { CAST } from "./forms.js";
import { NONE, WORDS, alive, boardOf, bySea, mineOf, offerOf, pending, portsOf, strengthOf } from "./rules.js";

export const TIERS = ["easy", "normal", "hard"];
const CARE = { easy: 0, normal: 1, hard: 2, gentle: 0 }; // halves of the threat kept back at home

/** The character of the bot at a seat. */
export const characterOf = (p, seat) => CAST[p.cast[seat]];

/** What seat `to` has seen of `by`'s word: promises `by` made to it, or to everyone, marked kept and broken. */
export function record(p, by, to) {
  let kept = 0, broken = 0;
  for (const e of p.ledger) if (e.by === by && (e.to === to || e.to < 0)) { if (e.mark === "kept") kept++; else if (e.mark === "broken") broken++; }
  return { kept, broken };
}
/** Does `seat` count on `other`'s promises? Yes, until `other` has broken more than a third of those it made to it. */
const trusts = (p, seat, other) => { const r = record(p, other, seat); return 2 * r.broken <= r.kept; };
/** Does `s` lead `than` in ports, with the most of anyone? */
const leads = (p, s, than) => { const top = Math.max(...Array.from({ length: p.seats }, (_, k) => (alive(p, k) ? portsOf(p, k) : 0))); return portsOf(p, s) === top && top > portsOf(p, than); };

/** Will this character keep a promise that stands in its way? Its public line, as a rule. */
function keeps(p, seat, f, dice) {
  const who = characterOf(p, seat).id, r = f.to >= 0 ? record(p, f.to, seat) : { kept: 0, broken: 0 };
  if (who === "steward") return true;
  if (who === "merchant") return r.broken === 0;
  if (who === "elder") return r.broken < 2;
  if (who === "climber") return f.to < 0 || !leads(p, f.to, seat);
  if (who === "gambler") return dice.below(2) === 1;
  return f.to < 0; // the herald
}
/** Will this character bargain with `other` at all? Not with a seat its line says it breaks its word to. */
function bargains(p, seat, other) {
  const who = characterOf(p, seat).id, r = record(p, other, seat);
  if (who === "merchant") return r.broken === 0;
  if (who === "elder") return r.broken < 2;
  if (who === "climber") return !leads(p, other, seat);
  return true;
}

/** For each province, the most one rival seat could bring against it by land next season. Seats in `allies` are not counted. */
export function threats(p, seat, allies = new Set(), safe = new Map()) {
  const b = boardOf(p), out = Array(b.n).fill(0);
  for (let t = 0; t < b.n; t++) {
    const by = new Map();
    for (const j of b.near[t]) { const o = p.owner[j]; if (o >= 0 && o !== seat && !allies.has(o) && !safe.get(t)?.has(o) && p.str[j] > 1) by.set(o, (by.get(o) || 0) + p.str[j] - 1); }
    out[t] = Math.max(0, ...by.values());
  }
  return out;
}

/** The seats that lead in ports, ahead of this one: every seat tied at the top, so no number is singled out. */
function leaders(p, seat) {
  const ports = Array.from({ length: p.seats }, (_, s) => (s !== seat && alive(p, s) ? portsOf(p, s) : -1)), most = Math.max(...ports);
  return most > portsOf(p, seat) ? ports.flatMap((v, s) => (v === most ? [s] : [])) : [];
}

/** Steps from each province to the nearest one worth pressing: the pressed rival's, else any not held by this seat or a trusted ally. */
function toFront(p, seat, allies = new Set(), victim = NONE) {
  const b = boardOf(p), d = Array(b.n).fill(-1), list = [], open = (o) => o !== seat && !allies.has(o);
  const aim = victim >= 0 && p.owner.includes(victim) ? (o) => o === victim || o === NONE : open;
  for (let i = 0; i < b.n; i++) if (aim(p.owner[i])) { d[i] = 0; list.push(i); }
  if (!list.length) for (let i = 0; i < b.n; i++) if (open(p.owner[i])) { d[i] = 0; list.push(i); }
  for (let k = 0; k < list.length; k++) for (const j of b.near[list[k]]) if (d[j] < 0) { d[j] = d[list[k]] + 1; list.push(j); }
  return d;
}

const diceFor = (p, seat, what) => chance(seedState(`margins-bot/${what}/${p.key}/${p.seats}/${p.year}/${p.half}/${seat}/${p.owner.join()}/${p.str.join()}`));

/**
 * The rival to press this season: whoever leads this seat in ports, else the one whose front against it is weakest,
 * a seat that broke its word to it first. From the board and the ledger only, so talk and orders agree on it.
 */
export function victimOf(p, seat) {
  const b = boardOf(p), mine = mineOf(p, seat), lead = leaders(p, seat), dice = diceFor(p, seat, "victim");
  const near = [...new Set(mine.flatMap((i) => b.near[i]).map((j) => p.owner[j]).filter((o) => o >= 0 && o !== seat))];
  if (!near.length) return NONE;
  const front = (v) => Math.min(...mine.flatMap((i) => b.near[i]).filter((j) => p.owner[j] === v).map((j) => p.str[j]));
  const climber = characterOf(p, seat).id === "climber", score = (v) => (lead.includes(v) ? (climber ? 1000 : 15) : 0) + 100 * record(p, v, seat).broken - 10 * front(v) + dice.below(10);
  return near.map((v) => [v, score(v)]).sort((x, y) => y[1] - x[1])[0][0];
}

/**
 * A whole sheet: a list of orders, holds left out (an unordered province holds). mind: what the bot believes and what
 * it has promised. { victim, allies: seats trusted not to strike, safe: province -> seats trusted to keep out, help:
 * province -> supports promised to its move there, avoid: provinces it will not enter, stay: provinces it will not move
 * out of, backs: [{ to, seat }] supports it gives, carries: [{ a, b }] crossings it carries }.
 */
export function plan(p, seat, tier = "normal", mind = {}) {
  const b = boardOf(p), threat = threats(p, seat, mind.allies, mind.safe), lead = leaders(p, seat), care = CARE[tier] ?? 1;
  const dice = chance(seedState(`margins-bot/${p.key}/${p.seats}/${p.year}/${p.half}/${seat}/${tier}/${p.owner.join()}/${p.str.join()}`));
  const avoid = mind.avoid || new Set(), stay = mind.stay || new Set(), victim = mind.victim ?? NONE, easy = tier === "easy";
  const spare = (i) => (stay.has(i) ? 0 : Math.max(0, p.str[i] - 1 - Math.floor((threat[i] * care) / 2)));
  const used = new Set(), sheet = [];
  // every list is walked in a random order of the game's own, never by number: numbers run round the sea from seat 0,
  // so walking by number would treat seat 0's march differently from the others
  const rank = dice.shuffle(b.names.map((_, i) => i)), tie = (x, y) => rank.indexOf(x) - rank.indexOf(y), mine = mineOf(p, seat).sort(tie);
  // promises kept come first: a support or a transport from the province with least else to do
  for (const k of mind.backs || []) {
    const from = mine.filter((i) => !used.has(i) && b.near[i].includes(k.to)).sort((x, y) => spare(x) - spare(y) || tie(x, y))[0];
    if (from !== undefined) { used.add(from); sheet.push({ at: from, kind: "support", to: k.to, seat: k.seat }); }
  }
  for (const k of mind.carries || []) {
    const from = mine.filter((i) => !used.has(i) && b.port[i]).sort((x, y) => spare(x) - spare(y) || tie(x, y))[0];
    if (from !== undefined) { used.add(from); sheet.push({ at: from, kind: "transport", a: k.a, b: k.b }); }
  }
  const worth = (t) => (b.port[t] ? 30 : 10) + (lead.includes(p.owner[t]) ? 12 : 0) + (p.owner[t] === victim && victim >= 0 ? 18 : 0) + (p.owner[t] === NONE ? 6 : 0) + dice.below(easy ? 24 : 12);
  // what a defender could add: its own neighbours of the target, each a support (the hard bot counts them all)
  const guard = (t) => { const d = p.owner[t]; if (d < 0 || easy) return 0; const k = b.near[t].filter((j) => p.owner[j] === d).length; return tier === "hard" ? k : Math.min(1, k); };
  // attacks: the best targets first, from every neighbour with strength to spare, backed by the others beside it
  const targets = [...new Set(mine.flatMap((i) => b.near[i]).filter((t) => p.owner[t] !== seat && !avoid.has(t)))].sort(tie);
  const ranked = targets.map((t) => ({ t, need: (p.owner[t] === NONE ? 0 : p.str[t] + guard(t)) + 1, v: worth(t) })).sort((x, y) => y.v * x.need - x.v * y.need || tie(x.t, y.t));
  for (const { t, need } of ranked) {
    const near = b.near[t].filter((i) => p.owner[i] === seat && !used.has(i)), from = near.filter((i) => spare(i) > 0).sort((x, y) => spare(y) - spare(x) || tie(x, y));
    if (!from.length) continue;
    const goers = [], help = mind.help?.get(t) || 0;
    let n = 0;
    for (const i of easy ? from.slice(0, 1) : from) { if (n + help >= need + (easy ? 0 : 1)) break; goers.push(i); n += spare(i); }
    const backers = easy ? [] : near.filter((i) => !goers.includes(i)), backing = Math.min(backers.length, Math.max(0, need - n - help));
    if (n + help + backing < need) continue;
    let left = need + (easy ? 0 : 1) - help - backing; // what to send: enough, and one more
    for (const i of goers) { const k = Math.max(1, Math.min(spare(i), left)); left -= k; used.add(i); sheet.push({ at: i, kind: "move", to: t, n: k }); }
    for (const h of backers.slice(0, backing)) { used.add(h); sheet.push({ at: h, kind: "support", to: t, seat }); }
  }
  // the hard bot crosses the sea: a port with strength to spare, a weak port across the water, and its own transport
  if (tier === "hard") {
    const ports = mine.filter((i) => b.port[i] && !used.has(i));
    for (const go of ports) {
      if (used.has(go) || spare(go) < 2) continue;
      const aim = b.port.map((x, t) => t).filter((t) => bySea(b, go, t) && p.owner[t] !== seat && !avoid.has(t) && p.str[t] + 1 <= spare(go)).sort((x, y) => p.str[x] - p.str[y] || tie(x, y))[0];
      const carrier = ports.find((c) => c !== go && !used.has(c));
      if (aim === undefined || carrier === undefined) continue;
      used.add(go); used.add(carrier);
      sheet.push({ at: go, kind: "move", to: aim, n: spare(go) }, { at: carrier, kind: "transport", a: Math.min(go, aim), b: Math.max(go, aim) });
    }
  }
  // what is left: back up a neighbour in danger, or send strength from safe land towards the front, the pressed rival's first
  const front = toFront(p, seat, mind.allies, victim), facing = (i) => (b.near[i].some((j) => p.owner[j] === victim) ? 0 : 1);
  for (const i of mine) {
    if (used.has(i)) continue;
    const danger = easy ? undefined : [...b.near[i]].sort(tie).find((j) => p.owner[j] === seat && threat[j] >= p.str[j] && threat[j] > 0 && !sheet.some((o) => o.at === j && o.kind === "move"));
    if (danger !== undefined && threat[i] === 0) { used.add(i); sheet.push({ at: i, kind: "support", to: danger, seat }); continue; }
    if (front[i] > 1 && p.str[i] > 1 && !stay.has(i)) {
      const to = b.near[i].filter((j) => p.owner[j] === seat).sort((x, y) => front[x] - front[y] || facing(x) - facing(y) || tie(x, y))[0];
      const n = easy ? p.str[i] - 1 : spare(i);
      if (to !== undefined && front[to] < front[i] && n > 0) { used.add(i); sheet.push({ at: i, kind: "move", to, n }); }
    }
  }
  return sheet.sort((x, y) => x.at - y.at);
}

/** Does a sheet already keep a promise? For a support or a transport: is there a province with nothing to do that could give it. */
function fits(p, seat, f, sheet) {
  const b = boardOf(p), moves = sheet.filter((o) => o.kind === "move"), idle = mineOf(p, seat).filter((i) => !sheet.some((o) => o.at === i));
  if (f.form === "keep-out") return !moves.some((o) => o.to === f.at);
  if (f.form === "no-strike") return !moves.some((o) => p.owner[o.to] >= 0 && p.owner[o.to] !== seat && (f.to < 0 || p.owner[o.to] === f.to));
  if (f.form === "stand") return !moves.some((o) => o.at === f.at);
  if (f.form === "carry") return idle.some((i) => b.port[i]);
  return idle.some((i) => b.near[i].includes(f.at)); // back-move, back-hold
}

/** What this seat believes from the promises made to it this season, as far as it trusts each seat. */
function belief(p, seat) {
  const allies = new Set(), safe = new Map(), help = new Map();
  for (const f of p.pledges) {
    if (f.by === seat || (f.to !== seat && f.to >= 0) || !trusts(p, seat, f.by)) continue;
    if (f.form === "no-strike") allies.add(f.by);
    else if (f.form === "keep-out") (safe.get(f.at) || safe.set(f.at, new Set()).get(f.at)).add(f.by);
    else if (f.form === "back-move" && f.to === seat) help.set(f.at, (help.get(f.at) || 0) + 1);
  }
  return { allies, safe, help };
}

const memo = new Map();
const remember = (k, make) => { if (!memo.has(k)) { if (memo.size > 200) memo.clear(); memo.set(k, make()); } return memo.get(k); };
const stamp = (p, seat, tier, what) => `${what}|${p.key}|${p.seats}|${p.round}|${seat}|${tier}|${p.owner.join()}|${p.str.join()}|${JSON.stringify(p.pledges)}|${p.ledger.length}`;

/** The sheet this seat writes: planned freely, then held to the promises its character keeps. */
export function sheetOf(p, seat, tier = "normal") {
  return remember(stamp(p, seat, tier, "sheet"), () => {
    const mind = { victim: tier === "easy" ? NONE : victimOf(p, seat), ...(tier === "easy" ? {} : belief(p, seat)) }, free = plan(p, seat, tier, mind);
    const mine = p.pledges.filter((f) => f.by === seat);
    if (!mine.length) return free;
    const dice = diceFor(p, seat, "word"), held = mine.filter((f) => fits(p, seat, f, free) || keeps(p, seat, f, dice)), avoid = new Set(), stay = new Set(), backs = [], carries = [];
    for (const f of held) {
      if (f.form === "keep-out") avoid.add(f.at);
      else if (f.form === "no-strike") p.owner.forEach((o, i) => { if (o >= 0 && o !== seat && (f.to < 0 || o === f.to)) avoid.add(i); });
      else if (f.form === "stand") stay.add(f.at);
      else if (f.form === "carry") carries.push({ a: f.a, b: f.b });
      else backs.push({ to: f.at, seat: f.to });
    }
    return plan(p, seat, tier, { ...mind, avoid, stay, backs, carries });
  });
}

/** What a bot says in the talk: pacts of no strikes with the seats it is not pressing, and help asked for its attack. */
export function talkOf(p, seat, tier = "normal") {
  if (tier === "easy") return [];
  return remember(stamp(p, seat, tier, "talk"), () => {
    const b = boardOf(p), v = victimOf(p, seat), free = plan(p, seat, tier, { victim: v }), out = [];
    const aim = free.find((o) => o.kind === "move" && v >= 0 && p.owner[o.to] === v)?.to;
    const mine = mineOf(p, seat), touching = (o) => mine.some((i) => b.near[i].some((j) => p.owner[j] === o));
    const others = Array.from({ length: p.seats }, (_, o) => o).filter((o) => o !== seat && o !== v && alive(p, o) && bargains(p, seat, o)).sort((x, y) => touching(y) - touching(x) || record(p, y, seat).kept - record(p, x, seat).kept || ((x - seat + p.seats) % p.seats) - ((y - seat + p.seats) % p.seats));
    for (const o of others) {
      if (out.length + 2 > WORDS) break;
      out.push({ do: "promise", form: "no-strike", to: o }, { do: "ask", form: "no-strike", to: o });
      if (aim !== undefined && out.length < WORDS && b.near[aim].some((j) => p.owner[j] === o) && !out.some((w) => w.form === "back-move")) out.push({ do: "ask", form: "back-move", to: o, at: aim });
    }
    // the herald pledges in public to hold a province it means to hold anyway
    if (characterOf(p, seat).id === "herald" && out.length < WORDS) {
      const quiet = mine.filter((i) => !free.some((o) => o.at === i && o.kind === "move")).sort((x, y) => p.str[y] - p.str[x] || x - y)[0];
      if (quiet !== undefined) out.push({ do: "promise", form: "stand", to: -1, at: quiet });
    }
    return out;
  });
}

/** Does a bot accept the bargain `from` offers it? Not from the rival it presses, unless its character breaks its word when it pays. */
export function accepts(p, seat, from, tier = "normal") {
  if (tier === "easy" || !bargains(p, seat, from)) return false;
  const who = characterOf(p, seat).id, { give, ask } = offerOf(p, from, seat);
  if (victimOf(p, seat) === from) return who === "gambler" || who === "herald";
  const gain = give.reduce((n, f) => n + (f.form === "back-move" || f.form === "back-hold" ? 2 : 1), 0), cost = ask.filter((f) => f.form !== "no-strike" && f.form !== "back-move").length;
  return gain >= cost;
}

/** The next move: in the talk, its next word; then its answers; then the next planned order not yet written, else seal. */
export function choose(p, dice, tier = "normal") {
  const seat = p.seat;
  if (p.stage === "talk") {
    const said = p.talk[seat].length, w = talkOf(p, seat, tier)[said];
    return w && p.talk[seat].length < WORDS ? w : { do: "done" };
  }
  if (p.stage === "answer") { const from = pending(p, seat)[0]; return { do: "answer", from, yes: accepts(p, seat, from, tier) }; }
  const done = new Set(p.orders[seat].map((o) => o.at));
  const o = sheetOf(p, seat, tier).find((x) => !done.has(x.at));
  return o ? { do: "order", ...o } : { do: "done" };
}

export function* thinking(p, dice, kind) {
  return choose(p, dice, kind);
}
