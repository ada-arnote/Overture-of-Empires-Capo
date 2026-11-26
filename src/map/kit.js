// SPDX-License-Identifier: AGPL-3.0-or-later
// The geometry kit: models made in code, our own work. A shape is a flat list of corners, three to a triangle,
// ten numbers a corner: place (x, y, z with z up), which way it faces, colour (a slot in the style's palette, a shade about 128, and a spare), and finish
// (a row of the style's finishes: 0 matte paint, 1 the owner's enamel, 2 metal, 3 the ground's own colour). A style is data: the same shapes take another palette.
// Looks only: no rule ever reads a model.
const N = 10;

function put(out, a, b, c, col, fin, na, nb, nc) {
  let n = na;
  if (!n) { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; const l = Math.hypot(...n) || 1; n = n.map((v) => v / l); }
  out.push(...a, ...n, ...col, fin, ...b, ...(nb || n), ...col, fin, ...c, ...(nc || n), ...col, fin);
}

/** The triangles of a simple outline, by clipping ears. pts: [[x, y], ...] either way round. Returns corner numbers, three to a triangle. */
export function ears(pts) {
  const n = pts.length, out = [];
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const idx = pts.map((_, i) => i);
  if (area < 0) idx.reverse();
  const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let guard = n * n + 8;
  while (idx.length > 3 && guard-- > 0) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length], a = pts[ia], b = pts[ib], c = pts[ic];
      if (turn(a, b, c) <= 0) continue; // a hollow corner is no ear
      let clear = true;
      for (const k of idx) {
        if (k === ia || k === ib || k === ic) continue;
        const p = pts[k];
        if (turn(a, b, p) >= 0 && turn(b, c, p) >= 0 && turn(c, a, p) >= 0 && !(p[0] === a[0] && p[1] === a[1]) && !(p[0] === b[0] && p[1] === b[1]) && !(p[0] === c[0] && p[1] === c[1])) { clear = false; break; }
      }
      if (!clear) continue;
      out.push(ia, ib, ic); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) idx.splice(0, 1); // a crossed or needle-thin outline: drop a corner and go on, rather than stop
  }
  if (idx.length === 3) out.push(...idx);
  return out;
}

/** A turned shape, like a pawn on a lathe. prof: [[radius, z], ...] from the foot up. n sides; smooth round the axis unless flat. */
export function lathe(out, prof, n, col, fin = 0, flat = false, spin = 0) {
  const ring = (r, z) => Array.from({ length: n }, (_, i) => { const a = spin + (i / n) * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r, z]; });
  for (let k = 0; k + 1 < prof.length; k++) {
    const [r0, z0] = prof[k], [r1, z1] = prof[k + 1], A = ring(r0, z0), B = ring(r1, z1), dr = r1 - r0, dz = z1 - z0, l = Math.hypot(dr, dz) || 1;
    const nor = (i) => { const a = spin + (i / n) * Math.PI * 2; return [(Math.cos(a) * dz) / l, (Math.sin(a) * dz) / l, -dr / l]; };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ni = flat ? null : nor(i), nj = flat ? null : nor(j);
      if (r0 > 1e-6) put(out, A[i], A[j], B[j], col, fin, ni, nj, nj);
      if (r1 > 1e-6) put(out, A[i], B[j], B[i], col, fin, ni, nj, ni);
    }
  }
  return out;
}

/** An outline pushed up into a solid, with a flat top and bottom. pts: [[x, y], ...]; in: how far the top is drawn in, for a bevel. */
export function prism(out, pts, z0, z1, col, fin = 0, inset = 0) {
  const t = ears(pts), cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const top = pts.map(([x, y]) => { const d = Math.hypot(x - cx, y - cy) || 1; return [x - ((x - cx) / d) * inset, y - ((y - cy) / d) * inset, z1]; }), low = pts.map(([x, y]) => [x, y, z0]);
  for (let i = 0; i < t.length; i += 3) { put(out, top[t[i]], top[t[i + 1]], top[t[i + 2]], col, fin); put(out, low[t[i]], low[t[i + 2]], low[t[i + 1]], col, fin); }
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length, [a, b] = area > 0 ? [i, j] : [j, i];
    put(out, low[a], low[b], top[b], col, fin); put(out, low[a], top[b], top[a], col, fin);
  }
  return out;
}

export const box = (out, x0, y0, z0, x1, y1, z1, col, fin = 0, inset = 0) => prism(out, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1, col, fin, inset);

/** A copy of a shape: scaled, leant back about the x axis (so a thing drawn lying down stands up), turned about the upright, then moved. */
export function move(out, part, x = 0, y = 0, z = 0, s = 1, turn = 0, lean = 0, sz = s) {
  const ct = Math.cos(turn), st = Math.sin(turn), cl = Math.cos(lean), sl = Math.sin(lean);
  const spin = (X, Y, Z) => { const y1 = Y * cl - Z * sl, z1 = Y * sl + Z * cl; return [X * ct - y1 * st, X * st + y1 * ct, z1]; };
  for (let i = 0; i < part.length; i += N) {
    const p = spin(part[i] * s, part[i + 1] * s, part[i + 2] * sz), n = spin(part[i + 3], part[i + 4], part[i + 5]);
    out.push(p[0] + x, p[1] + y, p[2] + z, ...n, part[i + 6], part[i + 7], part[i + 8], part[i + 9]);
  }
  return out;
}

/** Packs a shape for the graphics card, 20 bytes a corner. A wash darkens what is near the foot, as paint settles in hollows. */
export function bake(v) {
  const n = v.length / N, buf = new ArrayBuffer(n * 20), f = new Float32Array(buf), b = new Uint8Array(buf), s = new Int8Array(buf);
  let tall = 0.01;
  for (let i = 0; i < n; i++) tall = Math.max(tall, v[i * N + 2]);
  for (let i = 0; i < n; i++) {
    const o = i * N, at = i * 20;
    f[i * 5] = v[o]; f[i * 5 + 1] = v[o + 1]; f[i * 5 + 2] = v[o + 2];
    s[at + 12] = Math.round(v[o + 3] * 127); s[at + 13] = Math.round(v[o + 4] * 127); s[at + 14] = Math.round(v[o + 5] * 127); b[at + 15] = v[o + 9];
    b[at + 16] = v[o + 6]; b[at + 17] = v[o + 7]; b[at + 18] = v[o + 8]; b[at + 19] = Math.round(255 * Math.min(1, 0.7 + (0.42 * v[o + 2]) / Math.min(tall, 0.5)));
  }
  return { buf, n };
}
