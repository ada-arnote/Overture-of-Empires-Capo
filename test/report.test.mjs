// SPDX-License-Identifier: AGPL-3.0-or-later
// The map report card and the seat table judge what they are given: a hand-made good board passes, and each fault
// put into it fails the check that looks for it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hexBoard } from "../src/games/hex.js";
import { CHECKS, T, TODO, areaCard, glassCard, inchCard, isleCard, verdict } from "../tools/report.mjs";
import { judge, plan, playOne } from "../tools/fair.mjs";

const failed = (results) => results.filter((r) => !r.ok).map((r) => r.id);
const far = ([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

/** Six provinces of four small hexes in a band two rows deep, two lands of three, and one crossing that closes a ring. */
function band() {
  const fine = [], of = [];
  for (let r = 0; r < 2; r++) for (let q = 0; q < 12; q++) { fine.push([q, r]); of.push(Math.floor(q / 2)); }
  const dry = [[1], [0, 2], [1, 3], [2, 4], [3, 5], [4]], near = [[1, 5], [0, 2], [1, 3], [2, 4], [3, 5], [0, 4]];
  return { n: 6, fine, of, dry, near, links: [[0, 5]], ends: [[0, 11]], region: [0, 0, 0, 1, 1, 1], sizes: [3, 3], lands: ["the East", "the West"],
    names: ["Ash", "Birch", "Cedar", "Damson", "Elder", "Fir"], mid: [0, 2, 4, 6, 8, 10], starts: { 2: [0, 3], 3: [0, 2, 4] } };
}
const small = { ...T, provinces: [4, 20], cells: 3, degree: [2, 5] };
const card = (b) => failed(areaCard(b, { seats: [2, 3], bonus: () => 1, t: small }));

test("map card: a good province board passes every check", () => {
  assert.deepEqual(card(band()), []);
});

test("map card: each fault in a province board fails its own check", () => {
  const cases = {
    "area.piece": (b) => { b.of[13] = 3; b.of[12] = 3; }, // two cells of Ash's far side handed to Damson, across the band
    "area.small": (b) => { b.of[23] = 4; b.of[22] = 4; b.of[11] = 4; }, // Fir down to one cell
    "area.whole": (b) => { b.near[5] = [4]; }, // the crossing goes one way only
    "area.links": (b) => { b.ends = [[0, 5]]; }, // its far end is not in Fir
    "area.names": (b) => { b.names[2] = ""; },
    "area.lands": (b) => { b.region[1] = 1; }, // the West in two pieces
    "area.labels": (b) => { b.mid[3] = 0; },
    "area.start": (b) => { b.starts[3] = [0, 0, 4]; },
    "area.apart": (b) => { b.starts[2] = [0, 1]; },
  };
  for (const [id, spoil] of Object.entries(cases)) {
    const b = band();
    spoil(b);
    assert.ok(card(b).includes(id), `${id}: ${card(b)}`);
  }
  assert.ok(failed(areaCard(band(), { seats: [2, 3], bonus: () => 1, t: { ...small, provinces: [12, 120] } })).includes("area.count"));
  assert.ok(failed(areaCard(band(), { seats: [2, 3], bonus: (k) => (k ? 1 : 3), t: small })).includes("area.bonus"));
});

test("map card: a good island passes; one in two pieces, one out of reach, and uneven homes each fail", () => {
  const b = hexBoard(3), water = b.cells.map((c) => (far(c) === 3 ? 1 : 0)), at = (q, r) => b.cells.findIndex((c) => c[0] === q && c[1] === r);
  const homes = [at(2, 0), at(-2, 0)], good = isleCard(b, water, { seats: 2, homes, name: (i) => `c${i}` });
  assert.deepEqual(failed(good), []);
  assert.deepEqual(failed(isleCard(b, b.cells.map((c, i) => (water[i] || c[0] === 0 ? 1 : 0)), { seats: 2, homes })), ["isle.piece", "isle.alone"], "split down the middle: boats still reach, but each home is alone");
  assert.deepEqual(failed(isleCard(b, water, { seats: 2, homes: [at(2, 0), at(1, 0)] })), ["isle.apart", "isle.room"]);
  assert.deepEqual(failed(isleCard(b, water, { seats: 2, homes: [at(2, 0), at(3, 0)] })), ["isle.homes"], "a home in the sea");
  assert.deepEqual(failed(isleCard(b, water, { seats: 2, owner: b.cells.map((_, i) => (water[i] ? -1 : i % 3 ? 0 : 1)) })), ["isle.deal"]);
  assert.deepEqual(failed(isleCard(b, water, { want: 30 })), ["isle.size"]);
  const wide = hexBoard(6), lone = wide.cells.map((c) => (far(c) <= 1 || (c[0] === 6 && c[1] === 0) ? 0 : 1));
  assert.ok(failed(isleCard(wide, lone, {})).includes("isle.reach"), "four cells of sea is beyond a boat");
});

test("map card: busy numbers side by side, ports side by side, and uneven hills near the homes fail", () => {
  const b = hexBoard(2), n = b.size, land = Array(n).fill(1), good = b.cells.map((_, i) => i % 4), port = Array(n).fill(-1);
  [b.corners[0], b.corners[2], b.corners[3], b.corners[5]].forEach((c, k) => { port[c] = k; });
  const p = { land, good, num: Array(n).fill(2), port, gate: -1, seats: 2, rule: { roll: "sum", size: "small" } };
  const fair = failed(glassCard(b, p));
  for (const id of ["glass.goods", "glass.numbers", "glass.ports", "glass.busy", "glass.portgap"]) assert.ok(!fair.includes(id), id);
  const busy = { ...p, num: p.num.map((x, i) => (i === 0 || b.near[0].includes(i) ? 7 : x)) };
  assert.ok(failed(glassCard(b, busy)).includes("glass.busy"));
  const crowded = { ...p, port: p.port.map((x, i) => (b.near[b.corners[0]].includes(i) ? 1 : x)) };
  assert.ok(failed(glassCard(b, crowded)).includes("glass.portgap"));
  const board = hexBoard(4), homes = [board.corners[0], board.corners[3]], flat = board.cells.map(() => 1);
  assert.deepEqual(failed(inchCard(board, homes, flat)), []);
  assert.deepEqual(failed(inchCard(board, homes, flat.map((c, i) => (board.near[homes[0]].includes(i) ? 2 : c)))), ["inch.room"]);
  assert.deepEqual(failed(inchCard(board, [board.corners[0], board.corners[1]], flat)).length, 0);
  assert.deepEqual(failed(inchCard(hexBoard(4), [board.corners[0], board.corners[1], board.corners[3]], flat)), ["inch.homes"]);
});

test("map card: the gate stops on a failure off the to-do list and notes the ones on it", () => {
  for (const k of TODO) assert.ok(CHECKS[k.split("|")[1]], `the to-do list names a check that does not exist: ${k}`);
  const rows = [{ kind: "banners world", id: "area.ratio", boards: 1, failed: 1, say: "13.9 times", where: "card 1" }, { kind: "banners world", id: "area.count", boards: 1, failed: 1, say: "9 provinces", where: "card 1" }];
  const v = verdict(rows, { todo: ["banners world|area.ratio"] });
  assert.equal(v.bad.length, 1);
  assert.match(v.bad[0], /area\.count/);
  assert.match(v.note[0], /to-do, banners world: area\.ratio 1\/1/);
  assert.deepEqual(verdict([{ ...rows[0], failed: 0 }], { todo: ["banners world|area.ratio"] }).bad, []);
});

test("seat table: the spread is best seat less worst seat, with its margin; real time leaves the player's slot out", () => {
  const r = judge({ games: 1000, wins: [579, 421], ties: 0, lengths: [3, 1, 2], live: false });
  assert.equal(Math.round(r.spread * 10), 158);
  assert.ok(r.margin > 6 && r.margin < 6.3, `margin ${r.margin}`);
  assert.equal(r.median, 2);
  assert.equal(r.pass, false);
  assert.equal(r.verdict, "FAIL, within sampling error"); // 15.8 less its 6.1 margin is under the line
  assert.equal(judge({ games: 1000, wins: [600, 400], ties: 0, lengths: [1], live: false }).verdict, "FAIL");
  assert.equal(judge({ games: 1000, wins: [496, 504], ties: 0, lengths: [1], live: false }).verdict, "pass");
  assert.equal(judge({ games: 100, wins: [46, 54], ties: 0, lengths: [1], live: false }).verdict, "pass, near the line");
  assert.equal(judge({ games: 1000, wins: [0, 330, 330, 340], ties: 0, lengths: [1], live: true }).verdict, "pass");
  const rows = plan(["glass", "inch"]);
  assert.deepEqual(rows.filter((x) => x.name === "glass").map((x) => x.seats), [2, 3, 4, 5, 6, 2, 3, 4, 5, 6]);
  assert.ok(rows.some((x) => x.name === "inch" && x.live && x.slots > 2));
  const g = playOne("glass", "ours", 2, 1);
  assert.ok(g.winners.length >= 1 && g.length > 0 && g.why);
});
