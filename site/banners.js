// SPDX-License-Identifier: AGPL-3.0-or-later
// Brass and Banners on the table: place strength, attack with dice, move in, move once.
import { NONE, SET, banners, bonusOf, boardOf, cellsOf, goalOf, landOf, muster, nameOf, odds, wholeOf } from "../src/games/banners/rules.js";
import { choose, thinking } from "../src/games/banners/bot.js";
import { areaPicture } from "../src/map/areas.js";
import { $, NAMES, RGB, createTable, el, radio, toast } from "./table.js";
import { hexBoard } from "./hexboard.js";

const SEA = [68, 108, 122], LAND = [[226, 210, 172], [214, 205, 164], [232, 214, 186], [218, 200, 160], [222, 214, 182]];
let source = null, target = null, much = -1, shown = null; // what is chosen, and the last dice thrown

const legal = (T) => (T.ready() ? T.match.legal() : []);
const keys = (list, k) => [...new Set(list.map((m) => m[k]).filter((x) => x !== undefined))];
const percent = (n) => (n >= 995000 && n < 1000000 ? "over 99" : n > 0 && n < 5000 ? "under 1" : String(Math.round(n / 10000)));
const cap = (t) => t[0].toUpperCase() + t.slice(1);

/** What can be said about a place. */
function about(p, i) {
  const b = boardOf(p), k = b.region[i], mine = p.owner.filter((o, c) => o === p.seat && b.region[c] === k).length;
  return `${nameOf(p, i)} is in ${b.lands[k]}: ${mine} of ${b.sizes[k]} yours, worth ${bonusOf(b, k)} a turn whole.`;
}
/** The moves open from what is chosen, for the phase the turn is in. */
function offers(T) {
  const p = T.match.position, all = legal(T);
  if (p.phase === "place") return { all, sources: keys(all, "at"), now: all.filter((m) => m.at === source), targets: [] };
  if (p.phase === "occupy") return { all, sources: [], now: all, targets: [] };
  const from = all.filter((m) => m.from === source);
  return { all, sources: keys(all, "from"), now: from.filter((m) => m.to === target), targets: keys(from, "to") };
}
const rolls = (p, m) => p.owner[m.to] !== p.seat;

function tap(T, i) {
  if (!T.ready()) return undefined;
  const p = T.match.position, o = offers(T);
  if (i >= p.owner.length) { source = target = null; return T.refresh(); }
  if (p.phase === "occupy") return toast("Choose how many more move in.");
  if (p.phase === "place") {
    if (!o.sources.includes(i)) return toast("Choose one of your own provinces.");
    source = i;
    return T.refresh();
  }
  if (source !== null && o.targets.includes(i)) {
    target = i; much = -1;
    return T.refresh();
  }
  if (p.owner[i] === p.seat) {
    if (!o.sources.includes(i)) return toast(p.str[i] < 2 ? "One must stay behind to hold it." : "Nothing in reach from there.");
    source = source === i ? null : i; target = null;
    return T.refresh();
  }
  return toast(source === null ? "Choose one of your provinces first." : `${nameOf(p, source)} does not border ${nameOf(p, i)}.`);
}

const PIPS = { 1: [[12, 12]], 2: [[7, 7], [17, 17]], 3: [[6, 6], [12, 12], [18, 18]], 4: [[7, 7], [17, 7], [7, 17], [17, 17]], 5: [[6, 6], [18, 6], [12, 12], [6, 18], [18, 18]], 6: [[7, 6], [17, 6], [7, 12], [17, 12], [7, 18], [17, 18]] };
function die(n, rgb, lost) {
  const ns = "http://www.w3.org/2000/svg", make = (t, at) => { const e = document.createElementNS(ns, t); for (const [k, v] of Object.entries(at)) e.setAttribute(k, v); return e; };
  const s = make("svg", { viewBox: "0 0 24 24", opacity: lost ? 0.45 : 1 }), dark = "#1a1411";
  s.append(make("rect", { x: 1, y: 1, width: 22, height: 22, rx: 5, fill: `rgb(${rgb})`, stroke: dark, "stroke-width": 1.6 }), ...PIPS[n].map(([x, y]) => make("circle", { cx: x, cy: y, r: 2.3, fill: dark })));
  return s;
}
function showDice(T) {
  const f = shown, box = $("dice");
  box.hidden = !f;
  if (!f) return;
  const [A, D] = f.rolls[f.rolls.length - 1], row = (list, other, rgb) => { const d = el("div"); list.forEach((n, i) => { const s = die(n, rgb, i < other.length && n <= other[i]); s.style.animationDelay = `${i * 45}ms`; d.append(s); }); return d; };
  box.setAttribute("role", "img");
  box.setAttribute("aria-label", `${NAMES[f.seat]} rolled ${A.join(", ")}. ${f.was === NONE ? "The defenders" : NAMES[f.was]} rolled ${D.join(", ")}.`);
  box.replaceChildren(row(A, D, RGB[f.seat]), row(D, A, f.was === NONE ? [206, 196, 170] : RGB[f.was]));
}

createTable({
  game: banners, key: "banners", title: "Brass and Banners", won: "The land is yours.", seats: [2, 3, 4], normal: 3, lengths: [], pace: () => 520,
  cellsOf, goalOf, landOf, choose, thinking,
  about: { classic: "Muster, attack as often as you dare, move once. Dice decide. Hold 65% of the land, or be the last one left." },
  stats: (p, s) => [["Army", p.str.reduce((n, v, i) => n + (p.owner[i] === s ? v : 0), 0)], ["Banners", p.banners[s]]],
  line(e, p) {
    const who = NAMES[e.seat], at = (i) => nameOf(p, i);
    if (e.kind === "place") return `${who} places ${e.n} at ${at(e.at)}.`;
    if (e.kind === "fight") return e.won ? "" : `${who} attacks ${at(e.to)} from ${at(e.from)}: ${e.lost.attacker} lost, ${e.lost.defender} struck down.`;
    if (e.kind === "take") return `${who} takes ${at(e.at)}${e.was === NONE ? "" : ` from ${NAMES[e.was]}`}.`;
    if (e.kind === "out") return `${who} is out.`;
    if (e.kind === "banner" && e.now >= SET) return `${who} holds ${e.now} banners: ${SET} will be handed in next turn.`;
    if (e.kind === "move") return `${who} moves ${e.n} from ${at(e.from)} to ${at(e.to)}.`;
    if (e.kind === "done") return `${who} ends the turn.`;
    return "";
  },
  seen(T, events) { for (const e of events) if (e.kind === "fight") { shown = e; showDice(T); } else if (e.kind === "muster") { shown = null; if (!T.demo) showDice(T); } },
  fresh(T) { source = target = null; much = -1; shown = null; showDice(T); },
  order: (events) => events.flatMap((e) => (e.kind === "take" ? [e.at] : [])),
  board(T, stage) {
    const p = T.match.position, b = boardOf(p), picture = areaPicture(b.fine, b.of, b.mid);
    const lines = b.ends.map((e) => e.map((i) => picture.at[i]));
    return hexBoard(T, stage, {
      picture, lines, lands: b.region, fine: { cells: b.fine, of: b.of, mid: b.mid }, cells: [], rough: [], sea: [...b.mid.map(() => false), true],
      ground: (i) => (i >= b.n ? SEA : LAND[b.region[i] % LAND.length]),
      owner: () => [...T.match.position.owner, NONE],
      pieces: () => T.match.position.owner.map((seat, at) => ({ kind: "army", at, seat, rgb: RGB[seat], count: T.match.position.str[at], now: seat === T.match.turn })),
      tap: (i) => tap(T, i),
      can: (i) => { const o = offers(T); return o.sources.includes(i) || o.targets.includes(i); },
    });
  },
  panel(T) {
    const p = T.match.position;
    let o = offers(T);
    if (source !== null && !o.sources.includes(source)) { source = target = null; o = offers(T); }
    if (target !== null && !o.targets.includes(target)) { target = null; o = offers(T); }
    const who = T.solo() ? "" : `${NAMES[p.seat]}: `, m = o.now[0], fight = p.phase === "attack" && m && rolls(p, m), sums = fight ? [] : keys(o.now, "n");
    $("status").textContent = who + cap(p.phase === "place" ? `place ${p.left}` : p.phase === "occupy" ? `${nameOf(p, p.pend.to)} is yours` : target !== null && fight ? `attack ${nameOf(p, target)}` : target !== null ? `move to ${nameOf(p, target)}` : "attack, move once, or end your turn");
    const g = muster(p, p.seat);
    $("info").textContent = p.phase === "place" ? (source === null ? `${g.base} to begin, ${g.land} for land${g.lands ? `, ${g.lands} for whole lands` : ""}. Tap a province of yours.` : about(p, source))
      : p.phase === "occupy" ? "One has moved in. How many more?"
        : fight ? `${p.str[source] - 1} against ${p.str[target]}. If you keep rolling, ${percent(odds(p.str[source] - 1, p.str[target]))} in 100 to take it.`
          : target !== null ? "Moving ends your turn." : source !== null ? about(p, source) : "Tap a province of yours, then where to.";
    $("sources").hidden = !o.sources.length;
    radio($("sources"), o.sources.map((i) => ({ value: i, label: nameOf(p, i), note: `${p.str[i]} strong` })), source, (v) => { source = v; target = null; much = -1; T.refresh(); });
    $("targets").hidden = !o.targets.length;
    const order = (i) => (p.owner[i] === p.seat ? 2000000 : -odds(p.str[source] - 1, p.str[i]));
    radio($("targets"), [...o.targets].sort((x, y) => order(x) - order(y) || x - y).map((i) => ({ value: i, label: p.owner[i] === p.seat ? `To ${nameOf(p, i)}` : nameOf(p, i), note: p.owner[i] === p.seat ? "move" : `${percent(odds(p.str[source] - 1, p.str[i]))} in 100`, rgb: p.owner[i] === NONE ? LAND[0] : RGB[p.owner[i]] })), target, (v) => { target = v; much = -1; T.refresh(); });
    $("amount").hidden = sums.length < 2;
    if (much < 0 || much >= sums.length) much = sums.length - 1;
    $("much").max = String(Math.max(0, sums.length - 1));
    $("much").value = String(much);
    const say = () => {
      $("many").textContent = sums.length ? `${sums[much]}` : "";
      $("much").setAttribute("aria-valuetext", String(sums[much] ?? ""));
      $("do").disabled = !m;
      $("do").textContent = !m ? (p.phase === "place" ? "Choose a province" : "Choose an attack") : p.phase === "place" ? `Place ${sums[much]}` : p.phase === "occupy" ? (sums[much] ? `Move in ${sums[much]} more` : "Leave it at one") : fight ? "Roll it out" : `Move ${sums[much]}, end turn`;
    };
    $("much").oninput = () => { much = Number($("much").value); say(); };
    say();
    $("end").hidden = p.phase !== "attack";
    $("once").hidden = !fight;
    const send = (roll) => { if (!T.ready()) return; const list = offers(T).now, go = fight ? list.find((x) => x.roll === roll) : list.find((x) => x.n === sums[much]); if (go) T.play(go); };
    $("do").onclick = () => send("all");
    $("once").onclick = () => send("once");
    $("end").onclick = () => { if (T.ready() && T.match.position.phase === "attack") T.play({ do: "end" }); };
    const hit = o.targets.filter((i) => p.owner[i] !== p.seat);
    T.board.light(p.phase === "place" ? [] : target !== null ? [target] : hit, { ring: source ?? (p.phase === "occupy" ? p.pend.to : -1), aim: target ?? -1, dots: [], arrow: source !== null && target !== null ? [source, target] : null });
  },
  changed(T) {
    const p = T.match.position;
    much = -1;
    if (p.phase === "occupy" || p.phase === "place") target = null;
    if (p.phase === "attack" && target !== null && p.owner[target] === p.seat) { source = p.str[target] > 1 ? target : source; target = null; } // go on from where you won
    if (!T.human()) source = target = null;
  },
  keys(T, k, e) {
    if (k === "e") $("end").click();
    else if (k === "r" && !$("once").hidden) $("once").click();
    else if (k === "escape") { source = target = null; T.refresh(); } else if (k === "enter" && !(document.activeElement instanceof HTMLButtonElement && document.activeElement.id !== "do")) { e.preventDefault(); $("do").click(); }
  },
  more: {
    label: "The lands",
    body(T) { const p = T.match.position, b = boardOf(p), u = el("ul"); u.append(...b.lands.map((n, k) => { const s = [0, 1, 2, 3].find((x) => x < p.seats && wholeOf(p, x).includes(k)); return el("li", `${cap(n)}: ${b.sizes[k]} provinces, worth ${bonusOf(b, k)} a turn. ${s === undefined ? "Nobody holds it whole." : `${NAMES[s]} holds it whole.`}`); })); return u; },
  },
  rules: () => [
    "Each turn: place new strength, attack as often as you like, then move once or end your turn.",
    "You place 3, and 1 for every three provinces you hold, and more for every land you hold whole. Gold lines mark the five lands.",
    "To attack, tap a province of yours with 2 or more, then one beside it. Dashed lines over water are crossings.",
    "You throw a die for each of your strength but one, four at most. The defender throws one for each, three at most. Highest meets highest: the lower one loses 1. If they tie, both lose 1.",
    "Roll once, or roll it out until somebody has won. The chance is shown first. When you win, choose how many move in.",
    "Take at least one province in a turn and you earn a banner. Three banners are handed in at your next turn for 3 more to place. Put a rival out and you take theirs.",
    "Reach the gold mark on the bar, 65% of the land, or be the last one left. After 40 rounds the most land wins.",
    "Whoever moves first changes every round.",
    "Keys: Tab and arrows choose, Enter acts, R rolls once, E ends the turn, Escape lets go, U takes back.",
  ],
});
