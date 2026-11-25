// SPDX-License-Identifier: AGPL-3.0-or-later
// What every table game's screen shares: title, seats, score bar, words, taking back, saving, bots' turns and the end.
// A game gives its rules, its board and its own move panel.
import { Refusal, chance, createMatch, openSave, seedState } from "../src/core/index.js";
import { emblem } from "../src/map/board.js";
import { footer } from "./footer.js";

export const NAMES = ["Azure", "Rust", "Moss", "Plum"], RGB = [[91, 143, 196], [208, 106, 75], [138, 168, 81], [160, 108, 182]], PAPER = [[231, 217, 185], [228, 213, 180], [234, 221, 191]];
export const $ = (id) => document.getElementById(id);
export const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KINDS = [["you", "A person"], ["normal", "Bot"], ["easy", "Easy bot"]];
const store = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* files still work */ } };
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export function sign(seat) {
  const c = el("canvas"), x = c.getContext("2d");
  c.width = c.height = 64;
  x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fillStyle = `rgb(${RGB[seat]})`; x.fill(); x.lineWidth = 3; x.strokeStyle = "rgba(20,15,12,.75)"; x.stroke();
  emblem(x, seat, 32, 32, 36); x.fillStyle = "#fdf6e4"; x.fill();
  return c;
}
/** A row of choices that acts as one control: arrows move, the chosen one is marked. */
export function radio(host, items, chosen, pick) {
  const had = host.contains(document.activeElement), left = host.scrollLeft;
  host.replaceChildren(...items.map(({ value, label, note, rgb, off }) => {
    const b = el("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(value === chosen));
    b.tabIndex = value === chosen || (chosen === null && value === items[0].value) ? 0 : -1;
    b.disabled = !!off;
    if (rgb) { const d = el("i", undefined, "dot"); d.style.background = `rgb(${rgb})`; b.append(d); }
    b.append(label);
    if (note) b.append(el("small", note));
    b.onclick = () => pick(value);
    return b;
  }));
  host.scrollLeft = left;
  host.onkeydown = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const on = items.filter((x) => !x.off), at = on.findIndex((x) => x.value === chosen);
    if (on.length) pick(on[(at + step + on.length) % on.length].value);
  };
  if (had) host.querySelector("[aria-checked=true]")?.focus();
}
let hush = 0;
export function toast(t) { const b = $("toast"); b.textContent = t; b.classList.add("on"); clearTimeout(hush); hush = setTimeout(() => b.classList.remove("on"), 2800); }
export function sheet(title, body, close = "Close") {
  $("sheet-title").textContent = title;
  $("sheet-body").replaceChildren(body);
  $("sheet-close").textContent = close;
  $("sheet-close").className = close === "Close" ? "main" : "quiet";
  if (!$("sheet").open) $("sheet").showModal();
}
const closeSheet = () => { if ($("sheet").open) $("sheet").close(); };

/**
 * G: game, key, title, cellsOf, landOf, goalOf, stats(p, seat), line(event, p), about[style], rules(classic), pace(p), thinking, choose,
 *    board(T) -> { show(order, quick) -> ms, layout(free), setLook(name), look, looks, destroy(), clear() },
 *    panel(T), tapped(T, cell), key(T, key, event), changed(T) when a new position arrives.
 */
export function createTable(G) {
  $("broken")?.remove();
  const KEY = `capo-${G.key}-2`, LOOK = `capo-${G.key}-look`, many = G.seats || [2, 3], setup = { seats: G.normal || 2, style: "classic", rounds: G.lengths[1]?.[0], who: ["you", "normal", "normal", "normal"] };
  let log = [], land = [], board = null, run = 0;
  const T = {
    match: null, kinds: [], demo: true, busy: false, RGB, NAMES, read: () => read(LOOK),
    get board() { return board; },
    human: () => !!T.match && T.match.turn !== null && T.kinds[T.match.turn] === "you",
    ready: () => !T.demo && T.human() && !T.busy,
    solo: () => T.kinds.filter((k) => k === "you").length === 1,
    play, refresh: panel,
  };
  const place = () => {
    if (!board) return;
    const wide = innerWidth > 820, r = (id) => $(id).getBoundingClientRect();
    if (T.demo) board.layout(wide ? { left: Math.min(innerWidth / 2, $("title").querySelector(".card").getBoundingClientRect().right), right: 0, top: 20, bottom: 20 } : { left: 0, right: 0, top: 10, bottom: innerHeight * 0.5 });
    else if (wide) board.layout({ left: 232, right: innerWidth > 1180 ? 262 : 30, top: 86, bottom: innerWidth > 1180 ? 6 : 150 });
    else { document.body.style.setProperty("--act", `${innerHeight - r("act").top}px`); board.layout({ left: 0, right: 0, top: r("seats").bottom + 2, bottom: innerHeight - r("act").top + 34 }); }
  };
  function makeBoard() {
    board?.destroy();
    $("stage").replaceChildren();
    board = G.board(T, $("stage"));
    $("look").hidden = !board.looks.length;
    place();
  }
  function ending() {
    const r = T.match.result;
    if (r.winners.length > 1) return `${r.winners.map((s) => NAMES[s]).join(" and ")} tie. They ${r.why}.`;
    return T.solo() && T.kinds[r.winners[0]] === "you" ? G.won : `${NAMES[r.winners[0]]} wins.`;
  }
  function panel() {
    const over = T.match.turn === null, me = T.human() && !T.busy;
    $("choice").hidden = !me;
    $("after").hidden = !over;
    if (over) { $("status").textContent = ending(); board.clear(); } else if (!me) {
      $("status").textContent = T.human() ? "" : `${NAMES[T.match.position.seat]} is thinking`;
      board.clear();
    } else G.panel(T);
  }
  function score() {
    const p = T.match.position, goal = G.goalOf(p), n = G.landOf(p), seats = T.kinds.length, over = T.match.turn === null;
    $("round").textContent = over ? "The end" : p.classic ? `Round ${p.round}` : `Round ${p.round} of ${p.rounds}`;
    $("fills").replaceChildren(...Array.from({ length: seats }, (_, s) => { const i = el("i"); i.style.width = `${(100 * G.cellsOf(p, s)) / n}%`; i.style.background = `rgb(${RGB[s]})`; return i; }));
    $("goal").style.left = `${(100 * goal) / n}%`;
    $("land").setAttribute("aria-label", `${Array.from({ length: seats }, (_, s) => `${NAMES[s]} ${G.cellsOf(p, s)}`).join(", ")}. The goal is ${goal} of ${n}.`);
    $("seats").replaceChildren(...Array.from({ length: seats }, (_, s) => {
      const c = G.cellsOf(p, s), li = el("li", undefined, `seat${s === T.match.turn ? " now" : ""}${c ? "" : " out"}`), dl = el("dl");
      for (const [k, v] of [["Land", innerWidth > 820 || seats < 3 ? `${c}/${goal}` : c], ...G.stats(p, s)]) { const d = el("div"); d.append(el("dt", k), el("dd", String(v))); dl.append(d); }
      li.append(sign(s), el("b", NAMES[s]), el("small", T.kinds[s] === "you" ? (T.solo() ? "You" : "A person") : T.kinds[s] === "easy" ? "Easy bot" : "Bot"), dl);
      return li;
    }));
  }
  const tally = (p) => Array.from({ length: T.kinds.length }, (_, s) => G.cellsOf(p, s));
  const keep = () => { if (!T.demo) store(KEY, T.match.turn === null ? null : JSON.stringify({ save: T.match.save(), kinds: T.kinds })); };

  async function play(move) {
    const mine = run, seat = T.match.turn, person = T.human();
    T.busy = true;
    const events = T.match.play(move), words = events.map((e) => G.line(e, T.match.position)).filter(Boolean);
    log.push(...words);
    land.push(tally(T.match.position));
    keep();
    if (!T.demo) { score(); panel(); }
    G.seen?.(T, events);
    const took = board.show(G.order(events), false);
    if (!T.demo && words.length && (!person || T.match.turn !== seat)) toast(words.slice(0, 2).join(" "));
    await sleep(T.demo ? Math.max(G.pace(T.match.position), took + 120) : Math.max(160, took + 60));
    if (mine !== run) return;
    T.busy = false;
    G.changed?.(T);
    if (!T.demo) { score(); panel(); if (T.match.turn === null) finish(); }
    next();
  }
  async function next() {
    const mine = run;
    if (T.match.turn === null) { if (T.demo) { await sleep(2500); if (mine === run && T.demo) attract(); } return; }
    if (T.human()) return;
    T.busy = true;
    if (!T.demo) panel();
    const dice = chance(seedState(`${T.match.seed}/${T.match.list.length}`)), from = performance.now();
    let move;
    if (T.demo) move = G.choose(T.match.position, dice, "easy");
    else {
      const t = G.thinking(T.match.position, dice, T.kinds[T.match.turn]);
      for (let slice = performance.now(); ;) {
        const s = t.next();
        if (s.done) { move = s.value; break; }
        if (performance.now() - slice > 7) { await sleep(0); if (mine !== run) return; slice = performance.now(); }
      }
      await sleep(Math.max(0, G.pace(T.match.position) - (performance.now() - from)));
    }
    if (mine === run) play(move);
  }
  function begin(m, k) {
    run++;
    Object.assign(T, { demo: false, busy: false, match: m, kinds: k });
    G.fresh?.(T);
    log = []; land = [];
    const again = createMatch(G.game, { seed: m.seed, options: m.options });
    land.push(tally(again.position));
    for (const mv of m.list) { log.push(...again.play(mv).map((e) => G.line(e, again.position)).filter(Boolean)); land.push(tally(again.position)); }
    document.body.classList.remove("menu");
    $("title").hidden = true;
    for (const id of ["bar", "seats", "act"]) $(id).hidden = false;
    G.changed?.(T);
    makeBoard();
    score(); panel(); place();
    board.show([], true);
    keep();
    next();
  }
  function attract() {
    run++;
    Object.assign(T, { demo: true, busy: false, kinds: Array(Math.max(...many)).fill("easy"), match: createMatch(G.game, { seed: "title " + (run % 9), options: { seats: Math.max(...many), style: setup.style } }) });
    G.changed?.(T);
    makeBoard();
    board.show([], true);
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
    const body = el("div"), c = el("canvas"), n = G.landOf(T.match.position), r = T.match.result, p = T.match.position;
    c.id = "chart"; c.width = 880; c.height = 240;
    const x = c.getContext("2d"), px = (i) => (land.length < 2 ? 0 : (i / (land.length - 1)) * c.width), py = (v) => c.height - (v / n) * c.height;
    let base = land.map(() => 0);
    land[0].forEach((_, s) => {
      const up = land.map((l, i) => base[i] + l[s]);
      x.beginPath(); up.forEach((v, i) => (i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v)))); for (let i = land.length - 1; i >= 0; i--) x.lineTo(px(i), py(base[i])); x.closePath();
      x.fillStyle = `rgb(${RGB[s]})`; x.fill(); x.strokeStyle = "#12171a"; x.lineWidth = 2; x.stroke();
      base = up;
    });
    c.setAttribute("role", "img"); c.setAttribute("aria-label", "Land held over the game");
    body.append(el("p", r.winners.length > 1 ? `They ${r.why}.` : `${NAMES[r.winners[0]]}: ${r.why}, in ${Math.min(p.round, p.rounds)} rounds.`), c, el("p", `${tally(p).map((v, s) => `${NAMES[s]} ${v}`).join(", ")} of ${n} cells.`));
    const row = el("div", undefined, "stack"), again = el("button", "Play again", "main");
    again.type = "button"; again.onclick = () => { closeSheet(); restart(); };
    row.append(again); body.append(row);
    sheet(ending(), body, "See the board");
  }
  const seed = () => [...crypto.getRandomValues(new Uint32Array(2))].map((v) => v.toString(36)).join("");
  const restart = () => begin(createMatch(G.game, { seed: seed(), options: T.match.options }), [...T.kinds]);
  const canUndo = () => T.match.list.length > 0 && T.kinds.includes("you");
  function undo() {
    if (!canUndo()) return;
    do { if (!T.match.undo()) break; } while (!T.human());
    begin(T.match, T.kinds);
  }
  function save() {
    const a = el("a");
    a.href = URL.createObjectURL(new Blob([T.match.save()], { type: "application/json" }));
    a.download = `${G.key}-${T.match.list.length}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function rules() { const u = el("ul"); u.append(...G.rules(T.demo ? setup.style === "classic" : T.match.position.classic).map((t) => el("li", t))); sheet("How to play", u); }
  function menu() {
    const box = el("div", undefined, "stack"), add = (t, f) => { const b = el("button", t, "quiet"); b.type = "button"; b.onclick = () => { closeSheet(); f(); }; box.append(b); return b; };
    add("How to play", rules);
    add("What happened so far", () => { const o = el("ol"); o.id = "log"; o.reversed = true; o.append(...log.slice().reverse().map((t) => el("li", t))); sheet("What happened", log.length ? o : el("p", "Nothing yet.")); });
    if (G.more) add(G.more.label, () => sheet(G.more.label, G.more.body(T)));
    add("Take back your last move", undo).disabled = !canUndo();
    add("Save to a file", save);
    add("Start again with the same players", restart);
    add("Leave to the title", home);
    sheet(G.title, box);
  }
  function titleCard() {
    radio($("count"), many.map((n) => ({ value: n, label: String(n) })), setup.seats, (v) => { setup.seats = v; titleCard(); });
    radio($("style"), [{ value: "classic", label: "Classic" }, { value: "ours", label: "New" }], setup.style, (v) => { if (v === setup.style) return; setup.style = v; titleCard(); attract(); });
    $("about").textContent = G.about[setup.style];
    $("length-line").hidden = setup.style === "classic";
    $("style").parentElement.hidden = !G.about.ours;
    radio($("length"), G.lengths.map(([value, label]) => ({ value, label })), setup.rounds, (v) => { setup.rounds = v; titleCard(); });
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
      const { match: m } = openSave(s.save, [G.game]);
      return Array.isArray(s.kinds) && s.kinds.length === m.options.seats && s.kinds.every((k) => KINDS.some(([v]) => v === k)) ? { m, kinds: s.kinds } : null;
    } catch { return null; }
  }
  const resumeButton = () => { const k = kept(); $("resume").hidden = !k; if (k) $("resume").textContent = `Continue, round ${k.m.position.round}`; };

  $("start").onclick = () => begin(createMatch(G.game, { seed: seed(), options: { style: setup.style, seats: setup.seats, ...(setup.rounds ? { rounds: setup.rounds } : {}) } }), setup.who.slice(0, setup.seats));
  $("resume").onclick = () => { const k = kept(); if (k) begin(k.m, k.kinds); };
  $("menu").onclick = menu;
  $("how").onclick = rules;
  $("review").onclick = () => { $("act").hidden = true; toast("Open the menu to start again."); };
  $("again").onclick = restart;
  $("sheet-close").onclick = closeSheet;
  $("sheet").onclick = (e) => { if (e.target === $("sheet")) closeSheet(); };
  $("look").onclick = () => {
    const all = board.looks;
    if (!all.length) return;
    const [id, name] = all[(all.findIndex(([k]) => k === board.look) + 1) % all.length];
    store(LOOK, id);
    board.setLook(id);
    toast(name);
  };
  $("open").onclick = () => $("file").click();
  $("file").onchange = async () => {
    const f = $("file").files[0];
    $("file").value = "";
    if (!f) return;
    try {
      const { match: m, warning } = openSave(await f.text(), [G.game]);
      begin(m, Array.from({ length: m.options.seats }, (_, i) => (i ? "normal" : "you")));
      if (warning) sheet("Opened with a warning", el("p", warning));
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      sheet("That file was not opened", el("p", `${e.message[0].toUpperCase()}${e.message.slice(1)}.`));
    }
  };
  addEventListener("keydown", (e) => {
    if (T.demo || $("sheet").open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.toLowerCase() === "u") undo();
    else if (T.ready()) G.key && G.keys?.(T, e.key.toLowerCase(), e);
  });
  addEventListener("resize", place);
  footer();
  titleCard();
  resumeButton();
  attract();
  return T;
}
