// SPDX-License-Identifier: AGPL-3.0-or-later
// One game being played. It keeps the options, the seed and the list of moves; everything else follows from them.
//
// A game is a plain object:
//   id, version          text
//   options              { name: { values: [...], normal } }   house rules, as plain data
//   setup(options, dice) the first position
//   turn(position)       the seat to move, or null when the game is over
//   moves(position)      every legal move for that seat, as plain data
//   apply(position, move, dice) -> { position, events }
//   result(position)     { winners: [seat], why } when over, else null
//   allows(position, move) optional: a quick yes or no, for games whose list of moves is long
import { canon, deepFreeze } from "./canon.js";
import { fingerprint } from "./digest.js";
import { chance, seedState } from "./random.js";

export const FORMAT = 1;
const MAX_MOVES = 20000, MAX_FILE = 2000000;
const NEEDED = { setup: "function", turn: "function", moves: "function", apply: "function", result: "function", id: "string", version: "string", options: "object" };
const same = (a, b) => canon(a) === canon(b);

/** A refusal is a normal answer: bad move, bad file. Anything else that is thrown is a bug. */
export class Refusal extends Error {
  constructor(code, message) {
    super(message);
    this.name = "Refusal";
    this.code = code;
  }
}

export function checkGame(game) {
  for (const [k, type] of Object.entries(NEEDED)) if (typeof game?.[k] !== type) throw new TypeError(`game is missing ${k}`);
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(game.id)) throw new TypeError("game id must be short lower-case text");
  for (const [k, o] of Object.entries(game.options)) {
    if (!Array.isArray(o.values) || !o.values.some((v) => same(v, o.normal))) throw new TypeError(`option ${k}: its normal value is not in its list`);
  }
  return game;
}

/** Fill in normal values and refuse anything unknown. */
export function readOptions(game, given = {}) {
  const out = {};
  for (const k of Object.keys(given)) if (!Object.hasOwn(game.options, k)) throw new Refusal("option", `unknown option "${k.slice(0, 40)}"`);
  for (const [k, o] of Object.entries(game.options)) {
    const v = Object.hasOwn(given, k) ? given[k] : o.normal;
    const found = o.values.find((x) => { try { return same(x, v); } catch { return false; } });
    if (found === undefined) throw new Refusal("option", `option "${k}" cannot have that value`);
    out[k] = found;
  }
  return out;
}

export function createMatch(game, { options = {}, seed = "" } = {}) {
  checkGame(game);
  const chosen = deepFreeze(readOptions(game, options)), theSeed = String(seed).slice(0, 200);
  const dice = chance(seedState(`${game.id}/${theSeed}`));
  const opening = deepFreeze(game.setup(chosen, dice));
  canon(opening); // a bad first position fails here, not ten moves later
  const steps = [{ position: opening, dice: dice.state, events: [] }], played = [];
  const now = () => steps[steps.length - 1];

  return {
    game, options: chosen, seed: theSeed,
    get position() { return now().position; },
    get events() { return now().events; },
    get turn() { return game.turn(now().position); },
    get result() { return game.result(now().position); },
    get list() { return played.map((m) => structuredClone(m)); },
    legal() { return this.turn === null ? [] : game.moves(now().position); },
    isLegal(move) { const want = canon(move); return this.legal().some((m) => canon(m) === want); },
    fingerprint: () => fingerprint([game.id, game.version, chosen, now().position, now().dice]),

    /** Play one move, or refuse it and change nothing. */
    play(move) {
      if (this.turn === null) throw new Refusal("over", "the game is over");
      if (played.length >= MAX_MOVES) throw new Refusal("long", "the list of moves is full");
      let copy;
      try { copy = JSON.parse(canon(move)); } catch (e) { throw new Refusal("shape", `that is not a move: ${e.message}`); }
      if (game.allows ? !game.allows(now().position, copy) : !this.isLegal(copy)) throw new Refusal("illegal", `that move is not allowed now: ${canon(copy).slice(0, 120)}`);
      const d = chance(now().dice), made = game.apply(now().position, copy, d);
      canon(made.position);
      canon(made.events || []);
      steps.push({ position: deepFreeze(made.position), dice: d.state, events: deepFreeze(made.events || []) });
      played.push(deepFreeze(copy));
      return now().events;
    },
    /** Whether the last move rolled any dice. In a game between people such a move is not taken back. */
    get rolled() { const n = steps.length; return n > 1 && steps[n - 1].dice.join() !== steps[n - 2].dice.join(); },
    /** Take back the last move. Playing it again rolls the same dice. */
    undo() {
      if (!played.length) return false;
      steps.pop();
      played.pop();
      return true;
    },
    /** The position after the first n moves. */
    at(n) {
      if (!Number.isInteger(n) || n < 0 || n >= steps.length) throw new RangeError("no such moment");
      return steps[n].position;
    },
    save() {
      return canon({ format: FORMAT, game: game.id, version: game.version, options: chosen, seed: theSeed, moves: played, end: this.fingerprint() });
    },
  };
}

/**
 * A saved game stops making sense at one of its moves. What should happen?
 * "refuse" loses the whole file; "keep" opens the part before that move, with a warning.
 * @param {{code: string, index: number, total: number}} problem
 *   code is "illegal", "shape", "over" or "end" (the moves work but lead somewhere else)
 */
export function whenReplayFails(problem) {
  if (problem.code === "end") return "refuse"; // no single move is at fault, so no part can be trusted
  return problem.index > 0 ? "keep" : "refuse"; // with no good move there is nothing to keep
}

const FIELDS = ["end", "format", "game", "moves", "options", "seed", "version"];

/** Open a saved game by replaying every move. Returns { match, warning }. */
export function openSave(text, games) {
  const notASave = () => new Refusal("file", "that is not a saved game");
  if (typeof text !== "string" || text.length > MAX_FILE) throw new Refusal("file", "that file is too large or not text");
  let f;
  try { f = JSON.parse(text); } catch { throw notASave(); }
  if (!f || typeof f !== "object" || Array.isArray(f) || Object.keys(f).sort().join() !== FIELDS.join()) throw notASave();
  if (f.format !== FORMAT) throw new Refusal("format", "this save was made by a different version of these games");
  if (!Array.isArray(f.moves) || f.moves.length > MAX_MOVES || typeof f.seed !== "string" || typeof f.end !== "string") throw notASave();
  if (!f.options || typeof f.options !== "object" || Array.isArray(f.options)) throw notASave();
  const game = games.find((g) => g.id === f.game);
  if (!game) throw new Refusal("game", "this copy does not have that game");
  if (game.version !== f.version) throw new Refusal("version", `this save needs version ${String(f.version).slice(0, 20)} of ${game.id}; this copy has ${game.version}`);

  const match = createMatch(game, { options: f.options, seed: f.seed }), total = f.moves.length;
  const fail = (code, index, message) => {
    if (whenReplayFails({ code, index, total }) === "keep") return { match, warning: `${message}. Kept ${index} of ${total} moves.` };
    throw new Refusal(code, message);
  };
  for (let i = 0; i < total; i++) {
    try { match.play(f.moves[i]); } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      return fail(e.code, i, `move ${i + 1}: ${e.message}`);
    }
  }
  if (match.fingerprint() !== f.end) return fail("end", total, "the moves lead to a different position than the file says");
  return { match, warning: "" };
}
