// SPDX-License-Identifier: AGPL-3.0-or-later
// An Inch of Ink on the table: where to pour and how much.
import { NONE, boardOf, cellsOf, goalOf, growth, inch, liveBoardFor, poolLimit, sharesOf } from "../src/games/inch/rules.js";
import { choose, thinking } from "../src/games/inch/bot.js";
import { $, NAMES, PAPER, RGB, createTable, radio, toast } from "./table.js";
import { hexBoard } from "./hexboard.js";
import { board as liveBoard, continueText, ending as liveEnding, hold as liveHold, key as liveKey, leave as liveLeave, lineOf as liveLine, liveGoal, liveLand, nudge, panel as livePanel, record, rules as liveRules, seen as liveSeen, stats as liveStats, summary as liveSummary, time as liveTime } from "./inchlive.js";

const SHARE = { quarter: "Quarter", third: "A third", half: "Half", most: "Most", all: "All" }, HILL = [201, 178, 140];
const cells = (n) => `${n} ${n === 1 ? "cell" : "cells"}`, place = (to) => (to === NONE ? "empty land" : NAMES[to]);
let target = null, share = "half", style = "classic";
// Traditional and Capo (The Ink Dries) run in real time; Custom chooses its clock, turns being the duel
const LIVE = (s, extra) => s === "classic" || s === "ours" || (s === "custom" && !!extra.live), CUSTOM = (s, extra) => s === "custom" && !!extra.live;
const CITIES = { key: "cities", label: "Cities", note: "Spend strength on a city: it holds more and grows faster." }, BOATS = { key: "boats", label: "Boats", note: "Send a share across the sea to land on a far coast. Always on where the map has more than one landmass." };

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
  game: inch, key: "inch", title: "An Inch of Ink", won: "The map is yours.", lengths: [], pace: () => 650,
  // your land and the land that wins, in words: "1525/1844" read as owned of the whole map
  landText: (c, goal) => `${c}, goal ${goal}`,
  cellsOf: (p, s) => (p.live ? p.land[s] : cellsOf(p, s)), goalOf: (p) => (p.live ? liveGoal(p) : goalOf(p)), landOf: (p) => (p.live ? liveLand(p) : p.owner.length), choose, thinking,
  summary: (T) => (T.match.position.live ? liveSummary(T) : null),
  ending: (T) => (T.match.position.live ? liveEnding(T) : null),
  // a quick win against gentle rivals suggests normal ones
  report: (T) => (T.match.position.live ? nudge(T) : null),
  // Continue brings a real-time game back paused, and says so
  continueText: (p) => (p.live ? continueText(p) : null),
  // real time shows game time, not a round; a nation is out only once it has lost the land it had
  roundText: (p) => (p.live ? liveTime(p) : null),
  outOf: (p, s) => (p.live ? p.tick > 4 && !p.alive[s] : cellsOf(p, s) === 0),
  kindsOf: (o) => (o.style !== "custom" || o.live ? ["you"] : null),
  alone: LIVE,
  // cities are Custom only, and The Ink Dries has none: the list of expansions follows the rules last asked about
  expansionsFor: (s, extra) => { style = s; return s !== "ours" && LIVE(s, extra); },
  get expansions() { return style === "classic" ? [BOATS] : [CITIES, BOATS]; },
  seen: (T, events) => { if (T.match.position.live) liveSeen(T, events); },
  // Custom first chooses the clock: real time shows its own choices, turns show the turn game's switches
  choices: [
    { key: "live", label: "Clock", normal: false, only: ["custom"], values: [[false, "Turns"], [true, "Real time"]] },
    { key: "map", label: "Map", normal: "world", only: ["classic", "custom"], when: LIVE, values: [["world", "The world"], ["continents", "Continents"], ["islands", "Islands"]] },
    { key: "nations", label: "Nations", normal: 20, only: ["classic", "custom"], when: LIVE, values: [[8, "8"], [12, "12"], [20, "20"], [30, "30"], [50, "50"]] },
    { key: "rivals", label: "Rivals", normal: "gentle", only: ["classic", "custom", "ours"], when: LIVE, values: [["gentle", "Gentle"], ["even", "Normal"], ["hard", "Hard"]] }, // "even" is the saved name of Normal
    { key: "inks", label: "Inks", normal: "chosen", only: ["custom"], when: CUSTOM, values: [["chosen", "You choose yours"], ["drawn", "Drawn for everyone"], ["off", "Off"]] },
    { key: "places", label: "Places", normal: "normal", only: ["custom"], when: CUSTOM, values: [["none", "None"], ["few", "Few"], ["normal", "Normal"], ["many", "Many"]] },
    { key: "ages", label: "Ages and marks", normal: true, only: ["custom"], when: CUSTOM, values: [[true, "On"], [false, "Off"]] },
    { key: "ease", label: "Goal in the last age", normal: true, only: ["custom"], when: CUSTOM, values: [[true, "Eases to 66%"], [false, "Stays at 80%"]] },
    { key: "time", label: "Time limit", normal: 1800, only: ["custom"], when: CUSTOM, values: [[1800, "30 minutes"], [800, "13 minutes 20 seconds"], [600, "10 minutes"], [0, "None"]] },
    // the turn game's switches
    { key: "size", label: "Map", normal: 4, only: ["custom"], when: (style, extra) => !extra.live, values: [[4, "61 cells"], [5, "91 cells"]] },
    { key: "cut", label: "Cut-off land", normal: true, only: ["custom"], when: (style, extra) => !extra.live, values: [[false, "Stays yours"], [true, "Falls away"]] },
    { key: "walls", label: "Homes", normal: true, only: ["custom"], when: (style, extra) => !extra.live, values: [[false, "Plain"], [true, "Walled"]] },
    { key: "shares", label: "Pour", normal: "three", only: ["custom"], when: (style, extra) => !extra.live, values: [["four", "A quarter, half, most or all"], ["three", "A third, half or all"]] },
    { key: "growth", label: "Growth", normal: "saving", only: ["custom"], when: (style, extra) => !extra.live, values: [["rising", "Land, and more each round"], ["saving", "Land, and more for saving"]] },
    { key: "goal", label: "To win", normal: 55, only: ["custom"], when: (style, extra) => !extra.live, values: [[45, "45%"], [55, "55%"], [60, "60%"], [70, "70%"]] },
    { key: "drawn", label: "Order with three", normal: false, only: ["custom"], when: (style, extra) => !extra.live, values: [[true, "Drawn each round"], [false, "Rotates"]] },
    { key: "limit", label: "Rounds", normal: 16, only: ["custom"], when: (style, extra) => !extra.live, values: [[10, "10"], [16, "16"], [20, "20"], [40, "40"]] },
  ],
  stats: (p, s) => p.live ? liveStats(p, s) : (() => { const c = cellsOf(p, s), x = p.pool[s]; return [["Strength", x], ["Grows", p.home[s] === NONE ? "out" : `+${Math.max(0, Math.min(growth(p, s), poolLimit(c) - x))}`]]; })(),
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
    classic: "Traditional: our own real-time land-grab.\nPick an ink and start anywhere on the world map or a made one, among up to 50 nations. Your strength grows with your land; send a share of it with the slider and watch the border creep. Each ink spreads in its own way, places on the map help whoever holds them, and twice a game a new age brings a choice, sooner on the smaller maps. Land you encircle soaks through. A list of the attacks under way, yours to call back; Find me; tips for your first minute; your figures at the end. A pause button, and a clock in half-second ticks so a game can be saved.\nNot a copy of any other game: our own rules, map, names and art.",
    custom: "Custom: your own rules.\nChoose the clock first. In real time: the map, the nations, how hard your rivals play, inks, places, the ages, the easing goal, the time limit, and cities. In turns, the duel for two or three at one table: a small map where land cut off from your tower falls away, homes are walled and saving pays, each of which you can change, with the shares you pour, the goal, the turn order and the number of rounds.",
    ours: "Capo: The Ink Dries.\nThe short plain game, in real time: 12 nations on a map drawn for the game, wells and nothing else. Your first cell is your capital; land cut off from it fades. From 1:00 the page dries from its edges inward. Hold 65% of what is still wet.",
    coda: "Coda: legacy campaigns, coming soon.\nPlay a run of games where each one changes the next: the map, the rules and the pieces carry the marks of what happened. Start from a premade legacy story, one shared by other players, or design your own with an AI assistant. Campaigns can always be played on without AI.",
  },
  switches: [], // all of Custom's switches are choices above, so each shows only with the clock it belongs to
  fresh: (T) => { liveLeave(); liveHold(T); },
  more: record,
  rules: (classic, p) => (p ? p.live : classic || style === "ours") ? liveRules(p, !p && style === "ours") : ((p ? p.rule.growth === "rising" : classic) ? ["Your strength is one pool. The number on your tower shows it. It grows every turn: 3, and 1 for every 3 cells you hold, and a little more each round for everyone.", "Tap empty land or a rival, or choose it in the list, then choose how much to pour: the cells you would take light up. What is left comes back to you.", "Hills cost 2, other ground 1. A rival's land costs more when they hold a lot of strength on little land.", "The tower only shows whose land it is. If it is taken it moves.", "Reach the gold mark on the bar to win. If nobody has after 40 rounds, the most land wins.", "Whoever moves first changes every round. With three, the order of each round is drawn.", "Keys: 1 to 4 choose how much, Tab and arrows choose where, Enter pours, W waits, U takes back."] : ["Your strength is one pool. The number on your tower shows it. It grows every turn: land grows it, and saving a little more.", "Tap empty land or a rival, or choose it in the list, then choose how much to pour: the cells you would take light up. What is left comes back to you.", "Hills cost 2, other ground 1. A cell with four of yours around it costs half.", "A rival's land costs more when they hold a lot of strength on little land. A home costs 3 more.", "Land cut off from your tower falls at the start of your turn. If your tower is taken, it moves to your largest piece of land.", "Reach the gold mark on the bar to win, or hold the most land after the last round. Whoever moves first changes every round.", "Keys: 1, 2, 3 choose how much, Tab and arrows choose where, Enter pours, W waits, U takes back."]),
});
