// SPDX-License-Identifier: AGPL-3.0-or-later
// The same work for Node and for each browser. The answers must be identical everywhere.
import { canon, chance, createMatch, fingerprint, openSave, seedState, sha256 } from "../../src/core/index.js";
import { playScript, stones } from "./stones.js";

export function probe() {
  const out = {};
  out.empty = sha256(new Uint8Array(0));
  out.abc = sha256(new TextEncoder().encode("abc"));
  out.long = sha256(new TextEncoder().encode("x".repeat(100003)));
  out.words = fingerprint({ z: "Arica y Parinacota", ä: "Potosí", A: ["日本", "🎲", ""], a: [-5, 0, -0, 9007199254740991] });
  out.keys = canon({ b: 1, a: 2, B: 3, "10": 4, "9": 5, é: 6, "": 7 });
  const d = chance(seedState("probe"));
  out.draws = fingerprint(Array.from({ length: 5000 }, (_, i) => d.below((i % 97) + 1)));
  out.shuffle = fingerprint(d.shuffle(Array.from({ length: 500 }, (_, i) => i)));
  const ends = [];
  for (let s = 0; s < 60; s++) {
    const m = playScript(createMatch(stones, { seed: "probe " + s, options: { seats: 2 + (s % 3) } }));
    const again = openSave(m.save(), [stones]).match;
    if (again.fingerprint() !== m.fingerprint()) throw new Error("a replay differed");
    ends.push(m.fingerprint());
  }
  out.games = fingerprint(ends);
  out.all = fingerprint(out);
  return out;
}
