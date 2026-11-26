// SPDX-License-Identifier: AGPL-3.0-or-later
// The province map for Capo's story worlds: maps/world.json drawn on one canvas, with drag, wheel, pinch and tap.
// The file holds arcs (shared lines, drawn once) and provinces made of arcs, so neighbours always meet exactly.

/** Fetch and unpack a world: absolute points for every arc, a path, box and middle for every province. */
export async function loadWorld(url, disputesUrl = "") {
  // disputed areas are drawn over the map; if their file is missing the map still works
  const disputes = disputesUrl ? await fetch(disputesUrl).then((r) => (r.ok ? r.json() : { areas: [] })).catch(() => ({ areas: [] })) : { areas: [] };
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The map could not be loaded (${res.status}).`);
  const w = await res.json();
  const arcs = w.arcs.map((d) => { const pts = []; let x = 0, y = 0; for (let i = 0; i < d.length; i += 2) { x += d[i]; y += d[i + 1]; if (i === 0) { x = d[0]; y = d[1]; } pts.push([x, y]); } return pts; });
  const sides = arcs.map(() => []);
  const byId = new Map();
  for (const p of w.provinces) {
    const path = new Path2D();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const ring of p.rings) {
      let first = true;
      for (const k of ring) {
        const pts = k >= 0 ? arcs[k] : arcs[~k].slice().reverse();
        sides[k >= 0 ? k : ~k].push(p.id);
        for (const [x, y] of pts) {
          if (first) { path.moveTo(x, y); first = false; } else path.lineTo(x, y);
          if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
        }
      }
      path.closePath();
    }
    byId.set(p.id, { ...p, path, box: [x0, y0, x1, y1] });
  }
  const lines = arcs.map((pts) => { const l = new Path2D(); pts.forEach(([x, y], i) => (i ? l.lineTo(x, y) : l.moveTo(x, y))); return l; });
  const neighbours = new Map([...byId.keys()].map((id) => [id, []]));
  for (const [a, b] of w.neighbours) { neighbours.get(a).push(b); neighbours.get(b).push(a); }
  // narrow seas: coasts close across water, far apart by land
  const across = new Map([...byId.keys()].map((id) => [id, []]));
  for (const [a, b, km] of w.sea || []) { across.get(a).push(b); across.get(b).push(a); void km; }
  const straits = new Path2D();
  for (const [a, b] of w.sea || []) { const p = byId.get(a).label, q = byId.get(b).label; if (Math.abs(p[0] - q[0]) < w.width / 2) { straits.moveTo(p[0], p[1]); straits.lineTo(q[0], q[1]); } }
  // a province on the coast has a line with nobody on the other side
  const coast = new Set(sides.filter((ids) => ids.length === 1).map((ids) => ids[0]));
  const areas = disputes.areas.map((a) => {
    const path = new Path2D(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of a.rings) { for (let i = 0; i < r.length; i += 2) { const x = r[i], y = r[i + 1]; if (i) path.lineTo(x, y); else path.moveTo(x, y); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } path.closePath(); }
    return { ...a, path, box: [x0, y0, x1, y1] };
  });
  return { width: w.width, height: w.height, countries: w.countries, source: w.source, provinces: byId, lines, sides, neighbours, across, straits, coast, disputes: areas };
}

let tile = null;
function hatch() {
  if (tile) return tile;
  tile = document.createElement("canvas"); tile.width = tile.height = 8;
  const c = tile.getContext("2d");
  c.strokeStyle = "rgba(255,244,214,.55)"; c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(0, 8); c.lineTo(8, 0); c.moveTo(-2, 2); c.lineTo(2, -2); c.moveTo(6, 10); c.lineTo(10, 6); c.stroke();
  return tile;
}

/** A gentle colour for every owner code, the same on every machine. */
export function ownerColour(code) {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${(h * 137.508) % 360} ${34 + (h % 5) * 6}% ${36 + (h % 7) * 3}%)`;
}

/**
 * Draw a world on a canvas and keep it moving.
 * o.owner(id) gives each province's owner code; o.pick(province) is called on a tap; o.picked() names the chosen one.
 */
export function worldMap(canvas, world, o) {
  const ctx = canvas.getContext("2d"), probe = document.createElement("canvas").getContext("2d");
  const base = document.createElement("canvas"), bctx = base.getContext("2d");
  const view = { x: 0, y: 0, s: 1 }, touches = new Map();
  let queued = false, moved = 0, last = null, pinch = null, drawn = null, settle = 0, layers = null, signature = "", later = 0;
  const size = () => { const r = canvas.getBoundingClientRect(), d = devicePixelRatio || 1; canvas.width = base.width = Math.round(r.width * d); canvas.height = base.height = Math.round(r.height * d); drawn = null; return [r.width, r.height]; };
  // the whole world on a wide screen; on a tall phone, the middle of it at a size that can be read
  const fit = () => {
    const [cw, ch] = size(), tall = cw < ch;
    view.s = tall ? (ch / (world.height * 0.86)) * 0.62 : Math.min(cw / world.width, ch / (world.height * 0.86));
    const [mx, my] = [world.width * 0.54, world.height * 0.42];
    view.x = mx - cw / 2 / view.s; view.y = my - ch / 2 / view.s; clamp();
  };
  const clamp = () => { const [cw, ch] = [canvas.clientWidth, canvas.clientHeight]; view.s = Math.max(Math.min(cw / world.width, ch / world.height) * 0.9, Math.min(view.s, 60)); view.x = Math.max(-cw / view.s * 0.5, Math.min(world.width - cw / view.s * 0.5, view.x)); view.y = Math.max(-ch / view.s * 0.5, Math.min(world.height - ch / view.s * 0.5, view.y)); };
  const at = (cx, cy) => [view.x + cx / view.s, view.y + cy / view.s];

  // One path per owner and three line sets, made again only when someone's land changes hands.
  function build() {
    const owners = new Map(), fills = new Map();
    for (const p of world.provinces.values()) {
      const who = o.owner(p.id); owners.set(p.id, who);
      if (!fills.has(who)) fills.set(who, { path: new Path2D(), box: [Infinity, Infinity, -Infinity, -Infinity] });
      const f = fills.get(who); f.path.addPath(p.path);
      f.box = [Math.min(f.box[0], p.box[0]), Math.min(f.box[1], p.box[1]), Math.max(f.box[2], p.box[2]), Math.max(f.box[3], p.box[3])];
    }
    const inner = new Path2D(), outer = new Path2D(), coast = new Path2D();
    world.sides.forEach((ids, k) => { (ids.length < 2 ? coast : owners.get(ids[0]) === owners.get(ids[1]) ? inner : outer).addPath(world.lines[k]); });
    layers = { owners, fills, inner, outer, coast };
  }

  // The whole map is painted into a hidden picture; moving and zooming slide and stretch that picture,
  // and the map is painted again once things are still.
  function paint() {
    const t0 = performance.now(), d = devicePixelRatio || 1, cw = base.width / d, ch = base.height / d, s = view.s, c = bctx;
    const sig = [...world.provinces.keys()].map((id) => o.owner(id)).join();
    if (!layers || sig !== signature) { build(); signature = sig; }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#16242b"; c.fillRect(0, 0, base.width, base.height);
    c.setTransform(d * s, 0, 0, d * s, -view.x * s * d, -view.y * s * d);
    const [vx0, vy0] = at(0, 0), [vx1, vy1] = at(cw, ch);
    for (const [who, f] of layers.fills) {
      if (f.box[2] < vx0 || f.box[0] > vx1 || f.box[3] < vy0 || f.box[1] > vy1) continue;
      c.fillStyle = o.colour?.(who) || ownerColour(who); c.fill(f.path, "evenodd");
    }
    // province lines faint, lines between owners stronger, the coast dark
    c.lineJoin = "round"; c.lineCap = "round";
    if (s > 0.6) { c.strokeStyle = "rgba(255,244,214,.16)"; c.lineWidth = 0.8 / s; c.stroke(layers.inner); }
    c.strokeStyle = "rgba(10,16,18,.55)"; c.lineWidth = 1.1 / s; c.stroke(layers.coast);
    // narrow seas, as faint dotted lines once the map is close enough to read them
    if (s > 1.4 && world.straits) { c.strokeStyle = "rgba(226,184,102,.45)"; c.lineWidth = 1.2 / s; c.setLineDash([2 / s, 4 / s]); c.stroke(world.straits); c.setLineDash([]); }
    // disputed areas: hatched, with a dashed edge, so they read as unsettled whatever the colours underneath
    if (world.disputes?.length) {
      // the pattern is undone from the map's scale so its lines stay the same size on screen at every zoom
      const pat = c.createPattern(hatch(), "repeat"), k = 1 / (d * s);
      pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
      c.fillStyle = pat; c.strokeStyle = "rgba(255,244,214,.75)"; c.lineWidth = 1 / s; c.setLineDash([4 / s, 3 / s]);
      for (const a of world.disputes) {
        if (a.box[2] < vx0 || a.box[0] > vx1 || a.box[3] < vy0 || a.box[1] > vy1) continue;
        c.fill(a.path, "evenodd"); c.stroke(a.path);
      }
      c.setLineDash([]);
    }
    c.strokeStyle = "rgba(255,244,214,.7)"; c.lineWidth = 1.4 / s; c.stroke(layers.outer);
    labels(c, cw, ch, layers.owners);
    drawn = { ...view };
    canvas.dataset.paintMs = Math.round(performance.now() - t0); // how long a full paint takes, for checking on slow phones
  }

  function draw() {
    queued = false;
    const d = devicePixelRatio || 1, still = touches.size === 0 && performance.now() - settle > 140;
    if (!drawn || (still && (drawn.x !== view.x || drawn.y !== view.y || drawn.s !== view.s))) paint();
    else if (!still) { clearTimeout(later); later = setTimeout(redraw, 160); }
    // the picture, slid and stretched to where the view is now
    const k = view.s / drawn.s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#16242b"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(k, 0, 0, k, (drawn.x - view.x) * view.s * d, (drawn.y - view.y) * view.s * d);
    ctx.drawImage(base, 0, 0);
    const chosen = o.picked?.(), hit = chosen && world.provinces.get(chosen);
    if (hit) { const s = view.s; ctx.setTransform(d * s, 0, 0, d * s, -view.x * s * d, -view.y * s * d); ctx.strokeStyle = "#e2b866"; ctx.lineWidth = 2.6 / s; ctx.stroke(hit.path); }
  }

  // country names when far out, province names when close in; nothing printed over anything else
  function labels(ctx, cw, ch, owners) {
    const d = devicePixelRatio || 1, s = view.s, taken = [];
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    const put = (text, mx, my, px, weight) => {
      const x = (mx - view.x) * s, y = (my - view.y) * s;
      if (x < -40 || y < -20 || x > cw + 40 || y > ch + 20) return;
      ctx.font = `${weight} ${px}px Georgia, serif`;
      const w = ctx.measureText(text).width, box = [x - w / 2 - 3, y - px / 2 - 2, x + w / 2 + 3, y + px / 2 + 2];
      if (taken.some((b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) return;
      taken.push(box);
      ctx.strokeStyle = "rgba(14,20,22,.85)"; ctx.lineWidth = 3; ctx.strokeText(text, x, y);
      ctx.fillStyle = "#f3ead2"; ctx.fillText(text, x, y);
    };
    if (s > 2.2) {
      for (const p of world.provinces.values()) { const [x0, y0, x1, y1] = p.box; if ((x1 - x0) * s > 46 && (y1 - y0) * s > 14) put(p.name, p.label[0], p.label[1], 11, 500); }
    }
    const biggest = new Map();
    for (const p of world.provinces.values()) {
      const who = owners.get(p.id), [x0, y0, x1, y1] = p.box, a = (x1 - x0) * (y1 - y0), b = biggest.get(who);
      if (!b || a > b.a) biggest.set(who, { a, p });
    }
    for (const [who, { a, p }] of [...biggest].sort((m, n) => n[1].a - m[1].a)) if (a * s * s > 1500) put(o.name?.(who) || world.countries[who] || who, p.label[0], p.label[1], s > 2.2 ? 14 : 12, 600);
  }

  // a page out of sight may get no animation frames, so a timer stands in when none comes
  const redraw = () => { if (queued) return; queued = true; const run = () => { if (queued) draw(); }; requestAnimationFrame(run); setTimeout(run, 250); };
  const zoom = (f, cx, cy) => { settle = performance.now(); const [mx, my] = at(cx, cy); view.s *= f; clamp(); view.x = mx - cx / view.s; view.y = my - cy / view.s; clamp(); redraw(); };
  function pickAt(cx, cy) {
    const [mx, my] = at(cx, cy), inside = (b) => mx >= b[0] && mx <= b[2] && my >= b[1] && my <= b[3];
    const areas = (world.disputes || []).filter((a) => inside(a.box) && probe.isPointInPath(a.path, mx, my, "evenodd"));
    for (const p of world.provinces.values()) if (inside(p.box) && probe.isPointInPath(p.path, mx, my, "evenodd")) return { ...p, disputes: areas };
    return null;
  }
  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener("pointerdown", (e) => { try { canvas.setPointerCapture(e.pointerId); } catch { /* a pointer the page did not see start */ } touches.set(e.pointerId, local(e)); moved = 0; last = local(e); if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  canvas.addEventListener("pointermove", (e) => {
    if (!touches.has(e.pointerId)) return;
    const p = local(e), before = touches.get(e.pointerId);
    touches.set(e.pointerId, p);
    if (touches.size === 2 && pinch) {
      const [a, b] = [...touches.values()], gap = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoom(gap / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch = gap; moved += 10; return;
    }
    moved += Math.abs(p[0] - before[0]) + Math.abs(p[1] - before[1]);
    settle = performance.now();
    view.x -=(p[0] - before[0]) / view.s; view.y -= (p[1] - before[1]) / view.s; clamp(); redraw();
  });
  const up = (e) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    if (e.type === "pointerup" && moved < 6 && last) { const hit = pickAt(...last); o.pick?.(hit); redraw(); }
    last = null;
  };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoom(Math.exp(-e.deltaY * 0.0015), ...local(e)); }, { passive: false });
  canvas.addEventListener("dblclick", (e) => zoom(2, ...local(e)));
  addEventListener("resize", () => { size(); clamp(); redraw(); });
  fit(); redraw();
  return {
    redraw,
    /** Paint again now: land has changed hands, so the picture is out of date. */
    refresh: () => { drawn = null; redraw(); },
    zoomBy: (f) => zoom(f, canvas.clientWidth / 2, canvas.clientHeight / 2),
    reset: () => { fit(); redraw(); },
    /** Centre on a province and zoom so it fills about a third of the screen. */
    show(id) {
      const p = world.provinces.get(id); if (!p) return;
      const [x0, y0, x1, y1] = p.box, cw = canvas.clientWidth, ch = canvas.clientHeight;
      view.s = Math.min(cw / (x1 - x0), ch / (y1 - y0)) / 3; clamp();
      view.x = (x0 + x1) / 2 - cw / 2 / view.s; view.y = (y0 + y1) / 2 - ch / 2 / view.s; clamp(); redraw();
    },
  };
}
