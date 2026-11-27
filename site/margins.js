// SPDX-License-Identifier: AGPL-3.0-or-later
// Margins of Trust on the table (early): talk in the fixed promise forms, answer the bargains offered you, write your
// orders in secret and seal them, then step through the reveal, where every order says what happened to it and why,
// and the ledger marks every promise kept, broken or void. A flat board of three rings round an inner sea, drawn here in SVG.
import { HALVES, LEADS, NONE, WORDS, YEARS, alive, boardOf, formsOf, ledgerFor, margins, mineOf, nameOf, offerOf, orderText, ordersAt, pending, portsOf, reason, seasonText, strengthOf, toWin } from "../src/games/margins/rules.js";
import { characterOf, choose, thinking, threats } from "../src/games/margins/bot.js";
import { formText } from "../src/games/margins/forms.js";
import { SEA } from "../src/games/margins/map.js";
import { resolve } from "../src/games/margins/resolve.js";
import { $, NAMES, RGB, createTable, el, radio, sheet, sign, toast } from "./table.js";

const PAPER = [233, 221, 190], INK = "#2b2219";
const BAD = ["lost", "held-off", "tie", "outdone", "swap", "no-transport", "cut", "void", "fell"];
const FORM_NAMES = { "keep-out": "Keep out of", "back-move": "Back a move into", "back-hold": "Back the hold of", stand: "Hold", "no-strike": "No strikes", carry: "Carry" };
const MARK_WORDS = { kept: "Kept", broken: "Broken", void: "Void: it could not apply" };
// what is being written: the orders so far (by province), for which stage, season and seat, and what is chosen
let draft = new Map(), draftKey = "", chosen = null, kind = "move", opened = "", reveal = null;
// the talk being written: words not yet said, and the form being put together
let said = [], mode = "promise", whom = null, form = null, where = null, shell = null;
const keyOf = (p) => `${p.round}/${p.stage}/${p.seat}`;
const named = (p) => (i) => nameOf(p, i), who = (s) => NAMES[s];
const covered = (T) => !T.solo() && opened !== keyOf(T.match.position);
const writing = (T) => T.ready() && !covered(T) && !replaying(T) && T.match.position.stage === "write" && draftKey === keyOf(T.match.position);
const replaying = (T) => !!reveal && !reveal.done && !T.demo && T.ready();
const mix = (rgb, k) => rgb.map((v, i) => Math.round(v * k + PAPER[i] * (1 - k)));
const inkOn = (rgb) => (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114 > 140000 ? INK : "#fdf6e4");
const button = (text, cls, go) => { const b = el("button", text, cls); b.type = "button"; b.onclick = go; return b; };
/** The seat whose private promises this screen may show: the one person in a solo game; with several people, none (public only). */
const viewer = (T) => (T.solo() ? T.kinds.indexOf("you") : -1);
const isBot = (T, s) => ["easy", "normal", "hard"].includes(T.kinds[s]);
/** The panel's first line: plain for one person; with the seat's name first when several share the device. */
const headline = (T, s, text) => (T.solo() ? `${text[0].toUpperCase()}${text.slice(1)}` : `${NAMES[s]}: ${text}`);
const castLine = (T, p, s) => (T.kinds[s] === "easy" ? "An easy bot: says nothing, accepts no bargain." : `${characterOf(p, s).name[0].toUpperCase()}${characterOf(p, s).name.slice(1)}: ${characterOf(p, s).line}`);

function sync(T) {
  const k = keyOf(T.match.position);
  if (k !== draftKey) { draftKey = k; draft = new Map(); chosen = null; kind = "move"; said = []; form = where = null; }
}

// ---- the board ----
const R = [36, 57, 77, 97];
function ringBoard(T, stage) {
  const ns = "http://www.w3.org/2000/svg", make = (t, at = {}) => { const e = document.createElementNS(ns, t); for (const [k, v] of Object.entries(at)) e.setAttribute(k, v); return e; };
  const svg = make("svg", { viewBox: "-100 -100 200 200", class: "rings", role: "img" });
  let hi = { cells: [], ring: -1 }, room = {};
  stage.replaceChildren(svg);
  const geo = () => {
    const b = boardOf(T.match.position), turn = (u) => ((u - 4) * 2 * Math.PI) / b.U + Math.PI / 2, pt = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
    return { b, turn, pt, mid: (i) => pt((R[b.ring[i]] + R[b.ring[i] + 1]) / 2, turn((b.from[i] + b.to[i]) / 2)) };
  };
  function wedge(g, i) {
    const { b, turn, pt } = g, r0 = R[b.ring[i]], r1 = R[b.ring[i] + 1], a0 = turn(b.from[i]), a1 = turn(b.to[i]), big = a1 - a0 > Math.PI ? 1 : 0, f = (v) => v.toFixed(2);
    const [x0, y0] = pt(r1, a0), [x1, y1] = pt(r1, a1), [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0);
    return `M${f(x0)} ${f(y0)}A${r1} ${r1} 0 ${big} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${r0} ${r0} 0 ${big} 0 ${f(x3)} ${f(y3)}Z`;
  }
  /** What to draw: a step of the reveal while it is stepped through; else the board, with your own orders while you write them, or the last reveal's. */
  function view(p) {
    if (replaying(T)) { const s = reveal.steps[reveal.step]; return { owner: s.board.owner, str: s.board.str, arrows: s.arrows }; }
    const arrows = writing(T) ? [...draft].map(([at, o]) => ({ ...o, at, of: p.seat })) : reveal ? reveal.steps[0].arrows.map((a) => ({ ...a, failed: BAD.includes(a.code) })) : [];
    return { owner: p.owner, str: p.str, arrows };
  }
  function draw() {
    const p = T.match.position, g = geo(), { b } = g, defs = make("defs"), v = view(p);
    for (let s = 0; s < p.seats; s++) {
      const m = make("marker", { id: `head-${s}`, viewBox: "0 0 10 10", refX: 7, refY: 5, markerWidth: 3.2, markerHeight: 3.2, orient: "auto-start-reverse" });
      m.append(make("path", { d: "M0 0L10 5L0 10z", fill: `rgb(${RGB[s]})` }));
      const c = make("marker", { id: `dot-${s}`, viewBox: "0 0 10 10", refX: 5, refY: 5, markerWidth: 2.6, markerHeight: 2.6 });
      c.append(make("circle", { cx: 5, cy: 5, r: 4, fill: `rgb(${RGB[s]})` }));
      defs.append(m, c);
    }
    const sea = make("circle", { cx: 0, cy: 0, r: R[0], class: "sea" }), label = make("text", { x: 0, y: 0, class: "lands" });
    label.textContent = SEA;
    const parts = [defs, sea, label], tops = [];
    for (let i = 0; i < b.n; i++) {
      const o = v.owner[i], fill = o === NONE ? mix([206, 190, 150], 0.35 + 0.1 * (b.land[i] % 2)) : mix(RGB[o], 0.62), path = make("path", { d: wedge(g, i), fill: `rgb(${fill})`, class: `prov${hi.cells.includes(i) ? " can" : ""}${hi.ring === i ? " chosen" : ""}` });
      path.addEventListener("click", () => tap(T, i));
      const title = make("title");
      title.textContent = `${nameOf(p, i)}${b.port[i] ? ", a port" : ""}: ${o === NONE ? "nobody's" : `${NAMES[o]}, ${v.str[i]} strong`}`;
      path.append(title);
      parts.push(path);
      const [x, y] = g.mid(i);
      if (b.port[i]) { const [dx, dy] = g.pt(R[0] + 2.6, g.turn((b.from[i] + b.to[i]) / 2)); tops.push(make("circle", { cx: dx.toFixed(2), cy: dy.toFixed(2), r: 1.5, class: "dock" })); }
      const name = make("text", { x: x.toFixed(2), y: (y + 4.6).toFixed(2), class: "name" });
      name.textContent = nameOf(p, i);
      tops.push(name);
      if (o !== NONE) {
        const rgb = RGB[o];
        tops.push(make("circle", { cx: x.toFixed(2), cy: (y - 0.8).toFixed(2), r: 3.6, fill: `rgb(${rgb})`, stroke: INK, "stroke-width": 0.4 }));
        const n = make("text", { x: x.toFixed(2), y: (y - 0.6).toFixed(2), class: "count", fill: inkOn(rgb) });
        n.textContent = String(v.str[i]);
        tops.push(n);
      }
    }
    for (const a of v.arrows) {
      const s = a.of, [x0, y0] = g.mid(a.at), cls = `arrow ${a.kind}${a.failed ? " failed" : ""}${a.lit ? " lit" : ""}`, stroke = `rgb(${RGB[s]})`;
      let d;
      if (a.kind === "transport") { const [xa, ya] = g.mid(a.a), [xb, yb] = g.mid(a.b); d = `M${xa.toFixed(1)} ${ya.toFixed(1)}Q0 0 ${xb.toFixed(1)} ${yb.toFixed(1)}`; } else {
        const [x1, y1] = g.mid(a.to), dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, cut = 4.5 / len, sx = x0 + dx * cut, sy = y0 + dy * cut, ex = x1 - dx * cut, ey = y1 - dy * cut;
        const bySea = a.kind === "move" && !b.near[a.at].includes(a.to);
        d = bySea ? `M${sx.toFixed(1)} ${sy.toFixed(1)}Q${((x0 + x1) * 0.2).toFixed(1)} ${((y0 + y1) * 0.2).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}` : `M${sx.toFixed(1)} ${sy.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`;
      }
      const path = make("path", { d, class: cls, stroke, ...(a.kind === "transport" ? {} : { "marker-end": `url(#${a.kind === "move" ? "head" : "dot"}-${s})` }) });
      // a revealed order says what happened to it: hover, or tap
      if (a.code) { const t = make("title"), said = reason(a, named(p), who); t.textContent = said; path.append(t); path.addEventListener("click", (e) => { e.stopPropagation(); toast(said); }); }
      parts.push(path);
    }
    svg.classList.toggle("tight", Math.min(svg.clientWidth, svg.clientHeight) < 520);
    svg.setAttribute("aria-label", `The board: ${b.n} provinces in three rings round ${SEA}. ${Array.from({ length: p.seats }, (_, s) => `${NAMES[s]} holds ${v.owner.filter((o) => o === s).length}, ${v.owner.filter((o, i) => o === s && b.port[i]).length} ports`).join("; ")}.`);
    svg.replaceChildren(...parts, ...tops);
  }
  const fit = () => Object.assign(svg.style, { left: `${room.left || 0}px`, top: `${room.top || 0}px`, width: `calc(100% - ${(room.left || 0) + (room.right || 0)}px)`, height: `calc(100% - ${(room.top || 0) + (room.bottom || 0)}px)` });
  draw();
  return {
    looks: [], look: "flat", setLook() {},
    layout(free) { room = free || {}; fit(); draw(); },
    show() { draw(); return 0; },
    light(cells, o = {}) { hi = { cells: cells || [], ring: o.ring ?? -1 }; draw(); },
    clear() { hi = { cells: [], ring: -1 }; draw(); },
    destroy() { svg.remove(); },
    zoom() {}, pan() {},
    at(i) {
      const r = svg.getBoundingClientRect(), s = stage.getBoundingClientRect(), k = Math.min(r.width, r.height) / 200, [x, y] = geo().mid(i);
      return { x: r.left - s.left + r.width / 2 + x * k, y: r.top - s.top + r.height / 2 + y * k };
    },
  };
}

// ---- writing orders ----
/** The choices open to the chosen province, by kind of order. */
function offers(p, at) {
  const all = ordersAt(p, at), b = boardOf(p);
  return {
    hold: [{ value: "hold", label: "Hold", o: { kind: "hold" } }],
    move: [...new Set(all.filter((o) => o.kind === "move").map((o) => o.to))].map((to) => ({ value: to, label: nameOf(p, to), note: `${b.near[at].includes(to) ? "" : "by sea, needs a transport; "}${p.owner[to] === NONE ? "nobody's" : p.owner[to] === p.seat ? "yours" : `${NAMES[p.owner[to]]}, ${p.str[to]}`}`, rgb: p.owner[to] === NONE ? null : RGB[p.owner[to]], o: { kind: "move", to } })).sort((x, y) => (p.owner[x.value] === p.seat) - (p.owner[y.value] === p.seat) || x.value - y.value),
    support: all.filter((o) => o.kind === "support").map((o) => ({ value: `${o.to}:${o.seat}`, label: o.seat === p.owner[o.to] ? `${NAMES[o.seat]} holds ${nameOf(p, o.to)}` : `${NAMES[o.seat]} into ${nameOf(p, o.to)}`, rgb: RGB[o.seat], o: { kind: "support", to: o.to, seat: o.seat } })).sort((x, y) => (y.o.seat === p.seat) - (x.o.seat === p.seat) || x.o.to - y.o.to || x.o.seat - y.o.seat),
    transport: all.filter((o) => o.kind === "transport").map((o) => ({ value: `${o.a}:${o.b}`, label: `${nameOf(p, o.a)} and ${nameOf(p, o.b)}`, o: { kind: "transport", a: o.a, b: o.b } })).sort((x, y) => (p.owner[y.o.a] === p.seat || p.owner[y.o.b] === p.seat) - (p.owner[x.o.a] === p.seat || p.owner[x.o.b] === p.seat)),
  };
}
const valueOf = (o) => (o.kind === "move" ? o.to : o.kind === "support" ? `${o.to}:${o.seat}` : o.kind === "transport" ? `${o.a}:${o.b}` : "hold");

function tap(T, i) {
  if (!writing(T)) return undefined;
  const p = T.match.position;
  if (p.owner[i] === p.seat) { chosen = chosen === i ? null : i; if (chosen !== null) kind = draft.get(i)?.kind || (p.str[i] > 1 ? "move" : "support"); return T.refresh(); }
  if (chosen === null) return toast("Choose one of your provinces first.");
  const o = offers(p, chosen);
  if (kind === "support") {
    const pick = o.support.find((x) => x.o.to === i && x.o.seat === p.seat); // a tap backs your own move there (or your own hold); others' are in the list
    if (pick) { draft.set(chosen, pick.o); return T.refresh(); }
  } else {
    const pick = o.move.find((x) => x.value === i);
    if (pick) { draft.set(chosen, { ...pick.o, n: p.str[chosen] - 1 }); kind = "move"; return T.refresh(); }
  }
  return toast(`${nameOf(p, chosen)} cannot reach ${nameOf(p, i)} that way.`);
}

function seal(T) {
  if (!writing(T)) return;
  for (const [at, o] of [...draft].sort((x, y) => x[0] - y[0])) if (o.kind !== "hold") T.match.play({ do: "order", at, ...o });
  draft = new Map(); chosen = null;
  T.play({ do: "done" });
}

// ---- the talk ----
/** A promise in words: who to whom, the form, and its mark when it has one. */
function pledgeText(p, f, viewer = -1) {
  const by = f.by === viewer ? "You" : NAMES[f.by], to = f.to < 0 ? "everyone" : f.to === viewer ? "you" : NAMES[f.to];
  return `${by} to ${to}: ${formText(f, named(p))}${f.mark ? ` ${MARK_WORDS[f.mark]}.` : ""}`;
}
function talkPanel(T) {
  const p = T.match.position, s = p.seat, asking = mode === "ask", seats = Array.from({ length: p.seats }, (_, k) => k).filter((k) => k !== s && alive(p, k));
  const left = WORDS - said.length;
  $("status").textContent = headline(T, s, "talk, before anyone writes");
  $("talk-say").textContent = `${seasonText(p)}. Promise, or ask a promise in return. A seat you ask accepts or declines all you said to it. Promises are marked kept or broken after the reveal, never enforced. ${left ? `${left} more this season.` : "That is all for this season."}`;
  // who sits here, for a solo player reading the bots
  const cast = seats.filter((k) => isBot(T, k)).map((k) => { const li = el("li"); li.append(sign(k), el("b", NAMES[k]), ` ${castLine(T, p, k)}`); return li; });
  $("talk-cast").replaceChildren(...cast);
  $("talk-cast").hidden = !cast.length;
  const last = p.ledger.filter((e) => (e.by === s || e.to === s) && e.year === (p.half ? p.year : p.year - 1) && e.half === 1 - p.half);
  $("talk-last").replaceChildren(...(last.length ? [el("b", "Last season"), ...last.map((e) => el("p", pledgeText(p, e, s), e.mark))] : []));
  $("talk-last").hidden = !last.length;
  radio($("talk-mode"), [{ value: "promise", label: "I promise" }, { value: "ask", label: "I ask" }], mode, (v) => { mode = v; if (v === "ask" && whom === -1) whom = null; form = where = null; T.refresh(); });
  const to = [...(asking ? [] : [{ value: -1, label: "Everyone", note: "a public pledge" }]), ...seats.map((k) => ({ value: k, label: NAMES[k], rgb: RGB[k], note: T.kinds[k] === "you" ? "a person" : isBot(T, k) ? characterOf(p, k).name : "" }))];
  if (whom !== null && !to.some((x) => x.value === whom)) whom = null;
  radio($("talk-who"), to, whom, (v) => { whom = v; form = where = null; T.refresh(); });
  const list = whom === null ? [] : asking ? formsOf(p, whom, s) : formsOf(p, s, whom), kinds = [...new Set(list.map((f) => f.form))];
  if (form !== null && !kinds.includes(form)) form = where = null;
  $("talk-form").hidden = whom === null;
  radio($("talk-form"), kinds.map((k) => ({ value: k, label: FORM_NAMES[k] })), form, (v) => { form = v; where = null; T.refresh(); });
  const places = list.filter((f) => f.form === form), needs = places.length > 1 || (places[0] && (places[0].at !== undefined || places[0].a !== undefined));
  const placeOf = (f) => (f.form === "carry" ? `${f.a}:${f.b}` : f.at ?? "");
  $("talk-where").hidden = !form || !needs;
  radio($("talk-where"), places.map((f) => ({ value: placeOf(f), label: f.form === "carry" ? `${nameOf(p, f.a)} and ${nameOf(p, f.b)}` : nameOf(p, f.at), rgb: f.at !== undefined && p.owner[f.at] >= 0 ? RGB[p.owner[f.at]] : null })), where, (v) => { where = v; T.refresh(); });
  const word = form && (needs ? places.find((f) => placeOf(f) === where) : places[0]);
  const dup = word && said.some((w) => w.do === mode && w.to === whom && w.form === word.form && placeOf(w) === placeOf(word));
  $("talk-preview").textContent = word ? `${asking ? `You ask ${NAMES[whom]}: ` : whom < 0 ? "You pledge to everyone: " : `You promise ${NAMES[whom]}: `}${formText({ ...word, to: whom }, named(p), asking)}` : "Choose whom, then a form.";
  $("talk-add").disabled = !word || dup || !left;
  $("talk-add").textContent = dup ? "Already said" : "Say it";
  $("talk-add").onclick = () => { if (!word || dup || !left) return; said.push({ do: mode, ...word, to: whom }); form = where = null; T.refresh(); };
  $("talk-list").replaceChildren(...said.map((w, i) => { const li = el("li"); li.append(el("span", `${w.do === "ask" ? `Ask ${NAMES[w.to]}` : w.to < 0 ? "To everyone" : `To ${NAMES[w.to]}`}: ${formText(w, named(p), w.do === "ask")}`), button("Take back", "quiet", () => { said.splice(i, 1); T.refresh(); })); return li; }));
  $("talk-done").textContent = said.length ? `Say ${said.length === 1 ? "it" : `these ${said.length}`} and finish` : "Say nothing this season";
  $("talk-done").onclick = () => finishTalk(T);
  T.board.clear();
}
function finishTalk(T) {
  if (!T.ready() || T.match.position.stage !== "talk") return;
  for (const { do: d, ...w } of said) T.match.play({ do: d, ...w });
  said = [];
  T.play({ do: "done" });
}

function answerPanel(T) {
  const p = T.match.position, s = p.seat, from = pending(p, s);
  $("status").textContent = headline(T, s, "answer the bargains offered you");
  $("answer").replaceChildren(el("p", "Accept, and both sides' promises stand this season. Decline, and none of them does."), ...from.map((k) => {
    const box = el("div", undefined, "offer"), { give, ask } = offerOf(p, k, s), h = el("h3");
    h.append(sign(k), NAMES[k], ...(isBot(T, k) ? [el("small", ` ${characterOf(p, k).name}`)] : []));
    box.append(h);
    if (give.length) { const u = el("ul"); u.append(...give.map((f) => el("li", formText(f, named(p))))); box.append(el("p", `${NAMES[k]} promises you:`), u); }
    { const u = el("ul"); u.append(...ask.map((f) => el("li", formText({ ...f, to: k }, named(p), true)))); box.append(el("p", `${NAMES[k]} asks of you:`), u); }
    const row = el("div", undefined, "go");
    row.append(button("Decline", "quiet", () => T.play({ do: "answer", from: k, yes: false })), button("Accept", "main", () => T.play({ do: "answer", from: k, yes: true })));
    box.append(row);
    return box;
  }));
  T.board.clear();
}

// ---- the reveal, step by step ----
/** The reveal as steps: the sheets, supports and transports, the moves meeting, the board after, the ledger, winter. */
function stepsOf(T, p, events, before) {
  const name = named(p), b = boardOf(p), orders = events.filter((e) => e.kind === "order").map((e) => e.r), r = resolve(b, before.owner, before.str, before.orders);
  const shown = orders.filter((o) => o.kind !== "hold"), helps = (o) => o.kind === "support" || o.kind === "transport";
  const sentence = (o) => `${NAMES[o.of]}: ${reason(o, name, who)}`, me = viewer(T);
  const steps = [
    { title: "The sheets", say: shown.length ? "Every order at once, as written. Nothing has happened yet. Tap an arrow for its sentence." : "Every province held: nobody wrote an order.", board: before, arrows: shown.map((o) => ({ ...o })), lines: [] },
    { title: "Supports and transports", say: "First, an attack on a supporter or a carrier cuts it, unless it comes from where the support is aimed.", board: before, arrows: shown.map((o) => ({ ...o, failed: helps(o) && BAD.includes(o.code), lit: helps(o) })), lines: orders.filter(helps).map(sentence) },
    { title: "The moves meet", say: "Then the moves: the strongest arrival takes a province only if it beats the defence and every other arrival.", board: before, arrows: shown.map((o) => ({ ...o, failed: BAD.includes(o.code), lit: o.kind === "move" })), lines: orders.filter((o) => o.kind === "move" || (o.kind === "hold" && o.code !== "held")).map(sentence) },
    { title: "After the reveal", say: "Takers advance; whoever bounced comes home one weaker.", board: { owner: r.owner, str: r.str }, arrows: shown.filter((o) => o.code === "took" || o.code === "joined").map((o) => ({ ...o, lit: true })), lines: events.filter((e) => e.kind === "take").map((e) => `${NAMES[e.seat]} takes ${name(e.at)}${e.was >= 0 ? ` from ${NAMES[e.was]}` : ""}, and ${e.n} stand there now.`) },
  ];
  const marks = events.filter((e) => e.kind === "promise" && (e.to < 0 || (me >= 0 && (e.by === me || e.to === me))));
  const hidden = events.filter((e) => e.kind === "promise").length - marks.length;
  if (marks.length || hidden) steps.push({ title: "The ledger", say: "Every promise in force is marked from the orders: kept, broken, or void when it could not apply.", board: { owner: r.owner, str: r.str }, arrows: [], lines: [...marks.map((e) => pledgeText(p, e, me)), ...(hidden ? [`${hidden} private promise${hidden === 1 ? " was" : "s were"} marked too: only the two seats of each see how.`] : [])], marks: marks.map((e) => e.mark) });
  const winter = events.filter((e) => ["winter", "score", "out"].includes(e.kind));
  if (winter.length) steps.push({ title: "Winter", say: "Each port grows 1; strength past supply is lost.", board: { owner: [...p.owner], str: [...p.str] }, arrows: [], lines: winter.map((e) => line(e, p)) });
  return steps;
}
function replayPanel(T) {
  const p = T.match.position, n = reveal.steps.length, s = reveal.steps[reveal.step];
  $("status").textContent = `The reveal: ${reveal.title}`;
  $("replay-title").textContent = `Step ${reveal.step + 1} of ${n}: ${s.title}`;
  $("replay-say").textContent = s.say;
  const bar = $("replay-bar");
  bar.max = String(n - 1); bar.value = String(reveal.step);
  bar.setAttribute("aria-valuetext", `Step ${reveal.step + 1} of ${n}: ${s.title}`);
  bar.oninput = () => { reveal.step = Number(bar.value); T.refresh(); T.board.show(); };
  $("replay-lines").replaceChildren(...(s.lines.length || !reveal.step ? [] : [el("li", "Nothing of this kind this season.", "void")]), ...s.lines.map((t, i) => el("li", t, s.marks ? s.marks[i] || "" : /bounced|was cut|went unused|could not cross|was taken by|fell to/.test(t) ? "bad" : "")));
  $("replay-back").disabled = reveal.step === 0;
  $("replay-back").onclick = () => { reveal.step--; T.refresh(); T.board.show(); };
  $("replay-next").textContent = reveal.step === n - 1 ? (p.stage === "talk" ? "On to the talk" : "Done") : "Next";
  $("replay-next").onclick = () => { if (reveal.step < n - 1) reveal.step++; else reveal.done = true; T.refresh(); T.board.show(); };
  $("replay-skip").hidden = reveal.step === n - 1;
  $("replay-skip").onclick = () => { reveal.done = true; T.refresh(); T.board.show(); };
  $("replay-all").onclick = () => showReveal(T);
  T.board.light([]);
}

// ---- the record ----
function revealBody(T) {
  const box = el("div", undefined, "reveal");
  if (!reveal) { box.append(el("p", "Nothing has been revealed yet. When every sheet is sealed, all orders are shown at once.")); return box; }
  const p = T.match.position, name = named(p), ev = reveal.events, seats = p.seats;
  for (let s = 0; s < seats; s++) {
    const mine = ev.filter((e) => e.kind === "order" && e.seat === s);
    if (!mine.length) continue;
    const h = el("h3"), u = el("ul"), still = mine.filter((e) => e.r.kind === "hold" && e.r.code === "held");
    h.append(sign(s), NAMES[s]);
    u.append(...mine.filter((e) => !still.includes(e)).map((e) => el("li", reason(e.r, name, who), BAD.includes(e.r.code) ? "bad" : "")));
    if (still.length) u.append(el("li", `Held quietly: ${still.map((e) => name(e.r.at)).join(", ")}.`, "quiet-holds"));
    box.append(h, u);
  }
  for (const s of reveal.steps.slice(3)) if (s.lines.length) { const u = el("ul"); u.append(...s.lines.map((t, i) => el("li", t, s.marks?.[i] || ""))); box.append(el("h3", s.title === "After the reveal" ? "Changed hands" : s.title), u); }
  return box;
}
function showReveal(T) { if (reveal) sheet(`The reveal: ${reveal.title}`, revealBody(T), "Close", "paper"); }

/** The ledger, season by season: all of it once the game is over, else what this screen may show. */
function ledgerBody(T, all = false, seasons = true) {
  const p = T.match.position, me = viewer(T), list = all ? p.ledger : me >= 0 ? ledgerFor(p, me) : p.ledger.filter((e) => e.to < 0), box = el("div", undefined, "ledger");
  if (!list.length) { box.append(el("p", all ? "No promise was made in this game." : "No promise you can see has been marked yet.")); return box; }
  const sum = el("table"), head = el("tr");
  head.append(...["Seat", "Kept", "Broken", "Void"].map((t) => el("th", t)));
  sum.append(head, ...Array.from({ length: p.seats }, (_, s) => { const tr = el("tr"), th = el("th"); th.append(sign(s), NAMES[s]); tr.append(th, ...["kept", "broken", "void"].map((m) => el("td", String(list.filter((e) => e.by === s && e.mark === m).length)))); return tr; }));
  const scroll = el("div", undefined, "ranks");
  scroll.append(sum);
  box.append(scroll);
  const first = list.find((e) => e.mark === "broken");
  box.append(el("p", first ? `The first promise broken: ${HALVES[first.half]}, year ${first.year}. ${pledgeText(p, first, all ? -1 : me)}` : "No promise was broken.", "about"));
  if (!seasons) { box.append(el("p", "Season by season: the menu, The reveal and the ledger.", "about")); return box; }
  for (const key of [...new Set(list.map((e) => `${e.year}/${e.half}`))]) {
    const [y, h] = key.split("/").map(Number), u = el("ul");
    u.append(...list.filter((e) => e.year === y && e.half === h).map((e) => el("li", pledgeText(p, e, all ? -1 : me), e.mark)));
    box.append(el("h3", `${HALVES[h]}, year ${y}`), u);
  }
  return box;
}
function castBody(T) {
  const p = T.match.position, u = el("ul", undefined, "cast");
  u.append(...Array.from({ length: p.seats }, (_, s) => { const li = el("li"); li.append(sign(s), el("b", NAMES[s]), ` ${T.kinds[s] === "you" ? "A person." : castLine(T, p, s)}`); return li; }));
  return u;
}

function line(e, p) {
  const name = named(p);
  if (e.kind === "sealed") return `${NAMES[e.seat]} sealed its orders.`;
  if (e.kind === "talked") return `The talk is over: ${e.open} promise${e.open === 1 ? "" : "s"} in public, ${e.closed} in private.`;
  if (e.kind === "reveal") return `The reveal: ${HALVES[e.half]}, year ${e.year}.`;
  if (e.kind === "order") return e.r.kind === "hold" && e.r.code === "held" ? "" : `${NAMES[e.seat]}: ${reason(e.r, name, who)}`;
  if (e.kind === "promise") return e.to < 0 ? `${NAMES[e.by]}'s public pledge, "${formText(e, name)}": ${MARK_WORDS[e.mark].toLowerCase()}.` : "";
  if (e.kind === "take") return `${NAMES[e.seat]} takes ${name(e.at)}${e.was >= 0 ? ` from ${NAMES[e.was]}` : ""}.`;
  if (e.kind === "winter") return `${NAMES[e.seat]}: ${e.grew} grew at its ports${e.lost ? `, and ${e.lost} were lost past its supply of ${e.supply}` : ""}.`;
  if (e.kind === "score") return `${NAMES[e.seat]} scores ${e.n}: ${e.all} points.`;
  if (e.kind === "out") return `${NAMES[e.seat]} holds no land and is out.`;
  return "";
}

// ---- the lesson: a short guided game (site/coach.js) ----
const HOME = 4, BESIDE = 5; // Amber's home, and the empty midland beside it
const LESSON = {
  seed: "margins lesson 1", options: { style: "classic", seats: 3, years: 4 }, kinds: ["you", "normal", "normal"],
  steps: [
    { say: () => `Each season begins with talk. A promise is a fixed form, said to one seat or to everyone. Choose ${NAMES[1]}, then No strikes: a promise not to move into ${NAMES[1]}'s land.`, at: () => $("talk-who"), when: (T) => T.match.position.stage === "talk", done: (T) => T.match.position.stage !== "talk" || said.length > 0 || form === "no-strike" },
    { say: () => `Press Say it, then ask ${NAMES[1]} for the same in return: I ask, ${NAMES[1]}, No strikes, Say it. A seat you ask answers yes or no to everything you said to it.`, at: () => (said.length ? $("talk-mode") : $("talk-add")), when: (T) => T.match.position.stage === "talk", done: (T) => T.match.position.stage !== "talk" || said.some((w) => w.do === "ask"), next: (T) => T.match.position.stage !== "talk" },
    { say: "Finish the talk. Words are said only now, and nobody sees a promise made to someone else.", at: () => $("talk-done"), when: (T) => T.match.position.stage === "talk", done: (T) => T.match.position.stage !== "talk" },
    { say: "A bot offers you a bargain. Read what it promises and what it asks, then accept or decline.", at: () => $("answer").querySelector("button.main"), when: (T) => T.match.position.stage === "answer", pass: (T) => T.match.position.stage === "write", done: (T) => T.match.position.stage === "write" },
    { say: "Now the orders, in secret. Choose your home, the province with 3: on the board, or in the list.", at: (T) => (T.match.position.owner[HOME] === 0 ? HOME : undefined), or: () => $("sources"), when: (T) => T.match.position.stage === "write", done: (T) => chosen === HOME || draft.size > 0 },
    { say: "Tap the lit empty land beside it to move there. One always stays behind.", at: () => BESIDE, or: () => $("targets"), when: (T) => T.match.position.stage === "write", done: () => [...draft.values()].some((o) => o.kind === "move") },
    { say: "Seal your orders. Nobody sees them until every sheet is sealed; then all are revealed at once.", at: () => $("do"), when: (T) => T.match.position.stage === "write", done: () => !!reveal },
    { say: "Step through the reveal. Every order says what happened to it and why. Tap an arrow for its sentence.", at: () => $("replay-next"), when: () => !!reveal && !reveal.done, done: () => !!reveal && (reveal.done || reveal.steps[reveal.step].title === "The ledger") },
    { say: "The ledger marks every promise kept, broken or void, beside the orders that decided it. The game never enforces a promise: whom you trust is your call. Play on.", next: true },
  ],
};

const table = createTable({
  game: margins, key: "margins", title: "Margins of Trust", won: "The ports are yours.", seats: [3, 4, 5], normal: 4, lengths: [], hard: true, nameOf, unit: "Ports",
  links: false, // play by link waits for sealed sheets (the plan's stage 2): until then no friend by link here
  family: "Inspired by the family of negotiation games where everyone writes orders in secret and all are revealed at once. Not affiliated with or endorsed by the makers of any of them: the rules, names, map and art are our own.",
  quick: { style: "classic", seats: 3, years: 4 },
  lesson: LESSON,
  outOf: (p, s) => !alive(p, s),
  cellsOf: portsOf, landOf: (p) => boardOf(p).ports, goalOf: toWin,
  placeOf: (p, s) => (p.points ? 1000 * p.points[s] : 0) + 100 * portsOf(p, s) + mineOf(p, s).length,
  roundText: (p) => `${seasonText(p)}${p.over ? "" : `: ${{ talk: "talk", answer: "answers", write: "orders" }[p.stage]}`}`,
  pace: (p) => (p.stage === "write" ? 40 : 25), // a bot talks and writes quickly; the reveal is what is read
  choose, thinking,
  summary: (T) => { const r = T.match.result; return `${r.winners.map((s) => NAMES[s]).join(" and ")} ${r.why}.`; },
  report(T) { const box = el("div", undefined, "paper-note"); box.append(el("h3", "The ledger"), ledgerBody(T, true, false), el("h3", "At this table"), castBody(T)); return box; },
  about: {
    classic: `Traditional: the classic shape.\nThree to five powers round an inner sea. Before each season everyone may make promises in fixed forms, and bargain; then everyone writes an order for every province, in secret, and all are revealed at once. Every order says what happened to it and why, and a ledger marks every promise kept or broken. No dice. Hold more than half the ports at a winter, or from the ${["", "first", "second", "third", "fourth"][LEADS]} winter more ports than anyone else, to win.\nOur own game: our own map, names and rules. Early: the 3D table and play by link come later.`,
    ours: "Capo: our own evening game.\nFour scored years. At each winter you score 1 for each port you hold, and in each land 3 for holding the most provinces there and 1 for the next most. The most points after the last winter wins; more ports, then the better word (promises kept less broken), break a tie.\nEarly: coin, depots and standing come later.",
  },
  choices: [{ key: "years", label: "Length", normal: 0, values: [[0, `The rules' own (${YEARS.classic} years, Capo ${YEARS.ours})`], [2, "2 years"], [3, "3 years"], [4, "4 years"], [6, "6 years"], [8, "8 years"]] }],
  stats: (p, s) => [["Provinces", mineOf(p, s).length], ["Strength", strengthOf(p, s)], ...(p.points ? [["Points", p.points[s]]] : []), ...(shell && isBot(shell, s) && shell.kinds[s] !== "easy" ? [["Bot", characterOf(p, s).name.replace(/^the /, "")]] : [])],
  line,
  seen(T, events) {
    const r = events.find((e) => e.kind === "reveal");
    if (!r) return;
    const m = T.match, evs = events.slice(events.indexOf(r)), before = m.at(m.list.length - 1);
    reveal = { events: evs, title: `${HALVES[r.half]}, year ${r.year}`, step: 0, done: T.demo || !T.kinds.includes("you") || m.turn === null, steps: stepsOf(T, m.position, evs, before) };
    $("last").hidden = T.demo;
  },
  fresh() { draft = new Map(); draftKey = ""; chosen = null; kind = "move"; opened = ""; reveal = null; said = []; mode = "promise"; whom = form = where = null; $("last").hidden = true; },
  order: (events) => events.flatMap((e) => (e.kind === "take" ? [e.at] : [])),
  board: (T, stage) => ringBoard(T, stage),
  panel(T) {
    sync(T);
    const p = T.match.position, s = p.seat, replay = replaying(T), cover = !replay && covered(T);
    for (const id of ["replay", "talk", "answer", "orders"]) $(id).hidden = true;
    $("last").hidden = T.demo || !reveal || replay;
    $("cover").hidden = !cover;
    $("choice").hidden = cover;
    if (replay) { $("replay").hidden = false; replayPanel(T); return; }
    if (cover) {
      $("status").textContent = `Pass to ${NAMES[s]}`;
      $("cover-say").textContent = `${NAMES[s]} ${p.stage === "talk" ? "talks" : p.stage === "answer" ? "answers" : "writes"} next, in secret. Only ${NAMES[s]} should look until ${p.stage === "write" ? "the sheet is sealed" : "it is done"}.`;
      $("open-sheet").textContent = `I am ${NAMES[s]}: open`;
      $("open-sheet").onclick = () => { opened = keyOf(T.match.position); T.refresh(); };
      T.board.clear();
      return;
    }
    if (p.stage === "talk") { $("talk").hidden = false; talkPanel(T); return; }
    if (p.stage === "answer") { $("answer").hidden = false; answerPanel(T); return; }
    $("orders").hidden = false;
    const mine = mineOf(p, s), b = boardOf(p), threat = threats(p, s);
    if (chosen !== null && p.owner[chosen] !== s) chosen = null;
    $("status").textContent = headline(T, s, "write your orders");
    const o = chosen === null ? null : offers(p, chosen), now = chosen === null ? null : draft.get(chosen) || { kind: "hold" };
    const kinds = chosen === null ? [] : ["hold", ...(o.move.length ? ["move"] : []), ...(o.support.length ? ["support"] : []), ...(o.transport.length ? ["transport"] : [])];
    if (chosen !== null && !kinds.includes(kind)) kind = now.kind;
    $("info").textContent = chosen === null
      ? `${seasonText(p)}. ${draft.size ? `${draft.size} of ${mine.length} provinces have orders; the rest hold.` : "Provinces you give no order hold."} Choose a province of yours, on the map or in the list, then seal your sheet.`
      : `${nameOf(p, chosen)}: ${p.str[chosen]} strong${b.port[chosen] ? ", a port" : ""}${threat[chosen] ? `; a rival beside it could bring ${threat[chosen]}` : ""}. Order: ${orderText(now, named(p), who)}.`;
    const vows = p.pledges.filter((f) => f.by === s || f.to === s || f.to < 0);
    $("vows").replaceChildren(...(vows.length ? [el("b", "Promises this season"), ...vows.map((f) => el("p", pledgeText(p, f, s)))] : []));
    $("vows").hidden = !vows.length;
    const front = (i) => b.near[i].some((j) => p.owner[j] !== s);
    radio($("sources"), [...mine].sort((x, y) => front(y) - front(x) || p.str[y] - p.str[x] || x - y).map((i) => ({ value: i, label: nameOf(p, i), note: `${p.str[i]}${b.port[i] ? ", port" : ""}: ${draft.has(i) ? orderText(draft.get(i), named(p), who) : "hold"}`, rgb: RGB[s] })), chosen, (v) => { chosen = v; kind = draft.get(v)?.kind || (p.str[v] > 1 ? "move" : "support"); T.refresh(); });
    $("kinds").hidden = chosen === null;
    radio($("kinds"), kinds.map((k) => ({ value: k, label: { hold: "Hold", move: "Move", support: "Support", transport: "Transport" }[k] })), kind, (v) => { kind = v; if (v === "hold") draft.delete(chosen); T.refresh(); });
    const list = chosen === null || kind === "hold" ? [] : o[kind];
    $("targets").hidden = !list.length;
    $("targets").setAttribute("aria-label", kind === "support" ? "Whose move or hold to support" : kind === "transport" ? "Which crossing to carry" : "Where to");
    radio($("targets"), list, now && now.kind === kind ? valueOf(now) : null, (v) => {
      const pick = list.find((x) => x.value === v);
      draft.set(chosen, kind === "move" ? { ...pick.o, n: now.kind === "move" ? now.n : p.str[chosen] - 1 } : pick.o);
      T.refresh();
    });
    const moving = chosen !== null && now.kind === "move" && kind === "move";
    $("counts").hidden = !moving || p.str[chosen] < 3;
    if (moving) radio($("counts"), Array.from({ length: p.str[chosen] - 1 }, (_, k) => ({ value: k + 1, label: String(k + 1) })), now.n, (v) => { draft.set(chosen, { ...now, n: v }); T.refresh(); });
    $("clear").disabled = !draft.size;
    $("clear").onclick = () => { draft = new Map(); chosen = null; T.refresh(); };
    $("do").textContent = draft.size ? `Seal my orders (${draft.size})` : "Seal: everything holds";
    $("do").onclick = () => seal(T);
    const reach = chosen === null ? [] : kind === "move" ? o.move.map((x) => x.value) : kind === "support" ? [...new Set(o.support.map((x) => x.o.to))] : [];
    T.board.light(reach, { ring: chosen ?? -1 });
  },
  changed() {},
  listing: (T) => { const p = T.match.position, b = boardOf(p); return { head: ["Province", "Whose", "Strong", "Port", "Land", "Borders"], rows: p.owner.map((o, i) => [nameOf(p, i), o === NONE ? "Nobody's" : NAMES[o], p.str[i], b.port[i] ? "Port" : "", b.lands[b.land[i]], b.near[i].map((j) => nameOf(p, j)).join(", ")]) }; },
  keys(T, k) {
    if (replaying(T)) { if (k === "n" || k === "arrowright") $("replay-next").click(); else if (k === "arrowleft" && reveal.step) $("replay-back").click(); return; }
    if (k === "escape") { chosen = null; T.refresh(); } else if (k === "e") { if (T.match.position.stage === "talk") finishTalk(T); else seal(T); }
  },
  more: { label: "The reveal and the ledger", body: (T) => { const box = el("div"); box.append(revealBody(T), el("h3", "The ledger"), ledgerBody(T, T.match.turn === null), el("h3", "At this table"), castBody(T)); return box; } },
  rules: (_, p) => {
    const style = p?.style || "classic", years = p?.years || YEARS[style];
    return [
      "Early: Margins of Trust is new. The rules, the map, the promises, the ledger and the bots are in. A sandbox, the 3D table and play by link come next.",
      `Three to five seats share a land of three rings round ${SEA}: ports on the shore, midlands, then uplands. Each seat starts in its own march with three provinces: a home with 3, a port and an upland with 1 each.`,
      "A year has a spring and an autumn. Each season has three parts: talk, answers, orders.",
      `Talk: each seat in turn may say up to ${WORDS} things, in fixed forms: I will not enter a province; I will support your move into a province; I will support your hold of one; I will hold one; I will not move into any province of yours; I will carry your move across the sea. A promise goes to one seat, or to everyone as a public pledge. You may also ask a seat for a promise in return.`,
      "Answers: a seat you asked for something accepts or declines all you said to it. Accepted, both sides' promises stand for the season; declined, none of them does. A promise with nothing asked always stands.",
      "Orders: everyone writes one order for each province they hold, in secret. A province with no order holds. When the last sheet is sealed, every order is revealed at once, and each one says what happened to it and why. Step through the reveal, or skip it.",
      "The ledger: after the reveal every promise in force is marked kept, broken, or void when it could not apply. The game never enforces a promise. A private promise's mark is seen only by its two seats; a public pledge's by everyone; at the end, all of it.",
      "Bots each have a character, shown at the table: one keeps every promise, one breaks its word only to a seat that broke a promise to it, one forgives once, one turns on whoever leads, one breaks a promise that stands in its way one time in two, one never breaks a public pledge. Easy bots say nothing.",
      "Move: send some of a province's strength to a neighbour, always leaving 1 behind. Into empty land it simply arrives; into a rival's province it attacks. A port may also move to a port across the sea, if a transport carries it.",
      "Support: a province adds 1 to a seat's move into a neighbouring province, or to the hold of one. An attack on the supporter by land cuts it, unless the attack comes from the province the support is aimed at.",
      "Transport: a port carries a move between two ports across the sea, for anyone. An attack on the port by land cuts it.",
      "Who takes a province: what stays there, with its own seat's arrivals and supports, defends. The strongest arrival (the strength moved, plus supports) takes it only if it is stronger than the defence and than every other arrival. The defenders are lost, and the taker loses half of what stood there. Everyone else bounces home one weaker, or is lost if home was taken meanwhile.",
      "Two seats moving into each other's provinces by land meet head on: the weaker bounces, both when equal.",
      "Winter, after autumn: each port you hold grows 1. Your supply is 1 for each province and 2 more for each port; strength past it is lost from your strongest provinces.",
      style === "classic" ? `To win: hold more than half the ports at a winter; or, from the ${["", "first", "second", "third", "fourth"][LEADS]} winter, hold more ports than every other seat. After ${years} years, the most ports wins, ties shared. A seat with no land is out.` : `To win: points at each winter, 1 for each port, and in each land 3 for the most provinces there and 1 for the next most. After ${years} years the most points wins; a tie goes to more ports, then the better word (promises kept less broken), then more provinces.`,
      "Several people on one device: before each turn the panel asks for the device to be passed, and opens only when its owner says so. A save holds what was said and sealed this season, so keep it to yourself until the reveal.",
      "Keys: Tab and arrows choose, Enter acts, Escape lets go, E twice finishes your talk or seals your sheet; in the reveal, N or the right arrow steps on.",
    ];
  },
});
shell = table;
$("last").onclick = () => showReveal(table);
