// SPDX-License-Identifier: AGPL-3.0-or-later
// The lessons' gentle bots: a newcomer who only ends the turn still has time to learn. The lesson presets are those in
// site/fable.js and site/banners.js; the gentle tier is offered nowhere else.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chance, createMatch, seedState } from "../src/core/index.js";
import { cellsOf as fableCells, fable } from "../src/games/fable/rules.js";
import { choose as fableBot } from "../src/games/fable/bot.js";
import { banners, cellsOf as bannerCells } from "../src/games/banners/rules.js";
import { choose as bannersBot } from "../src/games/banners/bot.js";

/** The lesson game, the learner doing the least it can, the bot gentle. Counts the learner's land lost in each bot turn. */
function lesson(game, options, seed, bot, idle, cells, rounds) {
  const m = createMatch(game, { seed, options }), lost = [];
  while (m.turn !== null && m.position.round <= rounds) {
    const p = m.position;
    if (m.turn === 0) { m.play(idle(m)); continue; }
    const had = cells(p, 0), round = p.round;
    while (m.turn === 1) m.play(bot(m.position, chance(seedState(`${m.seed}/${m.list.length}`)), "gentle"));
    lost.push([round, had - cells(m.position, 0)]);
  }
  return { m, lost };
}

test("Fable lesson: the same order every round, no rival land taken before round 3, then at most one hex a bot turn", () => {
  const { m, lost } = lesson(fable, { style: "custom", order: "fixed", seats: 2, isle: "round", size: "small" }, "lesson 21", fableBot, () => ({ do: "end" }), fableCells, 10);
  for (const [round, n] of lost) assert.ok(round < 3 ? n === 0 : n <= 1, `round ${round}: the learner lost ${n}`);
  assert.ok(fableCells(m.position, 0) >= 12, "the learner still holds land after ten rounds");
});

test("Banners lesson: nobody is struck in round 1, then at most one province a bot turn", () => {
  const idle = (m) => {
    const p = m.position, all = m.legal();
    return all.find((x) => x.do === "place" && x.n === p.left) || all.find((x) => x.do === "occupy") || all.find((x) => x.do === "end") || all[0];
  };
  const { m, lost } = lesson(banners, { style: "classic", seats: 2, map: "isles" }, "lesson 2", bannersBot, idle, bannerCells, 10);
  for (const [round, n] of lost) assert.ok(round < 2 ? n === 0 : n <= 1, `round ${round}: the learner lost ${n}`);
  assert.ok(bannerCells(m.position, 0) >= 6, "the learner still holds land after ten rounds");
});
