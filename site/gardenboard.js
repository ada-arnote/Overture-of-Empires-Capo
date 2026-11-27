// SPDX-License-Identifier: AGPL-3.0-or-later
// The garden game's flat board: soil tiles round a pond, plants drawn in code, links as lines, and the pond meter.
// Each kind has its own outline and each gardener their own base (a round one, a square one), so colour is never the only sign.
// It answers the table as a board does (site/table.js): show, light, clear, layout, at, destroy; it has no looks to choose.
import { NONE, boardOf, linksOf, meterOf } from "../src/games/garden/rules.js";
import { RGB } from "./table.js";

const NS = "http://www.w3.org/2000/svg", S = 30, W = Math.sqrt(3) * S;
const SOIL = ["#8a6a48", "#836444", "#8f6f4c"], BED = "#a5845a", WATER = "#4f7f95", WATER2 = "#6f9db0", EDGE = "#3a2b1e";
const make = (t, at = {}) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(at)) e.setAttribute(k, String(v)); return e; };
const rgb = (c) => `rgb(${c.join(",")})`;
/** The ink that stands out more on a colour. */
const inkOf = (c) => (c.reduce((s, v, i) => s + [0.21, 0.72, 0.07][i] * (v / 255) ** 2.2, 0) > 0.19 ? "#1a1411" : "#fdf6e4");
const centre = ([q, r]) => [W * (q + r / 2), S * 1.5 * r];
const hex = (x, y, s = S) => [0, 1, 2, 3, 4, 5].map((k) => { const a = (Math.PI / 180) * (60 * k - 90); return `${(x + s * Math.cos(a)).toFixed(1)},${(y + s * Math.sin(a)).toFixed(1)}`; }).join(" ");

/** Each kind's outline, drawn about a point, in one ink: Reed tall spikes, Fern a fan, Sedge a low tuft, Thistle a ball on a stem, Clover three lobes. */
export function glyph(kind, ink) {
  const g = make("g", { fill: "none", stroke: ink, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" });
  const path = (d, fill = false) => g.append(make("path", fill ? { d, fill: ink, stroke: "none" } : { d }));
  if (kind === 0) { path("M-5 9V-7M0 9V-11M5 9V-6"); path("M-6.5-7l1.5-4 1.5 4zM-1.5-11l1.5-4 1.5 4zM3.5-6l1.5-4 1.5 4z", true); }
  else if (kind === 1) { path("M0 10V-2M0 4C-4 1-8-2-9-7M0 4C4 1 8-2 9-7M0-2C-2-6-3-9-2-12M0-2C2-6 3-9 2-12"); }
  else if (kind === 2) { path("M-9 9C-6 3-6-1-8-5M-4 9C-3 3-2-2-1-7M1 9C2 3 3-1 6-6M6 9C7 5 8 2 10-1M-10 9H10"); }
  else if (kind === 3) { path("M0 10V0"); g.append(make("circle", { cx: 0, cy: -4, r: 4.6, fill: ink, stroke: "none" })); path("M0-12V-9.5M-6-9.5l2 2M6-9.5l-2 2M-8-4h2.5M8-4H5.5"); }
  else { for (const [x, y] of [[0, -5], [-5, 1], [5, 1]]) g.append(make("circle", { cx: x, cy: y, r: 4.4, fill: ink, stroke: "none" })); path("M0 2V10"); }
  return g;
}
/** A plant standing on its gardener's base: round for the first, square for the second. */
export function plantMark(kind, seat, x = 0, y = 0, size = 1) {
  const g = make("g", { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${size})` }), c = RGB[seat] || [200, 190, 170], ink = inkOf(c);
  const base = seat === 1 ? make("rect", { x: -14, y: -14, width: 28, height: 28, rx: 6 }) : make("circle", { r: 15 });
  base.setAttribute("fill", rgb(c)); base.setAttribute("stroke", EDGE); base.setAttribute("stroke-width", 2.4);
  g.append(base, glyph(kind, ink));
  return g;
}

/** o: tap(i), can(i). Returns what the table asks of a board. */
export function gardenBoard(T, stage, o) {
  let room = {}, lit = { cells: [], ring: -1, aim: -1, dots: [] }, svg = null, cells = [], shownOver = false;
  const fit = () => { if (svg) Object.assign(svg.style, { left: `${room.left || 0}px`, top: `${room.top || 0}px`, width: `calc(100% - ${(room.left || 0) + (room.right || 0)}px)`, height: `calc(100% - ${(room.top || 0) + (room.bottom || 0)}px)` }); };
  function draw() {
    const p = T.match.position, g = boardOf(p), R = g.radius, ext = W * (R + 1);
    cells = g.cells.map(centre);
    svg = make("svg", { viewBox: `${-ext} ${-S * 1.5 * R - S * 1.4} ${2 * ext} ${S * 3 * R + S * 2.8}`, role: "img" });
    svg.setAttribute("aria-label", "The garden. The lists in the move panel choose places.");
    const tiles = make("g"), lines = make("g"), plants = make("g"), marks = make("g", { "pointer-events": "none" }), stones = make("g", { "pointer-events": "none" });
    const bed = (i) => (p.rule.sowing === "rim" ? g.rim[i] : g.home[0][i] || g.home[1][i]);
    cells.forEach(([x, y], i) => {
      const t = make("polygon", { points: hex(x, y, S - 0.8), fill: g.pond[i] ? (g.ring[i] ? WATER2 : WATER) : bed(i) ? BED : SOIL[(i * 7 + (i >> 2)) % 3], stroke: g.pond[i] ? WATER : EDGE, "stroke-width": 1.4 });
      if (!g.pond[i]) t.addEventListener("click", () => o.tap(i));
      tiles.append(t);
      // Traditional's home beds: a stone edge in their gardener's colour
      if (p.rule.sowing === "beds" && !g.pond[i]) for (const s of [0, 1]) if (g.home[s][i]) tiles.append(make("polygon", { points: hex(x, y, S - 5), fill: "none", stroke: rgb(RGB[s]), "stroke-width": 3, "stroke-dasharray": s ? "2 4" : "none", "pointer-events": "none" }));
    });
    // links: a dark line under a line in the gardener's colour; a closed ring in gold
    const ring = p.over ? (T.match.events.find((e) => e.kind === "ring")?.cells || []) : [], inRing = new Set(ring.map((c, k) => `${c}.${ring[(k + 1) % ring.length]}`));
    for (const s of [0, 1]) for (const [a, b] of linksOf(p, s)) {
      const [x1, y1] = cells[a], [x2, y2] = cells[b], gold = inRing.has(`${a}.${b}`) || inRing.has(`${b}.${a}`);
      lines.append(make("line", { x1, y1, x2, y2, stroke: EDGE, "stroke-width": gold ? 12 : 9, "stroke-linecap": "round" }), make("line", { x1, y1, x2, y2, stroke: gold ? "#f2cf63" : rgb(RGB[s]), "stroke-width": gold ? 7 : 5, "stroke-linecap": "round", "stroke-dasharray": s ? "10 5" : "none" }));
    }
    p.owner.forEach((s, i) => {
      if (s === NONE) return;
      const m = plantMark(p.kind[i], s, cells[i][0], cells[i][1]);
      m.addEventListener("click", () => o.tap(i));
      plants.append(m);
    });
    // the pond meter: six stones on the pond, one for each part round it, each half in the colour of a gardener whose best chain reaches it
    const meters = [0, 1].map((s) => meterOf(p, s).mask);
    for (let k = 0; k < 6; k++) {
      // the parts run between the bed's directions k and k + 1, which on screen are 60k and 60k + 60 degrees
      const a = (Math.PI / 180) * (60 * k + 30), d = S * 1.05, x = d * Math.cos(a), y = d * Math.sin(a);
      const half = (s) => make("path", { d: s ? `M${x.toFixed(1)} ${(y - 7).toFixed(1)}A7 7 0 0 1 ${x.toFixed(1)} ${(y + 7).toFixed(1)}Z` : `M${x.toFixed(1)} ${(y - 7).toFixed(1)}A7 7 0 0 0 ${x.toFixed(1)} ${(y + 7).toFixed(1)}Z`, fill: meters[s] & (1 << k) ? rgb(RGB[s]) : "#2c4652", stroke: EDGE, "stroke-width": 1.2 });
      stones.append(half(0), half(1));
    }
    for (const c of lit.dots) { if (cells[c]) marks.append(make("circle", { cx: cells[c][0], cy: cells[c][1], r: 6, fill: "#f6efd8", stroke: EDGE, "stroke-width": 1.5 })); }
    for (const c of lit.cells) { if (cells[c]) marks.append(make("circle", { cx: cells[c][0], cy: cells[c][1], r: 21, fill: "none", stroke: "#f2cf63", "stroke-width": 3.5, "stroke-dasharray": "5 4" })); }
    if (cells[lit.ring]) marks.append(make("polygon", { points: hex(cells[lit.ring][0], cells[lit.ring][1], S - 2), fill: "none", stroke: "#f6efd8", "stroke-width": 4 }));
    if (cells[lit.aim]) marks.append(make("polygon", { points: hex(cells[lit.aim][0], cells[lit.aim][1], S - 2), fill: "rgba(246,239,216,.25)", stroke: "#f2cf63", "stroke-width": 4 }));
    svg.append(tiles, lines, stones, plants, marks);
    stage.replaceChildren(svg);
    fit();
    shownOver = !!p.over;
  }
  return {
    looks: [],
    patterns() { /* the bases and outlines already tell the gardeners and kinds apart */ },
    motion() {},
    layout(free) { room = free; fit(); },
    show() { draw(); return shownOver ? 0 : 160; },
    light(c, chosen = {}) { lit = { cells: c, ring: chosen.ring ?? -1, aim: chosen.aim ?? -1, dots: chosen.dots || [] }; draw(); },
    clear() { if (!lit.cells.length && !lit.dots.length && lit.ring < 0 && lit.aim < 0) return; lit = { cells: [], ring: -1, aim: -1, dots: [] }; draw(); },
    /** Where a cell is on the screen, from the stage's corner: for the name tag and the coach. */
    at(i) {
      if (!svg || !cells[i]) return null;
      const m = svg.getScreenCTM(), s = stage.getBoundingClientRect();
      if (!m) return null;
      const pt = svg.createSVGPoint();
      pt.x = cells[i][0]; pt.y = cells[i][1];
      const q = pt.matrixTransform(m);
      return { x: q.x - s.left, y: q.y - s.top };
    },
    destroy() { stage.replaceChildren(); svg = null; },
  };
}
