// SPDX-License-Identifier: AGPL-3.0-or-later
// Brass and Banners on the table: place strength, attack with dice, move in, move once.
import { BAG, EXPANSIONS, FORT, HAND, NONE, SAFETY, SWITCHES, banners, bonusOf, bordersOf, boardOf, capsHeld, capsToWin, cellsOf, gain, goalOf, landOf, muster, nameOf, odds, setWorth, setsOf, suitOf, terms, toll, wholeOf } from "../src/games/banners/rules.js";
import { choose, thinking } from "../src/games/banners/bot.js";
import { DICE, fair, meet } from "../src/games/banners/dice.js";
import { createMatch } from "../src/core/index.js";
import { settings } from "./shell.js";
import { areaPicture } from "../src/map/areas.js";
import { $, ICONS, NAMES, RGB, createTable, el, radio, sheet, toast } from "./table.js";
import { hexBoard } from "./hexboard.js";

const SEA = [68, 108, 122], LAND = [[222, 190, 150], [206, 206, 150], [228, 200, 180], [190, 206, 178], [214, 190, 200], [226, 214, 158], [196, 200, 214], [210, 180, 150], [178, 204, 200], [224, 206, 190]];
const SUITS = ["Drum", "Horn", "Banner", "Crown"];
let source = null, target = null, much = -1, shown = null, shownTie = false; // what is chosen, and the last dice thrown

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
  if (p.phase === "claim") return { all, sources: keys(all, "at"), now: all.filter((m) => m.at === source), targets: [] };
  if (p.phase === "place" || p.phase === "setup") { const put = all.filter((m) => m.do === "place"); return { all, sources: keys(put, "at"), now: put.filter((m) => m.at === source), targets: [] }; }
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
  if (p.phase === "claim" || p.phase === "place" || p.phase === "setup") {
    if (!o.sources.includes(i)) return toast(p.phase === "claim" ? "That province is taken." : o.sources.length ? "Choose one of your own provinces." : "Hand in a set of cards first.");
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
  box.hidden = $("fought").hidden = !f;
  if (!f) { box.removeAttribute("aria-label"); return; }
  const them = f.was === NONE ? "the defenders" : NAMES[f.was], n = f.rolls.length, place = nameOf(T.match.position, f.to);
  $("fought").textContent = `${n === 1 ? "One throw" : `${n} throws`}: ${NAMES[f.seat]} lost ${f.lost.attacker}, ${them} lost ${f.lost.defender}. ${place} ${f.won ? "is taken" : "holds"}.`;
  const [A, D] = f.rolls[f.rolls.length - 1], row = (list, other, rgb, tie) => { const d = el("div"); list.forEach((n, i) => { const s = die(n, rgb, i < other.length && (n < other[i] || (n === other[i] && tie))); s.style.animationDelay = `${i * 45}ms`; d.append(s); }); return d; };
  box.setAttribute("role", "img");
  box.setAttribute("aria-label", `${n > 1 ? "The last throw: " : ""}${NAMES[f.seat]} rolled ${A.join(", ")}. ${cap(them)} rolled ${D.join(", ")}.`);
  box.replaceChildren(row(A, D, RGB[f.seat], true), row(D, A, f.was === NONE ? [206, 196, 170] : RGB[f.was], shownTie));
}
const FACES = ["ones", "twos", "threes", "fours", "fives", "sixes"];
/** The open bag of throws, when the game draws its dice from one: how many of each face are left in it. */
function showBag(T) {
  const p = T.match?.position, box = $("bag"), bag = p?.bag;
  box.hidden = !bag || T.demo;
  if (box.hidden) return;
  const all = bag.reduce((n, c) => n + c, 0);
  box.setAttribute("role", "img");
  box.setAttribute("aria-label", `The bag of throws holds ${all}: ${bag.map((c, f) => `${c} ${FACES[f]}`).join(", ")}.`);
  box.replaceChildren(el("b", `Bag, ${all}`), ...bag.map((c, f) => { const s = el("span"); s.append(die(f + 1, [236, 226, 200], c === 0), String(c)); return s; }));
  box.title = `Dice are drawn from this bag. When fewer than ${BAG.low} are left, a fresh set of ${6 * BAG.each} goes in.`;
}
/** A fight shown where it happened: the last throw's dice between the two provinces, and what each side lost, rising off the map. */
function onMap(T, e) {
  const a = T.board?.at?.(e.from), d = T.board?.at?.(e.to);
  if (!a || !d || T.demo || T.hurry || settings.speed === "instant") return;
  const stage = $("stage").getBoundingClientRect(), still = document.documentElement.classList.contains("still"), quick = settings.speed === "fast" && !T.human() ? 0.6 : 1;
  const put = (node, at, ms, rise) => {
    Object.assign(node.style, { position: "fixed", left: `${stage.left + at.x}px`, top: `${stage.top + at.y}px`, transform: "translate(-50%, -50%)", zIndex: "2", pointerEvents: "none" });
    node.setAttribute("aria-hidden", "true");
    document.body.append(node);
    if (!still) node.animate([{ opacity: 0, transform: "translate(-50%, -30%) scale(.7)" }, { opacity: 1, transform: "translate(-50%, -50%)", offset: 0.15 }, { opacity: 1, transform: `translate(-50%, ${-50 - rise / 2}%)`, offset: 0.75 }, { opacity: 0, transform: `translate(-50%, ${-50 - rise}%)` }], { duration: ms * quick, easing: "ease-out" });
    setTimeout(() => node.remove(), ms * quick - 20);
  };
  const pale = [206, 196, 170], lost = (n, at, rgb) => {
    if (!n) return;
    const b = el("b", `−${n}`);
    Object.assign(b.style, { font: "800 20px/1 system-ui, sans-serif", color: "#fff", background: "#a3271b", border: `2px solid rgb(${rgb})`, borderRadius: "999px", padding: "4px 9px", boxShadow: "0 2px 8px rgba(0,0,0,.5)" });
    put(b, { x: at.x, y: at.y - 26 }, 1300, 160);
  };
  const [A, D] = e.rolls[e.rolls.length - 1], box = el("div");
  const row = (list, other, rgb, loses) => { const r = el("div"); Object.assign(r.style, { display: "flex", gap: "2px", justifyContent: "center" }); list.forEach((n, i) => { const s = die(n, rgb, i < other.length && (n < other[i] || (n === other[i] && loses))); s.style.width = s.style.height = "20px"; r.append(s); }); return r; };
  Object.assign(box.style, { display: "grid", gap: "2px", padding: "4px", borderRadius: "8px", background: "rgba(13,22,35,.82)", boxShadow: "0 2px 10px rgba(0,0,0,.5)" });
  box.append(row(A, D, RGB[e.seat], true), row(D, A, e.was === NONE ? pale : RGB[e.was], shownTie));
  put(box, { x: (a.x + d.x) / 2, y: (a.y + d.y) / 2 }, 1100, 30);
  lost(e.lost.attacker, a, RGB[e.seat]);
  lost(e.lost.defender, d, e.was === NONE ? pale : RGB[e.was]);
}

/** The battle record: every fight of the game counted again from its seed and moves, so a game opened from a save has it too. */
function record(T) {
  const m = T.match, again = createMatch(banners, { seed: m.seed, options: m.options }), seats = m.options.seats;
  const rows = Array.from({ length: seats }, () => ({ faces: [0, 0, 0, 0, 0, 0, 0], dice: 0, fights: 0, won: 0, taken: 0, gone: 0, struck: 0, fallen: 0, luck: 0 }));
  let bold = null;
  for (const move of m.list) {
    const p = again.position;
    for (const e of again.play(move)) {
      if (e.kind === "take") { rows[e.seat].taken++; if (e.was !== NONE) rows[e.was].gone++; }
      if (e.kind !== "fight") continue;
      const how = terms(p, e.from, e.to), me = rows[e.seat], you = e.was === NONE ? null : rows[e.was], chance = odds(p, e.from, e.to);
      me.fights++; if (e.won) me.won++;
      me.struck += e.lost.defender; me.fallen += e.lost.attacker;
      if (you) { you.struck += e.lost.attacker; you.fallen += e.lost.defender; }
      if (e.won && move.roll === "all" && (!bold || chance < bold.chance)) bold = { chance, seat: e.seat, at: e.to };
      for (const [A, D] of e.rolls) {
        const [a, d] = meet(A, D, how), [ea, ed] = fair(A.length, D.length, how), swing = 1000 * (d - a) - (ed - ea); // how far the throw went the attacker's way, past what the odds give
        for (const v of A) { me.faces[v]++; me.dice++; }
        me.luck += swing;
        if (you) { for (const v of D) { you.faces[v]++; you.dice++; } you.luck -= swing; }
      }
    }
  }
  return { rows, bold };
}
const signed = (n) => { const v = Math.round(n / 100) / 10; return v > 0 ? `+${v.toFixed(1)}` : v < 0 ? `−${Math.abs(v).toFixed(1)}` : "0.0"; };
function grid(head, rows, label) {
  const box = el("div", undefined, "ranks"), t = el("table"), tr = el("tr");
  tr.append(...head.map((h) => { const th = el("th", h); th.scope = "col"; return th; }));
  t.append(tr, ...rows.map(([name, ...cells]) => { const r = el("tr"), th = el("th", name); th.scope = "row"; r.append(th, ...cells.map((c) => el("td", String(c)))); return r; }));
  t.setAttribute("aria-label", label);
  box.append(t);
  return box;
}
/** Every die thrown so far, by player: how often each face came up, the average, and how far the dice ran ahead of the odds. */
function tally(T) {
  const { rows } = record(T), box = el("div");
  if (!rows.some((r) => r.dice)) { box.append(el("p", "No dice have been thrown yet.")); return box; }
  box.append(grid(["Player", "Dice", "1", "2", "3", "4", "5", "6", "Average", "Luck"], rows.map((r, s) => [NAMES[s], r.dice, ...r.faces.slice(1), r.dice ? (r.faces.reduce((n, c, v) => n + c * v, 0) / r.dice).toFixed(2) : "", signed(r.luck)]), "Every die thrown"),
    el("p", "A fair die averages 3.50. Luck is the strength your dice won or saved beyond what the odds give: above zero the dice ran your way, below zero against you. The same seed and moves always throw the same dice."));
  return box;
}

const words = (g, p) => { const b = boardOf(p); return g.kind === "lands" ? `Hold ${g.lands.map((k) => b.lands[k]).join(" and ")} whole.` : g.kind === "share" ? `Hold ${g.many} provinces.` : g.kind === "strong" ? `Hold ${g.many} provinces with 3 or more on each.` : `Put ${NAMES[g.seat]} out. If someone else does, hold ${Math.ceil((p.owner.length * 45) / 100)} provinces.`; };
/** The cards in hand, and the sets that can be handed in. */
function cards(T) {
  const p = T.match.position, s = p.seat, hand = p.hands[s], box = $("hand");
  box.replaceChildren(...hand.map((c) => { const k = suitOf(p, c), at = c < p.owner.length ? c : -1, b = el(at < 0 ? "span" : "button", at < 0 ? "Crown: any" : `${SUITS[k]}: ${nameOf(p, at)}${p.owner[at] === s ? ", yours" : ""}`); if (at >= 0) { b.type = "button"; b.onclick = () => T.board.light([at], {}); } return b; }));
  if (p.goals) { const b = el("button", "Your secret goal"); b.type = "button"; b.onclick = () => sheet("Your secret goal", el("p", `${words(p.goals[s], p)} It counts at the start of your turn.`)); box.append(b); }
  box.hidden = !box.children.length;
  const sets = p.phase === "place" ? setsOf(p, s) : [];
  $("trades").replaceChildren(...sets.map((list) => { const b = el("button", list.map((c) => SUITS[suitOf(p, c)]).join(", ")); b.type = "button"; b.append(el("small", `hand in for ${setWorth(p, s, list)}`)); b.onclick = () => { if (T.ready()) T.play({ do: "trade", cards: list }); }; return b; }));
}
// ---- the guided first game: Traditional on a small archipelago, against one gentle bot ----
const has = (ev, ...kinds) => ev.some((e) => kinds.includes(e.kind));
const pos = (T) => T.match.position;
/** A land of the player's that lacks one province, which can be taken from next door: [land, that province], or null. */
function nearly(p) {
  const b = boardOf(p);
  let best = null;
  b.lands.forEach((_, k) => {
    const miss = p.owner.flatMap((o, i) => (b.region[i] === k && o !== p.seat ? [i] : []));
    if (miss.length === 1 && b.near[miss[0]].some((j) => p.owner[j] === p.seat) && (!best || b.sizes[k] < b.sizes[best[0]])) best = [k, miss[0]];
  });
  return best;
}
/** The fight to suggest: [from, to] with the best chance, a province that makes a land whole first. */
function aim(p) {
  const key = nearly(p)?.[1];
  let best = null, score = -1;
  p.owner.forEach((o, from) => { if (o === p.seat) for (const to of boardOf(p).near[from]) if (p.owner[to] !== p.seat) { const s = (to === key ? 2e6 : 0) + (p.str[from] > 1 ? odds(p, from, to) : p.str[from]); if (s > score) { score = s; best = [from, to]; } } });
  return best;
}
/** The neighbour with the best chance from a chosen province. */
const best = (p, from) => boardOf(p).near[from].filter((to) => p.owner[to] !== p.seat).sort((x, y) => odds(p, from, y) - odds(p, from, x))[0];
/** A land to show: one held whole, else the one nearest to whole. */
function landToShow(p) {
  const b = boardOf(p), whole = wholeOf(p, p.seat)[0], k = whole ?? nearly(p)?.[0] ?? b.lands.map((_, x) => x).sort((x, y) => p.owner.filter((o, i) => o !== p.seat && b.region[i] === x).length - p.owner.filter((o, i) => o !== p.seat && b.region[i] === y).length)[0];
  return { k, whole: whole !== undefined, at: p.owner.findIndex((o, i) => b.region[i] === k && (whole !== undefined || o === p.seat)) };
}
/** The weakest province of the player's that a rival could strike from next door. */
function exposed(p) {
  const b = boardOf(p);
  return p.owner.map((o, i) => i).filter((i) => p.owner[i] === p.seat && b.near[i].some((j) => p.owner[j] !== p.seat && p.owner[j] !== NONE)).sort((x, y) => p.str[x] - p.str[y] || x - y)[0];
}
const LESSON = {
  // its bot is gentle (src/games/banners/bot.js): nobody is struck in round 1, then at most one province a turn
  seed: "lesson 2", options: { style: "classic", seats: 2, map: "isles" }, kinds: ["you", "gentle"],
  steps: [
    { when: (T) => pos(T).phase === "setup", at: (T) => (source === null ? aim(pos(T))?.[0] : $("do")), or: () => $("sources"), done: (T, ev) => has(ev, "place"),
      say: "Win by holding every province. The islands are dealt out between you and a gentle bot: choose a province of yours, on the map or in the list, then press Place to add strength there." },
    { when: (T) => pos(T).phase !== "setup", at: () => $("info"), next: true, done: (T) => !["setup", "place"].includes(pos(T).phase), // the setup's placing does not count
      say: (T) => { const p = pos(T), all = muster(p, p.seat).all, lean = p.round === 1 && p.rule.opening === "lean" && p.seats === 2 && p.step === 0; return `Each turn starts with new strength to place: 1 for every three provinces you hold, at least 3, and more for every land you hold whole. ${lean ? `Moving first, you place a third of your ${all} in this first turn: ${Math.floor(all / 3)}.` : `This turn you place ${all}.`} Place it now, the same way.`; } },
    { when: (T) => pos(T).phase === "attack", at: (T) => (source === null ? aim(pos(T))?.[0] : target === null ? best(pos(T), source) ?? $("targets") : $("do")), or: () => $(source === null ? "sources" : "targets"), done: (T, ev) => (target !== null && pos(T).owner[target] !== pos(T).seat) || has(ev, "fight"),
      say: "Now attack: choose a province of yours with 2 or more, then a neighbour that is not yours." },
    { when: (T) => pos(T).phase === "attack" && target !== null, at: () => $("do"), done: (T, ev) => has(ev, "fight"), pass: (T, ev) => has(ev, "done", "move"),
      say: (T) => `If you keep rolling, your chance to take ${nameOf(pos(T), target)} is ${percent(odds(pos(T), source, target))} in 100: press Roll it out, or Roll once for a single throw.` },
    { when: (T) => pos(T).phase === "occupy", at: () => ($("amount").hidden ? $("do") : $("amount")), done: (T, ev) => has(ev, "occupy"), pass: (T) => pos(T).phase !== "occupy",
      say: "It is yours: choose how many more move in, then press the button; those left behind guard where you came from." },
    { when: (T) => pos(T).phase === "attack", at: () => $("end"), done: (T, ev) => has(ev, "done", "move"),
      say: "Attack again as often as you like; when you have done enough, press End turn (moving once also ends it)." },
    { when: (T) => pos(T).round > 1 && pos(T).phase === "place", at: (T) => exposed(pos(T)) ?? null, or: () => $("sources"), done: (T, ev) => has(ev, "place"),
      say: (T) => { const p = pos(T), at = exposed(p); return `Guard your border: a province with 1 or 2 beside a rival is easy to take.${at === undefined ? "" : ` ${nameOf(p, at)} has ${p.str[at]}.`} Place some of your ${p.left} there.`; } },
    { when: (T) => pos(T).round > 1, at: (T) => landToShow(pos(T)).at, next: true,
      say: (T) => { const p = pos(T), b = boardOf(p), { k, whole } = landToShow(p); return whole ? `You hold all of ${b.lands[k]}, so it adds ${bonusOf(b, k)} to what you place every turn; gold lines mark each land.` : `Gold lines mark the lands: hold every province of ${b.lands[k]} and it adds ${bonusOf(b, k)} to what you place every turn.`; } },
    { when: (T) => pos(T).round > 1, at: () => ($("trades").children.length ? $("trades") : $("hand").hidden ? null : $("hand")), next: true, done: (T, ev) => has(ev, "trade"),
      say: (T) => (setsOf(pos(T), pos(T).seat).length && pos(T).phase === "place" ? "You have a set: hand it in now for more strength to place." : `${pos(T).hands[pos(T).seat].length ? "You took land, so you drew a card" : "Take a province in a turn and you draw a card"}: three alike, or one of each, hand in for more strength.`) },
    { at: () => $("land"), next: true,
      say: "The bar shows each side's share of the provinces, and the bright mark is the goal: all of them. That is the lesson; play on." },
  ],
};
const NICE = { forts: ["Forts", "Spend 4 of what you muster to build one. It throws one more die in defence."], leaders: ["Leaders", "Each player has one. It adds 1 to your best die where it stands, and comes back two rounds after it is lost."], capitals: ["Capitals", "Hold more than half of them at the start of your turn and you win. They add 1 to the defender's best die."], secrets: ["Secret goals", "Each player is dealt one. It counts at the start of your turn."], events: ["Seasons", "Some rounds bring a harvest, a storm that closes the crossings, or unrest."] };

createTable({
  game: banners, key: "banners", title: "Brass and Banners", won: "The land is yours.", outOf: (p, s) => p.round > 1 && cellsOf(p, s) === 0, seats: [2, 3, 4, 5, 6], normal: 4, lengths: [], hard: true,
  // bots do not linger: moving in and placing are quick, a fight is given time to be read
  pace: (p) => (p.phase === "occupy" ? 110 : p.phase === "attack" ? (p.owner.length > 40 ? 300 : 380) : 220),
  placeOf: (p, s) => (p.points ? 1000 * p.points[s] + cellsOf(p, s) : cellsOf(p, s)),
  stands: "That move stands: dice once rolled, or a card once drawn, are not taken back.", // take back stops here (table.js)
  roundText: (p) => (p.points ? `Round ${Math.min(p.round, p.rounds)} of ${p.rounds}` : ""),
  report(T) {
    const { rows, bold } = record(T), p = T.match.position, box = el("div");
    box.append(grid(["Player", "Taken", "Lost", "Fights won", "Struck down", "Fallen", "Dice luck"], rows.map((r, s) => [NAMES[s], r.taken, r.gone, `${r.won} of ${r.fights}`, r.struck, r.fallen, signed(r.luck)]), "The battle record"));
    if (bold && bold.chance < 600000) box.append(el("p", `Boldest win: ${NAMES[bold.seat]} took ${nameOf(p, bold.at)} at ${percent(bold.chance)} in 100.`, "about"));
    return box;
  },
  cellsOf, goalOf, landOf, choose, thinking, lesson: LESSON,
  about: {
    classic: "Traditional: inspired by Risk.\nThe standard world-conquest rules as players know them, on our own world map: all land dealt out, place your armies, attack with up to 3 dice against up to 2, move once, cards in sets for more armies (put a player out and you take theirs), and play until one player holds the world. Ours: the map, the lands and what they pay, and our own card values.\nNot affiliated with or endorsed by its makers. Our own map, names and art.",
    custom: "Custom: your own rules.\nSet every rule yourself: how the game starts, the dice and their luck, what each turn brings, the cards, how much land wins, the number of rounds, and how strongly empty land is held. Add any expansions on top.",
    ours: "Capo: our own variation.\nTen scored rounds. Each player starts alone on one province in empty land. From round 2 you score at the start of your turn for what you still hold: 1 for every three provinces and each whole land's bonus. After round 10 everyone scores once more and the most points wins; holding 65% of the land, or being the last one left, wins at once. Ties cost both sides, cards are always worth the same, and in the first round whoever moves later places more.",
    coda: "Coda: legacy campaigns, coming soon.\nPlay a run of games where each one changes the next: the map, the rules and the pieces carry the marks of what happened. Start from a premade legacy story, one shared by other players, or design your own with an AI assistant. Campaigns can always be played on without AI.",
  },
  choices: [{ key: "map", label: "Map", normal: "world", values: [["world", "The world"], ["isles", "An archipelago"], ["grown", "An inland sea"]] }],
  switches: [
    { key: "start", label: "Start", normal: SWITCHES.start.normal, values: [["dealt", "Land dealt out"], ["claimed", "Claim in turn"], ["far", "One capital each"]] },
    { key: "dice", label: "Dice", normal: SWITCHES.dice.normal, values: [["standard", "3 against 2, ties to defender"], ["guard", "4 against 3, ties to defender"], ["even", "4 against 3, ties cost both"], ["open", "3 against 3, ties cost both"], ["heavy", "5 against 3, ties to defender"]] },
    { key: "muster", label: "Each turn", normal: SWITCHES.muster.normal, values: [["floor", "1 for every 3 provinces, at least 3"], ["plus", "3, and 1 for every 3 provinces"]] },
    { key: "cards", label: "Cards", normal: SWITCHES.cards.normal, values: [["rising", "Worth more each time"], ["flat", "Always the same"], ["none", "None"]] },
    { key: "goal", label: "To win", normal: SWITCHES.goal.normal, values: [[65, "65% of the land"], [80, "80% of the land"], [100, "All of it"]] },
    { key: "rounds", label: "Rounds", normal: SWITCHES.rounds.normal, values: [[10, "10, quick"], [12, "12"], [20, "20"], [40, "40"], [0, "No limit"]] },
    { key: "score", label: "Scoring", normal: SWITCHES.score.normal, values: [["land", "Most land when the rounds end"], ["rounds", "Points every round"]] },
    { key: "order", label: "Turn order", normal: SWITCHES.order.normal, values: [["fixed", "The same each round"], ["rotate", "First seat moves on each round"]] },
    { key: "opening", label: "First turn", normal: SWITCHES.opening.normal, values: [["open", "Full strength"], ["lean", "First player gets a third (two players)"], ["grade", "Round 1 grows down the order"], ["truce", "Nobody attacks in round 1"]] },
    { key: "spoils", label: "Put a player out", normal: SWITCHES.spoils.normal, values: [["trade", "Take their cards, hand in at once at five"], ["wait", "Take their cards, hand in next turn"]] },
    { key: "luck", label: "Dice luck", normal: SWITCHES.luck.normal, values: [["fair", "Fair dice, every throw random"], ["bag", "An open bag: each face as often as the others"]] },
    { key: "neutral", label: "Empty land held by", normal: SWITCHES.neutral.normal, values: [[1, "1"], [2, "2"], [3, "3"]] },
  ],
  expansions: EXPANSIONS.map((key) => ({ key, label: NICE[key][0], note: NICE[key][1] })),
  stats: (p, s) => [...(p.points ? [["Points", p.points[s]]] : []), ["Army", p.str.reduce((n, v, i) => n + (p.owner[i] === s ? v : 0), 0)], p.caps ? ["Capitals", `${capsHeld(p, s)}/${capsToWin(p)}`] : ["Cards", p.hands[s].length]],
  line(e, p) {
    const who = NAMES[e.seat], at = (i) => nameOf(p, i);
    if (e.kind === "place") return `${who} places ${e.n} at ${at(e.at)}.`;
    if (e.kind === "fight") return e.won ? "" : `${who} attacks ${at(e.to)} from ${at(e.from)}: ${e.lost.attacker} lost, ${e.lost.defender} struck down.`;
    if (e.kind === "take") return `${who} takes ${at(e.at)}${e.was === NONE ? "" : ` from ${NAMES[e.was]}`}.`;
    if (e.kind === "out") return `${who} is out. ${NAMES[e.by]} takes their cards.`;
    if (e.kind === "spoils") return `${who} holds ${e.n} cards and hands in at once.`;
    if (e.kind === "claim") return `${who} claims ${at(e.at)}.`;
    if (e.kind === "trade") return `${who} hands in a set for ${e.n}.`;
    if (e.kind === "fort") return `${who} builds a fort at ${at(e.at)}.`;
    if (e.kind === "leader") return `${who}'s leader returns at ${at(e.at)}.`;
    if (e.kind === "leaderlost") return `${who}'s leader is driven off.`;
    if (e.kind === "ready") return "Everything is in place.";
    if (e.kind === "event") return e.what === "harvest" ? "A good harvest: 2 more for everyone this round." : e.what === "storm" ? "Storms: nobody crosses water this round." : `Unrest: ${at(e.at)} leaves ${who}.`;
    if (e.kind === "move") return `${who} moves ${e.n} from ${at(e.from)} to ${at(e.to)}.`;
    if (e.kind === "done") return `${who} ends the turn.`;
    if (e.kind === "score") return e.last ? `${who} scores ${e.n} at the end: ${e.all} points.` : `${who} scores ${e.n}: ${e.all} points.`;
    return "";
  },
  seen(T, events) { for (const e of events) if (e.kind === "fight") { shown = e; shownTie = terms(T.match.position, e.from, e.to).tie === "both"; showDice(T); onMap(T, e); } else if (e.kind === "muster") { shown = null; if (!T.demo) showDice(T); } },
  fresh(T) { source = target = null; much = -1; shown = null; showDice(T); showBag(T); },
  order: (events) => events.flatMap((e) => (e.kind === "take" ? [e.at] : [])),
  board(T, stage) {
    const p = T.match.position, b = boardOf(p), picture = areaPicture(b.fine, b.of, b.mid, b.flat ? 11 : 26, b.flat), middle = (k) => { const list = b.mid.filter((_, i) => b.region[i] === k).map((i) => picture.at[i]); return [list.reduce((n, x) => n + x[0], 0) / list.length, list.reduce((n, x) => n + x[1], 0) / list.length]; };
    const labels = b.lands.map((name, k) => ({ at: b.marks ? picture.at[b.marks[k]] : [middle(k)[0], middle(k)[1] + picture.R * 0.8], sea: !!b.marks, text: `${name.replace(/^the /, "")} +${bonusOf(b, k)}` }));
    const lines = b.ends.flatMap((e) => {
      const [x, y] = e.map((i) => picture.at[i]).sort((i, j) => i[0] - j[0]);
      if (!b.flat || y[0] - x[0] < picture.w / 2) return [[x, y]];
      return [[x, [2, (x[1] + y[1]) / 2]], [y, [picture.w - 2, (x[1] + y[1]) / 2]]]; // round the back of the world
    });
    document.body.classList.toggle("atlas", b.flat);
    return hexBoard(T, stage, {
      reading: { places: b.mid.map((_, i) => ({ at: i, text: nameOf(p, i) })) }, // reading hook (p10-reading): each province's name, where there is room, and under the pointer
      picture, lines, labels, lands: b.region, fine: { cells: b.fine, of: b.of, mid: b.mid }, cells: [], rough: [], sea: [...b.mid.map(() => false), true],
      ground: (i) => (i >= b.n ? SEA : LAND[b.region[i] % LAND.length]),
      owner: () => [...T.match.position.owner, NONE],
      pieces: () => [...T.match.position.owner.map((seat, at) => ({ kind: "army", at, seat, rgb: RGB[seat], count: T.match.position.str[at], now: seat === T.match.turn, fort: !!T.match.position.forts?.[at], cap: !!T.match.position.caps?.includes(at), leader: !!T.match.position.leaders?.includes(at) })),
        // the last dice thrown lie on the table beside the fight, as models (the tilted looks show them; the panel's dice stay for every look)
        ...(shown ? shown.rolls[shown.rolls.length - 1].flatMap((list, k) => list.map((n, i) => ({ kind: "model", name: `die${n}`, at: shown.to, dx: (i - 1) * 0.5 + k * 0.2, dy: 0.95 + k * 0.5, size: 0.8, turn: (i * 5 + k * 3 + n) % 7 * 0.2 - 0.6, rgb: k ? (shown.was === NONE ? [206, 196, 170] : RGB[shown.was]) : RGB[shown.seat] }))) : [])],
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
    if (shown && fight && target !== shown.to) { shown = null; showDice(T); } // the last fight's dice do not sit under the next one
    $("status").textContent = who + cap(p.phase === "claim" ? "claim a province" : p.phase === "place" || p.phase === "setup" ? `place ${p.left}` : p.phase === "occupy" ? `${nameOf(p, p.pend.to)} is yours` : target !== null && fight ? `attack ${nameOf(p, target)}` : target !== null ? `move to ${nameOf(p, target)}` : "attack, move once, or end your turn");
    const g = muster(p, p.seat);
    cards(T);
    const must = p.phase === "place" && p.hands[p.seat].length >= HAND && setsOf(p, p.seat).length > 0;
    $("info").textContent = must ? "You hold five cards or more. Hand in a set first." : p.phase === "claim" ? (source === null ? "Tap an empty province." : about(p, source)) : p.phase === "setup" ? (source === null ? `${p.reserve[p.seat]} left to set out, five at a time. Tap a province of yours.` : about(p, source)) : p.phase === "place" ? (source === null ? (p.took ? "Place what the cards brought, then attack on." : `${g.base ? `${g.base} to begin, ` : ""}${g.land} for land${g.lands ? `, ${g.lands} for whole lands` : ""}${g.event ? ", 2 for the harvest" : ""}`) + `.${p.points && p.round > 1 && !p.took ? ` You scored ${gain(p, p.seat)} for what you held.` : ""} Tap a province of yours.` : about(p, source))
      : p.phase === "occupy" ? "One has moved in. How many more?"
        : fight ? `${p.str[source] - 1} against ${p.str[target]}. If you keep rolling, ${percent(odds(p, source, target))} in 100 to take it, at a likely cost of ${Math.round(toll(p, source, target) / 1000)}.`
          : target !== null ? "Moving ends your turn." : source !== null ? about(p, source) : "Tap a province of yours, then where to.";
    $("sources").hidden = !o.sources.length;
    radio($("sources"), o.sources.map((i) => ({ value: i, label: nameOf(p, i), note: `${p.str[i]} strong` })), source, (v) => { source = v; target = null; much = -1; T.refresh(); });
    $("targets").hidden = !o.targets.length;
    const order = (i) => (p.owner[i] === p.seat ? 2000000 : -odds(p, source, i));
    radio($("targets"), [...o.targets].sort((x, y) => order(x) - order(y) || x - y).map((i) => ({ value: i, label: p.owner[i] === p.seat ? `To ${nameOf(p, i)}` : nameOf(p, i), note: p.owner[i] === p.seat ? "move" : `${p.owner[i] === NONE ? "No one's" : NAMES[p.owner[i]]}, ${p.str[i]} strong, ${percent(odds(p, source, i))} in 100`, rgb: p.owner[i] === NONE ? LAND[0] : RGB[p.owner[i]] })), target, (v) => { target = v; much = -1; T.refresh(); });
    $("amount").hidden = sums.length < 2;
    if (much < 0 || much >= sums.length) much = sums.length - 1;
    $("much").max = String(Math.max(0, sums.length - 1));
    $("many").min = String(sums[0] ?? 0);
    $("many").max = String(sums.at(-1) ?? 0);
    showBag(T);
    const say = () => {
      $("much").value = String(much);
      $("many").value = sums.length ? `${sums[much]}` : "";
      $("less").disabled = much <= 0;
      $("more").disabled = much >= sums.length - 1;
      $("much").setAttribute("aria-valuetext", String(sums[much] ?? ""));
      $("do").disabled = !m;
      $("do").textContent = !m ? (["place", "setup", "claim"].includes(p.phase) ? "Choose a province" : "Choose an attack") : p.phase === "claim" ? "Claim it" : p.phase === "place" || p.phase === "setup" ? `Place ${sums[much]}` : p.phase === "occupy" ? (sums[much] ? `Move in ${sums[much]} more` : "Leave it at one") : fight ? "Roll it out" : `Move ${sums[much]}, end turn`;
    };
    $("much").oninput = () => { much = Number($("much").value); say(); };
    // the stepper and the number box: every amount can be chosen exactly; a number out of range is brought inside it
    const step = (d) => { much = Math.max(0, Math.min(sums.length - 1, much + d)); say(); };
    $("less").onclick = () => step(-1);
    $("more").onclick = () => step(1);
    const typed = (fix) => { const v = Number($("many").value), i = sums.indexOf(Number.isInteger(v) ? Math.max(sums[0], Math.min(sums.at(-1), v)) : NaN); if (i >= 0 && (fix || sums[i] === v)) { much = i; say(); } else if (fix) say(); };
    $("many").oninput = () => { if ($("many").value !== "") typed(false); };
    $("many").onchange = () => typed(true);
    $("many").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); typed(true); $("do").click(); } };
    say();
    $("end").hidden = p.phase !== "attack";
    $("fort").hidden = p.phase !== "place" || source === null || !o.all.some((x) => x.do === "fort" && x.at === source);
    $("fort").textContent = `Fort, ${FORT}`;
    $("fort").onclick = () => { if (T.ready()) T.play({ do: "fort", at: source }); };
    $("once").hidden = !fight;
    const send = (roll) => { if (!T.ready()) return; const list = offers(T).now, go = fight ? list.find((x) => x.roll === roll) : list.find((x) => x.n === sums[much]); if (go) T.play(go); };
    $("do").onclick = () => send("all");
    $("once").onclick = () => send("once");
    $("end").onclick = () => { if (T.ready() && T.match.position.phase === "attack") T.play({ do: "end" }); };
    const hit = o.targets.filter((i) => p.owner[i] !== p.seat);
    T.board.light(p.phase === "place" || p.phase === "setup" || p.phase === "claim" ? [] : target !== null ? [target] : hit, { ring: source ?? (p.phase === "occupy" ? p.pend.to : -1), aim: target ?? -1, dots: [], arrow: source !== null && target !== null ? [source, target] : null });
  },
  changed(T) {
    const p = T.match.position;
    much = -1;
    if (p.phase !== "attack") target = null;
    if (p.phase === "claim") source = null;
    if (p.phase === "attack" && target !== null && p.owner[target] === p.seat) { source = p.str[target] > 1 ? target : source; target = null; } // go on from where you won
    if (!T.human()) source = target = null;
  },
  listing: (T) => { const p = T.match.position, b = boardOf(p); return { head: ["Province", "Whose", "Strong", "Borders"], rows: p.owner.map((o, i) => [nameOf(p, i), o === NONE ? "No one's" : NAMES[o], p.str[i], b.near[i].map((j) => nameOf(p, j)).join(", ")]) }; },
  keys(T, k, e) {
    if (k === "e") $("end").click();
    else if (k === "r" && !$("once").hidden) $("once").click();
    else if ((k === "+" || k === "=" || k === "-") && !$("amount").hidden) $(k === "-" ? "less" : "more").click();
    else if (k === "escape") { source = target = null; T.refresh(); } else if (k === "enter" && !(document.activeElement instanceof HTMLButtonElement && document.activeElement.id !== "do")) { e.preventDefault(); $("do").click(); }
  },
  more: {
    label: "Lands and dice",
    body(T) { const p = T.match.position, b = boardOf(p), u = el("ul"), box = el("div"); box.append(el("h3", "Every die thrown"), tally(T), ...(p.bag ? [el("h3", "The bag of throws"), el("p", `Left in the bag: ${p.bag.map((c, f) => `${c} ${FACES[f]}`).join(", ")}; ${p.bag.reduce((n, c) => n + c, 0)} in all. Each die is drawn from it at random, by the game's seed. It starts with ${BAG.each} of each face, and a fresh set goes in when fewer than ${BAG.low} are left.`)] : []), el("h3", "The lands"), u); u.append(...b.lands.map((n, k) => { const s = [0, 1, 2, 3, 4, 5].find((x) => x < p.seats && wholeOf(p, x).includes(k)); return el("li", `${cap(n)}: ${b.sizes[k]} provinces, ${bordersOf(b, k)} on its borders, worth ${bonusOf(b, k)} a turn. ${s === undefined ? "Nobody holds it whole." : `${NAMES[s]} holds it whole.`}`); })); return box; },
  },
  rules: (_, p) => {
    const r = p?.rule, d = DICE[r?.dice || SWITCHES.dice.normal];
    return [
      ...(r ? [`This game: ${r.start === "dealt" ? "land dealt out" : r.start === "claimed" ? "land claimed in turn" : "one capital each"}; hold ${r.goal}% of the land, or be the last one left; ${p.rounds ? `after ${p.rounds} rounds the most ${p.points ? "points" : "land"} wins` : `no round limit, but a war still running after ${SAFETY} rounds is called off and the most land wins`}.`] : []),
      "Each turn: hand in cards if you like, place new strength, attack as often as you like, then move once or end your turn.",
      `You place ${r?.muster === "plus" ? "3, and 1 for every three provinces you hold" : "1 for every three provinces you hold, at least 3"}, and more for every land you hold whole. Gold lines mark the lands; the number by a land's name is what it pays: a third of its provinces and half of those on its borders.`,
      "To attack, tap a province of yours with 2 or more, then one beside it. Dashed lines over water are crossings.",
      `You throw a die for each of your strength but one, ${d.a} at most. The defender throws one for each of theirs, ${d.d} at most. Highest meets highest: the lower one loses 1. ${d.tie === "both" ? "If they tie, both lose 1." : "Ties go to the defender."}`,
      ...(p?.points ? [`Scored rounds: from round 2, at the start of your turn you score for what you still hold: 1 for every three provinces, and each whole land's bonus${p.caps ? ", and 2 for each capital" : ""}. After round ${p.rounds} everyone left scores once more. Level on points, the most land wins.`] : []),
      "Roll once, or roll it out until somebody has won. The chance and the likely cost are shown first; the dice and the losses appear on the map, and Lands and dice in the menu counts every die thrown. When you win, choose exactly how many move in: drag the slider, press - and +, or type the number.",
      ...(r?.luck === "bag" ? [`Dice luck, an open bag: every die is drawn from a bag of throws that starts with ${BAG.each} of each face, so over a game each face comes up about as often as the others. What is left in the bag is shown under the dice. When fewer than ${BAG.low} are left, a fresh set of ${6 * BAG.each} goes in. The chances shown are worked out for fair dice, so the bag can shift them a little.`] : []),
      `Take a province in your turn and you draw a card. Three alike, or one of each, can be handed in for more to place. Crowns stand for any. One more for each card that shows a province of yours. With five cards you must hand in a set. Put a player out and you take theirs${r?.spoils === "wait" ? "" : "; if that makes five or more, hand in at once and place what they bring"}.`,
      ...EXPANSIONS.filter((x) => !p || (x === "forts" ? p.forts : x === "leaders" ? p.leaders : x === "capitals" ? p.caps : x === "secrets" ? p.goals : p.event !== undefined)).map((x) => `${NICE[x][0]}: ${NICE[x][1]}`),
      "A soldier is 1 to 4, a horse 5 to 9, a gun 10 or more. Zoom with the wheel or two fingers, and drag the map.",
      `${r?.order === "rotate" ? "Whoever moves first changes every round." : "The same order every round."}${r?.opening === "lean" && p.seats === 2 ? " The first player places a third of its strength on its first turn." : r?.opening === "grade" ? " In round 1 each player places a share by its place in the order: the last places it all." : r?.opening === "truce" ? " Nobody attacks in round 1." : ""}`,
      "Keys: Tab and arrows choose, Enter acts, R rolls once, + and - change how many, E ends the turn, Escape lets go, U takes back.",
    ];
  },
});
