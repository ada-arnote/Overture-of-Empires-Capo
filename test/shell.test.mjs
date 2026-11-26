// SPDX-License-Identifier: AGPL-3.0-or-later
// The table screen's plain helpers: settings kept in the browser, the banner's once-a-turn key, places at the end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, parseSettings, ranked, resultText, turnKey } from "../site/shell.js";

test("settings fall back to their defaults for anything missing or strange", () => {
  assert.deepEqual(parseSettings(null), DEFAULTS);
  assert.deepEqual(parseSettings("not json"), DEFAULTS);
  assert.deepEqual(parseSettings("[1]"), DEFAULTS);
  const s = parseSettings(JSON.stringify({ sound: "off", volume: 250, speed: "instant", motion: "sideways", text: "larger", extra: 1 }));
  assert.equal(s.sound, "off"); assert.equal(s.volume, 100); assert.equal(s.speed, "instant"); assert.equal(s.motion, "system"); assert.equal(s.text, "larger"); assert.equal(s.extra, undefined);
  assert.equal(parseSettings('{"volume":"x"}').volume, DEFAULTS.volume);
  assert.equal(parseSettings('{"volume":-3}').volume, 0);
});

test("the turn banner shows once a round for one person, once a seat for several", () => {
  assert.equal(turnKey("a", 3, 0, true), turnKey("a", 3, 2, true));
  assert.notEqual(turnKey("a", 3, 0, false), turnKey("a", 3, 2, false));
  assert.notEqual(turnKey("a", 3, 0, true), turnKey("a", 4, 0, true));
  assert.notEqual(turnKey("a", 3, 0, true), turnKey("b", 3, 0, true));
});

test("places: winners first, then the standing by score, then the fallen, the last to fall first", () => {
  const r = ranked([
    { seat: 0, won: false, score: 0, fell: 3 },
    { seat: 1, won: false, score: 12, fell: undefined },
    { seat: 2, won: true, score: 30, fell: undefined },
    { seat: 3, won: false, score: 0, fell: 7 },
    { seat: 4, won: false, score: 12, fell: undefined },
  ]);
  assert.deepEqual(r.map((x) => x.seat), [2, 1, 4, 3, 0]);
  assert.deepEqual(r.map((x) => x.place), [1, 2, 2, 4, 5]);
  const tie = ranked([{ seat: 0, won: true, score: 5 }, { seat: 1, won: true, score: 9 }, { seat: 2, won: false, score: 9 }]);
  assert.deepEqual(tie.map((x) => x.place), [1, 1, 3]);
});

test("the result reads as one line", () => {
  assert.equal(resultText("Game", [{ place: 1, name: "Azure", figures: [["Land", 30], ["Army", 12]] }, { place: 2, name: "Rust", figures: [] }]), "Game: 1. Azure (Land 30, Army 12); 2. Rust.");
});
