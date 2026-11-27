// SPDX-License-Identifier: AGPL-3.0-or-later
// Turns open sculpted models into small files in our own format, offline: CC0, public domain, or CC BY with its credit line.
// node tools/models.mjs <shelf dir> <list.json> [--from dir] [--held dir] [--index src/map/shelf.js] [--records]
// list.json: { "models": [{ "name": "knight", "file": "cut/knight.glb", "licence": "CC-BY-4.0", "credit": "...", "title", "maker", "source",
//   "tris": 2500, "tall": 0.74 or "size": 0.45, "turn": 0, "base": 0.3, "slots": ["metal", ...], "paint": [{ "near": [r, g, b], "within": 40,
//   "slot": "cloth", "fin": 1 }], "owner": ["Material name"], "baseFin": 2, "hold": "why it may not ship yet" }] }
//   file: GLB, glTF, or a zip holding a glTF (read in place). Sculpted sources are first cut down in Blender by tools/blend.py (decimated,
//   the painted texture sampled to one colour a triangle), which this tool then reads; a file small enough is read straight.
//   tris: about how many triangles to keep; tall: its height in cell radii, or size: its widest half-width; turn: radians about the
//   upright; base: a metal base of that radius under it, as on our own figures; slots: the palette slots it may be painted in;
//   paint: rules that give a slot and finish, the first that matches wins (fin 1 is the owner's enamel); a rule may test the material,
//   a colour ("near", "within"), a hue band in degrees ("hue": [340, 20]), colour strength ("sat"), lightness ("light": [0, 0.5]),
//   facing up ("up": 0.9, flat roofs) and height ("above", "below": shares of the model's height); baseFin: the base's finish (1 shows the owner on a pewter figure);
//   hold: converted for review, written only to --held, never to the shelf.
// Each model is turned upright for our table (z up, facing the player), stood on the ground, cut down further by merging points on a
// grid if still too large, and recoloured to the nearest slot of the style's palette with a shade, so the painted detail stays as a
// wash and any style can repaint it. Nothing from a source file is run; it is read as data.
// A file: "CAPM", version 2, a count; then per model: name, scale (float), points (16-bit), triangles (3 points, slot, finish, shade).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync, inflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SLOT, STYLES } from "../src/map/style.js";
import { lathe } from "../src/map/kit.js";

/** Licences a model may ship under (ruling 146): CC BY needs a credit line players can reach. */
export const MODEL_LICENCES = ["CC0-1.0", "public domain", "CC-BY-4.0", "CC-BY-3.0"];
const BY = (l) => l.startsWith("CC-BY");

/** A PNG's pixels as rows of [r, g, b]: 8-bit, not interlaced (what model packs use for their colour strips). */
export function png(bytes) {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), parts = [];
  let at = 8, w = 0, h = 0, kind = 0, pal = null;
  while (at < bytes.length) {
    const long = d.getUint32(at), name = String.fromCharCode(...bytes.subarray(at + 4, at + 8)), body = bytes.subarray(at + 8, at + 8 + long);
    if (name === "IHDR") { w = d.getUint32(at + 8); h = d.getUint32(at + 12); kind = body[9]; if (body[8] !== 8 || body[12]) throw new Error("only 8-bit PNGs that are not interlaced"); }
    else if (name === "PLTE") pal = body; else if (name === "IDAT") parts.push(body);
    at += 12 + long;
  }
  const n = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[kind], raw = inflateSync(Buffer.concat(parts)), line = w * n, out = new Uint8Array(h * line);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (line + 1)];
    for (let x = 0; x < line; x++) {
      const a = x >= n ? out[y * line + x - n] : 0, b = y ? out[(y - 1) * line + x] : 0, c = x >= n && y ? out[(y - 1) * line + x - n] : 0, p = a + b - c;
      const guess = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c) : 0;
      out[y * line + x] = (raw[y * (line + 1) + 1 + x] + guess) & 255;
    }
  }
  const px = (x, y) => { const o = y * line + x * n; return kind === 3 ? [pal[out[o] * 3], pal[out[o] * 3 + 1], pal[out[o] * 3 + 2]] : n < 3 ? [out[o], out[o], out[o]] : [out[o], out[o + 1], out[o + 2]]; };
  return { w, h, at: (u, v) => px(Math.min(w - 1, Math.max(0, Math.floor((u - Math.floor(u)) * w))), Math.min(h - 1, Math.max(0, Math.floor((v - Math.floor(v)) * h)))) };
}

/** The files in a zip, by name, unpacked in memory (stored or deflated entries; read from the central directory). */
export function unzip(bytes) {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("not a zip");
  const out = new Map();
  for (let k = 0, at = bytes.readUInt32LE(end + 16); k < bytes.readUInt16LE(end + 10); k++) {
    const how = bytes.readUInt16LE(at + 10), size = bytes.readUInt32LE(at + 20), nl = bytes.readUInt16LE(at + 28), el = bytes.readUInt16LE(at + 30), cl = bytes.readUInt16LE(at + 32), head = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nl).toString("utf8"), from = head + 30 + bytes.readUInt16LE(head + 26) + bytes.readUInt16LE(head + 28), body = bytes.subarray(from, from + size);
    if (!name.endsWith("/")) out.set(name, how === 8 ? inflateRawSync(body) : body);
    at += 46 + nl + el + cl;
  }
  return out;
}

/** Every triangle of a glTF or GLB file (or a zip holding one), in its own space: [{ p: [[x, y, z] x 3], rgb, material }]. */
export function triangles(file) {
  let bytes = readFileSync(file), dir = path.dirname(file), near = (uri) => readFileSync(path.join(dir, decodeURIComponent(uri)));
  if (file.toLowerCase().endsWith(".zip")) {
    const all = unzip(bytes), main = [...all.keys()].find((k) => /\.(gltf|glb)$/i.test(k));
    if (!main) throw new Error(`${file}: no glTF inside`);
    const base = path.posix.dirname(main);
    bytes = all.get(main); near = (uri) => all.get(path.posix.join(base, decodeURIComponent(uri))) ?? (() => { throw new Error(`${file}: ${uri} is not in the zip`); })();
  }
  let json, bin = null;
  if (bytes.readUInt32LE(0) === 0x46546c67) { // GLB: a JSON chunk, then a binary one
    const long = bytes.readUInt32LE(12);
    json = JSON.parse(bytes.subarray(20, 20 + long).toString("utf8"));
    if (20 + long < bytes.length) bin = bytes.subarray(28 + long, 28 + long + bytes.readUInt32LE(20 + long));
  } else json = JSON.parse(bytes.toString("utf8"));
  const data = (uri) => (uri.startsWith("data:") ? Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64") : near(uri));
  const buffers = (json.buffers || []).map((b) => (b.uri ? data(b.uri) : bin));
  const read = (k) => {
    const a = json.accessors[k], v = json.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type], buf = buffers[v.buffer];
    const [size, get] = { 5120: [1, "readInt8"], 5121: [1, "readUInt8"], 5122: [2, "readInt16LE"], 5123: [2, "readUInt16LE"], 5125: [4, "readUInt32LE"], 5126: [4, "readFloatLE"] }[a.componentType];
    const step = v.byteStride || size * n, from = (v.byteOffset || 0) + (a.byteOffset || 0), top = a.normalized ? { 5121: 255, 5123: 65535 }[a.componentType] || 1 : 1;
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: n }, (_, j) => buf[get](from + i * step + j * size) / top));
  };
  const images = (json.images || []).map((im) => { try { return png(im.uri ? data(im.uri) : buffers[json.bufferViews[im.bufferView].buffer].subarray(json.bufferViews[im.bufferView].byteOffset || 0, (json.bufferViews[im.bufferView].byteOffset || 0) + json.bufferViews[im.bufferView].byteLength)); } catch { return null; } });
  const mul = (a, b) => { const o = Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
  const local = (n) => {
    if (n.matrix) return n.matrix;
    const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
    return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
  };
  const out = [];
  const walk = (k, m) => {
    const node = json.nodes[k], here = mul(m, local(node));
    for (const prim of node.mesh === undefined ? [] : json.meshes[node.mesh].primitives) {
      if ((prim.mode ?? 4) !== 4 || prim.attributes.POSITION === undefined) continue;
      const pos = read(prim.attributes.POSITION).map(([x, y, z]) => [here[0] * x + here[4] * y + here[8] * z + here[12], here[1] * x + here[5] * y + here[9] * z + here[13], here[2] * x + here[6] * y + here[10] * z + here[14]]);
      const idx = prim.indices === undefined ? pos.map((_, i) => i) : read(prim.indices).map((v) => v[0]), mat = json.materials?.[prim.material] || {}, pbr = mat.pbrMetallicRoughness || {};
      const uv = prim.attributes.TEXCOORD_0 === undefined ? null : read(prim.attributes.TEXCOORD_0), tint = prim.attributes.COLOR_0 === undefined ? null : read(prim.attributes.COLOR_0);
      const img = pbr.baseColorTexture ? images[json.textures[pbr.baseColorTexture.index].source] : null, flat = (pbr.baseColorFactor || [1, 1, 1]).slice(0, 3).map((v) => Math.round(255 * Math.pow(v, 1 / 2.2)));
      for (let i = 0; i + 2 < idx.length; i += 3) {
        const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
        const rgb = img && uv ? img.at((uv[a][0] + uv[b][0] + uv[c][0]) / 3, (uv[a][1] + uv[b][1] + uv[c][1]) / 3) : tint ? [0, 1, 2].map((j) => Math.round(255 * Math.pow((tint[a][j] + tint[b][j] + tint[c][j]) / 3, 1 / 2.2))) : flat;
        out.push({ p: [pos[a], pos[b], pos[c]], rgb, material: mat.name || "" });
      }
    }
    for (const c of node.children || []) walk(c, here);
  };
  for (const k of json.scenes?.[json.scene || 0]?.nodes || json.nodes.map((_, i) => i)) walk(k, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return out;
}

/** A colour as lightness and two colour axes (CIE Lab, near enough), to find the nearest slot by hue more than by how light it is. */
function lab([r, g, b]) {
  const l = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }, [R, G, B] = [l(r), l(g), l(b)];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116), X = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.9505), Y = f(0.2126 * R + 0.7152 * G + 0.0722 * B), Z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.089);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
const bright = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b + 1;
const METAL = new Set([SLOT.metal, SLOT.iron, SLOT.gold]);

/** One model for the shelf: upright, on the ground, the right size, cut down, in palette slots with a shade. */
export function shape(tris, { tris: want = 300, size = 0.45, tall = 0, turn = 0, owner = [], slots = null, paint = [], base = 0, baseFin = 2 } = {}, pal = STYLES.war.pal) {
  const ct = Math.cos(turn), st = Math.sin(turn);
  // glTF has y up and faces +z; our table has z up and faces the player along +y: a turn, not a mirror
  let all = tris.map((t) => ({ ...t, p: t.p.map(([x, y, z]) => [-x * ct - z * st, -x * st + z * ct, y]) }));
  const pts = all.flatMap((t) => t.p), lo = [0, 1, 2].map((k) => pts.reduce((m, p) => Math.min(m, p[k]), Infinity)), hi = [0, 1, 2].map((k) => pts.reduce((m, p) => Math.max(m, p[k]), -Infinity));
  const mid = [0, 1].map((k) => (lo[k] + hi[k]) / 2), wide = Math.max(hi[0] - mid[0], hi[1] - mid[1]) || 1, k = tall ? tall / (hi[2] - lo[2] || 1) : size / wide, lift = base ? base * 0.22 : 0;
  all = all.map((t) => ({ ...t, p: t.p.map((p) => [(p[0] - mid[0]) * k, (p[1] - mid[1]) * k, (p[2] - lo[2]) * k + lift]) }));
  const allowed = (slots || Object.keys(SLOT)).map((n) => SLOT[n]), seen = new Map();
  const slot = (rgb) => {
    const id = rgb.join();
    if (!seen.has(id)) { const q = lab(rgb); seen.set(id, allowed.reduce((best, i) => { const c = lab(pal[i]), d = 0.35 * (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2; return d < best[1] ? [i, d] : best; }, [allowed[0], Infinity])[0]); }
    return seen.get(id);
  };
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const hsv = ([r, g, b]) => { const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m, h = !d ? 0 : M === r ? ((g - b) / d + 6) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, M ? d / M : 0, M / 255]; };
  const between = (v, [a, b]) => (a <= b ? v >= a && v <= b : v >= a || v <= b); // a hue range may wrap past 360
  const up = (t) => { const [a, b, c] = t.p, u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; return n[2] / (Math.hypot(...n) || 1); };
  /** Whether a paint rule takes a triangle: every test it names must hold (material, near a colour, a hue band, how strong a colour, how light, facing up, how high). */
  const top = (hi[2] - lo[2]) * k; // the model's own height, for rules by height
  const takes = (r, t) => (!r.material || t.material.includes(r.material)) && (!r.near || near(r.near, t.rgb) <= (r.within ?? 40)) && (!r.hue || between(hsv(t.rgb)[0], r.hue)) && (!r.sat || hsv(t.rgb)[1] >= r.sat) && (!r.light || between(hsv(t.rgb)[2], r.light)) && (!r.up || up(t) >= r.up) && (r.above === undefined || Math.min(...t.p.map((p) => p[2])) >= lift + r.above * top) && (r.below === undefined || Math.max(...t.p.map((p) => p[2])) <= lift + r.below * top);
  // which slot and finish: a paint rule first, then the owner's materials, then the nearest slot (metal slots shine)
  const look = (t) => {
    for (const r of paint) if (takes(r, t)) return [SLOT[r.slot] ?? slot(t.rgb), r.fin ?? (METAL.has(SLOT[r.slot]) ? 2 : 0)];
    if (owner.includes(t.material)) return [slot(t.rgb), 1];
    const s = slot(t.rgb);
    return [s, METAL.has(s) ? 2 : 0];
  };
  const looks = all.map(look), mean = new Map();
  for (let i = 0; i < all.length; i++) { const id = looks[i].join(), m = mean.get(id) || [0, 0]; m[0] += bright(all[i].rgb); m[1]++; mean.set(id, m); }
  // the shade keeps the painted light and dark as a wash, against the average of the same slot and finish on this model:
  // the palette sets the tone, the sculptor's paint the detail
  const shade = (t, l) => { const [sum, n] = mean.get(l.join()); return Math.round(Math.max(48, Math.min(220, 128 * Math.pow(bright(t.rgb) / (sum / n), 0.7)))); };
  const painted = all.map((t, i) => ({ p: t.p, s: looks[i][0], f: looks[i][1], h: shade(t, looks[i]) }));
  if (base) { // our own metal base, as under the figures made in code
    const v = lathe([], [[base, 0], [base * 1.04, lift * 0.25], [base * 1.04, lift * 0.65], [base * 0.9, lift], [0, lift]], 14, [SLOT.metal, 128, 0], baseFin);
    for (let i = 0; i < v.length; i += 30) painted.push({ p: [0, 10, 20].map((o) => v.slice(i + o, i + o + 3)), s: SLOT.metal, f: baseFin, h: 128 });
  }
  // merge points on a grid, coarser until few enough triangles are left
  let made = null;
  for (let cell = (tall || size) / 400; ; cell *= 1.25) {
    const key = new Map(), points = [], faces = [], done = new Set();
    const at = (p) => { const q = p.map((v) => Math.round(v / cell)), id = q.join(); if (!key.has(id)) { key.set(id, points.length); points.push(q.map((v) => v * cell)); } return key.get(id); };
    for (const t of painted) {
      const [a, b, c] = t.p.map(at), id = [a, b, c].sort((x, y) => x - y).join();
      if (a === b || b === c || a === c || done.has(id)) continue;
      done.add(id);
      faces.push([a, b, c, t.s, t.f, t.h]);
    }
    made = { points, faces };
    if (faces.length <= want || cell > (tall || size)) break;
  }
  return made;
}

/** A file's bytes, from { name: { points, faces } }. */
export function pack(models) {
  const parts = [Buffer.from([0x43, 0x41, 0x50, 0x4d, 2, Object.keys(models).length])];
  for (const [name, m] of Object.entries(models)) {
    const far = Math.max(1e-6, ...m.points.flat().map(Math.abs)), scale = far / 32767, b = Buffer.alloc(1 + name.length + 8 + m.points.length * 6 + m.faces.length * 9);
    let at = b.writeUInt8(name.length, 0);
    at += b.write(name, at, "ascii");
    at = b.writeFloatLE(scale, at); at = b.writeUInt16LE(m.points.length, at); at = b.writeUInt16LE(m.faces.length, at);
    for (const p of m.points) for (const v of p) at = b.writeInt16LE(Math.round(v / scale), at);
    for (const [x, y, z, slot, fin, shade = 128] of m.faces) { at = b.writeUInt16LE(x, at); at = b.writeUInt16LE(y, at); at = b.writeUInt16LE(z, at); at = b.writeUInt8(slot, at); at = b.writeUInt8(fin, at); at = b.writeUInt8(shade, at); }
    parts.push(b);
  }
  return Buffer.concat(parts);
}

/** The licence and credit a model needs before it is converted at all: refused if it may not ship, or is CC BY with no credit line. */
export function cleared(m) {
  if (!MODEL_LICENCES.includes(m.licence)) throw new Error(`${m.name}: licence "${m.licence}" may not ship (only ${MODEL_LICENCES.join(", ")})`);
  if (BY(m.licence) && !(m.credit && m.title && m.maker && m.source)) throw new Error(`${m.name}: CC BY needs a credit line, a title, a maker and a source`);
  return m;
}

/** The shelf's index, as a module the pages read: which file holds each model, and the credit players can reach. */
export function index(list, sizes) {
  const rows = list.map((m) => `  ${m.name}: { file: "${m.name}.bin", tris: ${sizes[m.name]}, licence: "${m.licence}"${m.credit ? `, credit: ${JSON.stringify(m.credit)}` : ""} },`);
  return `// SPDX-License-Identifier: AGPL-3.0-or-later\n// Made by tools/models.mjs from tools/figures.json; do not edit by hand. The sculpted models on the shelf (site/models/), each\n// fetched only when a board in 3D shows it, with its licence and the credit line the credits panel shows players.\nexport const SHELF = {\n${rows.join("\n")}\n};\n`;
}

/** The records for the shelf: a CREDITS.csv row a file, and the NOTICES.md lines between its two model marks. */
export function records(list, credits, notices, date) {
  const q = (v) => (/[",]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  const rows = credits.split(/\r?\n/).filter((l) => l && !l.startsWith("site/models/"));
  for (const m of list) rows.push([`site/models/${m.name}.bin`, m.title, m.maker, m.licence, m.source, date, m.changes || "cut down to its triangle budget, painted in the board's palette slots with its own paint kept as a wash, re-encoded in our own format by tools/models.mjs"].map(q).join(","));
  const by = list.filter((m) => BY(m.licence)), free = list.filter((m) => !BY(m.licence));
  const lines = ["<!-- models: written by tools/models.mjs -->", "Sculpted pieces in site/models/, fetched only when a board in 3D shows them. Each is cut down, repainted in the board's palette and re-encoded by tools/models.mjs; the credits are also in every game's About.", "", ...by.map((m) => `- site/models/${m.name}.bin: ${m.credit.replace(/\(sketchfab\.com/, "(https://sketchfab.com")} Licence: https://creativecommons.org/licenses/by/4.0/`), ...(free.length ? ["", `CC0 models, no credit needed, thanked all the same: ${[...new Set(free.map((m) => m.maker))].join(" and ")} (${free.map((m) => `site/models/${m.name}.bin`).join(", ")}).`] : []), "<!-- end of models -->"];
  const at = notices.indexOf("<!-- models"), end = notices.indexOf("<!-- end of models -->");
  const text = at >= 0 ? notices.slice(0, at) + lines.join("\n") + notices.slice(end + "<!-- end of models -->".length) : `${notices.trimEnd()}\n\n${lines.join("\n")}\n`;
  return { credits: rows.join("\n") + "\n", notices: text };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [out, list, ...rest] = process.argv.slice(2), opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : ""; };
  if (!out || !list) { console.log("node tools/models.mjs <shelf dir> <list.json> [--from dir] [--held dir] [--index src/map/shelf.js]"); process.exit(1); }
  const spec = JSON.parse(readFileSync(list, "utf8")), from = opt("--from") || path.dirname(list), held = opt("--held"), sizes = {}, shipped = [];
  for (const m of spec.models.map(cleared)) {
    const model = shape(triangles(path.resolve(from, m.file)), m), bytes = pack({ [m.name]: model }), dir = m.hold ? held : out;
    sizes[m.name] = model.faces.length;
    console.log(`${m.name}: ${model.faces.length} triangles, ${model.points.length} points, ${bytes.length} bytes${m.hold ? ` (held: ${m.hold})` : ""}`);
    if (!dir) continue;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${m.name}.bin`), bytes);
    if (!m.hold) shipped.push(m);
  }
  if (opt("--index")) { writeFileSync(opt("--index"), index(shipped, sizes)); console.log(`${opt("--index")}: ${shipped.length} models`); }
  if (rest.includes("--records")) { // CREDITS.csv and NOTICES.md beside this tool's folder
    const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))), r = records(shipped, readFileSync(path.join(root, "CREDITS.csv"), "utf8"), readFileSync(path.join(root, "NOTICES.md"), "utf8"), spec.date || new Date().toISOString().slice(0, 10));
    writeFileSync(path.join(root, "CREDITS.csv"), r.credits); writeFileSync(path.join(root, "NOTICES.md"), r.notices); console.log("CREDITS.csv and NOTICES.md: the shelf's records written");
  }
}
