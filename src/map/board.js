// SPDX-License-Identifier: AGPL-3.0-or-later
// A hex board on a page: the painted surface, standing pieces and emblems, picking, looks and animation.
// It never changes a game. It is told what to show and says which cell was pointed at.
import { Camera, pick } from "./camera.js";
import { hexPicture } from "./hexes.js";
import { Painter } from "./paint.js";

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
const EMBLEMS = [
  (c) => { c.moveTo(0, -0.5); c.bezierCurveTo(0.2, -0.16, 0.36, 0, 0.36, 0.18); c.arc(0, 0.18, 0.36, 0, Math.PI); c.bezierCurveTo(-0.36, 0, -0.2, -0.16, 0, -0.5); }, // a drop
  (c) => { c.moveTo(0, -0.46); c.lineTo(0.44, 0); c.lineTo(0, 0.46); c.lineTo(-0.44, 0); c.closePath(); }, // a diamond
  (c) => { c.moveTo(-0.13, -0.44); for (const [x, y] of [[0.13, -0.44], [0.13, -0.13], [0.44, -0.13], [0.44, 0.13], [0.13, 0.13], [0.13, 0.44], [-0.13, 0.44], [-0.13, 0.13], [-0.44, 0.13], [-0.44, -0.13], [-0.13, -0.13]]) c.lineTo(x, y); c.closePath(); }, // a cross
  (c) => { for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.2 : 0.48, a = (i * Math.PI) / 5; c.lineTo(Math.sin(a) * r, -Math.cos(a) * r); } c.closePath(); }, // a star
];
export function emblem(ctx, seat, x, y, size, flat = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size * flat);
  ctx.beginPath();
  EMBLEMS[seat % EMBLEMS.length](ctx);
  ctx.restore();
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

export function createBoard(host, { cells, rough = [], sea = [], seats, ground, look = "relief", picture = null, lands = null, lines = [] }) {
  const under = host.appendChild(document.createElement("canvas")), over = host.appendChild(document.createElement("canvas")), ctx = over.getContext("2d");
  for (const c of [under, over]) c.className = "board-layer";
  over.style.pointerEvents = "none";
  const m = picture || hexPicture(cells, rough, sea), painter = new Painter(under), cam = new Camera(), still = matchMedia("(prefers-reduced-motion: reduce)");
  painter.load(m);
  const ends = m.ends || m.mid.flatMap(([x, y]) => [[x - m.R, y], [x + m.R, y], [x, y - m.R], [x, y + m.R]]);
  const show = m.mid.map((_, i) => ({ land: lands?.[i], rgb: ground(i), from: ground(i), to: ground(i), owner: -1, top: sea[i] ? 0.2 : 1, topTo: sea[i] ? 0.2 : 1, glow: 0, wet: 0, start: 0, ends: 0 }));
  const tops = new Float32Array(m.n + 1), listeners = { pick: [], hover: [] };
  let L = LOOKS[look], lookName = look, queued = false, dirty = true, alive = true, spots = [], hovering = -1, swing = null, until = 0, lit = 0, marks = [], point = null;

  const unit = () => 9 * L.rise * cam.s, most = () => unit() * 2.2, dpr = () => Math.min(2, Math.max(1.5, devicePixelRatio || 1)); // thin lines need the extra samples on a plain screen
  function redraw() { if (!queued && alive) { queued = true; requestAnimationFrame(frame); } }

  function frame(t) {
    queued = false;
    if (!alive) return;
    let moving = t < until;
    show.forEach((c, i) => {
      if (c.start || c.ends) {
        const k = t <= c.start ? 0 : t >= c.ends ? 1 : (t - c.start) / (c.ends - c.start);
        c.rgb = mix(c.from, c.to, ease(k));
        c.top = c.topFrom + (c.topTo - c.topFrom) * ease(k) + Math.sin(k * Math.PI) * 0.5;
        c.wet = c.soak ? Math.max(0, 1 - Math.max(0, t - c.start) / 1500) * (k > 0 ? 1 : 0) : 0;
        if (k < 1 || c.wet > 0) moving = true;
        else { c.start = c.ends = 0; c.soak = false; }
        dirty = true;
      }
      tops[i + 1] = c.top;
    });
    if (swing) {
      const k = Math.min(1, (t - swing.t) / 420), e = ease(k);
      cam.set({ tilt: swing.a.tilt + (L.tilt - swing.a.tilt) * e, yaw: swing.a.yaw + (L.yaw - swing.a.yaw) * e, q: swing.a.q + (near() - swing.a.q) * e });
      cam.fit(ends, 14);
      if (k >= 1) swing = null; else moving = true;
    }
    const beat = still.matches || !lit ? 0 : Math.max(0, 1.5 - (t - lit) / 1000); // a preview pulses briefly, then the board is still
    if (beat > 0) moving = true;
    if (dirty) { painter.send(show); dirty = false; }
    painter.draw(cam, dpr(), { unit: unit(), most: L.rise ? most() : 0, relief: L.relief, time: beat, ink: [24, 20, 18], pale: [250, 244, 228], wall: [34, 27, 24], glow: [255, 226, 150] });
    drawOver(t);
    if (moving) redraw();
  }

  /** A standing figure. Its rank shows as bars on its chest; one that has acted is dimmed. */
  function figure(s, x, y, h) {
    ctx.beginPath(); ctx.ellipse(x + h * 0.08, y, h * 0.34, h * 0.13, 0, 0, 7); ctx.fillStyle = "rgba(12,9,7,.42)"; ctx.fill();
    if (s.now) { ctx.beginPath(); ctx.ellipse(x, y, h * 0.42, h * 0.17, 0, 0, 7); ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(255,233,181,.95)"; ctx.stroke(); }
    ctx.save(); ctx.translate(x, y); ctx.scale(h, h);
    ctx.beginPath(); ctx.moveTo(-0.27, 0); ctx.quadraticCurveTo(-0.25, -0.34, -0.17, -0.58); ctx.lineTo(-0.1, -0.62); ctx.arc(0, -0.8, 0.19, 2.1, 7.32); ctx.lineTo(0.17, -0.58); ctx.quadraticCurveTo(0.25, -0.34, 0.27, 0); ctx.closePath();
    ctx.lineWidth = 3.2 / h; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(20,15,12,.95)"; ctx.stroke();
    const g = ctx.createLinearGradient(-0.28, 0, 0.3, 0), c = s.rgb, d = s.tired ? 0.72 : 1;
    g.addColorStop(0, `rgb(${c.map((v) => Math.round(Math.min(255, v * 1.45 + 30) * d))})`); g.addColorStop(1, `rgb(${c.map((v) => Math.round(v * 0.62 * d))})`);
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = s.tired ? "#cfc4aa" : "#fff6dd"; ctx.strokeStyle = "rgba(20,15,12,.9)"; ctx.lineWidth = 1.2 / h;
    for (let i = 0; i < s.rank; i++) { ctx.beginPath(); ctx.rect(-0.14, -0.2 - i * 0.14, 0.28, 0.085); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }

  /** A banner over a shield that says how strong the place is. Land that is nobody's has the shield only. */
  function army(s, x, y, r) {
    ctx.lineJoin = "round";
    if (s.seat >= 0) {
      const top = y - r * 1.9, left = x - r * 0.06;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left, top - r * 0.15); ctx.lineWidth = 4; ctx.strokeStyle = "#1a1411"; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = "#e9d6a4"; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left + r * 1.45, top); ctx.lineTo(left + r * 1.12, top + r * 0.5); ctx.lineTo(left + r * 1.45, top + r); ctx.lineTo(left, top + r); ctx.closePath();
      ctx.fillStyle = `rgb(${s.rgb.map((v) => Math.round(Math.min(255, v * 1.12 + 8)))})`; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#1a1411"; ctx.stroke();
      emblem(ctx, s.seat, left + r * 0.56, top + r * 0.5, r * 0.72); ctx.fillStyle = "#fdf6e4"; ctx.fill();
    }
    const q = Math.max(9.5, r * (s.seat < 0 ? 0.56 : 0.68));
    ctx.beginPath(); ctx.arc(x, y, q, 0, 7); ctx.fillStyle = s.seat < 0 ? "rgba(214,202,172,.94)" : s.now ? "#ffe9b5" : "#f6eedb"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#1a1411"; ctx.stroke();
    ctx.fillStyle = "#1a1411"; ctx.font = `700 ${Math.round(q * (s.count > 99 ? 0.85 : 1.15))}px system-ui,"Segoe UI",sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(s.count), x, y + 0.5);
  }
  function arrow(a, b) {
    cam.projectTo(m.mid[a][0], m.mid[a][1], show[a].top * unit()); const x = cam.px, y = cam.py; cam.projectTo(m.mid[b][0], m.mid[b][1], show[b].top * unit());
    const X = cam.px, Y = cam.py, long = Math.hypot(X - x, Y - y) || 1, u = (X - x) / long, v = (Y - y) / long, w = 5, g = 15, p = (t, n) => [x + u * t - v * n, y + v * t + u * n], s = Math.min(16, long / 4), e = Math.max(s + 2, long - 17);
    ctx.beginPath(); [p(s, -w / 2), p(e - g, -w), p(e - g, -w * 2.2), p(e, 0), p(e - g, w * 2.2), p(e - g, w), p(s, w / 2)].forEach(([i, j], k) => (k ? ctx.lineTo(i, j) : ctx.moveTo(i, j))); ctx.closePath();
    ctx.fillStyle = "rgba(255,226,150,.92)"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#1a1411"; ctx.stroke();
  }

  function drawOver(t) {
    const d = dpr(), W = Math.round(cam.W * d), H = Math.round(cam.H * d);
    if (over.width !== W || over.height !== H) { over.width = W; over.height = H; }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, cam.W, cam.H);
    const flat = Math.max(0.5, cam.ct), size = m.R * cam.s;
    marks.forEach((k, i) => { // emblems lie on the ground
      if (!k || k.home) return;
      k.seen = show[i].ends ? Math.max(0, Math.min(1, (t - show[i].start) / 260)) : 1;
      if (!k.seen) return;
      cam.projectTo(m.mid[i][0], m.mid[i][1], show[i].top * unit());
      emblem(ctx, k.seat, cam.px, cam.py, size * 0.42 * cam.pk, flat);
      ctx.fillStyle = `rgba(252,247,234,${0.5 * k.seen})`;
      ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = `rgba(20,16,14,${0.35 * k.seen})`; ctx.stroke();
    });
    for (const [a, b] of lines) { // crossings over water
      cam.projectTo(a[0], a[1], 0.6 * unit()); const x = cam.px, y = cam.py; cam.projectTo(b[0], b[1], 0.6 * unit());
      ctx.setLineDash([7, 6]); ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(250,240,214,.8)"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cam.px, cam.py); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const s of spots) if (s.kind === "dot") {
      cam.projectTo(m.mid[s.at][0], m.mid[s.at][1], show[s.at].top * unit());
      const held = spots.some((x) => x.at === s.at && (x.kind === "unit" || x.kind === "tower" || x.kind === "army")), r = size * (held ? 0.62 : s.small ? 0.1 : 0.15);
      ctx.beginPath(); ctx.ellipse(cam.px, cam.py, r, r * flat, 0, 0, 7);
      if (held) { ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,226,150,.95)"; ctx.stroke(); continue; }
      ctx.fillStyle = "rgba(255,226,150,.95)"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(24,20,18,.8)"; ctx.stroke();
    }
    for (const s of spots) if (s.kind === "ring") {
      cam.projectTo(m.mid[s.at][0], m.mid[s.at][1], show[s.at].top * unit());
      ctx.beginPath(); ctx.ellipse(cam.px, cam.py, size * 0.7, size * 0.7 * flat, 0, 0, 7); ctx.fillStyle = s.aim ? "rgba(255,255,255,.25)" : "rgba(255,226,150,.28)"; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = s.aim ? "#ffffff" : "#ffe296"; ctx.stroke(); if (s.aim) { ctx.lineWidth = 1.5; ctx.strokeStyle = "#1a1411"; ctx.stroke(); }
    }
    const stand = spots.filter((s) => s.kind === "tower" || s.kind === "unit" || s.kind === "army").map((s) => { cam.projectTo(m.mid[s.at][0], m.mid[s.at][1], show[s.at].top * unit()); return { s, x: cam.px, y: cam.py, k: cam.pk }; }).sort((a, b) => a.y - b.y);
    for (const { s, x, y, k } of stand) {
      if (s.kind === "army") { army(s, x, y, Math.max(16, size * 0.52 * k)); continue; }
      if (s.kind === "unit") { figure(s, x, y + size * 0.2 * flat, Math.max(26, size * (0.6 + s.rank * 0.1) * k)); continue; }
      const h = Math.max(36, size * 0.95 * k), foot = y + size * 0.22 * flat;
      ctx.beginPath(); ctx.ellipse(x + h * 0.1, foot, h * 0.4, h * 0.15, 0, 0, 7); ctx.fillStyle = "rgba(12,9,7,.42)"; ctx.fill();
      ctx.save(); ctx.translate(x, foot); ctx.scale(h, h);
      const g = ctx.createLinearGradient(-0.32, 0, 0.36, 0), c = s.rgb;
      g.addColorStop(0, `rgb(${c.map((v) => Math.min(255, Math.round(v * 1.45 + 24)))})`); g.addColorStop(1, `rgb(${c.map((v) => Math.round(v * 0.62))})`);
      tower(ctx); ctx.lineWidth = 3.4 / h; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(20,15,12,.95)"; ctx.stroke(); ctx.fillStyle = g; ctx.fill(); ctx.restore();
      const r = Math.max(10.5, h * 0.26), by = foot - h * 0.34;
      ctx.beginPath(); ctx.arc(x, by, r, 0, 7); ctx.fillStyle = s.warn ? "#f2a08c" : s.now ? "#ffe9b5" : "#f6eedb"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#1a1411"; ctx.stroke();
      ctx.fillStyle = "#1a1411"; ctx.font = `700 ${Math.round(r * 1.12)}px system-ui,"Segoe UI",sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(s.count), x, by + 0.5);
    }
    if (point) arrow(...point);
  }

  const near = () => L.near / Math.max(cam.H, cam.W * 0.8);
  function layout(free = {}) {
    cam.set({ W: host.clientWidth || 1, H: host.clientHeight || 1, left: 0, right: 0, top: 0, bottom: 0, ...free });
    cam.set({ tilt: L.tilt, yaw: L.yaw, q: near() });
    cam.fit(ends, 14);
    under.style.width = over.style.width = cam.W + "px";
    under.style.height = over.style.height = cam.H + "px";
    redraw();
  }
  const at = (e) => { const r = under.getBoundingClientRect(); return pick(cam, m, e.clientX - r.left, e.clientY - r.top, tops, unit(), L.rise ? most() : 0); };
  under.addEventListener("pointermove", (e) => { if (e.pointerType === "touch") return; const i = at(e); if (i !== hovering) { hovering = i; listeners.hover.forEach((f) => f(i)); } });
  under.addEventListener("pointerleave", () => { if (hovering !== -1) { hovering = -1; listeners.hover.forEach((f) => f(-1)); } });
  under.addEventListener("click", (e) => listeners.pick.forEach((f) => f(at(e))));
  under.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    if (!alive) return; // a board put away on purpose also reports its graphics as lost
    alive = false;
    (listeners.lost || []).forEach((f) => f());
  });

  return {
    layout, get look() { return lookName; }, on(what, f) { (listeners[what] ||= []).push(f); },
    setLook(name) { if (!LOOKS[name]) return; const a = { tilt: cam.tilt, yaw: cam.yaw, q: cam.q }; lookName = name; L = LOOKS[name]; if (still.matches) { layout({ left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom }); return; } swing = { t: performance.now(), a }; redraw(); },
    setCursor(on) { under.style.cursor = on ? "pointer" : "default"; },
    /**
     * Show a position. owner[i] is a seat or -1. `order` lists cells that change first to last, so ink spreads.
     * Returns how long the change takes, in milliseconds.
     */
    show(owner, { pieces = [], order = [], quick = false } = {}) {
      const homes = new Set(pieces.filter((p) => p.kind === "tower").map((p) => p.at)), held = new Set(pieces.map((p) => p.at));
      const t = performance.now(), slow = !quick && !still.matches, step = Math.min(90, 900 / Math.max(1, order.length)), place = new Map(order.map((c, i) => [c, i]));
      let last = 0;
      owner.forEach((o, i) => {
        const c = show[i], to = o < 0 ? ground(i) : mix(seats[o], ground(i), rough[i] ? 0.1 : 0), tall = sea[i] ? 0.2 : homes.has(i) ? 1.5 : o < 0 ? 0.75 : 1.2;
        if (c.owner === o && c.topTo === tall) return;
        const wait = slow && place.has(i) ? place.get(i) * step : 0, long = slow ? 320 : 1;
        Object.assign(c, { from: c.rgb, to, topFrom: c.top, topTo: tall, start: t + wait, ends: t + wait + long, soak: slow && o >= 0 && c.owner !== o });
        c.owner = o;
        last = Math.max(last, wait + long);
        marks[i] = o < 0 ? null : { seat: o, seen: 1, home: held.has(i) };
      });
      owner.forEach((o, i) => { if (marks[i]) marks[i].home = held.has(i); });
      spots = spots.filter((s) => s.kind === "dot" || s.kind === "ring").concat(pieces);
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
  };
}
