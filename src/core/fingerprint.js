// SPDX-License-Identifier: AGPL-3.0-or-later
// SHA-256, written out so that it also works on a page without https.
import { canon } from "./canon.js";

const K = new Uint32Array(64);
const START = new Uint32Array(8);
{
  // The standard's constants: the first 32 bits of the fractions of square and cube roots of primes.
  // Found with whole-number roots, so no machine's rounding can matter.
  const root = (n, k) => {
    const target = BigInt(n) << BigInt(32 * k);
    let lo = 0n, hi = 1n << 40n;
    while (lo < hi) {
      const mid = (lo + hi + 1n) >> 1n;
      if (mid ** BigInt(k) <= target) lo = mid; else hi = mid - 1n;
    }
    return Number(lo & 0xffffffffn);
  };
  let found = 0;
  for (let n = 2; found < 64; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
    if (!prime) continue;
    if (found < 8) START[found] = root(n, 2);
    K[found++] = root(n, 3);
  }
}

const turn = (x, n) => (x >>> n) | (x << (32 - n));

/** The SHA-256 of some bytes, as 64 hex digits. */
export function sha256(bytes) {
  const blocks = ((bytes.length + 8) >> 6) + 1;
  const data = new Uint8Array(blocks * 64), view = new DataView(data.buffer);
  data.set(bytes);
  data[bytes.length] = 0x80;
  view.setUint32(data.length - 8, Math.floor(bytes.length / 0x20000000));
  view.setUint32(data.length - 4, (bytes.length << 3) >>> 0);
  const h = Uint32Array.from(START), w = new Uint32Array(64);
  for (let at = 0; at < data.length; at += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(at + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      w[i] = (w[i - 16] + w[i - 7] + (turn(a, 7) ^ turn(a, 18) ^ (a >>> 3)) + (turn(b, 17) ^ turn(b, 19) ^ (b >>> 10))) | 0;
    }
    let [a, b, c, d, e, f, g, x] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (x + (turn(e, 6) ^ turn(e, 11) ^ turn(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((turn(a, 2) ^ turn(a, 13) ^ turn(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      x = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += x;
  }
  return Array.from(h, (n) => n.toString(16).padStart(8, "0")).join("");
}

/** A short code for any value: the same value gives the same code on every machine. */
export const fingerprint = (value) => sha256(new TextEncoder().encode(canon(value))).slice(0, 16);
