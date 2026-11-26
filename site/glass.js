// SPDX-License-Identifier: AGPL-3.0-or-later
// Grain and Glass on the table: roll, build in the hexes your routes reach, trade, and race to the points.
import { AWARD, BUSY, COST, EXPANSIONS, GOODS, NONE, SWITCHES, WASTE, boardOf, glass, goalOf, pointsOf, rateOf, roadOf, sellPrice } from "../src/games/glass/rules.js";
import { choose, thinking } from "../src/games/glass/bot.js";
import { $, NAMES, RGB, createTable, el, radio, toast } from "./table.js";
import { hexBoard } from "./hexboard.js";

const SEA = [70, 116, 140], TILE = [[226, 196, 96], [176, 206, 214], [196, 120, 82], [228, 226, 214]], WASTEG = [150, 140, 120];
const KINDS = { route: "Route", depot: "Depot", town: "Town", harbour: "Harbour", plan: "Plan", trade: "Trade", use: "Play a plan", answer: "Answer the offer", spoil: "Spoilage", toll: "Toll gate" };
const PLAN = { harvest: "Harvest: two goods you lack", works: "Works: two free routes", toll: "Toll: move the gate and take a good", seal: "Seal: a point" };
const AWARDS = { road: "Great Road", warden: "Toll Warden" };
let kind = "depot", where = null;

const legal = (T) => (T.ready() ? T.match.legal() : []);
const nameOf = (p, i) => { const [q, r] = boardOf(p).cells[i], R = boardOf(p).radius; return String.fromCharCode(65 + r + R) + (q + R + 1 + Math.min(0, r)); };
const costText = (c) => c.flatMap((n, k) => (n ? [`${n} ${GOODS[k]}`] : [])).join(", ");
const kindOf = (m) => (["swap", "sell", "buy", "offer", "charter", "take", "withdraw"].includes(m.do) ? "trade" : ["accept", "refuse", "hold"].includes(m.do) ? "answer" : m.do);
const keyOf = (m) => (m.at !== undefined && m.from === undefined ? m.at : JSON.stringify(m)); // a hex, or the whole move where one hex has several
const deal = (d) => `1 ${GOODS[d.give]} for 1 ${GOODS[d.get]}`;
const raidText = (p) => (p.rule.roll === "sum" ? "A 7" : "Doubles");
const held = (p) => Object.entries(AWARDS).flatMap(([k, v]) => (p[k] === NONE ? [] : [`${v}: ${NAMES[p[k]]}`]));
function label(p, m) {
  if (m.do === "swap") return `Give ${rateOf(p, p.seat, m.give)} ${GOODS[m.give]} for 1 ${GOODS[m.get]}`;
  if (m.do === "sell") return `Sell 1 ${GOODS[m.good]} for ${sellPrice(p, p.seat, m.good)} coin`;
  if (m.do === "buy") return `Buy 1 ${GOODS[m.good]} for 4 coin`;
  if (m.do === "offer") return m.to === NONE ? `Offer anyone ${deal(m)}, open until the round ends` : `Offer ${NAMES[m.to]} ${deal(m)}`;
  if (m.do === "accept") return `Take it: give 1 ${GOODS[p.ask.get]}, get 1 ${GOODS[p.ask.give]} from ${NAMES[p.ask.from]}`;
  if (m.do === "refuse") return "Turn it down";
  if (m.do === "hold") return "Leave it open: take it on your turn, until the round ends";
  if (m.do === "take") return `Take ${NAMES[m.from]}'s offer: give 1 ${GOODS[m.get]}, get 1 ${GOODS[m.give]}`;
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

createTable({
  game: glass, key: "glass", title: "Grain and Glass", won: "The island's trade is yours.", outOf: () => false /* nobody is knocked out of a trading game */, seats: [2, 3, 4, 5, 6], normal: 3, lengths: [], pace: () => 420,
  unit: "Points", cellsOf: pointsOf, goalOf, landOf: (p) => goalOf(p) + 3, choose, thinking,
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
  stats: (p, s) => [["Goods", p.hands[s].reduce((n, v) => n + v, 0)], p.rule.market === "falling" ? ["Coin", p.coin[s]] : ["Plans", p.held[s].length], ...(p.rule.awards ? [["Awards", Object.keys(AWARDS).filter((k) => p[k] === s).map((k) => AWARDS[k]).join(", ") || "None"]] : [])],
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
    if (e.kind === "ask") return `${who} offers ${NAMES[e.to]} ${GOODS[e.give]} for ${GOODS[e.get]}.`;
    if (e.kind === "offer") return `${NAMES[e.to]} ${e.yes ? "takes" : "turns down"} ${who}'s offer.`;
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
    const p = T.match.position, b = boardOf(p), sea = b.cells.map((_, i) => !p.land[i]), none = b.cells.map(() => false);
    document.body.classList.remove("atlas");
    return hexBoard(T, stage, {
      cells: b.cells, rough: none, sea, plain: true, ground: (i) => (sea[i] ? SEA : p.good[i] === WASTE ? WASTEG : TILE[p.good[i]]),
      owner: () => b.cells.map(() => NONE),
      pieces() {
        const q = T.match.position, out = [];
        q.land.forEach((l, at) => {
          if (q.port[at] !== NONE) out.push({ kind: "port", at, good: q.port[at] });
          if (l && q.good[at] !== WASTE) out.push({ kind: "token", at, n: q.num[at], hot: BUSY[q.rule.roll].includes(q.num[at]), lit: q.lit.includes(at) }); // lit: it yielded on the last roll
          if (q.route[at].length) out.push({ kind: "route", at, seats: q.route[at].map((s) => RGB[s]) });
          if (q.depot[at] !== NONE) out.push({ kind: q.town[at] ? "town" : "depot", at, seat: q.depot[at], rgb: RGB[q.depot[at]], harbour: !!q.harbour[at] });
        });
        if (q.gate !== NONE) out.push({ kind: "gate", at: q.gate });
        return out;
      },
      tap: (i) => tap(T, i),
      can: (i) => legal(T).some((m) => m.at === i),
    });
  },
  panel(T) {
    const p = T.match.position, all = legal(T), s = p.seat, kinds = [...new Set(all.filter((m) => m.do !== "end").map(kindOf))];
    if (!kinds.includes(kind)) kind = kinds.includes("depot") ? "depot" : kinds[0] || "trade";
    const list = all.filter((m) => m.do !== "end" && kindOf(m) === kind);
    if (!list.some((m) => keyOf(m) === where)) where = list[0] ? keyOf(list[0]) : null;
    const roll = p.roll ? ` Rolled ${p.roll[0]} and ${p.roll[1]}: ${p.lit.length ? `${p.lit.length} ${p.lit.length === 1 ? "hex yields" : "hexes yield"}, ringed in gold` : "nothing yields"}.` : "";
    const phase = { open: `Place your ${p.opened % 2 ? "route" : "depot"}`, toll: p.played ? "Move the toll gate: block a hex and take a good from a rival beside it." : `${raidText(p)}: move the toll gate, block a hex and take a good from a rival beside it.${roll}`, works: "Lay your free routes",
      spoil: `${raidText(p)}: spoilage. ${NAMES[s]} holds more than ${p.rule.hand} goods and loses ${p.spoil[s]} more.`, answer: p.ask && `${NAMES[p.ask.from]} offers ${NAMES[s]} 1 ${GOODS[p.ask.give]} for 1 ${GOODS[p.ask.get]}.` }[p.phase];
    $("status").textContent = phase || `${T.solo() ? "Your turn" : `${NAMES[s]}'s turn`}.${roll}`;
    $("info").replaceChildren(...GOODS.map((g, k) => { const b = el("span", `${p.hands[s][k]} ${g}`); b.style.background = `rgb(${TILE[k]})`; return b; }), ...(p.rule.market === "falling" ? [el("span", `${p.coin[s]} coin`)] : []), el("span", `${pointsOf(p, s)} of ${goalOf(p)} points`),
      ...(p.rule.awards ? [el("span", held(p).join(", ") || `Great Road: ${roadOf(p, s)} of ${AWARD.road} routes`)] : []), ...(p.deals.length ? [el("span", `${p.deals.length} open ${p.deals.length === 1 ? "offer" : "offers"}`)] : []));
    $("sources").hidden = p.phase !== "main" || !kinds.length;
    radio($("sources"), kinds.map((k) => ({ value: k, label: KINDS[k], note: COST[k] ? costText(COST[k]) : undefined })), kind, (v) => { kind = v; where = null; T.refresh(); });
    $("wheres").hidden = !list.length;
    radio($("wheres"), list.map((m) => ({ value: keyOf(m), label: label(p, m) })), where, (v) => { where = v; T.refresh(); });
    const m = list.find((x) => keyOf(x) === where);
    $("do").disabled = !m;
    $("do").textContent = m ? label(p, m) : p.phase === "main" ? "Nothing to do here" : "Choose a hex";
    $("do").onclick = () => { if (m && T.ready()) T.play(m); };
    $("end").hidden = p.phase !== "main";
    $("end").onclick = () => { if (T.ready()) T.play({ do: "end" }); };
    T.board.light(list.filter((x) => x.at !== undefined).map((x) => x.at), { aim: m?.at ?? -1 });
  },
  changed: () => { where = null; },
  keys(T, k, e) {
    if (k === "e") $("end").click();
    else if (k === "enter" && !(document.activeElement instanceof HTMLButtonElement && document.activeElement.id !== "do")) { e.preventDefault(); $("do").click(); }
  },
  rules: (_, p) => { const r = p?.rule || Object.fromEntries(Object.entries(SWITCHES).map(([k, o]) => [k, o.normal])); return [ // before a game: Traditional's
    "Each turn begins with a roll. Every hex showing that number gives one of its good to each depot on it or beside it, and two to a town. A dark hex gives nothing.",
    `Build: a route (${costText(COST.route)}) on a hex beside your routes or depots; a depot (${costText(COST.depot)}) on a hex your routes reach, with no depot on it or beside it; a town (${costText(COST.town)}) in place of a depot.`,
    "A depot is worth 1 point and a town 2.",
    r.market === "falling" ? "Sell goods for coin: 3, then 2, then 1 as more of a good is sold; prices recover each turn. Buy any good for 4 coin." : "Swap 4 of one good for 1 of any other at the bank, 3 at a port hex of yours, 2 at a port for that good.",
    "Offer one player one good for one of theirs: they take it, turn it down, or leave it open to take on their own turn. Or offer it to anyone. An open offer stands until it is taken, you withdraw it, or the round ends. A bot takes an offer when it has more of what you ask for than of what you give, and never leaves one open.",
    ...(r.plans ? [`Draw a plan for ${costText(COST.plan)}: a harvest of two goods you lack, two free routes, a toll (move the gate and take a good), or a seal worth a point. Play one plan a turn.`] : []),
    ...(r.gate || r.hand ? [`${r.roll === "high" ? "Doubles are" : "A 7 is"} the raid roll${r.roll === "high" ? "" : ": no hex carries a 7, so nothing yields"}.${r.hand ? ` Anyone holding more than ${r.hand} goods loses half, rounded down, and chooses what.` : ""}${r.gate ? " Then the roller moves the toll gate to another hex and takes one good, unseen, from a rival with a depot on it or beside it. The hex under the gate yields nothing until it moves." : ""}`] : []),
    ...(r.awards ? [`Awards, 2 points each, held by whoever leads and passed on when beaten: the Great Road, for the most routes in one joined network (at least ${AWARD.road})${r.gate && r.plans ? `, and the Toll Warden, for the most tolls played (at least ${AWARD.warden})` : ""}.`] : []),
    ...(r.charters ? ["Charters: three public orders for six goods. Fill one for 2 points. Joining two ports with your routes scores 2."] : []),
    `Openings: each player places a depot and a route, in order and then back again. The second depot starts you with ${r.opening === "full" ? "one good for every hex on it or beside it" : "one of each good on it or beside it"}.`,
    "Each roll rings the hexes that yield in gold, and the log says who got what.",
    "Keys: Tab and arrows choose, Enter acts, E ends the turn, U takes back.",
  ]; },
});
