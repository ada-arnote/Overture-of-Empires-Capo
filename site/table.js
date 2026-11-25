// SPDX-License-Identifier: AGPL-3.0-or-later
// What every table game's screen shares: title, seats, score bar, words, taking back, saving, bots' turns and the end.
// A game gives its rules, its board and its own move panel.
import { Refusal, chance, compareGames, createMatch, openSave, packGame, seedState, unpackGame } from "../src/core/index.js";
import { EMBLEMS, emblem } from "../src/map/board.js";
import { footer } from "./footer.js";
import { canLock, linkGames, makeLink, newId, readLink } from "./link.js";

export const COLOURS = [["Azure", [91, 143, 196]], ["Rust", [208, 106, 75]], ["Moss", [138, 168, 81]], ["Plum", [160, 108, 182]], ["Saffron", [222, 176, 62]], ["Teal", [64, 160, 150]], ["Rose", [220, 124, 154]], ["Slate", [112, 124, 138]], ["Umber", [146, 100, 64]], ["Indigo", [88, 92, 190]], ["Lime", [186, 208, 72]], ["Crimson", [176, 48, 62]], ["Ivory", [236, 226, 200]], ["Night", [52, 58, 78]]];
const LOOK0 = [[0, 0], [1, 1], [2, 2], [3, 3], [4, 8], [5, 4]];
/** What each seat wears now: its name, colour and icon. Changed in place, so a board keeps what it was given. */
export const NAMES = [], RGB = LOOK0.map(() => [0, 0, 0]), ICONS = [], PAPER = [[231, 217, 185], [228, 213, 180], [234, 221, 191]];
export function dress(look) {
  look.forEach(([c, i], s) => { const [name, rgb] = COLOURS[c % COLOURS.length]; NAMES[s] = name; RGB[s].splice(0, 3, ...rgb); ICONS[s] = i % EMBLEMS.length; });
}
dress(LOOK0);
export const $ = (id) => document.getElementById(id);
export const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KINDS = [["you", "A person"], ["normal", "Bot"], ["easy", "Easy bot"], ["away", "A friend, by link"]];
const WORDS = { you: "A person", normal: "Bot", easy: "Easy bot", away: "By link" };
const store = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* files still work */ } };
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export function sign(seat, rgb = RGB[seat], icon = ICONS[seat]) {
  const c = el("canvas"), x = c.getContext("2d");
  c.width = c.height = 64;
  x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fillStyle = `rgb(${rgb})`; x.fill(); x.lineWidth = 3; x.strokeStyle = "rgba(20,15,12,.75)"; x.stroke();
  emblem(x, icon, 32, 32, 36); x.fillStyle = rgb[0] + rgb[1] + rgb[2] > 560 ? "#1a1411" : "#fdf6e4"; x.fill("evenodd");
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
  $("title").querySelector(".card").lastElementChild.before(pass);
  const more = el("div", undefined, "more"), note = el("p", "", "about"), ahead = el("button", "Skip ahead", "quiet");
  ahead.type = "button"; ahead.hidden = true;
  ahead.onclick = () => { T.hurry = true; ahead.hidden = true; };
  $("act").append(ahead);
  $("about").after(more);
  const KEY = `capo-${G.key}-2`, LOOK = `capo-${G.key}-look`, many = G.seats || [2, 3], setup = { seats: G.normal || 2, style: "classic", rounds: G.lengths[1]?.[0], who: ["you", "normal", "normal", "normal", "normal", "normal"], look: LOOK0.map((x) => [...x]), extra: Object.fromEntries([...(G.choices || []), ...(G.switches || [])].map((c) => [c.key, c.normal])), on: {} };
  let log = [], land = [], board = null, run = 0;
  const T = {
    match: null, kinds: [], look: LOOK0, hurry: false, link: null, demo: true, busy: false, RGB, NAMES, read: () => read(LOOK),
    get board() { return board; },
    away: () => !!T.match && T.match.turn !== null && T.kinds[T.match.turn] === "away",
    human: () => !!T.match && T.match.turn !== null && T.kinds[T.match.turn] === "you",
    ready: () => !T.demo && T.human() && !T.busy,
    solo: () => T.kinds.filter((k) => k === "you" || k === "away").length === 1 || (!!T.link && T.kinds.filter((k) => k === "you").length === 1),
    play, refresh: panel,
  };
  const place = () => {
    if (!board) return;
    const wide = innerWidth > 820, r = (id) => $(id).getBoundingClientRect();
    if (T.demo) board.layout(wide ? { left: Math.min(innerWidth / 2, $("title").querySelector(".card").getBoundingClientRect().right), right: 0, top: 20, bottom: 20 } : { left: 0, right: 0, top: 10, bottom: innerHeight * 0.5 });
    else if (wide && document.body.classList.contains("atlas")) board.layout({ left: 0, right: 0, top: r("seats").bottom + 2, bottom: 4 });
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
    sendBox();
    ahead.hidden = T.demo || T.hurry || T.catching || T.match.turn === null || T.human() || T.away();
    const over = T.match.turn === null, me = T.human() && !T.busy;
    $("choice").hidden = !me;
    $("after").hidden = !over;
    if (over) { $("status").textContent = ending(); board.clear(); } else if (!me) {
      $("status").textContent = T.away() ? `Waiting for ${NAMES[T.match.turn]}` : T.human() ? "" : `${NAMES[T.match.position.seat]} is thinking`;
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
      li.append(sign(s), el("b", NAMES[s]), el("small", T.kinds[s] === "you" && T.solo() ? "You" : WORDS[T.kinds[s]]), dl);
      return li;
    }));
  }
  const tally = (p) => Array.from({ length: T.kinds.length }, (_, s) => G.cellsOf(p, s));
  const keep = () => { if (T.link && !T.demo) linkGames.put(T.link.id, { game: G.key, save: T.match.save(), kinds: T.kinds, look: T.look, roles: T.link.roles, pass: T.link.pass, floor: T.link.floor, when: Date.now() }); else if (!T.demo) store(KEY, T.match.turn === null ? null : JSON.stringify({ save: T.match.save(), kinds: T.kinds, look: T.look })); };

  async function play(move) {
    const mine = run, seat = T.match.turn, person = T.human();
    T.busy = true;
    const events = T.match.play(move), words = events.map((e) => G.line(e, T.match.position)).filter(Boolean);
    log.push(...words);
    land.push(tally(T.match.position));
    keep();
    if (!T.demo) { score(); panel(); }
    G.seen?.(T, events);
    const took = board.show(G.order(events), T.hurry);
    if (!T.demo && !T.hurry && words.length && (!person || T.match.turn !== seat)) toast(words.slice(0, 2).join(" "));
    if (T.human()) T.hurry = false;
    await sleep(T.hurry ? 0 : T.demo ? Math.max(G.pace(T.match.position), took + 120) : Math.max(160, took + 60));
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
      if (!T.hurry) await sleep(Math.max(0, G.pace(T.match.position) - (performance.now() - from)));
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
  function linkSheet() {
    const box = el("div", undefined, "stack"), t = el("textarea"), go = el("button", "Open the link", "main"), all = linkGames.list(G.key);
    t.rows = 3; t.className = "paste"; t.placeholder = "Paste a link here"; t.setAttribute("aria-label", "Paste a link here");
    go.type = "button"; go.onclick = () => { const v = t.value; closeSheet(); openLink(v); };
    box.append(el("p", "To start one, choose \"A friend, by link\" for a player. Links hold the whole game. Without a password, anyone who has the link can read it. A friend set on cheating could try a turn more than once, so play with people you trust."), t, go);
    for (const r of all) {
      let m;
      try { m = openSave(r.save, [G.game]).match; } catch { continue; }
      const row = el("div", undefined, "go"), b = el("button", `Round ${m.position.round}, ${m.turn === null ? "over" : r.kinds[m.turn] === "you" ? "your turn" : `waiting for ${NAMES[m.turn]}`}`, "quiet"), x = el("button", "Remove", "quiet");
      b.type = x.type = "button"; b.style.flex = "1";
      b.onclick = () => { closeSheet(); begin(m, r.kinds, { id: r.id, roles: r.roles, pass: r.pass, floor: r.floor }, -1, r.look || LOOK0); };
      x.onclick = () => { if (x.textContent === "Remove") { x.textContent = "Sure?"; return; } linkGames.drop(r.id); row.remove(); };
      row.append(b, x); box.append(row);
    }
    sheet("Link games", box, "Back");
  }
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
      if (words.length) toast(words.slice(0, 2).join(" "));
      await sleep(Math.max(G.pace(show.position) * 0.7, took + 80));
      if (mine !== run) return;
    }
    skip.hidden = true;
    Object.assign(T, { match: m, busy: false, catching: false });
    G.changed?.(T);
    board.show([], true);
    score(); panel();
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
    log = []; land = [];
    const again = createMatch(G.game, { seed: m.seed, options: m.options });
    land.push(tally(again.position));
    for (const mv of m.list) { log.push(...again.play(mv).map((e) => G.line(e, again.position)).filter(Boolean)); land.push(tally(again.position)); }
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
    next();
  }
  /** The options the title screen stands at. */
  function chosen() {
    const o = { style: setup.style, seats: setup.seats, ...(setup.rounds ? { rounds: setup.rounds } : {}) };
    for (const c of G.choices || []) o[c.key] = setup.extra[c.key];
    if (setup.style === "custom") for (const c of G.switches) o[c.key] = setup.extra[c.key];
    for (const c of G.expansions || []) o[c.key] = !!setup.on[c.key];
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
  const restart = () => begin(createMatch(G.game, { seed: seed(), options: T.match.options }), [...T.kinds], T.link ? { id: newId(), roles: T.kinds.map((x) => (x === "you" ? "host" : x === "away" ? "friend" : x)), pass: T.link.pass, floor: 0 } : null);
  const floor = () => (T.link ? T.link.floor : 0);
  const canUndo = () => !T.catching && T.match.list.length > floor() && T.kinds.includes("you");
  function undo() {
    if (!canUndo()) return;
    const had = T.match.list;
    do { if (T.match.list.length <= floor() || !T.match.undo()) break; } while (!T.human());
    if (!T.human()) { for (const mv of had.slice(T.match.list.length)) T.match.play(mv); return; } // nothing of yours to take back
    begin(T.match, T.kinds, T.link);
  }
  function save() {
    const a = el("a");
    a.href = URL.createObjectURL(new Blob([T.match.save()], { type: "application/json" }));
    a.download = `${G.key}-${T.match.list.length}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function rules() { const u = el("ul"); u.append(...G.rules(T.demo ? setup.style === "classic" : T.match.position.classic, T.demo ? null : T.match.position).map((t) => el("li", t))); sheet("How to play", u); }
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
    radio($("style"), [["classic", "Traditional"], ["ours", "Capo"], ["custom", "Coda"]].filter(([k]) => G.about[k]).map(([value, label]) => ({ value, label })), setup.style, (v) => { if (v === setup.style) return; setup.style = v; titleCard(); attract(); });
    $("about").textContent = G.about[setup.style];
    $("length-line").hidden = setup.style !== "ours" || !G.lengths.length;
    const pickOf = (c) => { const line = el("label", undefined, "line"), k = el("select"); k.append(...c.values.map(([v, t]) => new Option(t, String(v)))); k.value = String(setup.extra[c.key]); k.onchange = () => { setup.extra[c.key] = c.values.find(([v]) => String(v) === k.value)[0]; attract(); }; line.append(el("span", c.label), k); return line; };
    more.replaceChildren(...(G.choices || []).map(pickOf));
    if (setup.style === "custom") more.append(...G.switches.map(pickOf));
    if (G.expansions) {
      const box = el("div", undefined, "pick small");
      box.setAttribute("role", "group");
      box.setAttribute("aria-label", "Expansions");
      box.append(...G.expansions.map((c) => { const b = el("button", c.label); b.type = "button"; b.title = c.note; b.setAttribute("aria-pressed", String(!!setup.on[c.key])); b.onclick = () => { setup.on[c.key] = !setup.on[c.key]; note.textContent = setup.on[c.key] ? c.note : ""; titleCard(); }; return b; }));
      more.append(el("span", "Expansions", "head"), box, note);
    }
    radio($("length"), G.lengths.map(([value, label]) => ({ value, label })), setup.rounds, (v) => { setup.rounds = v; titleCard(); });
    $("who").replaceChildren(...Array.from({ length: setup.seats }, (_, s) => {
      const li = el("li"), k = el("select");
      k.append(...KINDS.map(([v, t]) => new Option(t, v)));
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
    $("start").disabled = on && !setup.who.slice(0, setup.seats).includes("you");
  }
  function kept() {
    try {
      const s = JSON.parse(read(KEY) || "null");
      if (!s) return null;
      const { match: m } = openSave(s.save, [G.game]);
      return Array.isArray(s.kinds) && s.kinds.length === m.options.seats && s.kinds.every((k) => k !== "away" && KINDS.some(([v]) => v === k)) ? { m, kinds: s.kinds, look: s.look || LOOK0 } : null;
    } catch { return null; }
  }
  const resumeButton = () => { const k = kept(); $("resume").hidden = !k; if (k) $("resume").textContent = `Continue, round ${k.m.position.round}`; };

  $("start").onclick = () => {
    const who = setup.who.slice(0, setup.seats), far = who.includes("away"), words = passField.value.trim();
    begin(createMatch(G.game, { seed: seed(), options: chosen() }), who, far ? { id: newId(), roles: who.map((k) => (k === "you" ? "host" : k === "away" ? "friend" : k)), pass: canLock() ? words : "", floor: 0 } : null, -1, setup.look.map((x) => [...x]));
  };
  linkButton.onclick = linkSheet;
  sendCopy.onclick = copy;
  sendShare.onclick = async () => { if (ready?.url) try { await navigator.share({ url: ready.url }); sent(); } catch { /* they changed their mind */ } };
  skip.onclick = () => { T.catching = false; };
  $("resume").onclick = () => { const k = kept(); if (k) begin(k.m, k.kinds, null, -1, k.look); };
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
  const arrive = () => { if (!location.hash.startsWith("#t=")) return; const text = location.hash; history.replaceState(null, "", location.pathname + location.search); openLink(text); };
  addEventListener("hashchange", arrive);
  attract();
  arrive();
  return T;
}
