// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Refusal, canon, chance, checkGame, createMatch, fingerprint, next, openSave, readOptions, seedState, sha256, whenReplayFails } from "../src/core/index.js";
import { playScript, stones } from "./fixtures/stones.js";
import { probe } from "./fixtures/probe.js";

const bytes = (s) => new TextEncoder().encode(s);
const refused = (code) => (e) => e instanceof Refusal && e.code === code;
const game = (seed = "a", options) => playScript(createMatch(stones, { seed, options }));

test("our SHA-256 agrees with Node's for every length from 0 to 300", () => {
  for (let n = 0; n <= 300; n++) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 31 + n) & 255);
    assert.equal(sha256(b), createHash("sha256").update(b).digest("hex"), `length ${n}`);
  }
  assert.equal(sha256(bytes("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
test("text form: key order never matters, list order does", () => {
  assert.equal(canon({ b: 1, a: [1, 2] }), canon({ a: [1, 2], b: 1 }));
  assert.notEqual(canon([1, 2]), canon([2, 1]));
  assert.equal(canon(-0), "0");
});
test("text form refuses what machines may disagree on", () => {
  const loop = []; loop.push(loop);
  for (const bad of [0.5, NaN, Infinity, 2 ** 53, undefined, () => 1, 1n, Symbol("x"), new Date(0), new Map(), [, 1], { a: undefined }, "\ud800", "\udc00x", loop]) assert.throws(() => canon(bad), TypeError);
});
test("chance: the same seed gives the same draws, another seed does not", () => {
  const run = (s) => { const d = chance(seedState(s)); return Array.from({ length: 50 }, () => d.below(1000)); };
  assert.deepEqual(run("x"), run("x"));
  assert.notDeepEqual(run("x"), run("y"));
});
test("chance: whole numbers in range, and dice are even within a tolerance", () => {
  const d = chance(seedState("even")), n = Array(6).fill(0);
  for (let i = 0; i < 60000; i++) n[d.die() - 1]++;
  for (const c of n) assert.ok(Math.abs(c - 10000) < 400, String(n));
  for (const bad of [0, -1, 1.5, 2 ** 32 + 1, NaN]) assert.throws(() => d.below(bad), RangeError);
  let s = seedState("range");
  for (let i = 0; i < 1000; i++) { const [v, t] = next(s); s = t; assert.ok(Number.isInteger(v) && v >= 0 && v < 2 ** 32 && t.every((x) => Number.isInteger(x) && x >= 0 && x < 2 ** 32)); }
});
test("chance: a shuffle keeps every item and leaves its input alone", () => {
  const list = Object.freeze([1, 2, 3, 4, 5]);
  assert.deepEqual(chance(seedState("s")).shuffle(list).sort(), [1, 2, 3, 4, 5]);
});
test("a game must have every part", () => {
  for (const k of ["id", "version", "options", "setup", "turn", "moves", "apply", "result"]) assert.throws(() => checkGame({ ...stones, [k]: undefined }), TypeError);
  assert.throws(() => checkGame({ ...stones, id: "Bad Id" }), TypeError);
  assert.throws(() => checkGame({ ...stones, options: { x: { values: [1], normal: 2 } } }), TypeError);
});
test("options: normal values filled in, anything else refused", () => {
  assert.deepEqual(readOptions(stones, { goal: 12 }), { seats: 2, goal: 12 });
  for (const bad of [{ seats: 9 }, { seats: "2" }, { colour: 1 }, { seats: 2.5 }, { toString: 1 }, { seats: undefined }]) assert.throws(() => readOptions(stones, bad), refused("option"));
});
test("a refused move changes nothing", () => {
  const m = createMatch(stones, { seed: "r" }), before = m.fingerprint();
  assert.throws(() => m.play({ do: "bank" }), refused("illegal"));
  assert.throws(() => m.play({ do: "roll", extra: 1 }), refused("illegal"));
  for (const bad of [undefined, 0.5, () => 1, "\ud800"]) assert.throws(() => m.play(bad), refused("shape"));
  assert.equal(m.fingerprint(), before);
  assert.equal(m.list.length, 0);
});
test("a position cannot be changed from outside, nor the list of moves", () => {
  const m = game();
  assert.throws(() => { m.position.banked[0] = 99; }, TypeError);
  m.list.push({ do: "bank" }); m.list[0].do = "bank";
  assert.equal(openSave(m.save(), [stones]).match.fingerprint(), m.fingerprint());
});
test("changing a move object after playing it does nothing", () => {
  const m = createMatch(stones, { seed: "q" }), mv = { do: "roll" };
  m.play(mv); mv.do = "bank";
  assert.deepEqual(m.list, [{ do: "roll" }]);
});
test("no move after the end", () => { const m = game(); assert.equal(m.turn, null); assert.ok(m.result); assert.deepEqual(m.legal(), []); assert.throws(() => m.play({ do: "roll" }), refused("over")); });
test("undo goes back exactly, and the same move rolls the same dice", () => {
  const m = game("u"), end = m.fingerprint(), n = m.list.length, last = m.list[n - 1];
  assert.ok(m.undo()); assert.notEqual(m.fingerprint(), end); m.play(last); assert.equal(m.fingerprint(), end);
  while (m.undo()); assert.equal(m.fingerprint(), createMatch(stones, { seed: "u" }).fingerprint()); assert.equal(m.undo(), false);
});
test("any moment can be looked at", () => { const m = game("w"); assert.equal(m.at(m.list.length), m.position); assert.equal(m.at(0).pot, 0); for (const bad of [-1, 0.5, 1e6]) assert.throws(() => m.at(bad), RangeError); });
test("200 games save and reopen to the same fingerprint", () => {
  for (let s = 0; s < 200; s++) {
    const m = game("g" + s, { seats: 2 + (s % 3), goal: s % 2 ? 12 : 20 }), { match, warning } = openSave(m.save(), [stones]);
    assert.equal(match.fingerprint(), m.fingerprint()); assert.equal(warning, ""); assert.equal(match.save(), m.save());
  }
});
test("the fingerprint covers seed, options and place in the game", () => {
  const a = createMatch(stones, { seed: "1" }), prints = new Set([a.fingerprint(), createMatch(stones, { seed: "2" }).fingerprint(), createMatch(stones, { seed: "1", options: { goal: 12 } }).fingerprint()]);
  a.play({ do: "roll" }); prints.add(a.fingerprint());
  assert.equal(prints.size, 4);
});
test("files that are not saves are refused with a reason, never a crash", () => {
  const good = JSON.parse(game().save());
  for (const bad of ["", "null", "[]", "{}", "{", '"x"', "x".repeat(2000001), JSON.stringify({ ...good, extra: 1 }), JSON.stringify({ ...good, moves: {} }), JSON.stringify({ ...good, seed: 1 }), JSON.stringify({ ...good, end: 1 }), JSON.stringify({ ...good, options: [] }), JSON.stringify({ ...good, options: null })]) assert.throws(() => openSave(bad, [stones]), refused("file"), bad.slice(0, 30));
  assert.throws(() => openSave(undefined, [stones]), refused("file"));
  assert.throws(() => openSave(JSON.stringify({ ...good, format: 2 }), [stones]), refused("format"));
  assert.throws(() => openSave(JSON.stringify({ ...good, game: "chess" }), [stones]), refused("game"));
  assert.throws(() => openSave(JSON.stringify({ ...good, version: "0" }), [stones]), refused("version"));
  assert.throws(() => openSave(JSON.stringify({ ...good, options: { seats: 99 } }), [stones]), refused("option"));
  assert.throws(() => openSave('{"__proto__":{},' + game().save().slice(1), [stones]), refused("file"));
});
test("a tampered save is noticed, whatever the replay policy is", () => {
  const m = game("t"), f = JSON.parse(m.save());
  const open = (x) => { try { return openSave(JSON.stringify(x), [stones]).warning || "opened clean"; } catch (e) { assert.ok(e instanceof Refusal); return "refused"; } };
  assert.notEqual(open({ ...f, end: "0000000000000000" }), "opened clean");
  assert.notEqual(open({ ...f, moves: f.moves.slice(0, -1) }), "opened clean");
  assert.notEqual(open({ ...f, moves: [...f.moves, { do: "roll" }] }), "opened clean");
  assert.notEqual(open({ ...f, moves: f.moves.map((x, i) => (i === 1 ? { do: "cheat" } : x)) }), "opened clean");
  assert.notEqual(open({ ...f, seed: f.seed + "x" }), "opened clean");
});
test("the replay policy answers refuse or keep for every problem", () => {
  for (const code of ["illegal", "shape", "over", "end"]) for (const index of [0, 5, 10]) assert.ok(["refuse", "keep"].includes(whenReplayFails({ code, index, total: 10 })));
});
test("a bug in a game is not mistaken for a bad file", () => {
  const broken = { ...stones, apply: () => { throw new Error("bug"); } };
  assert.throws(() => openSave(game().save(), [broken]), (e) => !(e instanceof Refusal) && e.message === "bug");
  assert.throws(() => createMatch({ ...stones, setup: () => ({ x: 0.5 }) }), TypeError);
});
test("the probe gives the same answers twice, and known ones", () => {
  const a = probe();
  assert.deepEqual(a, probe());
  assert.equal(a.empty, createHash("sha256").digest("hex"));
  assert.equal(a.keys, '{"":7,"10":4,"9":5,"B":3,"a":2,"b":1,"é":6}');
  assert.equal(fingerprint([1]), fingerprint([1]));
});
