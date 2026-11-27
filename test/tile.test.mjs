// SPDX-License-Identifier: AGPL-3.0-or-later
// Hedge and Highway (working name), the tile game: its tiles, features, scores, end, replay and first bot.
// Scores are checked on boards built by hand; no win rates or whole-game fingerprints are written down here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canon, createMatch } from "../src/core/index.js";
import { KINDS, LENGTHS, MIX, ORDER, ROTS, START, edgeOf, featAt } from "../src/games/tile/tiles.js";
import { NONE, fits, freeOf, regions, shape, spots, tile, worth } from "../src/games/tile/rules.js";
import { TIERS, choose } from "../src/games/tile/bot.js";
import { SLOW, botGame, ended, inList, replays, sameEachStep } from "./fixtures/bots.js";

const K = (name) => { const k = KINDS.findIndex((x) => x.name === name); assert.ok(k >= 0, name); return k; };
const feat = (name, kind, n = 0) => KINDS[K(name)].feats.map((F, f) => [F, f]).filter(([F]) => F.kind === kind)[n][1];
/** A position to build by hand: a real setup, thawed, with the board, stewards and tiles given. */
function board(laid, { men = [], row, bag = [], seats = 2, style = "classic", seat = 0, home } = {}) {
  const p = structuredClone(createMatch(tile, { seed: "hand", options: { seats, style } }).position);
  return Object.assign(p, { laid, men, row: row ?? p.row, bag, seat, home: home ?? Array(seats).fill(p.rule.stewards) });
}
const rootOf = (p, t, f) => shape(p.laid).find(t * 8 + f);
const infoOf = (p, t, f) => shape(p.laid).info.get(rootOf(p, t, f));
const lay = (p, m) => { assert.ok(tile.allows(p, m), `not allowed: ${canon(m)}`); assert.ok(inList(tile.moves(p), m), `not listed: ${canon(m)}`); return tile.apply(p, m); };

test("every tile is whole: each port belongs to one feature, and a meadow edge is one meadow", () => {
  assert.equal(MIX, 76);
  assert.equal(ORDER.length, MIX);
  KINDS.forEach((Kd, k) => {
    assert.ok(Kd.port.every((f) => f >= 0 && f < Kd.feats.length), Kd.name);
    assert.ok(Kd.feats.length <= 8, `${Kd.name}: a node holds 8 features a tile`);
    for (let e = 0; e < 4; e++) {
      const p3 = [0, 1, 2].map((q) => Kd.port[e * 3 + q]), kinds = p3.map((f) => Kd.feats[f].kind);
      if (Kd.edge[e] === 2) assert.ok(kinds.every((x) => x === "town") && p3[0] === p3[2], `${Kd.name} edge ${e}`);
      else if (Kd.edge[e] === 1) assert.deepEqual(kinds, ["meadow", "lane", "meadow"], `${Kd.name} edge ${e}`);
      else assert.ok(kinds.every((x) => x === "meadow") && p3[0] === p3[1] && p3[1] === p3[2], `${Kd.name} edge ${e}`);
    }
    Kd.feats.forEach((F, f) => { if (F.kind !== "well") assert.ok(Kd.ports[f].length, `${Kd.name}: feature ${f} reaches an edge`); });
    assert.equal(ORDER.filter((x) => x === k).length, Kd.count, `${Kd.name}: the mix order holds the whole mix`);
    assert.ok(ROTS[k].length >= 1 && ROTS[k][0] === 0);
  });
  // tiles that look the same turned are offered once
  for (const [name, n] of [["Straight lane", 2], ["Four lanes meet", 1], ["Well in a meadow", 1], ["Walled town with a market", 1], ["Two town edges, facing", 2], ["Town across", 2], ["Bending lane", 4]]) assert.equal(ROTS[K(name)].length, n, name);
  assert.equal(START, K("Town edge and lane"));
  // the even order: any bag of 36 or more from it has every kind the full mix has at least twice of
  const short = ORDER.slice(0, LENGTHS.short[0]);
  KINDS.forEach((Kd, k) => { if (Kd.count >= 2) assert.ok(short.includes(k), `${Kd.name} in a short bag`); });
});

test("every gap with one or two edges set can be filled by at least three kinds", () => {
  for (let a = 0; a < 4; a++) for (let b = a; b < 4; b++) for (const ta of [0, 1, 2]) for (const tb of [0, 1, 2]) {
    if (a === b && ta !== tb) continue;
    const n = KINDS.filter((_, k) => [0, 1, 2, 3].some((r) => edgeOf(k, r, a) === ta && edgeOf(k, r, b) === tb)).length;
    assert.ok(n >= 3, `edges ${a}:${ta} ${b}:${tb}: ${n} kinds`);
  }
});

test("a straight lane between two junctions finishes, scores 1 a tile, and its steward comes home", () => {
  const three = K("Three lanes meet");
  let p = board([[0, 0, START, 0]], { row: [three], bag: [three, three] });
  // the junction east of the start: its west lane joins the start's lane; a steward goes on it
  const west = KINDS[three].feats.findIndex((F) => F.kind === "lane" && F.edges[0] === 3);
  p = lay(p, { pick: 0, at: [1, 0], rot: 0, put: west }).position;
  assert.deepEqual(p.home, [5, 6]);
  assert.equal(p.men.length, 1);
  // the second junction, to the west, closes it: three tiles, 3 points
  const { position: q, events } = lay(p, { pick: 0, at: [-1, 0], rot: 0, put: NONE });
  assert.deepEqual(q.score, [3, 0]);
  assert.deepEqual(q.home, [6, 6]);
  assert.equal(q.men.length, 0);
  const s = events.find((e) => e.kind === "score");
  assert.ok(s && s.what === "lane" && s.points === 3 && s.done && s.when === "now" && canon(s.seats) === "[0]");
});

test("a town finished by the tile that claims it scores 2 a tile at once", () => {
  const edge = K("Town edge");
  const { position: q, events } = lay(board([[0, 0, START, 0]], { row: [edge], bag: [edge] }), { pick: 0, at: [0, -1], rot: 2, put: feat("Town edge", "town") });
  assert.deepEqual(q.score, [4, 0]);
  assert.deepEqual(q.home, [6, 6], "the steward came straight home");
  assert.equal(events.filter((e) => e.kind === "score").length, 1);
});

test("a shared town pays each leader in full; more stewards take it alone; a claimed town takes no more", () => {
  const edge = K("Town edge"), across = K("Town across");
  const laid = [[0, 0, START, 0], [0, -2, edge, 2]];
  const tie = board(laid, { row: [across], bag: [edge], men: [[0, 0, 0], [1, 0, 1]], home: [5, 5] });
  // the town across, turned once, joins the start's town to the one above: three tiles, closed
  assert.ok(!tile.moves(tie).some((m) => m.at[0] === 0 && m.at[1] === -1 && m.put === feat("Town across", "town")), "the joined town is claimed");
  const { position: q } = lay(tie, { pick: 0, at: [0, -1], rot: 1, put: NONE });
  assert.deepEqual(q.score, [6, 6]);
  assert.deepEqual(q.home, [6, 6]);
  const lead = board(laid, { row: [across], bag: [edge], men: [[0, 0, 0], [1, 0, 0], [1, 0, 1]], home: [4, 5] });
  const { position: r } = lay(lead, { pick: 0, at: [0, -1], rot: 1, put: NONE });
  assert.deepEqual(r.score, [6, 0], "two stewards against one: the lead alone");
  assert.deepEqual(r.home, [6, 6]);
});

test("worth: finished, half, one a tile and nothing, with markets and a lane between two gates", () => {
  const walled = K("Walled town with a market"), gate = K("Town gate");
  const p = board([[0, 0, START, 0], [0, -1, walled, 0]]);
  const R = regions(p), town = infoOf(p, 0, 0);
  assert.equal(town.tiles, 2); assert.equal(town.markets, 1); assert.equal(town.open, 3);
  assert.equal(worth(R, town, "done"), 6); assert.equal(worth(R, town, "half"), 3); assert.equal(worth(R, town, "tile"), 3); assert.equal(worth(R, town, "none"), 0);
  const lane = infoOf(p, 0, feat("Town edge and lane", "lane"));
  assert.equal(lane.open, 2); assert.equal(worth(R, lane, "done"), 1); assert.equal(worth(R, lane, "half"), 0);
  // two gates, one lane between them: closed by its own ends, worth double
  const g = board([[0, 0, gate, 0], [0, 1, gate, 2]]), L = infoOf(g, 0, feat("Town gate", "lane"));
  assert.equal(L.open, 0); assert.equal(L.gates.length, 2); assert.equal(worth(regions(g), L, "done"), 4);
});

test("a well scores 1 for itself and each tile round it; surrounded, it scores 9 at once", () => {
  const well = K("Well in a meadow"), w = feat("Well in a meadow", "well");
  const ring = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
  const p = board([[0, 0, well, 0], ...ring.map(([x, y]) => [x, y, well, 0])], { row: [well], bag: [well], men: [[0, w, 1]], seat: 0, home: [6, 5] });
  const i = infoOf(p, 0, w);
  assert.equal(i.tiles, 8); assert.equal(i.open, 1);
  assert.equal(worth(regions(p), i, "tile"), 8); assert.equal(worth(regions(p), i, "half"), 4);
  const { position: q, events } = lay(p, { pick: 0, at: [-1, 0], rot: 0, put: NONE });
  assert.deepEqual(q.score, [0, 9], "the well's steward scores, whoever laid the last tile");
  assert.ok(events.some((e) => e.kind === "score" && e.what === "well" && e.points === 9));
});

test("a meadow pays 2 for each finished town it touches and 1 for each well in it", () => {
  const edge = K("Town edge"), well = K("Well in a meadow");
  const p = board([[0, 0, START, 0], [0, -1, edge, 2], [1, -1, well, 0]]);
  const north = infoOf(p, 0, feat("Town edge and lane", "meadow", 0)), south = infoOf(p, 0, feat("Town edge and lane", "meadow", 1));
  assert.equal(north.towns.length, 1); assert.equal(south.towns.length, 0);
  assert.equal(worth(regions(p), north), 2);
  assert.equal(worth(regions(p), south), 0);
  const above = infoOf(p, 1, feat("Town edge", "meadow"));
  assert.equal(above.wells, 1, "the well's meadow joins the meadow of the tile beside it");
  assert.equal(worth(regions(p), above), 3);
  // with meadows off, no steward goes to one
  const off = board([[0, 0, START, 0]], { style: "ours", row: [well] });
  assert.ok(tile.moves(off).every((m) => m.put === NONE || KINDS[well].feats[m.put].kind !== "meadow"));
});

test("a tile that fits nowhere is set aside and the next one drawn; the last tile ends the game", () => {
  const edge = K("Town edge"), walled = K("Walled town with a market"), straight = K("Straight lane");
  const p = board([[0, 0, START, 0]], { row: [edge], bag: [straight, walled] });
  const { position: q, events } = lay(p, { pick: 0, at: [0, -1], rot: 2, put: NONE }); // closes the only town: nothing walled fits now
  assert.ok(events.some((e) => e.kind === "discard" && e.tile === walled));
  assert.deepEqual(q.row, [straight]);
  assert.deepEqual(q.gone, [walled]);
  assert.equal(q.over, null);
  // the last tile: claimed features score as the rules say (Traditional: one a tile), then the end
  const last = board([[0, 0, START, 0]], { row: [straight], bag: [], men: [[0, feat("Town edge and lane", "town"), 1]], home: [6, 5] });
  const { position: r, events: ev } = lay(last, { pick: 0, at: [1, 0], rot: 1, put: NONE });
  assert.deepEqual(r.score, [0, 1]);
  assert.deepEqual(r.over.winners, [1]);
  assert.equal(tile.turn(r), null);
  assert.ok(ev.some((e) => e.kind === "score" && e.when === "end") && ev.at(-1).kind === "end");
  const tied = board([[0, 0, START, 0]], { row: [straight], bag: [] });
  assert.deepEqual(lay(tied, { pick: 0, at: [1, 0], rot: 1, put: NONE }).position.over.winners, [0, 1]);
});

test("the feature finder agrees with a plain flood fill over every port, on bot boards", () => {
  for (const seed of ["f1", "f2", "f3"]) {
    const m = botGame(tile, choose, { seed, options: { seats: 3 }, tiers: ["random"] }), laid = m.position.laid, at = new Map(laid.map(([x, y], t) => [`${x},${y}`, t]));
    // nodes: a port of a tile, or a well; joined inside a tile when one feature holds them, and across an edge port to port
    const node = (t, i) => t * 13 + i, edges = new Map(), link = (a, b) => { for (const [u, v] of [[a, b], [b, a]]) { if (!edges.has(u)) edges.set(u, []); edges.get(u).push(v); } };
    laid.forEach(([x, y, k, r], t) => {
      for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) if (featAt(k, r, i) === featAt(k, r, j)) link(node(t, i), node(t, j));
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], e) => { const o = at.get(`${x + dx},${y + dy}`); if (o !== undefined) for (let q = 0; q < 3; q++) link(node(t, e * 3 + q), node(o, ((e + 2) % 4) * 3 + 2 - q)); });
    });
    const S = shape(laid), group = new Map();
    laid.forEach((_, t) => {
      for (let i = 0; i < 12; i++) {
        if (group.has(node(t, i))) continue;
        const seen = new Set([node(t, i)]), todo = [node(t, i)];
        while (todo.length) for (const v of edges.get(todo.pop()) || []) if (!seen.has(v)) { seen.add(v); todo.push(v); }
        for (const v of seen) group.set(v, node(t, i));
      }
    });
    // the same partition both ways: two ports share a flood group exactly when they share a found feature
    const ports = laid.flatMap(([, , k, r], t) => Array.from({ length: 12 }, (_, i) => [t, i, S.find(t * 8 + featAt(k, r, i))]));
    const byRoot = new Map(), byFlood = new Map();
    for (const [t, i, root] of ports) {
      const g = group.get(node(t, i));
      if (byRoot.has(root)) assert.equal(byRoot.get(root), g, `seed ${seed}: tile ${t} port ${i}`); else byRoot.set(root, g);
      if (byFlood.has(g)) assert.equal(byFlood.get(g), root, `seed ${seed}: tile ${t} port ${i}`); else byFlood.set(g, root);
    }
  }
});

test("the quick check and the list of moves agree, and a move is refused anywhere else", () => {
  const m = createMatch(tile, { seed: "q", options: { seats: 2 } });
  for (let n = 0; n < 12; n++) {
    const p = m.position, list = tile.moves(p);
    assert.ok(list.length && list.every((x) => tile.allows(p, x)));
    for (const bad of [{ ...list[0], at: [99, 99] }, { ...list[0], put: 7 }, { ...list[0], pick: 5 }, { ...list[0], rot: 4 }, { ...list[0], extra: 1 }, { pick: 0, at: [0, 0], rot: 0, put: NONE }])
      assert.equal(tile.allows(p, bad), inList(list, bad), canon(bad));
    for (const [x, y] of spots(p.laid)) for (let r = 0; r < 4; r++) {
      const want = list.some((x2) => x2.at[0] === x && x2.at[1] === y && x2.rot === r && x2.put === NONE);
      assert.equal(want, ROTS[p.row[0]].includes(r) && fits(p.laid, x, y, p.row[0], r));
    }
    m.play(list[(n * 7) % list.length]);
  }
});

test("the score shown before a placement is the score the placement gives", () => {
  const m = createMatch(tile, { seed: "preview", options: { seats: 3 } });
  while (m.turn !== null && m.list.length < 30) {
    const p = m.position, mv = choose(p, { below: () => 0, pick: (l) => l[0] }, "normal"), shown = tile.apply(p, mv).position.score;
    m.play(mv);
    assert.deepEqual(m.position.score, shown);
  }
});

const SEATS = SLOW ? [2, 3, 4, 5] : [2, 4];
for (const style of ["classic", "ours", "custom"]) for (const seats of SEATS) {
  test(`bots play complete legal games: ${style}, ${seats} seats`, () => {
    const m = botGame(tile, choose, { seed: `${style}${seats}`, options: { style, seats, ...(style === "custom" ? { choice: 2, seasons: 3, stewards: 5, length: "short", rest: "none" } : {}) }, tiers: TIERS.slice(1) });
    const r = ended(m, seats), p = m.position;
    assert.equal(p.laid.length - 1 + p.gone.length, p.total, "every tile is laid or set aside");
    assert.ok(p.gone.length * 20 <= p.total, "few tiles set aside");
    assert.ok(p.score.every((v) => Number.isInteger(v) && v >= 0));
    assert.deepEqual(r.winners, p.score.flatMap((v, s) => (v === Math.max(...p.score) ? [s] : [])));
    assert.ok(m.list.some((x) => x.put !== NONE), "the bots send stewards");
    replays(m, [tile]);
  });
}

test("each move keeps the pieces whole; Capo's seasons send every steward home; a replay matches at every step", () => {
  const m = botGame(tile, choose, { seed: "season", options: { style: "ours", seats: 3 }, each(match) {
    const p = match.position;
    for (let s = 0; s < p.seats; s++) assert.equal(p.home[s] + p.men.filter((x) => x[2] === s).length, p.rule.stewards, `seat ${s}`);
    for (const [t, f] of p.men) assert.ok(t < p.laid.length && f < KINDS[p.laid[t][2]].feats.length);
    assert.ok(p.row.length <= p.rule.choice);
    if (match.events.some((e) => e.kind === "season")) assert.equal(p.men.length, 0);
  } });
  ended(m);
  assert.equal(m.position.season, 3);
  sameEachStep(m);
  // the random bot is legal too
  ended(botGame(tile, choose, { seed: "rand", options: { seats: 2, length: "short", style: "custom" }, tiers: ["random"] }));
});

test("options: each switch is used, and rule sets set their own", () => {
  const at = (options) => createMatch(tile, { seed: "o", options }).position;
  assert.equal(at({ style: "ours", seats: 3 }).row.length, 3);
  assert.equal(at({ style: "classic", seats: 4 }).total, 76);
  assert.equal(at({ style: "custom", seats: 2, choice: 2, length: "long" }).row.length, 2);
  assert.equal(at({ style: "custom", seats: 2, length: "long" }).total, 64);
  assert.equal(at({ style: "custom", seats: 2, stewards: 4 }).home[0], 4);
  assert.notDeepEqual(at({ seats: 2 }).bag, createMatch(tile, { seed: "other", options: { seats: 2 } }).position.bag, "the seed shuffles the bag");
  assert.deepEqual(at({ seats: 2 }).bag, at({ seats: 2 }).bag, "and the same seed shuffles it the same");
});
