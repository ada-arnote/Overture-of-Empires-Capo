// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo's turn reader and hard line, held to replies written the ways real chat models write them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isoDate, newWorldGame, readWorldReply, turnCode } from "../src/story/turn.js";
import { crosses } from "../src/story/line.js";

const g = newWorldGame("PER", "nation", "abcdef123");
const code = turnCode(g), to = "2027-01-01";
const known = (c) => ["PER", "CHL", "BOL", "BRA", "USA", "SDS"].includes(c);
const names = { peru: "PER", chile: "CHL", bolivia: "BOL", brazil: "BRA", "united states": "USA" };
const codeOf = (s) => names[String(s || "").trim().toLowerCase()] || "";
const read = (text) => readWorldReply(text, g, known, to, false, codeOf);

test("plain replies are read", () => {
  const r = read(`TURN: ${code}\nEVENT: 2026-12-04 | PER | Lima opens talks with Santiago about the northern ports.\nSUMMARY: Talks begin.\nEND`);
  assert.equal(r.matched, true);
  assert.equal(r.events.length, 1);
  assert.equal(r.summary, "Talks begin.");
});

test("chat formatting is forgiven: bold labels, numbering, bullets, pipes, a chatty preface", () => {
  const r = read([
    "Sure! Here is the turn:",
    `**TURN:** ${code} (Peru, December)`,
    `1. **EVENT:** 2026-12-04 | PER | Lima opens talks with Santiago about the northern ports.`,
    `- EVENT: 2026-12-10 | Chile | Santiago answers that it is willing to talk but not about sovereignty.`,
    `| EVENT: December 15, 2026 | BOL | La Paz protests at being left out of the talks. |`,
    `* NEWS: a Lima daily | Ports talks open | Exporters are hopeful.`,
    `MOVE: m1 | 1 | Peru | TREATY | Chile | trade`,
    "**SUMMARY:** A month of talks.",
  ].join("\n"));
  assert.equal(r.matched, true);
  assert.deepEqual(r.events.map((e) => [e.date, e.at]), [["2026-12-04", "PER"], ["2026-12-10", "CHL"], ["2026-12-15", "BOL"]]);
  assert.equal(r.news.length, 1);
  assert.deepEqual([r.moves[0].country, r.moves[0].verb, r.moves[0].target], ["PER", "TREATY", "CHL"]);
  assert.equal(r.summary, "A month of talks.");
});

test("a reply for another turn is not read", () => {
  assert.equal(read("TURN: t9-zzzzzz\nEVENT: 2026-12-04 | PER | Something happens in Lima that is long enough.").matched, false);
});

test("events outside the turn, off the map, or crossing the hard line are dropped with a reason", () => {
  const r = read([`TURN: ${code}`, "EVENT: 2027-02-01 | PER | Too late for this turn, after its last day.", "EVENT: 2026-12-05 | XXX | Somewhere not on the map does something.", "EVENT: 2026-12-06 | PER | Lima is calm and the markets are steady."].join("\n"));
  assert.equal(r.events.length, 1);
  assert.equal(r.dropped.length, 2);
});

test("dates in words", () => {
  assert.equal(isoDate("December 5, 2026"), "2026-12-05");
  assert.equal(isoDate("5 December 2026"), "2026-12-05");
  assert.equal(isoDate("5th Dec 2026"), "2026-12-05");
  assert.equal(isoDate("2026/12/5"), "2026-12-05");
  assert.equal(isoDate("soon"), "");
});

test("the hard line passes ordinary statecraft and refuses what it must", () => {
  for (const ok of ["Give explicit orders to protect the children's hospital", "Make an explicit threat to Chile over the boys held at the border", "Ban child labour and publish explicit penalties", "Fund sex education for teens", "Prosecute those who sexually abuse children"]) assert.equal(crosses(ok), false, ok);
  for (const no of ["Arrange a sexual encounter with a 14 year old", "Sexual content with a 15-year-old", "Write an erotic scene with a teen to protect the nation", "Hold a nude photo shoot with someone aged 12"]) assert.equal(crosses(no), true, no);
});

import { checkSave, restoreGame, snapGame } from "../src/story/saves.js";

test("saves are checked before use: junk is refused, parts off the map are dropped", () => {
  const isProvince = (id) => ["PER-1", "CHL-2"].includes(id), isCountry = known;
  assert.equal(checkSave(null, isProvince, isCountry), null);
  assert.equal(checkSave({ v: 1, player: "ZZZ", mode: "nation", date: "2026-12-01", turn: 1, seed: "x" }, isProvince, isCountry), null);
  assert.equal(checkSave({ v: 1, player: "PER", mode: "nation", date: "soon", turn: 1, seed: "x" }, isProvince, isCountry), null);
  const s = checkSave({ v: 1, player: "PER", mode: "nation", date: "2026-12-01", turn: 3, seed: "x", owners: { "PER-1": "CHL", "NOPE-9": "PER", "CHL-2": "XXX" }, log: "not a list" }, isProvince, isCountry);
  assert.deepEqual(s.owners, { "PER-1": "CHL" });
  assert.deepEqual(s.log, []);
  assert.deepEqual(s.wars, []);
});

test("take-back records leave the log out and restore it by length", () => {
  const game = { ...newWorldGame("PER", "nation", "abcdef123"), log: [{ a: 1 }, { a: 2 }] };
  const rec = snapGame(game, "turn 2");
  assert.equal(rec.log, undefined);
  const later = [...game.log, { a: 3 }];
  assert.deepEqual(restoreGame(rec, later).log, [{ a: 1 }, { a: 2 }]);
});
