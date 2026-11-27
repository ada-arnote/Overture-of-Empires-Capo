// SPDX-License-Identifier: AGPL-3.0-or-later
// The Island Fable on the table: choose a hall or a unit, then what to build or where it goes.
import { EXPANSIONS, FORT_GUARD, NONE, SAFETY, SWITCHES, WOOD, act, beats, boardOf, cellsOf, defence, fable, farmPrice, goalOf, landOf, nameOf, raiseOf, territories, topOf, upkeepOf } from "../src/games/fable/rules.js";
import { choose, thinking } from "../src/games/fable/bot.js";
import { villageName } from "../src/games/fable/names.js";
import { ISLANDS, SEAS, island, open, step, stepOf } from "../src/games/fable/ladder.js";
import { createMatch } from "../src/core/index.js";
import { $, NAMES, PAPER, RGB, createTable, el, radio, sheet, toast } from "./table.js";
import { hexBoard } from "./hexboard.js";

const SEA = [72, 110, 122], SHALLOW = [98, 138, 146], GRASS = [[150, 186, 104], [142, 180, 98], [158, 190, 112]], RANK = ["", "Scout", "Guard", "Captain", "Marshal"];
let source = null, where = null, build = "raise", give = null, sure = false; // source: "h12" a hall, "u7" a unit; give: the concede button, sure: tapped once
let guards = [], guardsShown = "", warned = -1; // guards: the numbers on rival land beside the chosen village or unit; warned: the move count when End turn last warned

const legal = (T) => (T.ready() ? T.match.legal() : []);
const from = (m) => (m.do === "move" ? `u${m.from}` : m.hall === undefined ? m.do : `h${m.hall}`);
const options = (T) => legal(T).filter((m) => from(m) === source && (source[0] === "u" || m.do === build));
const verb = (p, m) => (m.do === "fort" ? "Fort at" : m.do === "farm" ? "Farm at" : p.owner[m.to] !== p.seat ? (p.owner[m.to] === NONE ? "Claim" : "Take") : p.unit[m.to] ? "Join" : p.tree[m.to] ? "Clear" : "Stand");
const weight = { Take: 0, Claim: 1, Clear: 2, Join: 3, Stand: 4, "Fort at": 5, "Farm at": 5 };
const worth = (p, m) => weight[verb(p, m)] * 100 - (p.hall[m.to] ? 60 : 0) - (p.owner[m.to] !== NONE && p.owner[m.to] !== p.seat ? p.unit[m.to] * 10 : 0);
/** A hex in words: whose it is and what stands on it. */
const whatAt = (p, i) => [p.owner[i] === NONE ? "No one's" : p.owner[i] === p.seat ? "Yours" : NAMES[p.owner[i]], p.hall[i] ? "village" : p.unit[i] ? RANK[p.unit[i]].toLowerCase() : p.fort[i] ? "fort" : p.farm[i] ? "farm" : p.tree[i] ? (p.tree[i] === WOOD ? "wood" : "cairn") : ""].filter(Boolean).join(", ");
/** What guards a hex best, and from where: a unit, a fort or a village on it or beside it. */
function guardOf(p, c) {
  let n = 0, at = -1;
  if (p.owner[c] === NONE) return { n, at, what: "" };
  for (const x of [c, ...boardOf(p).near[c]]) { const g = p.owner[x] === p.owner[c] ? Math.max(p.unit[x], p.hall[x], p.fort[x] ? FORT_GUARD : 0) : 0; if (g > n) { n = g; at = x; } }
  return { n, at, what: at < 0 ? "" : p.unit[at] === n ? RANK[n].toLowerCase() : p.fort[at] ? "fort" : "village" };
}
/** The land of the chosen village or unit, and the hexes beside it that are not the player's. */
function reach(p) {
  const t = source && territories(p, p.seat).find((x) => x.cells.includes(Number(source.slice(1))));
  if (!t) return null;
  const inside = new Set(t.cells), edge = new Set();
  for (const c of t.cells) for (const m of boardOf(p).near[c]) if (!inside.has(m) && !p.water[m] && p.owner[m] !== p.seat) edge.add(m);
  return { t, edge };
}
/** Why a hex cannot be taken from the chosen village or unit, in a sentence. */
function refusal(p, i) {
  const r = reach(p), rank = source[0] === "u" ? p.unit[Number(source.slice(1))] : 1;
  if (!r || !r.edge.has(i)) return "It cannot reach there: a unit takes only land beside its own territory.";
  if (p.rule.opening === "truce" && p.round === 1 && p.owner[i] !== NONE) return "Round 1 is a truce: nobody takes a rival's land yet.";
  const g = guardOf(p, i), need = g.n + 1;
  if (source[0] === "u" && p.moved[Number(source.slice(1))]) return "That unit has moved this turn.";
  if (!g.n || beats(p, rank, g.n)) return "It cannot go there now.";
  return `${nameOf(p, i)} is guarded ${g.n} by the ${g.what} at ${nameOf(p, g.at)}. ${need <= topOf(p) ? `It takes a ${RANK[need].toLowerCase()}${source[0] === "h" ? ": a new scout takes only unguarded land" : ""}.` : "Nothing can take it while that stands."}`;
}
/** A territory's money in a sentence. */
const money = (t) => `${t.purse} coin. Earns ${t.income}, pays ${t.upkeep}: ${t.net >= 0 ? "+" : ""}${t.net} a turn.`;
/** The territories that cannot pay their units at the start of the player's next turn. */
const doomed = (p) => territories(p, p.seat).filter((t) => t.purse + t.net < 0 && t.cells.some((c) => p.unit[c]));
const costOf = (p, m, t) => (m.do === "fort" ? p.rule.fort : m.do === "farm" ? farmPrice(p, t.cells) : raiseOf(p));

function tap(T, i) {
  if (!T.ready() || i >= boardOf(T.match.position).size) return;
  const p = T.match.position, go = source && options(T).find((m) => m.to === i), ready = p.owner[i] === p.seat && p.unit[i] && legal(T).some((m) => from(m) === `u${i}`);
  // a unit's step goes at once; anything paid for is aimed by the first tap and bought by a second (or by the button), and a ready unit of yours is chosen rather than joined
  if (go && !(source[0] === "h" && ready)) {
    if (go.do === "move" || where === i) return T.play(go);
    where = i;
    return T.refresh();
  }
  if (p.owner[i] === p.seat) {
    const all = legal(T), t = territories(p, p.seat).find((x) => x.cells.includes(i)), unit = `u${i}`, hall = t && `h${t.hall}`;
    if (p.unit[i] && source !== unit && all.some((m) => from(m) === unit)) source = unit;
    else if (hall && source !== hall && all.some((m) => from(m) === hall)) { source = hall; if (!all.some((m) => from(m) === hall && m.do === build)) build = "raise"; }
    else if (source) source = null;
    else return toast(p.unit[i] ? "That unit has moved this turn." : !t ? "A lone hex earns nothing and cannot act." : `A scout costs ${raiseOf(p)}. This territory has ${t.purse}.`);
    where = null;
    return T.refresh();
  }
  if (p.water[i]) return undefined;
  return toast(source ? refusal(p, i) : "Choose one of your villages or units first.");
}
/** What the chosen village or unit has, and what the aimed move would leave: the purse is seen before it is spent. */
function ledger(T, p, m, ts) {
  const at = source ? Number(source.slice(1)) : -1, t = ts.find((x) => x.cells.includes(at)), out = [];
  if (t) out.push(el("span", `${villageName(p, t.hall)}: ${money(t)}`));
  if (t && m) {
    const made = act(p, m), q = made.position, u = territories(q, p.seat).find((x) => x.cells.includes(m.to)), took = made.events.find((e) => e.kind === "take");
    if (u) {
      const short = u.purse + u.net < 0 && u.cells.some((c) => q.unit[c]), turns = u.net < 0 ? Math.floor(u.purse / -u.net) : 0;
      const line = el("span", `After: ${u.purse} coin, ${u.net >= 0 ? "+" : ""}${u.net} a turn${u.cells.length !== t.cells.length ? `, ${u.cells.length} hexes` : ""}.${short ? " It could not pay next turn: every unit there would disband." : u.net < 0 ? ` It can pay for ${turns} more ${turns === 1 ? "turn" : "turns"}.` : ""}`);
      if (short) line.style.color = "var(--danger)";
      out.push(line);
    }
    const tell = [made.events.some((e) => e.kind === "split") && "This cuts their land in two.", p.hall[m.to] && p.owner[m.to] !== p.seat && "Their village falls.", took?.lost && `Its purse of ${took.lost} is lost.`].filter(Boolean);
    if (tell.length) out.push(el("span", tell.join(" ")));
  }
  $("ledger").hidden = !out.length;
  $("ledger").replaceChildren(...out);
}
/** End the turn. A village that cannot pay is named first, once. */
function endTurn(T) {
  if (!T.ready()) return;
  const p = T.match.position, lost = doomed(p);
  if (lost.length && warned !== T.match.list.length) {
    warned = T.match.list.length;
    toast(`${lost.map((t) => villageName(p, t.hall)).join(" and ")} cannot pay next turn: every unit there would disband. End turn again to go on anyway, or first take land, clear woods or join the land to a richer village.`);
    return;
  }
  T.play({ do: "end" });
}
// ---- the count: what each seat did, read again from the game's own moves ----
let counted = { key: "", rows: [] };
function count(T) {
  const m = T.match, key = `${m.seed}/${m.list.length}`;
  if (counted.key === key) return counted.rows;
  const again = createMatch(fable, { seed: m.seed, options: m.options }), rows = Array.from({ length: m.options.seats }, () => ({ peak: 0, took: 0, lost: 0, raised: 0, starved: 0, cuts: 0 }));
  const peaks = () => rows.forEach((r, s) => { r.peak = Math.max(r.peak, cellsOf(again.position, s)); });
  peaks();
  for (const mv of m.list) {
    if (mv.do === "raise") rows[again.position.seat].raised++;
    let by = -1;
    for (const e of again.play(mv)) {
      if (e.kind === "take") { by = e.seat; if (e.was !== NONE) { rows[e.seat].took++; rows[e.was].lost++; } }
      else if (e.kind === "split" && by >= 0) rows[by].cuts++;
      else if (e.kind === "starve" || e.kind === "stranded") rows[e.seat].starved += e.cells.length;
    }
    peaks();
  }
  counted = { key, rows };
  return rows;
}
function countTable(T) {
  const box = el("div", undefined, "ranks"), t = el("table"), row = (cells, tag) => { const r = el("tr"); r.append(...cells.map((c) => el(tag, String(c)))); return r; }, c = count(T), p = T.match.position;
  t.append(row(["Player", "Land", "Most", "Taken", "Lost", "Raised", "Starved", "Cuts"], "th"), ...c.map((r, s) => row([NAMES[s], cellsOf(p, s), r.peak, r.took, r.lost, r.raised, r.starved, r.cuts], "td")));
  box.append(t, el("p", "Most: the most land held at once. Taken and Lost: rival hexes. Raised: scouts bought. Starved: units lost to an empty purse. Cuts: times a rival's land was cut in two.", "about"));
  return box;
}
// ---- the voyage: the ladder of islands (src/games/fable/ladder.js); what is won is kept in this browser ----
const VOYAGE = "capo-fable-voyage", SHAPE = { round: "round", lakes: "with lakes", crescent: "a crescent", arms: "long arms", chain: "a chain" }, BOT = { gentle: "gentle", easy: "easy", normal: "", hard: "hard" };
const INSPIRED = "Traditional rules are inspired by Slay, the hex island game by Sean O'Connor. Not affiliated with or endorsed by its makers. Our own map, names, numbers and art.";
function voyage() { try { const v = JSON.parse(localStorage.getItem(VOYAGE) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } }
function keepVoyage(v) { try { localStorage.setItem(VOYAGE, JSON.stringify(v)); } catch { /* the voyage is then only for this visit */ } }
const wonSteps = () => Object.keys(voyage()).map(Number).filter((n) => n >= 1 && n <= ISLANDS);
/** A step's rivals in words: "2 rivals (1 hard)". */
function rivals(v) {
  const them = v.kinds.slice(1), kinds = [...new Set(them)].filter((k) => BOT[k]).map((k) => `${them.filter((x) => x === k).length} ${BOT[k]}`);
  return `${them.length} ${them.length === 1 ? "rival" : "rivals"}${kinds.length ? ` (${kinds.join(", ")})` : ""}`;
}
function sail(n) {
  const v = island(n);
  if ($("sheet").open) $("sheet").close();
  T.begin(createMatch(fable, { seed: v.seed, options: v.options }), v.kinds);
  toast(`Island ${n} of ${ISLANDS}: ${v.name}. ${rivals(v)}. Par ${v.par} rounds.`);
}
function voyageSheet() {
  const log = voyage(), last = open(wonSteps()), box = el("div", undefined, "stack");
  box.append(el("p", `${ISLANDS} islands in four seas, each harder than the last: more rivals, better ones, larger and stranger islands, and a start less kind to you. Win an island to open the next two. ${wonSteps().length} of ${ISLANDS} won.`));
  for (let n = 1; n <= ISLANDS; n++) {
    const v = step(n), b = el("button", `${n}. ${v.name}`, log[n] ? "quiet" : n <= last ? "main" : "quiet");
    if (v.n % 6 === 1) box.append(el("h3", SEAS[v.sea]));
    b.type = "button"; b.disabled = n > last;
    b.append(el("small", ` ${v.size}, ${SHAPE[v.isle]}, ${rivals(v)}${v.extra.length ? `, ${v.extra.join(" and ")}` : ""}. ${log[n] ? `Won in ${log[n]} rounds${log[n] <= v.par ? ", within par" : `, par ${v.par}`}.` : n <= last ? `Par ${v.par} rounds.` : "Not yet open."}`));
    b.onclick = () => sail(n);
    box.append(b);
  }
  sheet("The voyage", box, "Close", "wide");
}
// ---- the guided first game: Traditional on a small round island, against one gentle bot ----
const has = (ev, ...kinds) => ev.some((e) => kinds.includes(e.kind));
const pos = (T) => T.match.position;
/** The village of the richest territory. */
const richest = (p) => territories(p, p.seat).reduce((a, b) => (b.purse > a.purse ? b : a), { purse: -1 }).hall;
/** A unit of the player's that can still act: the chosen one, else the first. */
const idle = (T) => (source?.[0] === "u" ? Number(source.slice(1)) : legal(T).find((m) => m.do === "move")?.from);
/** Moves onto a rival's land; with `cut`, only those that split it. */
function strikes(T, cut) {
  const p = pos(T);
  return legal(T).filter((m) => m.to !== undefined && p.owner[m.to] !== NONE && p.owner[m.to] !== p.seat && (!cut || act(p, m).events.some((e) => e.kind === "split")));
}
/** Point at what makes a strike: the unit or village, then where it goes. */
function strike(T, cut) {
  const list = strikes(T, cut), mine = list.find((m) => from(m) === source);
  return mine ? mine.to : list[0] ? Number(from(list[0]).slice(1)) : null;
}
const LESSON = {
  // Traditional in every rule but one: the same order every round, so the bot never moves twice running after the truce; its bot is gentle (src/games/fable/bot.js)
  seed: "lesson 21", options: { style: "custom", order: "fixed", seats: 2, isle: "round", size: "small" }, kinds: ["you", "gentle"],
  steps: [
    { at: (T) => richest(pos(T)), or: () => $("sources"), done: (T, ev) => source?.[0] === "h" || has(ev, "raise", "clear", "take", "merge"),
      say: "Joined land is a territory with one village, and the number on its tower is its purse: choose your village, on the map or in the list." },
    { at: (T) => (source?.[0] !== "h" ? richest(pos(T)) : where === null ? $("wheres") : $("do")), or: () => $("sources"), done: (T, ev) => has(ev, "raise", "clear", "take", "merge"),
      say: (T) => `A scout costs ${raiseOf(pos(T))} from that purse: choose where it stands, in the list or on the map, then press the button. Take back undoes a move.` },
    { at: (T) => (source?.[0] === "u" ? $("wheres") : idle(T) ?? null), or: () => $("sources"), next: true, done: (T, ev) => has(ev, "move", "merge"),
      say: "Units walk anywhere inside your own land and can still act after; move one onto another scout and they join into a guard." },
    { at: () => document.querySelector("#seats li"), next: true,
      say: (T) => `Every turn a territory earns 1 coin a hex without woods and pays its units' wages (a scout costs ${upkeepOf(pos(T), 1)}); a purse that cannot pay loses all its units.` },
    { at: () => $("end"), done: (T, ev) => has(ev, "done"),
      say: (T) => (pos(T).round === 1 && pos(T).rule.opening === "truce" ? "Nobody may take a rival's land in the first round, so press End turn now." : "Press End turn when you are done.") },
    { when: (T) => pos(T).round > 1, at: (T) => strike(T, false), or: () => $(source ? "wheres" : "sources"), next: true, done: (T, ev) => ev.some((e) => e.kind === "take" && e.was !== NONE),
      say: "Take a rival hex beside your land: your unit must outrank every unit on and beside it, and a village guards like a scout. With a unit chosen, the numbers on rival land are its guard; a red one is too strong for that unit." },
    { when: (T) => pos(T).round > 1, at: (T) => strike(T, true), or: () => $(source ? "wheres" : "sources"), next: true, done: (T, ev) => has(ev, "split"),
      say: "Cut a rival's territory in two: the part left without its village has no purse, so its units starve next turn." },
    { at: () => (give && !give.hidden ? give : $("land")), next: true,
      say: "Win by being the last one standing: a bot concedes when it is far behind, and Concede lets you give up. That is the lesson; play on." },
  ],
};
const SHAPES = [["round", "Round"], ["lakes", "With lakes"], ["crescent", "A crescent"], ["arms", "Long arms"], ["chain", "A chain of islands"]];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const T = createTable({
  game: fable, key: "fable", title: "The Island Fable", won: "The island is yours.", outOf: (p, s) => p.round > 1 && cellsOf(p, s) === 0, seats: [2, 3, 4, 5, 6], normal: 3, lengths: [[10, "Short"], [14, "Normal"], [18, "Long"]], pace: (p) => (p.classic ? 240 : 480),
  cellsOf, goalOf, landOf, choose, thinking, lesson: LESSON, hard: true,
  // where the Traditional rules come from: shown in the How to play sheet, and for the menu's About tab
  inspired: INSPIRED,
  about: {
    classic: "Traditional: the hex island game.\nThe hex island rules as players know them: the island is dealt out, villages keep purses, soldiers cost wages and merge into higher ranks, woods spread over idle land, you act as often as you like and move freely inside your own land, and you play until one is left or the rest concede. Ours: four ranks of our own, our prices and wages, forts of our own, and a first round of truce.",
    custom: "Custom: your own rules.\nSet every rule yourself: island shape and size, the start, actions a turn, ranks, prices, wages, woods, forts, the goal, the number of rounds, turn order, the first round and moving at home. Add any expansions on top.",
    ours: "Capo: our own variation.\nA small island settled from one village each, three actions a turn, no woods and no forts. A quick game of about ten rounds.",
    coda: "Coda: legacy campaigns, coming soon.\nPlay a run of games where each one changes the next: the map, the rules and the pieces carry the marks of what happened. Start from a premade legacy story, one shared by other players, or design your own with an AI assistant. Campaigns can always be played on without AI.",
  },
  choices: [
    { key: "isle", label: "Island", normal: "round", values: SHAPES },
    { key: "size", label: "Size", normal: "medium", values: [["small", "Small"], ["medium", "Medium"], ["large", "Large"], ["huge", "Huge"]] },
    { key: "day", label: "Which", normal: "new", local: true, values: [["new", "A new one"], ["today", "Today's island"]] },
  ],
  seedOf: (o) => (o.day === "today" ? `day ${today()} ${o.isle} ${o.size} ${o.seats}` : ""),
  switches: [
    { key: "start", label: "Start", normal: SWITCHES.start.normal, values: [["dealt", "Island dealt out"], ["homes", "One village each"]] },
    { key: "actions", label: "Actions a turn", normal: SWITCHES.actions.normal, values: [[3, "3"], [6, "6"], [99, "As many as you like"]] },
    { key: "ranks", label: "Ranks", normal: SWITCHES.ranks.normal, values: [[3, "Up to captain"], [4, "Up to marshal"]] },
    { key: "price", label: "A scout costs", normal: SWITCHES.price.normal, values: [[5, "5"], [8, "8"], [10, "10"]] },
    { key: "wages", label: "Wages", normal: SWITCHES.wages.normal, values: [["mild", "Mild"], ["fair", "Fair"], ["harsh", "Harsh"], ["steep", "Steep"]] },
    { key: "woods", label: "Woods", normal: SWITCHES.woods.normal, values: [["none", "None"], ["slow", "Spread slowly"], ["fast", "Spread fast"]] },
    { key: "fort", label: "Forts", normal: SWITCHES.fort.normal, values: [[0, "None"], [12, "Cost 12"], [18, "Cost 18"]] },
    { key: "goal", label: "To win", normal: SWITCHES.goal.normal, values: [["last", "Last one standing"], [60, "60%"], [75, "75%"], [90, "90%"], [100, "All of it"]] },
    { key: "limit", label: "Rounds", normal: SWITCHES.limit.normal, values: [[0, "No limit"], [15, "15"], [30, "30"], [50, "50"]] },
    { key: "order", label: "Turn order", normal: SWITCHES.order.normal, values: [["rotate", "First player moves on each round"], ["fixed", "Same first player every round"]] },
    { key: "opening", label: "First round", normal: SWITCHES.opening.normal, values: [["truce", "Truce: no taking a rival's land"], ["open", "Open from the start"]] },
    { key: "walk", label: "Moving at home", normal: SWITCHES.walk.normal, values: [["free", "Free: the unit can still act"], ["once", "Uses the unit's move"]] },
  ],
  expansions: EXPANSIONS.map((key) => ({ key, label: { farms: "Farms", boats: "Boats", gales: "Gales" }[key], note: { farms: "Build a farm beside a hall or another farm. It pays 3 a turn, and each costs more than the last.", boats: "A unit on the coast can cross up to three hexes of sea. A landing party on one hex feeds itself for its first turn ashore; still alone after that, it disbands.", gales: "Some rounds a gale keeps boats ashore and fells some woods." }[key] })),
  stats(p, s) { const t = territories(p, s); return [["Coin", t.reduce((n, x) => n + x.purse, 0)], ["A turn", `${t.reduce((n, x) => n + x.net, 0) >= 0 ? "+" : ""}${t.reduce((n, x) => n + x.net, 0)}`]]; },
  figures: (T, s) => { const c = count(T)[s]; return [["Most", c.peak], ["Taken", c.took], ["Lost", c.lost], ["Raised", c.raised], ["Starved", c.starved], ["Cuts", c.cuts]]; },
  more: { label: "The count so far", body: countTable },
  summary(T) {
    const r = T.match.result, p = T.match.position, n = stepOf(T.match.seed), me = T.kinds.indexOf("you"), c = me >= 0 && T.solo() ? count(T)[me] : null, why = String(r.why);
    const head = n ? `Island ${n} of ${ISLANDS}, ${step(n).name}: ${r.winners.includes(0) ? `yours in ${p.round} rounds (par ${step(n).par})` : `lost in round ${p.round}`}.` : r.winners.length > 1 ? `They ${why}.` : `${why[0].toUpperCase()}${why.slice(1)}, in ${p.round} rounds.`;
    return c ? `${head} You took ${c.took} rival ${c.took === 1 ? "hex" : "hexes"}, cut rival land ${c.cuts === 1 ? "once" : `${c.cuts} times`} and lost ${c.starved} ${c.starved === 1 ? "unit" : "units"} to hunger.` : head;
  },
  next(T) {
    const n = stepOf(T.match.seed);
    if (!n || T.kinds[0] !== "you") return null;
    const won = T.match.result.winners.includes(0);
    return won && n < ISLANDS ? { label: "Next island", go: () => sail(n + 1) } : won ? null : { label: "Sail again", go: () => sail(n) };
  },
  seen(T, events) {
    const n = stepOf(T.match.seed), end = events.find((e) => e.kind === "end");
    if (!n || !end || T.demo || T.kinds[0] !== "you" || !end.winners.includes(0) || end.winners.length > 1) return;
    const log = voyage(), best = log[n];
    if (!best || T.match.position.round < best) { log[n] = T.match.position.round; keepVoyage(log); }
  },
  line(e, p) {
    const who = NAMES[e.seat], name = (i) => nameOf(p, i);
    if (e.kind === "take") return e.was === NONE ? `${who} claims ${name(e.at)}.` : `${who} takes ${name(e.at)} from ${NAMES[e.was]}${e.won ? `, with ${e.won} coin` : e.lost ? `, whose purse of ${e.lost} is lost` : ""}.`;
    if (e.kind === "split") return `${who}'s land is cut in two.`;
    if (e.kind === "starve") { const t = territories(p, e.seat).find((x) => x.cells.includes(e.cells[0])); return `${who}${t ? `'s ${villageName(p, t.hall)}` : ""} cannot pay: ${e.cells.length === 1 ? "a unit disbands" : `${e.cells.length} units disband`}.`; }
    if (e.kind === "room") return `${who} needs a new village, ${villageName(p, e.at)}, at ${name(e.at)}: ${[e.rank && `a ${RANK[e.rank].toLowerCase()}`, e.fort && "a fort", e.farm && "a farm"].filter(Boolean).join(" and ")} there is lost to make room.`;
    if (e.kind === "stranded") return `${who}'s stranded ${e.cells.length === 1 ? "unit disbands" : "units disband"}.`;
    if (e.kind === "raise") return `${who} raises a scout at ${name(e.at)}.`;
    if (e.kind === "clear") return `${who} clears the wood at ${name(e.at)}.`;
    if (e.kind === "merge") return `${who} makes a ${RANK[e.rank].toLowerCase()} at ${name(e.at)}.`;
    if (e.kind === "fort") return `${who} builds a fort at ${name(e.at)}.`;
    if (e.kind === "farm") return `${who} plants a farm at ${name(e.at)}.`;
    if (e.kind === "gale") return "A gale: no boats this round.";
    if (e.kind === "done") return `${who} ends the turn.`;
    if (e.kind === "concede") return `${who} concedes. Their land is anyone's to claim.`;
    return "";
  },
  order: (events) => events.flatMap((e) => (e.kind === "take" ? [e.at] : [])),
  board(T, stage) {
    const p = T.match.position, b = boardOf(p), land = b.cells, ring = [], R = Math.max(...land.map(([q]) => q)) + 1, printed = p.classic;
    for (let q = -R; q <= R; q++) for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) === R) ring.push([q, r]);
    const cells = [...land, ...ring], sea = cells.map((_, i) => i >= land.length || !!p.water[i]), none = cells.map(() => false);
    document.body.classList.remove("atlas");
    return hexBoard(T, stage, {
      cells, rough: none, sea, ground: (i) => (sea[i] ? (i < land.length ? SHALLOW : SEA) : (printed ? GRASS : PAPER)[(i * 7 + (i >> 2)) % 3]),
      owner: () => [...T.match.position.owner, ...ring.map(() => NONE)],
      reading: { rim: true }, // reading hook (p10-reading): an owner's colour as each tile's rim and sides, so the land still reads
      pieces() {
        const q = T.match.position, out = [], can = new Set(T.human() ? legal(T).map(from) : []); // reading hook (p10-reading): what can still act, flagged
        q.tree.forEach((t, at) => { if (t) out.push({ kind: t === WOOD ? "tree" : "cairn", at }); });
        q.farm.forEach((f, at) => { if (f) out.push({ kind: "farm", at }); });
        q.fort.forEach((f, at) => { if (f) out.push({ kind: "fort", at, rgb: RGB[q.owner[at]] }); });
        for (let s = 0; s < q.seats; s++) for (const t of territories(q, s)) out.push({ kind: "tower", at: t.hall, rgb: RGB[s], count: t.purse, now: s === T.match.turn, warn: t.purse + t.net < 0, buy: can.has(`h${t.hall}`) });
        if (T.ready()) for (const g of guards) out.push({ kind: "token", at: g.at, n: g.n, hot: g.hot });
        q.unit.forEach((rank, at) => { if (rank) out.push({ kind: "unit", at, rank, rgb: RGB[q.owner[at]], tired: !!q.moved[at] || q.owner[at] !== T.match.turn, now: !q.moved[at] && q.owner[at] === T.match.turn, ready: can.has(`u${at}`) }); });
        return out;
      },
      tap: (i) => tap(T, i),
      can: (i) => i < land.length && (T.match.position.owner[i] === T.match.turn || (!!source && options(T).some((m) => m.to === i))),
    });
  },
  panel(T) {
    const p = T.match.position, all = legal(T), sources = [...new Set(all.map(from))].filter((s) => s[0] === "u" || s[0] === "h"), ts = territories(p, p.seat);
    if (source && !sources.includes(source)) source = null;
    const t = source && source[0] === "h" ? ts.find((x) => x.hall === Number(source.slice(1))) : null, kinds = t ? ["raise", "fort", "farm"].filter((k) => all.some((m) => from(m) === source && m.do === k)) : [];
    if (t && !kinds.includes(build)) build = kinds[0] || "raise";
    const list = source ? options(T).sort((a, b) => worth(p, a) - worth(p, b) || a.to - b.to) : [];
    if (!list.some((m) => m.to === where)) where = list[0]?.do === "move" ? list[0].to : null; // a unit's best step is offered; nothing paid for is chosen for you
    const idleUnits = sources.filter((x) => x[0] === "u").length, buyers = sources.filter((x) => x[0] === "h").length, lost = doomed(p);
    $("status").textContent = `${T.solo() ? "Your turn" : `${NAMES[p.seat]}'s turn`}: ${p.rule.actions < 99 ? `${p.left} of ${p.rule.actions} ${p.left === 1 ? "action" : "actions"} left, ` : ""}${idleUnits} ${idleUnits === 1 ? "unit" : "units"} ready, ${buyers} ${buyers === 1 ? "village" : "villages"} can buy${lost.length ? `. ${lost.map((x) => villageName(p, x.hall)).join(" and ")} cannot pay next turn` : ""}.`;
    $("sources").hidden = !sources.length;
    radio($("sources"), sources.map((s) => {
      const c = Number(s.slice(1));
      if (s[0] === "h") { const x = ts.find((y) => y.hall === c); return { value: s, label: villageName(p, c), note: `${nameOf(p, c)}: ${x.purse} coin, ${x.net >= 0 ? "+" : ""}${x.net} a turn` }; }
      return { value: s, label: `${RANK[p.unit[c]]} ${nameOf(p, c)}`, note: `costs ${upkeepOf(p, p.unit[c])} a turn` };
    }), source, (v) => { source = source === v ? null : v; where = null; T.refresh(); });
    $("builds").hidden = kinds.length < 2;
    radio($("builds"), kinds.map((k) => ({ value: k, label: { raise: "Scout", fort: "Fort", farm: "Farm" }[k], note: String(costOf(p, { do: k }, t || { cells: [] })) })), build, (v) => { build = v; where = null; T.refresh(); });
    $("wheres").hidden = !list.length;
    radio($("wheres"), list.map((m) => ({ value: m.to, label: `${verb(p, m)} ${nameOf(p, m.to)}${m.sea ? " by boat" : ""}`, note: `${whatAt(p, m.to)}${p.owner[m.to] !== p.seat && guardOf(p, m.to).n ? `, guard ${guardOf(p, m.to).n}` : ""}`, rgb: p.owner[m.to] === NONE ? PAPER[0] : RGB[p.owner[m.to]] })), where, (v) => { where = v; T.refresh(); });
    const m = list.find((x) => x.to === where);
    $("do").disabled = !m;
    $("do").replaceChildren(m ? `${verb(p, m)} ${nameOf(p, m.to)}` : source && list.length ? "Choose where" : sources.length ? "Choose a village or unit" : "Nothing to do");
    if (m && m.do !== "move") $("do").append(el("small", ` for ${costOf(p, m, t)}`));
    $("do").onclick = () => { const now = options(T).find((x) => x.to === where); if (now) T.play(now); };
    ledger(T, p, m, ts);
    $("end").onclick = () => endTurn(T);
    if (!give) { give = el("button", "", "text"); give.type = "button"; $("end").parentNode.after(give); } // apart from End turn, and small: it ends your game
    give.hidden = !all.some((x) => x.do === "concede");
    give.textContent = sure ? "Concede: tap again" : "Concede";
    give.onclick = () => { if (!T.ready()) return; if (sure) T.play({ do: "concede" }); else { sure = true; T.refresh(); } };
    // the guard on each rival hex beside the chosen land: red where this village or unit cannot take it
    const r = reach(p), rank = source?.[0] === "u" ? p.unit[Number(source.slice(1))] : 0, truce = p.rule.opening === "truce" && p.round === 1;
    guards = r ? [...r.edge].flatMap((c) => { const n = defence(p, c); return n ? [{ at: c, n, hot: truce || !rank || !beats(p, rank, n) }] : []; }) : [];
    const sig = `${T.match.list.length}/${guards.map((g) => `${g.at}.${g.n}.${g.hot ? 1 : 0}`).join()}`;
    if (sig !== guardsShown) { guardsShown = sig; T.board.show([], true); }
    T.board.light(list.filter((x) => ["Take", "Claim"].includes(verb(p, x))).map((x) => x.to), { ring: source ? Number(source.slice(1)) : -1, aim: where ?? -1, dots: list.filter((x) => !["Take", "Claim"].includes(verb(p, x))).map((x) => x.to) });
  },
  listing: (T) => { const p = T.match.position; return { head: ["Hex", "Whose and what"], rows: boardOf(p).cells.map((_, i) => i).filter((i) => !p.water[i]).map((i) => [nameOf(p, i), whatAt(p, i)]) }; },
  changed: () => { where = null; sure = false; },
  keys(T, k, e) {
    if (k === "e") endTurn(T);
    else if (k === "escape") { source = null; T.refresh(); } else if (k === "enter" && !(document.activeElement instanceof HTMLButtonElement && document.activeElement.id !== "do")) { e.preventDefault(); $("do").click(); }
  },
  rules: (classic, p) => [
    (p ? p.rule.order === "rotate" : classic) ? "Whoever moves first changes every round, so the last player of a round moves first in the next, twice in a row." : "The same order every round.",
    "Land that is joined up is a territory. Each has one village and its own purse, the number on the tower.",
    `Every turn a territory earns 1 coin for each hex without a wood${p?.farms ? ", and 3 for each farm" : ""}, and pays its units: ${[1, 2, 3, 4].slice(0, p ? p.rule.ranks : 4).map((r) => `${upkeepOf(p || { rule: { wages: SWITCHES.wages.normal } }, r)} for a ${RANK[r].toLowerCase()}`).join(", ")}. If it cannot pay, all its units disband and leave a cairn, which grows into a wood.`,
    `${p && p.rule.actions < 99 ? `You have ${p.rule.actions} actions a turn.` : "Act as often as you like, then end your turn."} Tap a village to raise a scout for ${p ? raiseOf(p) : 8}${p?.rule.fort ? ` or build a fort for ${p.rule.fort}` : ""}, or tap a unit to move it, then tap where.`,
    "A unit moves anywhere in its territory, or takes a hex beside it. Two units on one hex join: scout and scout make a guard, and so on up to the top rank.",
    (p ? p.rule.walk === "free" : classic) ? "Moving inside your own land does not use a unit up, so two units can join and still strike. Taking land or clearing a wood ends its turn; a new scout can act at once." : "Each unit moves once a turn.",
    "A unit guards its own hex and every hex beside it. A village guards like a scout and a fort like a guard. You need a higher rank to take guarded land; a marshal can take anything.",
    "Woods earn nothing and spread over empty land. A unit that steps in clears them, and its move is done.",
    "Cut a rival's land in two, and the part without the village starts with no money. Take a village, and its purse is lost.",
    "With a village or unit chosen, each guarded rival hex beside its land shows its guard as a number: red where that village or unit cannot take it. Tapping one says what guards it and what rank it takes.",
    "The move panel shows the chosen village's purse, what it earns and pays, and what the move you are aiming would leave, before you pay for it. A purse turning red on the map cannot pay next turn, and End turn names such a village once before it goes on.",
    "The voyage, on the title card, is a ladder of 24 islands in four seas against rivals that grow in number and skill. The menu's count so far shows what each player has taken, lost, raised and starved.",
    (p ? p.rule.goal === "last" : classic) ? `Win by being the last one standing. You may concede instead; a computer player concedes when one rival holds half the island and three times its land. ${p?.rule.limit ? "After the last round" : `After ${SAFETY} rounds`}, the most land wins.` : "Reach the bright mark on the bar to win, or hold the most land after the last round.",
    "Keys: Tab and arrows choose, Enter acts, E ends the turn, Escape lets go, U takes back.",
    ...(classic ? [INSPIRED] : []),
  ],
});
function voyageButton() { const won = wonSteps(); $("voyage").textContent = won.length >= ISLANDS ? "The voyage: all won" : `The voyage: island ${Math.min(ISLANDS, Math.max(0, ...won) + 1)} of ${ISLANDS}`; }
$("voyage").onclick = voyageSheet;
$("sheet").addEventListener("close", voyageButton);
voyageButton();
