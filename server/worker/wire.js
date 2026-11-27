// SPDX-License-Identifier: AGPL-3.0-or-later
// What the worker and the pages agree on: limits, keeping times, codes, and the checks every message passes.
// Plain modules only. Nothing here keeps an internet address, a name or anything else about a person.

export const WIRE = 1; // the version of this message format; site/rooms.js sends and checks the same number
const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

/** How long things are kept after their last use (ruling 155; options.md decision 11). Published in the privacy note. */
export const KEEP = { live: DAY, turns: 90 * DAY, ended: 7 * DAY, save: 365 * DAY };
/** The largest of everything, in characters or counts. Anything bigger is refused before it is read further. */
export const MOST = { body: 70000, socket: 16000, signal: 12000, move: 4000, save: 64000, endpoint: 800, sockets: 3, fails: 10 };
export const RATES = { any: [240, MINUTE], room: [12, HOUR], join: [40, HOUR], save: [60, HOUR], ice: [30, HOUR] }; // per address, per window
export const SOCKET_RATE = [100, 10000]; // messages a socket may send in that many ms
export const ROLES = ["host", "friend", "normal", "easy", "hard"]; // as in link play (src/core/link.js)
export const BOTS = new Set(["normal", "easy", "hard"]);
export const MODES = ["live", "turns"]; // live: signalling, presence and a relay; turns: a mailbox with a notice
export const SIGNALS = ["offer", "answer", "ice", "bye"];

/** The clock. Tests move it; nothing else does. */
export const clock = { now: () => Date.now() };

// Room codes: six letters with no vowels and no 0, 1, O or I, so a code is never a word and never misread.
export const LETTERS = "23456789BCDFGHJKLMNPQRSTVWXZ";
export const ROOM = /^[2-9BCDFGHJKLMNPQRSTVWXZ]{6}$/;
export const SAVE = /^[2-9BCDFGHJKLMNPQRSTVWXZ]{5}(?:-[2-9BCDFGHJKLMNPQRSTVWXZ]{5}){3}$/; // four groups of five: about 96 bits
export const TOKEN = /^[\w-]{24}$/;
export const HEX = /^[0-9a-f]{64}$/;

/** n letters from LETTERS, each equally likely (bytes past the last whole round are thrown back). */
export function letters(n) {
  let out = "";
  const top = 256 - (256 % LETTERS.length);
  while (out.length < n) for (const b of crypto.getRandomValues(new Uint8Array(n * 2))) if (b < top && out.length < n) out += LETTERS[b % LETTERS.length];
  return out;
}
export const roomCode = () => letters(6);
export const saveCode = () => letters(20).match(/.{5}/g).join("-");

export const to64 = (b) => btoa(Array.from(b, (x) => String.fromCharCode(x)).join("")).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
export const from64 = (t) => Uint8Array.from(atob(t.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
/** A secret for one seat: 18 random bytes. Only its digest is kept. */
export const secret = () => to64(crypto.getRandomValues(new Uint8Array(18)));
export async function digest(text) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(d, (x) => x.toString(16).padStart(2, "0")).join("");
}
/** Equal text, compared in the same time whatever the answer. */
export function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** A refusal the pages can read: { error, message } with an HTTP status. */
export class No extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const answer = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
export const refuse = (e) => answer(e.status || 400, { error: e.code || "bad", message: String(e.message).slice(0, 300) });

/** A plain object read from text of a known greatest length, or a refusal. */
export function parse(text, most) {
  if (typeof text !== "string" || text.length > most) throw new No(413, "size", "that message is too large");
  let v;
  try { v = JSON.parse(text); } catch { throw new No(400, "shape", "that message is not JSON"); }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new No(400, "shape", "that message is not an object");
  return v;
}
export async function body(request, most = MOST.body) {
  const n = Number(request.headers.get("content-length") || 0);
  if (n > most) throw new No(413, "size", "that message is too large");
  return parse(await request.text(), most);
}
/** The seat's secret, sent as "Authorization: Seat <token>" (never in an address). */
export function tokenOf(request) {
  const m = (request.headers.get("authorization") || "").match(/^Seat ([\w-]{24})$/);
  if (!m) throw new No(401, "seat", "this needs your seat's key");
  return m[1];
}
export const whole = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;

// Push services a "your turn" notice may be sent to. The worker never fetches any other address a page gives it.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[\w-]+\.notify\.windows\.com$/, /^web\.push\.apple\.com$/, /^[\w.-]+\.push\.apple\.com$/];
/** A push subscription as the browser gives it, reduced to what the notice needs, or a refusal. */
export function readSubscription(s) {
  const bad = () => new No(400, "notice", "that is not a push subscription this worker can use");
  if (!s || typeof s !== "object" || typeof s.endpoint !== "string" || s.endpoint.length > MOST.endpoint) throw bad();
  let url;
  try { url = new URL(s.endpoint); } catch { throw bad(); }
  if (url.protocol !== "https:" || url.port || url.username || url.password || !PUSH_HOSTS.some((h) => h.test(url.hostname))) throw bad();
  const k = s.keys || {};
  if (typeof k.p256dh !== "string" || !/^[\w-]{86,88}$/.test(k.p256dh) || typeof k.auth !== "string" || !/^[\w-]{22,24}$/.test(k.auth)) throw bad();
  return { endpoint: url.href, p256dh: k.p256dh.replaceAll("=", ""), auth: k.auth.replaceAll("=", "") };
}
