// SPDX-License-Identifier: AGPL-3.0-or-later
// The small worker (ruling 155; docs/design/servers/options.md, option C): room codes and signalling, a relay for pairs
// that cannot connect directly, play by turn with a "your turn" notice, and saves by code. Plain JSON over HTTP and one
// WebSocket per seat, so a plain process on a small machine could serve the same pages later (options.md, option E).
//
//   GET  /health                     what this worker serves: { ok, wire, games, notice, relay }
//   GET  /notice-key                 the public key pages subscribe to notices with, or null
//   POST /rooms                      { game, version, options, roles, mode, pass } -> { code, seat, token, ...room }
//   POST /rooms/CODE/join            { pass } -> { seat, token, ...room }
//   GET  /rooms/CODE                 the room as your seat sees it                    (Authorization: Seat <token>)
//   POST /rooms/CODE/move            { n, move }: checked by the rules, kept, passed on (Authorization: Seat <token>)
//   POST /rooms/CODE/notice          { sub } to be told when it is your turn, { sub: null } to stop
//   POST /rooms/CODE/ice             routes for a direct connection, and which relay to fall back on
//   POST /rooms/CODE/end             the host closes the room: everything about it is deleted
//   GET  /rooms/CODE/socket          WebSocket: hello, signal, move; the room sends welcome, here, seats, signal, moved, refused
//   POST /saves                      { save, code? } -> { code }: a save kept a year under a secret code
//   POST /saves/open, /saves/drop    { code }
//
// Every answer that refuses is { error, message } with a status. Only pages from the addresses in ORIGINS are served.
import { GAMES } from "./games.js";
import { Keep } from "./keep.js";
import { Limiter } from "./limit.js";
import { Room } from "./room.js";
import { MOST, No, ROOM, SAVE, WIRE, answer, body, clock, digest, refuse, roomCode, saveCode } from "./wire.js";

export { Keep, Room };

const limiter = new Limiter();
const listOf = (text) => String(text || "").split(/[\s,]+/).filter(Boolean);

/** Pass a request on to one Durable Object, with its body read as text (it is small and already counted). */
async function forward(ns, name, path, request, text) {
  const init = { method: request.method, headers: request.headers };
  if (text !== undefined) init.body = text;
  return ns.get(ns.idFromName(name)).fetch(new Request(`https://do.internal/${path}`, init));
}
const textOf = async (request, most) => {
  if (Number(request.headers.get("content-length") || 0) > most) throw new No(413, "size", "that message is too large");
  const t = await request.text();
  if (t.length > most) throw new No(413, "size", "that message is too large");
  return t;
};

async function route(request, env, parts, who, now) {
  const [top, code, op = ""] = parts, M = request.method;
  if (top === "notice-key" && M === "GET") return answer(200, { key: env.VAPID_PUBLIC || null });

  if (top === "rooms" && !code && M === "POST") {
    if (!limiter.take("room", who, now)) throw new No(429, "slow", "too many rooms made from here: wait an hour");
    const b = await body(request);
    for (let tries = 0; tries < 6; tries++) { // a new code; another try in the rare case it is in use
      const c = roomCode(), r = await env.ROOMS.get(env.ROOMS.idFromName(c)).fetch(new Request(`https://do.internal/${c}/create`, { method: "POST", body: JSON.stringify(b) }));
      if (r.status !== 409 || (await r.clone().json()).error !== "taken") return r;
    }
    throw new No(503, "busy", "no free room code: try again");
  }
  if (top === "rooms" && code) {
    const c = code.toUpperCase();
    if (!ROOM.test(c)) throw new No(404, "room", "that is not a room code");
    const ops = { "POST join": "join", "GET ": "state", "POST move": "move", "POST notice": "notice", "POST ice": "ice", "POST end": "end", "GET socket": "socket" }, to = ops[`${M} ${op}`];
    if (!to || parts.length > 3) throw new No(404, "where", "there is nothing here by that name");
    if (to === "join" && !limiter.take("join", who, now)) throw new No(429, "slow", "too many tries to join from here: wait an hour");
    if (to === "ice" && !limiter.take("ice", who, now)) throw new No(429, "slow", "too many asks for routes from here: wait an hour");
    return forward(env.ROOMS, c, `${c}/${to}`, request, M === "POST" ? await textOf(request, MOST.body) : undefined);
  }

  if (top === "saves" && M === "POST" && parts.length <= 2) {
    if (!limiter.take("save", who, now)) throw new No(429, "slow", "too many saves from here: wait an hour");
    const b = await body(request, MOST.save + 200), at = async (k) => env.KEEPS.get(env.KEEPS.idFromName(await digest(`save|${k}`)));
    const post = async (k, path, payload) => (await at(k)).fetch(new Request(`https://do.internal/${await digest(`save|${k}`)}/${path}`, { method: "POST", body: JSON.stringify(payload) }));
    if (!code) {
      if (b.code !== undefined) {
        if (typeof b.code !== "string" || !SAVE.test(b.code)) throw new No(400, "code", "that is not a save code");
        const r = await post(b.code, "put", { save: b.save });
        return r.ok ? answer(r.status, { code: b.code, ...(await r.json()) }) : r;
      }
      for (let tries = 0; tries < 4; tries++) {
        const k = saveCode(), r = await post(k, "put", { save: b.save, fresh: true });
        if (r.status !== 409) return r.ok ? answer(201, { code: k, ...(await r.json()) }) : r;
      }
      throw new No(503, "busy", "no free save code: try again");
    }
    if (code !== "open" && code !== "drop") throw new No(404, "where", "there is nothing here by that name");
    if (typeof b.code !== "string" || !SAVE.test(b.code)) throw new No(400, "code", "that is not a save code");
    return post(b.code, code, {});
  }
  throw new No(404, "where", "there is nothing here by that name");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") || "", allowed = listOf(env.ORIGINS), ok = allowed.includes(origin);
    const cors = ok ? { "access-control-allow-origin": origin, vary: "origin" } : {};
    const finish = (r) => {
      if (r.status === 101) return r;
      const h = new Headers(r.headers);
      for (const [k, v] of Object.entries(cors)) h.set(k, v);
      return new Response(r.body, { status: r.status, headers: h });
    };
    try {
      const url = new URL(request.url), parts = url.pathname.split("/").filter(Boolean);
      if (request.method === "OPTIONS") return new Response(null, { status: ok ? 204 : 403, headers: ok ? { ...cors, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type, authorization", "access-control-max-age": "86400" } : {} });
      if (!parts.length || (parts[0] === "health" && parts.length === 1)) {
        const games = Array.isArray(env.GAMES) ? env.GAMES : GAMES;
        return finish(answer(200, { ok: env.OPEN !== "no", wire: WIRE, games: Object.fromEntries(games.map((g) => [g.id, g.version])), notice: !!env.VAPID_PUBLIC, relay: env.TURN_KEY_ID && env.TURN_KEY_TOKEN ? "turn" : "room" }));
      }
      if (!ok) throw new No(403, "origin", "this worker serves only its own site's pages");
      if (env.OPEN === "no") throw new No(503, "closed", "rooms are closed for now: play by link instead");
      const who = request.headers.get("cf-connecting-ip") || "unknown", now = clock.now();
      if (!limiter.take("any", who, now)) throw new No(429, "slow", "too many requests from here: wait a minute");
      if (env.LIMIT && !(await env.LIMIT.limit({ key: who })).success) throw new No(429, "slow", "too many requests from here: wait a minute");
      return finish(await route(request, env, parts, who, now));
    } catch (e) {
      if (e instanceof No) return finish(refuse(e));
      console.error(e && e.stack ? e.stack.split("\n")[0] : "fault"); // the first line only: never a body, an address or a key
      return finish(answer(500, { error: "fault", message: "the worker failed: play by link instead" }));
    }
  },
};
