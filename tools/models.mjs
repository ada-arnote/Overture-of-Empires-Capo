// SPDX-License-Identifier: AGPL-3.0-or-later
// Turns open sculpted models (glTF or GLB, CC0 or public domain only) into one small pack in our own format, offline.
// node tools/models.mjs <out.bin> <list.json>
// list.json: { "models": [{ "name": "horse", "file": "path/to/model.glb", "tris": 300, "size": 0.45, "turn": 0,
//   "owner": ["Material name", ...] }] }   name: the recipe it takes the place of (src/map/models.js); tris: about how many
//   triangles to keep; size: its widest half-width on the ground, in cell radii; owner: materials painted in the owner's enamel.
// Each model is turned upright for our table (z up, facing the player), stood on the ground, cut down by merging
// points on a grid until it is small enough, and recoloured to the nearest slot of the style's palette, so a pack keeps
// to one look and can be repainted by any style. Nothing from the source file is run; it is read as data.
// The pack: "CAPM", version 1, count; then per model: name, scale (float), points (16-bit), triangles (3 points, slot, finish).
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { STYLES } from "../src/map/style.js";

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

/** Every triangle of a glTF or GLB file, in its own space: [{ p: [[x, y, z] x 3], rgb, material }]. */
export function triangles(file) {
  const bytes = readFileSync(file), dir = path.dirname(file);
  let json, bin = null;
  if (bytes.readUInt32LE(0) === 0x46546c67) { // GLB: a JSON chunk, then a binary one
    const long = bytes.readUInt32LE(12);
    json = JSON.parse(bytes.subarray(20, 20 + long).toString("utf8"));
    if (20 + long < bytes.length) bin = bytes.subarray(28 + long, 28 + long + bytes.readUInt32LE(20 + long));
  } else json = JSON.parse(bytes.toString("utf8"));
  const data = (uri) => (uri.startsWith("data:") ? Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64") : readFileSync(path.join(dir, decodeURIComponent(uri))));
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

/** One model for the pack: upright, on the ground, the right size, cut down, in palette slots. */
export function shape(tris, { tris: want = 300, size = 0.45, turn = 0, owner = [] } = {}, pal = STYLES.war.pal) {
  const ct = Math.cos(turn), st = Math.sin(turn);
  // glTF has y up and faces +z; our table has z up and faces the player along +y: a turn, not a mirror
  let all = tris.map((t) => ({ ...t, p: t.p.map(([x, y, z]) => [-x * ct - z * st, -x * st + z * ct, y]) }));
  const pts = all.flatMap((t) => t.p), mid = [0, 1].map((k) => (Math.min(...pts.map((p) => p[k])) + Math.max(...pts.map((p) => p[k]))) / 2), low = Math.min(...pts.map((p) => p[2]));
  const wide = Math.max(...pts.map((p) => Math.max(Math.abs(p[0] - mid[0]), Math.abs(p[1] - mid[1])))) || 1, k = size / wide;
  all = all.map((t) => ({ ...t, p: t.p.map((p) => [(p[0] - mid[0]) * k, (p[1] - mid[1]) * k, (p[2] - low) * k]) }));
  const slot = (rgb) => pal.reduce((best, c, i) => { const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2; return d < best[1] ? [i, d] : best; }, [0, Infinity])[0];
  // merge points on a grid, coarser until few enough triangles are left
  let made = null;
  for (let cell = size / 400; ; cell *= 1.25) {
    const key = new Map(), points = [], faces = [], seen = new Set();
    const at = (p) => { const q = p.map((v) => Math.round(v / cell)), id = q.join(); if (!key.has(id)) { key.set(id, points.length); points.push(q.map((v) => v * cell)); } return key.get(id); };
    for (const t of all) {
      const [a, b, c] = t.p.map(at), id = [a, b, c].sort((x, y) => x - y).join();
      if (a === b || b === c || a === c || seen.has(id)) continue;
      seen.add(id);
      faces.push([a, b, c, slot(t.rgb), owner.includes(t.material) ? 1 : 0]);
    }
    made = { points, faces };
    if (faces.length <= want || cell > size) break;
  }
  return made;
}

/** The pack's bytes, from { name: { points, faces } }. */
export function pack(models) {
  const parts = [Buffer.from([0x43, 0x41, 0x50, 0x4d, 1, Object.keys(models).length])];
  for (const [name, m] of Object.entries(models)) {
    const far = Math.max(1e-6, ...m.points.flat().map(Math.abs)), scale = far / 32767, b = Buffer.alloc(1 + name.length + 8 + m.points.length * 6 + m.faces.length * 8);
    let at = b.writeUInt8(name.length, 0);
    at += b.write(name, at, "ascii");
    at = b.writeFloatLE(scale, at); at = b.writeUInt16LE(m.points.length, at); at = b.writeUInt16LE(m.faces.length, at);
    for (const p of m.points) for (const v of p) at = b.writeInt16LE(Math.round(v / scale), at);
    for (const [x, y, z, slot, fin] of m.faces) { at = b.writeUInt16LE(x, at); at = b.writeUInt16LE(y, at); at = b.writeUInt16LE(z, at); at = b.writeUInt8(slot, at); at = b.writeUInt8(fin, at); }
    parts.push(b);
  }
  return Buffer.concat(parts);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [out, list] = process.argv.slice(2);
  if (!out || !list) { console.log("node tools/models.mjs <out.bin> <list.json>"); process.exit(1); }
  const spec = JSON.parse(readFileSync(list, "utf8")), models = {};
  for (const m of spec.models) { models[m.name] = shape(triangles(path.resolve(path.dirname(list), m.file)), m); console.log(`${m.name}: ${models[m.name].faces.length} triangles, ${models[m.name].points.length} points`); }
  const bytes = pack(models);
  writeFileSync(out, bytes);
  console.log(`${out}: ${Object.keys(models).length} models, ${bytes.length} bytes`);
}
