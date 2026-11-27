// SPDX-License-Identifier: AGPL-3.0-or-later
// A whole game as a few hundred bytes, small enough for one chat message. Each move is stored as its place in the
// list of legal moves, so a link cannot hold a move that is not allowed.
import { canon } from "./canon.js";
import { fingerprint } from "./digest.js";
import { Refusal, createMatch } from "./match.js";

const LAYOUT = 2, SALTED = 3, MOST_MOVES = 4000, MOST_BYTES = 32000, CHECK = 8;
const ROLES = ["host", "friend", "normal", "easy", "hard"];
const broken = () => new Refusal("link", "that link is broken or not complete");

function put(out, n) { // a whole number, seven bits to a byte
  while (n > 127) { out.push((n % 128) | 128); n = Math.floor(n / 128); }
  out.push(n);
}
function reader(bytes) {
  let at = 0;
  return {
    number() {
      let n = 0, unit = 1;
      for (let i = 0; i < 5; i++) {
        if (at >= bytes.length) throw broken();
        const b = bytes[at++];
        n += (b & 127) * unit;
        if (b < 128) return n;
        unit *= 128;
      }
      throw broken();
    },
    take(n) { if (at + n > bytes.length) throw broken(); at += n; return bytes.subarray(at - n, at); },
    done: () => at === bytes.length,
  };
}
/** Covers every move as well as where they lead. */
function check(match, roles) {
  const f = fingerprint([match.fingerprint(), match.seed, match.list, roles, ...(match.salts.some(Boolean) ? [match.salts] : [])]);
  return Array.from({ length: CHECK }, (_, i) => parseInt(f.slice(i * 2, i * 2 + 2), 16));
}

/** roles: for each seat "host", "friend", "normal" or "easy". look: for each seat the numbers of its colour and icon (a longer list is cut to the seats). */
export function packGame(match, roles, look) {
  const salts = match.salts, salted = salts.some(Boolean); // a game played live keeps the salts of its dice (layout 3)
  const head = new TextEncoder().encode(canon({ g: match.game.id, v: match.game.version, o: match.options, s: match.seed, r: roles, l: look.slice(0, match.options.seats) })), out = [salted ? SALTED : LAYOUT];
  put(out, head.length);
  out.push(...head);
  const list = match.list, again = createMatch(match.game, { options: match.options, seed: match.seed, salts });
  if (list.length > MOST_MOVES) throw new Refusal("link", "this game is too long for a link");
  put(out, list.length);
  if (salted) { // how many, then each as the gap from the last one and four bytes
    const at = salts.flatMap((x, i) => (x ? [i] : []));
    put(out, at.length);
    at.forEach((i, k) => { put(out, i - (k ? at[k - 1] : 0)); for (let j = 0; j < 8; j += 2) out.push(parseInt(salts[i].slice(j, j + 2), 16)); });
  }
  for (const m of list) {
    const want = canon(m);
    put(out, again.legal().findIndex((x) => canon(x) === want));
    again.play(m);
  }
  out.push(...check(match, roles));
  return Uint8Array.from(out);
}

/** Returns { match, roles }, or refuses. */
export function unpackGame(bytes, games) {
  if (bytes.length > MOST_BYTES) throw broken();
  const r = reader(bytes);
  const layout = r.number();
  if (layout !== LAYOUT && layout !== SALTED) throw new Refusal("link", "that link was made by a different version of these games");
  let h;
  try { h = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(r.take(r.number()))); } catch { throw broken(); }
  if (!h || typeof h !== "object" || Object.keys(h).sort().join() !== "g,l,o,r,s,v" || typeof h.s !== "string" || !h.o || typeof h.o !== "object" || Array.isArray(h.o)) throw broken();
  const game = games.find((g) => g.id === h.g);
  if (!game) throw new Refusal("game", "that link is for another game. Open it from that game's page");
  if (game.version !== h.v) throw new Refusal("version", "that link was made by a different version of this game");
  const n = r.number();
  if (n > MOST_MOVES) throw broken();
  const salts = Array(n).fill("");
  if (layout === SALTED) {
    const k = r.number();
    if (k > n) throw broken();
    for (let j = 0, i = 0; j < k; j++) {
      i += r.number();
      if (i >= n || (j && salts[i])) throw broken();
      salts[i] = Array.from(r.take(4), (b) => b.toString(16).padStart(2, "0")).join("");
    }
  }
  const match = createMatch(game, { options: h.o, seed: h.s, salts });
  if (!Array.isArray(h.r) || h.r.length !== match.options.seats || !h.r.every((x) => ROLES.includes(x))) throw broken();
  if (!Array.isArray(h.l) || h.l.length !== match.options.seats || !h.l.every((x) => Array.isArray(x) && x.length === 2 && x.every((v) => Number.isInteger(v) && v >= 0 && v < 64))) throw broken();
  for (let i = 0; i < n; i++) {
    const m = match.legal()[r.number()];
    if (!m) throw broken();
    match.play(m);
  }
  if (canon([...r.take(CHECK)]) !== canon(check(match, h.r)) || !r.done()) throw broken();
  return { match, roles: h.r, look: h.l };
}

/** How a game that arrives stands to the one already here: "new" (it goes on from ours), "old" (ours goes further), or "other". */
export function compareGames(ours, theirs) {
  if (ours.game.id !== theirs.game.id || ours.seed !== theirs.seed || canon(ours.options) !== canon(theirs.options)) return "other";
  const a = ours.list.map((m, i) => canon([m, ours.salts[i]])), b = theirs.list.map((m, i) => canon([m, theirs.salts[i]])), n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return "other";
  return b.length > a.length ? "new" : "old";
}
