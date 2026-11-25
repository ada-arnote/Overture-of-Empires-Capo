// SPDX-License-Identifier: AGPL-3.0-or-later
// An Inch of Ink on the table: where to pour and how much.
import { NONE, boardOf, cellsOf, goalOf, growth, inch, poolLimit, sharesOf } from "../src/games/inch/rules.js";
import { choose, thinking } from "../src/games/inch/bot.js";
import { $, NAMES, PAPER, RGB, createTable, radio, toast } from "./table.js";
import { hexBoard } from "./hexboard.js";
import { board as liveBoard, ending as liveEnding, key as liveKey, leave as liveLeave, lineOf as liveLine, liveGoal, panel as livePanel } from "./inchlive.js";

const SHARE = { quarter: "Quarter", third: "A third", half: "Half", most: "Most", all: "All" }, HILL = [201, 178, 140];
const cells = (n) => `${n} ${n === 1 ? "cell" : "cells"}`, place = (to) => (to === NONE ? "empty land" : NAMES[to]);
let target = null, share = "half";

const offers = (T) => (T.ready() ? T.match.legal().filter((m) => m.do === "pour") : []);
const offer = (T) => offers(T).find((m) => m.to === target && m.share === share);
const outcome = (T, m) => inch.apply(T.match.position, m).events[0];

function aim(T, i) {
  if (!T.ready()) return undefined;
  const o = T.match.position.owner[i], list = offers(T);
  if (o === T.match.turn) return toast("That land is already yours.");
  if (!list.some((m) => m.to === o)) return toast(list.length ? `Nothing you can take there yet.${o === NONE ? "" : ` ${NAMES[o]} is too strong, or too far.`}` : "You cannot take anything yet. Wait and grow.");
  target = o;
  return T.refresh();
}

createTable({
  game: inch, key: "inch", title: "An Inch of Ink", won: "The map is yours.", lengths: [[10, "Short"], [16, "Normal"], [20, "Long"]], pace: () => 650,
  cellsOf: (p, s) => (p.live ? p.land[s] : cellsOf(p, s)), goalOf: (p) => (p.live ? liveGoal(p) : goalOf(p)), landOf: (p) => (p.live ? p.total : p.owner.length), choose, thinking,
  summary: (T) => { const p = T.match.position; if (!p.live) return null; const m = Math.round((p.tick * 0.5) / 60); return `${p.names[T.match.result.winners[0]]} ${T.match.result.why}, after ${m < 1 ? "less than a minute" : `${m} ${m === 1 ? "minute" : "minutes"}`} of game time.`; },
  ending: (T) => (T.match.position.live ? liveEnding(T) : null),
  kindsOf: (o) => (o.style === "classic" || (o.style === "custom" && o.live) ? ["you"] : null),
  alone: (style, extra) => style === "classic" || (style === "custom" && extra.live),
  expansionsFor: (style, extra) => style === "classic" || (style === "custom" && extra.live),
  choices: [
    { key: "map", label: "Map", normal: "world", only: ["classic", "custom"], values: [["world", "The world"], ["continents", "Continents"], ["islands", "Islands"]] },
    { key: "nations", label: "Nations", normal: 20, only: ["classic", "custom"], values: [[8, "8"], [12, "12"], [20, "20"], [30, "30"], [50, "50"]] },
  ],
  expansions: [{ key: "cities", label: "Cities", note: "Spend strength on a city: it holds more and grows faster." }, { key: "boats", label: "Boats", note: "Send a share across the sea to land on a far coast. Always on with islands." }],
  stats: (p, s) => p.live ? [["Strength", p.troops[s]], ["Nations left", p.alive.filter(Boolean).length]] : (() => { const c = cellsOf(p, s), x = p.pool[s]; return [["Strength", x], ["Grows", p.home[s] === NONE ? "out" : `+${Math.max(0, Math.min(growth(p, s), poolLimit(c) - x))}`]]; })(),
  line(e, p) {
    if (p?.live) return liveLine(e, p);
    const who = NAMES[e.seat];
    if (e.kind === "pour") return `${who} pours ${e.spent} over ${place(e.to)} and takes ${cells(e.taken.length)}.`;
    if (e.kind === "order" && e.turns.length > 2) return `Round ${e.round}: ${e.turns.map((s) => NAMES[s]).join(", then ")}.`;
    if (e.kind === "wait") return `${who} waits.`;
    if (e.kind === "cut") return `${who} loses ${cells(e.cells.length)} cut off from home.`;
    if (e.kind === "home") return e.to === NONE ? `${who} has no land left.` : `${who}'s home falls to ${NAMES[e.by]} and moves.`;
    return "";
  },
  order: (events) => events.some((e) => e.kind === "attack" || e.kind === "spawn") ? [] : events.flatMap((e) => (e.kind === "pour" ? e.taken : e.kind === "cut" ? e.cells : [])),
  board(T, stage) {
    if (T.match.position.live) return liveBoard(T, stage);
    liveLeave();
    document.body.classList.remove("atlas");
    const rough = T.match.position.cost.map((c) => c === 2);
    return hexBoard(T, stage, {
      cells: boardOf(T.match.position).cells, rough, sea: [], ground: (i) => (rough[i] ? HILL : PAPER[(i * 7 + (i >> 2)) % 3]),
      owner: () => T.match.position.owner,
      pieces: () => T.match.position.home.flatMap((h, s) => (h < 0 ? [] : [{ kind: "tower", at: h, rgb: RGB[s], count: T.match.position.pool[s], now: s === T.match.turn }])),
      tap: (i) => aim(T, i),
      can: (i) => T.match.position.owner[i] !== T.match.turn && offers(T).some((m) => m.to === T.match.position.owner[i]),
    });
  },
  panel(T) {
    if (T.match.position.live) return livePanel(T);
    const list = offers(T), shares = sharesOf(T.match.position), targets = [...new Set(list.map((m) => m.to))];
    const of = (s) => list.find((m) => m.to === target && m.share === s);
    $("status").textContent = T.solo() ? (list.length ? "Where will your ink run?" : "Nothing in reach. Wait and grow.") : `${NAMES[T.match.turn]}, your move`;
    if (!targets.includes(target)) target = targets.includes(NONE) ? NONE : targets[0] ?? null;
    const can = shares.filter(of);
    if (!can.includes(share) && can.length) share = can.includes("half") ? "half" : can[can.length - 1];
    $("targets").hidden = $("shares").hidden = !list.length;
    radio($("targets"), targets.map((t) => ({ value: t, label: t === NONE ? "Empty land" : NAMES[t], note: `up to ${cells(outcome(T, list.find((m) => m.to === t)).taken.length)}`, rgb: t === NONE ? PAPER[0] : RGB[t] })), target, (v) => { target = v; T.refresh(); });
    radio($("shares"), shares.map((s) => { const m = of(s); return { value: s, label: SHARE[s], note: m ? `takes ${outcome(T, m).taken.length}` : "takes none", off: !m }; }), share, (v) => { share = v; T.refresh(); });
    const m = of(share), e = m && outcome(T, m);
    $("pour").disabled = !m;
    $("pour").textContent = m ? `Pour ${e.spent}, take ${e.taken.length}` : "Pour";
    $("pour").onclick = () => { const now = offer(T); if (now) T.play(now); };
    $("wait").onclick = () => { if (T.ready()) T.play({ do: "wait" }); };
    T.board.light(e ? e.taken : []);
  },
  keys(T, k, e) {
    if (T.match.position.live) { if (liveKey(T, k)) e.preventDefault(); return; }
    const s = T.match && sharesOf(T.match.position)[Number(k) - 1];
    if (s) {
      if (offers(T).some((m) => m.to === target && m.share === s)) { share = s; T.refresh(); }
    } else if (k === "w") T.play({ do: "wait" });
    else if (k === "enter" && !(document.activeElement instanceof HTMLButtonElement && document.activeElement.id !== "pour")) { e.preventDefault(); $("pour").click(); }
  },
  about: {
    classic: "Traditional: inspired by Territorial.io and OpenFront.io.\nThe browser land-grab as players know it, in real time: start anywhere on the world map or a made one, among up to 50 nations. Your strength grows with your land; send a share of it with the slider and watch the border creep. Ours: small hexes in place of pixels, our own numbers and maps, a pause button, and the clock in half-second ticks so a game can be saved.\nNot affiliated with or endorsed by their makers. Our own map, names and art.",
    custom: "Custom: your own rules.\nSet every rule yourself: map size, whether cut-off land falls, walled homes, the shares you pour, how strength grows, the goal, the turn order and the number of rounds.",
    ours: "Capo: our own variation.\nA smaller map where land cut off from your tower falls away, homes are walled, and saving strength pays. Hold 55% with two players, 45% with three.",
    coda: "Coda: legacy campaigns, coming soon.\nPlay a run of games where each one changes the next: the map, the rules and the pieces carry the marks of what happened. Start from a premade legacy story, one shared by other players, or design your own with an AI assistant. Campaigns can always be played on without AI.",
  },
  switches: [
    { key: "size", label: "Map", normal: 5, values: [[4, "61 cells"], [5, "91 cells"]] },
    { key: "cut", label: "Cut-off land", normal: false, values: [[false, "Stays yours"], [true, "Falls away"]] },
    { key: "walls", label: "Homes", normal: false, values: [[false, "Plain"], [true, "Walled"]] },
    { key: "shares", label: "Pour", normal: "four", values: [["four", "A quarter, half, most or all"], ["three", "A third, half or all"]] },
    { key: "growth", label: "Growth", normal: "rising", values: [["rising", "Land, and more each round"], ["saving", "Land, and more for saving"]] },
    { key: "goal", label: "To win", normal: 60, values: [[45, "45%"], [55, "55%"], [60, "60%"], [70, "70%"]] },
    { key: "drawn", label: "Order with three", normal: true, values: [[true, "Drawn each round"], [false, "Rotates"]] },
    { key: "limit", label: "Rounds", normal: 40, values: [[10, "10"], [16, "16"], [20, "20"], [40, "40"]] },
  ],
  fresh: () => { liveLeave(); },
  rules: (classic, p) => p?.live ? ["Real time: the clock runs on its own. Pause it, or run it faster, with the buttons.", "Tap empty land to start your nation. Your strength grows every half second: more for more land, a little more for saving, up to a limit set by your land.", "Choose a share with the slider, then tap a neighbour, or empty land beside yours. That share of your strength goes, and the border creeps forward until it is spent.", "Each cell costs 2, 3 more on hills, and more where the owner holds much strength on little land. Taking a cell costs its owner some strength too.", "Win by holding 80% of the land, or by being the last one left. If time runs out, the biggest nation wins. If you lose all your land, the game is over.", ...(p.building ? ["Cities: tap Build a city, then one of your cells. A city holds more and grows faster; each costs more than the last."] : []), ...(p.boats ? ["Boats: tap a coast across the water, up to nine cells of sea away. Landing costs double."] : []), "Keys: 1 to 0 choose the share, Space pauses."] : ((p ? p.rule.growth === "rising" : classic) ? ["Your strength is one pool. The number on your tower shows it. It grows every turn: 3, and 1 for every 3 cells you hold, and a little more each round for everyone.", "Tap empty land or a rival, choose how much to pour, and the cells you would take light up. What is left comes back to you.", "Hills cost 2, other ground 1. A rival's land costs more when they hold a lot of strength on little land.", "The tower only shows whose land it is. If it is taken it moves.", "Reach the gold mark on the bar to win. If nobody has after 40 rounds, the most land wins.", "Whoever moves first changes every round. With three, the order of each round is drawn.", "Keys: 1 to 4 choose how much, Tab and arrows choose where, Enter pours, W waits, U takes back."] : ["Your strength is one pool. The number on your tower shows it. It grows every turn: land grows it, and saving a little more.", "Tap empty land or a rival, choose how much to pour, and the cells you would take light up. What is left comes back to you.", "Hills cost 2, other ground 1. A cell with four of yours around it costs half.", "A rival's land costs more when they hold a lot of strength on little land. A home costs 3 more.", "Land cut off from your tower falls at the start of your turn. If your tower is taken, it moves to your largest piece of land.", "Reach the gold mark on the bar to win, or hold the most land after the last round. Whoever moves first changes every round.", "Keys: 1, 2, 3 choose how much, Tab and arrows choose where, Enter pours, W waits, U takes back."]),
});
