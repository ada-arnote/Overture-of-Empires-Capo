// SPDX-License-Identifier: AGPL-3.0-or-later
// The small worker (server/worker/, ruling 155), run against a stand-in for Cloudflare's runtime (test/fixtures/workerd.js),
// and the pages' side of it (site/rooms.js). Nothing here reaches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv, createECDH, hkdfSync } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Refusal, chance, createMatch, fingerprint, seedState } from "../src/core/index.js";
import { banners } from "../src/games/banners/rules.js";
import { choose as bannersBot } from "../src/games/banners/bot.js";
import { playScript, stones } from "./fixtures/stones.js";
import { Namespace, browserSocket, install } from "./fixtures/workerd.js";
import { KEEP, ROOM, SAVE, clock } from "../server/worker/wire.js";
import { lock, notify, vapid } from "../server/worker/push.js";
import { Limiter } from "../server/worker/limit.js";
import { PLAY_ADDRESSES } from "../site/config.js";
import { passDigest, roomsAt, workerAddress } from "../site/rooms.js";

install();
const { default: worker, Room, Keep } = await import("../server/worker/index.js");
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = "https://ada-arnote.github.io", BASE = "https://rooms.test";
let now = Date.UTC(2027, 2, 1), ip = 0;
clock.now = () => now;
const DAY = 86400000;
const b64 = (b) => Buffer.from(b).toString("base64url");

/** A worker with its own rooms and saves, and a page at one address that asks it things. */
function world(extra = {}) {
  const env = { ORIGINS: `${SITE} http://localhost:8080`, OPEN: "yes", STUN: "stun:stun.example:3478", GAMES: [stones, banners], ...extra };
  env.ROOMS = new Namespace(Room, env);
  env.KEEPS = new Namespace(Keep, env);
  const who = `198.51.100.${++ip}`; // an address from the documentation range
  const ask = async (method, p, payload, { token, origin = SITE, from = who } = {}) => {
    const headers = { "cf-connecting-ip": from };
    if (origin) headers.origin = origin;
    if (payload !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Seat ${token}`;
    const r = await worker.fetch(new Request(BASE + p, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) }), env);
    return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
  };
  const settle = async () => { await env.ROOMS.settle(); await env.KEEPS.settle(); };
  return { env, ask, who, settle };
}
const until = async (ok) => { for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setImmediate(r)); };

/** A room of stones with a host and friends; returns the room, each seat's key, and a copy of the game to choose moves from. */
async function stonesRoom(w, { roles = ["host", "friend"], mode = "turns", pass = "" } = {}) {
  const made = await w.ask("POST", "/rooms", { game: "stones", version: "1", options: { seats: roles.length, goal: 12 }, roles, mode, pass: await passDigest(pass) });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const keys = { [made.body.seat]: made.body.token };
  for (let i = 0; i < roles.filter((r) => r === "friend").length; i++) {
    const j = await w.ask("POST", `/rooms/${made.body.code}/join`, { pass: await passDigest(pass) });
    assert.equal(j.status, 200, JSON.stringify(j.body));
    keys[j.body.seat] = j.body.token;
  }
  const copy = createMatch(stones, { seed: made.body.seed, options: made.body.options });
  return { code: made.body.code, keys, copy, room: made.body };
}
const pick = (m) => { const l = m.legal(), k = m.list.length; return l[(k * 7 + (k >> 2)) % l.length]; }; // as playScript
const keyFor = (r, seat) => r.keys[seat] ?? r.keys[r.room.roles.indexOf("host")];

/** One seat at the table by WebSocket, as a page would sit. */
async function sit(w, code, token, wire = 1) {
  const Sock = browserSocket(worker, w.env, SITE), ws = new Sock(`wss://rooms.test/rooms/${code}/socket`), seen = [];
  ws.onmessage = (e) => seen.push(JSON.parse(e.data));
  ws.onclose = (e) => { ws.shut = e; };
  await until(() => ws.readyState === 1 || ws.shut);
  if (token !== null && !ws.shut) ws.send(JSON.stringify({ t: "hello", wire, token }));
  await w.settle();
  return { ws, seen, last: (t) => seen.filter((m) => m.t === t).at(-1) };
}

test("health says what the worker serves, to anyone; everything else only to its own site's pages", async () => {
  const w = world();
  const h = await w.ask("GET", "/health", undefined, { origin: "" });
  assert.equal(h.status, 200);
  assert.deepEqual(h.body, { ok: true, wire: 1, games: { stones: "1", banners: "7" }, notice: false, relay: "room" });
  assert.equal((await w.ask("POST", "/rooms", {}, { origin: "" })).body.error, "origin");
  assert.equal((await w.ask("POST", "/rooms", {}, { origin: "https://elsewhere.example" })).status, 403);
  const pre = await worker.fetch(new Request(`${BASE}/rooms`, { method: "OPTIONS", headers: { origin: SITE } }), w.env);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), SITE);
  assert.match(pre.headers.get("access-control-allow-headers"), /authorization/);
  const shut = world({ OPEN: "no" });
  assert.equal((await shut.ask("POST", "/rooms", {})).body.error, "closed");
  assert.equal((await w.ask("GET", "/nothing")).status, 404);
});

test("a room is made by code; friends join with the password; wrong passwords are counted and lock the room", async () => {
  const w = world();
  const r = await stonesRoom(w, { pass: "tea" });
  assert.match(r.code, ROOM);
  assert.equal(r.room.seat, 0);
  assert.deepEqual(r.room.taken, [true, false], "as the host saw it when the room was made");
  assert.equal((await w.ask("POST", `/rooms/${r.code}/join`, { pass: await passDigest("tea") })).body.error, "full");
  const other = await w.ask("POST", "/rooms", { game: "stones", version: "1", options: { seats: 2 }, roles: ["host", "friend"], mode: "turns", pass: await passDigest("tea") });
  const code = other.body.code;
  assert.equal((await w.ask("POST", `/rooms/${code}/join`, { pass: await passDigest("coffee") })).body.error, "password");
  assert.equal((await w.ask("POST", `/rooms/${code}/join`, {})).body.error, "password");
  for (let i = 0; i < 8; i++) await w.ask("POST", `/rooms/${code}/join`, { pass: await passDigest(`guess ${i}`) });
  assert.equal((await w.ask("POST", `/rooms/${code}/join`, { pass: await passDigest("tea") })).body.error, "locked");
  now += 3600001;
  const j = await w.ask("POST", `/rooms/${code.toLowerCase()}/join`, { pass: await passDigest("tea") });
  assert.equal(j.status, 200);
  assert.equal(j.body.seat, 1);
  assert.equal((await w.ask("POST", "/rooms/AAAAAA/join", {})).body.error, "room", "vowels are never in a code");
  assert.equal((await w.ask("POST", "/rooms/BCDFGH/join", {})).status, 404);
});

test("a room refuses a game, version, mode, options or seats it cannot hold", async () => {
  const w = world(), make = (b) => w.ask("POST", "/rooms", { game: "stones", version: "1", options: { seats: 2 }, roles: ["host", "friend"], mode: "turns", ...b });
  assert.equal((await make({ game: "chess" })).body.error, "game");
  const v = await make({ version: "0" });
  assert.equal(v.status, 409);
  assert.match(v.body.message, /version 1 of stones/);
  assert.equal((await make({ mode: "open" })).body.error, "mode");
  assert.equal((await make({ options: { seats: 9 } })).body.error, "option");
  assert.equal((await make({ roles: ["friend", "friend"] })).body.error, "roles");
  assert.equal((await make({ roles: ["host", "host"] })).body.error, "roles");
  assert.equal((await make({ roles: ["host", "friend", "easy"] })).body.error, "roles");
  assert.equal((await make({ pass: "tea" })).body.error, "password", "a password is sent only as a digest");
  assert.equal((await w.ask("POST", "/rooms", "x".repeat(80000))).status, 413);
});

test("every move is checked by the rules: out of turn, illegal, stale and oversized moves change nothing", async () => {
  const w = world(), r = await stonesRoom(w), m = r.copy;
  const turn = m.turn, other = 1 - turn, move = (seat, n, mv) => w.ask("POST", `/rooms/${r.code}/move`, { n, move: mv }, { token: r.keys[seat] });
  assert.equal((await move(other, 0, { do: "roll" })).body.error, "turn");
  assert.equal((await move(turn, 0, { do: "bank" })).body.error, "illegal");
  assert.equal((await move(turn, 0, { do: "fly" })).body.error, "illegal");
  assert.equal((await move(turn, 0, { do: 0.5 })).body.error, "shape");
  assert.equal((await move(turn, 3, { do: "roll" })).body.error, "stale");
  assert.equal((await move(turn, 0, { do: "x".repeat(5000) })).status, 413);
  assert.equal((await w.ask("POST", `/rooms/${r.code}/move`, { n: 0, move: { do: "roll" } }, { token: "x".repeat(24) })).body.error, "seat");
  assert.equal((await w.ask("POST", `/rooms/${r.code}/move`, { n: 0, move: { do: "roll" } })).status, 401);
  assert.deepEqual((await w.ask("GET", `/rooms/${r.code}`, undefined, { token: r.keys[0] })).body.moves, []);

  const store = w.env.ROOMS.holders.get(r.code).storage;
  let most = 0;
  while (m.turn !== null) {
    const mv = pick(m), seat = m.turn, before = store.writes, n = m.list.length;
    const a = await move(seat, n, mv);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    most = Math.max(most, store.writes - before);
    m.play(mv);
    assert.equal(a.body.n, n + 1);
    assert.equal(a.body.turn, m.turn);
    const head = await store.get("head");
    assert.equal(fingerprint(["stones", "1", r.room.options, head.position, head.dice]), m.fingerprint(), `the room's table and the core's match agree after move ${n + 1}`);
    if (n === 6) w.env.ROOMS.holders.get(r.code).sleep(); // the room sleeps, and wakes from its kept table
    if (n === 9) { await store.delete("head"); w.env.ROOMS.holders.get(r.code).sleep(); } // with no kept table it replays seed plus moves
  }
  assert.ok(most <= 3, `a move costs at most a few row writes, not ${most}`); // its row, the head, and the end of the game
  const s = await w.ask("GET", `/rooms/${r.code}`, undefined, { token: r.keys[1] });
  assert.deepEqual(s.body.moves, m.list);
  assert.deepEqual(s.body.result, m.result);
  assert.equal(s.body.seat, 1);
  assert.equal((await move(0, m.list.length, { do: "roll" })).body.error, "over");
});

test("by turn the host moves for the bots; live, the host keeps the table; friends move only for themselves", async () => {
  const w = world();
  const t = await stonesRoom(w, { roles: ["host", "friend", "easy"] });
  for (let k = 0; k < 40 && t.copy.turn !== null; k++) {
    const seat = t.copy.turn, mv = pick(t.copy), n = t.copy.list.length;
    if (seat === 2) assert.equal((await w.ask("POST", `/rooms/${t.code}/move`, { n, move: mv }, { token: t.keys[1] })).body.error, "turn", "a friend does not move for a bot");
    if (seat === 1) assert.equal((await w.ask("POST", `/rooms/${t.code}/move`, { n, move: mv }, { token: t.keys[0] })).body.error, "turn", "by turn, the host does not move for a friend");
    assert.equal((await w.ask("POST", `/rooms/${t.code}/move`, { n, move: mv }, { token: keyFor(t, seat) })).status, 200);
    t.copy.play(mv);
  }
  const l = await stonesRoom(w, { mode: "live" });
  for (let k = 0; k < 12 && l.copy.turn !== null; k++) {
    const seat = l.copy.turn, mv = pick(l.copy), n = l.copy.list.length;
    if (seat === 0) assert.equal((await w.ask("POST", `/rooms/${l.code}/move`, { n, move: mv }, { token: l.keys[1] })).body.error, "turn");
    assert.equal((await w.ask("POST", `/rooms/${l.code}/move`, { n, move: mv }, { token: l.keys[0] })).status, 200, "live, the host may send any seat's move, as in link play");
    l.copy.play(mv);
  }
});

test("rooms delete themselves when their keeping time ends", async () => {
  const w = world(), r = await stonesRoom(w), state = () => w.ask("GET", `/rooms/${r.code}`, undefined, { token: r.keys[0] });
  const mv = pick(r.copy);
  await w.ask("POST", `/rooms/${r.code}/move`, { n: 0, move: mv }, { token: r.keys[r.copy.turn] });
  const last = now;
  now = last + KEEP.turns - 1000;
  await w.env.ROOMS.alarms(now);
  assert.equal((await state()).status, 200, "a game by turn waits 90 days after its last move");
  now = last + KEEP.turns + 1000;
  await w.env.ROOMS.alarms(now);
  assert.equal((await state()).body.error, "room");
  assert.equal(w.env.ROOMS.holders.get(r.code).storage.map.size, 0);

  const done = await stonesRoom(w);
  while (done.copy.turn !== null) { const mv2 = pick(done.copy), seat = done.copy.turn; await w.ask("POST", `/rooms/${done.code}/move`, { n: done.copy.list.length, move: mv2 }, { token: done.keys[seat] }); done.copy.play(mv2); }
  const ended = now;
  now = ended + KEEP.turns; // the first alarm was set for the full keeping time
  await w.env.ROOMS.alarms(now);
  assert.equal((await w.ask("GET", `/rooms/${done.code}`, undefined, { token: done.keys[0] })).status, 404, "a finished game is kept a week");

  const live = await stonesRoom(w, { mode: "live" }), start = now;
  now = start + KEEP.live - 3 * 3600000;
  const s = await sit(w, live.code, live.keys[0]); // someone at the table keeps a live room
  s.ws.close();
  await w.settle();
  now = start + KEEP.live + 1000;
  await w.env.ROOMS.alarms(now);
  assert.equal((await w.ask("GET", `/rooms/${live.code}`, undefined, { token: live.keys[0] })).status, 200);
  now += KEEP.live;
  await w.env.ROOMS.alarms(now);
  assert.equal((await w.ask("GET", `/rooms/${live.code}`, undefined, { token: live.keys[0] })).status, 404);
});

test("the host closes the room and everything about it is deleted", async () => {
  const w = world(), r = await stonesRoom(w);
  const s = await sit(w, r.code, r.keys[1]);
  assert.equal((await w.ask("POST", `/rooms/${r.code}/end`, {}, { token: r.keys[1] })).body.error, "host");
  assert.equal((await w.ask("POST", `/rooms/${r.code}/end`, {}, { token: r.keys[0] })).status, 200);
  await w.settle();
  assert.equal(s.ws.shut?.code, 4001);
  assert.equal(w.env.ROOMS.holders.get(r.code).storage.map.size, 0);
  assert.equal(w.env.ROOMS.holders.get(r.code).storage.alarm, null);
});

test("sockets: hello by key, who is here, signals passed to one seat, moves to all", async () => {
  const w = world(), r = await stonesRoom(w, { mode: "live" });
  const host = await sit(w, r.code, r.keys[0]);
  assert.equal(host.last("welcome").seat, 0);
  assert.deepEqual(host.last("welcome").here, [0]);
  const friend = await sit(w, r.code, r.keys[1]);
  assert.deepEqual(host.last("here").here, [0, 1]);

  host.ws.send(JSON.stringify({ t: "signal", to: 1, kind: "offer", data: "v=0 an offer" }));
  await w.settle();
  assert.deepEqual(friend.last("signal"), { t: "signal", from: 0, kind: "offer", data: "v=0 an offer" });
  for (const bad of [{ to: 0 }, { to: 5 }, { kind: "chat" }, { data: 7 }, { data: "x".repeat(13000) }]) {
    host.ws.send(JSON.stringify({ t: "signal", to: 1, kind: "ice", data: "c", ...bad }));
    await w.settle();
    assert.equal(host.last("refused").error, "signal", JSON.stringify(bad));
  }
  host.ws.send(JSON.stringify({ t: "chat", text: "hello" }));
  await w.settle();
  assert.equal(host.last("refused").error, "what", "no free text");

  const mv = pick(r.copy), t = r.copy.turn;
  friend.ws.send(JSON.stringify({ t: "move", n: 0, move: mv }));
  await w.settle();
  if (t === 1) { assert.equal(host.last("moved").by, 1); assert.deepEqual(friend.last("moved").move, mv); r.copy.play(mv); }
  else assert.equal(friend.last("refused").error, "turn");
  host.ws.send(JSON.stringify({ t: "move", n: r.copy.list.length, move: { do: "fly" } }));
  await w.settle();
  assert.equal(host.last("refused").error, "illegal");

  friend.ws.close(1000, "bye");
  await w.settle();
  assert.deepEqual(host.last("here").here, [0]);
  host.ws.send(JSON.stringify({ t: "signal", to: 1, kind: "answer", data: "a" }));
  await w.settle();
  assert.equal(host.last("refused").error, "away");

  w.env.ROOMS.holders.get(r.code).sleep();
  host.ws.send('{"t":"ping"}');
  await w.settle();
  assert.equal(host.last("pong").t, "pong");
  assert.equal(w.env.ROOMS.holders.get(r.code).obj, null, "a ping is answered without waking the room");
});

test("sockets that do not say who they are, speak another version, or talk too fast are closed", async () => {
  const w = world(), r = await stonesRoom(w);
  const quiet = await sit(w, r.code, null);
  quiet.ws.send(JSON.stringify({ t: "signal", to: 1, kind: "offer", data: "x" }));
  await w.settle();
  assert.equal(quiet.ws.shut?.code, 1008);
  assert.equal((await sit(w, r.code, "y".repeat(24))).ws.shut?.code, 4003);
  assert.equal((await sit(w, r.code, r.keys[0], 2)).ws.shut?.code, 4009);
  const fast = await sit(w, r.code, r.keys[0]);
  for (let i = 0; i < 110; i++) fast.ws.send('{"t":"what"}');
  await w.settle();
  assert.equal(fast.ws.shut?.code, 1008);
  assert.equal((await sit(w, "BCDFGH", r.keys[0])).ws.shut?.code, 1006, "no room, no socket");
  assert.equal((await w.ask("GET", `/rooms/${r.code}/socket`)).status, 426);
});

test("routes: the room relays when the worker has no relay keys, and passes short-lived keys when it has", async () => {
  const w = world(), r = await stonesRoom(w);
  assert.deepEqual((await w.ask("POST", `/rooms/${r.code}/ice`, {}, { token: r.keys[1] })).body, { iceServers: [{ urls: "stun:stun.example:3478" }], relay: "room", seat: 1 });
  const t = world({ TURN_KEY_ID: "id", TURN_KEY_TOKEN: "secret" }), tr = await stonesRoom(t), real = globalThis.fetch, asked = [];
  try {
    globalThis.fetch = async (url, init) => { asked.push([String(url), init.headers.authorization]); return new Response(JSON.stringify({ iceServers: { urls: ["turn:turn.example:3478"], username: "u", credential: "c" } })); };
    const a = await t.ask("POST", `/rooms/${tr.code}/ice`, {}, { token: tr.keys[0] });
    assert.equal(a.body.relay, "turn");
    assert.deepEqual(a.body.iceServers[0].urls, ["turn:turn.example:3478"]);
    await t.ask("POST", `/rooms/${tr.code}/ice`, {}, { token: tr.keys[1] });
    assert.equal(asked.length, 1, "keys are shared by the room for a while");
    assert.match(asked[0][0], /\/turn\/keys\/id\/credentials\/generate-ice-servers$/);
    assert.equal(asked[0][1], "Bearer secret");
    globalThis.fetch = async () => new Response("no", { status: 500 });
    const u = world({ TURN_KEY_ID: "id", TURN_KEY_TOKEN: "secret" }), ur = await stonesRoom(u);
    assert.equal((await u.ask("POST", `/rooms/${ur.code}/ice`, {}, { token: ur.keys[0] })).body.relay, "room", "a failing relay service falls back to the room");
  } finally { globalThis.fetch = real; }
});

/** Keys as a browser and a worker would have them. */
async function noticeKeys() {
  const v = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const env = { VAPID_PUBLIC: b64(new Uint8Array(await crypto.subtle.exportKey("raw", v.publicKey))), VAPID_PRIVATE: (await crypto.subtle.exportKey("jwk", v.privateKey)).d, VAPID_SUBJECT: `${SITE}/Overture-of-Empires-Capo/` };
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { env, verify: v.publicKey, ua, sub: { endpoint: "https://fcm.googleapis.com/fcm/send/abc123", keys: { p256dh: b64(ua.getPublicKey()), auth: b64(auth) } }, auth };
}
/** Open a notice as the browser does (RFC 8291 and 8188), with Node's own crypto rather than the worker's code. */
function open(bytes, ua, auth) {
  const b = Buffer.from(bytes), salt = b.subarray(0, 16), rs = b.readUInt32BE(16), idlen = b[20], key = b.subarray(21, 21 + idlen), shut = b.subarray(21 + idlen);
  assert.equal(rs, 4096);
  const shared = ua.computeSecret(key);
  const ikm = Buffer.from(hkdfSync("sha256", shared, auth, Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), key]), 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16)), nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(shut.subarray(shut.length - 16));
  const plain = Buffer.concat([d.update(shut.subarray(0, shut.length - 16)), d.final()]);
  assert.equal(plain.at(-1), 2, "one record, the last");
  return plain.subarray(0, -1).toString("utf8");
}

test("the notice is signed by the site and locked so only that browser can read it", async () => {
  const k = await noticeKeys(), sub = { endpoint: k.sub.endpoint, p256dh: k.sub.keys.p256dh, auth: k.sub.keys.auth };
  assert.equal(open(await lock(sub, '{"t":"turn","room":"BCDFGH"}'), k.ua, k.auth), '{"t":"turn","room":"BCDFGH"}');
  const header = await vapid(k.env, sub.endpoint, now), [, t, key] = header.match(/^vapid t=([\w-]+\.[\w-]+\.[\w-]+), k=([\w-]+)$/);
  assert.equal(key, k.env.VAPID_PUBLIC);
  const [h, c, s] = t.split(".");
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k.verify, Buffer.from(s, "base64url"), new TextEncoder().encode(`${h}.${c}`)));
  const claims = JSON.parse(Buffer.from(c, "base64url"));
  assert.deepEqual(claims, { aud: "https://fcm.googleapis.com", exp: Math.floor(now / 1000) + 43200, sub: k.env.VAPID_SUBJECT });
  const real = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("", { status: 410 });
    assert.equal(await notify(k.env, sub, { t: "turn" }, now), "gone");
    globalThis.fetch = async () => { throw new Error("offline"); };
    assert.equal(await notify(k.env, sub, { t: "turn" }, now), "failed");
  } finally { globalThis.fetch = real; }
  assert.equal(await notify({}, sub, { t: "turn" }, now), "failed", "no keys, no notice");
});

test("a seat that asked is told when its turn comes, unless it is at the table; the notice is forgotten when the game ends", async () => {
  const k = await noticeKeys(), w = world(k.env), r = await stonesRoom(w), real = globalThis.fetch, sent = [];
  const notice = (seat, sub) => w.ask("POST", `/rooms/${r.code}/notice`, { sub }, { token: r.keys[seat] });
  assert.equal((await notice(1, { ...k.sub, endpoint: "https://evil.example/push" })).body.error, "notice", "only push services are ever fetched");
  assert.equal((await notice(1, { ...k.sub, endpoint: "http://fcm.googleapis.com/x" })).body.error, "notice");
  assert.equal((await notice(1, { ...k.sub, keys: { p256dh: "x", auth: "y" } })).body.error, "notice");
  assert.equal((await notice(1, k.sub)).status, 200);
  assert.equal((await stonesRoom(world())).room.notice, false);
  const quiet = world(), qr = await stonesRoom(quiet);
  assert.equal((await quiet.ask("POST", `/rooms/${qr.code}/notice`, { sub: k.sub }, { token: qr.keys[1] })).status, 503);
  // The room deals its own seed, so the game differs each run: count the notices that should go, phase by phase.
  const m = r.copy, store = w.env.ROOMS.holders.get(r.code).storage;
  let due = 0, present = false;
  const play = async () => {
    const mv = pick(m), seat = m.turn;
    assert.equal((await w.ask("POST", `/rooms/${r.code}/move`, { n: m.list.length, move: mv }, { token: r.keys[seat] })).status, 200);
    m.play(mv);
    await w.settle();
    if (m.turn === 1 && seat !== 1 && !present) due++; // the turn came to the friend, who is away
  };
  const playUntil = async (ok) => { while (m.turn !== null && !ok()) await play(); };
  try {
    globalThis.fetch = async (url, init) => { sent.push({ url: String(url), init }); return new Response("", { status: 201 }); };
    await playUntil(() => due >= 2);
    assert.equal(sent.length, due, "told each time the turn comes, never after one's own moves");
    if (sent.length) {
      assert.equal(sent[0].url, k.sub.endpoint);
      assert.equal(sent[0].init.headers["content-encoding"], "aes128gcm");
      assert.deepEqual(JSON.parse(open(sent[0].init.body, k.ua, k.auth)), { t: "turn", game: "stones", room: r.code });
    }
    const s = await sit(w, r.code, r.keys[1]);
    present = true;
    const before = sent.length, moves = m.list.length;
    await playUntil(() => m.list.length >= moves + 12);
    assert.equal(sent.length, before, "no notice for a seat at the table");
    s.ws.close();
    await w.settle();
    present = false;
    globalThis.fetch = async () => new Response("", { status: 410 });
    const owed = due;
    await playUntil(() => due > owed);
    if (m.turn !== null) {
      assert.equal(await store.get("push:1"), undefined, "a withdrawn subscription is forgotten");
      assert.equal((await notice(1, k.sub)).status, 200);
    }
    globalThis.fetch = async () => new Response("", { status: 201 });
    await playUntil(() => false);
    assert.deepEqual([...store.map.keys()].filter((x) => x.startsWith("push:")), [], "the game is over: notices forgotten");
    assert.equal((await notice(1, k.sub)).body.error, "over");
    assert.equal((await notice(1, null)).status, 200);
  } finally { globalThis.fetch = real; }
});

test("saves by code: kept only if they replay whole, opened, replaced, dropped, and gone after a year unused", async () => {
  const w = world(), text = playScript(createMatch(stones, { seed: "s" })).save(), other = playScript(createMatch(stones, { seed: "t" })).save();
  const kept = await w.ask("POST", "/saves", { save: text });
  assert.equal(kept.status, 201);
  assert.match(kept.body.code, SAVE);
  assert.equal(kept.body.game, "stones");
  const code = kept.body.code, openIt = () => w.ask("POST", "/saves/open", { code });
  assert.equal((await openIt()).body.save, text);
  assert.equal((await w.ask("POST", "/saves", { save: other, code })).status, 200);
  assert.equal((await openIt()).body.save, other);
  const f = JSON.parse(text);
  assert.equal((await w.ask("POST", "/saves", { save: JSON.stringify({ ...f, end: "0000000000000000" }) })).body.error, "end");
  assert.equal((await w.ask("POST", "/saves", { save: JSON.stringify({ ...f, moves: [{ do: "fly" }, ...f.moves] }) })).body.error, "illegal");
  assert.equal((await w.ask("POST", "/saves", { save: JSON.stringify({ ...f, moves: [...f.moves.slice(0, 3), { do: "fly" }] }) })).body.error, "save", "a save that replays only in part is not kept");
  assert.equal((await w.ask("POST", "/saves", { save: "hello" })).body.error, "file");
  assert.equal((await w.ask("POST", "/saves", { save: "x".repeat(65000) })).status, 413);
  assert.equal((await w.ask("POST", "/saves/open", { code: "BCDFG" })).body.error, "code");
  assert.equal((await w.ask("POST", "/saves", { save: text, code: "nope" })).body.error, "code");

  now += 200 * DAY;
  assert.equal((await openIt()).status, 200, "opening keeps it another year");
  now += 300 * DAY;
  await w.env.KEEPS.alarms(now);
  assert.equal((await openIt()).status, 200);
  now += 366 * DAY;
  await w.env.KEEPS.alarms(now);
  assert.equal((await openIt()).body.error, "save");
  const again = await w.ask("POST", "/saves", { save: text });
  assert.equal((await w.ask("POST", "/saves/drop", { code: again.body.code })).body.dropped, true);
  assert.equal((await w.ask("POST", "/saves/open", { code: again.body.code })).status, 404);
});

test("rate limits: per address, per kind, in memory only", async () => {
  const l = new Limiter({ x: [3, 1000] }, 10);
  assert.deepEqual([1, 2, 3, 4].map(() => l.take("x", "a", 0)), [true, true, true, false]);
  assert.equal(l.take("x", "b", 0), true, "another address has its own count");
  assert.equal(l.take("x", "a", 1000), true, "a new window");
  for (let i = 0; i < 30; i++) l.take("x", `c${i}`, 5);
  assert.ok(l.counts.size <= 11, "old counts are dropped");
  const w = world(), make = () => w.ask("POST", "/rooms", { game: "stones", version: "1", options: { seats: 2 }, roles: ["host", "friend"], mode: "turns" });
  for (let i = 0; i < 12; i++) assert.equal((await make()).status, 201);
  assert.equal((await make()).body.error, "slow");
  assert.equal((await w.ask("POST", "/rooms", {}, { from: "203.0.113.9" })).body.error, "game", "another address may still make rooms");
});

test("nothing personal is kept: no address, no seat key, no password, and a notice address only while it is wanted", async () => {
  const k = await noticeKeys(), w = world(k.env), r = await stonesRoom(w, { pass: "my secret" });
  await w.ask("POST", `/rooms/${r.code}/notice`, { sub: k.sub }, { token: r.keys[1] });
  const kept = await w.ask("POST", "/saves", { save: playScript(createMatch(stones, { seed: "s" })).save() });
  const dump = JSON.stringify([...w.env.ROOMS.holders.values(), ...w.env.KEEPS.holders.values()].map((h) => [...h.storage.map]));
  for (const never of [w.who, r.keys[0], r.keys[1], "my secret", await passDigest("my secret"), kept.body.code]) assert.ok(!dump.includes(never), `kept: ${never}`);
  assert.ok(dump.includes(k.sub.endpoint), "the notice address is kept while notices are on");
  await w.ask("POST", `/rooms/${r.code}/notice`, { sub: null }, { token: r.keys[1] });
  assert.ok(!JSON.stringify([...w.env.ROOMS.holders.get(r.code).storage.map]).includes(k.sub.endpoint));
});

test("a real game: Brass and Banners by turn, the host moving for a bot, checked move by move, and a woken room replays it", async () => {
  const w = world();
  const made = await w.ask("POST", "/rooms", { game: "banners", version: banners.version, options: { seats: 2 }, roles: ["host", "easy"], mode: "turns" });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const code = made.body.code, token = made.body.token, m = createMatch(banners, { seed: made.body.seed, options: made.body.options }), dice = chance(seedState("bots/room"));
  assert.equal((await w.ask("POST", `/rooms/${code}/move`, { n: 0, move: { do: "fly" } }, { token })).body.error, "illegal");
  let refusedOne = false;
  while (m.turn !== null && m.list.length < 400) {
    const mv = bannersBot(m.position, dice, "easy"), n = m.list.length;
    if (!refusedOne && mv.do === "attack") {
      const bad = { ...mv, from: mv.to, to: mv.from };
      if (!m.isLegal(bad)) { assert.equal((await w.ask("POST", `/rooms/${code}/move`, { n, move: bad }, { token })).body.error, "illegal"); refusedOne = true; }
    }
    now += 1000; // a second a move: the address limit is per minute
    const a = await w.ask("POST", `/rooms/${code}/move`, { n, move: mv }, { token });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    m.play(mv);
  }
  const store = w.env.ROOMS.holders.get(code).storage, head = await store.get("head");
  assert.equal(fingerprint([banners.id, banners.version, made.body.options, head.position, head.dice]), m.fingerprint(), "dice and all, the room's table is the core's match");
  const wake = async () => { w.env.ROOMS.holders.get(code).sleep(); const t0 = performance.now(), s = await w.ask("GET", `/rooms/${code}`, undefined, { token }); assert.equal(s.body.moves.length, m.list.length); assert.equal(s.body.turn, m.turn); return performance.now() - t0; };
  const quick = await wake();
  await store.delete("head");
  const slow = await wake();
  console.log(`# woke with ${m.list.length} moves of Brass and Banners: ${quick.toFixed(1)} ms from the kept table, ${slow.toFixed(1)} ms replaying every move`);
});

test("the pages' side: no worker address, nothing at all; with one, rooms, sockets and saves through the worker", async () => {
  assert.deepEqual(PLAY_ADDRESSES.map((a) => [a.name, a.address]), [["worker", ""]], "the placeholder names the worker with no address yet");
  assert.equal(workerAddress(), null);
  assert.equal(roomsAt(), null, "no address: the site stays fully static");
  for (const bad of ["http://rooms.example", "https://rooms.example/path", "javascript:alert(1)", "https://a b"]) assert.equal(workerAddress([{ name: "worker", address: bad }]), null, bad);
  for (const good of ["https://capo-rooms.studio.workers.dev", "http://localhost:8787"]) assert.equal(workerAddress([{ name: "worker", address: good }]), good);

  const w = world(), seatsOf = () => { const m = new Map(); return { get: (c) => m.get(c) || null, put: (c, r) => m.set(c, r), drop: (c) => m.delete(c), list: () => [...m.keys()] }; };
  const fetcher = (url, init) => worker.fetch(new Request(url, { ...init, headers: { ...init.headers, origin: SITE, "cf-connecting-ip": w.who } }), w.env);
  const Socket = browserSocket(worker, w.env, SITE);
  const host = roomsAt(BASE, { fetcher, Socket, seats: seatsOf() }), friend = roomsAt(BASE, { fetcher, Socket, seats: seatsOf() });
  assert.equal((await host.health()).wire, 1);
  const room = await host.create({ game: "stones", version: "1", options: { seats: 2 }, roles: ["host", "friend"], password: "tea" });
  assert.equal(room.token, undefined, "the seat's key stays in the browser's own store");
  assert.deepEqual(host.held(), [room.code]);
  await assert.rejects(friend.join(room.code, "coffee"), (e) => e instanceof Refusal && e.code === "password");
  await assert.rejects(friend.join("no"), (e) => e.code === "room");
  const mine = await friend.join(room.code.toLowerCase(), "tea");
  assert.equal(mine.seat, 1);
  await assert.rejects(roomsAt(BASE, { fetcher, seats: seatsOf() }).state(room.code), (e) => e.code === "seat");

  const heard = { host: [], friend: [] };
  const a = host.connect(room.code, { welcome: (m) => heard.host.push(m), signal: (m) => heard.host.push(m), moved: (m) => heard.host.push(m), here: (m) => heard.host.push(m) });
  const b = friend.connect(room.code, { welcome: (m) => heard.friend.push(m), signal: (m) => heard.friend.push(m), moved: (m) => heard.friend.push(m), constructor: 1 });
  await until(() => heard.host.length && heard.friend.length);
  await w.settle();
  assert.ok(b.signal(0, "offer", "an offer"));
  await w.settle();
  assert.deepEqual(heard.host.find((m) => m.t === "signal"), { t: "signal", from: 1, kind: "offer", data: "an offer" });
  const copy = createMatch(stones, { seed: room.seed, options: room.options }), mv = pick(copy), by = copy.turn === 0 ? host : friend;
  const done = await by.move(room.code, 0, mv);
  assert.equal(done.n, 1);
  await w.settle();
  assert.deepEqual(heard.friend.find((m) => m.t === "moved").move, mv);
  assert.equal((await friend.state(room.code)).moves.length, 1);
  assert.equal((await host.ice(room.code)).relay, "room");

  const save = await host.keepSave(playScript(createMatch(stones, { seed: "s" })).save());
  assert.match(save.code, SAVE);
  assert.equal((await friend.openSave(save.code.toLowerCase())).game, "stones", "a save code works in any browser");
  assert.equal((await host.dropSave(save.code)).dropped, true);

  const closed = [];
  const c = friend.connect(room.code, { closed: (e) => closed.push(e) });
  await w.settle();
  await host.end(room.code);
  await w.settle();
  await until(() => closed.length);
  assert.equal(closed[0].code, 4001);
  assert.deepEqual(host.held(), []);
  a.close();
  b.close();
  c.close();
  const down = roomsAt(BASE, { fetcher: async () => { throw new TypeError("network"); }, seats: seatsOf() });
  await assert.rejects(down.health(), (e) => e.code === "offline");
});

test("the worker's files follow the house rules, and nothing secret or account-bound is in its settings", () => {
  const dir = path.join(root, "server", "worker"), walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = [...walk(dir), path.join(root, "site", "rooms.js"), path.join(root, "site", "notice-sw.js"), path.join(root, "test", "fixtures", "workerd.js")];
  for (const f of files) {
    const text = readFileSync(f, "utf8"), name = path.relative(root, f);
    assert.ok(!text.includes("—"), `${name} has an em dash`);
    if (/\.m?js$/.test(f)) assert.ok(text.startsWith("// SPDX-License-Identifier: AGPL-3.0-or-later"), `${name} needs the licence mark`);
    if (/\.m?js$/.test(f)) assert.ok(!/\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML|\beval\s*\(/.test(text), `${name} writes markup or runs text`);
    if (/\.m?js$/.test(f) && f.startsWith(dir)) for (const m of text.matchAll(/from\s+"([^"]+)"/g)) assert.ok(m[1].startsWith("."), `${name} imports ${m[1]}: the worker has no dependencies`);
  }
  const toml = readFileSync(path.join(dir, "wrangler.toml"), "utf8");
  assert.ok(toml.startsWith("# SPDX-License-Identifier: AGPL-3.0-or-later"));
  assert.ok(!/^\s*account_id\s*=/m.test(toml), "no account id in the template");
  assert.ok(!/^\s*(VAPID_PUBLIC|VAPID_PRIVATE|TURN_KEY_ID|TURN_KEY_TOKEN)\s*=/m.test(toml), "secrets are never in the settings");
  assert.match(toml, /new_sqlite_classes = \["Room", "Keep"\]/, "free-plan Durable Objects keep their data in SQLite");
  assert.ok(existsSync(path.join(dir, "DEPLOY.md")));
});
