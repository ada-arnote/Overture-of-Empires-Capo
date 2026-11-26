// SPDX-License-Identifier: AGPL-3.0-or-later
// The 3D layer's parts that run without a graphics card: the geometry kit, the recipes, styles as data, the model pack and its converter.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { bake, box, ears, lathe, move, prism } from "../src/map/kit.js";
import { models, unpack } from "../src/map/models.js";
import { SLOT, STYLES } from "../src/map/style.js";
import { pack, png, shape, triangles } from "../tools/models.mjs";
import { mapPieces } from "../site/mappieces.js";

const area = (pts, t) => { let s = 0; for (let i = 0; i < t.length; i += 3) { const [a, b, c] = [pts[t[i]], pts[t[i + 1]], pts[t[i + 2]]]; s += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2; } return s; };

test("ear clipping covers an outline exactly, hollow corners and either way round", () => {
  const L = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [0, 3]]; // an L: area 6
  for (const pts of [L, L.slice().reverse()]) { const t = ears(pts); assert.equal(t.length, (pts.length - 2) * 3); assert.ok(Math.abs(area(pts, t) - 6) < 1e-9); }
  const star = Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 1 : 2.5, a = (i * Math.PI) / 5; return [Math.cos(a) * r, Math.sin(a) * r]; }), t = ears(star);
  assert.equal(t.length, 24);
  assert.deepEqual(ears([[0, 0], [1, 0], [0, 1]]), [0, 1, 2]);
});

test("the kit's shapes are whole triangles with unit facings, and a copy keeps them", () => {
  const v = lathe([], [[0.3, 0], [0.2, 0.5], [0, 0.8]], 8, [0, 128, 0], 2);
  box(v, -1, -1, 0, 1, 1, 1, [1, 128, 0]);
  prism(v, [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], 0, 1, [2, 128, 0], 1, 0.1);
  const w = move([], v, 3, 4, 5, 2, 1.1, 0.4);
  for (const s of [v, w]) {
    assert.equal(s.length % 30, 0);
    for (let i = 0; i < s.length; i += 10) { assert.ok(Math.abs(Math.hypot(s[i + 3], s[i + 4], s[i + 5]) - 1) < 1e-6); assert.ok(s.slice(i, i + 10).every(Number.isFinite)); }
  }
  assert.equal(bake(v).buf.byteLength, (v.length / 10) * 20);
});

test("every recipe makes a model that fits its cell, small enough to draw by the hundred, painted only with the style's slots", () => {
  const all = models(), names = Object.keys(all);
  assert.ok(names.length >= 40);
  for (const want of ["tree", "hill", "peak", "farm", "sheep", "hall", "depot", "town", "port", "castle", "foot", "horse", "gun", "ship", "banner", "die1", "die6", "token", "army", "armour", "guns", "fleet", "wing", "leader", "keep"]) assert.ok(all[want], want);
  let total = 0;
  for (const [name, m] of Object.entries(all)) {
    const f = new Float32Array(m.buf), b = new Uint8Array(m.buf);
    total += m.n / 3;
    assert.ok(m.n % 3 === 0 && m.n / 3 <= 1100, `${name}: ${m.n / 3} triangles`);
    for (let i = 0; i < m.n; i++) { assert.ok(Math.abs(f[i * 5]) <= 1.05 && Math.abs(f[i * 5 + 1]) <= 1.05 && f[i * 5 + 2] >= -1e-6 && f[i * 5 + 2] <= 1.4, `${name} stays in its cell`); assert.ok(b[i * 20 + 16] < 16 && b[i * 20 + 15] < 4, `${name} uses a slot and a finish`); }
  }
  assert.ok(total < 12000, `${total} triangles in all`);
});

test("a style is data: a palette of sixteen slots, four finishes, a lamp and a table, and nothing else is needed to add one", () => {
  for (const [name, s] of Object.entries(STYLES)) {
    assert.equal(s.pal.length, 16, name); assert.equal(s.fin.length, 4, name); assert.equal(s.sun.length, 3); assert.equal(s.amb.length, 3); assert.equal(s.tone.length, 2);
    assert.ok(s.pal.flat().every((v) => v >= 0 && v <= 255) && s.table.baize.length === 3 && s.table.rule.length === 3 && typeof s.pack === "string" && typeof s.set === "string");
  }
  assert.equal(new Set(Object.values(SLOT)).size, 16);
});

test("the converter reads a model file as data, stands it on our table, cuts it down and packs it; the page unpacks the same model", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "capo-models-"));
  try {
    // a cube two units wide, y up, in two materials; a 2 x 1 colour strip for the second one
    const P = [], I = [], UV = [];
    for (const [ax, s] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
      const u = (ax + 1) % 3, v = (ax + 2) % 3, at = P.length / 3;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = [0, 0, 0]; p[ax] = s; p[u] = a * s; p[v] = b; P.push(...p); UV.push(0.75, 0.5); }
      I.push(at, at + 1, at + 2, at, at + 2, at + 3);
    }
    const pos = Buffer.from(new Float32Array(P).buffer), uv = Buffer.from(new Float32Array(UV).buffer), idx = Buffer.from(new Uint16Array(I).buffer), bin = Buffer.concat([pos, uv, idx]);
    const crc = (buf) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
    const chunk = (name, body) => { const b = Buffer.alloc(12 + body.length); b.writeUInt32BE(body.length, 0); b.write(name, 4, "ascii"); body.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + body.length)), 8 + body.length); return b; };
    const head = Buffer.alloc(13); head.writeUInt32BE(2, 0); head.writeUInt32BE(1, 4); head[8] = 8; head[9] = 2;
    const strip = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(Buffer.from([1, 10, 20, 30, 34, 62, 32]))), chunk("IEND", Buffer.alloc(0))]); // filter 1: the second pixel is 44, 82, 62 (the pine slot)
    assert.deepEqual(png(strip).at(0.75, 0.5), [44, 82, 62]);
    writeFileSync(path.join(dir, "strip.png"), strip); writeFileSync(path.join(dir, "cube.bin"), bin);
    const gltf = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation: [5, 0, 0], scale: [2, 2, 2] }], buffers: [{ uri: "cube.bin", byteLength: bin.length }], images: [{ uri: "strip.png" }], textures: [{ source: 0 }],
      materials: [{ name: "Body", pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }, { name: "Leaf", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.length }, { buffer: 0, byteOffset: pos.length, byteLength: uv.length }, { buffer: 0, byteOffset: pos.length + uv.length, byteLength: 36 }, { buffer: 0, byteOffset: pos.length + uv.length + 36, byteLength: 36 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 24, type: "VEC3" }, { bufferView: 1, componentType: 5126, count: 24, type: "VEC2" }, { bufferView: 2, componentType: 5123, count: 18, type: "SCALAR" }, { bufferView: 3, componentType: 5123, count: 18, type: "SCALAR" }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }, { attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 3, material: 1 }] }] };
    writeFileSync(path.join(dir, "cube.gltf"), JSON.stringify(gltf));
    const tris = triangles(path.join(dir, "cube.gltf"));
    assert.equal(tris.length, 12);
    assert.ok(tris.every((t) => t.p.flat().every(Number.isFinite)) && Math.max(...tris.flatMap((t) => t.p.map((p) => p[0]))) === 7, "the node's move and scale are applied");
    const m = shape(tris, { size: 0.4, tris: 12, owner: ["Body"] });
    assert.equal(m.faces.length, 12); assert.equal(m.points.length, 8);
    assert.ok(Math.abs(Math.max(...m.points.map((p) => p[2])) - 0.8) < 1e-3 && Math.abs(Math.min(...m.points.map((p) => p[2]))) < 1e-9, "it stands on the ground, as tall as it is wide");
    assert.deepEqual([...new Set(m.faces.map((f) => `${f[3]}/${f[4]}`))].sort(), [`${SLOT.pine}/0`, `${SLOT.roof}/1`].sort()); // red goes to the nearest slot, in the owner's enamel; the strip's colour to pine
    const bytes = pack({ horse: m, tree: m }), back = unpack(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
    assert.deepEqual(Object.keys(back), ["horse", "tree"]);
    assert.equal(back.horse.n, 36);
    const f = new Float32Array(back.horse.buf);
    assert.ok(Math.abs(Math.max(...Array.from({ length: 36 }, (_, i) => f[i * 5])) - 0.4) < 1e-3);
    assert.throws(() => unpack(new ArrayBuffer(8)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Capo's pieces are read off the state the same way every time: capitals, blocks for the strong, a fleet off the coast, a front for a war", () => {
  const P = (id, country, x, y) => [id, { id, country, label: [x, y] }];
  const world = { provinces: new Map([P("A-1", "A", 10, 10), P("A-2", "A", 20, 10), P("B-1", "B", 30, 10), P("C-1", "C", 60, 10)]), neighbours: new Map([["A-1", ["A-2"]], ["A-2", ["A-1", "B-1"]], ["B-1", ["A-2"]], ["C-1", []]]), coast: new Set(["A-1"]), sides: [["A-1"], ["A-2", "B-1"]], arcs: [[[5, 5], [5, 10], [5, 15]], [[25, 5], [25, 15]]] };
  const homes = new Map([["A", { id: "A-1", a: 9 }], ["B", { id: "B-1", a: 4 }], ["C", { id: "C-1", a: 1 }]]), owner = (id) => (id === "C-1" ? "A" : world.provinces.get(id).country), might = (c) => ({ A: 5, B: 3 })[c] || 1;
  const args = { world, homes, owner, might, wars: [["A", "B"]], player: "A", staff: 2 }, a = mapPieces(args), b = mapPieces(args);
  assert.deepEqual(a, b);
  const count = (m) => a.filter((p) => p.m === m).length;
  assert.equal(count("keep"), 2, "a fallen home has no capital");
  assert.equal(count("fleet"), 1); assert.ok(a.find((p) => p.m === "fleet").at[0] < 5, "the fleet lies out to sea, away from the land");
  assert.equal(count("wing"), 1); assert.equal(count("guns"), 2); assert.equal(count("leader"), 2);
  assert.ok(a.some((p) => p.m === "armour" && p.at === "A-2") && a.some((p) => p.m === "army" && p.at === "B-1"), "blocks face each other across the front");
  assert.ok(a.every((p) => (p.band || 0) <= 2));
});
