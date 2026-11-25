// SPDX-License-Identifier: AGPL-3.0-or-later
// The game screen: the board fills the page, panels float over it. Everything can also be done from the panels alone.
import { Refusal, chance, createMatch, openSave, seedState } from "../src/core/index.js";
import { NONE, boardOf, cellsOf, goalOf, growth, inch, poolLimit } from "../src/games/inch/rules.js";
import { choose, thinking } from "../src/games/inch/bot.js";
import { LOOKS, canDraw, createBoard, emblem } from "../src/map/board.js";
import { footer } from "./footer.js";

const $ = (id) => document.getElementById(id), KEY = "capo-inch-2", LOOK = "capo-inch-look";
const NAMES = ["Azure", "Rust", "Moss"], RGB = [[91, 143, 196], [208, 106, 75], [138, 168, 81]], PAPER = [[231, 217, 185], [228, 213, 180], [234, 221, 191]], HILL = [201, 178, 140];
const KINDS = [["you", "A person"], ["normal", "Bot"], ["easy", "Easy bot"]], SHARES = [["third", "A third"], ["half", "Half"], ["all", "All"]];
$("broken").remove();

let match = null, kinds = [], log = [], land = [], board = null, rough = [], run = 0, target = null, share = "half", setup = { seats: 2, rounds: 16, who: ["you", "normal", "normal"] }, demo = true, busy = false;

const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const cells = (n) => `${n} ${n === 1 ? "cell" : "cells"}`;
const place = (to) => (to === NONE ? "empty land" : NAMES[to]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* files still work */ } };
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const human = () => match && match.turn !== null && kinds[match.turn] === "you";
const solo = () => kinds.filter((k) => k === "you").length === 1;

function sign(seat) {
  const c = el("canvas"), x = c.getContext("2d");
  c.width = c.height = 64;
  x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fillStyle = `rgb(${RGB[seat]})`; x.fill(); x.lineWidth = 3; x.strokeStyle = "rgba(20,15,12,.75)"; x.stroke();
  emblem(x, seat, 32, 32, 36); x.fillStyle = "#fdf6e4"; x.fill();
  return c;
}

/* ---------- the board ---------- */
function makeBoard(p) {
  board?.destroy();
  board = null;
  $("stage").replaceChildren();
  rough = p.cost.map((c) => c === 2);
  const ground = (i) => (rough[i] ? HILL : PAPER[(i * 7 + (i >> 2)) % 3]), lookNow = read(LOOK), wide = innerWidth > 820;
  if (canDraw()) {
    try {
      board = createBoard($("stage"), { cells: boardOf().cells, rough, seats: RGB, ground, look: LOOKS[lookNow] ? lookNow : wide ? "relief" : "flat" });
      board.on("pick", (i) => { if (i >= 0) aim(i, true); });
      board.on("hover", (i) => hover(i));
      board.on("lost", () => { board = null; picture(); });
    } catch { board = null; }
  }
  $("look").hidden = !board;
  place2();
}
/** Keep the board clear of the panels. */
function place2() {
  if (!board) return;
  const wide = innerWidth > 820, r = (id) => $(id).getBoundingClientRect();
  if (demo) board.layout(wide ? { left: Math.min(520, innerWidth * 0.34), right: 0, top: 20, bottom: 20 } : { left: 0, right: 0, top: 10, bottom: innerHeight * 0.5 });
  else if (wide) board.layout({ left: 232, right: innerWidth > 1180 ? 262 : 30, top: 86, bottom: innerWidth > 1180 ? 6 : 150 });
  else { document.body.style.setProperty("--act", `${innerHeight - r("act").top}px`); board.layout({ left: 0, right: 0, top: r("seats").bottom + 2, bottom: innerHeight - r("act").top + 34 }); }
}
/** A still, tappable picture for devices that cannot draw the moving board. */
function picture() {
  if (board) return;
  const ns = "http://www.w3.org/2000/svg", b = boardOf(), p = match.position, S = 30, W = Math.sqrt(3) * S, make = (t, at) => { const e = document.createElementNS(ns, t); for (const [k, v] of Object.entries(at)) e.setAttribute(k, v); return e; };
  const svg = make("svg", { viewBox: `${-W * 8} ${-S * 10} ${W * 16} ${S * 20}` });
  b.cells.forEach(([q, r], i) => {
    const x = W * (q + r / 2), y = S * 1.5 * r, o = p.owner[i];
    const g = make("polygon", { points: [0, 1, 2, 3, 4, 5].map((k) => { const a = (Math.PI / 180) * (60 * k - 90); return `${x + S * Math.cos(a)},${y + S * Math.sin(a)}`; }).join(" "), fill: `rgb(${o === NONE ? PAPER[i % 3] : RGB[o]})`, stroke: "#12171a", "stroke-width": 2 });
    g.addEventListener("click", () => aim(i, true));
    svg.append(g);
    if (p.cost[i] === 2) svg.append(make("circle", { cx: x, cy: y + 17, r: 3, fill: "#3a3128", "pointer-events": "none" }));
    if (o !== NONE) { const t = make("text", { x, y: y + 6, "text-anchor": "middle", "font-size": 17, "font-weight": 700, fill: "#12171a", "pointer-events": "none" }); t.textContent = p.home[o] === i ? `${o + 1}⌂` : o + 1; svg.append(t); }
  });
  $("stage").replaceChildren(svg);
}
function paint(order, quick) {
  const p = match.position;
  if (!board) { picture(); return 0; }
  return board.show(p.owner, { homes: p.home, counts: p.pool, now: match.turn ?? -1, order, quick });
}

/* ---------- aiming ---------- */
const offers = () => (human() && !busy ? match.legal().filter((m) => m.do === "pour") : []);
const offer = (to, s) => offers().find((m) => m.to === to && m.share === s);
const outcome = (m) => inch.apply(match.position, m).events[0];
function aim(i, loud) {
  if (demo || !human() || busy) return;
  const o = match.position.owner[i];
  if (o === match.turn) { if (loud) toast("That land is already yours."); return; }
  if (!offers().some((m) => m.to === o)) { if (loud) toast(offers().length ? `Nothing you can take there yet. ${o === NONE ? "" : `${NAMES[o]} is too strong, or too far.`}` : "You cannot take anything yet. Wait and grow."); return; }
  target = o;
  panel();
}
function hover(i) {
  if (!board) return;
  const p = match?.position;
  board.setCursor(!demo && human() && !busy && i >= 0 && p.owner[i] !== match.turn && offers().some((m) => m.to === p.owner[i]));
}
function radio(host, items, chosen, pick) {
  const had = host.contains(document.activeElement);
  host.replaceChildren(...items.map(({ value, label, note, rgb, off }) => {
    const b = el("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(value === chosen));
    b.tabIndex = value === chosen ? 0 : -1;
    b.disabled = !!off;
    if (rgb) { const d = el("i", undefined, "dot"); d.style.background = `rgb(${rgb})`; b.append(d); }
    b.append(label);
    if (note) b.append(el("small", note));
    b.onclick = () => pick(value);
    return b;
  }));
  host.onkeydown = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const on = items.filter((x) => !x.off), at = on.findIndex((x) => x.value === chosen);
    if (on.length) pick(on[(at + step + on.length) % on.length].value);
  };
  if (had) host.querySelector("[aria-checked=true]")?.focus();
}

/** The move panel, the preview on the board, and the pour button. */
function panel() {
  const p = match.position, over = match.turn === null, me = human() && !busy;
  $("choice").hidden = !me;
  $("after").hidden = !over;
  if (over) { $("status").textContent = ending(); board?.preview([]); return; }
  if (!me) { $("status").textContent = `${NAMES[p.seat]} is thinking`; board?.preview([]); return; }
  const list = offers(), targets = [...new Set(list.map((m) => m.to))];
  $("status").textContent = solo() ? (list.length ? "Where will your ink run?" : "Nothing in reach. Wait and grow.") : `${NAMES[p.seat]}, your move`;
  if (!targets.includes(target)) target = targets.includes(NONE) ? NONE : targets[0] ?? null;
  const shares = SHARES.filter(([s]) => offer(target, s)).map(([s]) => s);
  if (!shares.includes(share) && shares.length) share = shares.includes("half") ? "half" : shares[shares.length - 1];
  $("targets").hidden = $("shares").hidden = !list.length;
  radio($("targets"), targets.map((t) => { const e = outcome(list.filter((m) => m.to === t)[0]); return { value: t, label: t === NONE ? "Empty land" : NAMES[t], note: `up to ${cells(e.taken.length)}`, rgb: t === NONE ? PAPER[0] : RGB[t] }; }), target, (v) => { target = v; panel(); });
  radio($("shares"), SHARES.map(([s, label]) => { const m = offer(target, s); return { value: s, label, note: m ? `takes ${outcome(m).taken.length}` : "takes none", off: !m }; }), share, (v) => { share = v; panel(); });
  const m = offer(target, share), e = m && outcome(m);
  $("pour").disabled = !m;
  $("pour").textContent = m ? `Pour ${e.spent}, take ${e.taken.length}` : "Pour";
  board?.preview(e ? e.taken : []);
}

/* ---------- words and score ---------- */
function line(e) {
  const who = NAMES[e.seat];
  if (e.kind === "pour") return `${who} pours ${e.spent} over ${place(e.to)} and takes ${cells(e.taken.length)}.`;
  if (e.kind === "wait") return `${who} waits.`;
  if (e.kind === "cut") return `${who} loses ${cells(e.cells.length)} cut off from home.`;
  if (e.kind === "home") return e.to === NONE ? `${who} has no land left.` : `${who}'s home falls to ${NAMES[e.by]} and moves.`;
  return "";
}
function ending() {
  const r = match.result;
  if (r.winners.length > 1) return `${r.winners.map((s) => NAMES[s]).join(" and ")} tie. They ${r.why}.`;
  const w = r.winners[0];
  return solo() && kinds[w] === "you" ? "The map is yours." : `${NAMES[w]} wins the map.`;
}
let hush = 0;
function toast(t) { const b = $("toast"); b.textContent = t; b.classList.add("on"); clearTimeout(hush); hush = setTimeout(() => b.classList.remove("on"), 2600); }

function score() {
  const p = match.position, goal = goalOf(p), n = p.owner.length, over = match.turn === null;
  $("round").textContent = over ? "The last drop" : `Round ${p.round} of ${p.rounds}`;
  $("fills").replaceChildren(...p.pool.map((_, s) => { const i = el("i"); i.style.width = `${(100 * cellsOf(p, s)) / n}%`; i.style.background = `rgb(${RGB[s]})`; return i; }));
  $("goal").style.left = `${(100 * goal) / n}%`;
  $("land").setAttribute("aria-label", `${p.pool.map((_, s) => `${NAMES[s]} ${cellsOf(p, s)}`).join(", ")}. The goal is ${goal} of ${n}.`);
  $("seats").replaceChildren(...p.pool.map((x, s) => {
    const li = el("li", undefined, `seat${s === match.turn ? " now" : ""}${p.home[s] === NONE ? " out" : ""}`), dl = el("dl"), c = cellsOf(p, s);
    for (const [k, v] of [["Land", innerWidth > 820 || p.pool.length < 3 ? `${c}/${goal}` : c], ["Strength", x], ["Grows", p.home[s] === NONE ? "out" : `+${Math.max(0, Math.min(growth(c, x), poolLimit(c) - x))}`]]) { const d = el("div"); d.append(el("dt", k), el("dd", String(v))); dl.append(d); }
    li.append(sign(s), el("b", NAMES[s]), el("small", kinds[s] === "you" ? (solo() ? "You" : "A person") : kinds[s] === "easy" ? "Easy bot" : "Bot"), dl);
    return li;
  }));
}
const tally = () => { const p = match.position; land.push(p.pool.map((_, s) => cellsOf(p, s))); };

/* ---------- playing ---------- */
const keep = () => { if (!demo) store(KEY, match.turn === null ? null : JSON.stringify({ save: match.save(), kinds })); };
async function play(move) {
  const mine = run;
  busy = true;
  const events = match.play(move), pour = events.find((e) => e.kind === "pour");
  for (const e of events) { const t = line(e); if (t) { log.push(t); } }
  tally();
  keep();
  if (!demo) { score(); panel(); }
  const took = paint([...(pour ? pour.taken : []), ...events.filter((e) => e.kind === "cut").flatMap((e) => e.cells)], false);
  if (!demo) { const t = events.map(line).filter(Boolean); if (t.length) toast(t.slice(0, 2).join(" ")); }
  await sleep(Math.max(demo ? 900 : 300, took + 120));
  if (mine !== run) return;
  busy = false;
  if (!demo) { score(); panel(); if (match.turn === null) finish(); }
  next();
}
async function next() {
  const mine = run;
  if (match.turn === null) { if (demo) { await sleep(2500); if (mine === run && demo) attract(); } return; }
  if (human()) return;
  busy = true;
  if (!demo) panel();
  const dice = chance(seedState(`${match.seed}/${match.list.length}`)), from = performance.now();
  let move;
  if (demo) move = choose(match.position, dice, "easy");
  else {
    const t = thinking(match.position, dice, kinds[match.turn]);
    let slice = performance.now();
    for (;;) {
      const s = t.next();
      if (s.done) { move = s.value; break; }
      if (performance.now() - slice > 7) { await sleep(0); if (mine !== run) return; slice = performance.now(); }
    }
    await sleep(Math.max(0, 650 - (performance.now() - from)));
  }
  if (mine === run) play(move);
}
function begin(m, k, words = []) {
  run++;
  demo = false; busy = false;
  match = m; kinds = k; log = words; land = []; target = null;
  const again = createMatch(inch, { seed: m.seed, options: m.options });
  land.push(again.position.pool.map((_, s) => cellsOf(again.position, s)));
  for (const mv of m.list) { for (const e of again.play(mv)) { const t = line(e); if (t) log.push(t); } land.push(again.position.pool.map((_, s) => cellsOf(again.position, s))); }
  document.body.classList.remove("menu");
  $("title").hidden = true;
  for (const id of ["bar", "seats", "act"]) $(id).hidden = false;
  makeBoard(m.position);
  score();
  panel();
  place2();
  paint([], true);
  keep();
  next();
}
function attract() {
  run++;
  demo = true; busy = false;
  kinds = ["easy", "easy", "easy"]; log = []; land = [];
  match = createMatch(inch, { seed: "title " + (run % 9), options: { seats: 3 } });
  makeBoard(match.position);
  paint([], true);
  next();
}
function home() {
  closeSheet();
  document.body.classList.add("menu");
  $("title").hidden = false;
  for (const id of ["bar", "seats", "act"]) $(id).hidden = true;
  $("toast").classList.remove("on");
  resumeButton();
  attract();
}
function finish() {
  const body = el("div"), c = el("canvas");
  c.id = "chart"; c.width = 880; c.height = 240;
  const x = c.getContext("2d"), n = match.position.owner.length, W = c.width, H = c.height;
  let base = land.map(() => 0);
  land[0].forEach((_, s) => {
    const up = land.map((l, i) => base[i] + l[s]), px = (i) => (land.length < 2 ? 0 : (i / (land.length - 1)) * W), py = (v) => H - (v / n) * H;
    x.beginPath(); up.forEach((v, i) => (i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v)))); for (let i = land.length - 1; i >= 0; i--) x.lineTo(px(i), py(base[i])); x.closePath();
    x.fillStyle = `rgb(${RGB[s]})`; x.fill(); x.strokeStyle = "#12171a"; x.lineWidth = 2; x.stroke();
    base = up;
  });
  c.setAttribute("role", "img"); c.setAttribute("aria-label", "Land held over the game");
  const r = match.result;
  body.append(el("p", r.winners.length > 1 ? `They ${r.why}.` : `${NAMES[r.winners[0]]} ${r.why}, in ${match.position.round > match.position.rounds ? match.position.rounds : match.position.round} rounds.`), c, el("p", match.position.pool.map((_, s) => `${NAMES[s]} ${cellsOf(match.position, s)}`).join(", ") + ` of ${n} cells.`));
  const row = el("div", undefined, "stack"), again = el("button", "Play again", "main");
  again.type = "button"; again.onclick = () => { closeSheet(); restart(); };
  row.append(again); body.append(row);
  sheet(ending(), body, "See the board");
}
const seed = () => [...crypto.getRandomValues(new Uint32Array(2))].map((v) => v.toString(36)).join("");
const restart = () => begin(createMatch(inch, { seed: seed(), options: match.options }), [...kinds]);

function undo() {
  run++;
  busy = false;
  do { if (!match.undo()) break; } while (!human());
  begin(match, kinds);
}
function save() {
  const a = el("a");
  a.href = URL.createObjectURL(new Blob([match.save()], { type: "application/json" }));
  a.download = `an-inch-of-ink-${match.list.length}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- sheets ---------- */
function sheet(title, body, close = "Close") { $("sheet-title").textContent = title; $("sheet-body").replaceChildren(body); $("sheet-close").textContent = close; $("sheet-close").className = close === "Close" ? "main" : "quiet"; if (!$("sheet").open) $("sheet").showModal(); }
const closeSheet = () => { if ($("sheet").open) $("sheet").close(); };
function rules() {
  const u = el("ul");
  for (const t of ["Your strength is one pool. The number on your tower shows it. It grows every turn: land grows it, and saving a little more.", "Tap empty land or a rival, choose how much to pour, and the cells you would take light up. What is left comes back to you.", "Hills cost 2, other ground 1. A cell with four of yours around it costs half.", "A rival's land costs more when they hold a lot of strength on little land. A home costs 3 more.", "Land cut off from your tower falls at the start of your turn. If your tower is taken, it moves to your largest piece of land.", "Reach the gold mark on the bar to win, or hold the most land after the last round. Whoever moves first changes every round.", "Keys: 1, 2, 3 choose how much, Tab and arrows choose where, Enter pours, W waits, U takes back."]) u.append(el("li", t));
  sheet("How to play", u);
}
function menu() {
  const box = el("div", undefined, "stack"), add = (t, f) => { const b = el("button", t, "quiet"); b.type = "button"; b.onclick = () => { closeSheet(); f(); }; box.append(b); return b; };
  add("How to play", rules);
  add("What happened so far", () => { const o = el("ol"); o.id = "log"; o.reversed = true; o.append(...log.slice().reverse().map((t) => el("li", t))); sheet("What happened", log.length ? o : el("p", "Nothing yet.")); });
  add("Take back your last move", undo).disabled = !match.list.length || !kinds.includes("you");
  add("Save to a file", save);
  add("Start again with the same players", restart);
  add("Leave to the title", home);
  sheet("An Inch of Ink", box);
}

/* ---------- title ---------- */
function titleCard() {
  radio($("count"), [2, 3].map((n) => ({ value: n, label: String(n) })), setup.seats, (v) => { setup.seats = v; titleCard(); });
  radio($("length"), [[10, "Short"], [16, "Normal"], [20, "Long"]].map(([value, label]) => ({ value, label })), setup.rounds, (v) => { setup.rounds = v; titleCard(); });
  $("who").replaceChildren(...Array.from({ length: setup.seats }, (_, s) => {
    const li = el("li"), k = el("select");
    k.append(...KINDS.map(([v, t]) => new Option(t, v)));
    k.value = setup.who[s];
    k.setAttribute("aria-label", NAMES[s]);
    k.onchange = () => { setup.who[s] = k.value; };
    li.append(sign(s), el("b", NAMES[s]), k);
    return li;
  }));
}
function kept() {
  try {
    const s = JSON.parse(read(KEY) || "null");
    if (!s) return null;
    const { match: m } = openSave(s.save, [inch]);
    return Array.isArray(s.kinds) && s.kinds.length === m.position.pool.length && s.kinds.every((k) => KINDS.some(([v]) => v === k)) ? { m, kinds: s.kinds } : null;
  } catch { return null; }
}
const resumeButton = () => { const k = kept(); $("resume").hidden = !k; if (k) $("resume").textContent = `Continue, round ${k.m.position.round}`; };

$("start").onclick = () => begin(createMatch(inch, { seed: seed(), options: { seats: setup.seats, rounds: setup.rounds } }), setup.who.slice(0, setup.seats));
$("resume").onclick = () => { const k = kept(); if (k) begin(k.m, k.kinds); };
$("pour").onclick = () => { const m = offer(target, share); if (m) play(m); };
$("wait").onclick = () => { if (human() && !busy) play({ do: "wait" }); };
$("menu").onclick = menu;
$("how").onclick = rules;
$("review").onclick = () => { $("act").hidden = true; toast("Open the menu to start again."); };
$("again").onclick = restart;
$("sheet-close").onclick = closeSheet;
$("sheet").onclick = (e) => { if (e.target === $("sheet")) closeSheet(); };
$("look").onclick = () => {
  if (!board) return;
  const all = Object.keys(LOOKS), nextLook = all[(all.indexOf(board.look) + 1) % all.length];
  store(LOOK, nextLook);
  board.setLook(nextLook);
  toast(LOOKS[nextLook].name);
};
$("open").onclick = () => $("file").click();
$("file").onchange = async () => {
  const f = $("file").files[0];
  $("file").value = "";
  if (!f) return;
  try {
    const { match: m, warning } = openSave(await f.text(), [inch]);
    begin(m, m.position.pool.map((_, i) => (i ? "normal" : "you")));
    if (warning) sheet("Opened with a warning", el("p", warning));
  } catch (e) {
    if (!(e instanceof Refusal)) throw e;
    sheet("That file was not opened", el("p", `${e.message[0].toUpperCase()}${e.message.slice(1)}.`));
  }
};
addEventListener("keydown", (e) => {
  if (demo || $("sheet").open || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "u" && match.list.length && kinds.includes("you")) undo();
  if (!human() || busy) return;
  if (["1", "2", "3"].includes(k)) { const s = SHARES[Number(k) - 1][0]; if (offer(target, s)) { share = s; panel(); } }
  else if (k === "w") play({ do: "wait" });
  else if (k === "enter" && !(document.activeElement instanceof HTMLButtonElement && document.activeElement.id !== "pour")) { e.preventDefault(); $("pour").click(); }
});
addEventListener("resize", () => { place2(); });

footer();
titleCard();
resumeButton();
attract();
