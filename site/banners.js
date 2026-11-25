// SPDX-License-Identifier: AGPL-3.0-or-later
// Brass and Banners on the table: place strength, attack with dice, move in, move once.
import { EXPANSIONS, FORT, HAND, NONE, SWITCHES, banners, bonusOf, boardOf, capsHeld, capsToWin, cellsOf, goalOf, landOf, muster, nameOf, odds, setWorth, setsOf, suitOf, terms, wholeOf } from "../src/games/banners/rules.js";
import { choose, thinking } from "../src/games/banners/bot.js";
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
  box.hidden = !f;
  if (!f) return;
  const [A, D] = f.rolls[f.rolls.length - 1], row = (list, other, rgb, tie) => { const d = el("div"); list.forEach((n, i) => { const s = die(n, rgb, i < other.length && (n < other[i] || (n === other[i] && tie))); s.style.animationDelay = `${i * 45}ms`; d.append(s); }); return d; };
  box.setAttribute("role", "img");
  box.setAttribute("aria-label", `${NAMES[f.seat]} rolled ${A.join(", ")}. ${f.was === NONE ? "The defenders" : NAMES[f.was]} rolled ${D.join(", ")}.`);
  box.replaceChildren(row(A, D, RGB[f.seat], true), row(D, A, f.was === NONE ? [206, 196, 170] : RGB[f.was], shownTie));
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
const NICE = { forts: ["Forts", "Spend 4 of what you muster to build one. It throws one more die in defence."], leaders: ["Leaders", "Each player has one. It adds 1 to your best die where it stands, and comes back two rounds after it is lost."], capitals: ["Capitals", "Hold more than half of them at the start of your turn and you win. They add 1 to the defender's best die."], secrets: ["Secret goals", "Each player is dealt one. It counts at the start of your turn."], events: ["Seasons", "Some rounds bring a harvest, a storm that closes the crossings, or unrest."] };

createTable({
  game: banners, key: "banners", title: "Brass and Banners", won: "The land is yours.", seats: [2, 3, 4, 5, 6], normal: 4, lengths: [], pace: (p) => (p.owner.length > 40 ? 300 : 430),
  cellsOf, goalOf, landOf, choose, thinking,
  about: {
    classic: "Traditional: inspired by Risk.\nThe standard world-conquest rules as players know them, on our own world map: all land dealt out, place your armies, attack with dice as often as you like, move once, cards in sets for more armies, and play until one player holds the world. Ours: the attacker throws up to 4 dice and the defender 3, ties go to the defender, and our own card values.\nNot affiliated with or endorsed by its makers. Our own map, names and art.",
    custom: "Custom: your own rules.\nSet every rule yourself: how the game starts, the dice, the cards, how much land wins, the number of rounds, and how strongly empty land is held. Add any expansions on top.",
    ours: "Capo: our own variation.\nEach player starts alone on one province in empty land. Ties cost both sides, cards are always worth the same, and holding 65% of the land wins. Quicker, with more room to grow before the fighting starts.",
    coda: "Coda: legacy campaigns, coming soon.\nPlay a run of games where each one changes the next: the map, the rules and the pieces carry the marks of what happened. Start from a premade legacy story, one shared by other players, or design your own with an AI assistant. Campaigns can always be played on without AI.",
  },
  choices: [{ key: "map", label: "Map", normal: "world", values: [["world", "The world"], ["isles", "An archipelago"], ["grown", "An inland sea"]] }],
  switches: [
    { key: "start", label: "Start", normal: SWITCHES.start.normal, values: [["dealt", "Land dealt out"], ["claimed", "Claim in turn"], ["far", "One capital each"]] },
    { key: "dice", label: "Dice", normal: SWITCHES.dice.normal, values: [["guard", "4 against 3, ties to defender"], ["even", "4 against 3, ties cost both"], ["open", "3 against 3, ties cost both"], ["heavy", "5 against 3, ties to defender"]] },
    { key: "cards", label: "Cards", normal: SWITCHES.cards.normal, values: [["rising", "Worth more each time"], ["flat", "Always the same"], ["none", "None"]] },
    { key: "goal", label: "To win", normal: SWITCHES.goal.normal, values: [[65, "65% of the land"], [80, "80% of the land"], [100, "All of it"]] },
    { key: "rounds", label: "Rounds", normal: SWITCHES.rounds.normal, values: [[12, "12, quick"], [20, "20"], [40, "40"]] },
    { key: "neutral", label: "Empty land held by", normal: SWITCHES.neutral.normal, values: [[1, "1"], [2, "2"], [3, "3"]] },
  ],
  expansions: EXPANSIONS.map((key) => ({ key, label: NICE[key][0], note: NICE[key][1] })),
  stats: (p, s) => [["Army", p.str.reduce((n, v, i) => n + (p.owner[i] === s ? v : 0), 0)], p.caps ? ["Capitals", `${capsHeld(p, s)}/${capsToWin(p)}`] : ["Cards", p.hands[s].length]],
  line(e, p) {
    const who = NAMES[e.seat], at = (i) => nameOf(p, i);
    if (e.kind === "place") return `${who} places ${e.n} at ${at(e.at)}.`;
    if (e.kind === "fight") return e.won ? "" : `${who} attacks ${at(e.to)} from ${at(e.from)}: ${e.lost.attacker} lost, ${e.lost.defender} struck down.`;
    if (e.kind === "take") return `${who} takes ${at(e.at)}${e.was === NONE ? "" : ` from ${NAMES[e.was]}`}.`;
    if (e.kind === "out") return `${who} is out. ${NAMES[e.by]} takes their cards.`;
    if (e.kind === "claim") return `${who} claims ${at(e.at)}.`;
    if (e.kind === "trade") return `${who} hands in a set for ${e.n}.`;
    if (e.kind === "fort") return `${who} builds a fort at ${at(e.at)}.`;
    if (e.kind === "leader") return `${who}'s leader returns at ${at(e.at)}.`;
    if (e.kind === "leaderlost") return `${who}'s leader is driven off.`;
    if (e.kind === "ready") return "Everything is in place.";
    if (e.kind === "event") return e.what === "harvest" ? "A good harvest: 2 more for everyone this round." : e.what === "storm" ? "Storms: nobody crosses water this round." : `Unrest: ${at(e.at)} leaves ${who}.`;
    if (e.kind === "move") return `${who} moves ${e.n} from ${at(e.from)} to ${at(e.to)}.`;
    if (e.kind === "done") return `${who} ends the turn.`;
    return "";
  },
  seen(T, events) { for (const e of events) if (e.kind === "fight") { shown = e; shownTie = terms(T.match.position, e.from, e.to).tie === "both"; showDice(T); } else if (e.kind === "muster") { shown = null; if (!T.demo) showDice(T); } },
  fresh(T) { source = target = null; much = -1; shown = null; showDice(T); },
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
      picture, lines, labels, plain: true, lands: b.region, fine: { cells: b.fine, of: b.of, mid: b.mid }, cells: [], rough: [], sea: [...b.mid.map(() => false), true],
      ground: (i) => (i >= b.n ? SEA : LAND[b.region[i] % LAND.length]),
      owner: () => [...T.match.position.owner, NONE],
      pieces: () => T.match.position.owner.map((seat, at) => ({ kind: "army", at, seat, rgb: RGB[seat], count: T.match.position.str[at], now: seat === T.match.turn, fort: !!T.match.position.forts?.[at], cap: !!T.match.position.caps?.includes(at), leader: !!T.match.position.leaders?.includes(at) })),
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
    $("status").textContent = who + cap(p.phase === "claim" ? "claim a province" : p.phase === "place" || p.phase === "setup" ? `place ${p.left}` : p.phase === "occupy" ? `${nameOf(p, p.pend.to)} is yours` : target !== null && fight ? `attack ${nameOf(p, target)}` : target !== null ? `move to ${nameOf(p, target)}` : "attack, move once, or end your turn");
    const g = muster(p, p.seat);
    cards(T);
    const must = p.phase === "place" && p.hands[p.seat].length >= HAND && setsOf(p, p.seat).length > 0;
    $("info").textContent = must ? "You hold five cards or more. Hand in a set first." : p.phase === "claim" ? (source === null ? "Tap an empty province." : about(p, source)) : p.phase === "setup" ? (source === null ? `${p.reserve[p.seat]} left to set out, five at a time. Tap a province of yours.` : about(p, source)) : p.phase === "place" ? (source === null ? `${g.base} to begin, ${g.land} for land${g.lands ? `, ${g.lands} for whole lands` : ""}${g.event ? ", 2 for the harvest" : ""}. Tap a province of yours.` : about(p, source))
      : p.phase === "occupy" ? "One has moved in. How many more?"
        : fight ? `${p.str[source] - 1} against ${p.str[target]}. If you keep rolling, ${percent(odds(p, source, target))} in 100 to take it.`
          : target !== null ? "Moving ends your turn." : source !== null ? about(p, source) : "Tap a province of yours, then where to.";
    $("sources").hidden = !o.sources.length;
    radio($("sources"), o.sources.map((i) => ({ value: i, label: nameOf(p, i), note: `${p.str[i]} strong` })), source, (v) => { source = v; target = null; much = -1; T.refresh(); });
    $("targets").hidden = !o.targets.length;
    const order = (i) => (p.owner[i] === p.seat ? 2000000 : -odds(p, source, i));
    radio($("targets"), [...o.targets].sort((x, y) => order(x) - order(y) || x - y).map((i) => ({ value: i, label: p.owner[i] === p.seat ? `To ${nameOf(p, i)}` : nameOf(p, i), note: p.owner[i] === p.seat ? "move" : `${percent(odds(p, source, i))} in 100`, rgb: p.owner[i] === NONE ? LAND[0] : RGB[p.owner[i]] })), target, (v) => { target = v; much = -1; T.refresh(); });
    $("amount").hidden = sums.length < 2;
    if (much < 0 || much >= sums.length) much = sums.length - 1;
    $("much").max = String(Math.max(0, sums.length - 1));
    $("much").value = String(much);
    const say = () => {
      $("many").textContent = sums.length ? `${sums[much]}` : "";
      $("much").setAttribute("aria-valuetext", String(sums[much] ?? ""));
      $("do").disabled = !m;
      $("do").textContent = !m ? (["place", "setup", "claim"].includes(p.phase) ? "Choose a province" : "Choose an attack") : p.phase === "claim" ? "Claim it" : p.phase === "place" || p.phase === "setup" ? `Place ${sums[much]}` : p.phase === "occupy" ? (sums[much] ? `Move in ${sums[much]} more` : "Leave it at one") : fight ? "Roll it out" : `Move ${sums[much]}, end turn`;
    };
    $("much").oninput = () => { much = Number($("much").value); say(); };
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
  keys(T, k, e) {
    if (k === "e") $("end").click();
    else if (k === "r" && !$("once").hidden) $("once").click();
    else if (k === "escape") { source = target = null; T.refresh(); } else if (k === "enter" && !(document.activeElement instanceof HTMLButtonElement && document.activeElement.id !== "do")) { e.preventDefault(); $("do").click(); }
  },
  more: {
    label: "The lands",
    body(T) { const p = T.match.position, b = boardOf(p), u = el("ul"); u.append(...b.lands.map((n, k) => { const s = [0, 1, 2, 3, 4, 5].find((x) => x < p.seats && wholeOf(p, x).includes(k)); return el("li", `${cap(n)}: ${b.sizes[k]} provinces, worth ${bonusOf(b, k)} a turn. ${s === undefined ? "Nobody holds it whole." : `${NAMES[s]} holds it whole.`}`); })); return u; },
  },
  rules: (_, p) => {
    const r = p?.rule;
    return [
      ...(r ? [`This game: ${r.start === "dealt" ? "land dealt out" : r.start === "claimed" ? "land claimed in turn" : "one capital each"}; hold ${r.goal}% of the land, or be the last one left; after ${p.rounds} rounds the most land wins.`] : []),
      "Each turn: hand in cards if you like, place new strength, attack as often as you like, then move once or end your turn.",
      "You place 3, and 1 for every three provinces you hold, and more for every land you hold whole. Gold lines mark the lands; the number by a land's name is what it pays.",
      "To attack, tap a province of yours with 2 or more, then one beside it. Dashed lines over water are crossings.",
      `You throw a die for each of your strength but one, ${r ? (r.dice === "open" ? 3 : r.dice === "heavy" ? 5 : 4) : 4} at most. The defender throws three at most. Highest meets highest: the lower one loses 1. ${r && (r.dice === "even" || r.dice === "open") ? "If they tie, both lose 1." : "Ties go to the defender in Traditional games."}`,
      "Roll once, or roll it out until somebody has won. The chance is shown first. When you win, choose how many move in.",
      "Take a province in your turn and you draw a card. Three alike, or one of each, can be handed in for more to place. Crowns stand for any. One more for each card that shows a province of yours. With five cards you must hand in a set. Put a player out and you take theirs.",
      ...EXPANSIONS.filter((x) => !p || (x === "forts" ? p.forts : x === "leaders" ? p.leaders : x === "capitals" ? p.caps : x === "secrets" ? p.goals : p.event !== undefined)).map((x) => `${NICE[x][0]}: ${NICE[x][1]}`),
      "A soldier is 1 to 4, a horse 5 to 9, a gun 10 or more. Zoom with the wheel or two fingers, and drag the map.",
      "Whoever moves first changes every round.",
      "Keys: Tab and arrows choose, Enter acts, R rolls once, E ends the turn, Escape lets go, U takes back.",
    ];
  },
});
