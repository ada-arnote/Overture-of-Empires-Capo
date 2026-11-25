// SPDX-License-Identifier: AGPL-3.0-or-later
// Seeded chance, in whole numbers only. The state is four numbers kept beside the position,
// so a replay rolls the same dice.
import { sha256 } from "./digest.js";

export function seedState(seed) {
  const hex = sha256(new TextEncoder().encode("capo/" + String(seed)));
  return [0, 1, 2, 3].map((i) => parseInt(hex.slice(i * 8, i * 8 + 8), 16));
}

/** The small fast counter generator (sfc32). Returns [number from 0 to 2^32 - 1, next state]. */
export function next([a, b, c, d]) {
  const t = (((a + b) | 0) + d) | 0;
  return [t >>> 0, [(b ^ (b >>> 9)) >>> 0, (c + (c << 3)) >>> 0, ((((c << 21) | (c >>> 11)) + t) | 0) >>> 0, (d + 1) >>> 0]];
}

/** A chance source for one move. Every draw is fair: no remainder bias. */
export function chance(state) {
  let now = state;
  const below = (n) => {
    if (!Number.isInteger(n) || n < 1 || n > 0x100000000) throw new RangeError("below() needs a whole number from 1 to 2^32");
    const limit = 0x100000000 - (0x100000000 % n);
    for (;;) {
      const [v, s] = next(now);
      now = s;
      if (v < limit) return v % n;
    }
  };
  return {
    below,
    die: (sides = 6) => below(sides) + 1,
    pick: (list) => list[below(list.length)],
    shuffle(list) {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = below(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    get state() { return now; },
  };
}
