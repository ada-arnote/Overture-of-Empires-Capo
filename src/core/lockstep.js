// SPDX-License-Identifier: AGPL-3.0-or-later
// A real-time game played live between two browsers, in lockstep, over any channel that carries plain messages in order
// (site/inchplay.js uses the live link's WebRTC). Turn games use session.js; a game on a clock needs a different exchange.
//
// Time is counted in frames, four a second, never in wall time: frame f is the same moment on both sides. Each side sends one
// message a frame with the orders its person gave since the last, and a commitment to a fresh secret. An order is sent for a frame
// DELAY frames ahead of the last one played, so the other side has it in time (the input delay). Frame f is played when both
// sides' messages for it are here: first any pause or resume, then the host's orders, then the guest's, each checked by the rules
// on both sides alike (an order the game no longer allows is skipped by both), then, every TICK frames while the clock runs, one
// tick of the game. That tick's dice are mixed with both secrets of the frame (session.js's salt), and a side shows its secret only
// once it holds the other's orders and commitment for that frame, so neither can know the dice before its own orders are fixed.
// Both sides play the same moves from the same seed, so the game is a list of moves like any other, saved and replayed whole.
// Every SUM frames each side sends a short sum of the game; sums that differ stop live play (a desync). A dropped channel stalls
// the clock on both sides alike; joined again, each side sends what the other has not had, and play goes on from the same frame.
import { canon } from "./canon.js";
import { DEALT, commitOf, saltOf, seedOf } from "./session.js";

export const FRAME_MS = 250, DELAY = 2, TICK = 2, SUM = 4;
const V = 1, SECRET = /^[0-9a-f]{32}$/, HASH = /^[0-9a-f]{64}$/, MOST = 8, AHEAD = 64, CONTROLS = ["pause", "go"];
const isF = (n) => Number.isInteger(n) && n >= 0 && n < 2 ** 31;

/** A short sum of a game's position and length, quick enough to take every second: FNV-1a over every whole number and word in it,
 *  walked in canon's order (keys sorted). Two sums differ when the games do, but for a chance of about one in four billion. */
export function quickSum(match) {
  let a = 0x811c9dc5, b = 0x01000193 ^ match.list.length;
  const mix = (n) => { a = Math.imul(a ^ (n & 0xffff), 0x01000193); b = Math.imul(b ^ (n >>> 16 & 0xffff) ^ (n < 0 ? 0x5bd1 : 0), 0x01000193); };
  const walk = (v) => {
    if (v === null || v === undefined) mix(7);
    else if (typeof v === "number") { mix(1); mix(v | 0); mix(Math.floor(v / 2 ** 32) | 0); }
    else if (typeof v === "boolean") mix(v ? 3 : 5);
    else if (typeof v === "string") { mix(11); for (let i = 0; i < v.length; i++) mix(v.charCodeAt(i)); }
    else if (Array.isArray(v)) { mix(13); mix(v.length); for (const x of v) walk(x); }
    else { mix(17); for (const k of Object.keys(v).sort()) { walk(k); walk(v[k]); } }
  };
  walk(match.position);
  return ((a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0"));
}

/**
 * side: "host" (seat 0) or "guest" (seat 1). secret(): 32 fresh hex digits. game, options: what both play (a match is made only
 * by the page). match(): the shared match now, or null before the deal. play(move, salt): the page plays one move on that match;
 * it returns false when the rules refuse it (both sides then skip it). clock(match): whether the game's clock runs at this position.
 * tick: the move a tick plays. sum(match): the check sent every SUM frames (quickSum when not given). now(): milliseconds, for the
 * figures only. What the page is told: dealt(seed): a game not yet begun gets a fresh seed drawn by both; adopt(save): this side
 * lost its game (a page reloaded) or holds an older copy, so it takes the other's, as a saved game, where both now stand; paused(on, side): the
 * clock was paused or resumed, at the same frame on both sides; stop(text): live play stopped (a desync, a broken promise);
 * note(text): something to say.
 */
export function createLockstep({ side, secret, game, options, match, play, clock, tick = { do: "tick", n: 1 }, sum = quickSum, now = () => 0, dealt, adopt, paused, stop, note = () => {} }) {
  const me = side === "host" ? 0 : 1, them = 1 - me;
  let send = null, up = false, over = false, deal = null, theirDeal = null, asked = false;
  let sent = 0, done = 0, run = 0, heard = 0, acked = 0, halted = false, ask = null, queue = [];
  const mine = new Map(), theirs = new Map(), opens = new Map(), shown = new Set(), sums = new Map(), theirSums = new Map();
  const figures = { rtt: [], lag: [], stalls: 0, checked: 0, frames: 0 };
  const quit = (text) => { if (over) return; over = true; up = false; stop(text); };
  const out = (x) => send?.(x);
  const reset = () => {
    sent = done = run = heard = acked = 0; halted = false; ask = null; queue = [];
    for (const map of [mine, theirs, opens, sums, theirSums]) map.clear();
    shown.clear();
  };

  function dealing() {
    if (!deal) { const r = secret(); deal = { r, c: commitOf(r) }; }
    out({ t: "deal", c: deal.c });
  }
  /** Whether side a must take side b's game: a has none, or a's live table is new (a page reloaded) and b's is not, or holds less. */
  const needs = (a, b) => b.seed !== null && (a.seed === null || (a.seed === b.seed && a.fresh && (!b.fresh || a.moves < b.moves)));
  function hello(h) {
    const m = match();
    if (h.v !== V) return quit("The other browser has a different version of live real-time play.");
    if (h.side === side) return quit("Both browsers think they made this game, so live play stopped.");
    if (h.game !== game.id || h.version !== game.version || canon(h.options) !== canon(options)) return quit("The other browser has a different game open, so live play stopped.");
    if ((h.seed !== null && typeof h.seed !== "string") || typeof h.fresh !== "boolean" || !isF(h.moves)) return quit("The other browser sent a greeting this one cannot read, so live play stopped.");
    const ours = m ? m.seed : null, us = { seed: ours, fresh: sent === 0 && done === 0, moves: m ? m.list.length : 0 };
    if (ours === null && h.seed === null) { up = true; return dealing(); }
    if (needs(us, h)) { up = true; asked = true; out({ t: "need" }); return undefined; }
    if (needs(h, us)) { up = true; return undefined; } // they ask for our game, and take it
    if (h.seed !== ours) return quit("The two browsers have different games, so live play stopped.");
    if (!isF(h.done) || !isF(h.got) || h.got > sent || h.done > sent || done > h.sent || h.got < acked) return quit("The two browsers could not agree where the game stands, so live play stopped.");
    acked = Math.max(acked, h.done);
    // what they have not had: our frames from where they stopped hearing, and our secrets for frames they have not played
    for (let f = h.got; f < sent; f++) out(frameOf(f));
    for (const f of [...shown].sort((x, y) => x - y)) if (f >= h.done) out({ t: "r", f, r: mine.get(f).r });
    up = true;
    pump();
    return undefined;
  }
  const frameOf = (f) => { const x = mine.get(f); return { t: "f", f, o: x.o, c: x.c, ...(x.x ? { x: x.x } : {}), a: done }; };
  /** Show our secret for frame f once we hold their orders and commitment for it. */
  function reveal(f) {
    if (shown.has(f) || !mine.has(f) || !theirs.has(f)) return;
    shown.add(f);
    out({ t: "r", f, r: mine.get(f).r });
  }
  /** Frames sent but not played are taken back: our orders in them go out again from the frame both have played (the other side
   *  is taking our game, and has none of them). */
  function rollback() {
    const back = [];
    for (let f = done; f < sent; f++) { const x = mine.get(f); if (!x) continue; x.o.forEach((m, i) => back.push({ m, at: x.at[i] })); if (x.x) ask = x.x; mine.delete(f); shown.delete(f); }
    queue = [...back, ...queue];
    sent = heard = acked = done;
    theirs.clear(); opens.clear(); sums.clear(); theirSums.clear();
  }
  function forget() {
    for (const f of mine.keys()) if (f < acked && f < done) { mine.delete(f); shown.delete(f); }
    for (const map of [theirs, opens]) for (const f of map.keys()) if (f < done) map.delete(f);
    for (const map of [sums, theirSums]) for (const f of map.keys()) if (f < done - 8 * SUM) map.delete(f);
  }

  /** Play every frame both sides have sent and shown. */
  function pump() {
    while (!over && match()) {
      const f = done, a = mine.get(f), b = theirs.get(f), r = opens.get(f);
      if (!a || !b || r === undefined) return;
      const [host, guest] = side === "host" ? [a, b] : [b, a], [hr, gr] = side === "host" ? [a.r, r] : [r, a.r];
      for (const [x, who] of [[host.x, "host"], [guest.x, "guest"]]) {
        if (x === "pause" && !halted) { halted = true; paused(true, who); } else if (x === "go" && halted) { halted = false; paused(false, who); }
      }
      for (const mv of [...host.o, ...guest.o]) play(mv, "");
      if (!halted && clock(match())) { run++; if (run % TICK === 0) play(tick, saltOf(f, hr, gr)); }
      done = f + 1;
      figures.frames++;
      for (const at of a.at) figures.lag.push(now() - at);
      if (done % SUM === 0) { const h = sum(match()); sums.set(f, h); out({ t: "s", f, h }); compare(f); }
      forget();
    }
  }
  function compare(f) {
    if (!sums.has(f) || !theirSums.has(f)) return;
    if (sums.get(f) !== theirSums.get(f)) { quit("The two browsers see this game differently (their checks disagree), so live play stopped."); return; }
    figures.checked++;
    sums.delete(f); theirSums.delete(f);
  }

  const s = {
    /** A channel is open: say where we stand. */
    attach(o) {
      send = o; up = false;
      const m = match();
      out({ t: "hello", v: V, side, game: game.id, version: game.version, options, seed: m ? m.seed : null, fresh: sent === 0 && done === 0, moves: m ? m.list.length : 0, done, sent, got: Math.max(done, heard) });
    },
    /** The channel is gone: the clock stalls here and on the other side alike, until it is joined again. */
    detach() { send = null; up = false; },
    get up() { return up && !over && !!match(); },
    get stopped() { return over; },
    get paused() { return halted; },
    /** Frames played so far: the shared clock, a quarter of a second each. */
    get frame() { return done; },
    /** Whether the clock stands waiting for the other browser (its frame is not here yet). */
    get waiting() { return !!match() && !over && (!up || sent >= done + DELAY); },
    /** Orders queued, not yet sent. */
    get queued() { return queue.length; },
    /** Send this side's next frame, if the other side is not too far behind. The page calls this four times a second. */
    step() {
      if (!s.up || over || asked) return false;
      if (sent >= done + DELAY) { figures.stalls++; return false; }
      const f = sent, r = secret(), o = queue.splice(0, MOST), x = ask;
      ask = null;
      mine.set(f, { o: o.map((q) => q.m), at: o.map((q) => q.at), x, r, c: commitOf(r), sentAt: now() });
      sent++;
      out(frameOf(f));
      reveal(f);
      pump();
      return true;
    },
    /** This side's person gives an order: it goes in the next frame sent, named as this side's seat. */
    order(m) { if (!over) queue.push({ m: { ...m, by: me }, at: now() }); },
    /** Pause or resume the clock for both sides: it takes effect at the frame it is sent in, on both sides. */
    control(x) { if (CONTROLS.includes(x)) ask = x; },
    receive(x) {
      if (over || !x || typeof x !== "object" || !send) return;
      if (x.t === "hello") { hello(x); return; }
      if (!up || (asked && x.t !== "take")) return; // while this side waits for the other's game, nothing else of it counts
      if (x.t === "need") {
        const m = match();
        if (!m || asked) return undefined;
        rollback();
        out({ t: "take", save: m.save(), done, run, halted });
        note("Your friend's browser came back without the game, so it takes this one's, as it stands now.");
        pump();
      } else if (x.t === "take" && asked && typeof x.save === "string" && isF(x.done) && isF(x.run) && typeof x.halted === "boolean") {
        asked = false;
        try { adopt(x.save); } catch { return quit("The other browser's game could not be opened here, so live play stopped."); }
        if (!match()) return quit("The other browser's game could not be opened here, so live play stopped.");
        const q = queue;
        reset();
        queue = q;
        sent = done = heard = acked = x.done; run = x.run; halted = x.halted;
        if (halted) paused(true, side === "host" ? "guest" : "host");
        pump();
      } else if (x.t === "deal" && HASH.test(x.c)) {
        if (match()) return;
        if (theirDeal && theirDeal !== x.c) note("The other browser started the deal again.");
        if (!deal) dealing();
        theirDeal = x.c;
        out({ t: "open", r: deal.r });
      } else if (x.t === "open" && SECRET.test(x.r) && theirDeal && deal && !match()) {
        if (commitOf(x.r) !== theirDeal) return quit("The other browser changed a secret it had promised, so live play stopped.");
        const seed = seedOf(...(side === "host" ? [deal.r, x.r] : [x.r, deal.r]));
        reset();
        dealt(seed);
        if (!match() || match().seed !== seed || !seed.startsWith(DEALT)) quit("This browser could not begin the game that was dealt.");
      } else if (x.t === "f") {
        const { f, o, c } = x;
        if (!isF(f) || !Array.isArray(o) || o.length > MOST || !HASH.test(c) || (x.x !== undefined && !CONTROLS.includes(x.x)) || !isF(x.a)) return quit("The other browser sent a frame this one cannot read, so live play stopped.");
        if (o.some((mv) => !mv || typeof mv !== "object" || Array.isArray(mv) || mv.by !== them)) return quit("The other browser sent an order for a seat that is not its own, so live play stopped.");
        if (f > done + AHEAD) return quit("The other browser ran too far ahead, so live play stopped.");
        acked = Math.max(acked, Math.min(x.a, sent));
        if (f < done) { forget(); return; } // played already: a frame sent again after a drop
        const had = theirs.get(f), now2 = { o, c, x: x.x };
        if (had) { if (canon(had) !== canon(now2)) quit("The other browser changed a frame it had sent, so live play stopped."); return; }
        theirs.set(f, now2);
        while (theirs.has(heard) || heard < done) heard++;
        reveal(f);
        pump();
      } else if (x.t === "r" && isF(x.f) && SECRET.test(x.r)) {
        const c = theirs.get(x.f)?.c;
        if (!c || opens.has(x.f) || x.f < done) return;
        if (commitOf(x.r) !== c) return quit("The other browser changed a secret it had promised, so live play stopped.");
        opens.set(x.f, x.r);
        const at = mine.get(x.f)?.sentAt;
        if (at !== undefined) figures.rtt.push(now() - at);
        pump();
      } else if (x.t === "s" && isF(x.f) && typeof x.h === "string" && x.h.length <= 128) {
        if (x.f >= done + AHEAD) return;
        theirSums.set(x.f, x.h);
        compare(x.f);
        for (const f of theirSums.keys()) if (f < done - 4 * SUM) theirSums.delete(f);
      }
      return undefined;
    },
    /** Timings for the record: round trips (a frame sent to the other's secret back), how long an order of ours took to be played,
     *  how often the clock stood waiting for the other side, how many sums matched. */
    figures() {
      const mid = (l) => (l.length ? [...l].sort((x, y) => x - y)[Math.floor(l.length / 2)] : 0), top = (l) => (l.length ? [...l].sort((x, y) => x - y)[Math.floor(l.length * 0.95)] : 0);
      return { frames: figures.frames, rtt: mid(figures.rtt), rtt95: top(figures.rtt), lag: mid(figures.lag), lag95: top(figures.lag), orders: figures.lag.length, stalls: figures.stalls, checked: figures.checked };
    },
  };
  return s;
}
