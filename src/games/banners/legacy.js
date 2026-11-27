// SPDX-License-Identifier: AGPL-3.0-or-later
// Brass and Banners as a legacy campaign (early: the basic structure). The campaign record and its fold are
// src/core/campaign.js; this is what Banners adds: its first story as data, the options each game is played with,
// and what a finished game leaves behind. Marks reach the board through one open option (./marks.js).
import { NONE, banners, cellsOf } from "./rules.js";

/**
 * The first story, "The Long Muster": its first few seals. Every effect is data the setup already understands:
 * a switch (an expansion turned on for every game after), or a fort at a place a condition names.
 */
export const LONG_MUSTER = {
  id: "long-muster", tale: 1, title: "The Long Muster", game: "banners",
  lengths: [5, 10], seats: [2, 3, 4],
  // the rules every game starts from: the dealt-out war with dice and cards, to a shorter goal and a round limit
  start: { style: "custom", map: "world", start: "dealt", dice: "standard", muster: "floor", cards: "rising", goal: 65, rounds: 20, neutral: 2, order: "fixed", opening: "lean", spoils: "trade", score: "land", luck: "fair" },
  switches: { capitals: false, forts: false, leaders: false },
  // a win is worth 3, holding on to the end 1; the seat that placed last starts the next game with 3 more to set out
  rewards: { win: 3, live: 1, bonus: 3 },
  // what the winner may call the province they held strongest; a word on the map, never a rule
  pool: ["Saltmarch", "Low Cinder", "The Quiet Reach", "Harrow Field", "Greywater", "The Long Ford", "Emberwold", "Kestrel Gap", "Thornmere", "The Brass Gate", "Ashen Weir", "Lantern Hill"],
  seals: [
    { id: "halls", when: { test: "after_game", n: 1 }, why: "Opened because the first game is over.",
      do: [{ kind: "SWITCH", name: "capitals", value: true }],
      title: "Seats of power", text: "Every banner now keeps a capital: its strongest province when the war begins. A capital adds 1 to its defender's best die, and whoever holds more than half of them at the start of their turn wins." },
    { id: "walls", when: { test: "first", what: "capital_falls" }, why: "Opened because a capital fell for the first time.",
      do: [{ kind: "SWITCH", name: "forts", value: true }, { kind: "WORK", what: "fort", place: "@fallen_capital" }],
      title: "Walls after the fact", text: "Forts can now be built for 4 of what you place, and each throws one more die in defence. The hall that fell stands walled in every game from now on, whoever holds it." },
    { id: "captains", when: { test: "after_game", n: 3 }, why: "Opened because the third game is over.",
      do: [{ kind: "SWITCH", name: "leaders", value: true }],
      title: "Captains of the muster", text: "Every banner now has a leader in the field. A leader adds 1 to your best die where it stands, and comes back two rounds after it is driven off." },
  ],
  chapters: [
    "The banners gather on the old map. Nobody has a hall yet, and nobody's name is on the land.",
    "The muster comes again. What was won last time is remembered.",
    "Walls go up where halls once fell.",
  ],
};

/** Every rules version a campaign may be pinned to. A version is kept here, frozen, for as long as campaigns run on it. */
export const RULES = { [banners.version]: banners };

/** The options of game n: the story's start, the switches the seals turned on, and the marks. */
function optionsFor(record, state, n) {
  return {
    ...LONG_MUSTER.start, seats: record.seats, ...state.switches,
    marks: { campaign: record.id, game: n, names: state.names.map(([at, text]) => [at, text]), forts: state.works.filter((w) => w[1] === "fort").map((w) => w[0]), bonus: [...state.bonus] },
  };
}

/** What a finished game leaves: who won and the order of the rest, who was put out, each seat's strongest province, the first capital to fall. */
function factsOf(m, steps, n) {
  const p = m.position, seats = p.seats, winners = [...m.result.winners];
  let fallen = -1;
  for (const { before, events } of steps) for (const e of events) if (fallen < 0 && e.kind === "take" && e.was !== NONE && before.caps?.[e.was] === e.at) fallen = e.at;
  const out = Array.from({ length: seats }, (_, s) => s).filter((s) => p.outBy[s] !== NONE || cellsOf(p, s) === 0);
  const order = Array.from({ length: seats }, (_, s) => s).sort((a, b) => (winners.includes(b) ? 1 : 0) - (winners.includes(a) ? 1 : 0) || cellsOf(p, b) - cellsOf(p, a) || a - b);
  const strongest = Array.from({ length: seats }, (_, s) => p.owner.reduce((best, o, i) => (o === s && (best < 0 || p.str[i] > p.str[best]) ? i : best), -1));
  return { game: n, winners, order, out, strongest, happened: fallen >= 0 ? ["capital_falls"] : [], slots: fallen >= 0 ? { fallen_capital: fallen } : {} };
}

/** Brass and Banners' legacy layer, for src/core/campaign.js. */
export const LEGACY = { game: banners.id, rules: RULES, story: LONG_MUSTER, optionsFor, factsOf };

/** The chapter text before game n. */
export const chapterOf = (n) => LONG_MUSTER.chapters[Math.min(n, LONG_MUSTER.chapters.length) - 1];
