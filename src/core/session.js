// SPDX-License-Identifier: AGPL-3.0-or-later
// A table played live between two browsers, over any channel that carries plain messages in order (site/livelink.js uses WebRTC).
// Both sides keep the whole game and check every move by the rules, so neither can send a move that is not allowed.
// Nobody can peek at the dice: before each move each side commits to a secret (sends only its hash). The mover sends the move
// with its secret, the other answers with its own, and that move's dice are mixed with both (the match's salts). A game dealt
// live gets its seed the same way, so neither side chooses the deal. Hidden things (cards in hand) are still in both browsers.
import { canon } from "./canon.js";
import { sha256 } from "./digest.js";
import { Refusal, createMatch } from "./match.js";

const V = 1, SECRET = /^[0-9a-f]{32}$/, HASH = /^[0-9a-f]{64}$/, MOST = 20000;
const hex = (text) => sha256(new TextEncoder().encode(text));
/** The hash a side sends before its secret. */
export const commitOf = (r) => hex(`capo-live/${r}`);
/** The salt of move n, from both secrets. */
export const saltOf = (n, host, guest) => hex(canon(["capo-salt", n, host, guest])).slice(0, 8);
/** A seed dealt live starts with this, so a game is dealt once. */
export const DEALT = "live:";
export const seedOf = (host, guest) => DEALT + hex(canon(["capo-deal", host, guest])).slice(0, 24);

const isN = (n) => Number.isInteger(n) && n >= 0 && n <= MOST;
/** The moves of a game as places in the list of legal moves, as in a link. */
function places(m) {
  const again = createMatch(m.game, { options: m.options, seed: m.seed, salts: m.salts });
  return m.list.map((mv) => { const want = canon(mv), i = again.legal().findIndex((x) => canon(x) === want); again.play(mv); return i; });
}
function rebuild(game, options, seed, list, salts) {
  const m = createMatch(game, { options, seed, salts });
  for (const i of list) { const mv = m.legal()[i]; if (!mv) throw new Refusal("live", "a move that is not allowed"); m.play(mv); }
  return m;
}

/**
 * side: "host" or "guest". owns(seat, match): whether a seat is played from this side (the host plays its own seats and the bots).
 * secret(): 32 fresh hex digits. What the table is told:
 *   moved(move): a move from the other side is final, play it. dealt(seed): a game not yet begun gets a fresh seed.
 *   adopt(match): the other side is further on; take a copy of its game (this one stays the session's own). trouble(text, stop): something to say; stop ends live play.
 */
export function createSession({ side, owns, secret, moved, dealt, adopt, trouble }) {
  let m = null, send = null, synced = false, pending = null, sent = null, told = null, deal = null;
  const mine = new Map(), theirs = new Map(), done = new Map(), asked = new Map();
  const both = (a, b) => (side === "host" ? [a, b] : [b, a]);
  const stop = (text) => { trouble(text, true); s.detach(); };
  const at = () => m.list.length;

  function commit(n) {
    if (!send || !synced || at() !== n || m.turn === null) return;
    if (!mine.has(n)) { const r = secret(); mine.set(n, { r, c: commitOf(r) }); }
    send({ t: "commit", n, c: mine.get(n).c, f: m.fingerprint() });
  }
  function theirCommit(n) { // their commit for move n, once it is here
    if (theirs.has(n)) return Promise.resolve(theirs.get(n));
    return new Promise((resolve) => asked.set(n, resolve));
  }
  /** A move is final on this side: the table plays it with this salt. */
  function final(n, mv, salt) {
    done.set(n, { key: canon(mv), salt });
    for (const map of [done, mine, theirs]) for (const k of map.keys()) if (k < n - 8) map.delete(k);
    commit(n + 1);
  }
  function inStep(n, c) {
    if (c.f !== m.fingerprint()) { stop("The two browsers see this game differently, so live play stopped. It goes on by links."); return false; }
    return true;
  }

  function hello(h) {
    if (h.v !== V) return stop("The other browser has a different version of the live table. Play goes on by links.");
    if (h.side === side) return stop("Both browsers think they made this game, so live play stopped.");
    if (h.game !== m.game.id || canon(h.options) !== canon(m.options) || !Array.isArray(h.moves) || !Array.isArray(h.salts) || h.moves.length > MOST) return stop("The other browser has a different game open, so live play stopped.");
    let them;
    if (h.seed !== m.seed) { // only a game not begun: undealt on both sides is dealt now; dealt on one side is taken by the other
      const ours = m.seed.startsWith(DEALT), theirsDealt = String(h.seed).startsWith(DEALT);
      if (at() || h.moves.length || (ours && theirsDealt)) return stop("The two browsers have different games, so live play stopped.");
      synced = true;
      if (!ours && !theirsDealt) return dealing();
      if (ours) { commit(0); return undefined; }
      them = createMatch(m.game, { options: m.options, seed: h.seed });
    } else {
      try { them = rebuild(m.game, m.options, h.seed, h.moves, h.salts); } catch { return stop("The other browser sent a game the rules do not allow, so live play stopped."); }
    }
    const a = m.list.map((mv, i) => canon([mv, m.salts[i]])), b = them.list.map((mv, i) => canon([mv, them.salts[i]]));
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return stop("The two browsers tell this game differently, so live play stopped. It goes on by links.");
    if (b.length > a.length || them.seed !== m.seed) {
      // our own last move went out, they played it, and its answer was lost: their secret must match what they promised
      if (sent && b.length === sent.n + 1 && h.told?.n === sent.n && theirs.has(sent.n) && commitOf(h.told.r) !== theirs.get(sent.n).c) return stop("The other browser changed a secret it had promised, so live play stopped.");
      m = them;
      adopt(them);
    }
    sent = null;
    synced = true;
    if (!at() && !m.seed.startsWith(DEALT)) return dealing();
    commit(at());
    return undefined;
  }
  function dealing() {
    if (!deal) { const r = secret(); deal = { r, c: commitOf(r) }; }
    send({ t: "deal", c: deal.c });
  }
  function dealt2(r) {
    const seed = seedOf(...both(deal.r, r));
    m = createMatch(m.game, { options: m.options, seed });
    mine.clear(); theirs.clear(); done.clear();
    dealt(seed);
    commit(0);
  }

  const s = {
    /** The game the table holds now; a copy is kept here. */
    start(match) { m = createMatch(match.game, { options: match.options, seed: match.seed, salts: match.salts }); for (const mv of match.list) m.play(mv); },
    /** A channel is open: say where we stand. */
    attach(out) {
      send = out; synced = false;
      send({ t: "hello", v: V, side, game: m.game.id, options: m.options, seed: m.seed, moves: places(m), salts: m.salts, told });
    },
    detach() {
      send = null; synced = false;
      if (pending) { const p = pending; pending = null; p.reject(new Refusal("down", "the live connection dropped")); }
    },
    up: () => !!send && synced,
    /** Whether the table should wait for the other side to play this seat. */
    waits: (seat) => !!send && seat !== null && !owns(seat, m),
    /** The salt for move n. Ours: sent, and answered with their secret. Theirs: already final. */
    salt(mv, n) {
      const d = done.get(n);
      if (d && d.key === canon(mv)) return Promise.resolve(d.salt);
      if (!s.up() || at() !== n || !owns(m.turn, m)) return Promise.reject(new Refusal("step", "the live table is not at that move"));
      const i = m.legal().findIndex((x) => canon(x) === canon(mv));
      if (i < 0) return Promise.reject(new Refusal("illegal", "that move is not allowed now"));
      return new Promise((resolve, reject) => {
        pending = { n, mv, resolve, reject };
        theirCommit(n).then(() => {
          if (pending?.n !== n || !send) return;
          if (!mine.has(n)) commit(n);
          sent = { n };
          send({ t: "move", n, i, r: mine.get(n).r });
        });
      });
    },
    receive(x) {
      if (!x || typeof x !== "object" || !send) return;
      if (x.t === "hello") { hello(x); return; }
      if (!synced) return;
      if (x.t === "deal" && HASH.test(x.c)) {
        if (deal?.theirs && deal.theirs !== x.c) trouble("The other browser started the deal again.", false);
        if (!deal) dealing();
        deal.theirs = x.c;
        send({ t: "open", r: deal.r });
      } else if (x.t === "open" && SECRET.test(x.r) && deal?.theirs) {
        if (commitOf(x.r) !== deal.theirs) return stop("The other browser changed a secret it had promised, so live play stopped.");
        dealt2(x.r);
      } else if (x.t === "commit" && isN(x.n) && HASH.test(x.c) && typeof x.f === "string") {
        const had = theirs.get(x.n);
        // a fresh secret for a roll already promised: a reload, or a try at a second roll. Said, so both know
        if (had && had.c !== x.c) trouble("The other browser drew a new secret for a roll it had already promised. That happens after a reload; done on purpose it would be a second try.", false);
        theirs.set(x.n, { c: x.c, f: x.f });
        asked.get(x.n)?.(theirs.get(x.n)); asked.delete(x.n);
      } else if (x.t === "move" && isN(x.n) && Number.isInteger(x.i) && SECRET.test(x.r)) {
        const n = x.n, c = theirs.get(n), me = mine.get(n);
        if (n !== at() || !c || !me || m.turn === null || owns(m.turn, m)) return stop("A move came out of turn, so live play stopped. It goes on by links.");
        if (commitOf(x.r) !== c.c) return stop("The other browser changed a secret it had promised, so live play stopped.");
        if (!inStep(n, c)) return undefined;
        const mv = m.legal()[x.i];
        if (!mv) return stop("The other browser sent a move the rules do not allow, so live play stopped.");
        send({ t: "reveal", n, r: me.r });
        told = { n, r: me.r };
        const salt = saltOf(n, ...both(me.r, x.r));
        m.play(mv, salt);
        final(n, mv, salt);
        moved(mv);
      } else if (x.t === "reveal" && isN(x.n) && SECRET.test(x.r) && pending?.n === x.n) {
        const n = x.n, c = theirs.get(n), p = pending;
        if (commitOf(x.r) !== c.c) return stop("The other browser changed a secret it had promised, so live play stopped.");
        if (!inStep(n, c)) return undefined;
        const salt = saltOf(n, ...both(mine.get(n).r, x.r));
        pending = null; sent = null;
        m.play(p.mv, salt);
        final(n, p.mv, salt);
        done.delete(n); // ours: the table plays it from here
        p.resolve(salt);
      }
      return undefined;
    },
    get match() { return m; },
  };
  return s;
}
