// SPDX-License-Identifier: AGPL-3.0-or-later
// The province map for Capo's story worlds: maps/world.json drawn on one canvas, with drag, wheel, pinch and tap.
// The file holds arcs (shared lines, drawn once) and provinces made of arcs, so neighbours always meet exactly.
// Where the device can, the world is a lit relief map on a table (src/map/world.js) with pieces standing on it, sharing the
// table games' camera, lamp and models; this canvas then carries only what must stay sharp: lines, names, the chosen
// province. Where it cannot, or the player chooses Flat, the whole map is drawn here in 2D as before.
import { canDraw } from "../src/map/board.js";
import { Camera } from "../src/map/camera.js";
import { Meshes } from "../src/map/mesh.js";
import { models } from "../src/map/models.js";
import { STYLES } from "../src/map/style.js";
import { WorldGround } from "../src/map/world.js";

/** Fetch and unpack a world: absolute points for every arc, a path, box and middle for every province. */
export async function loadWorld(url, disputesUrl = "") {
  // disputed areas are drawn over the map; if their file is missing the map still works
  const disputes = disputesUrl ? await fetch(disputesUrl).then((r) => (r.ok ? r.json() : { areas: [] })).catch(() => ({ areas: [] })) : { areas: [] };
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The map could not be loaded (${res.status}).`);
  return unpackWorld(await res.json(), disputes);
}
/** A world as the page uses it, from the plain data of a map file or of a world made from a seed. */
export function unpackWorld(w, disputes = { areas: [] }) {
  const arcs = w.arcs.map((d) => { const pts = []; let x = 0, y = 0; for (let i = 0; i < d.length; i += 2) { x += d[i]; y += d[i + 1]; if (i === 0) { x = d[0]; y = d[1]; } pts.push([x, y]); } return pts; });
  const sides = arcs.map(() => []);
  const byId = new Map();
  w.provinces.forEach((p, n) => {
    const path = new Path2D(), poly = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const ring of p.rings) {
      let first = true;
      const line = [];
      poly.push(line);
      for (const k of ring) {
        const pts = k >= 0 ? arcs[k] : arcs[~k].slice().reverse();
        sides[k >= 0 ? k : ~k].push(p.id);
        for (const [x, y] of pts) {
          const l = line[line.length - 1];
          if (!l || l[0] !== x || l[1] !== y) line.push([x, y]); // arcs meet end to end, so the joint comes twice
          if (first) { path.moveTo(x, y); first = false; } else path.lineTo(x, y);
          if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
        }
      }
      path.closePath();
      if (line.length > 1 && line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1]) line.pop();
    }
    byId.set(p.id, { ...p, n, path, poly, box: [x0, y0, x1, y1] }); // n: its number, for the lit map's colours. poly: its outline as points, for its triangles
  });
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
  return { width: w.width, height: w.height, view: w.view, countries: w.countries, source: w.source, provinces: byId, lines, arcs, sides, neighbours, across, straits, coast, disputes: areas, relief: w.relief };
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
  const view = { x: 0, y: 0, s: 1 }, touches = new Map(), FLAT = "capo-map-flat", read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  let queued = false, moved = 0, last = null, pinch = null, drawn = null, settle = 0, layers = null, signature = "", later = 0, wide = 1, lit = null, timed = [], pieces = null;

  // ---- the lit map: its own canvas under this one ----
  const style = STYLES.painted, cam = new Camera();
  function light() {
    if (lit || read(FLAT) || !canDraw()) return;
    const under = document.createElement("canvas");
    try {
      under.setAttribute("aria-hidden", "true");
      Object.assign(under.style, { position: "fixed", inset: "0", width: "100%", height: "100%", display: "block" });
      const ground = new WorldGround(under), meshes = new Meshes(ground.g, models());
      canvas.before(under);
      lit = { under, ground, meshes, rgb: new Map(), key: "" };
      under.addEventListener("webglcontextlost", (e) => { e.preventDefault(); dark(); });
      const wood = new Image(); wood.onload = () => { if (lit) { lit.ground.wood(wood); redraw(); } }; wood.src = "textures/walnut.webp";
      shape();
    } catch (e) { under.remove(); lit = null; console.warn("The lit map did not start; the drawn map stays:", e); }
  }
  function dark() { if (!lit) return; lit.under.remove(); lit.ground.destroy(); lit = null; drawn = null; redraw(); }
  /** The world's shapes, sent once a world: every province's triangles, and the coast's cut edge. */
  function shape() {
    const list = [...world.provinces.values()].sort((a, b) => a.n - b.n), num = new Map(list.map((p) => [p.id, p.n]));
    const coast = world.sides.flatMap((ids, k) => (ids.length === 1 ? [[num.get(ids[0]), world.arcs[k]]] : []));
    lit.ground.load([world.width, world.height], list.map((p) => ({ rings: p.poly })), coast, (world.arcs.length % 97) / 7);
    lit.ground.relief(null); lit.key = "";
    if (world.relief) { const img = new Image(), w = world; img.onload = () => { if (lit && world === w) { lit.ground.relief(img); redraw(); } }; img.src = world.relief; }
  }
  /** A colour as three numbers, whatever way it was written. */
  const rgbOf = (text) => {
    if (!lit.rgb.has(text)) { probe.fillStyle = "#000"; probe.fillStyle = text; const h = probe.fillStyle; lit.rgb.set(text, h[0] === "#" ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : h.match(/[\d.]+/g).slice(0, 3).map(Number)); }
    return lit.rgb.get(text);
  };
  /** The map tilts as it comes close: flat for the whole world, a model of the country you look at. */
  /** How far the land stands above the sea, in the world's own units: about six screen points, never a cliff. */
  const rise = (s = view.s) => (lit ? Math.min(2.4, 6 / s) : 0);
  const tilt = (s = view.s) => (lit ? Math.max(0, Math.min(1, (s / wide - 1.25) / 3.2)) * 0.62 : 0);
  /** 0 the world, 1 a region, 2 a country: what is drawn and named depends on it. */
  const band = (s = view.s) => (s < wide * 2.2 ? 0 : s < wide * 6.5 ? 1 : 2);
  // The page's own lines lie on the land's top; the camera has no vanishing point here, so one plain transform places them.
  const frame = (v, d) => { const t = tilt(v.s), ct = Math.cos(t), my = canvas.clientHeight / 2; return [d * v.s, d * v.s * ct, -v.x * v.s * d, d * (my - (v.y * v.s + my) * ct - rise(v.s) * v.s * Math.sin(t))]; };
  const lay = (c, v, d) => { const [a, e, x, y] = frame(v, d); c.setTransform(a, 0, 0, e, x, y); };
  const spot = (mx, my) => { const [a, e, x, y] = frame(view, 1); return [a * mx + x, e * my + y]; };
  const size = () => { const r = canvas.getBoundingClientRect(), d = devicePixelRatio || 1; canvas.width = base.width = Math.round(r.width * d); canvas.height = base.height = Math.round(r.height * d); drawn = null; return [r.width, r.height]; };
  // the whole world on a wide screen; on a tall phone, the middle of it at a size that can be read
  const fit = () => {
    // a made world says where its middle is and how much of its height to show, in hundredths; the real one is fitted by eye
    const [cw, ch] = size(), tall = cw < ch, [px, py, ph] = world.view || [54, 42, 86], high = (world.height * ph) / 100;
    wide = Math.min(cw / world.width, ch / high);
    view.s = tall ? (ch / high) * 0.62 : wide;
    const [mx, my] = [(world.width * px) / 100, (world.height * py) / 100];
    view.x = mx - cw / 2 / view.s; view.y = my - ch / 2 / view.s; clamp();
  };
  const clamp = () => { const [cw, ch] = [canvas.clientWidth, canvas.clientHeight]; view.s = Math.max(Math.min(cw / world.width, ch / world.height) * 0.9, Math.min(view.s, 60)); view.x = Math.max(-cw / view.s * 0.5, Math.min(world.width - cw / view.s * 0.5, view.x)); view.y = Math.max(-ch / view.s * 0.5, Math.min(world.height - ch / view.s * 0.5, view.y)); };
  const at = (cx, cy) => { const [a, e, x, y] = frame(view, 1); return [(cx - x) / a, (cy - y) / e]; };

  // One path per owner and three line sets, made again only when someone's land changes hands.
  function build() {
    const owners = new Map(), fills = new Map();
    for (const p of world.provinces.values()) {
      const who = o.owner(p.id); owners.set(p.id, who);
      if (!fills.has(who)) fills.set(who, { path: new Path2D(), box: [Infinity, Infinity, -Infinity, -Infinity] });
      const f = fills.get(who); f.path.addPath(p.path);
      f.box = [Math.min(f.box[0], p.box[0]), Math.min(f.box[1], p.box[1]), Math.max(f.box[2], p.box[2]), Math.max(f.box[3], p.box[3])];
    }
    const inner = new Path2D(), outer = new Path2D(), coast = new Path2D(), mine = new Path2D(), front = new Path2D(), me = o.mine?.(), wars = new Set((o.wars?.() || []).flatMap(([x, y]) => [`${x}|${y}`, `${y}|${x}`]));
    world.sides.forEach((ids, k) => {
      if (ids.length === 2 && wars.has(`${owners.get(ids[0])}|${owners.get(ids[1])}`)) front.addPath(world.lines[k]); // a front: where two countries at war meet
      (ids.length < 2 ? coast : owners.get(ids[0]) === owners.get(ids[1]) ? inner : outer).addPath(world.lines[k]);
      // the edge of the player's land, coast included, outlined in silver
      if (me && ids.some((id) => owners.get(id) === me) && !(ids.length === 2 && owners.get(ids[0]) === owners.get(ids[1]))) mine.addPath(world.lines[k]);
    });
    layers = { owners, fills, inner, outer, coast, mine, front };
    if (lit) { // the lit map's colours: one texel a province
      const bytes = new Uint8Array(world.provinces.size * 4);
      for (const p of world.provinces.values()) { const c = rgbOf(o.colour?.(owners.get(p.id)) || ownerColour(owners.get(p.id))); bytes.set([c[0], c[1], c[2], 255], p.n * 4); }
      lit.ground.paint(bytes); lit.bytes = bytes;
    }
  }
  /** What stands on the lit map: the page's pieces, each the same size on the screen whatever the zoom (a little larger close in). */
  function stage() {
    const b = band(), k = ((canvas.clientWidth < 600 ? 28 : 36) / view.s) * Math.pow(view.s / wide, 0.22), list = [];
    for (const p of (pieces ||= o.pieces?.() || [])) {
      if ((p.band || 0) > b || (p.until ?? 9) < b) continue;
      const q = Array.isArray(p.at) ? p.at : world.provinces.get(p.at)?.label;
      if (!q) continue;
      list.push({ m: p.m, x: q[0] + (p.dx || 0) * k, y: q[1] + (p.dy || 0) * k, z: p.sea ? 0 : 1, s: k * (p.size || 1), t: p.turn || 0, rgb: p.owner ? rgbOf(o.colour?.(p.owner) || ownerColour(p.owner)) : p.rgb || null });
    }
    lit.meshes.set(list);
    return k;
  }
  /** One frame of the lit map. */
  function shine() {
    const d = Math.min(2, devicePixelRatio || 1), cw = canvas.clientWidth, ch = canvas.clientHeight, t = tilt(), [x0, y0] = at(0, 0), [x1, y1] = at(cw, ch);
    cam.set({ W: cw, H: ch, s: view.s, cx: view.x + cw / 2 / view.s, cy: view.y + ch / 2 / view.s, tilt: t, yaw: 0, q: 0 });
    const k = stage(), pad = k * 2;
    lit.meshes.cast([x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2], rise(), style.sun, k * 1.4);
    lit.ground.draw(cam, d, { style, rise: rise(), tint: o.tint?.() ?? 0.56, lamp: (u) => lit.meshes.lamp(u, true, style.sun) });
    lit.meshes.draw(cam, rise(), style);
  }

  // The whole map is painted into a hidden picture; moving and zooming slide and stretch that picture,
  // and the map is painted again once things are still.
  function paint() {
    const t0 = performance.now(), d = devicePixelRatio || 1, cw = base.width / d, ch = base.height / d, s = view.s, c = bctx;
    const sig = `${o.mine?.() || ""}:${o.wars?.() || ""}:${[...world.provinces.keys()].map((id) => o.owner(id)).join()}`;
    if (!layers || sig !== signature) { build(); signature = sig; pieces = null; }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, base.width, base.height);
    if (!lit) { c.fillStyle = "#16242b"; c.fillRect(0, 0, base.width, base.height); }
    lay(c, view, d);
    const [vx0, vy0] = at(0, 0), [vx1, vy1] = at(cw, ch), near = band();
    if (!lit) for (const [who, f] of layers.fills) {
      if (f.box[2] < vx0 || f.box[0] > vx1 || f.box[3] < vy0 || f.box[1] > vy1) continue;
      c.fillStyle = o.colour?.(who) || ownerColour(who); c.fill(f.path, "evenodd");
    }
    if (o.tint) for (const p of world.provinces.values()) { const t = !(p.box[2] < vx0 || p.box[0] > vx1 || p.box[3] < vy0 || p.box[1] > vy1) && o.tint(p.id); if (t) { c.fillStyle = t; c.fill(p.path, "evenodd"); } } // features hook: a map view may tint single provinces
    // province lines faint, lines between owners stronger, the coast dark
    c.lineJoin = "round"; c.lineCap = "round";
    if (lit ? near > 0 : s > 0.6) { c.strokeStyle = lit ? "rgba(30,24,18,.3)" : "rgba(255,244,214,.16)"; c.lineWidth = 0.8 / s; c.stroke(layers.inner); } // province hairlines come with the zoom
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
    if (lit) { c.strokeStyle = "rgba(24,18,14,.5)"; c.lineWidth = 3 / s; c.stroke(layers.outer); } // a firm border: ink under a pale line
    c.strokeStyle = lit ? "rgba(250,242,220,.86)" : "rgba(255,244,214,.7)"; c.lineWidth = (lit ? 1.2 : 1.4) / s; c.stroke(layers.outer);
    c.strokeStyle = "rgba(196,58,48,.95)"; c.lineWidth = 2.6 / s; c.setLineDash([5 / s, 3 / s]); c.stroke(layers.front); c.setLineDash([]);
    if (o.mine?.()) { c.strokeStyle = "#dfe5ec"; c.lineWidth = 2.2 / s; c.stroke(layers.mine); }
    labels(c, cw, ch, layers.owners);
    drawn = { ...view };
    canvas.dataset.paintMs = Math.round(performance.now() - t0); // how long a full paint takes, for checking on slow phones
  }

  function draw(now) {
    queued = false;
    const d = devicePixelRatio || 1, still = touches.size === 0 && performance.now() - settle > 140;
    if (!drawn || (still && (drawn.x !== view.x || drawn.y !== view.y || drawn.s !== view.s))) paint();
    else if (!still) { clearTimeout(later); later = setTimeout(redraw, 160); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (lit) {
      shine();
      // the first frames are timed: a device that drags gets the drawn map instead, and is remembered
      // (the quickest quarter of them is judged, so a busy moment on the page is not taken for a slow graphics card)
      if (timed && typeof now === "number") {
        timed.push(now);
        if (timed.length < 16 && !document.hidden) redraw();
        else { const gaps = timed.slice(4).map((v, i) => v - timed[i + 3]).sort((a, b) => a - b), slow = timed.length > 15 && gaps[gaps.length >> 2] > 30; timed = null; if (slow) { try { localStorage.setItem(FLAT, "slow"); } catch { /* timed again next time */ } dark(); return; } }
      }
    } else { ctx.fillStyle = "#16242b"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    // the picture, slid and stretched to where the view is now
    const [a0, e0, x0, y0] = frame(drawn, d), [a1, e1, x1, y1] = frame(view, d), kx = a1 / a0, ky = e1 / e0;
    ctx.setTransform(kx, 0, 0, ky, x1 - x0 * kx, y1 - y0 * ky);
    ctx.drawImage(base, 0, 0);
    const chosen = o.picked?.(), hit = chosen && world.provinces.get(chosen);
    if (hit) { const s = view.s; lay(ctx, view, d); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.6 / s; ctx.stroke(hit.path); }
  }

  // country names when far out, province names when close in; nothing printed over anything else
  function labels(ctx, cw, ch, owners) {
    const d = devicePixelRatio || 1, s = view.s, taken = [], near = band(), chosen = o.picked?.();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    const put = (text, mx, my, px, weight, sure) => {
      const [x, y] = spot(mx, my);
      if (x < -40 || y < -20 || x > cw + 40 || y > ch + 20) return false;
      ctx.font = `${weight} ${px}px Georgia, serif`;
      const w = ctx.measureText(text).width, box = [x - w / 2 - 3, y - px / 2 - 2, x + w / 2 + 3, y + px / 2 + 2];
      if (!sure && taken.some((b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) return false;
      taken.push(box);
      ctx.strokeStyle = "rgba(14,20,22,.85)"; ctx.lineWidth = 3; ctx.strokeText(text, x, y);
      ctx.fillStyle = "#f3ead2"; ctx.fillText(text, x, y);
      return true;
    };
    // the chosen province is always named; then countries by size; then provinces, as the zoom allows
    const hit = chosen && world.provinces.get(chosen);
    if (hit && near > 0) put(hit.name, hit.label[0], hit.label[1], 12, 600, true);
    const biggest = new Map();
    for (const p of world.provinces.values()) {
      const who = owners.get(p.id), [x0, y0, x1, y1] = p.box, a = (x1 - x0) * (y1 - y0), b = biggest.get(who);
      if (!b || a > b.a) biggest.set(who, { a, p });
    }
    let left = near ? 400 : 30; // the whole world names its thirty largest countries at most
    for (const [who, { a, p }] of [...biggest].sort((m, n) => n[1].a - m[1].a)) if (left > 0 && a * s * s > (near ? 700 : 1500) && put(o.name?.(who) || world.countries[who] || who, p.label[0], p.label[1], near > 1 ? 14 : 12, 600)) left--;
    if (near > 0) {
      const least = near > 1 ? 46 : 110; // a region names only its large provinces
      for (const p of world.provinces.values()) { const [x0, y0, x1, y1] = p.box; if ((x1 - x0) * s > least && (y1 - y0) * s > 14) put(p.name, p.label[0], p.label[1], 11, 500); }
    }
  }

  // a page out of sight may get no animation frames, so a timer stands in when none comes
  const redraw = () => { if (queued) return; queued = true; const run = (t) => { if (queued) draw(t); }; requestAnimationFrame(run); setTimeout(run, 250); };
  const zoom = (f, cx, cy) => { settle = performance.now(); const [mx, my] = at(cx, cy); view.s *= f; clamp(); view.x = view.y = 0; const [x0, y0] = at(cx, cy); view.x = mx - x0; view.y = my - y0; clamp(); redraw(); }; // the point under the finger stays under it, tilt and all
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
    view.x -= (p[0] - before[0]) / view.s; view.y -= (p[1] - before[1]) / view.s / Math.cos(tilt()); clamp(); redraw();
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
  light(); fit(); redraw();
  // the switch between the lit map and the flat one, where the page has one (it is hidden where the device cannot light the map)
  const sw = document.getElementById("relief"), mark = () => { if (sw) { sw.hidden = !canDraw(); sw.setAttribute("aria-pressed", String(!!lit)); sw.setAttribute("aria-label", lit ? "Relief map with pieces. Press for the flat map." : "Flat map. Press for the relief map with pieces."); } };
  if (sw) sw.onclick = () => { api.flat(!!lit); mark(); };
  mark();
  const api = {
    redraw,
    /** Show another world on the same canvas. */
    world(w) { world = w; pieces = null; layers = null; signature = ""; drawn = null; if (lit) shape(); fit(); redraw(); },
    /** The lit relief map, or the plain drawn one: the player's choice, kept. */
    get lit() { return !!lit; },
    flat(on) { try { if (on) localStorage.setItem(FLAT, "1"); else localStorage.removeItem(FLAT); } catch { /* this visit only */ } if (on) dark(); else { timed = null; light(); layers = null; signature = ""; drawn = null; redraw(); } },
    /** Paint again now: land has changed hands, so the picture is out of date. */
    refresh: () => { drawn = null; pieces = null; redraw(); },
    zoomBy: (f) => zoom(f, canvas.clientWidth / 2, canvas.clientHeight / 2),
    reset: () => { fit(); redraw(); },
    /** Centre on a province and zoom so it fills about a third of the screen. */
    show(id) {
      const p = world.provinces.get(id); if (!p) return;
      const [x0, y0, x1, y1] = p.box, cw = canvas.clientWidth, ch = canvas.clientHeight;
      view.s = Math.min(cw / (x1 - x0), ch / (y1 - y0)) / 3; clamp();
      view.x = (x0 + x1) / 2 - cw / 2 / view.s; view.y = (y0 + y1) / 2 - ch / 2 / view.s; clamp(); settle = 0; redraw();
    },
  };
  return api;
}
