// SPDX-License-Identifier: AGPL-3.0-or-later
// The "your turn" notice by Web Push, with the browser's own crypto and no library.
// The worker signs who it is (VAPID, RFC 8292) and locks the few words of the notice so only that browser can read them
// (RFC 8291 with the aes128gcm coding of RFC 8188): the push service carries it and cannot read it.
import { from64, to64 } from "./wire.js";

const enc = new TextEncoder();
const join = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
const hkdf = async (ikm, salt, info, bits) => new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), bits));

/** The worker's signing key from its two secrets (the public point, 65 bytes, and the private number, 32 bytes, both base64url). */
async function signer(env) {
  const pub = from64(env.VAPID_PUBLIC);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID_PUBLIC is not a P-256 public key");
  const jwk = { kty: "EC", crv: "P-256", x: to64(pub.subarray(1, 33)), y: to64(pub.subarray(33)), d: env.VAPID_PRIVATE, ext: true };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/** The signed note that says which site sends the notice: good for twelve hours, for one push service. */
export async function vapid(env, endpoint, now) {
  const head = to64(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = to64(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await signer(env), enc.encode(`${head}.${claims}`)));
  return `vapid t=${head}.${claims}.${to64(sig)}, k=${env.VAPID_PUBLIC}`;
}

/** Lock a short text for one subscription. Returns the body to post, in one record. */
export async function lock(sub, text) {
  const ua = from64(sub.p256dh), auth = from64(sub.auth);
  const mine = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", mine.publicKey));
  const theirs = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: theirs }, mine.privateKey, 256));
  const ikm = await hkdf(shared, auth, join(enc.encode("WebPush: info\0"), ua, asPublic), 256);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, enc.encode("Content-Encoding: aes128gcm\0"), 128), nonce = await hkdf(ikm, salt, enc.encode("Content-Encoding: nonce\0"), 96);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const shut = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, join(enc.encode(text), [2]))); // 2: the last record, no padding
  return join(salt, [0, 0, 16, 0], [65], asPublic, shut); // record size 4096, key id = our public point
}

/** Send one notice. Returns "sent", "gone" (the browser withdrew it: forget it) or "failed". */
export async function notify(env, sub, note, now) {
  if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE || !env.VAPID_SUBJECT) return "failed";
  try {
    const r = await fetch(sub.endpoint, {
      method: "POST",
      headers: { authorization: await vapid(env, sub.endpoint, now), ttl: "86400", urgency: "normal", "content-encoding": "aes128gcm", "content-type": "application/octet-stream" },
      body: await lock(sub, JSON.stringify(note)),
    });
    return r.status === 404 || r.status === 410 ? "gone" : r.ok ? "sent" : "failed";
  } catch { return "failed"; }
}
