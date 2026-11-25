// SPDX-License-Identifier: AGPL-3.0-or-later
// An Inch of Ink on the table: where to pour and how much.
import { NONE, boardOf, cellsOf, goalOf, growth, inch, poolLimit, sharesOf } from "../src/games/inch/rules.js";
import { choose, thinking } from "../src/games/inch/bot.js";
import { $, NAMES, PAPER, RGB, createTable, radio, toast } from "./table.js";
import { hexBoard } from "./hexboard.js";

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
  cellsOf, goalOf, landOf: (p) => p.owner.length, choose, thinking,
  stats: (p, s) => { const c = cellsOf(p, s), x = p.pool[s]; return [["Strength", x], ["Grows", p.home[s] === NONE ? "out" : `+${Math.max(0, Math.min(growth(p, s), poolLimit(c) - x))}`]]; },
  line(e) {
    const who = NAMES[e.seat];
    if (e.kind === "pour") return `${who} pours ${e.spent} over ${place(e.to)} and takes ${cells(e.taken.length)}.`;
    if (e.kind === "order" && e.turns.length > 2) return `Round ${e.round}: ${e.turns.map((s) => NAMES[s]).join(", then ")}.`;
    if (e.kind === "wait") return `${who} waits.`;
    if (e.kind === "cut") return `${who} loses ${cells(e.cells.length)} cut off from home.`;
    if (e.kind === "home") return e.to === NONE ? `${who} has no land left.` : `${who}'s home falls to ${NAMES[e.by]} and moves.`;
    return "";
  },
  order: (events) => events.flatMap((e) => (e.kind === "pour" ? e.taken : e.kind === "cut" ? e.cells : [])),
  board(T, stage) {
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
    const s = T.match && sharesOf(T.match.position)[Number(k) - 1];
    if (s) {
      if (offers(T).some((m) => m.to === target && m.share === s)) { share = s; T.refresh(); }
    } else if (k === "w") T.play({ do: "wait" });
    else if (k === "enter" && !(document.activeElement instanceof HTMLButtonElement && document.activeElement.id !== "pour")) { e.preventDefault(); $("pour").click(); }
  },
  about: { classic: "A wide map. Grow, pour, and hold most of it.", ours: "A smaller map. Land cut off from your tower falls." },
  rules: (classic) => (classic ? ["Your strength is one pool. The number on your tower shows it. It grows every turn: 3, and 1 for every 3 cells you hold, and a little more each round for everyone.", "Tap empty land or a rival, choose how much to pour, and the cells you would take light up. What is left comes back to you.", "Hills cost 2, other ground 1. A rival's land costs more when they hold a lot of strength on little land.", "The tower only shows whose land it is. If it is taken it moves.", "Reach the gold mark on the bar to win. If nobody has after 40 rounds, the most land wins.", "Whoever moves first changes every round. With three, the order of each round is drawn.", "Keys: 1 to 4 choose how much, Tab and arrows choose where, Enter pours, W waits, U takes back."] : ["Your strength is one pool. The number on your tower shows it. It grows every turn: land grows it, and saving a little more.", "Tap empty land or a rival, choose how much to pour, and the cells you would take light up. What is left comes back to you.", "Hills cost 2, other ground 1. A cell with four of yours around it costs half.", "A rival's land costs more when they hold a lot of strength on little land. A home costs 3 more.", "Land cut off from your tower falls at the start of your turn. If your tower is taken, it moves to your largest piece of land.", "Reach the gold mark on the bar to win, or hold the most land after the last round. Whoever moves first changes every round.", "Keys: 1, 2, 3 choose how much, Tab and arrows choose where, Enter pours, W waits, U takes back."]),
});
