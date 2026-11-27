// SPDX-License-Identifier: AGPL-3.0-or-later
// The flat square board for the tile game (its first look): every tile painted in code from its features, the tile in
// hand held over its place as a ghost, the places it fits outlined, stewards in their seats' colours. Drag to move,
// the wheel or two fingers to zoom, a tap to choose a place. Nothing here is drawn from a picture file.
import { KINDS } from "../src/games/tile/tiles.js";

const C = { meadow: "#93ad62", meadow2: "#86a157", lane: "#efe4c6", laneEdge: "#9c8763", town: "#d2b48a", wall: "#6c5235", roof: "#a9543a", roof2: "#8a4330", well: "#4f7690", stone: "#a19e96", grid: "rgba(40, 30, 18, .45)", flag: "#2f5f9e", spot: "rgba(255, 236, 170, .85)" };
const MID = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]], CORNER = [[0, 0], [1, 0], [1, 1], [0, 1]];
/** The point of each meadow half, a little in from its edge. */
const HALF = [[0.25, 0.14], [0.75, 0.14], [0.86, 0.25], [0.86, 0.75], [0.75, 0.86], [0.25, 0.86], [0.14, 0.75], [0.14, 0.25]];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Where a lane between two edges bends: through the middle when they face, else nearer the corner between them. */
const bend = ([a, b]) => ((a - b + 4) % 2 === 0 ? [0.5, 0.5] : mix([0.5, 0.5], CORNER[(a + 1) % 4 === b ? b : a], 0.4));

/** Is a run of town edges one block going round the tile? Returns its first edge and length, or null (two edges facing). */
function run(edges) {
  if (edges.length === 4) return [0, 4];
  for (let s = 0; s < 4; s++) if (edges.every((e) => (e - s + 4) % 4 < edges.length)) return [s, edges.length];
  return null;
}
/** The outline of a town on a tile of side 1: along its edges, and curved back across the tile where it ends. */
function townPath(g, edges) {
  const r = run(edges);
  g.beginPath();
  if (!r) { // two edges facing: a band across the middle
    const [a] = edges, horizontal = a % 2 === 1;
    if (horizontal) { g.moveTo(1, 0); g.lineTo(1, 1); g.quadraticCurveTo(0.5, 0.62, 0, 1); g.lineTo(0, 0); g.quadraticCurveTo(0.5, 0.38, 1, 0); }
    else { g.moveTo(0, 0); g.lineTo(1, 0); g.quadraticCurveTo(0.62, 0.5, 1, 1); g.lineTo(0, 1); g.quadraticCurveTo(0.38, 0.5, 0, 0); }
    g.closePath();
    return;
  }
  const [s, n] = r;
  g.moveTo(...CORNER[s]);
  for (let i = 1; i <= n; i++) g.lineTo(...CORNER[(s + i) % 4]);
  if (n < 4) {
    const towards = n === 1 ? MID[s] : n === 2 ? CORNER[(s + 1) % 4] : MID[(s + 3) % 4], k = n === 3 ? -0.16 : n === 2 ? -0.08 : -0.14;
    g.quadraticCurveTo(0.5 + (towards[0] - 0.5) * k * 2, 0.5 + (towards[1] - 0.5) * k * 2, ...CORNER[s]);
  }
  g.closePath();
}
/** Where a feature's steward stands, on the tile unturned. */
export function anchorOf(k, f) {
  const F = KINDS[k].feats[f];
  if (F.kind === "well") return [0.5, 0.5];
  if (F.kind === "town") {
    const r = run(F.edges);
    if (!r || r[1] >= 3) return [0.5, 0.5];
    return r[1] === 1 ? mix(MID[r[0]], [0.5, 0.5], 0.28) : mix(CORNER[(r[0] + 1) % 4], [0.5, 0.5], 0.42);
  }
  if (F.kind === "lane") {
    if (F.edges.length === 1) return mix(MID[F.edges[0]], [0.5, 0.5], 0.42);
    const [a, b] = F.edges.map((e) => MID[e]), m = bend(F.edges);
    return [0.25 * a[0] + 0.5 * m[0] + 0.25 * b[0], 0.25 * a[1] + 0.5 * m[1] + 0.25 * b[1]];
  }
  const pts = F.halves.map((h) => HALF[h]), avg = [pts.reduce((n, q) => n + q[0], 0) / pts.length, pts.reduce((n, q) => n + q[1], 0) / pts.length];
  const apart = pts.length === 2 && Math.abs(F.halves[0] - F.halves[1]) > 1 && Math.abs(F.halves[0] - F.halves[1]) < 7;
  return Math.abs(avg[0] - 0.5) + Math.abs(avg[1] - 0.5) < 0.2 || apart ? pts[0] : avg;
}
/** A point on a tile turned r times. */
export const turned = ([x, y], r) => { for (let i = 0; i < r; i++) [x, y] = [1 - y, x]; return [x, y]; };

/** Paint one tile, of side 1, into a context already moved and scaled to it. */
export function paintTile(g, k, r) {
  const K = KINDS[k], w = 1 / 64;
  g.save();
  g.translate(0.5, 0.5); g.rotate((r * Math.PI) / 2); g.translate(-0.5, -0.5);
  g.fillStyle = C.meadow; g.fillRect(0, 0, 1, 1);
  g.fillStyle = C.meadow2; // a few tufts, the same on every tile of a kind
  for (let i = 0; i < 5; i++) { const a = ((k * 7 + i * 13) % 17) / 17, b = ((k * 5 + i * 11) % 19) / 19; g.fillRect(0.1 + a * 0.8, 0.1 + b * 0.8, 0.05, 0.02); }
  const ends = K.feats.filter((F) => F.kind === "lane" && F.edges.length === 1 && F.gate < 0).length, well = K.feats.some((F) => F.kind === "well");
  for (const F of K.feats) {
    if (F.kind !== "lane") continue;
    g.beginPath();
    if (F.edges.length === 2) { const [a, b] = F.edges.map((e) => MID[e]); g.moveTo(...a); g.quadraticCurveTo(...bend(F.edges), ...b); }
    else { const end = F.gate >= 0 ? mix([0.5, 0.5], MID[K.feats[F.gate].edges[0]], 0.5) : [0.5, 0.5]; g.moveTo(...MID[F.edges[0]]); g.lineTo(...end); }
    g.lineCap = "butt"; g.strokeStyle = C.laneEdge; g.lineWidth = 0.17; g.stroke();
    g.strokeStyle = C.lane; g.lineWidth = 0.12; g.stroke();
  }
  if (ends >= 2 && !well) { g.fillStyle = C.roof; g.fillRect(0.4, 0.4, 0.2, 0.2); g.strokeStyle = C.wall; g.lineWidth = 2 * w; g.strokeRect(0.4, 0.4, 0.2, 0.2); }
  for (const F of K.feats) {
    if (F.kind !== "town") continue;
    townPath(g, F.edges);
    g.fillStyle = C.town; g.fill();
    g.strokeStyle = C.wall; g.lineWidth = 3 * w; g.stroke();
    const [ax, ay] = anchorOf(k, K.feats.indexOf(F));
    g.fillStyle = C.roof2; g.fillRect(ax - 0.17, ay - 0.04, 0.09, 0.07); g.fillRect(ax + 0.08, ay - 0.06, 0.08, 0.06);
    if (F.market) { g.fillStyle = C.flag; g.beginPath(); g.moveTo(ax + 0.02, ay + 0.02); g.lineTo(ax + 0.02, ay + 0.17); g.lineTo(ax + 0.13, ay + 0.06); g.closePath(); g.fill(); g.strokeStyle = C.wall; g.lineWidth = 2 * w; g.beginPath(); g.moveTo(ax + 0.02, ay + 0.02); g.lineTo(ax + 0.02, ay + 0.22); g.stroke(); }
  }
  if (well) { g.beginPath(); g.arc(0.5, 0.5, 0.12, 0, 7); g.fillStyle = C.stone; g.fill(); g.strokeStyle = C.wall; g.lineWidth = 2 * w; g.stroke(); g.beginPath(); g.arc(0.5, 0.5, 0.065, 0, 7); g.fillStyle = C.well; g.fill(); }
  g.restore();
  g.strokeStyle = C.grid; g.lineWidth = w; g.strokeRect(0, 0, 1, 1);
}
/** A steward in a seat's colour: standing on a lane, town or well, lying down in a meadow. */
function paintSteward(g, [x, y], rgb, lying, size) {
  g.save();
  g.translate(x, y);
  g.fillStyle = `rgb(${rgb})`; g.strokeStyle = "#1b140e"; g.lineWidth = Math.max(1, size / 40);
  g.beginPath();
  if (lying) g.ellipse(0, 0, size * 0.15, size * 0.08, 0, 0, 7); else { g.arc(0, -size * 0.04, size * 0.07, 0, 7); g.moveTo(size * 0.1, size * 0.1); g.arc(0, size * 0.1, size * 0.1, 0, Math.PI, true); g.closePath(); }
  g.fill(); g.stroke();
  g.restore();
}

/** One tile on a small canvas, for the move panel. */
export function tilePicture(canvas, k, r) {
  const g = canvas.getContext("2d"), n = canvas.width;
  g.setTransform(n, 0, 0, n, 0, 0);
  g.clearRect(0, 0, 1, 1);
  paintTile(g, k, r);
}

/**
 * o: state() -> { laid, men: [[tile, feature, seat]], last }, tap(x, y). The page lights the places a tile fits, and the
 * ghost (x, y, k, r, put, seat), with light(); the shell asks for layout, show, zoom, pan and clear.
 */
export function squareBoard(T, stage, o) {
  const c = document.createElement("canvas"), g = c.getContext("2d");
  Object.assign(c.style, { position: "absolute", inset: "0", width: "100%", height: "100%", touchAction: "none", cursor: "pointer" });
  stage.append(c);
  let room = { left: 0, right: 0, top: 0, bottom: 0 }, W = 1, H = 1, dpr = 1, view = { x: 0.5, y: 0.5, s: 60 }, manual = false, places = [], ghost = null, drop = null, still = false, raf = 0, shown = 0;
  const mid = () => [(room.left + W - room.right) / 2, (room.top + H - room.bottom) / 2];
  const toScreen = (x, y) => { const [mx, my] = mid(); return [mx + (x - view.x) * view.s, my + (y - view.y) * view.s]; };
  const toWorld = (sx, sy) => { const [mx, my] = mid(); return [view.x + (sx - mx) / view.s, view.y + (sy - my) / view.s]; };
  function fit() {
    const { laid } = o.state(), xs = laid.map((t) => t[0]), ys = laid.map((t) => t[1]);
    const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 2, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 2;
    const fw = Math.max(80, W - room.left - room.right - 16), fh = Math.max(80, H - room.top - room.bottom - 16);
    view = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, s: Math.max(16, Math.min(110, fw / (x1 - x0), fh / (y1 - y0))) };
  }
  function size() {
    W = stage.clientWidth || innerWidth; H = stage.clientHeight || innerHeight; dpr = Math.min(3, devicePixelRatio || 1);
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  }
  function draw(now = performance.now()) {
    raf = 0;
    const { laid, men, last } = o.state(), s = view.s;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const tileAt = (x, y, k, r, alpha = 1, grow = 1) => {
      const [sx, sy] = toScreen(x + 0.5, y + 0.5), n = s * grow;
      if (sx < -n || sy < -n || sx > W + n || sy > H + n) return;
      g.save(); g.globalAlpha = alpha; g.setTransform(dpr * n, 0, 0, dpr * n, dpr * (sx - n / 2), dpr * (sy - n / 2)); paintTile(g, k, r); g.restore();
    };
    let t = 1;
    if (drop) { t = Math.min(1, (now - drop) / 240); if (t < 1) raf = requestAnimationFrame(draw); else drop = null; }
    laid.forEach(([x, y, k, r], i) => tileAt(x, y, k, r, i === laid.length - 1 && t < 1 ? 0.4 + 0.6 * t : 1, i === laid.length - 1 && t < 1 ? 1.25 - 0.25 * t : 1));
    if (last) { const [sx, sy] = toScreen(last[0], last[1]); g.strokeStyle = "rgba(255, 244, 214, .9)"; g.lineWidth = 2; g.strokeRect(sx + 1, sy + 1, s - 2, s - 2); }
    for (const [t2, f, seat] of men) { const [x, y, k, r] = laid[t2], a = turned(anchorOf(k, f), r); paintSteward(g, toScreen(x + a[0], y + a[1]), T.RGB[seat], KINDS[k].feats[f].kind === "meadow", s); }
    g.setLineDash([Math.max(3, s / 10), Math.max(3, s / 12)]);
    for (const [x, y] of places) { const [sx, sy] = toScreen(x, y); g.fillStyle = "rgba(255, 236, 170, .12)"; g.fillRect(sx + 3, sy + 3, s - 6, s - 6); g.strokeStyle = C.spot; g.lineWidth = 2; g.strokeRect(sx + 3, sy + 3, s - 6, s - 6); }
    g.setLineDash([]);
    if (ghost) {
      tileAt(ghost.x, ghost.y, ghost.k, ghost.r, 0.88);
      const [sx, sy] = toScreen(ghost.x, ghost.y);
      g.strokeStyle = "#fff4d6"; g.lineWidth = 3; g.strokeRect(sx, sy, s, s);
      if (ghost.put >= 0) { const a = turned(anchorOf(ghost.k, ghost.put), ghost.r); paintSteward(g, toScreen(ghost.x + a[0], ghost.y + a[1]), T.RGB[ghost.seat], KINDS[ghost.k].feats[ghost.put].kind === "meadow", s); }
    }
  }
  const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
  // drag to move, wheel or two fingers to zoom, a tap to choose
  const down = new Map();
  let drag = null, pinch = 0;
  const zoomAt = (f, sx, sy) => { const [wx, wy] = toWorld(sx, sy); view.s = Math.max(12, Math.min(220, view.s * f)); const [nx, ny] = toWorld(sx, sy); view.x += wx - nx; view.y += wy - ny; manual = true; redraw(); };
  c.onpointerdown = (e) => {
    c.setPointerCapture?.(e.pointerId);
    down.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (down.size === 1) drag = { x: e.offsetX, y: e.offsetY, moved: false };
    else { const [a, b] = [...down.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); if (drag) drag.moved = true; }
  };
  c.onpointermove = (e) => {
    if (!down.has(e.pointerId)) return;
    const was = down.get(e.pointerId);
    down.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (down.size >= 2) { const [a, b] = [...down.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch > 0) zoomAt(d / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch = d; return; }
    if (!drag) return;
    if (!drag.moved && Math.abs(e.offsetX - drag.x) + Math.abs(e.offsetY - drag.y) < 8) return;
    drag.moved = true; manual = true;
    view.x -= (e.offsetX - was[0]) / view.s; view.y -= (e.offsetY - was[1]) / view.s;
    redraw();
  };
  c.onpointerup = c.onpointercancel = (e) => {
    down.delete(e.pointerId);
    if (down.size < 2) pinch = 0;
    if (e.type === "pointerup" && drag && !drag.moved && !down.size) { const [x, y] = toWorld(e.offsetX, e.offsetY); o.tap(Math.floor(x), Math.floor(y)); }
    if (!down.size) drag = null;
  };
  c.onwheel = (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY); };
  const resized = () => { size(); if (!manual) fit(); draw(); };
  addEventListener("resize", resized);
  size(); fit();
  return {
    looks: [["flat", "Flat"]], look: "flat", setLook() {},
    layout(free) { room = free; size(); if (!manual) fit(); draw(); },
    /** A new position: the last tile drops into place, unless motion is reduced or the moment is hurried. */
    show(order, quick) {
      const n = o.state().laid.length, fresh = n > shown && shown > 0;
      shown = n;
      if (!manual) fit();
      drop = fresh && !quick && !still ? performance.now() : null;
      draw();
      return drop ? 260 : 0;
    },
    light(cells, { ghost: gh = null } = {}) { places = cells; ghost = gh; redraw(); },
    clear() { places = []; ghost = null; redraw(); },
    zoom(f) { if (!f) { manual = false; fit(); draw(); return; } const [mx, my] = mid(); zoomAt(f, mx, my); },
    pan(dx, dy) { view.x += (dx * W) / view.s; view.y += (dy * H) / view.s; manual = true; redraw(); },
    patterns() {},
    motion(mode) { still = mode === "reduced" || (mode === "system" && matchMedia("(prefers-reduced-motion: reduce)").matches); },
    get moving() { return null; },
    destroy() { cancelAnimationFrame(raf); removeEventListener("resize", resized); c.remove(); },
  };
}
