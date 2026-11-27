// SPDX-License-Identifier: AGPL-3.0-or-later
// The stacking game on the table, an early version: a flat board drawn as a picture, a tower strip that lists the stack
// you last touched stone by stone (top first), and a move panel: choose a stone (or a pouch stone to drop), then what it does.
import { COURIER, KINDS, LAYOUTS, LODE, QUIET, SLINGER, WARDEN, boardOf, kindOf, nameOf, ownerOf, sideOf, stacking, stonesOf, threatened, topOf, towersOf } from "../src/games/stacking/rules.js";
import { choose, thinking } from "../src/games/stacking/bot.js";
import { $, NAMES, RGB, createTable, el, radio } from "./table.js";

const NS = "http://www.w3.org/2000/svg", S = 30, W = Math.sqrt(3) * S;
const GROUND = [[176, 184, 192], [166, 175, 184], [184, 191, 198]], LIT = "#f2c14e";
let from = null, pick = null, seen = -1; // from: a cell, "d1".."d4" a pouch kind to drop, or "swap"; pick: the chosen move's key; seen: the stack in the strip

const legal = (T) => (T.ready() ? T.match.legal() : []);
const keyOf = (m) => `${m.do}:${m.to ?? ""}`;
const sourceOf = (m) => (m.do === "drop" ? `d${m.kind}` : m.do === "swap" ? "swap" : String(m.from));
const say = (st) => `${NAMES[ownerOf(st)]} ${KINDS[kindOf(st)]}`;
const ink = (rgb) => (rgb.reduce((s, v, i) => s + [0.21, 0.72, 0.07][i] * (v / 255) ** 2.2, 0) > 0.19 ? "#1a1411" : "#fdf6e4");
/** What a move does, in a few words. */
function verb(p, m) {
  const h = p.cells[m.to]?.length ?? 0;
  if (m.do === "move") return h ? `Climb onto ${nameOf(p, m.to)}` : `Move to ${nameOf(p, m.to)}`;
  if (m.do === "strike") return `Strike ${nameOf(p, m.to)}`;
  if (m.do === "sling") return `Sling at ${nameOf(p, m.to)}`;
  if (m.do === "topple") return `Topple ${nameOf(p, m.to)}`;
  if (m.do === "drop") return `Drop on ${nameOf(p, m.to)}`;
  return "Swap sides";
}
/** What is on a cell now, and what the move leaves there. */
function note(p, m) {
  const h = p.cells[m.to]?.length ?? 0, top = h ? say(topOf(p, m.to)) : "";
  if (m.do === "move") return h ? `onto ${top}: tier ${h + 1}` : "tier 1";
  if (m.do === "strike" || m.do === "sling") return `${top} to your pouch`;
  if (m.do === "topple") return `${top} falls behind`;
  if (m.do === "drop") return `a ${KINDS[m.kind]}`;
  return "play the side that has moved";
}

/** A stone's mark, drawn in its owner's ink: the shape says what it does. */
function mark(g, kind, x, y, colour, up) {
  const make = (t, a) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); g.append(e); return e; };
  const line = { stroke: colour, "stroke-width": 2.6, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" };
  if (kind === LODE) { make("circle", { cx: x, cy: y, r: 7.5, ...line }); make("circle", { cx: x, cy: y, r: 2.6, fill: colour }); }
  else if (kind === WARDEN) make("rect", { x: x - 6.5, y: y - 6.5, width: 13, height: 13, fill: colour });
  else if (kind === COURIER) { make("path", { d: `M${x - 7} ${y - 3}h14M${x - 7} ${y + 3}h14`, ...line }); }
  else if (kind === SLINGER) make("path", { d: `M${x - 7} ${y + 6}L${x + 6} ${y - 7}M${x - 1} ${y - 7}h7v7`, ...line });
  else make("path", { d: up ? `M${x - 6} ${y + 3}L${x} ${y - 4}L${x + 6} ${y + 3}` : `M${x - 6} ${y - 3}L${x} ${y + 4}L${x + 6} ${y - 3}`, ...line });
}

/** The flat board: hexes, stacks drawn as discs one on another with the top stone's mark, height pips, and lit cells. */
function flatBoard(T, stage) {
  const b = boardOf(), make = (t, a, into) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); into?.append(e); return e; };
  // one person against bots sees their own side at the foot of the board, after a swap too; people sharing a screen see it fixed
  let flip = false;
  const xy = (i) => { const [q, r] = b.cells[i], x = W * (q + r / 2), y = S * 1.5 * r; return flip ? [-x, -y] : [x, y]; };
  const hex = (i) => { const [x, y] = xy(i); return [0, 1, 2, 3, 4, 5].map((k) => { const a = (Math.PI / 180) * (60 * k - 90); return `${(x + S * Math.cos(a)).toFixed(1)},${(y + S * Math.sin(a)).toFixed(1)}`; }).join(" "); };
  const span = (b.radius + 1) * W, svg = make("svg", { viewBox: `${-span} ${-S * 1.5 * b.radius - S * 1.3} ${2 * span} ${S * 3 * b.radius + S * 2.6}`, class: "flat", role: "img" });
  svg.setAttribute("aria-label", "The board, as a picture. The tower strip and the lists in the move panel say what is on it.");
  const cells = b.cells.map((_, i) => {
    const poly = make("polygon", { points: hex(i), class: "cell", fill: `rgb(${GROUND[(i * 7 + (i >> 2)) % 3]})`, stroke: "#3a4452", "stroke-width": 1.5 }, svg);
    poly.addEventListener("click", () => tap(T, i));
    return poly;
  });
  const names = make("g", { "aria-hidden": "true" }, svg), lit = make("g", { "pointer-events": "none" }, svg), stones = make("g", { "pointer-events": "none" }, svg);
  const labels = b.cells.map((_, i) => { const t = make("text", { fill: "rgba(26,32,40,.55)", "font-size": 8 }, names); t.textContent = nameOf(null, i); return t; });
  const place = () => b.cells.forEach((_, i) => { const [x, y] = xy(i); cells[i].setAttribute("points", hex(i)); labels[i].setAttribute("x", (x - S * 0.62).toFixed(1)); labels[i].setAttribute("y", (y - S * 0.42).toFixed(1)); });
  place();
  stage.replaceChildren(svg);
  let room = {};
  const fit = () => Object.assign(svg.style, { left: `${room.left || 0}px`, top: `${room.top || 0}px`, width: `calc(100% - ${(room.left || 0) + (room.right || 0)}px)`, height: `calc(100% - ${(room.top || 0) + (room.bottom || 0)}px)` });
  const draw = () => {
    const p = T.match.position, last = p.last, me = T.kinds.indexOf("you"), turn = !T.demo && T.solo() && me >= 0 && sideOf(p, me) === "north";
    if (turn !== flip) { flip = turn; place(); }
    stones.replaceChildren();
    if (last) for (const c of [last.from, last.to, last.behind]) if (c >= 0) { const [x, y] = xy(c); make("circle", { cx: x, cy: y, r: S * 0.78, fill: "none", stroke: "rgba(255,255,255,.55)", "stroke-width": 2, "stroke-dasharray": "4 3" }, stones); }
    p.cells.forEach((c, i) => {
      if (!c.length) return;
      const [x, y] = xy(i), h = c.length;
      c.forEach((st, k) => { // each tier sits on the one below with a visible lip
        const rgb = RGB[ownerOf(st)], cy = y + 5 - k * 6;
        make("ellipse", { cx: x, cy: cy + 3, rx: 17, ry: 15, fill: "rgba(10,14,20,.55)" }, stones);
        make("circle", { cx: x, cy, r: 16, fill: `rgb(${rgb})`, stroke: kindOf(st) === LODE ? "#f6e7b0" : "#141a22", "stroke-width": kindOf(st) === LODE ? 3 : 1.6 }, stones);
        if (k === h - 1) mark(stones, kindOf(st), x, cy, ink(rgb), (sideOf(p, ownerOf(st)) === "south") !== flip);
      });
      for (let k = 0; k < h; k++) make("circle", { cx: x + 19, cy: y + 10 - k * 7, r: 2.6, fill: "#fdf6e4", stroke: "#141a22", "stroke-width": 1 }, stones); // height pips
    });
  };
  const board = {
    looks: [], look: "flat", setLook() {}, zoom() {}, pan() {},
    layout(free) { room = free; fit(); },
    show() { draw(); return 0; },
    light(list, o = {}) {
      lit.replaceChildren();
      for (const i of list) { const [x, y] = xy(i); make("circle", { cx: x, cy: y, r: S * 0.62, fill: i === o.aim ? "rgba(242,193,78,.55)" : "rgba(242,193,78,.22)", stroke: LIT, "stroke-width": i === o.aim ? 3.5 : 2 }, lit); }
      if (o.ring >= 0) { const [x, y] = xy(o.ring); make("circle", { cx: x, cy: y, r: S * 0.8, fill: "none", stroke: "#fdf6e4", "stroke-width": 3 }, lit); }
    },
    clear() { lit.replaceChildren(); },
    at(i) { const r = cells[i]?.getBoundingClientRect(), s = stage.getBoundingClientRect(); return r ? { x: r.left + r.width / 2 - s.left, y: r.top + r.height / 2 - s.top } : null; },
    destroy() { svg.remove(); },
  };
  return board;
}

/** A tap on the board: your own stone chooses it, a lit cell chooses that move (a second tap plays it); any tap shows its stack. */
function tap(T, i) {
  if (T.demo) return;
  seen = i;
  if (!T.ready()) { tower(T); return; }
  const all = legal(T), here = all.filter((m) => sourceOf(m) === from && m.to === i);
  if (here.length) {
    const k = here.some((m) => keyOf(m) === pick) ? pick : keyOf(here[0]);
    if (k === pick && here.length === 1) { T.play(here[0]); return; }
    pick = k;
  } else if (all.some((m) => sourceOf(m) === String(i))) { from = String(i); pick = null; } else { from = null; pick = null; }
  T.refresh();
}

/** The tower strip: the stack last touched (or chosen, or last moved), top first; every tower on the board; both pouches. */
function tower(T) {
  const p = T.match.position, box = $("tower"), at = seen >= 0 ? seen : from && /^\d+$/.test(from) ? Number(from) : p.last?.to ?? -1;
  const parts = [];
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
      btn.type = "button"; btn.onclick = () => { seen = i; T.ready() ? T.refresh() : tower(T); };
      u.append(el("li")); u.lastChild.append(btn);
    }
    parts.push(d);
  }
  parts.push(el("p", `Pouches: ${[0, 1].map((s) => `${NAMES[s]} ${pouchText(p, s)}`).join("; ")}.`, "pouch"));
  box.replaceChildren(...parts);
}
const pouchText = (p, s) => p.pouch[s].flatMap((n, k) => (n ? [`${n} ${KINDS[k]}${n > 1 ? "s" : ""}`] : [])).join(", ") || "empty";

function panel(T) {
  const p = T.match.position, all = legal(T), sources = [...new Set(all.map(sourceOf))];
  if (from !== null && !sources.includes(from)) from = null;
  const list = from === null ? [] : all.filter((m) => sourceOf(m) === from);
  if (!list.some((m) => keyOf(m) === pick)) pick = list.length === 1 ? keyOf(list[0]) : null;
  const danger = threatened(p, p.seat);
  $("status").textContent = `${T.solo() ? "Your turn" : `${NAMES[p.seat]}'s turn`}${danger ? ": your Lodestone is open to a strike. Make it safe." : ". Choose a stone, then what it does."}`;
  radio($("sources"), sources.map((s) => {
    if (s === "swap") return { value: s, label: "Swap sides", note: "take the side that has moved" };
    if (s[0] === "d") { const k = Number(s.slice(1)); return { value: s, label: `Drop a ${KINDS[k]}`, note: `${p.pouch[p.seat][k]} in your pouch` }; }
    const i = Number(s), st = topOf(p, i);
    return { value: s, label: `${KINDS[kindOf(st)]} ${nameOf(p, i)}`, note: `tier ${p.cells[i].length}`, rgb: RGB[p.seat] };
  }), from, (v) => { from = from === v ? null : v; pick = null; if (/^\d+$/.test(v)) seen = Number(v); T.refresh(); });
  $("wheres").hidden = !list.length;
  radio($("wheres"), list.map((m) => ({ value: keyOf(m), label: verb(p, m), note: note(p, m) })), pick, (v) => { pick = v; const m = list.find((x) => keyOf(x) === v); if (m?.to >= 0) seen = m.to; T.refresh(); });
  const m = list.find((x) => keyOf(x) === pick);
  $("do").disabled = !m;
  $("do").textContent = m ? verb(p, m) : from !== null ? "Choose what it does" : "Choose a stone";
  $("do").onclick = () => { const now = legal(T).find((x) => sourceOf(x) === from && keyOf(x) === pick); if (now) T.play(now); };
  T.board.light(list.filter((x) => x.to >= 0).map((x) => x.to), { ring: /^\d+$/.test(from ?? "") ? Number(from) : -1, aim: m?.to ?? -1 });
  tower(T);
}

createTable({
  game: stacking, key: "stacking", title: "The stacking game", won: "You trapped the rival Lodestone.", outOf: () => false, seats: [2], normal: 2, lengths: [], pace: () => 520,
  style: "ours", quick: { style: "ours" }, // stacking hook: one rule set for now
  unit: "Stones", cellsOf: stonesOf, goalOf: () => 12, landOf: () => 24, landText: (c) => String(c), nameOf, choose, thinking,
  roundText: (p) => (p.over ? null : `Turn ${p.round}${p.quiet >= QUIET / 2 ? `, ${(QUIET - p.quiet + 1) >> 1} quiet turns to a draw` : ""}`),
  about: {
    ours: `Early: the settled rules.\nA hex board of 61 cells, twelve stones a side in five kinds, a set opening drawn from three (${LAYOUTS.map((l) => l.name.toLowerCase()).join(", ")}), mirrored. Stones climb up to three high; only the top stone acts. Strike, topple and drop; trap the rival Lodestone to win. After the first move the second player may swap sides.\nAn early version: a flat board and a simple bot. Lessons, puzzles and a 3D table come later.`,
  },
  stats: (p, s) => [["Pouch", p.pouch[s].reduce((a, b) => a + b, 0)], ["Lodestone", threatened(p, s) ? "Open" : "Safe"]],
  line(e, p) {
    const who = NAMES[e.seat], at = (i) => nameOf(p, i), kind = (st) => KINDS[kindOf(st)];
    if (e.kind === "move") return `${who}'s ${kind(e.stone)} ${e.tier > 1 ? `climbs onto ${at(e.to)}, tier ${e.tier}` : `moves to ${at(e.to)}`}.`;
    if (e.kind === "strike") return `${who}'s ${kind(e.stone)} strikes ${NAMES[ownerOf(e.struck)]}'s ${kind(e.struck)} at ${at(e.to)}.`;
    if (e.kind === "sling") return `${who}'s Slinger at ${at(e.from)} slings ${NAMES[ownerOf(e.struck)]}'s ${kind(e.struck)} off ${at(e.to)}.`;
    if (e.kind === "topple") return `${who} topples ${NAMES[ownerOf(e.knocked)]}'s ${kind(e.knocked)} from ${at(e.to)} to ${at(e.behind)}.`;
    if (e.kind === "drop") return `${who} drops a ${kind(e.stone)} on ${at(e.to)}.`;
    if (e.kind === "swap") return `${who} swaps sides and takes the stones that moved first.`;
    if (e.kind === "threat") return `${NAMES[e.seat]}'s Lodestone is open to a strike.`;
    return "";
  },
  order: (events) => events.flatMap((e) => (e.to >= 0 ? [e.to] : [])),
  ending(T) {
    const r = T.match.result;
    if (r.winners.length > 1) return `A draw: ${r.why}.`;
    const w = r.winners[0];
    return `${T.solo() && T.kinds[w] === "you" ? "You win" : `${NAMES[w]} wins`}: ${r.why}.`;
  },
  summary: (T) => `After ${T.match.list.length} moves, ${(T.match.list.length + 1) >> 1} turns each.`,
  board: (T, stage) => { document.body.classList.remove("atlas"); return flatBoard(T, stage); },
  panel,
  changed: (T) => { from = null; pick = null; seen = -1; if (!T.demo && T.match) tower(T); },
  fresh: () => { from = null; pick = null; seen = -1; },
  listing: (T) => { const p = T.match.position; return { head: ["Cell", "Top first"], rows: p.cells.flatMap((c, i) => (c.length ? [[nameOf(p, i), [...c].reverse().map(say).join(", ")]] : [])) }; },
  keys(T, k, e) {
    if (k === "escape") { from = null; pick = null; T.refresh(); } else if (k === "enter" && !(document.activeElement instanceof HTMLButtonElement && document.activeElement.id !== "do")) { e.preventDefault(); $("do").click(); }
  },
  rules: () => [
    "Two players, twelve stones each: a Lodestone, a Warden, two Couriers, two Slingers and six Pebbles. The board is 61 hexes; each side starts in its three nearest rows, in one of three set layouts.",
    "Stones stack up to three high. Only the top stone of a stack acts. A stone climbs one tier at a time: it may move onto a stack no taller than the tier it stands on.",
    "Lodestone (a ring and a dot): one step any way. It may stand no higher than tier 2, and nothing may stand on it.",
    "Warden (a square): one step. It never climbs, nothing climbs it, and it cannot be toppled.",
    "Courier (two bars): slides up to 2 cells in a straight line, one more for each tier above the first. It stops at the first stone in its way, and may climb it or strike it.",
    "Slinger (an arrow): steps one, or stays where it is and strikes the first stone in a line within 2 cells, one more for each tier above the first.",
    "Pebble (a chevron): one step to either forward cell, and strikes the same way.",
    "Strike: take a rival top stone no more than one tier above your stone. It goes to your pouch as yours. A stepping stone takes its place; a Slinger stays put.",
    "Topple: a stone beside a rival stack no taller than its own tier knocks that stack's top stone to the cell straight behind it.",
    "Drop: instead of moving, put a stone from your pouch on an empty cell beside one of your own stacks, never beside the rival Lodestone.",
    "You may never leave your own Lodestone open to a strike. A player with no legal move loses: trap the rival Lodestone to win.",
    `After the first move, the second player may swap sides and play the stones that moved. ${QUIET / 2} turns each without a strike or a topple, or 200 turns each, is a draw.`,
    "Reading the board: each stone in a stack sits on the one below with a lip, the top stone shows its mark, and the pips beside a stack count its height. Tap any stack and the tower strip lists it stone by stone, top first.",
    "Keys: Tab and arrows choose, Enter acts, Escape lets go, U takes back.",
    "This is an early version: a flat board and a simple bot.",
  ],
});
