// SPDX-License-Identifier: AGPL-3.0-or-later
// Legacy campaigns (early): the record round-trips, a campaign replays from its record alone, the marks a game leaves
// change the next game's setup, and a campaign keeps the rules version it began on. No outcomes are written down here:
// which seat wins a game is whatever the bots make of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Refusal, canon, chance, createMatch, readOptions, seedState } from "../src/core/index.js";
import { addGame, advance, beginCampaign, foldCampaign, nameLast, nextGame, readCampaign, standings, takeBack, writeCampaign } from "../src/core/campaign.js";
import { LEGACY, LONG_MUSTER, RULES } from "../src/games/banners/legacy.js";
import { checkMarks } from "../src/games/banners/marks.js";
import { banners, nameOf } from "../src/games/banners/rules.js";
import { choose } from "../src/games/banners/bot.js";
import { refused } from "./fixtures/bots.js";

const fresh = (o = {}) => beginCampaign(LEGACY, { id: "test0001", length: 5, seats: 3, who: ["you", "normal", "normal"], ...o });
/** The campaign's next game, played by bots to its end. */
function played(record, tag = "x", legacy = LEGACY) {
  const { state } = foldCampaign(legacy, record), nx = nextGame(legacy, record, state), m = createMatch(nx.game, { seed: nx.seed, options: nx.options }), dice = chance(seedState(`legacy/${tag}`));
  while (m.turn !== null && m.list.length < 6000) m.play(choose(m.position, dice, "normal"));
  assert.notEqual(m.result, null, "a campaign game ends");
  return m;
}
const one = addGame(LEGACY, fresh(), played(fresh(), "a"));
const two = addGame(LEGACY, one, played(one, "b"));

test("a new campaign is pinned to the rules version it begins on, and refuses what the story does not offer", () => {
  const r = fresh();
  assert.equal(r.rules, banners.version);
  assert.equal(r.games.length, 0);
  assert.throws(() => fresh({ length: 7 }), refused("campaign"));
  assert.throws(() => fresh({ seats: 6, who: Array(6).fill("normal") }), refused("campaign"));
  assert.throws(() => fresh({ who: ["you", "normal"] }), refused("campaign"));
  assert.throws(() => fresh({ id: "Not An Id" }), refused("campaign"));
  assert.throws(() => fresh({ rules: "0" }), refused("version"));
});

test("the record round-trips through its file, and a changed or broken file is refused", () => {
  const text = writeCampaign(two), back = readCampaign(text, LEGACY);
  assert.equal(canon(back.record), canon(two));
  assert.equal(writeCampaign(back.record), text);
  const f = JSON.parse(text);
  assert.throws(() => readCampaign(JSON.stringify({ ...f, takeBacks: 3 }), LEGACY), refused("file")); // its fingerprint no longer fits
  for (const bad of ["", "{", "[]", JSON.stringify({ ...f, kind: "save" }), JSON.stringify({ ...f, extra: 1 })]) assert.throws(() => readCampaign(bad, LEGACY), refused("file"));
  assert.throws(() => readCampaign(writeCampaign({ ...two, format: 2 }), LEGACY), refused("format"));
  assert.throws(() => readCampaign(writeCampaign({ ...two, game: "other" }), LEGACY), refused("game"));
  assert.throws(() => readCampaign(writeCampaign({ ...two, tale: 99 }), LEGACY), refused("story"));
});

test("a campaign replays from its record alone: the same points, marks and seals every time", () => {
  const a = foldCampaign(LEGACY, two), b = readCampaign(writeCampaign(two), LEGACY);
  assert.equal(canon(a.state), canon(b.state));
  assert.equal(canon(a.played), canon(b.played));
  assert.equal(a.state.game, 3);
  assert.equal(a.state.points.reduce((n, x) => n + x, 0) >= 2 * LONG_MUSTER.rewards.win, true);
  assert.deepEqual(a.played[0].opened.slice(0, 1), ["halls"]); // the first seal opens when the first game is over
  // a move changed in the record: the replay fails and says where
  const moves = [...two.games[1].moves], k = moves.findIndex((m) => m.do === "end");
  moves[k] = { do: "attack", from: 0, to: 0, roll: "all" };
  const games = [two.games[0], { ...two.games[1], moves }];
  assert.throws(() => foldCampaign(LEGACY, { ...two, games }), (e) => e instanceof Refusal && /game 2, move/.test(e.message));
  // a game cut short is not a finished game
  assert.throws(() => foldCampaign(LEGACY, { ...two, games: [two.games[0], { ...two.games[1], moves: two.games[1].moves.slice(0, 5) }] }), refused("campaign"));
});

test("only the campaign's own next game is added, once it is over", () => {
  const { state } = foldCampaign(LEGACY, one), nx = nextGame(LEGACY, one, state);
  assert.throws(() => addGame(LEGACY, one, createMatch(banners, { seed: nx.seed, options: nx.options })), refused("campaign")); // not over
  assert.throws(() => addGame(LEGACY, one, createMatch(banners, { seed: "other", options: nx.options })), refused("campaign"));
  assert.throws(() => addGame(LEGACY, one, played(fresh(), "a")), refused("campaign")); // game 1 again
});

test("marks change the next game's setup: a switch, a name, a fort and the last seat's extra strength", () => {
  const { state, played: games } = foldCampaign(LEGACY, one), nx = nextGame(LEGACY, one, state), o = readOptions(banners, nx.options);
  assert.equal(o.capitals, true, "the first seal turns capitals on");
  assert.equal(o.marks.game, 2);
  const m = createMatch(banners, { seed: nx.seed, options: nx.options }), p = m.position, [at, text] = games[0].named;
  assert.ok(p.caps, "the game has capitals");
  assert.equal(nameOf(p, at), text, "the winner's name for a province is on the map");
  // the same game without its marks: only the seat given more has more to set out
  const plain = createMatch(banners, { seed: nx.seed, options: { ...nx.options, marks: { ...nx.options.marks, bonus: [0, 0, 0] } } }).position;
  const more = state.bonus;
  plain.reserve.forEach((r, s) => assert.equal(p.reserve[s], r + more[s]));
  // a capital falls in some game: forts open, and the fallen place is walled in the games after
  const facts = { game: 2, winners: [0], order: [0, 1, 2], out: [], strongest: [at, -1, -1], happened: ["capital_falls"], slots: { fallen_capital: 7 } };
  const later = advance({ ...LONG_MUSTER, length: 5 }, state, facts).state, o3 = LEGACY.optionsFor(one, later, 3);
  assert.equal(o3.forts, true);
  assert.deepEqual(o3.marks.forts, [7]);
  const q = createMatch(banners, { seed: "walls", options: o3 }).position;
  assert.equal(q.forts[7], 1);
  assert.equal(q.forts.reduce((n, f) => n + f, 0), 1);
});

test("the winner's name is chosen from the story's list, once each, and the choice is part of the record", () => {
  const { played: games } = foldCampaign(LEGACY, one), first = LONG_MUSTER.pool.indexOf(games[0].named[1]);
  const pick = first === 3 ? 4 : 3, renamed = nameLast(LEGACY, one, pick), again = readCampaign(writeCampaign(renamed), LEGACY);
  assert.equal(again.played[0].named[1], LONG_MUSTER.pool[pick]);
  assert.throws(() => nameLast(LEGACY, one, LONG_MUSTER.pool.length), refused("campaign"));
});

test("a whole game taken back is counted and dealt anew", () => {
  const back = takeBack(two), { state } = foldCampaign(LEGACY, back);
  assert.equal(back.games.length, 1);
  assert.equal(back.takeBacks, 1);
  assert.notEqual(nextGame(LEGACY, back, state).seed, two.games[1].seed);
  assert.equal(readCampaign(writeCampaign(back), LEGACY).record.takeBacks, 1);
  assert.throws(() => takeBack(fresh()), refused("campaign"));
});

test("a campaign is pinned: it replays on its own rules version and is refused where that version is missing", () => {
  const old = { ...banners, version: `${banners.version}-old` }, both = { ...LEGACY, rules: { ...RULES, [old.version]: old } };
  const r = beginCampaign(both, { id: "pinned01", length: 5, seats: 3, who: ["you", "normal", "normal"], rules: old.version }), { state } = foldCampaign(both, r);
  assert.equal(nextGame(both, r, state).game.version, old.version, "the pinned version plays, not the newest");
  const done = addGame(both, r, played(r, "c", both)), text = writeCampaign(done);
  assert.equal(readCampaign(text, both).record.rules, old.version);
  // the newest rules alone cannot open it: refused with a reason, never replayed on other rules
  assert.throws(() => readCampaign(text, LEGACY), (e) => e instanceof Refusal && e.code === "version" && e.message.includes(`pinned to version ${old.version}`));
  // and a game played on the newest rules is not that campaign's game
  const { state: s2 } = foldCampaign(both, r), nx = nextGame(both, r, s2);
  assert.throws(() => addGame(both, r, createMatch(banners, { seed: nx.seed, options: nx.options })), refused("campaign"));
});

test("an ordinary game is untouched: marks are an open option, given only to a campaign's games", () => {
  const o = createMatch(banners, { seed: "plain", options: { seats: 2 } }).options;
  assert.equal(Object.hasOwn(o, "marks"), false);
  for (const bad of [{}, { campaign: "x", game: 0, names: [], forts: [], bonus: [] }, { campaign: "x", game: 1, names: [[1, ""]], forts: [], bonus: [] }, { campaign: "x", game: 1, names: [], forts: [1.5], bonus: [] }, { campaign: "x", game: 1, names: [], forts: [], bonus: [], more: 1 }]) {
    assert.equal(checkMarks(bad), false);
    assert.throws(() => createMatch(banners, { seed: "x", options: { seats: 2, marks: bad } }), refused("option"));
  }
  assert.equal(checkMarks(null), true);
});

test("the standings rank by points, then wins", () => {
  const s = standings({ points: [4, 6, 4], wins: [1, 1, 0] });
  assert.deepEqual(s.map((r) => [r.seat, r.place]), [[1, 1], [0, 2], [2, 3]]);
});
