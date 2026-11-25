// SPDX-License-Identifier: AGPL-3.0-or-later
// The hex board for a game's screen: the moving one when the device can draw it, else a still picture that can be tapped.
import { LOOKS, canDraw, createBoard } from "../src/map/board.js";
import { ICONS, RGB } from "./table.js";

/**
 * o.picture and o.fine { cells, of } for a board of provinces. Otherwise o: cells (axial), rough[], sea[], ground(i), owner() -> seats or -1 by cell, pieces() -> standing pieces, tap(i), can(i).
 */
export function hexBoard(T, stage, o) {
  let b = null, svg = null;
  const wide = innerWidth > 820, kept = T.read();
  const still = () => {
    const list = o.fine ? o.fine.cells : o.cells, big = Math.max(...list.map(([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)))) + 2;
    const ns = "http://www.w3.org/2000/svg", S = 30, W = Math.sqrt(3) * S, owner = o.owner(), make = (t, at) => { const e = document.createElementNS(ns, t); for (const [k, v] of Object.entries(at)) e.setAttribute(k, v); return e; };
    svg = make("svg", { viewBox: o.fine ? `${-W * big} ${-S * 1.6 * big} ${W * 2 * big} ${S * 3.2 * big}` : `${-W * 8} ${-S * 10} ${W * 16} ${S * 20}` });
    const where = new Map(o.pieces().map((p) => [p.at, p]));
    const words = [];
    list.forEach(([q, r], k) => {
      const i = o.fine ? o.fine.of[k] : k, x = W * (q + r / 2), y = S * 1.5 * r;
      if (i < 0) return;
      const s = owner[i], p = !o.fine || o.fine.mid[i] === k ? where.get(i) : null, rim = o.fine && s >= 0 ? `rgb(${RGB[s]})` : o.fine ? `rgb(${o.ground(i)})` : "#12171a";
      const g = make("polygon", { points: [0, 1, 2, 3, 4, 5].map((k) => { const a = (Math.PI / 180) * (60 * k - 90); return `${x + S * Math.cos(a)},${y + S * Math.sin(a)}`; }).join(" "), fill: `rgb(${s < 0 ? o.ground(i) : RGB[s]})`, stroke: rim, "stroke-width": 2 });
      g.addEventListener("click", () => o.tap(i));
      svg.append(g);
      const text = p ? (p.kind === "army" ? String(p.count) : p.kind === "tower" ? `${p.count}⌂` : "▲".repeat(p.rank)) : o.fine ? "" : s >= 0 ? String(s + 1) : o.rough[i] ? "∧" : "";
      if (text) { const t = make("text", { x, y: y + 6, "text-anchor": "middle", "font-size": o.fine ? 40 : p ? 15 : 14, "font-weight": 700, fill: "#12171a", "pointer-events": "none" }); t.textContent = p && p.kind === "army" && p.seat >= 0 ? `${"◆●■★▲♥"[p.seat]}${text}` : text; words.push(t); }
    });
    svg.append(...words);
    stage.replaceChildren(svg);
  };
  if (canDraw()) {
    try {
      b = createBoard(stage, { size: o.size, picture: o.picture, lands: o.lands, lines: o.lines, labels: o.labels, icons: ICONS, cells: o.cells, rough: o.rough, sea: o.sea, seats: o.seats || RGB, ground: o.ground, look: LOOKS[kept] ? kept : wide && !o.plain ? "relief" : "flat" });
      b.on("pick", (i) => { if (i >= 0) o.tap(i); });
      b.on("hover", (i) => b?.setCursor(i >= 0 && T.ready() && o.can(i)));
      b.on("lost", () => { b = null; still(); });
    } catch (e) { b = null; console.warn("The moving board did not start:", e); }
  }
  return {
    get looks() { return b ? Object.entries(LOOKS).map(([k, v]) => [k, v.name]) : []; },
    get look() { return b?.look; },
    setLook: (k) => b?.setLook(k),
    layout: (free) => b?.layout(free),
    show(order, quick) { if (b) return b.show(o.owner(), { pieces: o.pieces(), order, quick, names: o.names?.() }); still(); return 0; },
    light: (cells, chosen) => b?.preview(cells, chosen),
    clear: () => b?.preview([]),
    destroy: () => b?.destroy(),
  };
}
