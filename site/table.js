// SPDX-License-Identifier: AGPL-3.0-or-later
// What every table game's screen shares: title, seats, score bar, words, taking back, saving, bots' turns and the end.
// A game gives its rules, its board and its own move panel.
import { Refusal, chance, compareGames, createMatch, openSave, packGame, seedState, unpackGame } from "../src/core/index.js";
import { EMBLEMS, emblem } from "../src/map/board.js";
import { footer } from "./footer.js";
import { canLock, linkGames, makeLink, newId, readLink } from "./link.js";
import { BUILD, SOURCE_URL, VERSION } from "./config.js";
import { coach } from "./coach.js";
import { CHOICES, PACE, SCALE, cue, ranked, resultText, saveSettings, settings, sfx, turnKey, wake } from "./shell.js";

// The default six are Okabe and Ito's colour-blind-safe set (blue, orange, bluish green, reddish purple, vermillion, sky blue),
// a little darker where needed to show on the paper board. Saves keep colour numbers, so new colours go on the end.
export const COLOURS = [["Azure", [0, 114, 178]], ["Rust", [200, 88, 0]], ["Moss", [138, 168, 81]], ["Plum", [163, 97, 134]], ["Saffron", [212, 146, 0]], ["Teal", [0, 158, 115]], ["Rose", [220, 124, 154]], ["Slate", [112, 124, 138]], ["Umber", [146, 100, 64]], ["Indigo", [88, 92, 190]], ["Lime", [186, 208, 72]], ["Crimson", [176, 48, 62]], ["Ivory", [236, 226, 200]], ["Night", [52, 58, 78]], ["Sky", [83, 173, 224]]];
const LOOK0 = [[0, 0], [4, 1], [5, 2], [3, 3], [1, 8], [14, 4]];
/** What each seat wears now: its name, colour and icon. Changed in place, so a board keeps what it was given. */
export const NAMES = [], RGB = LOOK0.map(() => [0, 0, 0]), ICONS = [], PAPER = [[231, 217, 185], [228, 213, 180], [234, 221, 191]];
export function dress(look) {
  look.forEach(([c, i], s) => { const [name, rgb] = COLOURS[c % COLOURS.length]; NAMES[s] = name; RGB[s].splice(0, 3, ...rgb); ICONS[s] = i % EMBLEMS.length; });
}
dress(LOOK0);
export const $ = (id) => document.getElementById(id);
export const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const THEME = "capo-tent-theme";
const KINDS = [["you", "A person"], ["normal", "Bot"], ["easy", "Easy bot"], ["hard", "Hard bot"], ["away", "A friend, by link"]];
// gentle is the lessons' bot, not offered in the setup
const WORDS = { you: "A person", normal: "Bot", easy: "Easy bot", hard: "Hard bot", gentle: "Gentle bot", away: "By link" }, STYLES = { classic: "Traditional", custom: "Custom", ours: "Capo", coda: "Coda" };
// what each table game grew from, named by its family of games only: no titles, characters or art of anyone else's
const FAMILY = {
  banners: "classic world-conquest board games, where armies spread over a map and battles are fought with dice",
  fable: "hex island strategy games, where villages pay their soldiers' wages and the woods creep over idle land",
  glass: "settle-and-trade board games, where hexes yield goods on a roll of the dice and routes and towns score points",
  inch: "real-time territory games played in a browser, where borders creep across a map as strength grows",
};
/** The save promise, said beside the save controls. */
const SAVED = "Your games are kept only in this browser and are never sent anywhere. Save to a file to keep a copy or move it.";
const familyLine = (key) => FAMILY[key] && `Inspired by the family of games such as ${FAMILY[key]}. Not affiliated with or endorsed by the makers of any of them: the rules text, names and art are our own.`;
const store = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* files still work */ } };
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export function sign(seat, rgb = RGB[seat], icon = ICONS[seat]) {
  const c = el("canvas"), x = c.getContext("2d");
  c.width = c.height = 64;
  c.setAttribute("aria-hidden", "true"); // the name beside it says who
  x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fillStyle = `rgb(${rgb})`; x.fill(); x.lineWidth = 3; x.strokeStyle = "rgba(20,15,12,.75)"; x.stroke();
  emblem(x, icon, 32, 32, 36); x.fillStyle = inkOf(rgb); x.fill("evenodd");
  return c;
}
/** The ink that stands out more on a colour. */
const inkOf = (rgb) => (rgb.reduce((s, v, i) => s + [0.21, 0.72, 0.07][i] * (v / 255) ** 2.2, 0) > 0.19 ? "#1a1411" : "#fdf6e4");
/**
 * A row of choices that acts as one control: arrows, Home and End move, the chosen one is marked and kept in view.
 * `tabs` makes it a row of tabs. A row marked `soon` can be pressed to read about it but is not offered: the arrows pass it by.
 */
export function radio(host, items, chosen, pick, tabs = false) {
  const had = host.contains(document.activeElement), left = host.scrollLeft, state = tabs ? "aria-selected" : "aria-checked";
  host.replaceChildren(...items.map(({ value, label, note, rgb, off, soon }) => {
    const b = el("button");
    b.type = "button";
    b.setAttribute("role", tabs ? "tab" : "radio");
    b.setAttribute(state, String(value === chosen));
    b.tabIndex = value === chosen || (chosen === null && value === items[0].value) ? 0 : -1;
    b.disabled = !!off;
    if (soon) b.setAttribute("aria-disabled", "true");
    if (rgb) { const d = el("i", undefined, "dot"); d.style.background = `rgb(${rgb})`; b.append(d); }
    b.append(label);
    if (note) b.append(el("small", note));
    b.onclick = () => pick(value);
    return b;
  }));
  host.scrollLeft = left;
  const now = host.querySelector(`[${state}=true]`);
  // a long row scrolls: when the rows change under it, the chosen one is brought into view
  if (now && (host.scrollWidth > host.clientWidth || host.scrollHeight > host.clientHeight)) {
    const h = host.getBoundingClientRect(), c = now.getBoundingClientRect();
    if (c.left < h.left || c.right > h.right) host.scrollLeft += c.left < h.left ? c.left - h.left - 8 : c.right - h.right + 8;
    if (c.top < h.top || c.bottom > h.bottom) host.scrollTop += c.top < h.top ? c.top - h.top - 4 : c.bottom - h.bottom + 4;
  }
  host.onkeydown = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key], end = { Home: 0, End: -1 }[e.key];
    if (!step && end === undefined) return;
    e.preventDefault();
    const on = items.filter((x) => !x.off && !x.soon), at = on.findIndex((x) => x.value === chosen);
    if (on.length) pick((end === undefined ? on[(at + step + on.length) % on.length] : on.at(end)).value);
  };
  if (had) now?.focus();
}
let hush = 0;
/** A line over the board for a few seconds. `spoken` false keeps it from a screen reader: a bot's move, which the recap at your turn says again. */
export function toast(t, spoken = true) { const b = $("toast"); b.setAttribute("aria-live", spoken ? "polite" : "off"); b.textContent = t; b.classList.add("on"); clearTimeout(hush); hush = setTimeout(() => b.classList.remove("on"), Math.max(4000, 70 * t.length)); } // long enough to read
/** One sheet at a time. `kind` widens it (the menu, the end); no `close` leaves the closing to the sheet's own buttons and Escape. */
export function sheet(title, body, close = "Close", kind = "") {
  $("sheet").className = kind === "paper" ? kind : `panel ${kind}`; // paper for what is read, lacquer for the rest
  $("sheet-title").textContent = title;
  $("sheet-body").replaceChildren(body);
  $("sheet-close").parentNode.hidden = !close;
  $("sheet-close").textContent = close;
  $("sheet-close").className = close === "Close" || close === "Resume" ? "main" : "quiet";
  if (!$("sheet").open) { opener ||= document.activeElement; $("sheet").showModal(); }
}
/** What had the keyboard when the first of a run of sheets opened: given back when the last one closes. */
let opener = null;
const closeSheet = () => { if ($("sheet").open) $("sheet").close(); };

/**
 * G: game, key, title, cellsOf, landOf, goalOf, stats(p, seat), line(event, p), about[style], rules(classic), pace(p), thinking, choose,
 *    board(T) -> { show(order, quick) -> ms, layout(free), setLook(name), look, looks, destroy(), clear() },
 *    panel(T), tapped(T, cell), key(T, key, event), changed(T) when a new position arrives,
 *    realtime: true, or a test of the position, for a game played on a clock: it has no turns to end or take back.
 *    Without it, a position marked `live` is real time.
 */
export function createTable(G) {
  $("broken")?.remove();
  // what link play adds to the page
  const send = el("div"), sendSay = el("p"), sendRow = el("div", undefined, "go"), sendShare = el("button", "Share", "quiet"), sendCopy = el("button", "Copy the link", "main"), skip = el("button", "Skip to now", "quiet"), linkButton = el("button", "Link games", "text"), pass = el("div", undefined, "line"), passField = el("input");
  for (const b of [sendShare, sendCopy, skip, linkButton]) b.type = "button";
  send.id = "send"; send.hidden = skip.hidden = pass.hidden = true;
  sendRow.append(sendShare, sendCopy); send.append(sendSay, sendRow);
  $("act").append(send, skip);
  $("title").querySelector(".links").append(linkButton);
  Object.assign(passField, { type: "text", className: "field", placeholder: "None", autocomplete: "off", maxLength: 100 });
  passField.setAttribute("aria-label", "Password for the link, if you want one");
  pass.append(el("span", "Password"), passField);
  $("start").parentNode.before(pass);
  const more = el("div", undefined, "more"), note = el("p", "", "about"), ahead = el("button", "Skip ahead", "quiet");
  ahead.type = "button"; ahead.hidden = true;
  ahead.onclick = () => { T.hurry = true; ahead.hidden = true; };
  // what happened while you waited (said once, politely), and the log: docked beside the board on wide screens, one tap away on narrow ones
  // the summary's words are the one spoken region; its two buttons sit outside it, so they are not read with it
  const news = el("div", undefined, "none"), recap = el("div"), hide = el("button", "×", "shut"), told = el("button", "Since your last turn", "head"), dock = el("aside", undefined, "panel"), fold = el("button", "What happened", "head"), list = el("ol"), logs = $("menu").cloneNode(true);
  news.id = "news"; recap.setAttribute("role", "status");
  news.append(told, recap, hide);
  hide.type = fold.type = told.type = "button"; hide.setAttribute("aria-label", "Hide the summary");
  // the summary is one line until it is opened, so on a phone it never takes the board; a wide screen starts with it open
  const unfold = (open) => { news.classList.toggle("open", open); told.setAttribute("aria-expanded", String(open)); place(); };
  const unbrief = () => { recap.replaceChildren(); news.classList.add("none"); };
  const briefed = () => !news.classList.contains("none");
  told.onclick = () => unfold(!news.classList.contains("open"));
  hide.onclick = () => { unbrief(); place(); refocus(); }; // the button goes with the summary, so the keyboard goes back to the move
  dock.id = "record"; dock.hidden = true; list.reversed = true;
  dock.append(fold, list); document.body.append(dock);
  logs.id = "logs"; logs.setAttribute("aria-label", "What happened");
  logs.querySelector("path").setAttribute("d", "M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1");
  $("look").before(logs);
  $("act").prepend(news);
  $("act").append(ahead);
  $("about").after(more);
  // the turn banner, one line said once to a screen reader when a person's turn starts, the tray's handle on a phone, the menu's tabs
  const banner = el("div"), say = el("p", "", "sr"), tray = el("button", undefined, "tray"), setButton = el("button", "Settings", "text"), menuBox = el("div"), tabs = el("div", undefined, "pick small tabs"), pane = el("div");
  // take back, in sight beside End turn wherever the game allows it (the U key and the menu do the same)
  const back = el("button", "Take back", "quiet");
  back.type = "button"; back.id = "back"; back.hidden = true;
  back.onclick = () => undo();
  $("choice").querySelector(".go")?.prepend(back);
  const zoom = el("div", undefined, "zoom");
  zoom.hidden = true; zoom.setAttribute("role", "group"); zoom.setAttribute("aria-label", "Zoom the board");
  for (const [t, name, f] of [["+", "Zoom in", 1.4], ["−", "Zoom out", 1 / 1.4], ["⌂", "Show the whole board", 0]]) { const b = el("button", t, "quiet"); b.type = "button"; b.setAttribute("aria-label", name); b.onclick = () => board?.zoom(f); zoom.append(b); }
  document.body.append(zoom);
  // the status line is spoken, and every redraw writes it: the same words written again are left alone, so they are not said again
  // ("Saffron is thinking" once a turn, not at every move). The games write it plainly; this one element takes care of it.
  const text = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
  Object.defineProperty($("status"), "textContent", { configurable: true, get() { return text.get.call(this); }, set(v) { if (text.get.call(this) !== String(v ?? "")) text.set.call(this, v); } });
  const stage = $("stage");
  stage.removeAttribute("aria-hidden"); stage.tabIndex = 0; stage.setAttribute("role", "group");
  stage.setAttribute("aria-label", "The board. Plus and minus zoom, 0 shows all of it, arrows move it. The lists in the move panel choose places.");
  stage.onkeydown = (e) => {
    const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key], f = { "+": 1.4, "=": 1.4, "-": 1 / 1.4, 0: 0 }[e.key];
    if (move) board?.pan(move[0] * 0.12, move[1] * 0.12); else if (f !== undefined) board?.zoom(f); else return;
    e.preventDefault(); e.stopPropagation();
  };
  banner.id = "turn"; banner.hidden = true; banner.setAttribute("aria-hidden", "true");
  say.setAttribute("aria-live", "polite");
  tray.type = setButton.type = "button";
  tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Menu");
  pane.id = "menu-pane"; pane.setAttribute("role", "tabpanel");
  menuBox.append(tabs, pane);
  $("act").prepend(tray);
  document.body.append(banner, say);
  $("title").querySelector(".links").append(setButton);
  const KEY = `capo-${G.key}-2`, LOOK = `capo-${G.key}-look`, many = G.seats || [2, 3], setup = { seats: G.normal || 2, style: "classic", rounds: G.lengths[1]?.[0], who: ["you", "normal", "normal", "normal", "normal", "normal"], look: LOOK0.map((x) => [...x]), extra: Object.fromEntries([...(G.choices || []), ...(G.switches || [])].map((c) => [c.key, c.normal])), on: {} };
  let fitted = 0; // where the phone's tray began when the board was last fitted
  let resting = false; // the title's board was held still
  let sureEnd = 0, log = [], land = [], board = null, run = 0, mark = 0, drawn = -1, fell = [], heralded = "", tab = "game";
  const T = {
    match: null, kinds: [], look: LOOK0, hurry: false, link: null, demo: true, busy: false, RGB, NAMES, read: () => read(LOOK),
    get board() { return board; },
    away: () => !!T.match && T.match.turn !== null && T.kinds[T.match.turn] === "away",
    human: () => !!T.match && T.match.turn !== null && T.kinds[T.match.turn] === "you",
    ready: () => !T.demo && T.human() && !T.busy,
    solo: () => T.kinds.filter((k) => k === "you" || k === "away").length === 1 || (!!T.link && T.kinds.filter((k) => k === "you").length === 1),
    play, refresh: panel, realtime: () => realtime(), begin: (m, kinds) => begin(m, kinds), // begin: a game's own ladder starts its next step
  };
  /** Is this game played on a clock? Then there are no turns: no turn keys, no taking back, no turn banner. */
  function realtime(p = T.match?.position) {
    if (!p) return false;
    return typeof G.realtime === "function" ? !!G.realtime(p) : G.realtime === undefined ? !!p.live : !!G.realtime;
  }
  function docked() {
    dock.hidden = T.demo || T.catching || innerWidth <= 1180;
    zoom.hidden = T.demo || !board?.looks.length; // the still board is all in view already
    fold.setAttribute("aria-expanded", String(!list.hidden));
    if (!dock.hidden && !list.hidden && drawn !== log.length) { drawn = log.length; list.replaceChildren(...log.slice(-80).reverse().map((t) => el("li", t))); }
  }
  const place = () => {
    docked();
    if (!board) return;
    const wide = innerWidth > 820, r = (id) => $(id).getBoundingClientRect(), z = SCALE[settings.text];
    if (T.demo) board.layout(wide ? { left: Math.min(innerWidth / 2, $("title").querySelector(".card").getBoundingClientRect().right), right: 0, top: 20, bottom: 20 } : { left: 0, right: 0, top: 10, bottom: innerHeight * 0.5 });
    // the move panel (with the lesson and the news in it) keeps a column of its own, so nothing floats on the board
    else if (wide && document.body.classList.contains("atlas")) board.layout({ left: 372 * z, right: dock.hidden || list.hidden ? 0 : 360 * z, top: r("seats").bottom + 2, bottom: 4 });
    else if (wide) board.layout({ left: 232 * z, right: 372 * z, top: 12 + 74 * z, bottom: 6 });
    else { fitted = r("act").top; document.body.style.setProperty("--act", `${innerHeight - fitted}px`); board.layout({ left: 0, right: 0, top: r("seats").bottom + 2, bottom: innerHeight - fitted + 34 }); }
  };
  function makeBoard() {
    board?.destroy();
    $("stage").replaceChildren();
    board = G.board(T, $("stage"));
    board.patterns?.(settings.patterns === "on"); board.motion?.(settings.motion);
    $("look").hidden = !board.looks.length;
    place();
  }
  function ending() {
    const r = T.match.result;
    const own = G.ending?.(T);
    if (own) return own;
    if (r.winners.length > 1) return `${r.winners.map((s) => NAMES[s]).join(" and ")} tie. They ${r.why}.`;
    return T.solo() && T.kinds[r.winners[0]] === "you" ? G.won : `${NAMES[r.winners[0]]} wins.`;
  }
  /** Where the keyboard was in the move panel. The panel is put away while a move plays out, which drops the focus; it is given back after. */
  let held = "";
  function refocus() {
    const at = document.activeElement; // a button that was hidden or switched off still holds the focus until the page is next drawn
    if ((at !== document.body && at.getClientRects().length && !at.disabled) || $("sheet").open || !T.ready()) return;
    const was = !held || held === "end" ? null : $(held), ok = (e) => e && !e.disabled && e.getClientRects().length;
    const to = ok(was) && was.matches("button") ? was : was?.querySelector("[aria-checked=true], [tabindex='0']");
    // else the chosen row of the first list in sight, else the main button: a game may keep rows it is not showing (Grain and Glass's build tabs)
    const first = (q) => [...$("choice").querySelectorAll(q)].find(ok);
    (ok(to) ? to : first("[role=radio][tabindex='0']:not(:disabled)") || first("button.main:not(:disabled)") || first("button:not(:disabled):not(#back)"))?.focus({ preventScroll: true });
  }
  function panel() {
    const at = document.activeElement;
    if ($("choice").contains(at)) held = at.id || at.parentNode.id; // a button by its own name, a choice by its row
    sendBox();
    ahead.hidden = T.demo || T.hurry || T.catching || T.match.turn === null || T.human() || T.away();
    const over = T.match.turn === null, me = T.human() && !T.busy;
    if (!T.human() && briefed()) { unbrief(); place(); }
    $("choice").hidden = !me;
    $("after").hidden = !over;
    if (over) { $("status").textContent = ending(); board.clear(); } else if (!me) {
      // while your own move plays out the line stays as it is, so it is not blanked and said again after
      if (!T.human()) $("status").textContent = T.away() ? `Waiting for ${NAMES[T.match.turn]}` : `${NAMES[T.match.position.seat]} is thinking`;
      board.clear();
    } else { back.hidden = !canUndo(); G.panel(T); refocus(); }
    lesson?.check();
  }
  function score() {
    const p = T.match.position, goal = G.goalOf(p), n = G.landOf(p), seats = T.kinds.length, over = T.match.turn === null;
    $("round").textContent = over ? "The end" : G.roundText?.(p) || (p.classic ? `Round ${p.round}` : `Round ${p.round} of ${p.rounds}`);
    $("fills").replaceChildren(...Array.from({ length: seats }, (_, s) => { const i = el("i"); i.style.width = `${(100 * G.cellsOf(p, s)) / n}%`; i.style.background = `rgb(${RGB[s]})`; return i; }));
    $("goal").style.left = `${(100 * goal) / n}%`;
    $("land").setAttribute("aria-label", `${Array.from({ length: seats }, (_, s) => `${NAMES[s]} ${G.cellsOf(p, s)}`).join(", ")}. The goal is ${goal} of ${n}.`);
    $("seats").replaceChildren(...Array.from({ length: seats }, (_, s) => {
      const c = G.cellsOf(p, s), out = G.outOf ? G.outOf(p, s) : !c, li = el("li", undefined, `seat${s === T.match.turn ? " now" : ""}${out ? " out" : ""}`), dl = el("dl");
      for (const [k, v] of [[G.unit || "Land", G.landText ? G.landText(c, goal) : innerWidth > 820 || seats < 3 ? `${c}/${goal}` : c], ...G.stats(p, s)]) { const d = el("div"); d.append(el("dt", k), el("dd", String(v))); dl.append(d); }
      li.append(sign(s), el("b", NAMES[s]), el("small", T.kinds[s] === "you" && T.solo() ? "You" : WORDS[T.kinds[s]]), dl);
      li.style.setProperty("--seat", `rgb(${RGB[s]})`);
      if (s === T.match.turn) li.setAttribute("aria-current", "true");
      return li;
    }));
    docked();
  }
  /** Back to a person after others have moved: what happened since, the moves that touched them first. */
  function brief() {
    if (T.demo || !T.human()) return;
    const all = log.slice(mark).filter((t) => !t.endsWith(" ends the turn.")), you = all.filter((t) => t.includes(NAMES[T.match.turn])), show = (all.length > 5 && you.length ? you : all).slice(-5), u = el("ul");
    mark = log.length;
    if (!show.length) return;
    u.append(...show.map((t) => el("li", t)));
    told.textContent = `Since your last turn (${all.length})`;
    recap.replaceChildren(u, ...(all.length > show.length ? [el("small", `${all.length - show.length} more in the log.`)] : []));
    news.classList.remove("none");
    unfold(innerWidth > 820 && innerHeight > 860); // open where there is room for it beside the board
  }
  /** A person's turn starts: said once, a bell, and at normal speed a banner for under a second. Real time has no turns. */
  let gone = 0;
  const unherald = () => { clearTimeout(gone); banner.hidden = true; };
  function herald() {
    const p = T.match.position, s = T.match.turn, k = T.demo || T.catching || !T.human() || realtime(p) ? "" : turnKey(T.match.seed, p.round, s, T.solo());
    if (!k || k === heralded) return;
    heralded = k;
    say.textContent = `${T.solo() ? "Your turn" : `${NAMES[s]}, your turn`}. Round ${p.round}.`;
    sfx("turn");
    if (settings.speed !== "normal") return;
    banner.replaceChildren(sign(s), el("small", "Your turn"), el("b", NAMES[s]), el("span", `Round ${p.round}`));
    banner.style.setProperty("--seat", `rgb(${RGB[s]})`);
    banner.classList.remove("go");
    banner.hidden = false;
    void banner.offsetWidth; // start the animation again
    banner.classList.add("go");
    clearTimeout(gone); gone = setTimeout(unherald, 950);
  }
  const down = (p, s) => (G.outOf ? G.outOf(p, s) : !G.cellsOf(p, s));
  const watch = (p) => { for (let s = 0; s < T.kinds.length; s++) if (fell[s] === undefined && down(p, s)) fell[s] = p.round; };
  const still = () => settings.motion === "reduced" || (settings.motion === "system" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  /** Settings take effect at once. The board is told the motion choice and draws its own reduced motion. */
  function apply() {
    const h = document.documentElement;
    h.classList.toggle("still", still());
    h.classList.toggle("patterns", settings.patterns === "on");
    h.style.setProperty("--ui-scale", String(SCALE[settings.text]));
    board?.patterns?.(settings.patterns === "on"); board?.motion?.(settings.motion);
    place();
    if (resting && T.demo && !still()) next();
  }
  const tally = (p) => Array.from({ length: T.kinds.length }, (_, s) => G.cellsOf(p, s));
  const keep = () => { if (T.link && !T.demo) linkGames.put(T.link.id, { game: G.key, save: T.match.save(), kinds: T.kinds, look: T.look, roles: T.link.roles, pass: T.link.pass, floor: T.link.floor, when: Date.now() }); else if (!T.demo && !lesson?.owns()) store(KEY, T.match.turn === null ? null : JSON.stringify({ save: T.match.save(), kinds: T.kinds, look: T.look })); };

  /** A tick of a real-time game: played at once, drawn without waiting, saved now and then. */
  function flow(move) {
    const events = T.match.play(move), words = events.map((e) => G.line(e, T.match.position)).filter(Boolean);
    log.push(...words);
    if (T.match.list.length % 10 === 0 || T.match.turn === null) { land.push(tally(T.match.position)); keep(); }
    G.seen?.(T, events);
    board.show([], false);
    if (words.length) toast(words.slice(0, 2).join(" "));
    score(); panel();
    if (T.match.turn === null) { land.push(tally(T.match.position)); keep(); finish(); }
  }
  T.flow = flow;
  async function play(move) {
    const mine = run, seat = T.match.turn, person = T.human(), speed = T.demo || person ? "normal" : settings.speed;
    T.busy = true;
    let events;
    // a key can ask for a move the rules do not allow just now (E in an opening that has no end of turn): it is refused, and nothing is lost
    try { events = T.match.play(move); } catch (e) { if (!(e instanceof Refusal) || T.demo || !person) throw e; T.busy = false; toast("That cannot be done now."); return; }
    const words = events.map((e) => G.line(e, T.match.position)).filter(Boolean);
    // in a game by link, a move that rolled dice is final: nobody can look at the dice, take it back and choose again
    if (T.link && T.match.rolled) T.link.floor = T.match.list.length;
    log.push(...words);
    lesson?.seen(events, person);
    if (person) mark = log.length;
    land.push(tally(T.match.position));
    watch(T.match.position);
    keep();
    if (!T.demo) { score(); panel(); }
    G.seen?.(T, events);
    if (!T.demo && !T.hurry && speed === "normal") cue(events);
    const rush = T.hurry || speed === "instant", took = board.show(G.order(events), rush);
    if (!T.demo && !rush && words.length && (!person || T.match.turn !== seat)) toast(words.slice(0, 2).join(" "), person);
    if (T.human()) T.hurry = false;
    await sleep(T.hurry || speed === "instant" ? 0 : T.demo ? Math.max(G.pace(T.match.position), took + 120) : speed === "fast" ? Math.max(90, took / 2) : Math.max(160, took + 60));
    if (mine !== run) return;
    T.busy = false;
    G.changed?.(T);
    if (!T.demo) { score(); panel(); brief(); herald(); if (T.match.turn === null) finish(); }
    next();
  }
  async function next() {
    const mine = run;
    // with motion reduced, the board behind the title holds still; it plays on when motion is wanted again (apply)
    if (T.demo && still()) { resting = true; return; }
    resting = false;
    if (T.match.turn === null) { if (T.demo) { await sleep(2500); if (mine === run && T.demo) attract(); } return; }
    if (T.human()) return;
    if (T.away()) { panel(); return; }
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
      if (!T.hurry) await sleep(Math.max(0, G.pace(T.match.position) * PACE[settings.speed] - (performance.now() - from)));
    }
    if (mine === run) play(move);
  }
  /** The panel that hands the game to a friend. The link is made before it is asked for, so one press copies it. */
  let ready = null;
  function sendBox() {
    const p = T.match.position, over = T.match.turn === null, on = !!T.link && !T.demo && !T.busy && T.kinds.includes("you") && (T.away() || over), mark = on ? `${T.link.id}/${T.match.list.length}` : "";
    send.hidden = !on;
    if (!on || ready?.mark === mark) return;
    const made = ready = { mark, url: "" }, fresh = T.match.list.length > T.link.floor;
    sendSay.textContent = over ? "Send the last link, so that everyone sees the end." : fresh || !T.match.list.length ? `Send this to ${NAMES[p.seat]}. It is their turn.` : `Already sent. ${NAMES[p.seat]} has not sent a link back yet.`;
    sendCopy.disabled = true;
    sendCopy.textContent = "Copy the link";
    sendShare.hidden = !navigator.share;
    Promise.resolve().then(() => makeLink(G.key, T.link.id, packGame(T.match, T.link.roles, T.look), T.link.pass)).then((url) => { made.url = url; if (ready === made) sendCopy.disabled = false; }, (e) => { if (ready === made) sendSay.textContent = e instanceof Refusal ? `${e.message}.` : "The link could not be made."; });
  }
  function sent() { T.link.floor = T.match.list.length; keep(); sendSay.textContent = "Copied. Paste it to your friend, then wait for theirs. Opening it brings you back here."; }
  async function copy() {
    const url = ready?.url;
    if (!url) return;
    try { await navigator.clipboard.writeText(url); sendCopy.textContent = "Copied"; toast("Link copied."); } catch {
      const t = el("textarea"), box = el("div");
      t.value = url; t.rows = 6; t.readOnly = true; t.className = "paste"; t.setAttribute("aria-label", "The link");
      box.append(el("p", "Copy this and paste it to your friend."), t);
      sheet("Your link", box);
      t.select();
    }
    sent();
  }
  function seatsFor(roles, seat) { return roles.map((r, i) => (i === seat ? "you" : r === "host" || r === "friend" ? "away" : r)); }
  /** A link has been opened or pasted. */
  async function openLink(text, password) {
    try {
      const l = readLink(text), mine = linkGames.get(l.id), pass = password ?? mine?.pass ?? "";
      if (l.locked && !pass) return askPassword(text, "");
      let got;
      try { got = unpackGame(await l.open(pass), [G.game]); } catch (e) { if (e instanceof Refusal && e.code === "password") return askPassword(text, password === undefined ? "The password kept here does not open this link. Either it has another password, or the link was changed." : "That is not the password, or the link was changed."); throw e; }
      const { match: m, roles, look } = got, link = { id: l.id, roles, pass: l.locked ? pass : "", floor: m.list.length };
      if (mine) {
        const old = openSave(mine.save, [G.game]).match, how = compareGames(old, m);
        if (how === "other") throw new Refusal("other", "this link tells the game differently from the one you have, so it was not opened");
        closeSheet();
        if (how === "old") { begin(old, mine.kinds, { ...link, floor: mine.floor }, -1, look); toast("You already have this turn."); return undefined; }
        return begin(m, mine.kinds, link, old.list.length, look);
      }
      return takeSeat(m, link, look);
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      return sheet("That link was not opened", el("p", `${e.message[0].toUpperCase()}${e.message.slice(1)}.`));
    }
  }
  function askPassword(text, note) {
    const box = el("div", undefined, "stack"), f = el("input"), go = el("button", "Open", "main");
    f.type = "password"; f.autocomplete = "off"; f.className = "field"; f.setAttribute("aria-label", "Password");
    go.type = "button"; go.onclick = () => { if (f.value) { closeSheet(); openLink(text, f.value); } };
    f.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); go.click(); } };
    box.append(el("p", note || "This game has a password. Ask whoever sent the link."), f, go);
    sheet("A game with a password", box, "Not now");
    f.focus();
  }
  function takeSeat(m, link, look) {
    dress(look);
    const box = el("div", undefined, "stack"), people = link.roles.map((r, i) => [r, i]).filter(([r]) => r === "host" || r === "friend"), now = m.turn;
    box.append(el("p", now === null ? "This game is over." : `It is round ${m.position.round}, and ${NAMES[now]} is to move. Which seat is yours?`));
    const go = (seat) => { closeSheet(); begin(m, seatsFor(link.roles, seat), link, seat < 0 ? m.list.length : Math.max(0, m.list.length - 14), look); };
    for (const [r, i] of people.sort((a, b) => (b[1] === now) - (a[1] === now))) { const b = el("button", `${NAMES[i]}${r === "host" ? ", who made the game" : ""}`, i === now ? "main" : "quiet"); b.type = "button"; b.prepend(sign(i)); b.onclick = () => go(i); box.append(b); }
    const w = el("button", "Only watch", "quiet"); w.type = "button"; w.onclick = () => go(-1);
    box.append(w);
    sheet(G.title, box, "Not now");
  }
  /** Link play: this game's link, a pasted one, and the games kept here. Shown alone from the title and as a tab of the menu. */
  function linkBox() {
    const box = el("div", undefined, "stack"), t = el("textarea"), go = el("button", "Open the link", "main"), all = linkGames.list(G.key);
    const named = el("label", undefined, "stack");
    named.append(el("span", "A link from a friend"), t);
    t.rows = 3; t.className = "paste"; t.placeholder = "Paste it here";
    go.type = "button"; go.onclick = () => { const v = t.value; closeSheet(); openLink(v); };
    if (T.link && !T.demo) box.append(el("p", ready?.url ? "This game is played by link. Its newest link is ready in the move panel." : "This game is played by link. The move panel offers the link when it is a friend's turn."));
    box.append(el("p", "To start one, choose \"A friend, by link\" for a player. Links hold the whole game. Without a password, anyone who has the link can read it. A friend set on cheating could try a turn more than once, so play with people you trust."), named, go);
    for (const r of all) {
      let m;
      try { m = openSave(r.save, [G.game]).match; } catch { continue; }
      const row = el("div", undefined, "go"), b = el("button", `Round ${m.position.round}, ${m.turn === null ? "over" : r.kinds[m.turn] === "you" ? "your turn" : `waiting for ${NAMES[m.turn]}`}`, "quiet"), x = el("button", "Remove", "quiet");
      b.type = x.type = "button"; b.style.flex = "1";
      b.onclick = () => { closeSheet(); begin(m, r.kinds, { id: r.id, roles: r.roles, pass: r.pass, floor: r.floor }, -1, r.look || LOOK0); };
      x.onclick = () => { if (x.textContent === "Remove") { x.textContent = "Sure?"; return; } linkGames.drop(r.id); row.remove(); };
      row.append(b, x); box.append(row);
    }
    return box;
  }
  const linkSheet = () => sheet("Link games", linkBox(), "Back");
  /** Play out what happened since `from`, then go on. */
  async function catchUp(m, from) {
    const mine = run, all = m.list, show = createMatch(G.game, { seed: m.seed, options: m.options });
    for (const mv of all.slice(0, from)) show.play(mv);
    Object.assign(T, { match: show, busy: true, catching: true });
    G.changed?.(T);
    makeBoard();
    board.show([], true);
    score(); panel(); place();
    skip.hidden = false;
    $("status").textContent = "What has happened";
    for (const mv of all.slice(from)) {
      await sleep(T.catching ? 120 : 0);
      if (mine !== run) return;
      const events = show.play(mv), words = events.map((e) => G.line(e, show.position)).filter(Boolean);
      if (!T.catching) continue;
      G.seen?.(T, events);
      score();
      const took = board.show(G.order(events), false);
      if (words.length) toast(words.slice(0, 2).join(" "), false); // the summary after says it
      await sleep(Math.max(G.pace(show.position) * 0.7, took + 80));
      if (mine !== run) return;
    }
    skip.hidden = true;
    Object.assign(T, { match: m, busy: false, catching: false });
    G.changed?.(T);
    board.show([], true);
    score(); panel(); brief(); herald();
    if (T.match.turn === null) finish();
    next();
  }
  function begin(m, k, link = null, from = -1, look = T.look) {
    run++;
    T.look = look;
    T.hurry = false;
    dress(look);
    ready = null;
    skip.hidden = true;
    Object.assign(T, { demo: false, busy: false, catching: false, match: m, kinds: k, link });
    G.fresh?.(T);
    log = []; land = []; mark = -1; drawn = -1; fell = []; held = "";
    unbrief();
    const again = createMatch(G.game, { seed: m.seed, options: m.options });
    land.push(tally(again.position));
    m.list.forEach((mv, i) => { if (i === from) mark = log.length; log.push(...again.play(mv).map((e) => G.line(e, again.position)).filter(Boolean)); land.push(tally(again.position)); watch(again.position); });
    if (mark < 0) mark = log.length;
    document.body.classList.remove("menu");
    $("title").hidden = true;
    for (const id of ["bar", "seats", "act"]) $(id).hidden = false;
    keep();
    if (from >= 0 && from < m.list.length) { catchUp(m, from); return; }
    G.changed?.(T);
    makeBoard();
    score(); panel(); place();
    board.show([], true);
    keep();
    herald();
    next();
  }
  /** The options the title screen stands at. */
  function chosen(all = false) {
    const o = { style: setup.style === "coda" ? "classic" : setup.style, seats: setup.seats, ...(setup.rounds ? { rounds: setup.rounds } : {}) };
    for (const c of G.choices || []) if (!c.local && (!c.only || c.only.includes(o.style))) o[c.key] = setup.extra[c.key];
    if (setup.style === "custom") for (const c of G.switches) o[c.key] = setup.extra[c.key];
    for (const c of G.expansions || []) if (!G.expansionsFor || G.expansionsFor(o.style, setup.extra)) o[c.key] = !!setup.on[c.key];
    if (all) for (const c of G.choices || []) if (c.local) o[c.key] = setup.extra[c.key];
    return o;
  }
  function attract() {
    dress(setup.look);
    run++;
    Object.assign(T, { demo: true, busy: false, link: null, hurry: false, kinds: Array(Math.max(...many)).fill("easy"), match: createMatch(G.game, { seed: "title " + (run % 9), options: { ...chosen(), seats: Math.max(...many) } }) });
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
  /** The end: the winner large, every player's place and figures, land over time, and the next step in fixed places. Win and loss share one layout. */
  function finish() {
    const body = el("div"), c = el("canvas"), p = T.match.position, n = G.landOf(p), r = T.match.result, names = p.names; // a real-time map names its own nations
    const mine = (s) => (p.human !== undefined ? s === p.human : T.kinds[s] === "you"), people = T.kinds.includes("you"), lost = people && !r.winners.some(mine);
    const nameOf = (s) => (names ? names[s] : NAMES[s]), signed = (s) => !names || mine(s), last = p.rounds ? Math.min(p.round, p.rounds) : p.round, rounds = !G.roundText?.(p);
    sfx(lost ? "lose" : "win");
    // land over time, each band marked with its emblem and name where it is widest, so the colours are not needed to read it
    c.id = "chart"; c.width = 880; c.height = 280;
    const x = c.getContext("2d"), px = (i) => (land.length < 2 ? 0 : (i / (land.length - 1)) * c.width), py = (v) => c.height - (v / n) * c.height;
    let base = land.map(() => 0);
    const marks = land[0].map((_, s) => {
      const up = land.map((l, i) => base[i] + l[s]), wide = up.reduce((b, v, i) => (v - base[i] > up[b] - base[b] ? i : b), 0);
      x.beginPath(); up.forEach((v, i) => (i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v)))); for (let i = land.length - 1; i >= 0; i--) x.lineTo(px(i), py(base[i])); x.closePath();
      x.fillStyle = `rgb(${RGB[s]})`; x.fill(); x.strokeStyle = "#0d1623"; x.lineWidth = 2; x.stroke();
      const mark = { s, at: Math.min(c.width - 150, Math.max(8, px(wide) - 40)), y: (py(up[wide]) + py(base[wide])) / 2, room: py(base[wide]) - py(up[wide]) };
      base = up;
      return mark;
    });
    x.font = '22px "Tent Roman", Palatino, Georgia, serif'; x.textBaseline = "middle";
    for (const m of marks) if (m.room > 26) { x.drawImage(sign(m.s), m.at, m.y - 13, 26, 26); x.fillStyle = inkOf(RGB[m.s]); x.fillText(nameOf(m.s), m.at + 32, m.y + 1); }
    c.setAttribute("role", "img"); c.setAttribute("aria-label", `Land held over the game. At the end: ${tally(p).map((v, s) => `${nameOf(s)} ${v}`).join(", ")}.`);
    // places
    let rows = ranked(Array.from({ length: names ? names.length : T.kinds.length }, (_, s) => ({ seat: s, won: r.winners.includes(s), score: (G.placeOf || G.cellsOf)(p, s), land: G.cellsOf(p, s), fell: fell[s] }))); // G.placeOf: what places are ranked by, when it is not land
    if (names) rows = rows.filter((w, i) => i < 8 || mine(w.seat));
    rows = rows.map((w) => ({ ...w, name: nameOf(w.seat), figures: [[G.unit || "Land", w.land], ...(G.figures?.(T, w.seat) || G.stats(p, w.seat)), ...(rounds ? [["Rounds", w.fell ?? last]] : [])] }));
    const scroll = el("div", undefined, "ranks"), table = el("table"), head = el("tr");
    head.append(...["Place", "Player", ...rows[0].figures.map(([k]) => k)].map((t) => { const th = el("th", t); th.scope = "col"; return th; }));
    table.append(head, ...rows.map((w) => {
      const tr = el("tr", undefined, w.won ? "won" : ""), who = el("th");
      who.scope = "row";
      if (signed(w.seat)) who.append(sign(w.seat));
      who.append(w.name, ...(mine(w.seat) && T.solo() && !names ? [el("small", " (you)")] : []));
      tr.append(el("td", String(w.place)), who, ...w.figures.map(([, v]) => el("td", String(v))));
      return tr;
    }));
    table.setAttribute("aria-label", "Places");
    scroll.append(table);
    // the winner, large
    const hero = el("div", undefined, "hero"), arms = el("div", undefined, "arms"), words = el("div");
    arms.append(...r.winners.filter(signed).slice(0, 3).map((s) => sign(s)));
    const why = String(r.why || "played to the end");
    words.append(el("b", r.winners.map(nameOf).join(" and ")), el("p", ending()), el("p", G.summary?.(T) || (r.winners.length > 1 ? `They ${why}.` : `${why[0].toUpperCase()}${why.slice(1)}, in ${last} round${last === 1 ? "" : "s"}.`)));
    hero.append(arms, words);
    // what next: the same three in the same places every time, then two smaller ones
    const go = el("div", undefined, "go ends"), all = el("a", "All games", "quiet"), change = el("button", "Change setup", "quiet"), again = el("button", "Rematch", "main");
    const minor = el("div", undefined, "go minor"), look = el("button", "See the board", "text"), copyIt = el("button", "Copy result", "text"), text = resultText(G.title, rows);
    all.href = "./";
    change.type = again.type = look.type = copyIt.type = "button";
    again.onclick = () => { closeSheet(); restart(); };
    change.onclick = () => { home(); $("own").open = true; };
    look.onclick = closeSheet;
    copyIt.onclick = async () => { try { await navigator.clipboard.writeText(text); copyIt.textContent = "Copied"; } catch { toast(text); } };
    const onward = G.next?.(T); // a ladder's next step takes the main button's place
    if (onward) { again.textContent = onward.label; again.onclick = () => { closeSheet(); onward.go(); }; }
    go.append(all, change, again); minor.append(look, copyIt);
    body.append(hero, scroll, c, ...[G.report?.(T)].filter(Boolean), go, minor); // G.report: the figures a game adds to the end
    sheet(lost ? "Defeat" : people ? "Victory" : "The end", body, null, `end ${lost ? "lose" : "win"}`);
    again.focus();
  }
  const seed = () => [...crypto.getRandomValues(new Uint32Array(2))].map((v) => v.toString(36)).join("");
  const restart = () => begin(createMatch(G.game, { seed: seed(), options: T.match.options }), [...T.kinds], T.link ? { id: newId(), roles: T.kinds.map((x) => (x === "you" ? "host" : x === "away" ? "friend" : x)), pass: T.link.pass, floor: 0 } : null);
  const floor = () => (T.link ? T.link.floor : 0);
  const canUndo = () => !T.catching && !realtime() && T.match.list.length > floor() && T.kinds.includes("you");
  function undo() {
    if (!canUndo()) return;
    const had = T.match.list;
    let rerolls = false; // did any move taken back roll dice? then playing it again gives the same result
    do { if (T.match.list.length <= floor()) break; rerolls ||= T.match.rolled; if (!T.match.undo()) break; } while (!T.human());
    if (!T.human()) { for (const mv of had.slice(T.match.list.length)) T.match.play(mv); return; } // nothing of yours to take back
    begin(T.match, T.kinds, T.link);
    toast(rerolls ? "Taken back. The dice are already rolled: playing the same move again gives the same result." : had.length - T.match.list.length > 1 ? "Taken back, with the moves made after it." : "Taken back.");
  }
  function save() {
    const a = el("a");
    a.href = URL.createObjectURL(new Blob([T.match.save()], { type: "application/json" }));
    a.download = `${G.key}-${T.match.list.length}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function showLog() { const o = el("ol"); o.id = "log"; o.reversed = true; o.append(...log.slice().reverse().map((t) => el("li", t))); sheet("What happened", log.length ? o : el("p", "Nothing yet."), "Close", "paper"); }
  function rules() {
    const u = el("ul"), kin = G.family || familyLine(G.key);
    u.append(...G.rules(T.demo ? setup.style === "classic" : T.match.position.classic, T.demo ? null : T.match.position).map((t) => el("li", t)));
    sheet("How to play", kin ? (() => { const box = el("div"); box.append(u, el("p", kin, "about")); return box; })() : u, "Close", "paper");
  }
  /** One menu, the same in every table game: Game, Settings, Link play, About. */
  function menu(at = tab) {
    tab = at;
    if (!$("sheet").open || !$("sheet-body").contains(menuBox)) sheet(G.title, menuBox, T.demo ? "Close" : "Resume", "wide");
    radio(tabs, [["game", "Game"], ["settings", "Settings"], ["link", "Link play"], ["about", "About"]].map(([value, label]) => ({ value, label })), tab, menu, true);
    for (const b of tabs.children) b.setAttribute("aria-controls", pane.id);
    pane.setAttribute("aria-label", tabs.querySelector("[aria-selected=true]").textContent);
    pane.replaceChildren({ game: gameTab, settings: settingsTab, link: linkBox, about: aboutTab }[tab]());
  }
  function gameTab() {
    const box = el("div", undefined, "stack"), add = (t, f, cls = "quiet") => { const b = el("button", t, cls); b.type = "button"; b.onclick = () => { closeSheet(); f(); }; box.append(b); return b; };
    // starting again or leaving loses the game in play: the first press asks, the second does it
    const sure = (t, f) => { const b = add(t, f, "quiet danger"), go = b.onclick; b.onclick = () => { if (b.dataset.armed) go(); else { b.dataset.armed = "1"; b.textContent = `${t}: press again to be sure`; } }; };
    add("How to play", rules);
    if (lesson) add("Teach me again", lesson.start);
    if (T.demo) return box;
    add("What happened so far", showLog);
    if (G.listing) add("The board as a list", () => {
      const { head, rows } = G.listing(T), box = el("div", undefined, "ranks"), t = el("table"), tr = (cells, tag) => { const r = el("tr"); r.append(...cells.map((c) => el(tag, String(c)))); return r; };
      t.append(tr(head, "th"), ...rows.map((r) => tr(r, "td"))); box.append(t);
      sheet("The board as a list", box, "Close", "paper");
    });
    if (G.more) add(G.more.label, () => sheet(G.more.label, G.more.body(T)));
    if (!realtime()) add("Take back your last move", undo).disabled = !canUndo();
    add("Save to a file", save);
    box.append(el("p", SAVED, "about"), el("hr"));
    sure("Start again with the same players", restart);
    sure("Leave to the title", home);
    return box;
  }
  /** Each setting is kept in this browser and takes effect at once. */
  function settingsTab() {
    const box = el("div", undefined, "set"), vol = el("input"), volLine = el("label", undefined, "line");
    const row = (label, get, set, items) => {
      const line = el("div", undefined, "line"), host = el("div", undefined, "pick small");
      host.setAttribute("role", "radiogroup"); host.setAttribute("aria-label", label);
      const draw = () => radio(host, items.map(([value, text]) => ({ value, label: text })), get(), (v) => { set(v); draw(); });
      draw();
      line.append(el("span", label), host);
      box.append(line);
    };
    const bind = (k) => [() => settings[k], (v) => { settings[k] = v; saveSettings(); apply(); }];
    const [soundGet, soundSet] = bind("sound");
    row("Sound", soundGet, (v) => { soundSet(v); vol.disabled = v !== "on"; if (v === "on") { wake(); setTimeout(() => sfx("turn"), 60); } }, CHOICES.sound);
    Object.assign(vol, { type: "range", min: "0", max: "100", step: "5", value: String(settings.volume), disabled: settings.sound !== "on" });
    vol.oninput = () => { settings.volume = Number(vol.value); vol.setAttribute("aria-valuetext", `${vol.value} in 100`); saveSettings(); };
    vol.onchange = () => { wake(); sfx("tick"); };
    volLine.append(el("span", "Volume"), vol);
    box.append(volLine);
    row("Bot speed", ...bind("speed"), CHOICES.speed);
    row("Motion", ...bind("motion"), CHOICES.motion);
    if (board?.looks.length) row("Board look", () => board.look, (v) => { store(LOOK, v); board.setLook(v); }, board.looks);
    row("Letter keys", ...bind("keys"), CHOICES.keys);
    box.append(el("p", "E ends the turn (press twice), U takes back, and each game has a few more. Off leaves Tab, arrows, Enter and Escape.", "about"));
    row("Seat patterns", ...bind("patterns"), CHOICES.patterns);
    box.append(el("p", "Patterns show on the board and the score bar.", "about"));
    row("Text size", ...bind("text"), CHOICES.text);
    // daylight or lamplight: the same choice the front page's lantern keeps
    row("Light", () => read(THEME) || "system", (v) => { store(THEME, v === "system" ? null : v); if (v === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v; }, [["system", "Follow the system"], ["light", "Daylight"], ["dark", "Lamplight"]]);
    return box;
  }
  function aboutTab() {
    const box = el("div", undefined, "stack"), src = el("a", "Read the source code"), where = el("p", /^https:\/\//.test(SOURCE_URL) ? undefined : "The source address is not set in this copy yet.");
    src.href = SOURCE_URL;
    box.append(
      el("p", `${G.title}, one of the table games of Overture of Empires: Capo. Version ${VERSION}, build ${BUILD}.`),
      ...(G.family || familyLine(G.key) ? [el("p", G.family || familyLine(G.key))] : []),
      where,
      el("p", "Free software under the GNU Affero General Public License, version 3 or later (AGPL-3.0-or-later): you may read, change and share it, and a changed copy that others use over a network must offer them its source."),
      el("p", "Credits: the rules, maps, pieces, emblems and sounds are the project's own work; the sounds are made in code as the game runs. The coastlines are drawn from Natural Earth, which is in the public domain. Anything borrowed is listed with its licence in CREDITS.csv, ADAPTED.csv and NOTICES.md beside the source."),
    );
    if (/^https:\/\//.test(SOURCE_URL)) where.append(src);
    return box;
  }
  function titleCard() {
    radio($("count"), many.map((n) => ({ value: n, label: String(n) })), setup.seats, (v) => { setup.seats = v; titleCard(); });
    radio($("style"), Object.entries(STYLES).filter(([k]) => G.about[k]).map(([value, label]) => ({ value, label, note: value === "coda" ? "coming soon" : undefined, soon: value === "coda" })), setup.style, (v) => { if (v === setup.style) return; setup.style = v; titleCard(); if (v !== "coda") attract(); });
    const soon = setup.style === "coda";
    $("about").replaceChildren(...G.about[setup.style].split("\n").map((x) => el("span", x)));
    for (const id of ["count", "who"]) $(id).closest(".line, ul").hidden = soon || !!G.alone?.(setup.style, setup.extra);
    $("start").disabled = soon;
    $("start").textContent = soon ? "Coming soon" : "Begin";
    $("length-line").hidden = setup.style !== "ours" || !G.lengths.length;
    const pickOf = (c) => { const line = el("label", undefined, "line"), k = el("select"); k.append(...c.values.map(([v, t]) => new Option(t, String(v)))); k.value = String(setup.extra[c.key]); k.name = c.key; k.onchange = () => { setup.extra[c.key] = c.values.find(([v]) => String(v) === k.value)[0]; titleCard(); more.querySelector(`select[name="${c.key}"]`)?.focus(); attract(); }; line.append(el("span", c.label), k); return line; };
    more.replaceChildren(...(soon ? [] : (G.choices || []).filter((c) => (!c.only || c.only.includes(setup.style)) && (!c.when || c.when(setup.style, setup.extra))).map(pickOf)));
    if (setup.style === "custom") more.append(...G.switches.map(pickOf));
    if (G.expansions && !soon && (!G.expansionsFor || G.expansionsFor(setup.style, setup.extra))) {
      const box = el("div", undefined, "pick small");
      box.setAttribute("role", "group");
      box.setAttribute("aria-label", "Expansions");
      box.append(...G.expansions.map((c) => { const b = el("button", c.label); b.type = "button"; b.title = c.note; b.setAttribute("aria-pressed", String(!!setup.on[c.key])); b.onclick = () => { setup.on[c.key] = !setup.on[c.key]; note.textContent = setup.on[c.key] ? c.note : ""; titleCard(); }; return b; }));
      more.append(el("span", "Expansions", "head"), box, note);
    }
    radio($("length"), G.lengths.map(([value, label]) => ({ value, label })), setup.rounds, (v) => { setup.rounds = v; titleCard(); });
    $("who").replaceChildren(...Array.from({ length: setup.seats }, (_, s) => {
      const li = el("li"), k = el("select");
      k.append(...KINDS.filter(([v]) => v !== "hard" || G.hard).map(([v, t]) => new Option(t, v))); // a hard bot only where the game has one
      k.value = setup.who[s];
      k.setAttribute("aria-label", NAMES[s]);
      k.onchange = () => { setup.who[s] = k.value; passLine(); };
      const wear = el("button", undefined, "wear");
      wear.type = "button";
      wear.setAttribute("aria-label", `${NAMES[s]}: choose a colour and an icon`);
      wear.append(sign(s), el("b", NAMES[s]));
      wear.onclick = () => wardrobe(s);
      li.append(wear, k);
      return li;
    }));
    passLine();
  }
  /** Choose what a seat wears. Taking another seat's colour swaps the two. */
  function wardrobe(s) {
    const box = el("div"), draw = () => {
      const list = (name, n, at, show) => {
        const row = el("div", undefined, "wear-row");
        row.setAttribute("role", "group"); row.setAttribute("aria-label", name);
        for (let v = 0; v < n; v++) {
          const b = el("button"), other = setup.look.findIndex((x, i) => i !== s && i < setup.seats && x[at] === v);
          b.type = "button"; b.title = show(v)[1]; b.setAttribute("aria-label", show(v)[1]); b.setAttribute("aria-pressed", String(setup.look[s][at] === v));
          b.append(show(v)[0]);
          b.onclick = () => { if (at === 0) { const held = setup.look.findIndex((x, i) => i !== s && x[0] === v); if (held >= 0) setup.look[held][0] = setup.look[s][0]; } setup.look[s][at] = v; dress(setup.look); draw(); titleCard(); board.show([], true); };
          if (other >= 0 && at === 0) b.append(el("small", String(other + 1)));
          row.append(b);
        }
        return row;
      };
      box.replaceChildren(el("p", "Colour"), list("Colour", COLOURS.length, 0, (v) => [sign(0, COLOURS[v][1], setup.look[s][1]), COLOURS[v][0]]), el("p", "Icon"), list("Icon", EMBLEMS.length, 1, (v) => [sign(0, COLOURS[setup.look[s][0]][1], v), EMBLEMS[v][0]]));
    };
    draw();
    sheet(`Player ${s + 1}`, box, "Done");
  }
  function passLine() {
    const on = setup.who.slice(0, setup.seats).includes("away");
    pass.hidden = !on || !canLock();
    $("start").disabled = setup.style === "coda" || (on && !setup.who.slice(0, setup.seats).includes("you"));
  }
  function kept() {
    try {
      const s = JSON.parse(read(KEY) || "null");
      if (!s) return null;
      const { match: m } = openSave(s.save, [G.game]);
      // one kind a seat; a game that names its own players (real time: you, and nations the rules play) keeps as many as it named
      const seats = G.kindsOf?.(m.options)?.length ?? m.options.seats, fits = realtime(m.position) ? s.kinds?.length >= 1 : s.kinds?.length === seats;
      return Array.isArray(s.kinds) && fits && s.kinds.every((k) => k !== "away" && Object.hasOwn(WORDS, k)) ? { m, kinds: s.kinds, look: s.look || LOOK0 } : null;
    } catch { return null; }
  }
  const resumeButton = () => { const k = kept(), when = k && G.roundText?.(k.m.position); $("resume").hidden = !k; if (k) $("resume").textContent = when ? `Continue: ${when}` : `Continue, round ${k.m.position.round}`; };

  const launch = (o, all, who, words = "") => begin(createMatch(G.game, { seed: G.seedOf?.(all) || seed(), options: o }), who, who.includes("away") ? { id: newId(), roles: who.map((k) => (k === "you" ? "host" : k === "away" ? "friend" : k)), pass: canLock() ? words : "", floor: 0 } : null, -1, setup.look.map((x) => [...x]));
  $("start").onclick = () => launch(chosen(), chosen(true), G.kindsOf?.(chosen()) || setup.who.slice(0, setup.seats), passField.value.trim());
  // Play: one press starts a short game, you against bots, on the game's own preset (G.quick) or Traditional at the fewest seats and the shortest length
  const quick = { style: "classic", seats: Math.min(...many), ...(G.lengths[0] ? { rounds: G.lengths[0][0] } : {}), ...G.quick }, them = (G.kindsOf?.(quick) || Array(quick.seats)).length - 1;
  const fast = () => launch(quick, quick, G.kindsOf?.(quick) || ["you", ...Array(them).fill("normal")]);
  // the guided first game (coach.js), when the game has one: offered on the title card, at the first Play, and in the menu
  const lesson = G.lesson && coach(T, G.lesson, G.key, () => begin(createMatch(G.game, { seed: G.lesson.seed, options: G.lesson.options }), [...G.lesson.kinds], null, -1, LOOK0.map((x) => [...x])));
  $("quick").onclick = () => lesson?.first(fast) || fast();
  $("preset").replaceChildren(...[`${STYLES[quick.style]} rules, you against ${them || "the"} bot${them === 1 ? "" : "s"}.`, ...G.about[quick.style].split("\n").filter((x) => x.startsWith("Not "))].map((x) => el("span", x)));
  linkButton.onclick = linkSheet;
  sendCopy.onclick = copy;
  sendShare.onclick = async () => { if (ready?.url) try { await navigator.share({ url: ready.url }); sent(); } catch { /* they changed their mind */ } };
  skip.onclick = () => { T.catching = false; };
  $("resume").onclick = () => { const k = kept(); if (k) begin(k.m, k.kinds, null, -1, k.look); };
  $("menu").onclick = () => menu();
  setButton.onclick = () => menu("settings");
  // sound wakes on a press that starts a game, or when it is turned on; every button then ticks
  for (const id of ["quick", "start", "resume"]) $(id).addEventListener("click", wake);
  addEventListener("click", (e) => { if (e.target.closest?.("button, a")) sfx("tick"); }, true);
  // the banner goes at any tap or key, which still does what it does
  for (const k of ["pointerdown", "keydown"]) addEventListener(k, () => { if (!banner.hidden) unherald(); }, true);
  const shut = () => document.body.classList.contains("shut");
  const folded = () => { tray.setAttribute("aria-expanded", String(!shut())); tray.setAttribute("aria-label", shut() ? "Show the whole move panel" : "Fold the move panel, to see more of the board"); };
  tray.onclick = () => { document.body.classList.toggle("shut"); store("capo-tray", shut() ? "shut" : null); folded(); place(); };
  document.body.classList.toggle("shut", read("capo-tray") === "shut");
  folded();
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", apply);
  logs.onclick = showLog;
  list.hidden = read("capo-log") === "shut";
  fold.onclick = () => { list.hidden = !list.hidden; store("capo-log", list.hidden ? "shut" : null); drawn = -1; place(); };
  // on a phone the board is fitted again when the tray grows or shrinks by more than a little, so the tray never sits on it and small changes do not make it jump
  new ResizeObserver(() => { document.body.style.setProperty("--ah", `${$("act").offsetHeight}px`); if (innerWidth <= 820 && !$("act").hidden && Math.abs($("act").getBoundingClientRect().top - fitted) > 16) place(); }).observe($("act"));
  $("how").onclick = rules;
  $("review").onclick = () => { $("act").hidden = true; toast("Open the menu to start again."); };
  $("again").onclick = restart;
  $("sheet-close").onclick = closeSheet;
  // a sheet that closes gives the keyboard back to what opened it, or else to the move panel; one opened straight after keeps it waiting
  $("sheet").addEventListener("close", () => {
    if ($("sheet").open) return;
    const o = opener, at = document.activeElement;
    opener = null;
    if (at && at !== document.body) return;
    if (o && o !== document.body && o.isConnected && o.getClientRects().length && !o.disabled) o.focus({ preventScroll: true }); else refocus();
  });
  // a game on a clock is kept every few ticks; leaving the page keeps it to the tick
  addEventListener("pagehide", () => { if (T.match && !T.demo && !T.catching && !T.busy) keep(); });
  $("sheet").onclick = (e) => { if (e.target === $("sheet")) closeSheet(); };
  $("look").onclick = () => menu("settings"); // the looks, all in view, with the other settings
  $("open").onclick = () => $("file").click();
  $("file").onchange = async () => {
    const f = $("file").files[0];
    $("file").value = "";
    if (!f) return;
    try {
      const { match: m, warning } = openSave(await f.text(), [G.game]);
      begin(m, G.kindsOf?.(m.options) || Array.from({ length: m.options.seats }, (_, i) => (i ? "normal" : "you")));
      if (warning) sheet("Opened with a warning", el("p", warning));
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      sheet("That file was not opened", el("p", `${e.message[0].toUpperCase()}${e.message.slice(1)}.`));
    }
  };
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (T.demo || $("sheet").open || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input:not([type=range]), select, textarea")) return;
    if (k.length === 1 && settings.keys === "off") return; // single letters only; Enter and Escape stay
    // a game on a clock has no turn to end or take back: its letters are all its own
    const turns = !realtime();
    if (k === "u" && turns) undo();
    else if (k === "e" && turns && T.ready() && performance.now() > sureEnd) { sureEnd = performance.now() + 4000; toast("End your turn? Press E again."); }
    else if (T.ready()) { sureEnd = 0; G.key && G.keys?.(T, k, e); }
  });
  addEventListener("resize", place);
  footer();
  apply();
  titleCard();
  resumeButton();
  const arrive = () => { if (!location.hash.startsWith("#t=")) return; const text = location.hash; history.replaceState(null, "", location.pathname + location.search); openLink(text); };
  addEventListener("hashchange", arrive);
  attract();
  arrive();
  return T;
}
