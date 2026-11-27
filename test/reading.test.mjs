// SPDX-License-Identifier: AGPL-3.0-or-later
// Reading the boards at a glance, the parts that run without a page: plates and names kept apart, links between hexes, the goods' symbols.
import test from "node:test";
import assert from "node:assert/strict";
import { GLYPHS, linkEnds, linkModels, stageLinks } from "../src/map/glyphs.js";
import { reach, spread } from "../src/map/labels.js";

const box = (x, y, w = 10, h = 6) => ({ x, y, l: w, r: w, t: h, b: h });
const hits = (a, b) => a.x - a.l < b.x + b.r && b.x - b.l < a.x + a.r && a.y - a.t < b.y + b.b && b.y - b.t < a.y + a.b;

test("crowded plates move aside until none covers another, and the first keeps its place", () => {
  const list = Array.from({ length: 9 }, (_, i) => box(200 + (i % 3) * 4, 200 + Math.floor(i / 3) * 3));
  spread(list, 600, 600);
  assert.deepEqual([list[0].x, list[0].y, list[0].moved], [200, 200, false]);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) assert.ok(!hits(list[i], list[j]), `plates ${i} and ${j} overlap`);
  assert.ok(list.slice(1).every((p) => p.moved && !p.out));
});

test("a name with no room is left out, never moved over another or off the screen", () => {
  const plates = [box(100, 100, 20, 10)], taken = spread(plates, 400, 400);
  const names = [{ ...box(100, 104, 30, 7), drop: true, spots: [[0, 0], [0, 50]] }, { ...box(100, 154, 30, 7), drop: true }, { ...box(398, 300, 30, 7), drop: true }];
  spread(names, 400, 400, taken);
  assert.deepEqual([names[0].out, names[0].y], [false, 154]); // its second place, over its piece
  assert.equal(names[1].out, true); // that place is now taken
  assert.equal(names[2].out, true); // it would run off the screen
});

test("a link runs from hex to hex, seats on one edge side by side, each half on its own hex", () => {
  const m = { R: 10, mid: [[0, 0], [17.32, 0]] }, a = linkEnds(m, 0, 1, 0, 2), b = linkEnds(m, 0, 1, 1, 2);
  assert.ok(Math.abs(a.l - 17.32) < 1e-9 && a.t === 0);
  assert.ok(a.y0 < 0 && b.y0 > 0 && Math.abs(a.y0 + b.y0) < 1e-9); // two lanes, either side of the line between the middles
  const out = [];
  stageLinks(out, { at: 0, joins: [{ to: 1, rgb: [1, 2, 3], lane: 0, of: 1 }] }, m, [{ top: 1 }, { top: 0.2 }]);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((o) => [o.m, o.z]), [["link", 1], ["link", 0.2]]);
  assert.ok(Math.abs(out[1].t - Math.PI) < 1e-9);
  assert.ok(linkModels().link.n > 0);
});

test("every good has its own symbol, and a place's size is counted from the picture", () => {
  assert.equal(GLYPHS.length, 4);
  assert.equal(new Set(GLYPHS.map((g) => g[0])).size, 4);
  const m = { mid: [[0, 0], [1, 1]], ids: new Uint16Array([1, 1, 1, 1, 2, 0, 0, 0, 0]) };
  assert.deepEqual(reach(m), [2, 1]);
});
