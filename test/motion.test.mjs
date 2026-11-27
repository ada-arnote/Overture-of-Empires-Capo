// SPDX-License-Identifier: AGPL-3.0-or-later
// The cues the table games make, by game and event: plain choices, tested without a page.
import test from "node:test";
import assert from "node:assert/strict";
import { CUES, cuesOf } from "../site/sound.js";

const names = (list) => list.map(([n]) => n);

test("Banners: a fight rolls dice, a take is a capture when the army arrives, a move marches, a fort builds", () => {
  assert.deepEqual(names(cuesOf("banners", [{ kind: "fight" }, { kind: "take" }])), ["dice", "capture"]);
  assert.ok(cuesOf("banners", [{ kind: "fight" }, { kind: "take" }])[1][1] > 0.5);
  assert.deepEqual(names(cuesOf("banners", [{ kind: "move" }])), ["march"]);
  assert.deepEqual(names(cuesOf("banners", [{ kind: "occupy" }])), ["march"]);
  assert.deepEqual(names(cuesOf("banners", [{ kind: "fort" }])), ["build"]);
  assert.deepEqual(names(cuesOf("banners", [{ kind: "place" }])), []);
});

test("Fable: a move marches, taking a rival's hex is a capture, claiming empty land is not; forts and farms build", () => {
  assert.deepEqual(names(cuesOf("fable", [{ kind: "take", was: 1 }], { do: "move" })), ["march", "capture"]);
  assert.deepEqual(names(cuesOf("fable", [{ kind: "take", was: -1 }], { do: "move" })), ["march"]);
  assert.deepEqual(names(cuesOf("fable", [{ kind: "farm" }], { do: "farm" })), ["build"]);
});

test("Glass: a roll is dice and every kind of building builds", () => {
  assert.deepEqual(names(cuesOf("glass", [{ kind: "roll" }, { kind: "harvest" }])), ["dice"]);
  for (const kind of ["depot", "town", "harbour", "route"]) assert.deepEqual(names(cuesOf("glass", [{ kind }])), ["build"]);
});

test("Inch in real time: the five cues are the player's own, and the end speaks for itself", () => {
  const p = { live: true, human: 0 };
  assert.deepEqual(names(cuesOf("inch", [{ kind: "attacked", by: 2, to: 0 }], null, p)), ["attacked"]);
  assert.deepEqual(names(cuesOf("inch", [{ kind: "attacked", by: 2, to: 1 }], null, p)), []);
  assert.deepEqual(names(cuesOf("inch", [{ kind: "out", seat: 3, by: 0 }], null, p)), ["finished"]);
  assert.deepEqual(names(cuesOf("inch", [{ kind: "out", seat: 3, by: 1 }], null, p)), []);
  assert.deepEqual(names(cuesOf("inch", [{ kind: "pact", to: 2 }], null, p)), ["truce"]);
  assert.deepEqual(names(cuesOf("inch", [{ kind: "pactend", to: 2 }], null, p)), ["truceEnd"]);
  assert.deepEqual(names(cuesOf("inch", [{ kind: "age", age: 2 }], null, p)), ["age"]);
  assert.deepEqual(names(cuesOf("inch", [{ kind: "out", seat: 0, by: 1 }], null, p)), ["out"]);
  assert.deepEqual(names(cuesOf("inch", [{ kind: "out", seat: 0, by: 1 }, { kind: "end" }], null, p)), []); // the end plays its own tune
  assert.deepEqual(names(cuesOf("inch", [{ kind: "attack", seat: 2 }], null, p)), []); // a rival's attack is not the player's march
});

test("every cue named is made in code", () => {
  for (const name of ["dice", "march", "capture", "build", "attacked", "finished", "truce", "truceEnd", "age", "out"]) assert.equal(typeof CUES[name], "function");
});
