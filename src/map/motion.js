// SPDX-License-Identifier: AGPL-3.0-or-later
// Motion over a board: dice that tumble and settle, pieces that travel, a ring where land changes hands, a flourish where
// something is built, pennants for a win. Drawn on one canvas above the board, and only while something moves.
// It never changes a game and never holds one up: the board already shows the new position, and motion only follows it.
// Places are asked for every frame (where(i, dx, dy) gives a point and a piece's size there), so a board that pans keeps them.
import { emblem } from "./board.js";

const out3 = (k) => 1 - (1 - k) ** 3, smooth = (k) => k * k * (3 - 2 * k), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k, shade = (rgb, f, add = 0) => `rgb(${rgb.map((v) => Math.round(clamp(v * f + add, 0, 255)))})`;
const INK = "#1a1411", CREAM = "#fdf6e4", GOLD = [226, 184, 92];

/**
 * One canvas over the whole window, drawn only while an effect runs; then it is cleared and the loop stops.
 * An effect is { ms, draw(c, k, t), end() }, with k from 0 to 1. Frame gaps are kept while it runs, to judge smoothness.
 */
export function createMotion(parent = document.body, { z = 1 } = {}) {
  const cv = document.createElement("canvas"), c = cv.getContext("2d"), own = parent !== document.body; // own: inside a box of the page, not over the window
  cv.className = "motion-layer";
  cv.setAttribute("aria-hidden", "true");
  Object.assign(cv.style, { position: own ? "absolute" : "fixed", inset: "0", width: "100%", height: "100%", zIndex: String(z), pointerEvents: "none" }); // z: p12, the table's layer sits over the score cards (goods reach them) and under the move panel
  parent.append(cv);
  let list = [], queued = false, prev = 0, wiped = true;
  const gaps = [], work = [];
  const loop = (t) => {
    queued = false;
    const t0 = performance.now(), d = Math.min(2, devicePixelRatio || 1), W = own ? parent.clientWidth : innerWidth, H = own ? parent.clientHeight : innerHeight;
    if (cv.width !== Math.round(W * d) || cv.height !== Math.round(H * d)) { cv.width = Math.round(W * d); cv.height = Math.round(H * d); }
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, W, H);
    if (prev && !document.hidden) { gaps.push(t - prev); if (gaps.length > 900) gaps.shift(); }
    prev = t;
    const now = performance.now();
    list = list.filter((e) => {
      const k = (now - e.t0) / e.ms;
      if (k >= 1) { e.end?.(); return false; }
      if (k >= 0) { c.save(); try { e.draw(c, k, now); } catch { e.ms = 0; } c.restore(); } // a place that is gone ends its effect
      return true;
    });
    wiped = !list.length;
    work.push(performance.now() - t0); if (work.length > 900) work.shift();
    if (list.length) { queued = true; requestAnimationFrame(loop); } else prev = 0;
  };
  const kick = () => { if (!queued) { queued = true; requestAnimationFrame(loop); } };
  return {
    /** Start an effect after `delay` ms. */
    add(e, delay = 0) { e.t0 = performance.now() + delay; list.push(e); kick(); return e; },
    clear() { list = []; if (!wiped) kick(); },
    /** End at once every effect added with this tag (a new fight replaces the last one's). */
    drop(tag) { list = list.filter((e) => e.tag !== tag); if (!wiped) kick(); },
    get busy() { return list.length > 0; },
    /** While something moved, in ms: the gaps between frames (the whole page), and this layer's own work in each frame. Each: how many, the middle one, the slowest in twenty, the slowest. */
    frames() { const sum = (list) => { const s = [...list].sort((a, b) => a - b); return s.length ? { n: s.length, median: +s[s.length >> 1].toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), worst: +s[s.length - 1].toFixed(2) } : null; }; return { gaps: sum(gaps), work: sum(work) }; },
    destroy() { list = []; cv.remove(); },
  };
}

// ---- the things that are drawn ----

const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
function die(c, x, y, s, face, rgb, turn, alpha) {
  c.save(); c.translate(x, y); c.rotate(turn); c.globalAlpha = alpha;
  const h = s / 2, r = s * 0.2;
  c.beginPath(); c.roundRect(-h, -h, s, s, r);
  const g = c.createLinearGradient(-h, -h, h, h); g.addColorStop(0, shade(rgb, 1.2, 24)); g.addColorStop(1, shade(rgb, 0.78));
  c.fillStyle = g; c.fill(); c.lineWidth = Math.max(1.2, s * 0.07); c.strokeStyle = INK; c.stroke();
  const light = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 > 0.3;
  c.fillStyle = light ? INK : CREAM;
  for (const [u, v] of PIPS[face] || PIPS[1]) { c.beginPath(); c.arc(u * s * 0.26, v * s * 0.26, s * 0.085, 0, 7); c.fill(); }
  c.restore();
}
function shadow(c, x, y, rx, a) { c.beginPath(); c.ellipse(x, y, rx, rx * 0.42, 0, 0, 7); c.fillStyle = `rgba(12,9,7,${a})`; c.fill(); }
/** A piece on its way: a disc with its number (an army), a standing pawn with its rank (a unit), a crate of goods, or the toll gate. */
function token(c, x, y, r, rgb, label, kind) {
  if (kind === "good") {
    c.beginPath(); c.roundRect(x - r, y - r * 0.8, r * 2, r * 1.6, r * 0.32);
    const g = c.createLinearGradient(x, y - r, x, y + r); g.addColorStop(0, shade(rgb, 1.18, 18)); g.addColorStop(1, shade(rgb, 0.74));
    c.fillStyle = g; c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.moveTo(x - r * 0.7, y - r * 0.1); c.lineTo(x + r * 0.7, y - r * 0.1); c.lineWidth = 1.2; c.strokeStyle = "rgba(26,20,17,.45)"; c.stroke();
    if (label) { c.font = `800 ${Math.round(r * 1.05)}px system-ui,"Segoe UI",sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.lineWidth = 3; c.strokeStyle = CREAM; c.strokeText(String(label), x, y + r * 0.12); c.fillStyle = INK; c.fillText(String(label), x, y + r * 0.12); }
    return;
  }
  if (kind === "gate") {
    c.lineWidth = 2; c.strokeStyle = INK;
    for (const u of [-1, 1]) { c.beginPath(); c.rect(x + u * r * 0.9 - r * 0.16, y - r * 0.9, r * 0.32, r * 1.5); c.fillStyle = "#5b4636"; c.fill(); c.stroke(); }
    c.beginPath(); c.rect(x - r * 1.25, y - r * 0.62, r * 2.5, r * 0.42); c.fillStyle = "#c0392b"; c.fill(); c.stroke();
    c.fillStyle = CREAM; for (const u of [-0.7, 0, 0.7]) { c.beginPath(); c.rect(x + u * r - r * 0.13, y - r * 0.6, r * 0.26, r * 0.38); c.fill(); }
    return;
  }
  if (kind === "unit") {
    c.save(); c.translate(x, y + r * 0.9); c.scale(r * 1.6, r * 1.6);
    c.beginPath(); c.moveTo(-0.27, 0); c.quadraticCurveTo(-0.25, -0.34, -0.17, -0.58); c.lineTo(-0.1, -0.62); c.arc(0, -0.8, 0.19, 2.1, 7.32); c.lineTo(0.17, -0.58); c.quadraticCurveTo(0.25, -0.34, 0.27, 0); c.closePath();
    const g = c.createLinearGradient(-0.28, 0, 0.3, 0); g.addColorStop(0, shade(rgb, 1.45, 30)); g.addColorStop(1, shade(rgb, 0.62));
    c.lineWidth = 3 / (r * 1.6); c.lineJoin = "round"; c.strokeStyle = INK; c.stroke(); c.fillStyle = g; c.fill();
    c.fillStyle = CREAM; c.strokeStyle = INK; c.lineWidth = 1.2 / (r * 1.6);
    for (let i = 0; i < Math.min(3, +label || 0); i++) { c.beginPath(); c.rect(-0.14, -0.2 - i * 0.14, 0.28, 0.085); c.fill(); c.stroke(); }
    c.restore();
    return;
  }
  c.beginPath(); c.arc(x, y, r, 0, 7);
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); g.addColorStop(0, shade(rgb, 1.3, 30)); g.addColorStop(1, shade(rgb, 0.72));
  c.fillStyle = g; c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
  if (label !== "" && label !== undefined) {
    c.font = `700 ${Math.round(r * (String(label).length > 2 ? 0.8 : 1.05))}px system-ui,"Segoe UI",sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
    c.lineWidth = 3; c.strokeStyle = "rgba(20,15,12,.85)"; c.strokeText(String(label), x, y + 0.5); c.fillStyle = CREAM; c.fillText(String(label), x, y + 0.5);
  }
}
function star(c, x, y, s) { c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s * 0.28, y - s * 0.28); c.lineTo(x + s, y); c.lineTo(x + s * 0.28, y + s * 0.28); c.lineTo(x, y + s); c.lineTo(x - s * 0.28, y + s * 0.28); c.lineTo(x - s, y); c.lineTo(x - s * 0.28, y - s * 0.28); c.closePath(); }

// ---- effects: each returns { ms, draw } for createMotion().add ----

/** A piece travels from one cell to another in a low arc, its shadow on the ground under it. */
export function travel(where, from, to, { rgb, label = "", kind = "army", ms = 420 }) {
  return {
    ms,
    draw(c, k) {
      const a = where(from), b = where(to), e = smooth(k), x = lerp(a.x, b.x, e), y = lerp(a.y, b.y, e), long = Math.hypot(b.x - a.x, b.y - a.y);
      const r = clamp(lerp(a.r, b.r, e) * 0.34, 9, 18), lift = Math.sin(Math.PI * k) * clamp(long * 0.22, 8, 54);
      c.globalAlpha = Math.min(1, k * 8, (1 - k) * 30);
      shadow(c, x, y + r * 0.3, r * (1 - lift / 160), 0.34);
      token(c, x, y - lift - r * 0.35, r, rgb, label, kind);
    },
  };
}

/** A rounded label: a number held under the dice, or a chip of goods gained or lost. */
function pill(c, x, y, text, px, fill, ink = CREAM, sub = "") {
  c.font = `800 ${Math.round(px)}px system-ui,"Segoe UI",sans-serif`;
  const w1 = c.measureText(text).width, sp = sub ? px * 0.46 : 0;
  c.font = `700 ${Math.round(sp || 1)}px system-ui,"Segoe UI",sans-serif`;
  const w2 = sub ? c.measureText(sub).width + px * 0.35 : 0, w = w1 + w2 + px * 0.8, h = px * 1.3;
  c.beginPath(); c.roundRect(x - w / 2, y - h / 2, w, h, h / 2); c.fillStyle = fill; c.fill(); c.lineWidth = Math.max(2, px * 0.08); c.strokeStyle = INK; c.stroke();
  c.textBaseline = "middle"; c.textAlign = "left"; c.fillStyle = ink;
  c.font = `800 ${Math.round(px)}px system-ui,"Segoe UI",sans-serif`; c.fillText(text, x - w / 2 + px * 0.4, y + px * 0.04);
  if (sub) { c.font = `700 ${Math.round(sp)}px system-ui,"Segoe UI",sans-serif`; c.fillText(sub, x - w / 2 + px * 0.4 + w1 + px * 0.35, y + px * 0.06); }
}

/**
 * Dice thrown from one place to where they come to rest: they tumble and bounce, show changing faces, then settle on the real
 * ones; the losing dice dim. sets: [{ from: () => point, land: [() => point], faces, rgb, lose: [bool] }]. linger: ms they stay.
 * total: { text, sub, red } held under the dice once they settle (the number thrown, and what it means).
 */
export function dice(sets, { roll = 640, linger = 1000, size = 22, total = null, fadeMs = 260 }) {
  const ms = roll + linger, spin = sets.map((s) => s.faces.map((_, i) => (i % 2 ? -1 : 1) * (5 + ((s.faces[i] * 7 + i * 3) % 5)))), jump = clamp(size * 1.9, 46, 150);
  return {
    ms,
    draw(c, k, now) {
      const t = k * ms, f = Math.min(1, t / roll), fade = t > ms - fadeMs ? (ms - t) / fadeMs : 1, land = (t - roll) / 160, thump = f >= 1 && land < 1 ? 1 + Math.sin(Math.PI * land) * 0.08 : 1;
      let lx = 0, ly = -1e9, n = 0;
      sets.forEach((s, j) => {
        const a = s.from();
        s.faces.forEach((face, i) => {
          const b = s.land[i](), x = lerp(a.x, b.x, out3(f)), y = lerp(a.y, b.y, out3(f)), hop = Math.abs(Math.sin(Math.PI * f * 2.6)) * (1 - f) ** 1.6 * jump;
          const shown = f < 0.82 ? 1 + ((Math.floor(now / 70) * 5 + i * 3 + j * 2 + face) % 6) : face, dim = f >= 1 && s.lose?.[i] ? Math.max(0.45, 1 - (t - roll - 120) / 300 * 0.55) : 1;
          shadow(c, x + size * 0.08, y + size * 0.42, size * 0.5 * (1 - hop / (jump * 2.6)), 0.3 * fade);
          die(c, x, y - hop, size * (1 + hop / (jump * 6.5)) * thump, shown, s.rgb, spin[j][i] * (1 - f) ** 2 + (face - 3.5) * 0.06, fade * Math.min(1, dim));
          lx += b.x; ly = Math.max(ly, b.y); n++;
        });
      });
      if (total && f >= 1 && n) {
        const q = clamp((t - roll - 60) / 200, 0, 1), px = clamp(size * 0.62, 16, 52);
        c.globalAlpha = fade * q; c.save(); c.translate(lx / n, ly + size * 0.62 + px * 0.9); c.scale(0.7 + out3(q) * 0.3, 0.7 + out3(q) * 0.3);
        pill(c, 0, 0, total.text, px, total.red ? "#a3271b" : "rgba(26,20,17,.88)", CREAM, total.sub || "");
        c.restore();
      }
    },
  };
}

/** Something carried through the air between two places (a good to a player, a good taken): a low arc, a pop as it lands. */
export function fly(from, to, { rgb, label = "", kind = "good", ms = 700, size = 13, end }) {
  return {
    ms, end,
    draw(c, k) {
      const a = from(), b = to(), e = smooth(k), long = Math.hypot(b.x - a.x, b.y - a.y), lift = Math.sin(Math.PI * e) * clamp(long * 0.28, 20, 140);
      const s = size * (k < 0.15 ? 0.5 + out3(k / 0.15) * 0.6 : k > 0.85 ? 1.1 - (k - 0.85) / 0.15 * 0.5 : 1.1);
      c.globalAlpha = Math.min(1, k * 10, (1 - k) * 12);
      token(c, lerp(a.x, b.x, e), lerp(a.y, b.y, e) - lift, s, rgb, label, kind);
    },
  };
}

/** A chip that rises a little and fades by a place: "+2 Grain", "-1". at() gives the point. */
export function chip(at, { text, rgb = GOLD, ms = 1300, red = false, px = 17, rise = 34 }) {
  return {
    ms,
    draw(c, k) {
      const p = at(), q = clamp(k / 0.12, 0, 1);
      c.globalAlpha = Math.min(q, k > 0.7 ? (1 - k) / 0.3 : 1);
      pill(c, p.x, p.y - out3(k) * rise, text, px * (0.8 + 0.2 * out3(q)), red ? "#a3271b" : shade(rgb, 0.9), red ? CREAM : INK);
    },
  };
}

/**
 * The strength standing on a cell while a fight is thrown, counting down as it falls: steps [[ms, n]] says when it changes to what.
 * It shakes as each loss lands.
 */
export function tally(where, at, { rgb, start, steps = [], ms }) {
  return {
    ms,
    draw(c, k) {
      const t = k * ms, p = where(at), r = clamp(p.r * 0.36, 11, 22);
      let n = start, hit = 1e9;
      for (const [when, v] of steps) if (t >= when) { if (v !== n) hit = t - when; n = v; }
      const shake = hit < 260 ? Math.sin(hit / 22) * (1 - hit / 260) * r * 0.35 : 0;
      c.globalAlpha = Math.min(1, k * 20, (1 - k) * 25);
      shadow(c, p.x, p.y + r * 0.3, r, 0.34);
      token(c, p.x + shake, p.y - r * 0.35, r * (hit < 160 ? 1 + 0.15 * (1 - hit / 160) : 1), rgb, n, "army");
    },
  };
}

/** A raid: the edges of the window darken to red and ease back, once. */
export function raid({ ms = 1100 } = {}) {
  return {
    ms,
    draw(c, k) {
      const W = c.canvas.width / (c.getTransform().a || 1), H = c.canvas.height / (c.getTransform().d || 1), a = Math.sin(Math.PI * Math.min(1, k * 1.4)) * 0.55;
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      g.addColorStop(0, "rgba(120,16,10,0)"); g.addColorStop(1, `rgba(120,16,10,${a})`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    },
  };
}

/** Land changes hands: a ring in the taker's colour opens out from the cell, and the taker's emblem rises from it. */
export function capture(where, at, { rgb, icon = -1, ms = 700 }) {
  return {
    ms,
    draw(c, k) {
      const p = where(at), R = clamp(p.r, 14, 60), e = out3(k);
      for (const [lag, w] of [[0, 4], [0.18, 2]]) {
        const q = clamp((k - lag) / (1 - lag), 0, 1); if (!q) continue;
        c.globalAlpha = (1 - q) * 0.9; c.beginPath(); c.ellipse(p.x, p.y, R * (0.35 + out3(q) * 1.1), R * (0.35 + out3(q) * 1.1) * 0.55, 0, 0, 7);
        c.lineWidth = w + 3; c.strokeStyle = "rgba(20,15,12,.6)"; c.stroke(); c.lineWidth = w; c.strokeStyle = shade(rgb, 1.15, 20); c.stroke();
      }
      if (icon >= 0) {
        const s = clamp(R * 0.42, 9, 20) * (k < 0.25 ? out3(k / 0.25) * 1.15 : 1.15 - Math.min(0.15, (k - 0.25) * 0.6));
        c.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        emblem(c, icon, p.x, p.y - R * 0.5 - e * R * 0.35, s); c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke(); c.fillStyle = shade(rgb, 1); c.fill("evenodd");
      }
    },
  };
}

/** Something built: a ring settles onto the cell and a few sparks rise from it. */
export function build(where, at, { rgb = GOLD, ms = 760, small = false }) {
  const sparks = Array.from({ length: small ? 4 : 7 }, (_, i) => ({ a: (i / (small ? 4 : 7)) * Math.PI * 2 + 0.4, v: 0.7 + ((i * 37) % 10) / 22 }));
  return {
    ms,
    draw(c, k) {
      const p = where(at), R = clamp(p.r, 12, 54) * (small ? 0.7 : 1), e = out3(k);
      c.globalAlpha = Math.min(1, (1 - k) * 2.2);
      c.beginPath(); c.ellipse(p.x, p.y, R * (1.5 - e * 0.8), R * (1.5 - e * 0.8) * 0.55, 0, 0, 7); c.lineWidth = 3; c.strokeStyle = shade(rgb, 1.2, 40); c.stroke();
      c.fillStyle = "#fff3cf"; c.strokeStyle = "rgba(60,40,20,.7)"; c.lineWidth = 1;
      for (const s of sparks) { const d = R * (0.3 + e * 0.75 * s.v); star(c, p.x + Math.cos(s.a) * d, p.y - R * 0.2 + Math.sin(s.a) * d * 0.5 - e * R * 0.9 * s.v, clamp(R * 0.12, 3, 6) * (1 - k * 0.6)); c.fill(); c.stroke(); }
    },
  };
}

/** A small mark where something was put down, or gathered: one ring that draws in. */
export function pulse(where, at, { rgb, ms = 340, out = false }) {
  return {
    ms,
    draw(c, k) {
      const p = where(at), R = clamp(p.r, 10, 44), e = out3(k), s = out ? 0.4 + e * 0.8 : 1.2 - e * 0.6;
      c.globalAlpha = (1 - k) * 0.95; c.beginPath(); c.ellipse(p.x, p.y, R * s, R * s * 0.55, 0, 0, 7);
      c.lineWidth = 4; c.strokeStyle = "rgba(20,15,12,.5)"; c.stroke(); c.lineWidth = 2.2; c.strokeStyle = shade(rgb, 1.2, 30); c.stroke();
    },
  };
}

/** A new age: one soft band of light crosses the board. */
export function sweep({ ms = 1500 } = {}) {
  return {
    ms,
    draw(c, k) {
      const W = innerWidth, H = innerHeight, x = lerp(-W * 0.3, W * 1.3, smooth(k)), g = c.createLinearGradient(x - W * 0.25, 0, x + W * 0.25, 0);
      g.addColorStop(0, "rgba(255,236,190,0)"); g.addColorStop(0.5, `rgba(255,236,190,${0.16 * Math.sin(Math.PI * k)})`); g.addColorStop(1, "rgba(255,236,190,0)");
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    },
  };
}

/** Pennants that fall and sway across a box, in the winners' colours with gold: the moment of a win. */
export function pennants(colours, box, { ms = 2600, many = 34 } = {}) {
  const all = [...colours, GOLD, [244, 236, 214]], bits = Array.from({ length: many }, (_, i) => {
    const r = (n) => { const v = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); };
    return { x: r(1), d: r(2) * 0.35, v: 0.55 + r(3) * 0.6, sw: 8 + r(4) * 18, ph: r(5) * 6.3, s: 6 + r(6) * 7, rgb: all[i % all.length], spin: (r(7) - 0.5) * 4 };
  });
  return {
    ms,
    draw(c, k) {
      const { x: X, y: Y, w: W, h: H } = box(), t = k * ms;
      c.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      for (const b of bits) {
        const q = (t / ms - b.d) / (1 - b.d); if (q <= 0) continue;
        const x = X + b.x * W + Math.sin(q * 6 + b.ph) * b.sw, y = Y - 20 + q * b.v * (H + 40), a = Math.sin(q * 5 + b.ph) * 0.6 + b.spin * q;
        c.save(); c.translate(x, y); c.rotate(a); c.scale(1, 0.6 + 0.4 * Math.abs(Math.cos(q * 7 + b.ph)));
        c.beginPath(); c.moveTo(-b.s, -b.s * 0.55); c.lineTo(b.s, 0); c.lineTo(-b.s, b.s * 0.55); c.closePath();
        c.fillStyle = shade(b.rgb, 1.05, 10); c.fill(); c.lineWidth = 1; c.strokeStyle = "rgba(20,15,12,.55)"; c.stroke();
        c.restore();
      }
    },
  };
}
