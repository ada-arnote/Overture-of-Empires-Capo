// SPDX-License-Identifier: AGPL-3.0-or-later
// The 3D layer's parts that run without a graphics card: the geometry kit, the recipes, styles as data, the model pack and its converter.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateRawSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { bake, box, ears, lathe, move, prism } from "../src/map/kit.js";
import { models, unpack } from "../src/map/models.js";
import { SLOT, STYLES } from "../src/map/style.js";
import { cleared, pack, png, records, shape, triangles, unzip } from "../tools/models.mjs";
import { ERAS, SORT, eraOf, figures } from "../src/map/figures.js";
import { SHELF } from "../src/map/shelf.js";
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

/** A zip of the given files, deflated, as a zip tool writes one: local entries, a central directory, its end. */
function zipOf(files) {
  const local = [], central = [];
  let at = 0;
  for (const [name, body] of Object.entries(files)) {
    const data = deflateRawSync(body), n = Buffer.from(name), head = Buffer.alloc(30), dir = Buffer.alloc(46);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(8, 8); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(body.length, 22); head.writeUInt16LE(n.length, 26);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(8, 10); dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(body.length, 24); dir.writeUInt16LE(n.length, 28); dir.writeUInt32LE(at, 42);
    local.push(head, n, data); central.push(dir, n); at += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(at, 16);
  return Buffer.concat([...local, cd, end]);
}

test("the converter reads a glTF inside a zip, keeps the painted wash as a shade, and refuses a model it may not ship or credit", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "capo-zip-"));
  try {
    const P = new Float32Array([0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), C = new Float32Array([0.8, 0.1, 0.1, 0.8, 0.1, 0.1, 0.8, 0.1, 0.1, 0.2, 0.02, 0.02, 0.2, 0.02, 0.02, 0.2, 0.02, 0.02]); // a bright red triangle and a dark one
    const bin = Buffer.concat([Buffer.from(P.buffer), Buffer.from(C.buffer)]);
    const gltf = { asset: { version: "2.0" }, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], buffers: [{ uri: "m.bin", byteLength: bin.length }], bufferViews: [{ buffer: 0, byteLength: 72 }, { buffer: 0, byteOffset: 72, byteLength: 72 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 6, type: "VEC3" }, { bufferView: 1, componentType: 5126, count: 6, type: "VEC3" }], meshes: [{ primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 } }] }] };
    writeFileSync(path.join(dir, "m.zip"), zipOf({ "model/scene.gltf": Buffer.from(JSON.stringify(gltf)), "model/m.bin": bin }));
    assert.deepEqual([...unzip(readFileSync(path.join(dir, "m.zip"))).keys()], ["model/scene.gltf", "model/m.bin"]);
    const tris = triangles(path.join(dir, "m.zip"));
    assert.equal(tris.length, 2);
    const m = shape(tris, { tall: 1, paint: [{ hue: [340, 20], sat: 0.4, slot: "cloth", fin: 1 }], base: 0.3 });
    const red = m.faces.filter((f) => f[4] === 1);
    assert.equal(red.length, 2, "both reds are the owner's enamel, by hue");
    assert.ok(Math.abs(red[0][5] - red[1][5]) > 40, "the lighter keeps a lighter shade than the darker");
    assert.ok(m.faces.some((f) => f[3] === SLOT.metal && f[4] === 2), "a metal base under it");
    const bytes = pack({ knight: m }), back = unpack(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)), v = new Uint8Array(back.knight.buf);
    assert.ok([...Array(back.knight.n).keys()].some((i) => v[i * 20 + 17] !== 128), "the page reads the shade back");
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const ok = { name: "a", licence: "CC-BY-4.0", credit: "line", title: "t", maker: "m", source: "s" };
  assert.equal(cleared(ok), ok);
  assert.throws(() => cleared({ ...ok, credit: "" }), /credit/);
  assert.throws(() => cleared({ ...ok, licence: "CC-BY-NC-4.0" }), /may not ship/);
  assert.equal(cleared({ name: "b", licence: "CC0-1.0" }).name, "b");
  const r = records([ok, { name: "b", licence: "CC0-1.0", title: "t", maker: "Q", source: "s" }], "file,title\nsite/models/old.bin,x\nsite/fonts/f.woff2,y\n", "# Notices\n", "2026-11-27");
  assert.ok(!r.credits.includes("old.bin") && r.credits.includes("site/fonts/f.woff2") && r.credits.includes("site/models/a.bin") && r.credits.includes("site/models/b.bin"));
  assert.ok(r.notices.includes("site/models/a.bin: line") && records([ok], "", r.notices, "x").notices.split("<!-- models").length === 2, "the notices block is written once, and replaced after");
});

test("sculpted pieces stand in by era and region, fetched once, only in a style that wears them; the recipes stay otherwise", async () => {
  assert.equal(eraOf(-50), "ancient"); assert.equal(eraOf(1200), "medieval"); assert.equal(eraOf(1700), "early"); assert.equal(eraOf(1900), "industrial"); assert.equal(eraOf(2026), "modern");
  for (const t of Object.values(ERAS)) for (const s of Object.values(t)) assert.ok(SORT[s], s);
  // era hook: Brass and Banners' five eras each stand a sculpted soldier, and the ancient gun is the ballista (ruling 154)
  for (const [e, foot] of Object.entries({ ancient: "legionary", medieval: "knight", early: "redcoat", industrial: "fusilier", modern: "marine" })) assert.ok(ERAS[e].foot === foot && SHELF[foot], `${e}: ${foot} on the shelf`);
  assert.ok(ERAS.ancient.gun === "ballista" && SHELF.ballista && ERAS.ancient.unit4 === "general", "the ancient gun and leader");
  assert.ok(!Object.values(ERAS).some((t) => Object.values(t).some((s) => /jaca/.test(s))), "no era stands a Jaca scan (ruling 150)");
  const war = { sculpt: ["figures", "ships", "buildings"] }, plain = { sculpt: [] }, asked = [], got = [];
  const one = pack({ cannon: { points: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [[0, 1, 2, 0, 2, 128]] } }), buf = one.buffer.slice(one.byteOffset, one.byteOffset + one.length);
  const f = figures("early", (file) => { asked.push(file); return Promise.resolve(buf); }, (m) => got.push(...Object.keys(m)));
  assert.equal(f.pick("gun", 0, plain, true), "gun"); assert.equal(asked.length, 0, "a style that keeps to its own set asks for nothing");
  assert.equal(f.pick("gun", 0, war, false), "gun"); assert.equal(asked.length, 0, "nothing is fetched until the board is in 3D");
  assert.equal(f.pick("tree", 0, war, true), "tree"); assert.equal(asked.length, 0, "a piece with no sculpted model keeps its recipe");
  if (SHELF.cannon) {
    assert.equal(f.pick("gun", 0, war, true), "gun", "the recipe stands while the model comes");
    f.pick("gun", 0, war, true);
    assert.deepEqual(asked, ["cannon.bin"], "fetched once");
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(got, ["cannon"]); assert.equal(f.pick("gun", 0, war, true), "cannon");
  }
  assert.equal(figures("early", null, () => {}).pick("gun", 0, war, true), "gun", "no shelf (a page opened by double-click): the recipes");
  const wanted = [], desert = figures("medieval", (file) => { wanted.push(file); return new Promise(() => {}); }, () => {});
  desert.pick("town", 4, war, true); desert.pick("town", 0, war, true);
  assert.deepEqual(wanted, [SHELF.adobe && "adobe.bin", SHELF.townhouse && "townhouse.bin"].filter(Boolean), "a town on sand is a desert house; elsewhere a town house");
});

test("the shelf ships only what it credits: every model has its file, CC BY ones a credit line without an outside address, and no Jaca scan is on it", () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), ".."), shelf = path.join(root, "site", "models");
  const credits = readFileSync(path.join(root, "CREDITS.csv"), "utf8"), notices = readFileSync(path.join(root, "NOTICES.md"), "utf8");
  for (const [name, m] of Object.entries(SHELF)) {
    assert.ok(existsSync(path.join(shelf, m.file)), m.file);
    assert.ok(credits.includes(`site/models/${m.file}`), `${m.file} in CREDITS.csv`);
    if (m.licence.startsWith("CC-BY")) { assert.ok(m.credit && !/https?:/.test(m.credit), `${name}: a credit line`); assert.ok(notices.includes(`site/models/${m.file}`), `${name} in NOTICES.md`); }
  }
  const files = existsSync(shelf) ? readdirSync(shelf) : [];
  assert.ok(!files.some((f) => /jaca/i.test(f)), "the Jaca scans wait for the museum's word (ruling 150)");
  assert.deepEqual(files.filter((f) => f.endsWith(".bin")).sort(), Object.values(SHELF).map((m) => m.file).sort(), "nothing on the shelf without its index entry");
});
