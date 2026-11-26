// SPDX-License-Identifier: AGPL-3.0-or-later
// The rules of the world game: the AI proposes moves, these rules accept, trim or refuse each one and say why.
// Land, wars and treaties change only here. Attacks are settled by the check (check.js): might, a commander, odds out of 100.
import { draw100 } from "./line.js";
import { chanceOf, check, checkLine } from "./check.js";

// Invented numbers for a fiction, from 1 to 10. Countries not listed get 2, or 3 if they hold twelve provinces or more.
export const MIGHT = {
  USA: 10, CHN: 9, RUS: 9, IND: 8, GBR: 7, FRA: 7, DEU: 7, JPN: 7, KOR: 6, TUR: 6, ISR: 6, PAK: 6, IRN: 6, BRA: 6, ITA: 6, UKR: 5,
  EGY: 5, SAU: 5, AUS: 5, CAN: 5, IDN: 5, POL: 5, ESP: 5, VNM: 5, PRK: 5, TWN: 5, MEX: 4, THA: 4, ARG: 4, COL: 4, CHL: 4, ZAF: 4,
  NGA: 4, ETH: 4, DZA: 4, MAR: 4, IRQ: 4, GRC: 4, SWE: 4, NOR: 4, NLD: 4, KAZ: 4, PHL: 4, MYS: 4, SGP: 4, ARE: 4, FIN: 4, BLR: 3,
  PER: 3, VEN: 3, CUB: 3, SYR: 3, UZB: 3, MMR: 3, BGD: 3, NZL: 3, BEL: 3, CHE: 3, AUT: 3, PRT: 3, ROU: 3, CZE: 3, HUN: 3, AZE: 3,
  ARM: 2, GEO: 2, BOL: 2, ECU: 2, PRY: 2, URY: 2,
};
export const VERBS = {
  WAR: "declare war on a country (target: its country code)",
  PEACE: "make peace with a country it is at war with (target: its country code)",
  TREATY: "sign a treaty with a country (target: its country code; detail: trade, defence or alliance)",
  BREAK: "end a treaty (target: the other country's code)",
  ATTACK: "attack one province held by a country it is at war with, next to land it holds or across a narrow sea from it (target: the province id)",
  GIVE: "hand one of its own provinces to another country by agreement (target: the province id; detail: the receiving country's code)",
};
const KINDS = ["trade", "defence", "alliance"];
const pair = (a, b) => [a, b].sort().join("|");
const others = (p, c) => p.split("|").find((x) => x !== c);
export const atWar = (g, a, b) => g.wars.some((w) => w.pair === pair(a, b));
export const treatyOf = (g, a, b) => g.treaties.find((t) => t.pair === pair(a, b));
// the Game Master may set a country's might; otherwise the table, then size
export const mightOf = (geo, c) => geo.might?.(c) ?? MIGHT[c] ?? (geo.holds(c) >= 12 ? 3 : 2);
export const warsOf = (g, c) => g.wars.filter((w) => w.pair.split("|").includes(c)).map((w) => others(w.pair, c));
export const treatiesOf = (g, c) => g.treaties.filter((t) => t.pair.split("|").includes(c)).map((t) => ({ with: others(t.pair, c), kind: t.kind }));

/**
 * Apply one reply's moves to a game, in order. Changes `g` and returns what the rules decided, in plain words.
 * geo: name(code), place(id) -> {name, country}, find(idOrName) -> id, owner(id), neighbours(id), coastal(id), holds(code), known(code).
 */
export function applyMoves(g, moves, geo, actions, months) {
  const receipt = [], used = {}, attacks = {}, spent = {}, me = g.player;
  let rivals = 0;
  const say = (m, ok, why, beat) => receipt.push({ ok, text: `${geo.name(m.country)}: ${why}`, verb: m.verb, country: m.country, ...(beat ? { check: beat } : {}) });
  for (const m of moves) {
    // a citizen does not command the country: its government moves on its own, like any other
    const c = m.country, citizen = g.mode === "citizen", isMe = c === me && !citizen, verb = m.verb;
    if (!VERBS[verb]) { say(m, false, `"${m.verb}" is not a move the rules know`); continue; }
    if (!geo.known(c) || geo.holds(c) === 0) { say(m, false, `${verb.toLowerCase()} refused: it holds no land`); continue; }
    if (citizen && c === me && m.action) { say(m, false, `${verb.toLowerCase()} refused: as a citizen, your actions are your own; the government decides for the country`); continue; }
    if (isMe) {
      if (!(m.action >= 1 && m.action <= actions.length)) { say(m, false, `${verb.toLowerCase()} refused: your country moves only on your own actions`); continue; }
      used[m.action] = (used[m.action] || 0) + 1;
      if (used[m.action] > 3) { say(m, false, `more than three moves from action ${m.action} are not allowed`); continue; }
    } else if (++rivals > 6) { say(m, false, "more than six moves by other countries in one turn are not allowed"); continue; }
    const staller = isMe ? stalledBy(g, m, receipt.length) : null;
    if (staller) { say(m, false, `${verb.toLowerCase()} held back: ${staller.name} (favour ${staller.favour}), who opposes it, stalled the order this turn`); continue; }
    const r = ({ WAR: war, PEACE: peace, TREATY: treaty, BREAK: unbind, ATTACK: attack, GIVE: give })[verb](g, m, geo, { isMe, attacks, months, spent });
    say(m, r.ok, r.why, r.check);
    for (const extra of r.also || []) receipt.push({ ok: true, text: extra });
  }
  return receipt;
}

function war(g, m, geo) {
  const c = m.country, t = m.target;
  if (!geo.known(t) || geo.holds(t) === 0 || t === c) return { ok: false, why: `war refused: "${m.target}" is not a country with land` };
  if (atWar(g, c, t)) return { ok: false, why: `already at war with ${geo.name(t)}` };
  if (treatyOf(g, c, t)) return { ok: false, why: `war on ${geo.name(t)} refused: they have a treaty; it must be ended first` };
  g.wars.push({ pair: pair(c, t), since: g.date, by: c });
  const also = [];
  for (const { with: ally, kind } of treatiesOf(g, t)) {
    if (kind === "trade" || ally === c || atWar(g, ally, c) || treatyOf(g, ally, c)) continue;
    g.wars.push({ pair: pair(ally, c), since: g.date, by: ally });
    also.push(`${geo.name(ally)}: joins the war against ${geo.name(c)}, as its ${kind} treaty with ${geo.name(t)} requires`);
  }
  return { ok: true, why: `declares war on ${geo.name(t)}`, also };
}

function peace(g, m, geo, { isMe }) {
  const c = m.country, t = m.target;
  if (!atWar(g, c, t)) return { ok: false, why: `peace refused: not at war with ${geo.name(t)}` };
  if (t === g.player && g.mode !== "citizen" && !isMe) { g.offers.push({ from: c, kind: "peace", date: g.date }); return { ok: false, why: `offers you peace; to accept, make peace in your actions` }; }
  g.wars = g.wars.filter((w) => w.pair !== pair(c, t));
  return { ok: true, why: `makes peace with ${geo.name(t)}; each keeps the land it holds` };
}

function treaty(g, m, geo, { isMe }) {
  const c = m.country, t = m.target, kind = KINDS.find((k) => (m.detail || "").toLowerCase().includes(k)) || "trade";
  if (!geo.known(t) || t === c) return { ok: false, why: `treaty refused: "${m.target}" is not a country` };
  if (atWar(g, c, t)) return { ok: false, why: `a treaty with ${geo.name(t)} is refused while they are at war; make peace first` };
  if (t === g.player && g.mode !== "citizen" && !isMe) { g.offers.push({ from: c, kind, date: g.date }); return { ok: false, why: `offers you a ${kind} treaty; to accept, sign it in your actions` }; }
  const old = treatyOf(g, c, t);
  if (old && old.kind === kind) return { ok: false, why: `already has a ${kind} treaty with ${geo.name(t)}` };
  g.treaties = g.treaties.filter((x) => x.pair !== pair(c, t));
  g.treaties.push({ pair: pair(c, t), kind, since: g.date });
  if (t === g.player || c === g.player) g.offers = g.offers.filter((o) => !(o.from === (c === g.player ? t : c)));
  return { ok: true, why: `${old ? `turns its ${old.kind} treaty with ${geo.name(t)} into` : "signs"} a ${kind} treaty${old ? "" : ` with ${geo.name(t)}`}` };
}

function unbind(g, m, geo) {
  const c = m.country, t = m.target, old = treatyOf(g, c, t);
  if (!old) return { ok: false, why: `has no treaty with ${geo.name(t) || t} to end` };
  g.treaties = g.treaties.filter((x) => x !== old);
  return { ok: true, why: `ends its ${old.kind} treaty with ${geo.name(t)}` };
}

function give(g, m, geo) {
  const c = m.country, id = geo.find(m.target), to = (m.detail || "").trim().toUpperCase().slice(0, 3);
  if (!id) return { ok: false, why: `handover refused: "${m.target}" is not a province on the map` };
  const place = geo.place(id).name;
  if (geo.owner(id) !== c) return { ok: false, why: `cannot hand over ${place}: it does not hold it` };
  if (!geo.known(to) || to === c) return { ok: false, why: `handover of ${place} refused: "${m.detail || "nobody"}" is not a country` };
  if (atWar(g, c, to)) return { ok: false, why: `handover of ${place} refused: at war with ${geo.name(to)}; make peace first` };
  if (geo.holds(c) <= 1) return { ok: false, why: `handover of ${place} refused: it is the last land it holds` };
  if (geo.place(id).country === to) delete g.owners[id]; else g.owners[id] = to;
  return { ok: true, why: `hands ${place} to ${geo.name(to)} by agreement` };
}

/** Lines for the prompt: wars, treaties, offers, land that has changed hands, and last turn's receipt. */
export function worldFacts(g, geo) {
  const wars = g.wars.map((w) => { const [a, b] = w.pair.split("|"); return `${a}-${b} since ${w.since}`; });
  const treaties = g.treaties.map((t) => { const [a, b] = t.pair.split("|"); return `${a}-${b} ${t.kind}`; });
  const moved = Object.entries(g.owners).slice(-20).map(([id, c]) => `${id} ${geo.place(id).name}: held by ${c}, taken from ${geo.place(id).country}`);
  const last = g.log[g.log.length - 1];
  return [
    ...(g.facts || []).map((f) => `- Told by the Game Master, and true: ${f.text}`),
    ...(g.leaks || []).filter((l) => l.turn === g.turn).map((l) => `- Leaked: ${l.name}, an unhappy adviser of the player, told the press about the player's plans. Papers may report it.`),
    `- Wars: ${wars.join(", ") || "none"}`,
    `- Treaties: ${treaties.join(", ") || "none"}`,
    `- Offers waiting for the player: ${g.offers.map((o) => `${o.from} ${o.kind}`).join(", ") || "none"}`,
    `- Land that has changed hands: ${moved.length ? "" : "none"}`, ...moved.map((l) => `  - ${l}`),
    "", "RECEIPT (what the rules decided last turn)",
    ...(last?.receipt?.length ? last.receipt.map((r) => `- ${r.ok ? "" : "refused: "}${r.text}`) : ["- nothing yet"]),
  ];
}

/**
 * The provinces worth naming in the prompt, most useful first, each tagged with why it is there:
 * both sides of every front the player fights on (by land and across narrow seas); an enemy's coast when a war has
 * no shared border; the player's heartland; land borders, then sea crossings, with a few provinces of each neighbour; other wars' fronts;
 * then the rest of the player's land. At most `cap` lines. geo.home(code) names a country's largest province.
 */
export function placesFor(g, geo, all, cap = 90) {
  const me = g.player, tag = new Map(), add = (id, why) => { if (!tag.has(id)) tag.set(id, why); };
  const near = (id) => [...geo.neighbours(id), ...(geo.across?.(id) || [])];
  const mine = all.filter((id) => geo.owner(id) === me);
  const front = (a, b) => {
    let touch = false;
    for (const id of all) if (geo.owner(id) === a) for (const n of near(id)) if (geo.owner(n) === b) { add(id, "front"); add(n, "front"); touch = true; }
    return touch;
  };
  for (const enemy of warsOf(g, me)) if (!front(me, enemy)) for (const id of all) if (geo.owner(id) === enemy && geo.coastal(id)) add(id, "enemy coast");
  const home = geo.home?.(me); if (home) add(home, "heartland");
  // land borders before sea crossings, and no neighbour fills the list on its own: at most four provinces each
  // by land and two each across the sea
  const shown = new Map(), beyond = (n, most, why) => { const o = geo.owner(n), k = `${why}:${o}`; if ((shown.get(k) || 0) >= most || tag.has(n)) return; shown.set(k, (shown.get(k) || 0) + 1); add(n, why); };
  for (const id of mine) if (geo.neighbours(id).some((n) => geo.owner(n) !== me)) { add(id, "land border"); for (const n of geo.neighbours(id)) if (geo.owner(n) !== me) beyond(n, 4, "over the border"); }
  for (const id of mine) if ((geo.across?.(id) || []).some((n) => geo.owner(n) !== me)) { add(id, "coast"); for (const n of geo.across(id)) if (geo.owner(n) !== me) beyond(n, 2, "across the sea"); }
  for (const w of g.wars) { const [a, b] = w.pair.split("|"); if (a !== me && b !== me) front(a, b); }
  for (const id of mine) add(id, "own land");
  return [...tag].slice(0, cap).map(([id, why]) => `- ${id} ${geo.place(id).name} (${geo.owner(id)}; ${why})`);
}

// ---- the attack, on the check (ruling 124, step M0) ----
// chance = 50 + 10 x (attacker's might - defender's might) + approach + up to four named parts: the commander
// (2 a point of command), the ground (its own land +15, land it claims +10), the crossing (narrow sea -5, open sea
// -10) and the trusted adviser's counsel (at most 5 either way). Held between 10 and 75. Clean: taken. Costly:
// taken, but the army is spent for the turn. Failed: thrown back.
export const APPROACHES = {
  steady: [0, "no edge and no price"],
  bold: [10, "+10, but if it fails the commander loses one favour"],
  patient: [10, "+10, but it uses two of the turn's attacks"],
};
export const GENERALS = 3; // a country's own generals, unnamed: command 3 of 5
/** A council member's command, 1 to 5: dealt by rule from the game's seed and their name, never by the AI. */
export const commandOf = (g, m) => draw100(g.seed, `command:${m.name}`) % 5 + 1;
const seated = (g) => g.mode !== "citizen" && g.council ? Object.entries(g.council.seats).filter(([, m]) => m) : [];
/** Who may lead the player's attacks: council members (the war seat in role, others at -10), or the generals. */
export const commanders = (g) => [...seated(g).map(([seat, m]) => ({ seat, name: m.name, command: commandOf(g, m), off: seat !== "war" })), { seat: "generals", name: "its generals", command: GENERALS, off: false }];
function commanderFor(g, c, seat) {
  const list = c === g.player ? commanders(g) : [], named = list.filter((x) => x.seat !== "generals");
  const pick = list.find((x) => x.seat === seat) || named.find((x) => x.seat === "war") || list.find((x) => x.seat === "generals");
  return pick || { seat: "generals", name: "its generals", command: GENERALS, off: false };
}
/** How a country could reach a province: "land", "strait", "sea", or "" when it cannot. */
function reach(geo, c, id) {
  if (geo.neighbours(id).some((n) => geo.owner(n) === c)) return "land";
  if ((geo.across?.(id) || []).some((n) => geo.owner(n) === c)) return "strait";
  return geo.coastal(id) && mightOf(geo, c) >= 6 && geo.hasCoast(c) ? "sea" : "";
}

/**
 * Everything the attack check will use, before it is made: the same numbers the preview shows and the rules roll.
 * order: {seat, approach} from the player's attack order, or {} for the default (war seat or generals, steady).
 * Returns {ok: false, why} when the attack cannot be made at all.
 */
export function attackPlan(g, geo, c, id, order = {}, most = Infinity) {
  const o = geo.owner(id), place = geo.place(id).name;
  if (o === c) return { ok: false, why: `${place} is already its own` };
  if (!atWar(g, c, o)) return { ok: false, why: `attack on ${place} refused: not at war with ${geo.name(o)}, which holds it` };
  const way = reach(geo, c, id);
  if (!way) return { ok: false, why: `attack on ${place} refused: it touches no land ${geo.name(c)} holds, no narrow sea joins them, and ${geo.name(c)} cannot cross open sea in strength` };
  let approach = APPROACHES[order.approach] && c === g.player && g.mode !== "citizen" ? order.approach : "steady", note = "";
  if (approach === "patient" && most < 2) { approach = "steady"; note = " (the turn is too short to be patient)"; }
  const boss = commanderFor(g, c, order.seat), own = geo.place(id).country === c;
  const counsel = c === g.player && g.mode !== "citizen" ? adviceFor(g) : null;
  const parts = [
    [`${boss.seat === "generals" ? "its generals" : `commander ${boss.name}`}${boss.off ? ", out of role" : ""}`, 2 * boss.command - (boss.off ? 10 : 0)],
    own ? ["its own land", 15] : geo.claims?.(id, c) ? ["land it claims", 10] : ["", 0],
    way === "sea" ? ["by open sea", -10] : way === "strait" ? ["across a narrow sea", -5] : ["", 0],
    counsel ? [`${counsel.member.name}'s counsel`, counsel.nudge] : ["", 0],
  ];
  const plan = { mission: `attack:${id}:${c}`, checkpoint: "battle", person: boss.name, who: boss.name, role: "commander", skill: mightOf(geo, c), difficulty: mightOf(geo, o), approach: [approach, APPROACHES[approach][0]], parts };
  return { ok: true, plan, chance: chanceOf(plan).chance, owner: o, place, way, boss, counsel, approach, note, cost: approach === "patient" ? 2 : 1 };
}

function attack(g, m, geo, { attacks, months, spent }) {
  const c = m.country, id = geo.find(m.target);
  if (!id) return { ok: false, why: `attack on "${m.target}" refused: it is not a province on the map` };
  const most = Math.max(1, Math.ceil(months)), order = c === g.player && g.mode !== "citizen" ? (g.orders || []).find((x) => x.target === id) || {} : {};
  const a = attackPlan(g, geo, c, id, order, most - (attacks[c] || 0));
  if (!a.ok) return a;
  if (spent[c]) return { ok: false, why: `attack on ${a.place} refused: its army is spent after a costly victory this turn` };
  attacks[c] = (attacks[c] || 0) + a.cost;
  if (attacks[c] > most) return { ok: false, why: `attack on ${a.place} refused: no more than ${most} attack${most > 1 ? "s" : ""} in a turn this long` };
  const beat = check(g.seed, { ...a.plan, turn: g.turn }), o = a.owner, won = beat.band !== "failed";
  if (a.counsel) record(a.counsel, won);
  const from = a.way === "sea" ? " from the sea" : a.way === "strait" ? " across the strait" : "", how = `(${checkLine(beat, "might")})${a.note}`;
  const also = [];
  if (beat.band === "failed" && a.approach === "bold" && a.boss.seat !== "generals") also.push(...blame(g, a.boss.seat));
  if (!won) return { ok: true, why: `attacks ${a.place}${from} and is thrown back ${how}`, check: beat, also };
  if (beat.band === "costly") spent[c] = true;
  if (geo.place(id).country === c) delete g.owners[id]; else g.owners[id] = c;
  if (geo.holds(o) === 0) {
    g.wars = g.wars.filter((w) => !w.pair.split("|").includes(o));
    g.treaties = g.treaties.filter((t) => !t.pair.split("|").includes(o));
    also.push(`${geo.name(o)}: has lost the last of its land`);
  }
  const price = beat.band === "costly" ? ", but its army is spent for the turn" : " cleanly";
  return { ok: true, why: `attacks ${a.place}${from} and takes it from ${geo.name(o)}${price} ${how}`, also, taken: id, check: beat };
}
/** A failed bold attack costs its commander one favour; at -3 they resign, as with any other loss of favour. */
function blame(g, seat) {
  const mbr = g.council.seats[seat];
  mbr.favour = Math.max(-3, mbr.favour - 1);
  const out = [`${mbr.name}: loses favour after the failed bold attack (favour ${mbr.favour})`];
  if (mbr.favour <= -3) {
    g.council.former.push({ ...mbr, seat, left: g.date, why: "resigned" });
    g.council.seats[seat] = null;
    if (g.council.trusted === seat) g.council.trusted = null;
    out.push(`${mbr.name}: resigns from your council`);
  }
  return out;
}

// ---- counsel and favour that act (rulings 54 and 56) ----

/**
 * The trusted adviser's word from last turn moves the player's attack chance by at most 5 in 100, a whole number:
 * skill x trust / 20, where trust is the percentage of times they have been right (60 until they have been tested
 * three times), rounded half up. Unclear advice moves nothing. An adviser who has turned against the player
 * (favour -2 or lower) shades their counsel, so it counts for half.
 */
export function adviceFor(g) {
  // the advice follows the person, not the seat: standing may have moved them to another seat since
  const last = g.log[g.log.length - 1], said = last?.advice;
  const member = said && Object.values(g.council?.seats || {}).find((m) => m && m.name === said.name);
  if (!member || said.word === "unclear") return null;
  const rec = member.record || { right: 0, n: 0 }, trust = rec.n >= 3 ? Math.floor((100 * rec.right) / rec.n) : 60;
  const size = Math.floor((member.skill * trust * (member.favour <= -2 ? 1 : 2) + 100) / 200);
  return { member, word: said.word, nudge: (said.word === "favourable" ? 1 : -1) * size };
}
function record(counsel, wins) {
  const m = counsel.member, rec = m.record || { right: 0, n: 0 };
  m.record = { right: rec.right + ((counsel.word === "favourable") === wins ? 1 : 0), n: rec.n + 1 };
}

/** An adviser at favour -2 or lower may stall one of the player's moves that they dislike: an even chance. */
function stalledBy(g, m, i) {
  for (const [seat, member] of Object.entries(g.council?.seats || {})) {
    if (!member || member.favour > -2 || !member.hates.includes(m.verb)) continue;
    if (draw100(g.seed, `${g.turn}:stall:${seat}:${i}`) <= 50) return member;
  }
  return null;
}

/** After a turn, an adviser at favour -2 or lower may leak the player's plans: a 40 percent chance each. */
export function leaks(g) {
  const out = [];
  for (const [seat, member] of Object.entries(g.council?.seats || {})) {
    if (member && member.favour <= -2 && draw100(g.seed, `${g.turn}:leak:${seat}`) <= 40) out.push({ seat, name: member.name });
  }
  return out;
}
