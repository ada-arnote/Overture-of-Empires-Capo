// SPDX-License-Identifier: AGPL-3.0-or-later
// Grain and Glass on the table: roll, build in the hexes your routes reach, trade, and race to the points.
import { AWARD, BUSY, COST, EXPANSIONS, GOODS, NONE, SWITCHES, TERMS, WASTE, boardOf, glass, goalOf, pointsOf, rateOf, roadOf, sellPrice, total } from "../src/games/glass/rules.js";
import { choose, thinking } from "../src/games/glass/bot.js";
import { $, NAMES, RGB, createTable, el, radio, sheet, toast } from "./table.js";
import { hexBoard } from "./hexboard.js";
import { hexPicture } from "../src/map/hexes.js";

const SEA = [70, 116, 140], TILE = [[226, 196, 96], [176, 206, 214], [196, 120, 82], [228, 226, 214]], WASTEG = [150, 140, 120];
const KINDS = { route: "Route", depot: "Depot", town: "Town", harbour: "Harbour", plan: "Plan", trade: "Trade", use: "Play a plan", answer: "Answer the offer", spoil: "Spoilage", toll: "Toll gate" };
const PLAN = { harvest: "Harvest: two each of the two goods you hold least", works: "Works: two free routes", toll: "Toll: move the gate and take a good", seal: "Seal: a point" };
const AWARDS = { road: "Great Road", warden: "Toll Warden" };
const BUILDS = { route: ["Route"], depot: ["Depot", "1 point"], town: ["Town", "2 points, on a depot"], harbour: ["Harbour", "on a depot by the sea"], plan: ["Plan"] };
let kind = "depot", where = null;
/** The trade being put together: with whom ("bank", a seat, "any", or a list by name), which goods, and on which terms. */
const draft = { who: "bank", give: 0, get: 1, terms: 0, back: 0, counter: 0 };

const legal = (T) => (T.ready() ? T.match.legal() : []);
const nameOf = (p, i) => { const [q, r] = boardOf(p).cells[i], R = boardOf(p).radius; return String.fromCharCode(65 + r + R) + (q + R + 1 + Math.min(0, r)); };
const costText = (c) => c.flatMap((n, k) => (n ? [`${n} ${GOODS[k]}`] : [])).join(", ");
/** The builds this game has, and what a hand still lacks for one. */
const buildsOf = (p) => Object.keys(BUILDS).filter((k) => (k === "harbour" ? p.harbours : k !== "plan" || (p.rule.plans && p.deck.length)));
const missing = (h, k) => costText(COST[k].map((n, g) => Math.max(0, n - h[g])));
const kindOf = (m) => (["swap", "sell", "buy", "offer", "charter", "take", "withdraw"].includes(m.do) ? "trade" : ["accept", "refuse", "hold", "counter"].includes(m.do) ? "answer" : m.do);
const same = (a, b) => Object.keys(b).every((k) => a[k] === b[k]);
const keyOf = (m) => (m.at !== undefined && m.from === undefined ? m.at : JSON.stringify(m)); // a hex, or the whole move where one hex has several
const deal = (d) => `${d.n} ${GOODS[d.give]} for ${d.k} ${GOODS[d.get]}`;
const raidText = (p) => (p.rule.roll === "sum" ? "A 7" : "Doubles");
/** What a port swaps at: 3 of anything for 1, or 2 of its own good for 1 (and 3 of the rest). */
const portText = (g) => (g === 4 ? "3:1" : `2:1 ${GOODS[g]}`);
/** Each port's rate, printed on the sea beside it, so the board says what the flag means. */
function portLabels(p, picture) {
  const { near } = boardOf(p), out = [], dry = p.land.flatMap((l, i) => (l ? [picture.mid[i]] : []));
  const cx = dry.reduce((n, m) => n + m[0], 0) / dry.length, cy = dry.reduce((n, m) => n + m[1], 0) / dry.length, off = (m) => Math.hypot(picture.mid[m][0] - cx, picture.mid[m][1] - cy);
  p.port.forEach((g, i) => {
    const wet = near[i].filter((m) => !p.land[m]);
    if (g === NONE || !wet.length) return;
    out.push({ at: picture.mid[wet.reduce((a, b) => (off(b) > off(a) ? b : a))], sea: true, text: portText(g) }); // on the open sea beside it, away from the land
  });
  return out;
}
/** Where each award stands for a seat: who holds it and with how many, how near the seat is, and who is one short of taking it. */
function awardsOf(p, s) {
  const counts = { road: (o) => roadOf(p, o), warden: (o) => p.tolls[o] }, words = { road: "routes", warden: "tolls" };
  return Object.keys(AWARDS).filter((k) => k === "road" || (p.rule.gate && p.rule.plans)).map((k) => {
    const mine = counts[k](s), at = p[k], rival = Array.from({ length: p.seats }, (_, o) => o).filter((o) => o !== s).reduce((a, b) => (counts[k](b) > counts[k](a) ? b : a));
    if (at === NONE) return [`${AWARDS[k]} ${mine}/${AWARD[k]}`, false, `${AWARDS[k]}: you have ${mine} of the ${AWARD[k]} ${words[k]} it takes`];
    if (at !== s) return [`${AWARDS[k]}: ${NAMES[at]} ${counts[k](at)}, you ${mine}`, false];
    const close = counts[k](rival) >= mine - 1;
    return [`${AWARDS[k]}: yours with ${mine}${close ? `, ${NAMES[rival]} has ${counts[k](rival)}` : ""}`, close];
  });
}
/** How many ways in 36 a number comes up. */
const waysOf = (p) => (p.rule.roll === "sum" ? [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1] : [0, 1, 3, 5, 7, 9, 11]);
/** What a hex gives, in words: its good and number; for a depot, those of the hexes around it too. */
const yieldOf = (p, i) => (p.land[i] && p.good[i] !== WASTE ? `${GOODS[p.good[i]]} ${p.num[i]}` : "");
const yields = (p, at, around) => [at, ...(around ? boardOf(p).near[at] : [])].map((i) => yieldOf(p, i)).filter(Boolean).join(", ") || "nothing";
/** Goods a depot here would gather in 36 rolls, on average: the ways each hex around it comes up, added. */
const worth = (p, at) => [at, ...boardOf(p).near[at]].reduce((n, i) => n + (i === p.gate ? 0 : pips(p, i)), 0);
function label(p, m) {
  if (m.do === "swap") return `Give ${rateOf(p, p.seat, m.give)} ${GOODS[m.give]} for 1 ${GOODS[m.get]}`;
  if (m.do === "sell") return `Sell 1 ${GOODS[m.good]} for ${sellPrice(p, p.seat, m.good)} coin`;
  if (m.do === "buy") return `Buy 1 ${GOODS[m.good]} for 4 coin`;
  if (m.do === "offer") return m.to === NONE ? `Offer anyone ${deal(m)}, open until the round ends` : `Offer ${NAMES[m.to]} ${deal(m)}`;
  if (m.do === "accept") return p.ask.countered ? `Agree: give ${p.ask.n} ${GOODS[p.ask.give]}, get ${p.ask.k} ${GOODS[p.ask.get]}` : `Take it: give ${p.ask.k} ${GOODS[p.ask.get]}, get ${p.ask.n} ${GOODS[p.ask.give]}`;
  if (m.do === "counter") return `Counter: give ${m.k} ${GOODS[m.get]}, get ${m.n} ${GOODS[p.ask.give]}`;
  if (m.do === "refuse") return "Turn it down";
  if (m.do === "hold") return "Leave it open: take it on your turn, until the round ends";
  if (m.do === "take") return `Take ${NAMES[m.from]}'s offer: give ${m.k} ${GOODS[m.get]}, get ${m.n} ${GOODS[m.give]}`;
  if (m.do === "withdraw") return `Withdraw your offer to ${m.to === NONE ? "anyone" : NAMES[m.to]}: ${deal(m)}`;
  if (m.do === "spoil") return `Lose 1 ${GOODS[m.good]}`;
  if (m.do === "charter") return `Fill charter ${m.k + 1} for 2 points`;
  if (m.do === "use") return PLAN[m.plan];
  if (m.do === "plan") return `Draw a plan for ${costText(COST.plan)}`;
  if (m.do === "toll") return `Gate to ${nameOf(p, m.at)}${m.from === undefined ? "" : `, take a good from ${NAMES[m.from]}`}`;
  return `${KINDS[m.do]} at ${nameOf(p, m.at)}${m.free ? ", free" : ""}`;
}

function tap(T, i) {
  if (!T.ready()) return undefined;
  const p = T.match.position, list = legal(T).filter((m) => m.at === i), same = list.filter((m) => kindOf(m) === kind), here = same.length === 1 ? same[0] : list.length === 1 ? list[0] : null;
  if (here) return T.play(here);
  if (list.length) { kind = kindOf(list[0]); where = keyOf(same[0] || list[0]); return T.refresh(); } // several here: choose below
  return toast(p.phase === "toll" ? "Choose a hex that yields something." : "Nothing you can build there now.");
}

/** The cost card: every build, what it is worth, and what your hand still lacks for it. Kept in view on a wide screen. */
const costs = el("aside", undefined, "paper");
costs.id = "costs"; costs.hidden = true; costs.setAttribute("aria-label", "Costs");
const rolls = el("aside", undefined, "paper");
rolls.id = "rolls"; rolls.hidden = true; rolls.setAttribute("aria-label", "Rolls so far");
$("seats").after(costs, rolls);
function card(T) {
  const p = T.match.position, me = T.human() ? p.seat : T.kinds.indexOf("you");
  costs.hidden = T.demo || me < 0 || T.match.turn === null;
  if (costs.hidden) { rolls.hidden = true; return; }
  costs.replaceChildren(el("h2", "Costs"), ...buildsOf(p).map((k) => {
    const short = p.phase === "open" ? "" : missing(p.hands[me], k), row = el("p", undefined, short ? "short" : ""); // the opening is free
    row.append(el("b", BUILDS[k][0]), `${BUILDS[k][1] ? `, ${BUILDS[k][1]}` : ""}: ${costText(COST[k])}`, ...(short ? [el("small", `Missing ${short}`)] : []));
    return row;
  }));
  const bank = el("p"), seats = $("seats").getBoundingClientRect(), over = () => { const a = costs.getBoundingClientRect(); return a.height && seats.height && a.bottom + 8 > seats.top; };
  bank.append(el("b", "Bank"), `: ${GOODS.map((g, k) => `${rateOf(p, me, k)} ${g}`).join(", ")} for 1`);
  if (p.rule.market === "fixed" && p.phase !== "open") costs.append(bank);
  if (over()) bank.remove(); // a short screen: the trade desk shows the rates too
  if (over()) costs.hidden = true; // many seats on a short screen: the greyed builds in the move panel say the same
  // the rolls so far, under the seats where there is room; always a press away under Rolls
  rolls.hidden = !p.roll;
  if (rolls.hidden) return;
  rolls.replaceChildren(el("h2", "Rolls"), histogram(p));
  const at = rolls.getBoundingClientRect();
  if (at.height && seats.height && seats.bottom + 8 > at.top) rolls.hidden = true;
}

/** The rolls so far as bars, one for each number, with a line on each where the long run would put it. */
function histogram(p) {
  const ways = waysOf(p), nums = ways.flatMap((w, n) => (w ? [n] : [])), rolled = nums.reduce((a, n) => a + p.rolls[n], 0);
  const top = Math.max(1, ...nums.map((n) => Math.max(p.rolls[n], Math.ceil((ways[n] * rolled) / 36)))), box = el("div", undefined, "hist");
  box.setAttribute("role", "img");
  box.setAttribute("aria-label", `${rolled} ${rolled === 1 ? "roll" : "rolls"} so far. ${nums.map((n) => `${n}: ${p.rolls[n]}`).join(", ")}.`);
  box.append(...nums.map((n) => {
    const col = el("div", undefined, p.rule.roll === "sum" && n === 7 ? "raid" : BUSY[p.rule.roll].includes(n) ? "hot" : ""), bars = el("span"), bar = el("i"), due = el("u");
    bar.style.height = `${(100 * p.rolls[n]) / top}%`;
    due.style.bottom = `${(100 * ways[n] * rolled) / (36 * top)}%`;
    bars.append(bar, due);
    col.append(el("small", p.rolls[n] ? String(p.rolls[n]) : ""), bars, el("b", String(n)));
    return col;
  }));
  return box;
}
/** Rolls and goods: every roll so far against the long run, and what each player has gathered from the harvest. */
function ledger(T) {
  const p = T.match.position, body = el("div"), rolled = p.rolls.reduce((a, v) => a + v, 0), wrap = el("div", undefined, "ranks"), table = el("table");
  const tr = (cells, tag = "td") => { const r = el("tr"); r.append(...cells.map((c, i) => { const x = el(i ? tag : "th", String(c)); if (!i) x.scope = tag === "th" ? "col" : "row"; return x; })); return r; };
  const raids = p.rule.roll === "sum" ? ` A 7, the raid roll, has come up ${p.rolls[7]} ${p.rolls[7] === 1 ? "time" : "times"}; over the long run it is one roll in six.` : "";
  body.append(el("p", rolled ? `${rolled} ${rolled === 1 ? "roll" : "rolls"} so far. The line across each bar is where the long run would put it.${raids}` : "No rolls yet."), histogram(p));
  table.append(tr(["Gathered", ...GOODS, "All"], "th"), ...p.gained.map((g, s) => tr([NAMES[s], ...g, total(g)])));
  table.setAttribute("aria-label", "Goods gathered from the harvest");
  wrap.append(table);
  body.append(el("p", "Goods each player has gathered from the harvest. Trades, plans and the toll gate are not counted."), wrap, el("p", "The dice are fair and come from the game's seed: the same seed and moves always roll the same."));
  sheet("Rolls and goods", body, "Close", "paper");
}

// The guided first game}

// The guided first game: a small island, 8 points to win, a gentle bot, and you place first
const pos = (T) => T.match.position, has = (ev, ...k) => ev.some((e) => k.includes(e.kind));
function pips(p, i) { return p.land[i] && p.good[i] !== WASTE ? waysOf(p)[p.num[i]] : 0; }
/** The legal hex where a depot would gather most, for the lesson to point at. */
const richest = (T) => legal(T).filter((m) => m.do === "depot").map((m) => m.at).sort((a, b) => [b, ...boardOf(pos(T)).near[b]].reduce((n, i) => n + pips(pos(T), i), 0) - [a, ...boardOf(pos(T)).near[a]].reduce((n, i) => n + pips(pos(T), i), 0))[0];
const tab = (k) => [...$("sources").children].find((b) => b.textContent.startsWith(KINDS[k]) && !b.disabled) || $("sources");
const LESSON = {
  seed: "lesson 1", options: { style: "custom", seats: 2, size: "small", goal: 8, opening: "full", offers: 1, spare: 2 }, kinds: ["you", "easy"], // the gentle gate: nobody on 2 points or fewer is robbed while learning
  steps: [
    { at: (T) => (pos(T).opened % 2 ? $("wheres") : richest(T)), or: () => $("wheres"), done: (T, ev) => has(ev, "route"),
      say: (T) => (pos(T).opened % 2 ? "Now a route, on a hex beside your depot. Routes are how you reach new hexes to build on." : "Place your first depot, on the board or in the list. It gathers from its own hex and the six around it. A hex's number is the roll that makes it yield; red 6 and 8 come up most.") },
    { when: (T) => pos(T).phase === "open", at: (T) => (pos(T).opened % 2 ? $("wheres") : richest(T)), or: () => $("wheres"), done: (T) => pos(T).phase !== "open",
      say: (T) => (pos(T).opened % 2 ? "And its route. Then the game begins." : "The bot has placed twice. Now your second depot: it starts you with one good for every hex around it.") },
    { when: (T) => pos(T).phase === "main", at: (T) => pos(T).lit[0] ?? $("status"), or: () => $("info"), next: true,
      say: (T) => { const p = pos(T), [a, b] = p.roll || [0, 0]; return `Each turn starts with a roll: ${a} and ${b} make ${a + b}. Every hex with that number gives its good to each depot on it or beside it, two to a town. Your goods are counted in the panel.`; } },
    { when: (T) => pos(T).phase === "main", at: () => tab("trade"), next: true, done: (T, ev) => has(ev, "swap", "ask", "post", "take", "sell", "buy"),
      say: "Short of a good? Choose Trade: swap 4 of one good for 1 of another with the bank (fewer at a port of yours), or offer the bot one for one." },
    { when: (T) => pos(T).phase === "main", at: () => (costs.getClientRects().length ? costs : $("sources")), next: true, done: (T, ev) => has(ev, "route", "depot", "town", "plan"),
      say: "Building scores. A route reaches a new hex; a depot on a hex your routes reach is 1 point; a town in place of a depot is 2. What you cannot pay for yet is greyed, with what is missing." },
    { when: (T) => pos(T).phase === "main", at: () => $("end"), done: (T, ev) => has(ev, "done"),
      say: "When you are done, press End turn. The bot plays, then you roll again." },
    { when: (T) => pos(T).round > 1, at: (T) => (pos(T).gate === NONE ? $("status") : pos(T).gate), or: () => $("status"), next: true, done: (T, ev) => has(ev, "toll"),
      say: (T) => `${pos(T).phase === "toll" ? "A 7: the raid roll. " : "A roll of 7 is the raid: "}nothing yields, and anyone holding more than ${pos(T).rule.hand} goods loses half. Then the roller moves the toll gate, the barrier on the board, to block a hex and take a good from a rival beside it. In this lesson the gate is gentle: it takes nothing from a player on ${pos(T).rule.spare} points or fewer.` },
    { when: (T) => pos(T).round > 1 && pos(T).phase === "main", at: () => $("info"), next: true,
      say: `Awards are 2 points each, for whoever leads: the Great Road for ${AWARD.road} routes joined, the Toll Warden for ${AWARD.warden} tolls played. A plan costs ${costText(COST.plan)}: free routes, goods, a toll, or a point.` },
    { at: () => $("round"), next: true,
      say: (T) => `The first to ${goalOf(pos(T))} points wins: a depot is 1, a town 2, an award 2, a seal 1. The goal stays at the top of the screen. That is the lesson; play on.` },
  ],
};

createTable({
  game: glass, key: "glass", title: "Grain and Glass", won: "The island's trade is yours.", outOf: () => false /* nobody is knocked out of a trading game */, seats: [2, 3, 4, 5, 6], normal: 3, lengths: [], pace: () => 420,
  unit: "Points", cellsOf: pointsOf, goalOf, landOf: (p) => goalOf(p) + 3, choose, thinking, lesson: LESSON,
  stands: "That move stands: a roll, a draw or a steal, once seen, is not taken back.", // take back stops here (table.js)
  roundText: (p, wide = innerWidth > 820) => (p.over ? null : `Round ${p.round}${p.classic ? "" : `${wide ? " of " : "/"}${p.rounds}`}, ${goalOf(p)}${wide ? " points" : ""} to win`), // the goal in view all game
  about: {
    classic: "Traditional: inspired by Catan.\nThe settle-and-trade rules as players know them: hexes yield goods when their number is rolled, you build routes, depots and towns, trade with the bank and the other players, buy cards, and race to 10 points. A 7 spoils big hands and sends the toll gate to block a hex and take a good; the Great Road and the Toll Warden are worth 2 points to whoever leads; two free depots and routes to start, in order and back; offers can stay open. Ours: depots and towns stand in hexes and gather from the hexes beside them, our own goods, costs and plans, and the first player drawn by dice.\nNot affiliated with or endorsed by its makers. Our own island, names and art.",
    custom: "Custom: your own rules.\nSet every rule yourself: the island, the harvest roll, the points to win, the market, charters, the toll gate, plans, spoilage, awards, the opening, trade offers, actions a turn and the number of rounds. Add any expansions on top.",
    ours: "Capo: our own variation.\nA smaller island where the higher of two dice is the number and doubles pay double. A market with coin and prices that fall as you sell, public charters worth points, joining two ports scores, three actions a turn, and 14 points to win.",
    coda: "Coda: legacy campaigns, coming soon.\nPlay a run of games where each one changes the next: the map, the rules and the pieces carry the marks of what happened. Start from a premade legacy story, one shared by other players, or design your own with an AI assistant. Campaigns can always be played on without AI.",
  },
  switches: [
    { key: "size", label: "Island", normal: SWITCHES.size.normal, values: [["small", "Small"], ["medium", "Medium"], ["large", "Large"]] },
    { key: "roll", label: "Harvest roll", normal: SWITCHES.roll.normal, values: [["sum", "Two dice added"], ["high", "The higher die"]] },
    { key: "goal", label: "Points to win", normal: SWITCHES.goal.normal, values: SWITCHES.goal.values.map((v) => [v, String(v)]) },
    { key: "market", label: "Market", normal: SWITCHES.market.normal, values: [["fixed", "Swap 4 for 1, less at ports"], ["falling", "Coin, falling prices"]] },
    { key: "charters", label: "Charters", normal: false, values: [[false, "Off"], [true, "On"]] },
    { key: "gate", label: "Toll gate", normal: true, values: [[true, "On: blocks a hex, takes a good"], [false, "Off"]] },
    { key: "spare", label: "Gentle gate", normal: SWITCHES.spare.normal, values: [[0, "Off: it takes from anyone"], [2, "Spares players on 2 points"], [3, "Spares players on 3 points or fewer"]] },
    { key: "hand", label: "Spoilage on a raid roll", normal: SWITCHES.hand.normal, values: SWITCHES.hand.values.map((v) => [v, v ? `Over ${v} goods lose half` : "Never"]) },
    { key: "plans", label: "Plans", normal: true, values: [[true, "On"], [false, "Off"]] },
    { key: "awards", label: "Great Road and Toll Warden", normal: SWITCHES.awards.normal, values: [[true, "On, 2 points each"], [false, "Off"]] },
    { key: "opening", label: "Second depot starts you with", normal: SWITCHES.opening.normal, values: [["lean", "One of each good beside it"], ["full", "One for every hex beside it"]] },
    { key: "offers", label: "Trade offers a turn", normal: SWITCHES.offers.normal, values: [[0, "None"], [1, "1"], [2, "2"], [3, "3"]] },
    { key: "order", label: "Turn order", normal: SWITCHES.order.normal, values: [["fixed", "The same each round"], ["rotate", "First seat moves on each round"]] },
    { key: "actions", label: "Actions a turn", normal: SWITCHES.actions.normal, values: [[3, "3"], [99, "As many as you like"]] },
    { key: "limit", label: "Rounds", normal: SWITCHES.limit.normal, values: [[12, "12"], [16, "16"], [24, "24"], [40, "40"]] },
  ],
  expansions: EXPANSIONS.map((key) => ({ key, label: { ships: "Ships", harbours: "Harbours", seasons: "Seasons" }[key], note: { ships: "Routes may cross the sea beside the coast, for 2 Glass and 2 Salt.", harbours: "Build a harbour on a coastal depot: swap 2 of anything for 1.", seasons: "Each round may bring plenty of one good (one each), a drought (each loses one of it), or fair trade (better rates and prices)." }[key] })),
  stats: (p, s) => [["Goods", p.hands[s].reduce((n, v) => n + v, 0)], p.rule.market === "falling" ? ["Coin", p.coin[s]] : ["Plans", p.held[s].length], ...(p.rule.awards ? [["Awards", Object.keys(AWARDS).filter((k) => p[k] === s).map((k) => AWARDS[k]).join(", ") || "None"]] : []), ...(p.over ? [["Gathered", total(p.gained[s])]] : [])],
  line(e, p) {
    const who = NAMES[e.seat], at = (i) => nameOf(p, i);
    if (e.kind === "roll") return `${who} rolls ${e.dice[0]} and ${e.dice[1]}: ${e.n}${e.raid ? `, a raid roll${p.rule.gate ? ": the toll gate moves" : ""}` : ""}.`;
    if (e.kind === "harvest") {
      const gets = e.got.flatMap((g, s) => (g.some((v) => v) ? [`${NAMES[s]} ${costText(g)}`] : [])), blocked = e.gate !== NONE ? ` The gate holds ${at(e.gate)}.` : "";
      return e.hexes.length ? `${e.n} yields at ${e.hexes.map(at).join(", ")}: ${gets.join("; ") || "no depot beside them"}.${blocked}` : `No hex yields.${blocked}`;
    }
    if (e.kind === "spoils") return `Spoilage: ${e.lose.flatMap((n, s) => (n ? [`${NAMES[s]} loses ${n}`] : [])).join(", ")}.`;
    if (e.kind === "spoil") return `${who} loses 1 ${GOODS[e.good]}${e.left ? "" : ", and is done"}.`;
    if (e.kind === "award") return `${who} takes the ${AWARDS[e.what]} (${e.n} ${e.what === "road" ? "routes joined" : "tolls"})${e.from === NONE ? "" : ` from ${NAMES[e.from]}`}.`;
    if (e.kind === "depot") return `${who} builds a depot at ${at(e.at)}.`;
    if (e.kind === "town") return `${who} makes ${at(e.at)} a town.`;
    if (e.kind === "harbour") return `${who} builds a harbour at ${at(e.at)}.`;
    if (e.kind === "toll") return `${who} moves the toll gate to ${at(e.at)}${e.from === NONE ? "" : ` and takes 1 ${GOODS[e.good]} from ${NAMES[e.from]}`}.`;
    if (e.kind === "plan") return e.seal ? `${who} draws a seal: a point.` : `${who} draws a plan.`;
    if (e.kind === "use") return `${who} plays ${PLAN[e.plan].split(":")[0].toLowerCase()}.`;
    if (e.kind === "ask") return `${who} offers ${NAMES[e.to]} ${deal(e)}.`;
    if (e.kind === "counter") return `${who} counters: ${e.k} ${GOODS[e.get]} for ${e.n} ${GOODS[e.give]}.`;
    if (e.kind === "offer") return e.countered ? `${who} ${e.yes ? "agrees to" : "turns down"} ${NAMES[e.to]}'s counter${e.yes ? `: ${deal(e)}` : ""}.` : `${NAMES[e.to]} ${e.yes ? "takes" : "turns down"} ${who}'s offer${e.yes ? `: ${deal(e)}` : ""}.`;
    if (e.kind === "post") return e.to === NONE ? `${who} offers anyone ${deal(e)}, open until the round ends.` : `${NAMES[e.to]} leaves ${who}'s offer open: ${deal(e)}.`;
    if (e.kind === "take") return `${who} takes ${NAMES[e.from]}'s open offer: ${deal(e)}.`;
    if (e.kind === "withdraw") return `${who} withdraws an offer: ${deal(e)}.`;
    if (e.kind === "lapse") return `The round ends: ${e.n === 1 ? "an open offer lapses" : `${e.n} open offers lapse`}.`;
    if (e.kind === "charter") return `${who} fills a charter.`;
    if (e.kind === "season") return e.what === "plenty" ? `A season of plenty: 1 ${GOODS[e.good]} each.` : e.what === "drought" ? `A drought: each loses 1 ${GOODS[e.good]}.` : "A season of fair trade: better rates at the market.";
    if (e.kind === "done") return `${who} ends the turn.`;
    return "";
  },
  order: (events) => events.flatMap((e) => (e.at !== undefined && ["depot", "town", "route"].includes(e.kind) ? [e.at] : [])),
  board(T, stage) {
    const p = T.match.position, b = boardOf(p), sea = b.cells.map((_, i) => !p.land[i]), none = b.cells.map(() => false), picture = hexPicture(b.cells, none, sea);
    document.body.classList.remove("atlas");
    card(T);
    return hexBoard(T, stage, {
      era: "medieval", // figures hook: which sculpted pieces stand in 3D (src/map/figures.js)
      cells: b.cells, rough: none, sea, picture, labels: portLabels(p, picture), terrain: (i) => (sea[i] ? 1 : p.good[i] === WASTE ? 6 : [2, 4, 3, 5][p.good[i]]), ground: (i) => (sea[i] ? SEA : p.good[i] === WASTE ? WASTEG : TILE[p.good[i]]),
      owner: () => b.cells.map(() => NONE),
      pieces() {
        const q = T.match.position, out = [];
        q.land.forEach((l, at) => {
          if (q.port[at] !== NONE) out.push({ kind: "port", at, good: q.port[at] });
          if (l && q.good[at] !== WASTE) out.push({ kind: "token", at, n: q.num[at], pips: pips(q, at), hot: BUSY[q.rule.roll].includes(q.num[at]), lit: q.lit.includes(at) }); // lit: it yielded on the last roll
          if (q.route[at].length) out.push({ kind: "route", at, seats: q.route[at].map((s) => RGB[s]) });
          if (q.depot[at] !== NONE) out.push({ kind: q.town[at] ? "town" : "depot", at, seat: q.depot[at], rgb: RGB[q.depot[at]], harbour: !!q.harbour[at] });
        });
        if (q.gate !== NONE) out.push({ kind: "gate", at: q.gate });
        return out;
      },
      tap: (i) => tap(T, i),
      can: (i) => legal(T).some((m) => m.at === i),
      fit: b.cells.flatMap((_, i) => (p.land[i] || b.near[i].some((m) => p.land[m]) ? [i] : [])), // the island and the sea beside it fill the screen
    });
  },
  panel(T) {
    const p = T.match.position, all = legal(T), s = p.seat, h = p.hands[s], kinds = [...new Set(all.filter((m) => m.do !== "end").map(kindOf))];
    if (!kinds.includes(kind)) kind = kinds.includes("depot") ? "depot" : kinds[0] || "trade";
    card(T);
    // every build stays in the row: one you cannot make yet is greyed, and says what is missing or why
    const shown = p.phase === "main" ? [...buildsOf(p), ...kinds.filter((k) => !BUILDS[k])] : kinds;
    const why = (k) => (missing(h, k) ? `missing ${missing(h, k)}` : p.left <= 0 ? "no actions left" : { route: "nowhere to lay one", depot: "no free hex your routes reach", town: "no depot to raise", harbour: "no depot by the sea", plan: "none left" }[k]);
    const a = p.ask, roll = p.roll ? ` Rolled ${p.roll[0]} and ${p.roll[1]}, so ${p.rule.roll === "sum" ? p.roll[0] + p.roll[1] : Math.max(...p.roll)}: ${p.lit.length ? `${p.lit.length} ${p.lit.length === 1 ? "hex yields" : "hexes yield"}, ringed on the board` : "nothing yields"}.` : "";
    const phase = { open: `Place your ${p.opened % 2 ? "route" : "depot"}`, toll: p.played ? "Move the toll gate: block a hex and take a good from a rival beside it." : `${raidText(p)}: move the toll gate, block a hex and take a good from a rival beside it.${roll}`, works: "Lay your free routes",
      spoil: `${raidText(p)}: spoilage. ${NAMES[s]} holds more than ${p.rule.hand} goods and loses ${p.spoil[s]} more.`,
      answer: a && (a.countered ? `${NAMES[a.to]} counters ${NAMES[s]}'s offer: ${a.k} ${GOODS[a.get]} for ${a.n} ${GOODS[a.give]}.` : `${NAMES[a.from]} offers ${NAMES[s]} ${deal(a)}.`) }[p.phase];
    $("status").textContent = phase || `${T.solo() ? "Your turn" : `${NAMES[s]}'s turn`}.${roll}`;
    const tally = el("button", "Rolls");
    tally.type = "button"; tally.id = "tally"; tally.title = "Rolls and goods (L)"; tally.onclick = () => ledger(T);
    $("info").replaceChildren(...GOODS.map((g, k) => { const b = el("span", `${h[k]} ${g}`); b.style.background = `rgb(${TILE[k]})`; return b; }), ...(p.rule.market === "falling" ? [el("span", `${p.coin[s]} coin`)] : []), el("span", `${pointsOf(p, s)} of ${goalOf(p)} points`),
      ...(p.rule.awards ? awardsOf(p, s).map(([text, close, more]) => { const c = el("span", text, close ? "close" : ""); if (more) c.title = more; return c; }) : []), ...(p.deals.length ? [el("span", `${p.deals.length} open ${p.deals.length === 1 ? "offer" : "offers"}`)] : []), ...(p.roll ? [tally] : []));
    $("sources").hidden = p.phase !== "main" || !kinds.length;
    radio($("sources"), shown.map((k) => ({ value: k, label: KINDS[k], off: !kinds.includes(k), note: !kinds.includes(k) ? why(k) : COST[k] ? costText(COST[k]) : undefined })), kind, (v) => { kind = v; where = null; T.refresh(); });
    // what the second row lists, and the move chosen: places for a build, answers to an offer, or one side of the trade desk
    let list = all.filter((m) => m.do !== "end" && kindOf(m) === kind), extra = [], m = null, none = p.phase === "main" ? "Nothing to do here" : "Choose a hex";
    const rows = [], row = (name, items, chosen, pick) => { const d = el("div", undefined, "pick"); d.setAttribute("role", "radiogroup"); d.setAttribute("aria-label", name); radio(d, items, chosen, pick); rows.push(el("p", name, "cap"), d); };
    const set = (k) => (v) => { draft[k] = v; T.refresh(); }, goods = (skip, note, off) => GOODS.flatMap((g, i) => (i === skip ? [] : [{ value: i, label: g, rgb: TILE[i], note: note?.(i), off: off?.(i) }]));
    if (p.phase === "main" && kind === "trade") {
      const fixed = p.rule.market === "fixed", lists = { market: list.filter((x) => ["sell", "buy"].includes(x.do)), charters: list.filter((x) => x.do === "charter"), open: list.filter((x) => ["take", "withdraw"].includes(x.do)) };
      const rivals = Array.from({ length: p.seats }, (_, o) => o).filter((o) => o !== s), left = Math.min(p.offers, p.rule.offers - p.deals.filter((d) => d.from === s).length);
      const whos = [fixed ? { value: "bank", label: "Bank", note: "at your rates" } : { value: "market", label: "Market", note: "sell and buy" },
        ...(p.rule.charters ? [{ value: "charters", label: "Charters", note: lists.charters.length ? "2 points" : "none you can fill", off: !lists.charters.length }] : []),
        ...(p.rule.offers ? [...rivals.map((o) => ({ value: o, label: NAMES[o], rgb: RGB[o], note: `${total(p.hands[o])} goods` })), { value: "any", label: "Anyone", note: "stays open" }] : []),
        ...(lists.open.length ? [{ value: "open", label: "Open offers", note: `${lists.open.length} to take or withdraw` }] : [])];
      if (!whos.some((w) => w.value === draft.who && !w.off)) draft.who = whos[0].value;
      row("Trade with", whos, draft.who, (v) => { draft.who = v; where = null; T.refresh(); });
      if (lists[draft.who]) list = lists[draft.who];
      else {
        const bank = draft.who === "bank", [n, k] = TERMS[draft.terms], to = draft.who === "any" ? NONE : draft.who;
        if (draft.get === draft.give) draft.get = (draft.give + 1) % 4;
        row("You give", goods(-1, (g) => (bank ? `${rateOf(p, s, g)} for 1` : `have ${h[g]}`), (g) => h[g] < (bank ? rateOf(p, s, g) : 1)), draft.give, (v) => { draft.give = v; if (draft.get === v) draft.get = (v + 1) % 4; T.refresh(); });
        row("You get", goods(draft.give, (g) => `have ${h[g]}`), draft.get, set("get"));
        if (!bank) row("Terms: yours for theirs", TERMS.map(([x, y], i) => ({ value: i, label: `${x} for ${y}`, off: h[draft.give] < x })), draft.terms, set("terms"));
        const want = bank ? { do: "swap", give: draft.give, get: draft.get } : { do: "offer", to, give: draft.give, get: draft.get, n, k };
        m = all.find((x) => same(x, want)) || null;
        list = [];
        none = m ? "" : bank ? `You need ${rateOf(p, s, draft.give)} ${GOODS[draft.give]}` : p.left <= 0 ? "No actions left" : left <= 0 ? "No offers left this turn" : h[draft.give] < n ? `You need ${n} ${GOODS[draft.give]}`
          : to !== NONE && p.hands[to][draft.get] < k ? `${NAMES[to]} has too little ${GOODS[draft.get]}` : p.tried.includes([to, draft.give, draft.get, n, k].join(" ")) ? "Turned down this turn" : "An offer like it is already open";
        if (!bank && left > 0) rows.push(el("p", `${left} ${left === 1 ? "offer" : "offers"} left this turn. ${to === NONE ? "It stays open until taken, withdrawn, or the round ends." : "They answer at once, and may counter."}`, "hint"));
      }
    } else if (p.phase === "answer" && !a.countered) {
      const counters = list.filter((x) => x.do === "counter");
      list = list.filter((x) => x.do !== "counter");
      if (counters.length) extra = [{ value: "counter", label: "Counter-offer", note: "name your terms" }];
      if (where === "counter" && counters.length) {
        const can = (g, t) => counters.some((x) => x.get === g && (t === undefined || (x.n === TERMS[t][0] && x.k === TERMS[t][1])));
        if (!can(draft.back)) draft.back = counters[0].get;
        if (!can(draft.back, draft.counter)) draft.counter = TERMS.findIndex((_, t) => can(draft.back, t));
        row("You give", goods(a.give, (g) => `have ${h[g]}`, (g) => !can(g)), draft.back, set("back"));
        row(`For ${NAMES[a.from]}'s ${GOODS[a.give]}`, TERMS.map(([x, y], t) => ({ value: t, label: `Give ${y}, get ${x}`, off: !can(draft.back, t) })), draft.counter, set("counter"));
        m = counters.find((x) => x.get === draft.back && x.n === TERMS[draft.counter][0] && x.k === TERMS[draft.counter][1]) || null;
      }
    }
    const values = [...list.map(keyOf), ...extra.map((x) => x.value)];
    if (!values.includes(where)) where = values[0] ?? null;
    $("wheres").hidden = !values.length;
    radio($("wheres"), [...list.map((x) => ({ value: keyOf(x), label: label(p, x), note: x.at === undefined ? undefined : `${yields(p, x.at, x.do === "depot")}${x.do === "depot" ? `: ${worth(p, x.at)} goods in 36 rolls` : ""}` })), ...extra], where, (v) => { where = v; T.refresh(); });
    $("desk").hidden = !rows.length;
    $("desk").replaceChildren(...rows);
    m ||= list.find((x) => keyOf(x) === where) || null;
    $("do").disabled = !m;
    $("do").textContent = m ? label(p, m) : none;
    $("do").onclick = () => { if (m && T.ready()) T.play(m); };
    $("end").hidden = p.phase !== "main";
    $("end").onclick = () => { if (T.ready()) T.play({ do: "end" }); };
    T.board.light(list.filter((x) => x.at !== undefined).map((x) => x.at), { aim: m?.at ?? -1 });
  },
  listing: (T) => { const p = T.match.position; return { head: ["Hex", "Gives", "In 36 rolls", "Port", "Built"], rows: p.land.map((l, i) => i).filter((i) => p.land[i]).map((i) => [nameOf(p, i), yieldOf(p, i) || "waste", pips(p, i), p.port[i] === NONE ? "" : portText(p.port[i]), [p.depot[i] !== NONE && `${NAMES[p.depot[i]]}'s ${p.town[i] ? "town" : "depot"}`, p.route[i].length && `routes: ${p.route[i].map((s) => NAMES[s]).join(", ")}`, p.gate === i && "the toll gate"].filter(Boolean).join("; ")]) }; },
  changed: (T) => { where = null; card(T); },
  seen(T, events) { // what just happened to the one person at the table, said at once: goods gathered, goods taken, an offer answered
    card(T);
    const me = T.solo() ? T.kinds.indexOf("you") : -1, said = [];
    if (me < 0 || T.demo) return;
    for (const e of events) {
      if (e.kind === "harvest" && e.got[me].some((v) => v)) said.push(`You gather ${costText(e.got[me])}.`);
      if (e.kind === "toll" && e.from === me) said.push(`${NAMES[e.seat]} takes 1 ${GOODS[e.good]} from you.`);
      if (e.kind === "toll" && e.seat === me && e.from !== NONE) said.push(`You take 1 ${GOODS[e.good]} from ${NAMES[e.from]}.`);
      if (e.kind === "award" && e.from === me) said.push(`${NAMES[e.seat]} takes the ${AWARDS[e.what]} from you.`);
    }
    if (said.length) toast(said.join(" "));
  },
  keys(T, k, e) {
    if (k === "e") $("end").click();
    else if (k === "l" && T.match.position.roll) ledger(T);
    else if (k === "t" && !$("sources").hidden && legal(T).some((m) => kindOf(m) === "trade")) { kind = "trade"; where = null; T.refresh(); }
    else if (k === "enter" && !(document.activeElement instanceof HTMLButtonElement && document.activeElement.id !== "do")) { e.preventDefault(); $("do").click(); }
  },
  rules: (_, p) => { const r = p?.rule || Object.fromEntries(Object.entries(SWITCHES).map(([k, o]) => [k, o.normal])); return [ // before a game: Traditional's
    `The first to ${r.goal} points wins. A depot is worth 1, a town 2, each award 2, a seal 1.`,
    "Each turn begins with a roll. Every hex showing that number gives one of its good to each depot on it or beside it, and two to a town. A dark hex gives nothing.",
    `Build: a route (${costText(COST.route)}) on a hex beside your routes or depots; a depot (${costText(COST.depot)}) on a hex your routes reach, with no depot on it or beside it; a town (${costText(COST.town)}) in place of a depot.`,
    r.market === "falling" ? "Sell goods for coin: 3, then 2, then 1 as more of a good is sold; prices recover each turn. Buy any good for 4 coin." : "Swap 4 of one good for 1 of any other at the bank, 3 at a port hex of yours, 2 at a port for that good. Each port's rate is printed on the sea beside its flag: 3:1, or 2:1 and the good.",
    "Offer one player a good for one of theirs, one for one or up to three for one either way: they take it, turn it down, name other terms once (a counter-offer, which you take or turn down), or leave it open to take on their own turn. Or offer it to anyone. An open offer stands until it is taken, you withdraw it, or the round ends. An offer turned down cannot be made again that turn.",
    "A bot trades when the swap brings its next build closer and costs it less than the bank would, or when it gets more goods than it gives and needs none of them. It never trades with a player two points from winning, never leaves an offer open, and asks the leader for two for one. The easy bot simply gives what it has more of.",
    ...(r.plans ? [`Draw a plan for ${costText(COST.plan)}: a harvest (two each of the two goods you hold least), two free routes, a toll (move the gate and take a good), or a seal worth a point at once. A plan can be played the turn it is drawn; play one plan a turn.`] : []),
    ...(r.gate || r.hand ? [`${r.roll === "high" ? "Doubles are" : "A 7 is"} the raid roll${r.roll === "high" ? "" : ": no hex carries a 7, so nothing yields"}.${r.hand ? ` Anyone holding more than ${r.hand} goods loses half, rounded down, and chooses what.` : ""}${r.gate ? " Then the roller moves the toll gate to another hex and takes one good, unseen, from a rival with a depot on it or beside it. The hex under the gate yields nothing until it moves." : ""}`] : []),
    ...(r.awards ? [`Awards, 2 points each, held by whoever leads and passed on when beaten: the Great Road, for the most routes in one joined network (at least ${AWARD.road})${r.gate && r.plans ? `, and the Toll Warden, for the most tolls played (at least ${AWARD.warden})` : ""}.`] : []),
    ...(r.charters ? ["Charters: three public orders for six goods. Fill one for 2 points. Joining two ports with your routes scores 2."] : []),
    `Openings: each player places a depot and a route, in order and then back again. The second depot starts you with ${r.opening === "full" ? "one good for every hex on it or beside it" : "one of each good on it or beside it"}.`,
    ...(r.spare ? [`The gentle gate: the toll gate takes nothing from a player with ${r.spare} points or fewer.`] : []),
    "Each roll rings the numbers that yield in silver, and the log says who got what. Builds you cannot pay for yet stay in the list, greyed, with what is missing; the cost card shows them all, with your bank rates.",
    "Rolls and goods (the Rolls button, or L) shows every roll so far against the long run, and what each player has gathered. The dice come from the game's seed and are never adjusted.",
    "Keys: Tab and arrows choose, Enter acts, T trades, L shows the rolls, E ends the turn, U takes back.",
  ]; },
});
