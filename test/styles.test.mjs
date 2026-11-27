// SPDX-License-Identifier: AGPL-3.0-or-later
// The style packs and seat colours (ruling 147): data only, worn by day or lamp, and held to the gate's checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SEATS, STYLES, darkBoard, seatSet, seatsOf, styleOf, wear } from "../src/map/style.js";
import { models } from "../src/map/models.js";
import { contrast, nearest, styleGate } from "../tools/check.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("six packs, War table the default; each lists only what differs and still has every key", () => {
  assert.deepEqual(Object.keys(STYLES), ["war", "campaign", "clear", "toys", "pewter", "modern"]);
  assert.equal(styleOf("nonsense"), STYLES.war);
  for (const s of Object.values(STYLES)) for (const k of Object.keys(STYLES.war.surface)) assert.ok(k in s.surface, `${s.name} ${k}`);
  assert.equal(STYLES.campaign.surface.hatch, 0.55); assert.equal(STYLES.campaign.surface.rim.length, 4); // its own value, and War table's for the rest
});

test("lamplight changes light and colour, never the models; Clear stays as it is", () => {
  const day = wear("war"), lamp = wear("war", "lamp");
  assert.equal(day, STYLES.war);
  assert.notDeepEqual(lamp.grade, day.grade); assert.ok(lamp.sun[2] < day.sun[2]); // a lower, warmer lamp
  assert.deepEqual(lamp.models, day.models); assert.equal(lamp.kit, day.kit);
  const clear = wear("clear", "lamp"); for (const k of ["sun", "amb", "grade", "table"]) assert.deepEqual(clear[k], STYLES.clear[k]);
  assert.ok(wear("modern", "lamp").table.baize[0] < STYLES.modern.table.baize[0]); // darker glass by lamplight
});

test("seat colours: Standard keeps each seat's choice; the sets put six on the seats, light ones on a dark board", () => {
  assert.equal(seatsOf("standard", "war"), null);
  assert.equal(seatSet(null, "war"), "standard"); assert.equal(seatSet(null, "modern"), "safe"); assert.equal(seatSet("contrast", "modern"), "contrast"); // until the player picks
  assert.ok(darkBoard(STYLES.modern) && !darkBoard(STYLES.war));
  assert.equal(seatsOf(null, "modern"), SEATS.safe.dark);
  assert.equal(seatsOf("contrast", "war"), SEATS.contrast.light); assert.equal(seatsOf("contrast", "modern"), SEATS.contrast.dark);
  const navy = [22, 26, 34]; // the black seat no longer vanishes on Modern command's board
  for (const [name, rgb] of seatsOf("contrast", "modern")) assert.ok(contrast(rgb, navy) >= 3, name);
});

test("a kit casts figures in metal with the owner's enamel on wider bases, made once a kit", () => {
  const plain = models(), cast = models({ base: 1.3, cast: 1 });
  assert.equal(models(), plain); assert.equal(models(STYLES.pewter.kit), cast); assert.notEqual(cast, plain);
  const reach = (m, fin) => { const f = new Float32Array(m.buf), b = new Uint8Array(m.buf); let r = 0; for (let i = 0; i < m.n; i++) if (b[i * 20 + 15] === fin) r = Math.max(r, Math.hypot(f[i * 5], f[i * 5 + 1])); return r; };
  assert.ok(Math.abs(reach(cast.foot, 1) - reach(plain.foot, 2) * 1.3) < 0.01, "the enamel base is 1.3 times the metal one");
  assert.ok(reach(cast.foot, 1) < 1 && reach(plain.foot, 1) < reach(plain.foot, 2)); // the plain soldier's enamel is its body, inside its base
});

test("the gate: every pack passes; a broken pack or a fading seat set is stopped", async () => {
  assert.deepEqual((await styleGate(root)).bad, []);
  assert.ok(contrast([0, 0, 0], [255, 255, 255]) > 20.9 && nearest([[0, 0, 0], [0, 0, 1], [255, 255, 255]], null)[2] === 1);
  const dir = mkdtempSync(path.join(tmpdir(), "capo-styles-"));
  try {
    cpSync(path.join(root, "src/map"), path.join(dir, "src/map"), { recursive: true });
    const f = path.join(dir, "src/map/style.js");
    writeFileSync(f, readFileSync(f, "utf8").replace(`seats: "safe",`, `seats: "nope", shine: 2,`).replace(`["White", [255, 255, 255]]`, `["Night", [30, 34, 40]]`).replace(`hill: "", peak: "" },\n    pal: [[72`, `hill: "", peak: "", foot: "robot" },\n    pal: [[72`));
    const bad = (await styleGate(dir)).bad.join("\n");
    for (const want of ["modern.seats: nope", "modern.shine: not a key", "High contrast seats", "foot to robot"]) assert.ok(bad.includes(want), want);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
