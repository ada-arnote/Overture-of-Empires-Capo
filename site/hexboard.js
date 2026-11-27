// SPDX-License-Identifier: AGPL-3.0-or-later
// The hex board for a game's screen: the moving one when the device can draw it, else a still picture that can be tapped.
import { LOOKS, canDraw, createBoard } from "../src/map/board.js";
import { STYLES, STYLE_KEY } from "../src/map/style.js";
import { ICONS, RGB } from "./table.js";

/** The seats' patterns for the still board, the same six as on the moving board and the score bar: /, dots, |, x, \, -. */
function patterns(make, f) {
  const defs = make("defs", {}), ink = "rgba(16,12,10,.45)", line = (d, w) => make("path", { d, stroke: ink, "stroke-width": w, fill: "none" });
  [["M0 8L8 0M-2 2L2-2M6 10L10 6"], [], ["M4 0V8"], ["M0 8L8 0M0 0L8 8"], ["M0 0L8 8M-2 6L2 10M6-2L10 2"], ["M0 4H8"]].forEach((paths, k) => {
    const p = make("pattern", { id: `seat-${k}`, width: 8, height: 8, patternUnits: "userSpaceOnUse", patternTransform: `scale(${f})` }); // about 8 screen pixels
    if (k === 1) p.append(make("circle", { cx: 4, cy: 4, r: 1.6, fill: ink }));
    for (const d of paths) p.append(line(d, 1.5));
    defs.append(p);
  });
  return defs;
}

/**
 * o.picture and o.fine { cells, of } for a board of provinces. Otherwise o: cells (axial), fit (the cells to frame, or all), rough[], sea[], ground(i), terrain(i), owner() -> seats or -1 by cell, pieces() -> standing pieces, tap(i), can(i).
 * A board opens tilted, as a model on a table, unless the player chose a look, or this device was found too slow for it (then Flat, which stays one tap away in Settings).
 */
export function hexBoard(T, stage, o) {
  let b = null, svg = null, pat = false, room = {};
  /** The still picture keeps to the free part of the screen too, clear of the panels. */
  const fit = () => { if (svg) Object.assign(svg.style, { left: `${room.left || 0}px`, top: `${room.top || 0}px`, width: `calc(100% - ${(room.left || 0) + (room.right || 0)}px)`, height: `calc(100% - ${(room.top || 0) + (room.bottom || 0)}px)` }); };
  const kept = T.read(), SLOW = "capo-3d-slow", get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  // weak devices by their own account (2 GB or less, under 4 cores, data saver) open flat; the rest are timed as they open
  const weak = navigator.deviceMemory <= 2 || navigator.hardwareConcurrency < 4 || !!navigator.connection?.saveData || !!get(SLOW);
  const still = () => {
    const list = o.fine ? o.fine.cells : o.cells, big = Math.max(...list.map(([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)))) + 2;
    const ns = "http://www.w3.org/2000/svg", S = 30, W = Math.sqrt(3) * S, owner = o.owner(), make = (t, at) => { const e = document.createElementNS(ns, t); for (const [k, v] of Object.entries(at)) e.setAttribute(k, v); return e; };
    const xs = list.map(([q, r]) => W * (q + r / 2)), ys = list.map(([, r]) => S * 1.5 * r), x0 = Math.min(...xs) - W, y0 = Math.min(...ys) - S * 1.5; // the board's own extent, with a margin
    svg = make("svg", { viewBox: o.fine ? `${-W * big} ${-S * 1.6 * big} ${W * 2 * big} ${S * 3.2 * big}` : `${x0} ${y0} ${Math.max(...xs) + W - x0} ${Math.max(...ys) + S * 1.5 - y0}` });
    const where = new Map(o.pieces().map((p) => [p.at, p]));
    if (pat) svg.append(patterns(make, svg.viewBox.baseVal.width / Math.max(240, stage.clientWidth)));
    const words = [], laid = [];
    list.forEach(([q, r], k) => {
      const i = o.fine ? o.fine.of[k] : k, x = W * (q + r / 2), y = S * 1.5 * r;
      if (i < 0) return;
      const s = owner[i], p = !o.fine || o.fine.mid[i] === k ? where.get(i) : null, rim = o.fine && s >= 0 ? `rgb(${RGB[s]})` : o.fine ? `rgb(${o.ground(i)})` : "#12171a";
      const g = make("polygon", { points: [0, 1, 2, 3, 4, 5].map((k) => { const a = (Math.PI / 180) * (60 * k - 90); return `${x + S * Math.cos(a)},${y + S * Math.sin(a)}`; }).join(" "), fill: `rgb(${s < 0 ? o.ground(i) : RGB[s]})`, stroke: rim, "stroke-width": 2 });
      const over = pat && s >= 0 ? make("polygon", { points: g.getAttribute("points"), fill: `url(#seat-${s % 6})`, "pointer-events": "none" }) : null;
      g.addEventListener("click", () => o.tap(i));
      svg.append(g);
      if (over) laid.push(over);
      const text = p ? (p.kind === "army" ? String(p.count) : p.kind === "tower" ? `${p.count}⌂` : "▲".repeat(p.rank)) : o.fine ? "" : s >= 0 ? String(s + 1) : o.rough[i] ? "∧" : "";
      if (text) { const t = make("text", { x, y: y + 6, "text-anchor": "middle", "font-size": o.fine ? 40 : p ? 15 : 14, "font-weight": 700, fill: "#12171a", "pointer-events": "none" }); t.textContent = p && p.kind === "army" && p.seat >= 0 ? `${"◆●■★▲♥"[p.seat]}${text}` : text; words.push(t); }
    });
    svg.append(...laid, ...words);
    stage.replaceChildren(svg);
    fit();
  };
  if (canDraw()) {
    try {
      b = createBoard(stage, { size: o.size, picture: o.picture, lands: o.lands, lines: o.lines, labels: o.labels, icons: ICONS, cells: o.cells, fit: o.fit, rough: o.rough, sea: o.sea, seats: o.seats || RGB, ground: o.ground, terrain: o.terrain, style: get(STYLE_KEY) || "war", wood: "textures/walnut.webp", probe: !LOOKS[kept] && !weak, look: LOOKS[kept] ? kept : weak ? "flat" : "relief" });
      if (b.style.pack) fetch(`models/${b.style.pack}`).then((r) => (r.ok ? r.arrayBuffer() : null)).then((buf) => { if (buf) b?.pack(buf); }).catch(() => {}); // a style's sculpted models come after the board is up; the code-made ones stand meanwhile
      b.on("slow", () => { try { localStorage.setItem(SLOW, "1"); } catch { /* it will be timed again next time */ } b?.setLook("flat"); });
      b.on("pick", (i) => { if (i >= 0) o.tap(i); });
      b.on("hover", (i) => b?.setCursor(i >= 0 && T.ready() && o.can(i)));
      b.on("lost", () => { b = null; still(); });
    } catch (e) { b = null; console.warn("The moving board did not start:", e); }
  }
  return {
    get looks() { return b ? Object.entries(LOOKS).map(([k, v]) => [k, v.name]) : []; },
    get look() { return b?.look; },
    /** The styles a board can wear, the one it wears, and a change of style (kept for every game). */
    get styles() { return b ? Object.entries(STYLES).map(([k, v]) => [k, v.name]) : []; },
    get style() { return b?.styleName; },
    setStyle(k) { try { localStorage.setItem(STYLE_KEY, k); } catch { /* this visit only */ } b?.setStyle(k); },
    setLook: (k) => b?.setLook(k),
    patterns(on) { pat = !!on; if (b) b.patterns(pat); else if (svg) still(); },
    motion: (mode) => b?.motion(mode),
    layout(free) { room = free; if (b) b.layout(free); else fit(); },
    zoom: (f) => b?.zoom(f), pan: (x, y) => b?.pan(x, y), centre: (i) => b?.centre?.(i),
    /** The cell of a seat's nearest the middle of its land: where a map opens and goes home to. */
    focus(seat) {
      const mid = o.picture?.mid, owner = o.owner();
      if (!mid || !(seat >= 0)) return -1;
      const mine = owner.flatMap((s, i) => (s === seat && mid[i] ? [i] : []));
      if (!mine.length) return -1;
      const x = mine.reduce((n, i) => n + mid[i][0], 0) / mine.length, y = mine.reduce((n, i) => n + mid[i][1], 0) / mine.length;
      return mine.reduce((a, i) => (Math.hypot(mid[i][0] - x, mid[i][1] - y) < Math.hypot(mid[a][0] - x, mid[a][1] - y) ? i : a));
    },
    show(order, quick) { if (b) return b.show(o.owner(), { pieces: o.pieces(), order, quick, names: o.names?.() }); still(); return 0; },
    light: (cells, chosen) => b?.preview(cells, chosen),
    clear: () => b?.preview([]),
    at: (i) => b?.screenOf(i), // where a cell is on the screen, for the coach
    get moving() { return b; }, // motion hook (site/motion.js): the moving board itself, or null for the still picture
    destroy: () => b?.destroy(),
  };
}
