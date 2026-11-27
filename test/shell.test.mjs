// SPDX-License-Identifier: AGPL-3.0-or-later
// The table screen's plain helpers: settings kept in the browser, the banner's once-a-turn key, places at the end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, parseSettings, ranked, resultText, takeBack, turnKey } from "../site/shell.js";
import { chance, createMatch, seedState } from "../src/core/index.js";
import { glass } from "../src/games/glass/rules.js";
import { choose } from "../src/games/glass/bot.js";

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

test("seat patterns are on unless turned off since they became the default", () => {
  assert.equal(DEFAULTS.patterns, "on");
  assert.equal(parseSettings('{"patterns":"off"}').patterns, "on"); // kept before patterns were on by default: not a choice
  assert.equal(parseSettings('{"patterns":"off","v":2}').patterns, "off");
});

test("take back stops at chance and at other seats' moves, and the game still replays from its seed and moves", () => {
  // a toy game: two seats take turns; "step" moves on, "roll" draws a die, "end" passes the turn
  const toy = {
    id: "toy", version: "1", options: {},
    setup: () => ({ seat: 0, sum: 0, moves: 0 }),
    turn: (p) => (p.moves >= 12 ? null : p.seat),
    moves: () => [{ do: "step" }, { do: "roll" }, { do: "end" }],
    apply(p, m, dice) {
      const q = { ...p, moves: p.moves + 1 };
      if (m.do === "roll") q.sum += dice.die();
      if (m.do === "step") q.sum += 1;
      if (m.do === "end") q.seat = 1 - p.seat;
      return { position: q, events: [] };
    },
    result: (p) => (p.moves >= 12 ? { winners: [0], why: "played" } : null),
  };
  const kinds = ["you", "normal"], m = createMatch(toy, { seed: "s" });
  assert.equal(takeBack(m, kinds), "none"); // nothing played yet
  m.play({ do: "step" });
  assert.equal(takeBack(m, kinds), "yes");
  m.play({ do: "roll" });
  assert.equal(takeBack(m, kinds), "chance");
  m.play({ do: "step" });
  assert.equal(takeBack(m, kinds), "yes");
  assert.equal(takeBack(m, kinds, 3), "none"); // a game by link: nothing before the last link sent
  m.play({ do: "end" }); m.play({ do: "step" }); m.play({ do: "end" }); // the bot's turn
  assert.equal(takeBack(m, kinds), "none");
  const again = createMatch(toy, { seed: "s" });
  for (const mv of m.list) again.play(mv);
  assert.equal(again.fingerprint(), m.fingerprint());
});

test("take back stops at a drawn plan in Grain and Glass: the deck was shuffled at setup, so no dice change, but the card was seen", () => {
  const m = createMatch(glass, { seed: "peek", options: { seats: 3, style: "classic" } }), dice = chance(seedState("bots/peek")), kinds = ["you", "you", "you"];
  while (m.turn !== null && !m.legal().some((x) => x.do === "plan")) m.play(choose(m.position, dice, "normal"));
  assert.ok(m.turn !== null, "a plan could be drawn at some point");
  const top = m.position.deck.at(-1);
  m.play({ do: "plan" });
  assert.equal(m.rolled, true, "the draw counts as chance");
  assert.equal(takeBack(m, kinds), "chance", `the ${top} plan, once seen, is not taken back`);
});
