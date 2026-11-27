// SPDX-License-Identifier: AGPL-3.0-or-later
// Names on the map and number plates that keep out of each other's way. A plate that would cover another is moved to the
// nearest free place and tied back to its piece by a thin line; a name that has no room, or no room in its province, is left out.
// Looks only: no rule ever reads them.

const INK = "#1a1411";
/** Where a crowded box may go instead, in units of its own size: beside, below, above, then further out. */
const AROUND = [[0, 0]];
for (const k of [1, 1.7, 2.5]) for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 + Math.PI / 2; AROUND.push([Math.round(Math.cos(a) * k * 100) / 100, Math.round(Math.sin(a) * k * 100) / 100]); }

const hits = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/**
 * Lay out boxes so that none covers another. Each item: { x, y (where it would sit), l, r, t, b (its reach from there), drop (leave it
 * out rather than move it), spots ([[dx, dy], ...] in pixels; else the places AROUND, in its own widths and heights) }. Items are placed in
 * the order given and kept: the first come keep their own place. Writes item.x, item.y, item.moved and item.out; returns the placed boxes.
 */
export function spread(items, W, H, taken = []) {
  const placed = [...taken];
  for (const it of items) {
    const w = it.l + it.r, h = it.t + it.b, x0 = it.x, y0 = it.y;
    it.out = true; it.moved = false;
    for (const [dx, dy] of it.spots || (it.drop ? [[0, 0]] : AROUND.map(([a, b]) => [a * w, b * h]))) {
      const x = x0 + dx, y = y0 + dy, bx = { x0: x - it.l - 1, x1: x + it.r + 1, y0: y - it.t - 1, y1: y + it.b + 1 };
      if ((bx.x0 < 0 || bx.y0 < 0 || bx.x1 > W || bx.y1 > H) && (dx || dy || it.drop)) continue; // a piece keeps its own place even at the edge; a name is left out
      if (placed.some((p) => hits(p, bx))) continue;
      Object.assign(it, { x, y, out: false, moved: !!(dx || dy) });
      placed.push(bx);
      break;
    }
    if (it.out && !it.drop) { it.out = false; placed.push({ x0: x0 - it.l, x1: x0 + it.r, y0: y0 - it.t, y1: y0 + it.b }); } // nowhere free: it stays, as before
  }
  return placed;
}

/** A thin line from where a moved plate belongs to where it went, with a dot on its piece. */
export function tie(ctx, ax, ay, x, y) {
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(x, y); ctx.lineWidth = 3; ctx.strokeStyle = "rgba(253,246,228,.75)"; ctx.stroke();
  ctx.lineWidth = 1.4; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.arc(ax, ay, 2.6, 0, 7); ctx.fillStyle = INK; ctx.fill();
}

const sizes = new WeakMap();
/** How big each place is on the board, as the side of a square of the same area, counted once from the picture. */
export function reach(m) {
  if (sizes.has(m)) return sizes.get(m);
  const n = new Float32Array(m.mid.length + 1);
  for (let i = 0; i < m.ids.length; i++) n[m.ids[i]]++;
  const out = Array.from(m.mid, (_, i) => Math.sqrt(n[i + 1]));
  sizes.set(m, out);
  return out;
}

/** The font for a place's name. Plain and upright, so it is not taken for a land's name (those are italic). */
export const nameFont = (px, bold = false) => `${bold ? 700 : 600} ${px}px system-ui,"Segoe UI",sans-serif`;

/** A name, dark on a pale halo, which reads on every ground and in every style. */
export function word(ctx, text, x, y, px, bold = false) {
  ctx.font = nameFont(px, bold); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, px * 0.32); ctx.strokeStyle = "rgba(252,247,234,.88)"; ctx.strokeText(text, x, y);
  ctx.fillStyle = "rgba(26,20,17,.94)"; ctx.fillText(text, x, y);
}

/**
 * The places' names, where they fit: under a place's plate (or over its piece), only when the name is no wider than the place is
 * at this zoom, and never over a plate or another name, so zooming in brings more of them and the whole world stays clear.
 * The place under the pointer is always named. plates: where each place's plate went ({ ax, ay, rad } by place).
 */
export function drawNames(ctx, cam, m, show, unit, places, taken, hover, plates, tall) {
  const side = reach(m), items = [];
  let lit = null;
  for (const p of places) {
    const i = p.at;
    cam.projectTo(m.mid[i][0], m.mid[i][1], show[i].top * unit);
    const across = side[i] * cam.s * cam.pk, px = Math.round(Math.max(10.5, Math.min(18, 8 + across * 0.035))), x = cam.px, y = cam.py;
    const pl = plates.get(i), under = pl ? pl.ay + pl.rad + px * 0.8 : y;
    cam.projectTo(m.mid[i][0], m.mid[i][1], show[i].top * unit + tall * cam.s);
    const over = cam.py - px * 0.7;
    if (i === hover) { lit = { text: p.text, x: pl ? pl.ax : x, y: under, px: Math.max(13, px) }; continue; }
    ctx.font = nameFont(px);
    const tw = ctx.measureText(p.text).width;
    if (tw > across * 1.25) continue; // no room in the place at this zoom
    items.push({ text: p.text, px, across, x: pl ? pl.ax : x, y: under, l: tw / 2 + 2, r: tw / 2 + 2, t: px * 0.62, b: px * 0.62, drop: true, spots: [[0, 0], [0, over - under]] });
  }
  items.sort((a, b) => b.across - a.across); // the larger places first
  spread(items, cam.W, cam.H, taken);
  for (const it of items) if (!it.out) word(ctx, it.text, it.x, it.y, it.px);
  if (lit) word(ctx, lit.text, lit.x, lit.y, lit.px, true);
}
