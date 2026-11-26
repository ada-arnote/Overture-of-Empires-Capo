// SPDX-License-Identifier: AGPL-3.0-or-later
// A hex board on a page: the painted surface, standing pieces and emblems, picking, looks and animation.
// It never changes a game. It is told what to show and says which cell was pointed at.
import { Camera, pick } from "./camera.js";
import { hexPicture } from "./hexes.js";
import { Meshes } from "./mesh.js";
import { models, unpack } from "./models.js";
import { Painter } from "./paint.js";
import { STYLES, styleOf } from "./style.js";

const DEG = Math.PI / 180;
export const LOOKS = {
  relief: { name: "Tilted relief", tilt: 44 * DEG, yaw: 0, near: 0.55, relief: 1, rise: 0.75 },
  blocks: { name: "Raised blocks", tilt: 48 * DEG, yaw: 0, near: 0.55, relief: 0.6, rise: 1.6 },
  isometric: { name: "Isometric", tilt: 54.7 * DEG, yaw: 45 * DEG, near: 0, relief: 0.6, rise: 1.6 },
  flat: { name: "Flat", tilt: 0, yaw: 0, near: 0, relief: 0.75, rise: 0 },
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const ease = (t) => t * t * (3 - 2 * t);

/** Emblems stand on the ground as a second sign beside colour. Drawn about a middle of (0, 0), size about 1. */
const poly = (list) => (c) => { list.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
export const EMBLEMS = [
  ["Drop", (c) => { c.moveTo(0, -0.5); c.bezierCurveTo(0.2, -0.16, 0.36, 0, 0.36, 0.18); c.arc(0, 0.18, 0.36, 0, Math.PI); c.bezierCurveTo(-0.36, 0, -0.2, -0.16, 0, -0.5); }],
  ["Diamond", poly([[0, -0.46], [0.44, 0], [0, 0.46], [-0.44, 0]])],
  ["Cross", poly([[-0.13, -0.44], [0.13, -0.44], [0.13, -0.13], [0.44, -0.13], [0.44, 0.13], [0.13, 0.13], [0.13, 0.44], [-0.13, 0.44], [-0.13, 0.13], [-0.44, 0.13], [-0.44, -0.13], [-0.13, -0.13]])],
  ["Star", poly(Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 0.2 : 0.48, a = (i * Math.PI) / 5; return [Math.sin(a) * r, -Math.cos(a) * r]; }))],
  ["Ring", (c) => { c.arc(0, 0, 0.44, 0, 7); c.moveTo(0.22, 0); c.arc(0, 0, 0.22, 0, 7, true); }],
  ["Peak", poly([[0, -0.46], [0.48, 0.4], [-0.48, 0.4]])],
  ["Block", poly([[-0.38, -0.38], [0.38, -0.38], [0.38, 0.38], [-0.38, 0.38]])],
  ["Moon", (c) => { c.arc(0, 0, 0.44, 0.7, 5.6); c.arc(0.2, 0, 0.34, 5.2, 1.1, true); c.closePath(); }],
  ["Crown", poly([[-0.44, 0.34], [-0.44, -0.3], [-0.2, 0], [0, -0.42], [0.2, 0], [0.44, -0.3], [0.44, 0.34]])],
  ["Tree", poly([[0, -0.48], [0.34, 0.02], [0.18, 0.02], [0.4, 0.3], [0.08, 0.3], [0.08, 0.48], [-0.08, 0.48], [-0.08, 0.3], [-0.4, 0.3], [-0.18, 0.02], [-0.34, 0.02]])],
  ["Bolt", poly([[0.12, -0.5], [-0.32, 0.08], [-0.04, 0.08], [-0.12, 0.5], [0.32, -0.1], [0.04, -0.1]])],
  ["Heart", (c) => { c.moveTo(0, 0.44); c.bezierCurveTo(-0.7, -0.06, -0.34, -0.58, 0, -0.22); c.bezierCurveTo(0.34, -0.58, 0.7, -0.06, 0, 0.44); }],
];
export function emblem(ctx, icon, x, y, size, flat = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size * flat);
  ctx.beginPath();
  EMBLEMS[icon % EMBLEMS.length][1](ctx);
  ctx.restore();
}
/** The six seat patterns for things drawn on the page, the same as the painter's: /, dots, |, x, \, -. Light lines on dark colours. */
const TILES = new Map();
export function seatPattern(ctx, seat, rgb) {
  const k = seat % 6, light = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 > 0.45, key = k * 2 + light;
  if (!TILES.has(key)) {
    const t = document.createElement("canvas"), c = t.getContext("2d");
    t.width = t.height = 8;
    c.strokeStyle = c.fillStyle = light ? "rgba(24,20,18,.5)" : "rgba(250,244,228,.5)"; c.lineWidth = 1.4;
    const lines = [[[0, 8, 8, 0], [-2, 2, 2, -2], [6, 10, 10, 6]], [], [[4, 0, 4, 8]], [[0, 8, 8, 0], [0, 0, 8, 8]], [[0, 0, 8, 8], [-2, 6, 2, 10], [6, -2, 10, 2]], [[0, 4, 8, 4]]][k];
    for (const [a, b, x, y] of lines) { c.beginPath(); c.moveTo(a, b); c.lineTo(x, y); c.stroke(); }
    if (k === 1) { c.beginPath(); c.arc(4, 4, 1.5, 0, 7); c.fill(); }
    TILES.set(key, t);
  }
  return ctx.createPattern(TILES.get(key), "repeat");
}
const tower = (c) => { c.beginPath(); [[-0.3, 0], [-0.22, -0.62], [-0.31, -0.7], [-0.31, -1.04], [-0.17, -1.04], [-0.17, -0.92], [-0.07, -0.92], [-0.07, -1.04], [0.07, -1.04], [0.07, -0.92], [0.17, -0.92], [0.17, -1.04], [0.31, -1.04], [0.31, -0.7], [0.22, -0.62], [0.3, 0]].forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };

/** Can this device draw the moving board at all? */
export function canDraw() {
  const c = document.createElement("canvas");
  let g = null;
  try { g = c.getContext("webgl2", { failIfMajorPerformanceCaveat: true }); } catch { return false; }
  if (!g) return false;
  const x = g.getExtension("WEBGL_debug_renderer_info"), name = String(x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : "");
  g.getExtension("WEBGL_lose_context")?.loseContext();
  return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}

/** terrain(i): what the land of a cell is, shown as a shape on its top (2 grain, 3 clay, 4 sand, 5 salt, 6 rock, 7 hills). wood: the address of the table's picture. probe: time the first frames and say "slow" if they drag. */
export function createBoard(host, { cells, rough = [], sea = [], seats, ground, look = "relief", picture = null, lands = null, lines = [], labels = [], icons = [0, 1, 2, 3, 4, 5], size = 44, fit = null, terrain = null, wood = "", probe = false, style = "painted" }) {
  const under = host.appendChild(document.createElement("canvas")), over = host.appendChild(document.createElement("canvas")), ctx = over.getContext("2d");
  for (const c of [under, over]) c.className = "board-layer";
  over.style.pointerEvents = "none";
  const m = picture || hexPicture(cells, rough, sea, size), painter = new Painter(under), cam = new Camera(), system = matchMedia("(prefers-reduced-motion: reduce)");
  painter.load(m);
  const ends = m.ends || (fit ? fit.map((i) => m.mid[i]) : m.mid).flatMap(([x, y]) => [[x - m.R, y], [x + m.R, y], [x, y - m.R], [x, y + m.R]]); // fit: the cells worth framing (an island without most of its sea)
  const show = m.mid.map((_, i) => ({ land: lands?.[i], kind: sea[i] ? 1 : terrain?.(i) || 0, rgb: ground(i), from: ground(i), to: ground(i), owner: -1, top: sea[i] ? 0.2 : 1, topTo: sea[i] ? 0.2 : 1, glow: 0, wet: 0, start: 0, ends: 0 }));
  if (wood) { const img = new Image(); img.onload = () => { if (alive) { painter.wood(img); redraw(); } }; img.src = wood; }
  let timed = probe ? [] : null;
  // The mesh layer: real shapes for scenery and pieces, in every look but Flat (where the drawn pieces stay, as the plain and accessible view).
  let look3 = styleOf(style), styleName = STYLES[style] ? style : "war";
  const lift = () => 9 * L.rise;
  let meshes = null, staged = false;
  try { meshes = new Meshes(painter.g, models()); } catch (e) { console.warn("The models did not start; the drawn pieces stay:", e); }
  const solid = () => L.rise > 0 && !!meshes;
  /** Pieces on a map of small cells are made larger, so that they read when the whole board is in view (they still grow as you zoom in). */
  const grown = () => Math.max(1, Math.min(picture ? 3.2 : 1.25, 24 / (m.R * base))); // on a board of hexes a piece must still fit its own hex
  /** What stands on the board, as models: scenery from what the land is, then the pieces the game lists. Sizes are in cell radii. */
  function stage() {
    const out = [], R = m.R, big = grown(), rnd = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
    const put = (name, at, dx = 0, dy = 0, s = 1, rgb = null, t = 0, dim = 1) => (look3.models[name] ?? name) && out.push({ m: look3.models[name] ?? name, x: m.mid[at][0] + dx * R * big, y: m.mid[at][1] + dy * R * big, z: show[at].top, s: s * R * big * look3.scale, rgb, t, dim });
    show.forEach((c, i) => {
      if (c.kind === 7) put("hill", i, 0, 0, (R < 20 ? 0.62 : 0.9) / big, c.rgb.map((v) => v * 0.94), rnd(i, 1) * 6);
      else if (c.kind === 6 || c.kind === 10) put("peak", i, 0, -0.05, c.kind === 6 ? 0.62 : 1, null, rnd(i, 2) * 6);
      else if (c.kind === 2) put("hut", i, -0.5, -0.42, 0.62, null, 0.3 + rnd(i, 3));
      else if (c.kind === 9) put("sheep", i, 0, 0, 0.9, null, rnd(i, 4) * 6);
      else if (c.kind === 8) for (let k = 0; k < 4; k++) put(k % 2 ? "oak" : "tree", i, (rnd(i, k) - 0.5) * 1.1, (rnd(i, k + 9) - 0.5) * 1.0, 0.6 + rnd(i, k + 5) * 0.3, null, rnd(i, k) * 6);
    });
    for (const s of spots) {
      const at = s.at, rgb = s.rgb;
      if (s.kind === "tree") [[-0.36, 0.14, 0.95], [0.32, 0.22, 0.9], [0.02, -0.24, 1.2]].forEach(([x, y, k], n) => put(rnd(at, n) > 0.7 ? "oak" : "tree", at, x + (rnd(at, n + 3) - 0.5) * 0.14, y, k * (0.9 + rnd(at, n + 6) * 0.2), null, rnd(at, n) * 6));
      else if (["cairn", "farm", "fort", "gate", "well", "quay", "watch", "archive"].includes(s.kind)) put(s.kind === "watch" ? "tower" : s.kind, at, 0, 0, s.kind === "farm" ? 0.8 : 0.95);
      else if (s.kind === "tower") put("hall", at, 0, 0, 1.25, rgb);
      else if (s.kind === "unit") put(`unit${Math.min(4, s.rank)}`, at, 0, 0.08, 1.02 + s.rank * 0.05, rgb, s.rank === 3 ? -0.5 : 0, s.tired ? 0.66 : 1);
      else if (s.kind === "army") {
        if (s.fort) put("wall", at, 0, 0, 0.82);
        if (s.cap) put("castle", at, -0.62, -0.5, 0.8, rgb);
        if (s.leader) put("unit4", at, 0.62, -0.3, 0.74, rgb);
        if (s.seat >= 0) put(s.count >= 10 ? "gun" : s.count >= 5 ? "horse" : "foot", at, 0, 0, 0.92, rgb, s.count >= 5 ? -0.45 : 0);
      } else if (s.kind === "token") put("token", at, 0, 0, 1.18);
      else if (s.kind === "route") s.seats.forEach((c, k) => { const a = -0.9 + k * 0.62; put("bar", at, Math.cos(a) * 0.62, Math.sin(a) * 0.62 - 0.1, 1, c, a + Math.PI / 2); });
      else if (s.kind === "depot" || s.kind === "town") put(s.kind, at, R < 20 ? 0 : 0.5, R < 20 ? 0 : 0.36, R < 20 ? 0.8 : 0.72, rgb, 0.35);
      else if (s.kind === "port") put("port", at, -0.55, -0.3, 0.7, null, 2.4);
      else if (s.kind === "ship") put("ship", at, 0, 0, 0.9, rgb, s.turn || 0);
      else if (s.kind === "model") put(s.name, at, s.dx || 0, s.dy || 0, s.size || 1, rgb, s.turn || 0, s.dim ?? 1); // any model by name: dice on the table, a ship at sea
    }
    meshes.set(out);
    staged = true;
  }
  const tops = new Float32Array(m.n + 1), listeners = { pick: [], hover: [] };
  let L = LOOKS[look], lookName = look, motion = "system", pat = false, queued = false, dirty = true, alive = true, spots = [], hovering = -1, swing = null, until = 0, lit = 0, marks = [], point = null;

  /** Reduced motion is the player's choice, or the system's when they follow it. Changes then fade quickly in place instead of moving. */
  const calm = () => motion === "reduced" || (motion === "system" && system.matches);
  const unit = () => 9 * L.rise * cam.s, most = () => unit() * 2.2, dpr = () => Math.min(2, Math.max(1.5, devicePixelRatio || 1)); // thin lines need the extra samples on a plain screen
  function redraw() { if (!queued && alive) { queued = true; requestAnimationFrame(frame); } }

  function frame(t) {
    queued = false;
    if (!alive) return;
    let moving = t < until;
    if (timed && L.rise) { // the first frames, timed: a device that drags is told so, and the page can open flat instead
      timed.push(t);
      if (timed.length < 16 && !document.hidden) moving = true;
      else { const d = timed.slice(4).map((v, i) => v - timed[i + 3]).sort((a, b) => a - b); if (timed.length > 15 && d[d.length >> 2] > 24) (listeners.slow || []).forEach((f) => f()); timed = null; } // the quickest quarter is judged, so a busy moment on the page is not taken for a slow graphics card
    }
    show.forEach((c, i) => {
      if (c.start || c.ends) {
        const k = t <= c.start ? 0 : t >= c.ends ? 1 : (t - c.start) / (c.ends - c.start);
        c.rgb = mix(c.from, c.to, ease(k));
        c.top = c.topFrom + (c.topTo - c.topFrom) * ease(k) + Math.sin(k * Math.PI) * c.hop;
        c.wet = c.soak ? Math.max(0, 1 - Math.max(0, t - c.start) / 1500) * (k > 0 ? 1 : 0) : 0;
        if (k < 1 || c.wet > 0) moving = true;
        else { c.start = c.ends = 0; c.soak = false; }
        dirty = true; staged = false; // what stands on a cell rides with it
      }
      tops[i + 1] = c.top;
    });
    if (swing && zoom !== 1) { zoom = 1; }
    if (swing) {
      const k = Math.min(1, (t - swing.t) / 420), e = ease(k);
      cam.set({ tilt: swing.a.tilt + (L.tilt - swing.a.tilt) * e, yaw: swing.a.yaw + (L.yaw - swing.a.yaw) * e, q: swing.a.q + (near() - swing.a.q) * e });
      cam.fit(ends, 14);
      base = cam.s;
      if (k >= 1) { swing = null; layout(asked); } else moving = true; // shell hook (p8-shell): a new look settles at the home zoom, not the whole board
    }
    const beat = calm() || !lit ? 0 : Math.max(0, 1.5 - (t - lit) / 1000); // a preview pulses briefly, then the board is still
    if (beat > 0) moving = true;
    if (dirty) { painter.send(show); dirty = false; }
    const on = solid();
    if (on) { if (!staged) stage(); meshes.cast([-72, -72, m.w + 144, m.h + 144], lift(), look3.sun); }
    painter.draw(cam, dpr(), { style: look3, lamp: on ? (u) => meshes.lamp(u, true, look3.sun) : null, unit: unit(), most: L.rise ? most() : 0, relief: L.relief, time: beat, pat, bevel: L.rise ? Math.max(1.5, Math.min(5, m.R * 0.1)) : 0, table: L.rise > 0, ink: [24, 20, 18], pale: [250, 244, 228], wall: [34, 27, 24], glow: [226, 233, 241], land: [255, 226, 150] }); // silver marks what can be chosen; the lands keep their own line
    if (on) meshes.draw(cam, lift(), look3);
    drawOver(t);
    if (moving) redraw();
  }

  /** A standing figure. Its rank shows as bars on its chest; one that has acted is dimmed. */
  function figure(s, x, y, h) {
    ctx.beginPath(); ctx.ellipse(x + h * 0.08, y, h * 0.34, h * 0.13, 0, 0, 7); ctx.fillStyle = "rgba(12,9,7,.42)"; ctx.fill();
    if (s.now) { ctx.beginPath(); ctx.ellipse(x, y, h * 0.42, h * 0.17, 0, 0, 7); ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(238,243,248,.95)"; ctx.stroke(); }
    ctx.save(); ctx.translate(x, y); ctx.scale(h, h);
    ctx.beginPath(); ctx.moveTo(-0.27, 0); ctx.quadraticCurveTo(-0.25, -0.34, -0.17, -0.58); ctx.lineTo(-0.1, -0.62); ctx.arc(0, -0.8, 0.19, 2.1, 7.32); ctx.lineTo(0.17, -0.58); ctx.quadraticCurveTo(0.25, -0.34, 0.27, 0); ctx.closePath();
    ctx.lineWidth = 3.2 / h; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(20,15,12,.95)"; ctx.stroke();
    const g = ctx.createLinearGradient(-0.28, 0, 0.3, 0), c = s.rgb, d = s.tired ? 0.72 : 1;
    g.addColorStop(0, `rgb(${c.map((v) => Math.round(Math.min(255, v * 1.45 + 30) * d))})`); g.addColorStop(1, `rgb(${c.map((v) => Math.round(v * 0.62 * d))})`);
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = s.tired ? "#cfc4aa" : "#fff6dd"; ctx.strokeStyle = "rgba(20,15,12,.9)"; ctx.lineWidth = 1.2 / h;
    for (let i = 0; i < Math.min(3, s.rank); i++) { ctx.beginPath(); ctx.rect(-0.14, -0.2 - i * 0.14, 0.28, 0.085); ctx.fill(); ctx.stroke(); }
    if (s.rank >= 4) { ctx.beginPath(); [[-0.17, -0.96], [-0.17, -1.12], [-0.08, -1.03], [0, -1.15], [0.08, -1.03], [0.17, -1.12], [0.17, -0.96]].forEach(([u, v], i) => ctx[i ? "lineTo" : "moveTo"](u, v)); ctx.closePath(); ctx.fillStyle = "#ffd76a"; ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }

  /** A piece and how strong the place is: foot, horse from five, a gun from ten. Land that is nobody's has the number only. */
  function army(s, x, y, r) {
    ctx.lineJoin = "round";
    if (s.fort) { ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 + 0.39; ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r * 1.05); } ctx.closePath(); ctx.lineWidth = Math.max(3, r * 0.22); ctx.strokeStyle = "#1a1411"; ctx.stroke(); ctx.lineWidth = Math.max(1.5, r * 0.11); ctx.strokeStyle = "#d8c9a0"; ctx.stroke(); }
    if (s.seat >= 0) {
      const h = r * 1.65, X = x - r * 0.1, Y = y - r * 0.5;
      ctx.save(); ctx.translate(X, Y); ctx.scale(h, h);
      ctx.beginPath();
      if (s.count >= 10) { ctx.moveTo(-0.5, -0.2); ctx.lineTo(0.5, -0.52); ctx.lineTo(0.56, -0.36); ctx.lineTo(0.02, -0.14); ctx.arc(-0.08, 0, 0.2, -0.9, Math.PI * 1.4); ctx.lineTo(-0.5, -0.04); ctx.closePath(); } // a gun on its wheel
      else if (s.count >= 5) { [[-0.34, 0.02], [-0.3, -0.34], [-0.06, -0.62], [0.02, -0.78], [0.1, -0.64], [0.3, -0.5], [0.4, -0.26], [0.3, -0.18], [0.1, -0.28], [0.06, -0.2], [0.26, 0.02]].forEach(([u, v], i) => (i ? ctx.lineTo(u, v) : ctx.moveTo(u, v))); ctx.closePath(); } // a horse's head
      else { ctx.moveTo(-0.22, 0.02); ctx.lineTo(-0.15, -0.42); ctx.lineTo(-0.08, -0.5); ctx.arc(0, -0.64, 0.14, 2.2, 7.2); ctx.lineTo(0.15, -0.42); ctx.lineTo(0.22, 0.02); ctx.closePath(); } // a soldier
      ctx.lineWidth = 4 / h; ctx.strokeStyle = "#1a1411"; ctx.stroke();
      const g = ctx.createLinearGradient(0, -0.8, 0, 0.1); g.addColorStop(0, `rgb(${s.rgb.map((v) => Math.round(Math.min(255, v * 1.3 + 26)))})`); g.addColorStop(1, `rgb(${s.rgb.map((v) => Math.round(v * 0.72))})`);
      ctx.fillStyle = g; ctx.fill();
      ctx.restore();
    }
    const q = Math.max(9.5, r * (s.seat < 0 ? 0.56 : 0.68));
    ctx.beginPath(); ctx.arc(x, y, q, 0, 7); ctx.fillStyle = s.seat < 0 ? "rgba(214,202,172,.94)" : s.now ? "#dfe8f3" : "#f6eedb"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = s.seat < 0 ? "#1a1411" : `rgb(${s.rgb.map((v) => Math.round(v * 0.45))})`; ctx.stroke();
    if (s.seat >= 0) { emblem(ctx, icons[s.seat], x + q * 1.15, y - q * 0.15, q * 0.95); ctx.lineWidth = 2.5; ctx.strokeStyle = "#1a1411"; ctx.stroke(); ctx.fillStyle = "#fdf6e4"; ctx.fill("evenodd"); }
    if (s.cap) { emblem(ctx, 3, x - q * 1.2, y - q * 0.1, q * 1.1); ctx.lineWidth = 2.5; ctx.strokeStyle = "#1a1411"; ctx.stroke(); ctx.fillStyle = "#ffd76a"; ctx.fill(); }
    if (s.leader) { emblem(ctx, 8, x, y - r * 2.15, q * 1.1); ctx.lineWidth = 2.5; ctx.strokeStyle = "#1a1411"; ctx.stroke(); ctx.fillStyle = "#ffd76a"; ctx.fill(); }
    ctx.fillStyle = "#1a1411"; ctx.font = `700 ${Math.round(q * (s.count > 99 ? 0.85 : 1.15))}px system-ui,"Segoe UI",sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(s.count), x, y + 0.5);
  }
  /** A number on its plate: round for short numbers, and it grows sideways so that five digits still fit. */
  function plate(text, x, y, r, fill) {
    ctx.font = `700 ${Math.round(r * 1.12)}px system-ui,"Segoe UI",sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const w = Math.max(0, ctx.measureText(text).width / 2 - r * 0.62);
    ctx.beginPath(); ctx.arc(x - w, y, r, Math.PI / 2, Math.PI * 1.5); ctx.arc(x + w, y, r, -Math.PI / 2, Math.PI / 2); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#1a1411"; ctx.stroke();
    ctx.fillStyle = "#1a1411"; ctx.fillText(text, x, y + 0.5);
  }
  function arrow(a, b) {
    cam.projectTo(m.mid[a][0], m.mid[a][1], show[a].top * unit()); const x = cam.px, y = cam.py; cam.projectTo(m.mid[b][0], m.mid[b][1], show[b].top * unit());
    const X = cam.px, Y = cam.py, long = Math.hypot(X - x, Y - y) || 1, u = (X - x) / long, v = (Y - y) / long, w = 5, g = 15, p = (t, n) => [x + u * t - v * n, y + v * t + u * n], s = Math.min(16, long / 4), e = Math.max(s + 2, long - 17);
    ctx.beginPath(); [p(s, -w / 2), p(e - g, -w), p(e - g, -w * 2.2), p(e, 0), p(e - g, w * 2.2), p(e - g, w), p(s, w / 2)].forEach(([i, j], k) => (k ? ctx.lineTo(i, j) : ctx.moveTo(i, j))); ctx.closePath();
    ctx.fillStyle = "rgba(232,238,245,.94)"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#1a1411"; ctx.stroke();
  }

  function drawOver(t) {
    const d = dpr(), W = Math.round(cam.W * d), H = Math.round(cam.H * d);
    if (over.width !== W || over.height !== H) { over.width = W; over.height = H; }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, cam.W, cam.H);
    const flat = Math.max(0.5, cam.ct), size = m.R * cam.s;
    marks.forEach((k, i) => { // emblems lie on the ground
      if (!k || k.home || m.R < 20 || icons[k.seat] === undefined) return; // no emblems on very small cells
      k.seen = show[i].ends ? Math.max(0, Math.min(1, (t - show[i].start) / 260)) : 1;
      if (!k.seen) return;
      cam.projectTo(m.mid[i][0], m.mid[i][1], show[i].top * unit());
      emblem(ctx, icons[k.seat], cam.px, cam.py, size * 0.42 * cam.pk, flat);
      // ink by the ground's brightness: dark marks on light colours, light marks on dark ones, so both read
      const [r, g, b] = show[i].rgb, bright = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
      ctx.fillStyle = bright ? `rgba(24,18,14,${0.62 * k.seen})` : `rgba(252,247,234,${0.62 * k.seen})`;
      ctx.fill("evenodd");
      ctx.lineWidth = 1; ctx.strokeStyle = bright ? `rgba(252,247,234,${0.4 * k.seen})` : `rgba(20,16,14,${0.4 * k.seen})`; ctx.stroke();
    });
    for (const l of labels) { // names printed on the map
      cam.projectTo(l.at[0], l.at[1], unit());
      const px = Math.max(11, Math.min(30, size * 0.62));
      ctx.font = `italic 600 ${px}px "Palatino Linotype",Palatino,Georgia,serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
      if (!l.sea) { ctx.lineWidth = px * 0.22; ctx.strokeStyle = "rgba(252,245,222,.62)"; ctx.strokeText(l.text, cam.px, cam.py); }
      ctx.fillStyle = l.sea ? "rgba(244,236,210,.92)" : "rgba(40,26,18,.86)"; ctx.fillText(l.text, cam.px, cam.py);
    }
    for (const [a, b] of lines) { // crossings over water
      cam.projectTo(a[0], a[1], 0.6 * unit()); const x = cam.px, y = cam.py; cam.projectTo(b[0], b[1], 0.6 * unit());
      ctx.setLineDash([7, 6]); ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(250,240,214,.8)"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cam.px, cam.py); ctx.stroke(); ctx.setLineDash([]);
    }
    const chosen = new Set(spots.flatMap((s) => (s.kind === "dot" && !s.small ? [s.at] : []))), numbered = new Set(spots.flatMap((s) => (s.kind === "token" ? [s.at] : [])));
    const on = solid(), R3 = m.R * grown();
    for (const s of spots) { // things that grow or are built on the ground
      const kind = { well: "cairn", quay: "port", watch: "fort", archive: "depot" }[s.kind] || s.kind; // An Inch of Ink's places, as they are drawn flat
      if (!["tree", "cairn", "farm", "fort", "token", "route", "depot", "town", "gate", "port"].includes(kind) || (on && kind !== "token")) continue;
      cam.projectTo(m.mid[s.at][0], m.mid[s.at][1], show[s.at].top * unit());
      const x = cam.px, y = cam.py, h = size * 0.62 * cam.pk;
      ctx.lineJoin = "round"; ctx.lineWidth = 2; ctx.strokeStyle = "#1a1411";
      if (s.kind === "token") { // the hex's number, red when it comes up often
        const r = Math.min(size * 0.4 * cam.pk, Math.max(10, h * 0.46)); // never so big that the ground's colour is lost, or tokens touch on a small screen
        if (chosen.has(s.at) && size * cam.pk >= 30) { ctx.beginPath(); ctx.arc(x, y, r + Math.max(3, r * 0.3), 0, 7); ctx.lineWidth = 5; ctx.strokeStyle = "#1a1411"; ctx.stroke(); ctx.lineWidth = 2.5; ctx.strokeStyle = "#eef2f6"; ctx.stroke(); ctx.strokeStyle = "#1a1411"; } // can be chosen: a ring round the number, which stays in view (small hexes have only their bright edge, so the ground still shows)
        if (on) { cam.projectTo(m.mid[s.at][0], m.mid[s.at][1], show[s.at].top * unit() + m.R * 0.09 * cam.s); ctx.fillStyle = s.hot ? "#b0302a" : "#1a1411"; ctx.font = `700 ${Math.round(r * 1.05)}px Georgia,serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.save(); ctx.translate(cam.px, cam.py); ctx.scale(1, Math.max(0.62, cam.ct)); if (s.lit) { ctx.beginPath(); ctx.arc(0, 0, r * 1.08, 0, 7); ctx.lineWidth = Math.max(3, r * 0.3); ctx.strokeStyle = "#f6f8fb"; ctx.stroke(); } ctx.fillText(String(s.n), 0, 1); ctx.restore(); continue; } // the disc is a model; its number lies on it
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = "#f3e7c6"; ctx.fill();
        ctx.lineWidth = 1.5; ctx.stroke();
        if (s.lit) { const b = Math.max(4, r * 0.4); ctx.beginPath(); ctx.arc(x, y, r + b / 2, 0, 7); ctx.lineWidth = b + 3; ctx.strokeStyle = "#1a1411"; ctx.stroke(); ctx.lineWidth = b; ctx.strokeStyle = "#f6f8fb"; ctx.stroke(); } // it yielded on the last roll: a bright band round the number
        ctx.fillStyle = s.hot ? "#b0302a" : "#1a1411"; ctx.font = `700 ${Math.round(r * 1.05)}px Georgia,serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(s.n), x, y + 1);
        continue;
      }
      if (kind === "route") { s.seats.forEach((rgb, k) => { const a = -0.9 + k * 0.55; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * h * 0.8, y + Math.sin(a) * h * 0.55 - h * 0.35, h * 0.2, h * 0.11, a, 0, 7); ctx.fillStyle = `rgb(${rgb})`; ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke(); }); continue; }
      if (kind === "depot" || kind === "town") { // a house, or a house with a hall
        const X = x + h * 0.55, Y = y + h * 0.45, k = kind === "town" ? 1.25 : 0.9;
        ctx.beginPath(); [[-0.4, 0], [-0.4, -0.45], [0, -0.85], [0.4, -0.45], [0.4, 0]].forEach(([u, v], i) => ctx[i ? "lineTo" : "moveTo"](X + u * h * k, Y + v * h * k)); ctx.closePath();
        if (kind === "town") { ctx.moveTo(X + 0.4 * h * k, Y); ctx.lineTo(X + 0.95 * h * k, Y); ctx.lineTo(X + 0.95 * h * k, Y - 0.35 * h * k); ctx.lineTo(X + 0.4 * h * k, Y - 0.35 * h * k); }
        ctx.fillStyle = `rgb(${s.rgb})`; ctx.fill(); if (pat && s.seat >= 0) { ctx.fillStyle = seatPattern(ctx, s.seat, s.rgb); ctx.fill(); } ctx.lineWidth = 2.2; ctx.stroke();
        if (s.harbour) { ctx.beginPath(); ctx.arc(X, Y - 0.32 * h * k, h * 0.1, 0, 7); ctx.fillStyle = "#fdf6e4"; ctx.fill(); }
        continue;
      }
      if (kind === "gate") { ctx.beginPath(); ctx.rect(x - h * 0.6, y - h * 0.95, h * 0.18, h * 0.9); ctx.rect(x + h * 0.42, y - h * 0.95, h * 0.18, h * 0.9); ctx.fillStyle = "#3a2c22"; ctx.fill(); ctx.beginPath(); ctx.rect(x - h * 0.6, y - h * 0.75, h * 1.2, h * 0.16); ctx.fillStyle = "#e9c46a"; ctx.fill(); ctx.stroke(); continue; }
      if (kind === "port") { ctx.beginPath(); ctx.moveTo(x - h * 0.7, y - h * 0.62); ctx.lineTo(x - h * 0.7, y - h * 0.18); ctx.lineWidth = 2; ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - h * 0.7, y - h * 0.62); ctx.lineTo(x - h * 0.36, y - h * 0.5); ctx.lineTo(x - h * 0.7, y - h * 0.38); ctx.closePath(); ctx.fillStyle = s.good === 4 ? "#fdf6e4" : ["#e2c460", "#b0d0d8", "#c47852", "#e4e2d6"][s.good]; ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke(); continue; }
      if (kind === "farm") { for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.ellipse(x, y + k * h * 0.28 * flat, h * 0.62, h * 0.1 * flat + 1, 0, 0, 7); ctx.fillStyle = k ? "#d9b85a" : "#e8cc70"; ctx.fill(); ctx.stroke(); } continue; }
      if (kind === "cairn") { for (const [u, v, r] of [[-0.2, 0.05, 0.2], [0.18, 0.08, 0.18], [0, -0.14, 0.17]]) { ctx.beginPath(); ctx.ellipse(x + u * h, y + v * h, r * h, r * h * 0.8, 0, 0, 7); ctx.fillStyle = "#9a9384"; ctx.fill(); ctx.stroke(); } continue; }
      if (kind === "fort") {
        ctx.beginPath(); [[-0.55, 0.2], [-0.55, -0.55], [-0.36, -0.55], [-0.36, -0.42], [-0.12, -0.42], [-0.12, -0.55], [0.12, -0.55], [0.12, -0.42], [0.36, -0.42], [0.36, -0.55], [0.55, -0.55], [0.55, 0.2]].forEach(([u, v], i) => ctx[i ? "lineTo" : "moveTo"](x + u * h, y + v * h)); ctx.closePath();
        ctx.fillStyle = s.rgb ? `rgb(${s.rgb.map((v) => Math.round(v * 0.55 + 90))})` : "#b9ad93"; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - h * 0.14, y + h * 0.2); ctx.lineTo(x - h * 0.14, y - h * 0.08); ctx.arc(x, y - h * 0.08, h * 0.14, Math.PI, 0); ctx.lineTo(x + h * 0.14, y + h * 0.2); ctx.fillStyle = "#3a2c22"; ctx.fill();
        continue;
      }
      for (const [u, v, k] of [[-0.24, 0.1, 0.8], [0.22, 0.14, 0.75], [0, -0.06, 1]]) { // a wood: three dark trees
        const X = x + u * h, Y = y + v * h, t = h * k;
        ctx.beginPath(); ctx.moveTo(X, Y - t * 0.9); ctx.lineTo(X + t * 0.32, Y - t * 0.15); ctx.lineTo(X + t * 0.14, Y - t * 0.15); ctx.lineTo(X + t * 0.38, Y + t * 0.22); ctx.lineTo(X - t * 0.38, Y + t * 0.22); ctx.lineTo(X - t * 0.14, Y - t * 0.15); ctx.lineTo(X - t * 0.32, Y - t * 0.15); ctx.closePath();
        ctx.fillStyle = "#2f5a34"; ctx.fill(); ctx.stroke();
      }
    }
    for (const s of spots) if (s.kind === "dot" && !numbered.has(s.at)) { // a numbered hex is ringed round its number instead
      cam.projectTo(m.mid[s.at][0], m.mid[s.at][1], show[s.at].top * unit());
      const held = spots.some((x) => x.at === s.at && (x.kind === "unit" || x.kind === "tower" || x.kind === "army")), r = size * (held ? 0.62 : s.small ? 0.1 : 0.15);
      ctx.beginPath(); ctx.ellipse(cam.px, cam.py, r, r * flat, 0, 0, 7);
      if (held) { ctx.lineWidth = 5; ctx.strokeStyle = "rgba(24,20,18,.55)"; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = "rgba(238,243,248,.95)"; ctx.stroke(); continue; }
      ctx.fillStyle = "rgba(238,243,248,.95)"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(24,20,18,.8)"; ctx.stroke();
    }
    for (const s of spots) if (s.kind === "ring") {
      cam.projectTo(m.mid[s.at][0], m.mid[s.at][1], show[s.at].top * unit());
      ctx.beginPath(); ctx.ellipse(cam.px, cam.py, size * 0.7, size * 0.7 * flat, 0, 0, 7); ctx.fillStyle = s.aim ? "rgba(255,255,255,.25)" : "rgba(226,233,241,.28)"; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = s.aim ? "#ffffff" : "#dfe6ee"; ctx.stroke(); if (s.aim) { ctx.lineWidth = 1.5; ctx.strokeStyle = "#1a1411"; ctx.stroke(); }
    }
    const stand = spots.filter((s) => s.kind === "tower" || s.kind === "unit" || s.kind === "army").map((s) => { cam.projectTo(m.mid[s.at][0], m.mid[s.at][1], show[s.at].top * unit()); return { s, x: cam.px, y: cam.py, k: cam.pk }; }).sort((a, b) => a.y - b.y);
    for (const { s, x, y, k } of stand) {
      if (on) { // the piece is a model: the page adds what must stay sharp, its number on a plate above it, and the owner's sign
        const army = s.kind === "army", tall = army ? 0 : 1.5;
        if (s.kind === "unit") { if (s.now) { ctx.beginPath(); ctx.ellipse(x, y + size * 0.08 * flat, size * 0.36 * k, size * 0.36 * k * flat, 0, 0, 7); ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(238,243,248,.95)"; ctx.stroke(); } continue; }
        cam.projectTo(m.mid[s.at][0], m.mid[s.at][1] + (army && s.seat >= 0 ? R3 * 0.52 : 0), show[s.at].top * unit() + tall * R3 * cam.s); // an army's number lies at its foot, toward the player; a hall's floats over its roof
        const r = Math.max(8.5, Math.min(15, R3 * cam.s * 0.3 * k)), py = cam.py - r * (tall ? 1.15 : 0);
        plate(String(s.count), cam.px, py, r, s.warn ? "#f2a08c" : s.seat < 0 ? "rgba(214,202,172,.94)" : s.now ? "#dfe8f3" : "#f6eedb");
        if (s.kind === "army" && s.seat >= 0) { emblem(ctx, icons[s.seat], cam.px + r * 1.9, py, r * 0.9); ctx.lineWidth = 2.5; ctx.strokeStyle = "#1a1411"; ctx.stroke(); ctx.fillStyle = `rgb(${s.rgb})`; ctx.fill("evenodd"); }
        continue;
      }
      if (s.kind === "army") { army(s, x, y, Math.max(16, size * 0.52 * k)); continue; }
      if (s.kind === "unit") { figure(s, x, y + size * 0.2 * flat, Math.max(26, size * (0.6 + s.rank * 0.1) * k)); continue; }
      const h = Math.max(36, size * 0.95 * k), foot = y + size * 0.22 * flat;
      ctx.beginPath(); ctx.ellipse(x + h * 0.1, foot, h * 0.4, h * 0.15, 0, 0, 7); ctx.fillStyle = "rgba(12,9,7,.42)"; ctx.fill();
      ctx.save(); ctx.translate(x, foot); ctx.scale(h, h);
      const g = ctx.createLinearGradient(-0.32, 0, 0.36, 0), c = s.rgb;
      g.addColorStop(0, `rgb(${c.map((v) => Math.min(255, Math.round(v * 1.45 + 24)))})`); g.addColorStop(1, `rgb(${c.map((v) => Math.round(v * 0.62))})`);
      tower(ctx); ctx.lineWidth = 3.4 / h; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(20,15,12,.95)"; ctx.stroke(); ctx.fillStyle = g; ctx.fill(); ctx.restore();
      const r = Math.max(10.5, h * 0.26), by = foot - h * 0.34;
      plate(String(s.count), x, by, r, s.warn ? "#f2a08c" : s.now ? "#dfe8f3" : "#f6eedb");
    }
    if (point) arrow(...point);
  }

  const near = () => L.near / Math.max(cam.H, cam.W * 0.8);
  // shell hook (site/table.js, p8-shell): `rest` is the zoom the board opens at and goes home to (the home button, the 0 key, a resize).
  // free.fill asks for a wide map to open as tall as the free part of the screen, but no wider than a quarter more than the whole stage;
  // free.at is a cell to centre at that zoom (the player's own land).
  let rest = 1, asked = {};
  function layout(free = {}) {
    const { fill = false, at = -1, ...room } = (asked = free);
    cam.set({ W: host.clientWidth || 1, H: host.clientHeight || 1, left: 0, right: 0, top: 0, bottom: 0, ...room });
    cam.set({ tilt: L.tilt, yaw: L.yaw, q: near() });
    cam.fit(ends, 14);
    base = cam.s; staged = false;
    const tall = (cam.H - cam.top - cam.bottom) / (m.h * cam.s), was = rest; // a wide map on a narrow screen starts closer in
    rest = fill ? Math.max(1, Math.min(3, tall / Math.max(0.3, cam.ct), (1.25 * cam.W) / (m.w * cam.s))) : picture && cam.W < 821 && tall > 1.6 ? Math.min(2.6, tall) : 1;
    zoomed(zoom === 1 || zoom === was ? rest : zoom);
    if (zoom === rest) centre(at);
    under.style.width = over.style.width = cam.W + "px";
    under.style.height = over.style.height = cam.H + "px";
    redraw();
  }
  /** shell hook (p8-shell): put a cell in the middle of the free part of the screen, as far as the map's edges allow, when zoomed in. */
  function centre(i) {
    if (!(i >= 0 && i < m.mid.length) || zoom <= 1) return;
    const hw = (cam.W - cam.left - cam.right) / 2 / cam.s, hh = (cam.H - cam.top - cam.bottom) / 2 / cam.s / Math.max(0.3, cam.ct), keep = (v, h, n) => (n > 2 * h ? Math.max(h, Math.min(n - h, v)) : n / 2);
    cam.cx = keep(m.mid[i][0], hw, m.w); cam.cy = keep(m.mid[i][1], hh, m.h); redraw();
  }
  // Zoom with the wheel or two fingers, then drag. At the widest the whole board is in view.
  let base = 1, zoom = 1, dragged = false;
  const fingers = new Map();
  function zoomed(z, sx = cam.mx, sy = cam.my) {
    z = Math.max(1, Math.min(7, z));
    if (z === 1) { if (zoom !== 1) { zoom = 1; cam.fit(ends, 14); base = cam.s; } redraw(); return; }
    cam.unprojectTo(sx, sy, 0);
    const x = cam.ox, y = cam.oy;
    zoom = z;
    cam.s = base * z;
    cam.unprojectTo(sx, sy, 0);
    slide(x - cam.ox, y - cam.oy);
  }
  function slide(dx, dy) { cam.cx = Math.max(0, Math.min(m.w, cam.cx + dx)); cam.cy = Math.max(0, Math.min(m.h, cam.cy + dy)); redraw(); }
  const spot = (e) => { const r = under.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  under.style.touchAction = "none";
  under.addEventListener("wheel", (e) => { e.preventDefault(); zoomed(zoom * Math.exp(-e.deltaY * 0.0016), ...spot(e)); }, { passive: false });
  under.addEventListener("pointerdown", (e) => { if (!fingers.size) dragged = false; fingers.set(e.pointerId, spot(e)); });
  addEventListener("pointerup", (e) => fingers.delete(e.pointerId));
  addEventListener("pointercancel", (e) => fingers.delete(e.pointerId));
  under.addEventListener("pointermove", (e) => {
    const was = fingers.get(e.pointerId), now = spot(e);
    if (!was) return;
    if (fingers.size === 2) {
      const other = [...fingers].find(([k]) => k !== e.pointerId)[1], d = (p) => Math.hypot(p[0] - other[0], p[1] - other[1]) || 1;
      dragged = true;
      zoomed((zoom * d(now)) / d(was), (now[0] + other[0]) / 2, (now[1] + other[1]) / 2);
    } else {
      if (!dragged && Math.hypot(now[0] - was[0], now[1] - was[1]) < 6) return; // a tap may wobble
      if (zoom === 1) return;
      dragged = true;
      cam.unprojectTo(...was, 0);
      const x = cam.ox, y = cam.oy;
      cam.unprojectTo(...now, 0);
      slide(x - cam.ox, y - cam.oy);
    }
    fingers.set(e.pointerId, now);
  });
  const at = (e) => { const r = under.getBoundingClientRect(); return pick(cam, m, e.clientX - r.left, e.clientY - r.top, tops, unit(), L.rise ? most() : 0); };
  under.addEventListener("pointermove", (e) => { if (e.pointerType === "touch") return; const i = at(e); if (i !== hovering) { hovering = i; listeners.hover.forEach((f) => f(i)); } });
  under.addEventListener("pointerleave", () => { if (hovering !== -1) { hovering = -1; listeners.hover.forEach((f) => f(-1)); } });
  under.addEventListener("click", (e) => { if (dragged) { dragged = false; return; } listeners.pick.forEach((f) => f(at(e))); });
  under.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    if (!alive) return; // a board put away on purpose also reports its graphics as lost
    alive = false;
    (listeners.lost || []).forEach((f) => f());
  });

  return {
    layout, get look() { return lookName; },
    /** Zoom and move without a wheel, a pinch or a drag: by a factor about the middle (0 shows the whole board), by a share of the board. */
    zoom(f) { zoomed(f ? zoom * f : rest); if (!f) centre(asked.at ?? -1); }, pan(dx, dy) { if (zoom > 1) slide((dx * m.w) / zoom, (dy * m.h) / zoom); }, on(what, f) { (listeners[what] ||= []).push(f); },
    centre,
    setLook(name) { if (!LOOKS[name]) return; const a = { tilt: cam.tilt, yaw: cam.yaw, q: cam.q }; lookName = name; L = LOOKS[name]; if (calm()) { layout(asked); for (const c of [under, over]) c.animate?.([{ opacity: 0.25 }, { opacity: 1 }], { duration: 180, easing: "ease-out" }); return; } swing = { t: performance.now(), a }; redraw(); },
    /** Seat patterns over owned land, so colour is never the only sign of whose it is. */
    patterns(on) { pat = !!on; redraw(); },
    /** "system" (the default) follows the system's reduced-motion wish, "reduced" and "full" override it. */
    motion(mode) { motion = mode === "reduced" || mode === "full" ? mode : "system"; redraw(); },
    setCursor(on) { under.style.cursor = on ? "pointer" : "default"; },
    /**
     * Show a position. owner[i] is a seat or -1. `order` lists cells that change first to last, so ink spreads.
     * Returns how long the change takes, in milliseconds.
     */
    show(owner, { pieces = [], order = [], quick = false, names = null } = {}) {
      if (names) labels = names;
      const homes = new Set(pieces.filter((p) => p.kind === "tower").map((p) => p.at)), held = new Set(pieces.map((p) => p.at));
      const t = performance.now(), slow = !quick && !calm(), fade = !quick && !slow, step = Math.min(90, 900 / Math.max(1, order.length)), place = new Map(order.map((c, i) => [c, i]));
      let last = 0;
      owner.forEach((o, i) => {
        const c = show[i], to = o < 0 ? ground(i) : mix(seats[o], ground(i), rough[i] ? 0.1 : 0), tall = sea[i] ? 0.2 : (homes.has(i) ? 1.5 : o < 0 ? 0.75 : 1.2) + (c.kind === 7 ? 0.3 : 0); // hills stand a little above the plain
        if (c.owner === o && c.topTo === tall) return;
        const wait = slow && place.has(i) ? place.get(i) * step : 0, long = slow ? 320 : fade ? 200 : 1; // reduced motion: all at once, a quick fade, no hop
        Object.assign(c, { from: c.rgb, to, topFrom: slow ? c.top : tall, topTo: tall, hop: slow ? 0.5 : 0, start: t + wait, ends: t + wait + long, soak: slow && o >= 0 && c.owner !== o });
        c.owner = o;
        last = Math.max(last, wait + long);
        marks[i] = o < 0 ? null : { seat: o, seen: 1, home: held.has(i) };
      });
      owner.forEach((o, i) => { if (marks[i]) marks[i].home = held.has(i); });
      spots = spots.filter((s) => s.kind === "dot" || s.kind === "ring").concat(pieces);
      staged = false;
      until = t + last;
      dirty = true;
      redraw();
      return last;
    },
    /** Light up cells a move would take. */
    preview(list, { ring = -1, aim = -1, dots = [], arrow: to = null } = {}) {
      point = to;
      const on = new Set(list);
      show.forEach((c, i) => { c.glow = on.has(i) ? 1 : 0; });
      lit = list.length ? performance.now() : 0;
      spots = spots.filter((s) => s.kind !== "dot" && s.kind !== "ring").concat([...on, ...dots].map((c) => ({ kind: "dot", at: c, small: !on.has(c) })), ring >= 0 ? [{ kind: "ring", at: ring }] : [], aim >= 0 ? [{ kind: "ring", at: aim, aim: true }] : []);
      dirty = true;
      redraw();
    },
    screenOf(i) { cam.projectTo(m.mid[i][0], m.mid[i][1], show[i].top * unit()); return { x: cam.px, y: cam.py }; },
    destroy() { alive = false; painter.destroy(); under.remove(); over.remove(); },
    get solid() { return solid(); },
    /** A style's pack of sculpted models, once fetched: they take the place of the code-made ones of the same names. */
    pack(buffer) { if (meshes) { meshes.add(unpack(buffer)); staged = false; redraw(); } },
    get style() { return look3; }, get styleName() { return styleName; },
    /** Another style: the same board and pieces, in other materials. */
    setStyle(name) { if (!STYLES[name]) return; styleName = name; look3 = STYLES[name]; staged = false; dirty = true; redraw(); },
  };
}
