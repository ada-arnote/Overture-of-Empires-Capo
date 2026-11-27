// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo's lit map, the parts that run without a graphics card: its own models, cities and towns, strength pips, mission pins
// and threads, and the land's dressing close in.
import test from "node:test";
import assert from "node:assert/strict";
import { Dressing, capoModels } from "../src/map/dress.js";
import { SLOT } from "../src/map/style.js";
import { mapPieces, townsOf } from "../site/mappieces.js";

/** A small world of square provinces: n across and down, each `size` map units, in countries of `per` provinces. */
function grid(n, size, per, terrain = () => "") {
  const provinces = new Map(), neighbours = new Map();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, id = `C${Math.floor(k / per)}-${k}`, x = i * size, y = j * size;
    provinces.set(id, { id, n: k, country: `C${Math.floor(k / per)}`, label: [x + size / 2, y + size / 2], box: [x, y, x + size, y + size], poly: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size]]], members: [id], terrain: terrain(i, j) });
    neighbours.set(id, []);
  }
  return { width: n * size, height: n * size, provinces, neighbours, coast: new Set(), sides: [], arcs: [], lakeRings: [] };
}

test("Capo's own models are whole, small and painted only with the style's slots; pips go from one to ten", () => {
  const all = capoModels(), slots = Object.keys(SLOT).length;
  for (const want of ["agent", "dune", "reeds", "grass", "floe", "ridge", "hamlet", "pips1", "pips10", "fpips5"]) assert.ok(all[want], want);
  for (const [name, m] of Object.entries(all)) {
    const f = new Float32Array(m.buf), b = new Uint8Array(m.buf);
    assert.ok(m.n > 0 && m.n % 3 === 0 && m.n < 3000, name);
    for (let i = 0; i < m.n; i++) { assert.ok([0, 1, 2].every((k) => Number.isFinite(f[i * 5 + k]) && Math.abs(f[i * 5 + k]) < 1.2), name); assert.ok(b[i * 20 + 16] < slots, name); }
  }
  assert.ok(all.pips10.n > all.pips5.n && all.pips5.n > all.pips1.n, "more strength, more pips");
});

test("cities and towns come from the shapes alone: the smallest provinces are great cities, every other has a town", () => {
  const w = grid(4, 100, 16);
  const tiny = w.provinces.get("C0-5"); tiny.box = [100, 100, 120, 120]; // a city of its own, far smaller than its country's usual province
  const t = townsOf(w);
  assert.ok(t.great.has("C0-5"));
  assert.equal(t.great.size + t.cities.size + t.towns.length, 16);
  assert.equal(townsOf(w), t, "worked out once a world");
  const pieces = mapPieces({ world: w, homes: new Map([["C0", { id: "C0-0", a: 1 }]]), owner: (id) => w.provinces.get(id).country, might: () => 2 });
  assert.equal(pieces.filter((p) => p.m === "city" && p.band === 1).length, 1);
  assert.ok(pieces.filter((p) => p.m === "hamlet").every((p) => p.band === 2 && p.at !== "C0-0"), "no town where the capital stands");
  assert.ok(pieces.some((p) => p.m === "keep" && p.band === 0), "a capital always");
});

test("blocks carry strength pips from one to ten, and missions pin agents, targets and threads, read off the game", () => {
  const w = grid(4, 100, 4), homes = new Map(["C0", "C1", "C2", "C3"].map((c, k) => [c, { id: `${c}-${k * 4}`, a: 10 - k }]));
  const owner = (id) => w.provinces.get(id).country, might = (c) => ({ C0: 5, C1: 4, C2: 3, C3: 3 })[c];
  for (let i = 0; i < 4; i++) w.neighbours.set(`C0-${i}`, [`C1-${i + 4}`]), w.neighbours.set(`C1-${i + 4}`, [`C0-${i}`]);
  const text = "Send Heron to scout C2 (C2), quiet.";
  const g = { player: "C0", date: "2026-12-01", turn: 3, sends: [{ kind: "scout", target: "C2", who: "Heron", way: "quiet", text }, { kind: "sabotage", target: "C3", who: "Wren", way: "bold", text: "not ordered" }], actions: [text],
    roster: { Lantern: { st: "held", until: 9, by: "C1", n: [0, 0, 0, 1] }, Quill: { st: "held", until: 2, by: "C3" } }, intel: { C3: "2027-06-01", C1: "2026-01-01" }, sabot: {} };
  const args = { world: w, homes, owner, might, wars: [["C0", "C1"]], player: "C0", strength: (c) => ({ C0: 14, C1: 0 })[c] ?? might(c), g };
  const a = mapPieces(args);
  assert.deepEqual(a, mapPieces(args), "the same game, the same pieces");
  for (const p of a.filter((x) => ["army", "armour", "guns", "fleet"].includes(x.m))) assert.ok(p.pips >= 1 && p.pips <= 10);
  assert.equal(a.find((p) => p.m === "armour" && p.owner === "C0").pips, 10, "held to ten");
  assert.equal(a.find((p) => p.m === "army" && p.owner === "C1").pips, 1, "and to one");
  const pins = a.filter((p) => p.m === "pin");
  assert.deepEqual(pins.map((p) => p.at).sort(), ["C1-4", "C2-8", "C3-12"], "the ordered mission, the one held, the country scouted; not an unordered send, an old intel, or someone let go");
  assert.equal(a.filter((p) => p.m === "agent").length, 2, "someone sent, and someone held");
  assert.equal(a.threads.length, 2);
  assert.deepEqual(a.threads.map((t) => t[0]), [w.provinces.get("C0-0").label, w.provinces.get("C0-0").label], "threads run from home");
  assert.deepEqual(mapPieces({ ...args, g: null }).threads, []);
});

test("the dressing stands what the terrain says, only on land in view, the same every time, and keeps its spots as the map comes closer", () => {
  const w = grid(4, 100, 4, (i, j) => (j < 2 ? "forest" : i < 2 ? "mountain" : "plain"));
  w.lakeRings = [[[230, 30], [290, 30], [290, 90], [230, 90]]];
  const d = new Dressing(w), view = [0, 0, 400, 400];
  const a = d.stand(view, 3, 4, 5000, 40), b = new Dressing(w).stand(view, 3, 4, 5000, 40);
  assert.deepEqual(a, b);
  assert.ok(a.length > 20);
  for (const s of a) {
    assert.ok(s.x >= 0 && s.y >= 0 && s.x <= 400 && s.y <= 400);
    assert.ok(s.y < 200 ? ["tree", "oak"].includes(s.m) : s.x < 200 ? s.m === "peak" : s.m === "oak", `${s.m} at ${s.x},${s.y}`);
    assert.ok(!(s.x > 230 && s.x < 290 && s.y > 30 && s.y < 90), "nothing in a lake");
  }
  assert.ok(a.filter((s) => s.y < 200).length > a.filter((s) => s.y >= 200 && s.x >= 200).length * 3, "forest is thick, plain is sparse");
  assert.ok(d.stand(view, 3, 4, 7, 40).length <= 7, "the cap holds");
  assert.ok(d.stand([0, 0, 100, 100], 3, 4, 5000, 40).every((s) => s.x <= 100 && s.y <= 100), "only what is in view");
  assert.equal(d.stand(view, 3, 4, 5000, 40, { peak: "" }).filter((s) => s.m === "peak").length, 0, "a style that stands no peaks stands none");
  const near = new Set(d.stand(view, 6, 4, 5000, 40).map((s) => `${s.x},${s.y}`));
  assert.ok(a.filter((s) => s.s >= 4 * 0.3).every((s) => near.has(`${s.x},${s.y}`)), "closer in, every spot stays where it was");
  const sea = grid(2, 100, 4, () => "forest"); sea.provinces.delete("C0-3");
  assert.ok(new Dressing(sea).stand([0, 0, 200, 200], 3, 4, 5000, 40).every((s) => !(s.x > 100 && s.y > 100)), "nothing at sea");
});
