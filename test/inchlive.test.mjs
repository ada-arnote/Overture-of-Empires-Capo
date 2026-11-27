// SPDX-License-Identifier: AGPL-3.0-or-later
// An Inch of Ink in real time between two browsers: the rules for two people (the open option `people`), and the lockstep exchange
// (src/core/lockstep.js) between two fake browsers joined by a channel this test can slow, cut and tamper with.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEALT, Refusal, chance, createMatch, openSave, seedState } from "../src/core/index.js";
import { DELAY, SUM, TICK, createLockstep, quickSum } from "../src/core/lockstep.js";
import { inch, liveBoardFor } from "../src/games/inch/rules.js";
import { NONE, RIVALS, liveAllows, liveMoves, liveMovesOf, pactOn, person } from "../src/games/inch/live.js";
import { SCRIPTS, scripted } from "./fixtures/inchscript.js";

const TWO = { style: "custom", live: true, nations: 8, map: "continents", rivals: "even", people: 2 };
const two = (seed = "two", more = {}) => createMatch(inch, { seed, options: { ...TWO, ...more } });

test("one person: the rules for two leave a game for one exactly as it was (fingerprints taken before the change)", () => {
  // played by a fixed script of every kind of order, under version 12 as it stood before games for two
  const before = { "golden classic": [88, 329, "408045f74fe4c0c7"], "golden dries": [69, 255, "e124640cc97c55d3"], "golden custom": [90, 332, "30e53f4d708b27c9"] };
  for (const [o, seed] of SCRIPTS) {
    const m = scripted(o, seed);
    assert.deepEqual([m.list.length, m.position.tick, m.fingerprint()], before[seed], seed);
    assert.ok(!("people" in m.options) && !("people" in m.position), "a game for one has no people");
  }
  assert.equal(inch.version, "12");
});

test("two people: both start where they choose, every order names its person, and the list and the quick check agree", () => {
  const m = two(), p = m.position, b = liveBoardFor(p);
  assert.deepEqual(p.people, [0, 1]);
  assert.equal(p.land[0] + p.land[1], 0, "neither person has land before they start");
  assert.ok(p.land.slice(2).every((n) => n > 0), "the bots have theirs");
  assert.ok(!p.names.includes("You"), "both people are named as nations");
  const list = liveMoves(p, b);
  assert.ok(list.every((x) => x.do === "spawn" && (x.by === 0 || x.by === 1)) && list.some((x) => x.by === 1), "each person's starts, named");
  for (const bad of [{ do: "spawn", at: list[0].at }, { ...list[0], by: 2 }, { ...list[0], by: "1" }, { do: "tick", n: 1 }]) assert.equal(liveAllows(p, b, bad), false, JSON.stringify(bad));
  m.play(list.find((x) => x.by === 0));
  assert.equal(m.position.phase, "spawn", "the game waits for the second person");
  assert.equal(liveMovesOf(m.position, b, 0).length, 0, "a person who has started waits");
  assert.throws(() => m.play({ do: "tick", n: 1 }), (e) => e instanceof Refusal);
  m.play(liveMovesOf(m.position, b, 1).map((x) => ({ ...x, by: 1 }))[0]);
  assert.equal(m.position.phase, "play");
  assert.equal(m.position.human, 0, "an order of the second person leaves the position's own seat alone");
  for (let i = 0; i < 8; i++) m.play({ do: "tick", n: 4 });
  const q = m.position, all = liveMoves(q, b);
  assert.ok(all.some((x) => x.do === "attack" && x.by === 1) && all.some((x) => x.do === "attack" && x.by === 0));
  for (const x of all) assert.ok(liveAllows(q, b, x), JSON.stringify(x));
  for (const x of all.slice(0, 40)) if (x.by !== undefined) assert.equal(liveAllows(q, b, { ...x, by: 1 - x.by }), liveMoves(q, b).some((y) => JSON.stringify(y) === JSON.stringify({ ...x, by: 1 - x.by })));
  // the second person's attack spends the second person's strength
  const had = q.troops[1], go = all.find((x) => x.do === "attack" && x.by === 1 && x.pct === 50);
  m.play(go);
  assert.equal(m.position.troops[1], had - Math.floor(had / 2));
  assert.ok(m.position.attacks.some((a) => a.by === 1));
  assert.ok(person(q, 1) && person(q, 0) && !person(q, 2));
});

test("two people: both grow as people do, bots leave both alone in the truce, and each keeps a truce of their own", () => {
  const m = two("truce", { rivals: "gentle" }), b = liveBoardFor(m.position);
  m.play(liveMoves(m.position, b).find((x) => x.by === 0));
  m.play(liveMoves(m.position, b).find((x) => x.by === 1));
  let attacked = false;
  while (m.position.tick < RIVALS.gentle.truce - 4 && m.turn !== null) {
    m.play({ do: "tick", n: 4 });
    attacked ||= m.position.attacks.some((a) => person(m.position, a.to) && !person(m.position, a.by));
  }
  assert.ok(!attacked, "no bot attacks either person during the truce");
  const p = m.position, near = (h) => liveMovesOf(p, b, h).find((x) => x.do === "pact");
  for (const h of [0, 1]) {
    const offer = near(h);
    if (!offer) continue;
    m.play({ ...offer, by: h });
    assert.equal(pactOn(m.position, h), offer.to, `person ${h} keeps a truce`);
    assert.ok(!liveMovesOf(m.position, b, h).some((x) => x.do === "pact"), "one truce at a time");
  }
  assert.ok(!liveMoves(p, b).some((x) => x.do === "pact" && person(p, x.to)), "people do not take truces with each other here");
  const back = openSave(m.save(), [inch]).match;
  assert.equal(back.fingerprint(), m.fingerprint(), "a game for two replays from its seed and moves");
});

// ---- two fake browsers ----
let counter = 0;
const secret = (side) => () => `${side === "host" ? "a" : "b"}${(++counter).toString(16).padStart(31, "0")}`;

/** Two sides joined by a channel with `late` frames of delay each way. Each keeps its own match, as each page does. */
function pair({ options = TWO, late = 1, play } = {}) {
  const sides = {}, wire = { host: [], guest: [] }, other = (s) => (s === "host" ? "guest" : "host");
  let t = 0, cut = false, spy = null;
  for (const side of ["host", "guest"]) {
    const me = { side, seat: side === "host" ? 0 : 1, m: null, stops: [], pauses: [], notes: [] };
    me.lock = createLockstep({
      side, secret: secret(side), game: inch, options, now: () => t * 250,
      match: () => me.m,
      play: (mv, salt) => { try { (play?.(me, mv, salt) ?? me.m.play(mv, salt)); return true; } catch (e) { if (e instanceof Refusal) return false; throw e; } },
      clock: (m) => m.position.phase === "play" && !m.position.over,
      dealt: (seed) => { me.m = createMatch(inch, { seed, options }); },
      adopt: (save) => { me.m = openSave(save, [inch]).match; },
      paused: (on, who) => me.pauses.push([on, who, me.lock.frame]),
      stop: (text) => me.stops.push(text), note: (text) => me.notes.push(text),
    });
    sides[side] = me;
  }
  const join = (only = ["host", "guest"]) => { for (const s of only) sides[s].lock.attach((x) => { if (!cut) wire[other(s)].push({ at: t + late, x: JSON.parse(JSON.stringify(spy ? spy(s, x) : x)) }); }); };
  const deliver = (all = false) => { for (let again = true; again;) { again = false; for (const s of ["host", "guest"]) while (wire[s].length && (all || wire[s][0].at <= t)) { again = true; sides[s].lock.receive(wire[s].shift().x); } } };
  /** One frame of time: deliver what has arrived, each side sends its frame. */
  const frame = (orders) => { t++; deliver(); for (const s of ["host", "guest"]) { orders?.(sides[s]); sides[s].lock.step(); } deliver(); };
  return {
    sides, join, deliver, frame,
    set cut(v) { cut = v; if (v) { wire.host.length = 0; wire.guest.length = 0; } },
    set spy(f) { spy = f; },
    drop(s) { sides[s].lock.detach(); },
    settle() { for (let k = 0; k < 20; k++) { t++; deliver(true); } },
  };
}
/** A person who starts, then now and then gives an order chosen by their own dice (any order the panel would offer). */
const player = (seed) => {
  const d = chance(seedState(seed));
  return (me) => {
    const m = me.m;
    if (!m || m.turn === null || d.below(4)) return;
    const p = m.position, b = liveBoardFor(p), own = liveMovesOf(p, b, me.seat).filter((x) => x.do !== "tick");
    if (p.phase === "spawn" ? !p.land[me.seat] && own.length : own.length && d.below(3) === 0) me.lock.order(own[d.below(own.length)]);
  };
};
const orders = (a, b) => (me) => (me.side === "host" ? a : b)(me);

test("lockstep: two browsers deal together, play the same frames from the same orders, check sums every second, and replay", () => {
  const P = pair({ late: 1 }), { host, guest } = P.sides;
  P.join(); P.deliver(true);
  assert.ok(host.m && guest.m, "dealt on both sides");
  assert.equal(host.m.seed, guest.m.seed);
  assert.ok(host.m.seed.startsWith(DEALT));
  const go = orders(player("h"), player("g"));
  for (let k = 0; k < 240; k++) P.frame(go);
  P.settle();
  assert.deepEqual([host.stops, guest.stops], [[], []]);
  assert.equal(host.lock.frame, guest.lock.frame);
  assert.ok(host.lock.frame >= 230, `frames played: ${host.lock.frame}`);
  assert.equal(host.m.fingerprint(), guest.m.fingerprint(), "the same game on both sides");
  assert.equal(host.m.position.phase, "play", "both people started");
  assert.ok(host.m.list.filter((x) => x.by === 1).length > 2 && host.m.list.filter((x) => x.by === 0).length > 2, "both people's orders are in the game");
  const ticks = host.m.list.filter((x) => x.do === "tick").length;
  assert.ok(Math.abs(ticks - Math.floor(host.lock.frame / TICK)) <= 4, `a tick every ${TICK} frames once the clock runs (${ticks} ticks in ${host.lock.frame} frames)`);
  assert.ok(host.m.salts.some(Boolean), "the ticks' dice are mixed with both browsers' secrets");
  const f = host.lock.figures();
  assert.ok(f.checked >= Math.floor(host.lock.frame / SUM) - 2, `sums matched: ${f.checked}`);
  assert.ok(f.orders > 0 && f.lag >= DELAY * 250 && f.lag <= (DELAY + 3) * 250, `an order is played ${f.lag} ms after it is given`);
  const back = openSave(host.m.save(), [inch]).match;
  assert.equal(back.fingerprint(), host.m.fingerprint(), "the seed and the move list replay the whole game");
});

test("lockstep: the same orders with other secrets give other dice, so neither browser alone decides the bots' chances", () => {
  const P = pair(), Q = pair();
  for (const X of [P, Q]) { X.join(); X.deliver(true); }
  assert.notEqual(P.sides.host.m.seed, Q.sides.host.m.seed, "each deal is fresh");
  // the same deal and orders, salts drawn afresh: the bots' choices part
  const seed = P.sides.host.m.seed, a = createMatch(inch, { seed, options: TWO }), c = createMatch(inch, { seed, options: TWO }), b = liveBoardFor(a.position);
  for (const m of [a, c]) { m.play(liveMoves(m.position, b).find((x) => x.by === 0)); m.play(liveMoves(m.position, b).find((x) => x.by === 1)); }
  for (let i = 0; i < 120; i++) { a.play({ do: "tick", n: 1 }, `${(i * 7919).toString(16).padStart(8, "0").slice(-8)}`); c.play({ do: "tick", n: 1 }, `${(i * 104729 + 3).toString(16).padStart(8, "0").slice(-8)}`); }
  assert.notEqual(a.fingerprint(), c.fingerprint());
});

test("lockstep: a pause is seen by both at the same frame; the clock stands while orders still go; either side resumes", () => {
  const P = pair({ late: 2 }), { host, guest } = P.sides;
  P.join(); P.deliver(true);
  const go = orders(player("h2"), player("g2"));
  for (let k = 0; k < 60; k++) P.frame(go);
  host.lock.control("pause");
  for (let k = 0; k < 6; k++) P.frame();
  assert.ok(host.lock.paused && guest.lock.paused);
  assert.deepEqual(host.pauses, guest.pauses, "paused at the same frame on both sides");
  const tick = host.m.position.tick, moves = host.m.list.length;
  for (let k = 0; k < 40; k++) P.frame(go);
  assert.equal(host.m.position.tick, tick, "no tick while paused");
  assert.ok(host.m.list.length > moves, "orders still go while paused");
  guest.lock.control("go");
  for (let k = 0; k < 20; k++) P.frame(go);
  P.settle();
  assert.ok(!host.lock.paused && host.m.position.tick > tick);
  assert.deepEqual(host.pauses, guest.pauses);
  assert.deepEqual(host.pauses.map(([on, who]) => [on, who]), [[true, "host"], [false, "guest"]]);
  assert.equal(host.m.fingerprint(), guest.m.fingerprint());
});

test("lockstep: a dropped channel stalls both clocks; joined again, each sends what the other missed and play goes on in step", () => {
  const P = pair({ late: 1 }), { host, guest } = P.sides;
  P.join(); P.deliver(true);
  const go = orders(player("h3"), player("g3"));
  for (let k = 0; k < 80; k++) P.frame(go);
  P.cut = true; // messages in flight are lost
  const at = host.lock.frame;
  for (let k = 0; k < 40; k++) P.frame(go);
  assert.ok(host.lock.frame - at <= DELAY + 1 && guest.lock.frame - at <= DELAY + 1, "the clock stands within the input delay");
  assert.ok(host.lock.waiting && guest.lock.waiting);
  P.drop("host"); P.drop("guest");
  P.cut = false;
  P.join();
  for (let k = 0; k < 80; k++) P.frame(go);
  P.settle();
  assert.deepEqual([host.stops, guest.stops], [[], []]);
  assert.equal(host.lock.frame, guest.lock.frame);
  assert.ok(host.lock.frame > at + 70);
  assert.equal(host.m.fingerprint(), guest.m.fingerprint(), "the same game after the drop");
  assert.ok(host.lock.figures().stalls > 0);
});

test("lockstep: a browser that lost the game (a reload) takes the other's where it stands, and both play on in step", () => {
  const P = pair({ late: 1 }), { host, guest } = P.sides;
  P.join(); P.deliver(true);
  const go = orders(player("h4"), player("g4"));
  for (let k = 0; k < 70; k++) P.frame(go);
  const old = openSave(guest.m.save(), [inch]).match; // a copy kept a little earlier, as Continue would bring back
  for (let k = 0; k < 30; k++) P.frame(go);
  // the guest's page reloads: a new live table, its game brought back from what it kept (older), then joined again
  P.drop("host"); P.drop("guest");
  guest.lock = createLockstep({ side: "guest", secret: secret("guest"), game: inch, options: TWO, match: () => guest.m, play: (mv, salt) => { try { guest.m.play(mv, salt); return true; } catch (e) { if (e instanceof Refusal) return false; throw e; } }, clock: (m) => m.position.phase === "play" && !m.position.over, dealt: () => {}, adopt: (save) => { guest.m = openSave(save, [inch]).match; }, paused: () => {}, stop: (t) => guest.stops.push(t), note: (t) => guest.notes.push(t) });
  guest.m = old;
  P.join();
  for (let k = 0; k < 60; k++) P.frame(go);
  P.settle();
  assert.deepEqual([host.stops, guest.stops], [[], []]);
  assert.equal(host.m.fingerprint(), guest.m.fingerprint(), "the reloaded side took the game and plays on in step");
  assert.ok(host.notes.some((t) => /came back/.test(t)));
});

test("lockstep: a deliberate tamper on one side is caught by the next sum, and live play stops on both sides", () => {
  let tampered = -1;
  const P = pair({
    late: 1,
    // the guest's copy plays one extra tick at frame 50: its game drifts from the host's
    play: (me, mv, salt) => { me.m.play(mv, salt); if (me.side === "guest" && mv.do === "tick" && tampered < 0 && me.lock.frame >= 50) { tampered = me.lock.frame; me.m.play({ do: "tick", n: 1 }); } return true; },
  });
  const { host, guest } = P.sides;
  P.join(); P.deliver(true);
  const go = orders(player("h5"), player("g5"));
  for (let k = 0; k < 90 && !host.stops.length; k++) P.frame(go);
  P.settle();
  assert.ok(tampered >= 50);
  assert.ok(host.stops.length && guest.stops.length, "both sides stop");
  assert.match(host.stops[0], /see this game differently/);
  assert.ok(host.lock.frame - tampered <= SUM + DELAY + 1, `caught within a second: tampered at ${tampered}, stopped at ${host.lock.frame}`);
  assert.ok(host.lock.stopped && !host.lock.step(), "a stopped table sends nothing more");
});

test("lockstep: a changed secret, an order for the other's seat, or a frame changed after it was sent stops live play", () => {
  for (const [name, change, want] of [
    ["secret", (s, x) => (s === "guest" && x.t === "r" && x.f === 20 ? { ...x, r: "f".repeat(32) } : x), /changed a secret/],
    ["seat", (s, x) => (s === "guest" && x.t === "f" && x.f === 20 ? { ...x, o: [{ do: "tick", n: 1, by: 0 }] } : x), /seat that is not its own/],
    ["tick", (s, x) => (s === "guest" && x.t === "f" && x.f === 20 ? { ...x, o: [...x.o, ...Array(9).fill({ do: "recall", to: 3, by: 1 })] } : x), /cannot read/],
  ]) {
    const P = pair();
    P.join(); P.deliver(true);
    P.spy = change;
    for (let k = 0; k < 40 && !P.sides.host.stops.length; k++) P.frame(orders(player("h6"), player("g6")));
    assert.match(P.sides.host.stops[0] || "", want, name);
  }
});

test("lockstep: a quick sum tells games apart and is quick", () => {
  const a = two("sum"), b = liveBoardFor(a.position);
  a.play(liveMoves(a.position, b).find((x) => x.by === 0)); a.play(liveMoves(a.position, b).find((x) => x.by === 1));
  const c = openSave(a.save(), [inch]).match;
  assert.equal(quickSum(a), quickSum(c));
  c.play({ do: "tick", n: 1 });
  assert.notEqual(quickSum(a), quickSum(c));
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) quickSum(c);
  assert.ok((performance.now() - t0) / 20 < 15, "well under a frame");
  assert.notEqual(NONE, 0);
});
