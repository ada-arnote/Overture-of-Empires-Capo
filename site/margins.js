// SPDX-License-Identifier: AGPL-3.0-or-later
// Margins of Trust on the table (early): write your orders in secret, seal them, and read the reveal, where every
// order says what happened to it and why. A flat board of three rings round an inner sea, drawn here in SVG.
import { HALVES, NONE, YEARS, alive, boardOf, margins, mineOf, nameOf, orderText, ordersAt, portsOf, reason, seasonText, strengthOf, supplyOf, toWin } from "../src/games/margins/rules.js";
import { choose, thinking, threats } from "../src/games/margins/bot.js";
import { SEA } from "../src/games/margins/map.js";
import { $, NAMES, RGB, createTable, el, radio, sheet, sign, toast } from "./table.js";

const PAPER = [233, 221, 190], INK = "#2b2219";
const BAD = ["lost", "held-off", "tie", "outdone", "swap", "no-transport", "cut", "void", "fell"];
// what is being written: the orders so far (by province), for which season and seat, and what is chosen
let draft = new Map(), draftKey = "", chosen = null, kind = "move", opened = "", reveal = null;
const keyOf = (p) => `${p.round}/${p.seat}`;
const named = (p) => (i) => nameOf(p, i), who = (s) => NAMES[s];
const covered = (T) => !T.solo() && opened !== keyOf(T.match.position);
const writing = (T) => T.ready() && !covered(T) && draftKey === keyOf(T.match.position);
const mix = (rgb, k) => rgb.map((v, i) => Math.round(v * k + PAPER[i] * (1 - k)));
const inkOn = (rgb) => (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114 > 140000 ? INK : "#fdf6e4");

function sync(T) {
  const k = keyOf(T.match.position);
  if (k !== draftKey) { draftKey = k; draft = new Map(); chosen = null; kind = "move"; }
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
  /** The arrows to draw: your own orders while you write them, else the last reveal's, for everyone. */
  function arrows(p) {
    if (writing(T)) return [...draft].map(([at, o]) => ({ ...o, at, of: p.seat }));
    if (!reveal) return [];
    return reveal.events.filter((e) => e.kind === "order" && e.r.kind !== "hold").map((e) => ({ ...e.r, failed: BAD.includes(e.r.code) }));
  }
  function draw() {
    const p = T.match.position, g = geo(), { b } = g, defs = make("defs");
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
      const o = p.owner[i], fill = o === NONE ? mix([206, 190, 150], 0.35 + 0.1 * (b.land[i] % 2)) : mix(RGB[o], 0.62), path = make("path", { d: wedge(g, i), fill: `rgb(${fill})`, class: `prov${hi.cells.includes(i) ? " can" : ""}${hi.ring === i ? " chosen" : ""}` });
      path.addEventListener("click", () => tap(T, i));
      const title = make("title");
      title.textContent = `${nameOf(p, i)}${b.port[i] ? ", a port" : ""}: ${o === NONE ? "nobody's" : `${NAMES[o]}, ${p.str[i]} strong`}`;
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
        n.textContent = String(p.str[i]);
        tops.push(n);
      }
    }
    for (const a of arrows(p)) {
      const s = a.of, [x0, y0] = g.mid(a.at), cls = `arrow ${a.kind}${a.failed ? " failed" : ""}`, stroke = `rgb(${RGB[s]})`;
      if (a.kind === "transport") {
        const [xa, ya] = g.mid(a.a), [xb, yb] = g.mid(a.b);
        parts.push(make("path", { d: `M${xa.toFixed(1)} ${ya.toFixed(1)}Q0 0 ${xb.toFixed(1)} ${yb.toFixed(1)}`, class: cls, stroke }));
        continue;
      }
      const [x1, y1] = g.mid(a.to), dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, cut = 4.5 / d, sx = x0 + dx * cut, sy = y0 + dy * cut, ex = x1 - dx * cut, ey = y1 - dy * cut;
      const sea = a.kind === "move" && !b.near[a.at].includes(a.to);
      const path = sea ? `M${sx.toFixed(1)} ${sy.toFixed(1)}Q${((x0 + x1) * 0.2).toFixed(1)} ${((y0 + y1) * 0.2).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}` : `M${sx.toFixed(1)} ${sy.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`;
      parts.push(make("path", { d: path, class: cls, stroke, "marker-end": `url(#${a.kind === "move" ? "head" : "dot"}-${s})` }));
    }
    svg.classList.toggle("tight", Math.min(svg.clientWidth, svg.clientHeight) < 520);
    svg.setAttribute("aria-label", `The board: ${b.n} provinces in three rings round ${SEA}. ${Array.from({ length: p.seats }, (_, s) => `${NAMES[s]} holds ${mineOf(p, s).length}, ${portsOf(p, s)} ports`).join("; ")}.`);
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
  const p = T.match.position;
  for (const [at, o] of [...draft].sort((x, y) => x[0] - y[0])) if (o.kind !== "hold") T.match.play({ do: "order", at, ...o });
  draft = new Map(); chosen = null;
  T.play({ do: "done" });
}

// ---- the reveal ----
function revealBody(T) {
  const box = el("div", undefined, "reveal");
  if (!reveal) { box.append(el("p", "Nothing has been revealed yet. When every sheet is sealed, all orders are shown at once.")); return box; }
  const p = T.match.position, name = named(p), ev = reveal.events, seats = p.seats;
  for (let s = 0; s < seats; s++) {
    const mine = ev.filter((e) => e.kind === "order" && e.seat === s);
    if (!mine.length) continue;
    const h = el("h3"), u = el("ul"), quiet = mine.filter((e) => e.r.kind === "hold" && e.r.code === "held");
    h.append(sign(s), NAMES[s]);
    u.append(...mine.filter((e) => !quiet.includes(e)).map((e) => el("li", reason(e.r, name, who), BAD.includes(e.r.code) ? "bad" : "")));
    if (quiet.length) u.append(el("li", `Held quietly: ${quiet.map((e) => name(e.r.at)).join(", ")}.`, "quiet-holds"));
    box.append(h, u);
  }
  const takes = ev.filter((e) => e.kind === "take"), winter = ev.filter((e) => ["winter", "score", "out"].includes(e.kind));
  if (takes.length) { const u = el("ul"); u.append(...takes.map((e) => el("li", `${NAMES[e.seat]} takes ${name(e.at)}${e.was >= 0 ? ` from ${NAMES[e.was]}` : ""}, and ${e.n} stand there now.`))); box.append(el("h3", "Changed hands"), u); }
  if (winter.length) { const u = el("ul"); u.append(...winter.map((e) => el("li", line(e, p)))); box.append(el("h3", "Winter"), u); }
  return box;
}
function showReveal(T) { if (reveal) sheet(`The reveal: ${reveal.title}`, revealBody(T), "Close", "paper"); }

function line(e, p) {
  const name = named(p);
  if (e.kind === "sealed") return `${NAMES[e.seat]} sealed its orders.`;
  if (e.kind === "reveal") return `The reveal: ${HALVES[e.half]}, year ${e.year}.`;
  if (e.kind === "order") return e.r.kind === "hold" && e.r.code === "held" ? "" : `${NAMES[e.seat]}: ${reason(e.r, name, who)}`;
  if (e.kind === "take") return `${NAMES[e.seat]} takes ${name(e.at)}${e.was >= 0 ? ` from ${NAMES[e.was]}` : ""}.`;
  if (e.kind === "winter") return `${NAMES[e.seat]}: ${e.grew} grew at its ports${e.lost ? `, and ${e.lost} were lost past its supply of ${e.supply}` : ""}.`;
  if (e.kind === "score") return `${NAMES[e.seat]} scores ${e.n}: ${e.all} points.`;
  if (e.kind === "out") return `${NAMES[e.seat]} holds no land and is out.`;
  return "";
}

const table = createTable({
  game: margins, key: "margins", title: "Margins of Trust", won: "The ports are yours.", seats: [3, 4, 5], normal: 4, lengths: [], hard: true, nameOf, unit: "Ports",
  family: "Inspired by the family of negotiation games where everyone writes orders in secret and all are revealed at once. Not affiliated with or endorsed by the makers of any of them: the rules, names, map and art are our own.",
  quick: { style: "classic", seats: 3, years: 4 },
  outOf: (p, s) => !alive(p, s),
  cellsOf: portsOf, landOf: (p) => boardOf(p).ports, goalOf: toWin,
  placeOf: (p, s) => (p.points ? 1000 * p.points[s] : 0) + 100 * portsOf(p, s) + mineOf(p, s).length,
  roundText: seasonText,
  pace: () => 40, // a bot writes its sheet quickly; the reveal is what is read
  choose, thinking,
  summary: (T) => { const r = T.match.result; return `${r.winners.map((s) => NAMES[s]).join(" and ")} ${r.why}.`; },
  about: {
    classic: "Traditional: the classic shape.\nThree to five powers round an inner sea. Each season everyone writes an order for every province, in secret; then all are revealed at once, and every order says what happened to it and why. No dice. Ports grow strength each winter. Hold more than half the ports at a winter to win; when the years run out, the most ports wins.\nOur own game: our own map, names and rules. Early: promises, the ledger and the 3D table come later.",
    ours: "Capo: our own evening game.\nFour scored years. At each winter you score 1 for each port you hold, and in each land 3 for holding the most provinces there and 1 for the next most. The most points after the last winter wins; more ports break a tie.\nEarly: coin, depots and public pledges come later.",
  },
  choices: [{ key: "years", label: "Length", normal: 0, values: [[0, `The rules' own (${YEARS.classic} years, Capo ${YEARS.ours})`], [2, "2 years"], [3, "3 years"], [4, "4 years"], [6, "6 years"], [8, "8 years"]] }],
  stats: (p, s) => [["Provinces", mineOf(p, s).length], ["Strength", strengthOf(p, s)], ...(p.points ? [["Points", p.points[s]]] : [])],
  line,
  seen(T, events) {
    const r = events.find((e) => e.kind === "reveal");
    if (!r) return;
    reveal = { events: events.slice(events.indexOf(r)), title: `${HALVES[r.half]}, year ${r.year}` };
    $("last").hidden = T.demo;
    if (!T.demo && !T.catching && T.kinds.includes("you") && !T.match.result) showReveal(T);
  },
  fresh() { draft = new Map(); draftKey = ""; chosen = null; kind = "move"; opened = ""; reveal = null; $("last").hidden = true; },
  order: (events) => events.flatMap((e) => (e.kind === "take" ? [e.at] : [])),
  board: (T, stage) => ringBoard(T, stage),
  panel(T) {
    sync(T);
    const p = T.match.position, s = p.seat, cover = covered(T);
    $("cover").hidden = !cover;
    $("choice").hidden = cover;
    if (cover) {
      $("status").textContent = `Pass to ${NAMES[s]}`;
      $("cover-say").textContent = `${NAMES[s]} writes next, in secret. Only ${NAMES[s]} should look until the sheet is sealed.`;
      $("open-sheet").textContent = `I am ${NAMES[s]}: open my sheet`;
      $("open-sheet").onclick = () => { opened = keyOf(T.match.position); T.refresh(); };
      T.board.clear();
      return;
    }
    const mine = mineOf(p, s), b = boardOf(p), threat = threats(p, s);
    if (chosen !== null && p.owner[chosen] !== s) chosen = null;
    $("status").textContent = `${T.solo() ? "" : `${NAMES[s]}: `}write your orders`;
    const o = chosen === null ? null : offers(p, chosen), now = chosen === null ? null : draft.get(chosen) || { kind: "hold" };
    const kinds = chosen === null ? [] : ["hold", ...(o.move.length ? ["move"] : []), ...(o.support.length ? ["support"] : []), ...(o.transport.length ? ["transport"] : [])];
    if (chosen !== null && !kinds.includes(kind)) kind = now.kind;
    $("info").textContent = chosen === null
      ? `${seasonText(p)}. ${draft.size ? `${draft.size} of ${mine.length} provinces have orders; the rest hold.` : "Provinces you give no order hold."} Choose a province of yours, on the map or in the list, then seal your sheet.`
      : `${nameOf(p, chosen)}: ${p.str[chosen]} strong${b.port[chosen] ? ", a port" : ""}${threat[chosen] ? `; a rival beside it could bring ${threat[chosen]}` : ""}. Order: ${orderText(now, named(p), who)}.`;
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
    if (k === "escape") { chosen = null; T.refresh(); } else if (k === "e") seal(T);
  },
  more: { label: "The last reveal", body: revealBody },
  rules: (_, p) => {
    const style = p?.style || "classic", years = p?.years || YEARS[style];
    return [
      "Early: Margins of Trust is new. The rules, the map and the bots are in. Promises made in the game, a ledger of kept and broken promises, a sandbox and the 3D table come next.",
      `Three to five seats share a land of three rings round ${SEA}: ports on the shore, midlands, then uplands. Each seat starts in its own march with three provinces: a home with 3, a port and an upland with 1 each.`,
      "A year has a spring and an autumn. Each season every seat writes one order for each province it holds, in secret. A province with no order holds. When the last sheet is sealed, every order is revealed at once, and each one says what happened to it and why.",
      "Move: send some of a province's strength to a neighbour, always leaving 1 behind. Into empty land it simply arrives; into a rival's province it attacks. A port may also move to a port across the sea, if a transport carries it.",
      "Support: a province adds 1 to a seat's move into a neighbouring province, or to the hold of one. An attack on the supporter by land cuts it, unless the attack comes from the province the support is aimed at.",
      "Transport: a port carries a move between two ports across the sea, for anyone. An attack on the port by land cuts it.",
      "Who takes a province: what stays there, with its own seat's arrivals and supports, defends. The strongest arrival (the strength moved, plus supports) takes it only if it is stronger than the defence and than every other arrival. The defenders are lost, and the taker loses half of what stood there. Everyone else bounces home one weaker, or is lost if home was taken meanwhile.",
      "Two seats moving into each other's provinces by land meet head on: the weaker bounces, both when equal.",
      "Winter, after autumn: each port you hold grows 1. Your supply is 1 for each province and 2 more for each port; strength past it is lost from your strongest provinces.",
      style === "classic" ? `To win: hold more than half the ports at a winter. After ${years} years, the most ports wins, ties shared. A seat with no land is out.` : `To win: points at each winter, 1 for each port, and in each land 3 for the most provinces there and 1 for the next most. After ${years} years the most points wins; more ports break a tie.`,
      "Several people on one device: before each sheet the panel asks for the device to be passed, and opens the sheet only when its writer says so. A save, or a link to a friend, holds the sheets already sealed this season, so share them after a reveal.",
      "Keys: Tab and arrows choose, Enter acts, Escape lets go, E twice seals your sheet.",
    ];
  },
});
$("last").onclick = () => showReveal(table);
