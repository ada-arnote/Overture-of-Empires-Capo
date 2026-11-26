// SPDX-License-Identifier: AGPL-3.0-or-later
// The dice of Brass and Banners: how a throw is settled, and the exact chance of winning, in whole numbers.

/** a and d: the most dice each side throws. tie: who loses when the dice are equal, "both" or "attacker". */
export const DICE = {
  standard: { a: 3, d: 2, tie: "attacker" }, // the genre's own: up to 3 against up to 2, ties to the defender
  guard: { a: 4, d: 3, tie: "attacker" },
  even: { a: 4, d: 3, tie: "both" },
  open: { a: 3, d: 3, tie: "both" },
  heavy: { a: 5, d: 3, tie: "attacker" },
};

/** Highest against highest; the lower one loses. `up` and `down` are added to each side's best die. Returns [attacker loses, defender loses]. */
export function meet(A, D, { tie = "both", up = 0, down = 0 } = {}) {
  const x = [...A].sort((m, n) => n - m), y = [...D].sort((m, n) => n - m);
  x[0] += up;
  y[0] += down;
  let a = 0, d = 0;
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] > y[i]) d++;
    else if (x[i] < y[i]) a++;
    else { a++; if (tie === "both") d++; }
  }
  return [a, d];
}

const hands = new Map();
/** Every throw of n dice, in order, and how many ways it can come up. */
function throws(n) {
  if (hands.has(n)) return hands.get(n);
  const out = [], fact = [1, 1, 2, 6, 24, 120, 720];
  const go = (list, top) => {
    if (list.length === n) {
      const count = Array(7).fill(0);
      for (const v of list) count[v]++;
      out.push([list, count.reduce((w, c) => w / fact[c], fact[n])]);
      return;
    }
    for (let v = top; v >= 1; v--) go([...list, v], v);
  };
  go([], 6);
  hands.set(n, out);
  return out;
}

const tables = new Map();
/** How often each result comes up when a dice meet d dice: [attacker loses, defender loses, ways]. */
function results(a, d, how) {
  const k = `${a}/${d}/${how.tie}/${how.up}/${how.down}`;
  if (tables.has(k)) return tables.get(k);
  const ways = new Map();
  for (const [A, x] of throws(a)) for (const [D, y] of throws(d)) { const [p, q] = meet(A, D, how), v = p * 10 + q; ways.set(v, (ways.get(v) || 0) + x * y); }
  const out = [...ways].map(([v, n]) => [Math.floor(v / 10), v % 10, n]);
  tables.set(k, out);
  return out;
}

const chances = new Map(), MILLION = 1000000;
/** The chance, in millionths, that `att` strength able to attack takes a place held by `def`, rolling until it is settled. */
export function odds(att, def, how) {
  if (att <= 0) return 0;
  if (def <= 0) return MILLION;
  const a = Math.min(att, 60), d = Math.min(def, 60), k = `${a}/${d}/${how.a}/${how.d}/${how.tie}/${how.up}/${how.down}`;
  if (chances.has(k)) return chances.get(k);
  let sum = 0, all = 0;
  for (const [x, y, w] of results(Math.min(a, how.a), Math.min(d, how.d), how)) { sum += w * odds(a - x, d - y, how); all += w; }
  const v = Math.floor(sum / all);
  if (chances.size > 60000) chances.clear();
  chances.set(k, v);
  return v;
}
