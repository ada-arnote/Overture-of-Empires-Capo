// SPDX-License-Identifier: AGPL-3.0-or-later
// Makes the pair of keys the worker signs its "your turn" notices with (VAPID). Run once, on your own computer:
//   node server/worker/tools/keys.mjs
// It prints two values. Give each to `npx wrangler secret put` and keep no other copy: they are never written to a file.
// A new pair later only means every player has to turn notices on again.
const to64 = (b) => Buffer.from(b).toString("base64url");
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)), jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
console.log("VAPID_PUBLIC  (npx wrangler secret put VAPID_PUBLIC, then paste):");
console.log(to64(pub));
console.log("VAPID_PRIVATE (npx wrangler secret put VAPID_PRIVATE, then paste):");
console.log(jwk.d);
