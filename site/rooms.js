// SPDX-License-Identifier: AGPL-3.0-or-later
// Rooms on the small worker (ruling 155; server/worker/): a short room code in place of pasted links, who is at the
// table, signals for a direct connection and the room as relay when none opens, play by turn with a "your turn" notice,
// and saves kept under a secret code.
// Nothing here runs unless site/config.js names a worker address: with none, roomsAt() is null, nothing is contacted and
// the site stays fully static. A page that uses it also lists that address in its own rule (connect-src), by the gate.
// The worker checks every move by the same rules; a refusal comes back as a Refusal with the worker's code and words.
import { Refusal } from "../src/core/index.js";
import { PLAY_ADDRESSES } from "./config.js";

export const WIRE = 1; // as server/worker/wire.js
export const ROOM = /^[2-9BCDFGHJKLMNPQRSTVWXZ]{6}$/;
export const SAVE = /^[2-9BCDFGHJKLMNPQRSTVWXZ]{5}(?:-[2-9BCDFGHJKLMNPQRSTVWXZ]{5}){3}$/;
const PLACE = "capo-room-", offline = () => new Refusal("offline", "the rooms cannot be reached just now: play by link instead");

/** The worker's address from the named list, or null. Only a secure address, or this computer while trying it out. */
export function workerAddress(list = PLAY_ADDRESSES) {
  const a = (Array.isArray(list) ? list : []).find((x) => x && x.name === "worker")?.address || "";
  return /^https:\/\/[\w.-]+(?::\d+)?$/.test(a) || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(a) ? a : null;
}

/** The seats this browser holds, by room code: { seat, token, game, when }. The token is the seat's only key. */
export const localSeats = {
  get(code) { try { return JSON.parse(localStorage.getItem(PLACE + code) || "null"); } catch { return null; } },
  put(code, r) { try { localStorage.setItem(PLACE + code, JSON.stringify(r)); } catch { /* the seat lasts as long as the page */ } },
  drop(code) { try { localStorage.removeItem(PLACE + code); } catch { /* nothing to remove */ } },
  list() { try { return Object.keys(localStorage).filter((k) => k.startsWith(PLACE)).map((k) => k.slice(PLACE.length)); } catch { return []; } },
};

/** A password is never sent: only a digest of it, which the room digests again with its code. */
export async function passDigest(password) {
  if (!password) return "";
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`capo room|${String(password).normalize("NFC")}`)));
  return Array.from(d, (x) => x.toString(16).padStart(2, "0")).join("");
}
const from64 = (t) => Uint8Array.from(atob(t.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
const codeOf = (code) => {
  const c = String(code || "").trim().toUpperCase();
  if (!ROOM.test(c)) throw new Refusal("room", "a room code is six letters and numbers");
  return c;
};

/** The rooms at one worker, or null when there is no worker. fetcher, Socket and seats are the page's own unless a test gives others. */
export function roomsAt(base = workerAddress(), { fetcher = globalThis.fetch?.bind(globalThis), Socket = globalThis.WebSocket, seats = localSeats } = {}) {
  if (!base || !fetcher) return null;
  async function call(method, path, payload, token) {
    const headers = {};
    if (payload !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Seat ${token}`;
    let r, j = null;
    try { r = await fetcher(base + path, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) }); } catch { throw offline(); }
    try { j = await r.json(); } catch { /* not JSON: refused below */ }
    if (!r.ok || !j) throw j && typeof j.error === "string" ? new Refusal(j.error, String(j.message || j.error)) : offline();
    return j;
  }
  const keep = (r) => { seats.put(r.code, { seat: r.seat, token: r.token, game: r.game, when: Date.now() }); const { token, ...rest } = r; return rest; };
  const tokenFor = (code) => {
    const k = seats.get(code);
    if (!k || typeof k.token !== "string") throw new Refusal("seat", "this browser holds no seat in that room");
    return k.token;
  };

  return {
    base,
    health: () => call("GET", "/health"),
    /** roles: for each seat "host" (exactly one, you), "friend" (someone who joins by code) or a bot ("normal", "easy", "hard"). */
    async create({ game, version, options = {}, roles, mode = "turns", password = "" }) {
      return keep(await call("POST", "/rooms", { game, version, options, roles, mode, pass: await passDigest(password) }));
    },
    async join(code, password = "") { return keep(await call("POST", `/rooms/${codeOf(code)}/join`, { pass: await passDigest(password) })); },
    async state(code) { const c = codeOf(code); return call("GET", `/rooms/${c}`, undefined, tokenFor(c)); },
    /** n: the move's place in the list (the number of moves before it). */
    async move(code, n, move) { const c = codeOf(code); return call("POST", `/rooms/${c}/move`, { n, move }, tokenFor(c)); },
    async ice(code) { const c = codeOf(code); return call("POST", `/rooms/${c}/ice`, {}, tokenFor(c)); },
    async end(code) { const c = codeOf(code), r = await call("POST", `/rooms/${c}/end`, {}, tokenFor(c)); seats.drop(c); return r; },
    held: () => seats.list(),
    forget: (code) => seats.drop(codeOf(code)),

    /** Ask to be told when it is this seat's turn (on) or stop (off). worker: the address of site/notice-sw.js from this page. */
    async notice(code, on, worker = "../site/notice-sw.js") {
      const c = codeOf(code), token = tokenFor(c);
      if (!on) return call("POST", `/rooms/${c}/notice`, { sub: null }, token);
      const nav = globalThis.navigator;
      if (!nav?.serviceWorker || !globalThis.PushManager || !globalThis.Notification) throw new Refusal("notice", "this browser cannot show notices");
      if ((await Notification.requestPermission()) !== "granted") throw new Refusal("notice", "notices were not allowed");
      const { key } = await call("GET", "/notice-key");
      if (!key) throw new Refusal("notice", "these rooms send no notices");
      const reg = await nav.serviceWorker.register(worker), sw = reg.installing || reg.waiting || reg.active;
      if (sw && sw.state !== "activated") await new Promise((ok) => sw.addEventListener("statechange", () => sw.state === "activated" && ok()));
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: from64(key) }));
      return call("POST", `/rooms/${c}/notice`, { sub: sub.toJSON() }, token);
    },

    /**
     * Sit at the table live. on: { welcome, here, seats, signal, moved, refused, away, closed }, each given the room's message.
     * Returns { signal(to, kind, data), move(n, move), close() }. A dropped socket comes back by itself, waiting longer each time.
     */
    connect(code, on = {}) {
      const c = codeOf(code), token = tokenFor(c), url = `${base.replace(/^http/, "ws")}/rooms/${c}/socket`;
      let ws = null, shut = false, wait = 1000, timer = 0;
      const tell = (t, m) => { if (Object.hasOwn(on, t) && typeof on[t] === "function") on[t](m); };
      const send = (m) => { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; } return false; };
      const open = () => {
        ws = new Socket(url);
        ws.onopen = () => { wait = 1000; ws.send(JSON.stringify({ t: "hello", wire: WIRE, token })); };
        ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m && typeof m.t === "string") tell(m.t, m); };
        ws.onclose = (e) => {
          if (shut) return;
          if ((e.code >= 4000 && e.code < 4100) || e.code === 1008) { shut = true; tell("closed", { code: e.code, reason: e.reason }); return; } // the room said no: do not knock again
          tell("away", { wait });
          timer = setTimeout(open, wait);
          wait = Math.min(wait * 2, 30000);
        };
      };
      open();
      const ping = setInterval(() => send({ t: "ping" }), 30000); // answered by the platform, without waking the room
      return {
        signal: (to, kind, data) => send({ t: "signal", to, kind, data }),
        move: (n, move) => send({ t: "move", n, move }),
        close() { shut = true; clearTimeout(timer); clearInterval(ping); try { ws?.close(1000, "bye"); } catch { /* already closed */ } },
      };
    },

    /** Keep a save (the text of a saved game) under a new secret code, or under the code given. Returns { code, game }. */
    keepSave: (save, code) => call("POST", "/saves", code ? { save, code } : { save }),
    openSave: (code) => call("POST", "/saves/open", { code: String(code || "").trim().toUpperCase() }),
    dropSave: (code) => call("POST", "/saves/drop", { code: String(code || "").trim().toUpperCase() }),
  };
}
