// SPDX-License-Identifier: AGPL-3.0-or-later
// The real world's land cover and cities (ruling 157): the baked files are whole and small, the dressing stands what grows,
// and the real cities take the guessed ones' place on the real map only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Dressing } from "../src/map/dress.js";
import { mapPieces } from "../site/mappieces.js";

const root = new URL("../", import.meta.url), read = (f) => readFileSync(new URL(f, root));

function grid(n, size, per) {
  const provinces = new Map(), neighbours = new Map();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, id = `C${Math.floor(k / per)}-${k}`, x = i * size, y = j * size;
    provinces.set(id, { id, n: k, country: `C${Math.floor(k / per)}`, label: [x + size / 2, y + size / 2], box: [x, y, x + size, y + size], poly: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size]]], members: [id] });
    neighbours.set(id, []);
  }
  return { width: n * size, height: n * size, provinces, neighbours, coast: new Set(), sides: [], arcs: [], lakeRings: [] };
}

test("the baked files are small, whole, and every city stands in a province of the world file", () => {
  const cover = read("maps/cover.webp"), cities = JSON.parse(read("maps/cities.json")), world = JSON.parse(read("maps/world.json"));
  assert.equal(cover.subarray(0, 4).toString(), "RIFF"); assert.equal(cover.subarray(8, 12).toString(), "WEBP");
  assert.ok(cover.length < 200000, `cover.webp is ${cover.length} bytes`);
  assert.ok(read("maps/cities.json").length < 60000, "cities.json stays under 60 kB");
  const ids = new Set(world.provinces.map((p) => p.id)), country = new Map(world.provinces.map((p) => [p.id, p.country]));
  for (const [name, x, y, rank, at] of cities.cities) {
    assert.ok(name && typeof name === "string" && !/\s\s/.test(name), name);
    assert.ok(x >= 0 && x <= world.width * 10 && y >= 0 && y <= world.height * 10, name);
    assert.ok([0, 1, 2].includes(rank), name);
    assert.ok(ids.has(at), `${name} in ${at}`);
  }
  const capital = (n) => cities.cities.find((c) => c[0] === n);
  for (const [n, c] of [["Paris", "FRA"], ["Washington, D.C.", "USA"], ["Monaco", "MCO"], ["Vatican City", "VAT"], ["Kinshasa", "COD"], ["Brazzaville", "COG"]]) {
    assert.equal(capital(n)?.[3], 0, `${n} is a capital`); assert.equal(country.get(capital(n)[4]), c, `${n} stands in its own country`);
  }
  assert.ok(cities.cities.findIndex((c) => c[0] === "Pretoria") < cities.cities.findIndex((c) => c[0] === "Cape Town"), "a country's seat comes before its other capitals");
});

test("the dressing stands what grows where the real world says, and the heights still win in rough country", () => {
  const w = grid(4, 100, 16), k = new Uint8Array(16 * 16);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) k[j * 16 + i] = j < 8 ? (i < 8 ? 6 : 13) : i < 8 ? 9 : 0; // boreal, desert, flooded grass, nothing
  const d = new Dressing(w);
  d.cover({ w: 16, h: 16, k });
  const all = d.stand([0, 0, 400, 400], 3, 4, 5000, 40);
  assert.ok(all.length > 20);
  for (const s of all) {
    const want = s.y < 200 ? (s.x < 200 ? ["tree"] : ["dune"]) : s.x < 200 ? ["reeds"] : [];
    assert.ok(want.includes(s.m), `${s.m} at ${s.x},${s.y}`);
  }
  assert.deepEqual(new Dressing(w).stand([0, 0, 400, 400], 3, 4, 5000, 40), [], "no cover and no heights: nothing stands");
  const flat = { w: 16, h: 16, r: new Uint8Array(256).fill(100), a: new Uint8Array(256).fill(255) }, rough = { ...flat, r: flat.r.map((_, i) => (i % 2 ? 250 : 100)) };
  const hills = new Dressing(w); hills.relief(rough); hills.cover({ w: 16, h: 16, k: new Uint8Array(256).fill(13) });
  assert.ok(hills.stand([0, 0, 400, 400], 3, 4, 5000, 40).every((s) => s.m === "peak"), "peaks, not dunes, in the mountains");
  const t = new Dressing({ ...w, provinces: new Map([...w.provinces].map(([id, p]) => [id, { ...p, terrain: "marsh" }])) }); t.cover({ w: 16, h: 16, k: new Uint8Array(256).fill(13) });
  assert.ok(t.stand([0, 0, 400, 400], 3, 4, 5000, 40).every((s) => s.m === "reeds"), "an invented world keeps its own words");
});

test("real cities take the guessed ones' place: the keep in the capital, majors from the region band, the rest close in", () => {
  const w = grid(4, 100, 16), homes = new Map([["C0", { id: "C0-0", a: 1 }]]), owner = (id) => w.provinces.get(id).country;
  const cities = [{ name: "Capital", x: 250, y: 250, rank: 0, at: "C0-10" }, { name: "Port", x: 50, y: 350, rank: 1, at: "C0-12" }, { name: "Market", x: 350, y: 50, rank: 2, at: "C0-3" }];
  const a = mapPieces({ world: w, homes, owner, might: () => 2, cities });
  const keep = a.find((p) => p.m === "keep" && p.band === 0);
  assert.deepEqual(keep.at, [250, 250]); assert.equal(keep.name, "Capital");
  assert.deepEqual(a.filter((p) => p.m === "city").map((p) => [p.name, p.band]), [["Port", 1], ["Market", 2]]);
  assert.ok(!a.some((p) => p.m === "hamlet" && ["C0-10", "C0-12", "C0-3", "C0-0"].includes(p.at)), "no town where a city or the home stands");
  assert.equal(a.filter((p) => p.m === "hamlet").length, 12);
  const lost = mapPieces({ world: w, homes, owner: (id) => (id === "C0-10" ? "C9" : owner(id)), might: () => 2, cities });
  assert.equal(lost.find((p) => p.m === "keep").at, "C0-0", "a capital lost: the keep goes home");
  assert.ok(lost.some((p) => p.m === "city" && p.name === "Capital" && p.band === 0), "and the capital still stands, always");
  assert.ok(!mapPieces({ world: w, homes, owner, might: () => 2 }).some((p) => p.name), "without cities the guessed ones stand, unnamed");
});
