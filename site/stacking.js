// SPDX-License-Identifier: AGPL-3.0-or-later
// The stacking game on the table, an early version: a lit table of turned stones (or the flat board), a tower strip that lists
// the stack you last touched stone by stone (top first), and a move panel: choose a stone (or a pouch stone to drop, or a stone
// to place), then what it does. Bots from step 3 up, hints and reviews think in a worker (site/stackhelp.js). A guided
// first game (site/coach.js) and puzzles (src/games/stacking/puzzles.js) teach it.
import { KINDS, LAYOUTS, PLACE_LEAST, QUIET, countOf, kindOf, lodeOf, nameOf, ownerOf, setOf, stacking, stonesOf, threatened, topOf, towersOf } from "../src/games/stacking/rules.js";
import { askOf, choose, deciding, hinting, reviewing, thinking as plan } from "../src/games/stacking/bot.js";
import { PUZZLES, optionOf } from "../src/games/stacking/puzzles.js";
import { createMatch } from "../src/core/index.js";
import { $, NAMES, RGB, createTable, el, radio, toast } from "./table.js";
import { stackBoard } from "./stackboard.js";
import { ask, work } from "./stackhelp.js";

let from = null, pick = null, seen = -1, told = null; // from: a cell, "d1".."d4" a pouch kind to drop, "p0".."p4" a kind to place, "swap" or "stop"; pick: the chosen move's key; seen: the stack in the strip; told: a hint
const SOLVED = "capo-stacking-puzzles";
const legal = (T) => (T.ready() ? T.match.legal() : []);
const keyOf = (m) => `${m.do}:${m.to ?? ""}`;
const sourceOf = (m) => (m.do === "drop" ? `d${m.kind}` : m.do === "place" ? `p${m.kind}` : m.do === "swap" || m.do === "stop" ? m.do : String(m.from));
const say = (st) => `${NAMES[ownerOf(st)]} ${KINDS[kindOf(st)]}`;
const kept = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* this visit only */ } };
const solved = () => new Set((kept(SOLVED) || "").split(",").filter(Boolean));

/** What a move does, in a few words. */
function verb(p, m) {
  const h = p.cells[m.to]?.length ?? 0;
  if (m.do === "move") return h ? `Climb onto ${nameOf(p, m.to)}` : `Move to ${nameOf(p, m.to)}`;
  if (m.do === "strike") return `Strike ${nameOf(p, m.to)}`;
  if (m.do === "sling") return `Sling at ${nameOf(p, m.to)}`;
  if (m.do === "topple") return `Topple ${nameOf(p, m.to)}`;
  if (m.do === "drop") return `Drop on ${nameOf(p, m.to)}`;
  if (m.do === "place") return `Place on ${nameOf(p, m.to)}`;
  if (m.do === "stop") return "Stop placing";
  return "Swap sides";
}
/** A move in full, for the review: whose stone, and what it does. */
const told1 = (p, m) => { const v = verb(p, m); return m.do === "drop" || m.do === "place" || m.do === "swap" || m.do === "stop" ? v : `${KINDS[kindOf(topOf(p, m.from))]} ${nameOf(p, m.from)}: ${v[0].toLowerCase()}${v.slice(1)}`; };
/** What is on a cell now, and what the move leaves there. */
function note(p, m) {
  const h = p.cells[m.to]?.length ?? 0, top = h ? say(topOf(p, m.to)) : "";
  if (m.do === "move") return h ? `onto ${top}: tier ${h + 1}` : "tier 1";
  if (m.do === "strike" || m.do === "sling") return `${top} to your pouch`;
  if (m.do === "topple") return `${top} falls behind`;
  if (m.do === "drop" || m.do === "place") return `a ${KINDS[m.kind]}`;
  if (m.do === "stop") { const n = p.hand[p.seat].reduce((a, b) => a + b, 0); return `${n} wait in your pouch`; }
  return "play the side that has moved";
}

/** A tap on the board: your own stone chooses it, a lit cell chooses that move (a second tap plays it); any tap shows its stack. */
function tap(T, i) {
  if (T.demo) return;
  seen = i;
  if (!T.ready()) { tower(T); T.board?.clear?.(); return; }
  const all = legal(T), here = all.filter((m) => sourceOf(m) === from && m.to === i);
  if (here.length) {
    const k = here.some((m) => keyOf(m) === pick) ? pick : keyOf(here[0]);
    if (k === pick && here.length === 1) { T.play(here[0]); return; }
    pick = k;
  } else if (all.some((m) => sourceOf(m) === String(i))) { from = String(i); pick = null; } else { from = null; pick = null; }
  T.refresh();
}

/** The tower strip: the stack last touched (or chosen, or last moved), top first; every tower on the board; both pouches. */
const looked = (T) => { const p = T.match.position; return seen >= 0 ? seen : from && /^\d+$/.test(from) ? Number(from) : p.last?.to ?? -1; };
function tower(T) {
  const p = T.match.position, box = $("tower"), at = looked(T), parts = [];
  if (at >= 0) {
    const c = p.cells[at];
    parts.push(el("p", c.length ? `Stack at ${nameOf(p, at)}, ${c.length} high, top first` : `${nameOf(p, at)} is empty`, "cap"));
    const ol = el("ol");
    for (let k = c.length - 1; k >= 0; k--) {
      const li = el("li"), dot = el("i", undefined, "dot");
      dot.style.background = `rgb(${RGB[ownerOf(c[k])]})`;
      li.append(el("span", `Tier ${k + 1}`, "tier"), dot, el("span", say(c[k])), ...(k === c.length - 1 ? [el("span", "acts", "acts")] : []));
      ol.append(li);
    }
    if (c.length) parts.push(ol);
  } else parts.push(el("p", "Tap a stack to read it here, top first.", "cap"));
  const towers = towersOf(p);
  if (towers.length) {
    const d = el("details"), u = el("ul");
    d.open = innerWidth > 820;
    d.append(el("summary", `Towers on the board (${towers.length})`), u);
    for (const i of towers) {
      const btn = el("button", `${nameOf(p, i)}: ${[...p.cells[i]].reverse().map(say).join(", ")}`, "quiet");
      btn.type = "button"; btn.onclick = () => { seen = i; if (T.ready()) T.refresh(); else { tower(T); T.board?.clear?.(); } };
      u.append(el("li")); u.lastChild.append(btn);
    }
    parts.push(d);
  }
  parts.push(el("p", `Pouches: ${[0, 1].map((s) => `${NAMES[s]} ${pouchText(p, s)}`).join("; ")}.`, "pouch"));
  box.replaceChildren(...parts);
}
const pouchText = (p, s) => p.pouch[s].flatMap((n, k) => (n ? [`${n} ${KINDS[k]}${n > 1 ? "s" : ""}`] : [])).join(", ") || "empty";

/** Hints are for a game against bots on this device. */
const hints = (T) => T.solo() && !T.link && T.kinds.some((k) => k !== "you" && k !== "away");
async function hint(T) {
  const p = T.match.position, at = T.match.list.length, seed = (at * 7919 + 13) >>> 0;
  $("hint").disabled = true;
  told = { at, text: "Thinking..." };
  $("told").textContent = told.text;
  let got = null;
  try { got = await work({ kind: "hint", p, seed }, () => hinting(p, seed)); } catch { got = null; }
  if (!T.match || T.match.list.length !== at || !T.ready()) return;
  if (!got) { told = { at, text: "No hint here." }; T.refresh(); return; }
  from = sourceOf(got.move); pick = keyOf(got.move); if (got.move.to >= 0) seen = got.move.to;
  told = { at, text: `Hint: ${told1(p, got.move)}. ${got.why}` };
  T.refresh();
}

function panel(T) {
  const p = T.match.position, all = legal(T), sources = [...new Set(all.map(sourceOf))], placing = p.phase === "place";
  if (from !== null && !sources.includes(from)) from = null;
  if (from === null && sources.length === 1 && !/^\d+$/.test(sources[0])) from = sources[0]; // the one kind to place, or the swap
  const list = from === null ? [] : all.filter((m) => sourceOf(m) === from);
  if (!list.some((m) => keyOf(m) === pick)) pick = list.length === 1 ? keyOf(list[0]) : null;
  const danger = threatened(p, p.seat), who = T.solo() ? "Your turn" : `${NAMES[p.seat]}'s turn`;
  $("status").textContent = placing ? `${who}: place a stone in your home rows${p.placed[p.seat] ? "" : ", your Lodestone first"}.${p.placed[p.seat] >= PLACE_LEAST ? " You may stop; the rest wait in your pouch." : ""}`
    : `${who}${danger ? ": your Lodestone is open to a strike. Make it safe." : ". Choose a stone, then what it does."}`;
  radio($("sources"), sources.map((s) => {
    if (s === "swap") return { value: s, label: "Swap sides", note: "take the side that has moved" };
    if (s === "stop") return { value: s, label: "Stop placing", note: "keep the rest in your pouch" };
    if (s[0] === "d") { const k = Number(s.slice(1)); return { value: s, label: `Drop a ${KINDS[k]}`, note: `${p.pouch[p.seat][k]} in your pouch` }; }
    if (s[0] === "p") { const k = Number(s.slice(1)); return { value: s, label: `Place a ${KINDS[k]}`, note: `${p.hand[p.seat][k]} in hand`, rgb: RGB[p.seat] }; }
    const i = Number(s), st = topOf(p, i);
    return { value: s, label: `${KINDS[kindOf(st)]} ${nameOf(p, i)}`, note: `tier ${p.cells[i].length}`, rgb: RGB[p.seat] };
  }), from, (v) => { from = from === v ? null : v; pick = null; if (/^\d+$/.test(v)) seen = Number(v); T.refresh(); });
  $("wheres").hidden = !list.length;
  radio($("wheres"), list.map((m) => ({ value: keyOf(m), label: verb(p, m), note: note(p, m) })), pick, (v) => { pick = v; const m = list.find((x) => keyOf(x) === v); if (m?.to >= 0) seen = m.to; T.refresh(); });
  const m = list.find((x) => keyOf(x) === pick);
  $("do").disabled = !m;
  $("do").textContent = m ? verb(p, m) : from !== null ? "Choose what it does" : "Choose a stone";
  $("do").onclick = () => { const now = legal(T).find((x) => sourceOf(x) === from && keyOf(x) === pick); if (now) T.play(now); };
  $("hint").hidden = placing || !hints(T);
  $("hint").disabled = told?.at === T.match.list.length && told.text === "Thinking...";
  $("hint").onclick = () => hint(T);
  $("told").textContent = told?.at === T.match.list.length ? told.text : "";
  T.board.light(list.filter((x) => x.to >= 0).map((x) => x.to), { ring: /^\d+$/.test(from ?? "") ? Number(from) : -1, aim: m?.to ?? -1 });
  tower(T);
}

/** The bots think in the worker when there is one; the seed for their ties is drawn first either way, so the move is the same. */
function* thinking(p, dice, tier) {
  if (p.phase === "place" || tier === "easy" || tier === "gentle") return yield* plan(p, dice, tier);
  const o = askOf(tier, dice), job = ask({ kind: "think", p, o });
  if (job) {
    let got = null;
    yield job.then((m) => { got = m; }, () => { got = null; }); // stacking hook (site/table.js): the table waits for a promise a bot hands it
    if (got) return got;
  }
  return yield* deciding(p, o);
}

/** The review at the end: the three largest swings in the person's moves, and any trap that was missed. */
function review(T) {
  const m = T.match, people = T.kinds.flatMap((k, s) => (k === "you" ? [s] : []));
  if (!people.length || !m.list.length || m.options.puzzle) return null;
  const box = el("div", undefined, "review"), go = el("button", "Review the game", "quiet"), out = el("ol"), line = el("p", "The normal bot weighs each of your moves and marks the three that cost most, and any trap you missed.", "about");
  go.type = "button";
  go.onclick = async () => {
    go.disabled = true; go.textContent = "Weighing each move...";
    const game = { seed: m.seed, options: m.options, moves: m.list };
    let marks = null;
    try { marks = await work({ kind: "review", game, people }, () => reviewing(game, people)); } catch { marks = null; }
    go.hidden = true;
    if (!marks) { line.textContent = "The review could not be made."; return; }
    line.textContent = marks.length ? "Where the game turned:" : "No move of yours cost much by the bot's count. Well played.";
    out.replaceChildren(...marks.map((x) => {
      const before = m.at(x.n - 1), size = x.lost >= 150 ? "a big loss" : x.lost >= 60 ? "a clear loss" : "a small loss";
      return el("li", `Move ${x.n}, ${NAMES[x.seat]}: ${told1(before, x.played)}. ${x.trap ? `A trap in ${x.trap} turn${x.trap > 1 ? "s" : ""} was there: ${told1(before, x.best)}.` : `Better: ${told1(before, x.best)}; this was ${size}.`} Step through the game to see it.`);
    }));
  };
  box.append(line, go, out);
  return box;
}

/** The puzzles: a list to choose from, each solved one marked. */
function puzzles(T) {
  const box = el("div", undefined, "stack"), done = solved();
  box.append(el("p", "Trap the rival Lodestone within the turns given; the hard bot defends. A puzzle takes the place of the game in progress in this browser.", "about"));
  PUZZLES.forEach((z, k) => {
    const b = el("button", `${z.name}${done.has(String(k)) ? " (solved)" : ""}`, "quiet");
    b.type = "button";
    b.onclick = () => { $("sheet").close(); puzzle(T, k); };
    box.append(b);
  });
  return box;
}
function puzzle(T, k) {
  const z = PUZZLES[k], kinds = [0, 1].map((s) => (s === z.seat ? "you" : "hard"));
  T.begin(createMatch(stacking, { seed: `puzzle ${k}`, options: { style: "custom", size: 3, puzzle: optionOf(z) } }), kinds);
  toast(`${z.name}. Trap the rival Lodestone within ${z.turns} turn${z.turns > 1 ? "s" : ""}.`);
}
const puzzleOf = (T) => (T.match?.options.puzzle ? PUZZLES.findIndex((z) => JSON.stringify(optionOf(z)) === JSON.stringify(T.match.options.puzzle)) : -1);

// the guided first game: the quick set against the gentle bot
const has = (ev, ...kinds) => ev.some((e) => kinds.includes(e.kind));
const pos = (T) => T.match.position;
const mineOf = (T, kind) => pos(T).cells.findIndex((c) => c.length && ownerOf(c[c.length - 1]) === pos(T).seat && kindOf(c[c.length - 1]) === kind);
const can = (T, f) => legal(T).some(f);
const LESSON = {
  seed: "lesson 3", options: { style: "ours" }, kinds: ["you", "gentle"],
  steps: [
    { at: (T) => mineOf(T, 2), or: () => $("sources"), done: (T, ev) => /^\d+$/.test(from ?? "") || has(ev, "move", "strike", "sling", "topple", "drop"),
      say: "This is the quick Capo set: 37 cells, nine stones a side, and only the top stone of a stack acts. Choose your Courier (two bars), on the board or in the list." },
    { at: (T) => (from === null ? mineOf(T, 2) : pick ? $("do") : $("wheres")), or: () => $("sources"), done: (T, ev) => has(ev, "move", "strike", "sling", "topple", "drop"),
      say: "Lit cells show where it can go: a Courier slides up to 2 in a line, one more for each tier it stands on. Choose a cell, then press the button. Take back undoes a move." },
    { at: () => $("sources"), next: (T) => !can(T, (m) => m.do === "move" && pos(T).cells[m.to].length), done: (T, ev) => ev.some((e) => e.kind === "move" && e.tier > 1),
      say: (T) => `Climb: a stone may move onto a stack no taller than the tier it stands on, up to three high. Height adds reach, and a stone strikes no more than one tier up. ${can(T, (m) => m.do === "move" && pos(T).cells[m.to].length) ? "Climb one of yours now." : "Nothing can climb just now: press Next."}` },
    { at: () => $("tower"), next: true,
      say: "The tower strip, here and in the corner of the board, shows the stack you last touched, top first, with each stone's owner and tier. Tap any stack to read it. Notches on a stone count its tier." },
    { at: () => $("sources"), next: (T) => !can(T, (m) => m.do === "strike" || m.do === "sling"), done: (T, ev) => has(ev, "strike", "sling"),
      say: (T) => `Strike: step onto a rival top stone no more than one tier above yours, and it goes to your pouch as yours. A Slinger strikes the first stone in a line and stays put. ${can(T, (m) => m.do === "strike" || m.do === "sling") ? "Strike now." : "Nothing to strike yet: press Next, or come close first."}` },
    { at: () => $("sources"), next: (T) => !can(T, (m) => m.do === "drop"), done: (T, ev) => has(ev, "drop"),
      say: (T) => `Drop: instead of moving, put a pouch stone on an empty cell beside one of your own stacks, never beside the rival Lodestone. ${can(T, (m) => m.do === "drop") ? "Drop one now." : "Your pouch is empty: press Next."}` },
    { at: () => $("status"), next: true,
      say: "You may never leave your own Lodestone open to a strike. Trap the rival Lodestone, so that they have no legal move, to win. In Capo, after 30 turns each the higher count of tiers topped wins: each stack you top counts its height." },
    { at: () => $("hint"), next: true,
      say: "Stuck? Hint shows the bot's choice and says why, and the end of a game offers a review. Puzzles in the menu train the trap. That is the lesson; play on." },
  ],
};

createTable({
  game: stacking, key: "stacking", title: "The stacking game", won: "You trapped the rival Lodestone.", outOf: () => false, seats: [2], normal: 2, lengths: [], pace: () => 520,
  quick: { style: "ours" }, hard: true, master: true,
  unit: "Stones", cellsOf: stonesOf, goalOf: setOf, landOf: (p) => setOf(p) * 2, landText: (c) => String(c), nameOf, choose, thinking, lesson: LESSON,
  roundText: (p) => (p.over ? null : p.phase === "place" ? "Placing stones" : p.goal ? `Puzzle, turn ${p.round} of ${p.goal.turns}` : `Turn ${p.round}${p.rule.limit ? ` of ${p.rule.limit}` : ""}${p.quiet >= QUIET / 2 ? `, ${(QUIET - p.quiet + 1) >> 1} quiet turns to a draw` : ""}`),
  about: {
    classic: `Traditional: the settled game.\nA hex board of 61 cells and twelve stones a side in five kinds: a set opening drawn from three (${LAYOUTS.map((l) => l.name.toLowerCase()).join(", ")}), mirrored, or free placement. Stones climb up to three high; only the top stone acts. Strike, topple and drop; trap the rival Lodestone to win, or after 40 turns each the higher count of tiers topped wins (the first player adds 1). After the first move the second player may swap sides.`,
    ours: "Capo: the quick set.\nA small board of 37 cells and nine stones a side (four Pebbles, one Slinger), a set opening drawn from three. Trap the rival Lodestone, or after 30 turns each the higher count of tiers topped wins: each stack you top counts its height, and the first player adds 2, as the second has the last move. About ten minutes.",
    custom: "Custom: your own rules.\nThe board's size, the opening, the swap, a count at a turn limit, drops, and an extra Pebble for the second player.",
  },
  choices: [{ key: "opening", label: "Opening", normal: "set", only: ["classic", "custom"], values: [["set", "A set layout, drawn from three"], ["free", "Free placement in your home rows"]] }],
  switches: [
    { key: "size", label: "Board", normal: 4, values: [[4, "61 cells, twelve stones"], [3, "37 cells, nine stones"]] },
    { key: "swap", label: "Swap after the first move", normal: true, values: [[true, "On"], [false, "Off"]] },
    { key: "limit", label: "Count at", normal: 0, values: [[0, "No limit: play to the trap"], [20, "20 turns each"], [30, "30 turns each"], [40, "40 turns each"]] },
    { key: "drops", label: "Drops", normal: true, values: [[true, "Beside your own stacks"], [false, "None"]] },
    { key: "extra", label: "Second player's pouch", normal: false, values: [[false, "Empty"], [true, "One Pebble"]] },
  ],
  stats: (p, s) => [["Pouch", p.pouch[s].reduce((a, b) => a + b, 0)], ["Lodestone", lodeOf(p, s) < 0 ? "To place" : threatened(p, s) ? "Open" : "Safe"], ...(p.rule.limit ? [["Tiers topped", countOf(p, s)]] : [])],
  line(e, p) {
    const who = NAMES[e.seat], at = (i) => nameOf(p, i), kind = (st) => KINDS[kindOf(st)];
    if (e.kind === "move") return `${who}'s ${kind(e.stone)} ${e.tier > 1 ? `climbs onto ${at(e.to)}, tier ${e.tier}` : `moves to ${at(e.to)}`}.`;
    if (e.kind === "strike") return `${who}'s ${kind(e.stone)} strikes ${NAMES[ownerOf(e.struck)]}'s ${kind(e.struck)} at ${at(e.to)}.`;
    if (e.kind === "sling") return `${who}'s Slinger at ${at(e.from)} slings ${NAMES[ownerOf(e.struck)]}'s ${kind(e.struck)} off ${at(e.to)}.`;
    if (e.kind === "topple") return `${who} topples ${NAMES[ownerOf(e.knocked)]}'s ${kind(e.knocked)} from ${at(e.to)} to ${at(e.behind)}.`;
    if (e.kind === "drop") return `${who} drops a ${kind(e.stone)} on ${at(e.to)}.`;
    if (e.kind === "place") return `${who} places a ${kind(e.stone)} on ${at(e.to)}.`;
    if (e.kind === "stop") return `${who} stops placing${e.kept ? `; ${e.kept} wait in the pouch` : ""}.`;
    if (e.kind === "begin") return "Every stone is down: play begins.";
    if (e.kind === "swap") return `${who} swaps sides and takes the stones that moved first.`;
    if (e.kind === "threat") return `${NAMES[e.seat]}'s Lodestone is open to a strike.`;
    return "";
  },
  order: (events) => events.flatMap((e) => (e.to >= 0 ? [e.to] : [])),
  ending(T) {
    const r = T.match.result, k = puzzleOf(T);
    if (k >= 0) return r.winners.length === 1 && T.kinds[r.winners[0]] === "you" ? "Solved: the rival Lodestone is trapped." : `Not solved: ${r.why}.`;
    if (r.winners.length > 1) return `A draw: ${r.why}.`;
    const w = r.winners[0];
    return `${T.solo() && T.kinds[w] === "you" ? "You win" : `${NAMES[w]} wins`}: ${r.why}.`;
  },
  summary: (T) => { const n = T.match.list.length, t = (n + 1) >> 1; return `After ${n} move${n === 1 ? "" : "s"}, ${t} turn${t === 1 ? "" : "s"} each.`; },
  // a puzzle solved is kept, and the next one offered
  seen(T, events) { const k = puzzleOf(T), end = events.find((e) => e.kind === "end"); if (k >= 0 && end?.winners.length === 1 && T.kinds[end.winners[0]] === "you") keep(SOLVED, [...new Set([...solved(), String(k)])].join(",")); },
  next(T) { const k = puzzleOf(T); return k >= 0 ? { label: k + 1 < PUZZLES.length ? "Next puzzle" : "Puzzles again", go: () => puzzle(T, (k + 1) % PUZZLES.length) } : null; },
  more: { label: "Puzzles", body: puzzles },
  report: review,
  board: (T, stage) => { document.body.classList.remove("atlas"); return stackBoard(T, stage, { tap: (i) => tap(T, i), seen: () => (T.match && !T.demo ? looked(T) : -1) }); /* the game behind the title shows no tower chip */ },
  panel,
  changed: (T) => { from = null; pick = null; seen = -1; if (!T.demo && T.match) tower(T); },
  fresh: () => { from = null; pick = null; seen = -1; told = null; },
  listing: (T) => { const p = T.match.position; return { head: ["Cell", "Top first"], rows: p.cells.flatMap((c, i) => (c.length ? [[nameOf(p, i), [...c].reverse().map(say).join(", ")]] : [])) }; },
  keys(T, k, e) {
    if (k === "escape") { from = null; pick = null; T.refresh(); } else if (k === "enter" && !(document.activeElement instanceof HTMLButtonElement && document.activeElement.id !== "do")) { e.preventDefault(); $("do").click(); }
    else if (k === "h" && !$("hint").hidden && !$("hint").disabled) hint(T);
  },
  rules: () => [
    "Two players. Traditional: a board of 61 hexes and twelve stones each (a Lodestone, a Warden, two Couriers, two Slingers and six Pebbles). Capo, the quick set: 37 hexes and nine stones each (one Slinger and four Pebbles). Each side starts in its three nearest rows, in one of three set layouts.",
    "Free placement (Traditional and Custom): in turn, each places a stone on an empty cell in their home rows, the Lodestone first. After eight a player may stop; the rest wait in the pouch. A stone may not be put down where it would strike a Lodestone.",
    "Stones stack up to three high. Only the top stone of a stack acts. A stone climbs one tier at a time: it may move onto a stack no taller than the tier it stands on.",
    "Lodestone (a ring and a dot; a low dome on the table): one step any way. It may stand no higher than tier 2, and nothing may stand on it.",
    "Warden (a square; a broad block): one step. It never climbs, nothing climbs it, and it cannot be toppled.",
    "Courier (two bars; a cone): slides up to 2 cells in a straight line, one more for each tier above the first. It stops at the first stone in its way, and may climb it or strike it.",
    "Slinger (an arrow; a forked top): steps one, or stays where it is and strikes the first stone in a line within 2 cells, one more for each tier above the first.",
    "Pebble (a chevron; a small round): one step to either forward cell, and strikes the same way.",
    "Strike: take a rival top stone no more than one tier above your stone. It goes to your pouch as yours. A stepping stone takes its place; a Slinger stays put.",
    "Topple: a stone beside a rival stack no taller than its own tier knocks that stack's top stone to the cell straight behind it.",
    "Drop: instead of moving, put a stone from your pouch on an empty cell beside one of your own stacks, never beside the rival Lodestone.",
    "You may never leave your own Lodestone open to a strike. A player with no legal move loses: trap the rival Lodestone to win.",
    `After 40 turns each in Traditional, 30 in Capo, the higher count of tiers topped wins: each stack whose top stone is yours counts its height. The first player adds 1 in Traditional and 2 in Capo, since the second player has the last move; a tie goes to the side holding more stones (on the board and in the pouch). After the first move, the second player may swap sides and play the stones that moved. ${QUIET / 2} turns each without a strike or a topple, or 200 turns each, is a draw.`,
    "Reading the board: on the lit table each stone carries one, two or three notches for its tier, and only the top stone shows its kind; on the flat board the top stone shows its mark and pips count the height. The tower chip in the board's corner and the tower strip in the move panel list the stack you last touched, top first.",
    "Help: Hint (or the H key) shows the normal bot's choice and why. At the end, Review the game marks your three costliest moves and any missed trap. Puzzles are in the menu.",
    "Keys: Tab and arrows choose, Enter acts, Escape lets go, H asks for a hint, U takes back.",
    "This is an early version.",
  ],
});
