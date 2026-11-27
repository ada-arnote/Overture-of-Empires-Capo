// SPDX-License-Identifier: AGPL-3.0-or-later
// One room: a Durable Object that holds a short code, the seats' keys (as digests), the seed and the list of moves.
// Every move is checked by the game's own rules before it is kept or passed on: the room replays seed plus moves when it
// wakes, so it always knows the one legal position. Live tables send their moves to each other directly and use the room
// only to find each other (signals), to see who is here, and as the relay when no direct path opens. Tables by turn
// post moves to the room, which keeps them while the others are away and sends a "your turn" notice to those who asked.
//
// Kept, and nothing more: the room's settings, the moves, a digest of each seat's key and of the password, and a push
// subscription for a seat that asked for notices (deleted when the game ends, when the seat turns notices off, or with
// the room). No internet address, no name, no time beyond the last move. The room deletes itself when its keeping time ends.
import { Refusal, canon, chance, deepFreeze, fingerprint, readOptions, seedState } from "../../src/core/index.js";
import { GAMES } from "./games.js";
import { notify } from "./push.js";
import { BOTS, HEX, KEEP, MODES, MOST, No, ROLES, SIGNALS, SOCKET_RATE, TOKEN, WIRE, answer, body, clock, digest, parse, readSubscription, refuse, same, secret, tokenOf, whole } from "./wire.js";

const CHUNK = 64; // moves kept in one stored row, so a move costs two row writes (its row, and the head with the table), not a growing list
const row = (k) => `m:${String(k).padStart(4, "0")}`;
const HOUR = 3600000, MOST_MOVES = 20000;

/**
 * The game as the room holds it: the position and the dice state, kept beside the moves after every move, so a room
 * that wakes goes on at once instead of replaying the whole game. The same steps as createMatch in src/core/match.js;
 * test/worker.test.mjs holds the two to the same fingerprint, move by move.
 */
export class Table {
  constructor(game, options, position, dice) { Object.assign(this, { game, options, position, dice }); }
  static open(game, options, seed) {
    const dice = chance(seedState(`${game.id}/${seed}`)), position = deepFreeze(game.setup(options, dice));
    canon(position);
    return new Table(game, options, position, dice.state);
  }
  get turn() { return this.game.turn(this.position); }
  get result() { return this.game.result(this.position); }
  play(move) {
    if (this.turn === null) throw new Refusal("over", "the game is over");
    let copy;
    try { copy = JSON.parse(canon(move)); } catch (e) { throw new Refusal("shape", `that is not a move: ${e.message}`); }
    const want = canon(copy), ok = this.game.allows ? this.game.allows(this.position, copy) : this.game.moves(this.position).some((m) => canon(m) === want);
    if (!ok) throw new Refusal("illegal", `that move is not allowed now: ${want.slice(0, 120)}`);
    const d = chance(this.dice), made = this.game.apply(this.position, copy, d);
    canon(made.position);
    canon(made.events || []);
    this.position = deepFreeze(made.position);
    this.dice = d.state;
  }
  fingerprint() { return fingerprint([this.game.id, this.game.version, this.options, this.position, this.dice]); }
}

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.games = Array.isArray(env.GAMES) ? env.GAMES : GAMES; // tests may hand in their own small games
    this.meta = undefined; // undefined: not read yet; null: no room
    this.match = null;
    this.moves = [];
    this.head = null;
    this.line = Promise.resolve();
    this.rate = new WeakMap();
    if (globalThis.WebSocketRequestResponsePair) ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}')); // answered without waking the room
  }

  /** One thing at a time: a move is read, checked and kept before the next one is looked at. */
  run(fn) {
    const p = this.line.then(fn);
    this.line = p.catch(() => {});
    return p;
  }

  /** Read the room once after each wake: the table as it stands, and the list of moves for the seats. */
  async load() {
    if (this.meta !== undefined) return this.meta;
    const meta = (await this.ctx.storage.get("room")) || null;
    this.meta = meta;
    this.match = null;
    this.moves = [];
    if (!meta) return null;
    this.head = (await this.ctx.storage.get("head")) || { n: 0, at: meta.made };
    for (const list of (await this.ctx.storage.list({ prefix: "m:" })).values()) this.moves.push(...list);
    const game = this.games.find((g) => g.id === meta.game && g.version === meta.version);
    if (!game) return meta; // the rules changed since the room was made: it can be read and closed, not played
    if (this.head.position && this.head.n === this.moves.length) this.match = new Table(game, deepFreeze(meta.options), deepFreeze(this.head.position), this.head.dice);
    else { // no kept table (it should not happen): replay seed plus moves
      this.match = Table.open(game, deepFreeze(meta.options), meta.seed);
      for (const m of this.moves) this.match.play(m);
    }
    return meta;
  }

  async fetch(request) {
    const url = new URL(request.url), [, code, op] = url.pathname.split("/");
    try {
      return await this.run(async () => {
        switch (`${request.method} ${op}`) {
          case "POST create": return this.create(code, await body(request));
          case "POST join": return this.join(code, await body(request));
          case "GET state": { const seat = await this.seat(request); return answer(200, this.view(seat)); }
          case "POST move": { const seat = await this.seat(request), b = await body(request, MOST.move + 100); return answer(200, await this.play(seat, b.n, b.move)); }
          case "POST notice": { const seat = await this.seat(request); return answer(200, await this.notice(seat, await body(request))); }
          case "POST ice": { const seat = await this.seat(request); return answer(200, await this.ice(seat)); }
          case "POST end": { const seat = await this.seat(request); return answer(200, await this.end(seat)); }
          case "GET socket": return this.socket(request);
        }
        throw new No(404, "where", "there is nothing here by that name");
      });
    } catch (e) {
      if (e instanceof No) return refuse(e);
      throw e;
    }
  }

  async create(code, b) {
    if (await this.load()) throw new No(409, "taken", "that code is in use");
    const game = this.games.find((g) => g.id === b.game);
    if (!game) throw new No(400, "game", "this worker does not have that game");
    if (b.version !== game.version) throw new No(409, "version", `the worker has version ${game.version} of ${game.id} and the page has ${String(b.version).slice(0, 20)}: reload the page, or wait for the worker to be updated`);
    if (!MODES.includes(b.mode)) throw new No(400, "mode", `a room is ${MODES.join(" or ")}`);
    const pass = b.pass ?? "";
    if (pass !== "" && !HEX.test(pass)) throw new No(400, "password", "that is not a password digest");
    const seed = secret().slice(0, 16); // the room deals the seed, so the host cannot pick a lucky one
    let match;
    try { match = Table.open(game, deepFreeze(readOptions(game, b.options && typeof b.options === "object" && !Array.isArray(b.options) ? b.options : {})), seed); } catch (e) {
      if (e instanceof Refusal) throw new No(400, e.code, e.message);
      throw e;
    }
    const roles = b.roles;
    if (!Array.isArray(roles) || roles.length !== match.options.seats || !roles.every((r) => ROLES.includes(r)) || roles.filter((r) => r === "host").length !== 1) throw new No(400, "roles", "each seat needs a role, and exactly one seat is the host's");
    const host = roles.indexOf("host"), token = secret(), now = clock.now();
    const meta = { wire: WIRE, code, game: game.id, version: game.version, options: match.options, seed, roles: [...roles], mode: b.mode, made: now, ended: 0, pass: pass ? await digest(`${code}|${pass}`) : "", keys: roles.map(() => null) };
    meta.keys[host] = await digest(token);
    this.head = { n: 0, at: now, position: match.position, dice: match.dice };
    await this.ctx.storage.put({ room: meta, head: this.head });
    await this.ctx.storage.setAlarm(now + KEEP[meta.mode]);
    Object.assign(this, { meta, match, moves: [] });
    return answer(201, { token, ...this.view(host) });
  }

  async join(code, b) {
    const meta = await this.load(), now = clock.now();
    if (!meta) throw new No(404, "room", "there is no room with that code (it may have ended)");
    let fails = (await this.ctx.storage.get("fails")) || { n: 0, since: now };
    if (now - fails.since > HOUR) fails = { n: 0, since: now };
    if (fails.n >= MOST.fails) throw new No(429, "locked", "too many wrong passwords: this room lets no one in for an hour");
    if (meta.pass) {
      const pass = typeof b.pass === "string" && HEX.test(b.pass) ? b.pass : "";
      if (!same(await digest(`${code}|${pass}`), meta.pass)) {
        await this.ctx.storage.put("fails", { n: fails.n + 1, since: fails.since });
        throw new No(403, "password", "that is not this room's password");
      }
    }
    const seat = meta.roles.findIndex((r, i) => r === "friend" && !meta.keys[i]);
    if (seat < 0) throw new No(409, "full", "every seat in this room is taken");
    const token = secret();
    meta.keys[seat] = await digest(token);
    await this.ctx.storage.put("room", meta);
    this.tell({ t: "seats", taken: meta.keys.map((k) => !!k) });
    return answer(200, { token, ...this.view(seat) });
  }

  /** The seat a key opens, or a refusal. */
  async seat(request) {
    const token = tokenOf(request), meta = await this.load();
    if (!meta) throw new No(404, "room", "there is no room with that code (it may have ended)");
    const h = await digest(token), seat = meta.keys.findIndex((k) => k && same(k, h));
    if (seat < 0) throw new No(403, "seat", "that key opens no seat in this room");
    return seat;
  }

  /** What a seat sees: everything about the table, nothing about the other people. */
  view(seat) {
    const m = this.meta, match = this.match;
    return { wire: WIRE, code: m.code, game: m.game, version: m.version, options: m.options, seed: m.seed, roles: m.roles, mode: m.mode, seat, moves: this.moves, turn: match ? match.turn : null, result: match ? match.result : null, playable: !!match, here: this.here(), taken: m.keys.map((k) => !!k), notice: !!this.env.VAPID_PUBLIC };
  }

  /** Check one move by the rules, keep it, and tell the table. n is the move's place in the list. */
  async play(seat, n, move) {
    const meta = await this.load();
    if (!meta) throw new No(404, "room", "there is no room with that code (it may have ended)");
    const m = this.match;
    if (!m) throw new No(409, "version", "this room was made with rules the worker no longer has");
    const who = m.turn;
    if (who === null) throw new No(409, "over", "the game is over");
    if (!whole(n, 0, 1e6) || n !== this.moves.length) throw new No(409, "stale", `the room is at move ${this.moves.length}`);
    if (n >= MOST_MOVES) throw new No(409, "long", "the list of moves is full");
    // live: the host keeps the table, as in link play; by turn: each seat moves for itself, and the host for the bots
    const may = meta.mode === "live" ? who === seat || meta.roles[seat] === "host" : who === seat || (BOTS.has(meta.roles[who]) && meta.roles[seat] === "host");
    if (!may) throw new No(403, "turn", "it is not your turn");
    let text;
    try { text = JSON.stringify(move); } catch { text = ""; }
    if (!text || text.length > MOST.move) throw new No(413, "size", "that is not a move, or it is too large");
    try { m.play(move); } catch (e) { // nothing changes when a move is refused
      throw new No(400, e instanceof Refusal ? e.code : "illegal", e instanceof Refusal ? e.message : "that move is not allowed now");
    }
    const kept = JSON.parse(text), k = Math.floor(n / CHUNK), now = clock.now();
    this.moves.push(kept);
    this.head = { n: n + 1, at: now, position: m.position, dice: m.dice };
    await this.ctx.storage.put({ [row(k)]: this.moves.slice(k * CHUNK), head: this.head });
    const result = m.result, turn = m.turn;
    this.tell({ t: "moved", n, move: kept, by: seat, turn, result });
    if (result) await this.finish(now);
    else if (this.owner(turn) !== seat) this.ctx.waitUntil(this.nudge(turn)); // told when the turn comes to you, not after each of your own moves
    return { n: n + 1, turn, result };
  }
  /** The seat that plays for a seat: itself, or the host for a bot. */
  owner(seat) { return BOTS.has(this.meta.roles[seat]) ? this.meta.roles.indexOf("host") : seat; }

  /** The game is over: notices are forgotten at once, and the room is kept a week so everyone can see the end. */
  async finish(now) {
    const subs = [...(await this.ctx.storage.list({ prefix: "push:" })).keys()];
    if (subs.length) await this.ctx.storage.delete(subs);
    this.meta.ended = now;
    await this.ctx.storage.put("room", this.meta);
  }

  /** Tell the seat whose turn it is, by notice, if it is not at the table and asked to be told. */
  async nudge(turn) {
    const meta = this.meta, owner = this.owner(turn);
    if (this.here().includes(owner)) return;
    const sub = await this.ctx.storage.get(`push:${owner}`);
    if (!sub) return;
    const r = await notify(this.env, sub, { t: "turn", game: meta.game, room: meta.code }, clock.now());
    if (r === "gone") await this.ctx.storage.delete(`push:${owner}`);
  }

  async notice(seat, b) {
    if (!this.env.VAPID_PUBLIC) throw new No(503, "notice", "this worker sends no notices");
    if (b.sub === null) { await this.ctx.storage.delete(`push:${seat}`); return { notice: false }; }
    if (this.meta.ended) throw new No(409, "over", "the game is over");
    await this.ctx.storage.put(`push:${seat}`, readSubscription(b.sub));
    return { notice: true };
  }

  /** Where to find each other: the relay's short-lived keys when the worker has them, or the room itself as the relay. */
  async ice(seat) {
    const env = this.env, stun = { urls: env.STUN || "stun:stun.cloudflare.com:3478" }, now = clock.now();
    if (!env.TURN_KEY_ID || !env.TURN_KEY_TOKEN) return { iceServers: [stun], relay: "room", seat };
    if (this.iceCache && this.iceCache.until > now + 600000) return { ...this.iceCache.answer, seat };
    try {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, { method: "POST", headers: { authorization: `Bearer ${env.TURN_KEY_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ ttl: 7200 }) });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json(), list = (Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : []).filter((s) => s && (typeof s.urls === "string" || Array.isArray(s.urls)));
      if (!list.length) throw new Error("no servers");
      this.iceCache = { until: now + 7200000, answer: { iceServers: list, relay: "turn" } };
      return { ...this.iceCache.answer, seat };
    } catch { return { iceServers: [stun], relay: "room", seat }; } // the relay service failed: the room relays instead
  }

  /** The host closes the room: everything about it is deleted now. */
  async end(seat) {
    if (this.meta.roles[seat] !== "host") throw new No(403, "host", "only the host can close the room");
    for (const ws of this.ctx.getWebSockets()) try { ws.close(4001, "the host closed the room"); } catch { /* already gone */ }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.meta = null;
    this.match = null;
    return { ended: true };
  }

  async socket(request) {
    if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") throw new No(426, "socket", "this address takes a WebSocket");
    const meta = await this.load();
    if (!meta) throw new No(404, "room", "there is no room with that code (it may have ended)");
    const open = this.ctx.getWebSockets(), now = clock.now();
    for (const ws of open) if ((ws.deserializeAttachment() || {}).seat < 0 && now - ws.deserializeAttachment().at > 30000) try { ws.close(1008, "say hello first"); } catch { /* gone */ }
    if (this.ctx.getWebSockets().length >= MOST.sockets * meta.roles.length) throw new No(429, "busy", "this room has too many connections");
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat: -1, at: now });
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Seats with a socket open now. */
  here(except) {
    const seats = new Set();
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) { const a = ws.deserializeAttachment(); if (a && a.seat >= 0) seats.add(a.seat); }
    return [...seats].sort((a, b) => a - b);
  }
  send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch { /* it closed meanwhile */ } }
  tell(msg, except) { for (const ws of this.ctx.getWebSockets()) if (ws !== except && (ws.deserializeAttachment() || {}).seat >= 0) this.send(ws, msg); }

  /** A socket that talks too fast is warned, then closed. The count lives in memory: a sleeping room forgets it, which is fine. */
  allow(ws) {
    const now = clock.now(), r = this.rate.get(ws) || { n: 0, since: now };
    if (now - r.since > SOCKET_RATE[1]) { r.n = 0; r.since = now; }
    r.n++;
    this.rate.set(ws, r);
    return r.n <= SOCKET_RATE[0];
  }

  async webSocketMessage(ws, data) {
    if (!this.allow(ws)) { try { ws.close(1008, "too many messages"); } catch { /* gone */ } return; }
    return this.run(async () => {
      let msg;
      try { msg = parse(typeof data === "string" ? data : "", MOST.socket); } catch (e) { return this.send(ws, { t: "refused", error: e.code, message: e.message }); }
      const me = ws.deserializeAttachment() || { seat: -1 };
      try {
        if (msg.t === "ping") return this.send(ws, { t: "pong" });
        if (me.seat < 0) return await this.hello(ws, msg);
        if (msg.t === "signal") return this.signal(ws, me.seat, msg);
        if (msg.t === "move") { await this.play(me.seat, msg.n, msg.move); return; }
        throw new No(400, "what", "the room does not know that message");
      } catch (e) {
        if (!(e instanceof No)) throw e;
        this.send(ws, { t: "refused", error: e.code, message: e.message, n: this.moves.length });
      }
    });
  }

  /** The first message on a socket names its seat by key. Until then it hears nothing. */
  async hello(ws, msg) {
    if (msg.t !== "hello" || typeof msg.token !== "string" || !TOKEN.test(msg.token)) return ws.close(1008, "say hello first");
    if (msg.wire !== WIRE) return ws.close(4009, "the page and the worker speak different versions");
    const meta = await this.load();
    if (!meta) return ws.close(4004, "there is no room with that code");
    const h = await digest(msg.token), seat = meta.keys.findIndex((k) => k && same(k, h));
    if (seat < 0) return ws.close(4003, "that key opens no seat in this room");
    const now = clock.now();
    ws.serializeAttachment({ seat, at: now });
    if (meta.mode === "live" && !meta.ended && now - this.head.at > HOUR) { this.head = { ...this.head, at: now }; await this.ctx.storage.put("head", this.head); } // a live room in use is kept
    this.send(ws, { t: "welcome", ...this.view(seat) });
    this.tell({ t: "here", here: this.here() }, ws);
  }

  /** Pass one connection message to one seat: an offer, an answer, a route (ice) or goodbye. Checked for shape, never read. */
  signal(ws, from, msg) {
    if (!whole(msg.to, 0, this.meta.roles.length - 1) || msg.to === from || !SIGNALS.includes(msg.kind) || typeof msg.data !== "string" || msg.data.length > MOST.signal) throw new No(400, "signal", "that is not a signal this room can pass on");
    const to = this.ctx.getWebSockets().filter((s) => (s.deserializeAttachment() || {}).seat === msg.to);
    if (!to.length) throw new No(404, "away", "that seat is not at the table");
    for (const s of to) this.send(s, { t: "signal", from, kind: msg.kind, data: msg.data });
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, "closed"); } catch { /* already closed */ }
    if ((ws.deserializeAttachment() || {}).seat >= 0) this.tell({ t: "here", here: this.here(ws) }, ws);
  }
  async webSocketError(ws) { return this.webSocketClose(ws, 1011); }

  /** Keeping time: a room deletes itself once nothing has happened in it for its keeping time. */
  async alarm() {
    const s = this.ctx.storage, meta = await s.get("room"), head = await s.get("head");
    if (meta) {
      const due = meta.ended ? meta.ended + KEEP.ended : (head?.at ?? meta.made) + KEEP[meta.mode];
      if (clock.now() < due) return s.setAlarm(due);
    }
    for (const ws of this.ctx.getWebSockets()) try { ws.close(4004, "the room has ended"); } catch { /* gone */ }
    await s.deleteAlarm();
    await s.deleteAll();
    this.meta = null;
    this.match = null;
  }
}
