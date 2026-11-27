// SPDX-License-Identifier: AGPL-3.0-or-later
// A one-person real-time game of An Inch of Ink played by a fixed script of every kind of order, so that a change to the rules
// for two people can be checked to leave the one-person game exactly as it was (test/inchlive.test.mjs keeps its fingerprints).
import { chance, createMatch, seedState } from "../../src/core/index.js";
import { inch } from "../../src/games/inch/rules.js";

export const SCRIPTS = [
  [{ style: "classic", nations: 12 }, "golden classic"],
  [{ style: "ours" }, "golden dries"],
  [{ style: "custom", live: true, cities: true, boats: true, map: "islands", nations: 8, rivals: "hard" }, "golden custom"],
];

/** Plays up to `most` moves: the first start listed, then orders of each kind drawn by its own dice, between ticks. */
export function scripted(options, seed, most = 90) {
  const m = createMatch(inch, { seed, options }), d = chance(seedState(`script/${seed}`));
  while (m.turn !== null && m.list.length < most) {
    if (m.position.phase === "spawn") { const list = m.legal(); m.play(list[d.below(list.length)]); continue; }
    const kinds = ["attack", "recall", "pact", "boat", "city", "mark", "card"], k = kinds[d.below(kinds.length * 2)], some = k ? m.legal().filter((x) => x.do === k) : [];
    m.play(some.length ? some[d.below(some.length)] : { do: "tick", n: 4 });
  }
  return m;
}
