// SPDX-License-Identifier: AGPL-3.0-or-later
// One camera for every look. Board point (x, y) in board pixels, height Z in screen pixels.
// The *To methods write into fields and make no objects, so picking makes no garbage.
export class Camera {
  constructor() {
    Object.assign(this, { cx: 0, cy: 0, s: 1, tilt: 0, yaw: 0, q: 0, W: 1, H: 1, ox: 0, oy: 0, px: 0, py: 0, pk: 0, left: 0, right: 0, top: 0, bottom: 0 });
    this.set({});
  }
  set(o) {
    Object.assign(this, o);
    this.ct = Math.cos(this.tilt); this.st = Math.sin(this.tilt); this.cw = Math.cos(this.yaw); this.sw = Math.sin(this.yaw);
    // the middle of the part of the screen that panels leave free
    this.mx = (this.left + this.W - this.right) / 2; this.my = (this.top + this.H - this.bottom) / 2;
    return this;
  }
  /** Screen point of a board point: this.px, this.py, and the perspective scale this.pk. */
  projectTo(x, y, Z) {
    const dx = (x - this.cx) * this.s, dy = (y - this.cy) * this.s, X = dx * this.cw - dy * this.sw, Y = dx * this.sw + dy * this.cw;
    const k = 1 / (1 - this.q * (Y * this.st + Z * this.ct));
    this.px = this.mx + X * k; this.py = this.my + (Y * this.ct - Z * this.st) * k; this.pk = k;
  }
  /** Board point under a screen point at height Z: this.ox, this.oy. */
  unprojectTo(sx, sy, Z) {
    const u = sx - this.mx, v = sy - this.my, den = Math.max(0.02, this.ct + this.q * v * this.st);
    const Y = (v * (1 - this.q * Z * this.ct) + Z * this.st) / den, X = u * (1 - this.q * (Y * this.st + Z * this.ct));
    this.ox = this.cx + (X * this.cw + Y * this.sw) / this.s; this.oy = this.cy + (-X * this.sw + Y * this.cw) / this.s;
  }
  /** Scale and centre so that the points fit the free part of the screen. */
  fit(points, pad) {
    const wide = this.W - this.left - this.right - pad * 2, high = this.H - this.top - this.bottom - pad * 2;
    let lo = 0.05, hi = 8, x0, x1, y0, y1;
    const box = () => {
      x0 = y0 = Infinity; x1 = y1 = -Infinity;
      for (const [x, y] of points) {
        this.projectTo(x, y, 0);
        if (!(this.pk > 0)) { x0 = -1e6; x1 = 1e6; return; }
        x0 = Math.min(x0, this.px); x1 = Math.max(x1, this.px); y0 = Math.min(y0, this.py); y1 = Math.max(y1, this.py);
      }
    };
    for (let i = 0; i < 22; i++) {
      this.s = Math.sqrt(lo * hi);
      for (let j = 0; j < 3; j++) { box(); this.cx += ((x0 + x1) / 2 - this.mx) / this.s; this.cy += ((y0 + y1) / 2 - this.my) / this.s / Math.max(0.3, this.ct); }
      box();
      if (x1 - x0 < wide && y1 - y0 < high) lo = this.s; else hi = this.s;
    }
    this.s = lo;
    return this;
  }
}

/** Which cell is under a screen point. Walks down from the tallest top, so the first thing met wins. Makes no objects. */
export function pick(cam, m, sx, sy, top, unit, most) {
  const { w, h, ids } = m;
  cam.unprojectTo(sx, sy, 0);
  const x0 = cam.ox, y0 = cam.oy;
  cam.unprojectTo(sx, sy, most);
  const dx = cam.ox - x0, dy = cam.oy - y0, n = most > 0 ? Math.ceil(Math.sqrt(dx * dx + dy * dy) * 2) + 1 : 0;
  for (let i = 0; i <= n; i++) {
    const t = n ? 1 - i / n : 0, x = Math.floor(x0 + dx * t), y = Math.floor(y0 + dy * t);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const id = ids[y * w + x];
    if (id && top[id] * unit >= most * t - 1e-6) return id - 1;
  }
  return -1;
}
