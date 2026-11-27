// SPDX-License-Identifier: AGPL-3.0-or-later
// Reading a board at a glance: the goods' own symbols and their key, pips under a number, a port's rate on a plate by its flag,
// a seat's routes as links between hexes, and flags on what can still act. Our own simple shapes, drawn in code.
// Looks only: no rule ever reads them.
import { bake, box } from "./kit.js";
import { SLOT } from "./style.js";

const TAU = Math.PI * 2, INK = "#1a1411", PALE = "#fdf6e4";
const oval = (c, x, y, rx, ry, a = 0) => { c.moveTo(x + rx * Math.cos(a), y + rx * Math.sin(a)); c.ellipse(x, y, rx, ry, a, 0, TAU); c.closePath(); };
const rect = (c, x0, y0, x1, y1) => { c.moveTo(x0, y0); c.lineTo(x1, y0); c.lineTo(x1, y1); c.lineTo(x0, y1); c.closePath(); };

/**
 * The goods' symbols, drawn about (0, 0) at a size of about 1: each a filled shape, and lines cut into it in the paper colour.
 * Grain is an ear of wheat, Glass a goblet, Clay three bricks, Salt a crystal.
 */
export const GLYPHS = [
  ["Wheat", (c) => {
    rect(c, -0.035, -0.12, 0.035, 0.48);
    for (let k = 0; k < 3; k++) { const y = 0.2 - k * 0.2; oval(c, -0.12, y, 0.15, 0.075, -0.95); oval(c, 0.12, y, 0.15, 0.075, 0.95 + Math.PI); }
    oval(c, 0, -0.36, 0.075, 0.15);
  }],
  ["Goblet", (c) => {
    c.moveTo(-0.3, -0.44); c.lineTo(0.3, -0.44); c.quadraticCurveTo(0.31, -0.02, 0.05, 0.03); c.lineTo(0.04, 0.3); c.lineTo(0.24, 0.39); c.lineTo(0.24, 0.46);
    c.lineTo(-0.24, 0.46); c.lineTo(-0.24, 0.39); c.lineTo(-0.04, 0.3); c.lineTo(-0.05, 0.03); c.quadraticCurveTo(-0.31, -0.02, -0.3, -0.44); c.closePath();
  }, (c) => { c.moveTo(-0.18, -0.34); c.quadraticCurveTo(-0.19, -0.14, -0.07, -0.07); }],
  ["Bricks", (c) => { rect(c, -0.47, 0.03, -0.025, 0.33); rect(c, 0.025, 0.03, 0.47, 0.33); rect(c, -0.22, -0.33, 0.22, -0.03); }],
  ["Crystal", (c) => { [[0, -0.47], [0.41, -0.235], [0.41, 0.235], [0, 0.47], [-0.41, 0.235], [-0.41, -0.235]].forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); },
    (c) => { c.moveTo(-0.41, -0.235); c.lineTo(0, 0); c.lineTo(0.41, -0.235); c.moveTo(0, 0); c.lineTo(0, 0.47); }],
];

/** A good's symbol, upright, at (x, y), about `size` pixels high: dark ink with a pale halo so it reads on every ground. */
export function glyph(ctx, good, x, y, size, ink = INK, halo = "rgba(253,246,228,.9)") {
  const g = GLYPHS[good];
  if (!g) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
  ctx.beginPath(); g[1](ctx);
  ctx.lineJoin = "round";
  if (halo) { ctx.lineWidth = 3.2 / size; ctx.strokeStyle = halo; ctx.stroke(); }
  ctx.fillStyle = ink; ctx.fill();
  if (g[2]) { ctx.beginPath(); g[2](ctx); ctx.lineWidth = Math.max(1, size * 0.07) / size; ctx.lineCap = "round"; ctx.strokeStyle = halo || PALE; ctx.stroke(); }
  ctx.restore();
}

const STAMPS = new Map();
/** The same symbol from a small picture drawn once for each size (in steps of two pixels), so a board of them costs little to redraw. */
export function stamp(ctx, good, x, y, size) {
  const px = Math.max(8, Math.round(size / 2) * 2), d = Math.min(2, Math.max(1, devicePixelRatio || 1)), key = `${good} ${px} ${d}`;
  let c = STAMPS.get(key);
  if (!c) {
    if (STAMPS.size > 160) STAMPS.clear();
    c = document.createElement("canvas"); c.width = c.height = Math.ceil(px * 1.3 * d);
    const g = c.getContext("2d");
    if (!g) return glyph(ctx, good, x, y, size);
    g.scale(d, d); glyph(g, good, (px * 1.3) / 2, (px * 1.3) / 2, px);
    STAMPS.set(key, c);
  }
  const w = size * 1.3;
  ctx.drawImage(c, x - w / 2, y - w / 2, w, w);
}

/** Pips under a number: how many ways in 36 it comes up, as dots, red with the number when it comes up most. */
export function pips(ctx, n, x, y, r, hot) {
  if (!(n > 0)) return;
  const d = Math.max(1.1, r * 0.085), gap = Math.max(2.8, r * 0.22);
  ctx.fillStyle = hot ? "#b0302a" : INK;
  ctx.beginPath();
  for (let i = 0; i < n; i++) { const px = x + (i - (n - 1) / 2) * gap; ctx.moveTo(px + d, y); ctx.arc(px, y, d, 0, TAU); }
  ctx.fill();
}

/** A port's rate on a small plate: "3:1", or "2:1" and the symbol of its good on that good's colour. h: the plate's height in pixels. */
export function portPlate(ctx, x, y, h, good, rgb) {
  const own = good >= 0 && good < GLYPHS.length, text = own ? "2:1" : "3:1";
  ctx.font = `700 ${Math.round(h * 0.62)}px system-ui,"Segoe UI",sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const tw = ctx.measureText(text).width, sw = own ? h * 0.95 : 0, w = tw + h * 0.6 + sw, x0 = x - w / 2, y0 = y - h / 2, r = h * 0.28;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y0, w, h, r) : ctx.rect(x0, y0, w, h);
  ctx.fillStyle = "#f6eedb"; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke();
  if (own) {
    ctx.save(); ctx.beginPath(); ctx.rect(x0 + w - sw, y0, sw, h); ctx.clip();
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y0, w, h, r) : ctx.rect(x0, y0, w, h); ctx.fillStyle = `rgb(${rgb})`; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.moveTo(x0 + w - sw, y0); ctx.lineTo(x0 + w - sw, y0 + h); ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.stroke();
    glyph(ctx, good, x0 + w - sw / 2, y, h * 0.66, INK, null);
  }
  ctx.fillStyle = INK; ctx.fillText(text, x0 + h * 0.3 + tw / 2, y + 0.5);
}

/**
 * A flag on a short pole whose foot is at (x, y), h pixels tall: "ready" (a pale pennant with an arrow: this can still move)
 * or "buy" (a gold banner with a coin: this village can still buy). Shape and colour both differ, so neither rests on colour alone.
 */
export function flag(ctx, x, y, h, kind) {
  const top = y - h, w = h * 0.62, fh = h * 0.5;
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, top); ctx.lineWidth = Math.max(2.4, h * 0.13); ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath();
  if (kind === "buy") rect(ctx, x, top, x + w, top + fh);
  else { ctx.moveTo(x, top); ctx.lineTo(x + w * 1.05, top + fh * 0.18); ctx.lineTo(x + w * 0.78, top + fh * 0.5); ctx.lineTo(x + w * 1.05, top + fh * 0.82); ctx.lineTo(x, top + fh); ctx.closePath(); }
  ctx.lineWidth = Math.max(2, h * 0.09); ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = kind === "buy" ? "#f2c84b" : "#f4f7fb"; ctx.fill();
  ctx.beginPath(); ctx.lineWidth = Math.max(1.3, h * 0.07); ctx.strokeStyle = INK; ctx.fillStyle = INK;
  if (kind === "buy") { ctx.arc(x + w / 2, top + fh / 2, fh * 0.26, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(x + w / 2, top + fh / 2, fh * 0.08, 0, TAU); ctx.fill(); }
  else { const cx = x + w * 0.34, cy = top + fh / 2, a = fh * 0.2; ctx.moveTo(cx - a, cy - a); ctx.lineTo(cx, cy); ctx.lineTo(cx - a, cy + a); ctx.moveTo(cx + a * 0.1, cy - a); ctx.lineTo(cx + a * 1.1, cy); ctx.lineTo(cx + a * 0.1, cy + a); ctx.stroke(); }
}

/** The model of half a link: from a hex's middle to the edge it shares with the next, in the owner's enamel. Length 0.5 at size 1. */
export const linkModels = () => ({ link: bake(box([], 0, -0.03, 0, 0.5, 0.03, 0.045, [SLOT.cloth, 128, 0], 1, 0.008)) });

/** A link's two ends on the board: from a's middle toward b's, moved sideways into its lane so seats sharing an edge lie side by side. */
export function linkEnds(m, a, b, lane, of) {
  const [x0, y0] = m.mid[a], [x1, y1] = m.mid[b], dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, o = (lane - (of - 1) / 2) * m.R * 0.15;
  const px = (-dy / l) * o, py = (dx / l) * o;
  return { x0: x0 + px, y0: y0 + py, x1: x1 + px, y1: y1 + py, l, t: Math.atan2(dy, dx) };
}

/** The links as models: two halves for each, each lying on its own hex's top, so a link down to the sea follows the step. */
export function stageLinks(out, s, m, show) {
  for (const j of s.joins) {
    const e = linkEnds(m, s.at, j.to, j.lane, j.of);
    out.push({ m: "link", x: e.x0, y: e.y0, z: show[s.at].top, s: e.l, rgb: j.rgb, t: e.t }, { m: "link", x: e.x1, y: e.y1, z: show[j.to].top, s: e.l, rgb: j.rgb, t: e.t + Math.PI });
  }
}

/** The links drawn flat, for the Flat look: a dark edge and the seat's colour, under the numbers and houses. */
export function drawLinks(ctx, cam, m, show, unit, spots, size) {
  const w = Math.min(10, Math.max(3, size * 0.11));
  ctx.lineCap = "round";
  for (const s of spots) {
    if (s.kind !== "route" || !s.joins) continue;
    for (const j of s.joins) {
      const e = linkEnds(m, s.at, j.to, j.lane, j.of);
      cam.projectTo(e.x0, e.y0, show[s.at].top * unit); const x = cam.px, y = cam.py;
      cam.projectTo(e.x1, e.y1, show[j.to].top * unit);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cam.px, cam.py);
      ctx.lineWidth = w + 3; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = w; ctx.strokeStyle = `rgb(${j.rgb})`; ctx.stroke();
    }
  }
  ctx.lineCap = "butt";
}

/**
 * The key to the goods: each symbol on its own colour, and its name. items: [{ name, rgb }] by good.
 * Built from elements and text only. Returns the element, for the page to place.
 */
export function legend(items, title = "Goods") {
  const box = document.createElement("div"), dpr = Math.min(2, Math.max(1, devicePixelRatio || 1));
  box.className = "board-key";
  Object.assign(box.style, { display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "center" });
  box.setAttribute("role", "group"); box.setAttribute("aria-label", `${title}: what the symbols on the hexes mean`);
  items.forEach((it, k) => {
    const row = document.createElement("span"), cv = document.createElement("canvas"), c = cv.getContext("2d"), n = 20;
    cv.width = cv.height = Math.round(n * dpr); cv.style.width = cv.style.height = `${n}px`; cv.setAttribute("aria-hidden", "true");
    if (c) { c.scale(dpr, dpr); c.beginPath(); c.roundRect ? c.roundRect(1, 1, n - 2, n - 2, 4) : c.rect(1, 1, n - 2, n - 2); c.fillStyle = `rgb(${it.rgb})`; c.fill(); c.lineWidth = 1; c.strokeStyle = "rgba(26,20,17,.6)"; c.stroke(); glyph(c, k, n / 2, n / 2, n * 0.74, INK, null); }
    const name = document.createElement("span");
    name.textContent = it.name;
    Object.assign(row.style, { display: "inline-flex", alignItems: "center", gap: "5px" });
    row.append(cv, name);
    box.append(row);
  });
  return box;
}
