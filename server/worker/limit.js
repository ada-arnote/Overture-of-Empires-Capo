// SPDX-License-Identifier: AGPL-3.0-or-later
// How often one address may ask. Counts live in memory only, in each copy of the worker, and are never written down:
// an address is personal data, so it is used for this count and forgotten. It is a first fence, not a wall; the
// optional rate limit binding (wrangler.toml) and the free plan's own daily limit stand behind it.
import { RATES } from "./wire.js";

export class Limiter {
  constructor(rates = RATES, most = 20000) {
    this.rates = rates;
    this.most = most;
    this.counts = new Map();
  }
  /** true if this address may do one more of this kind now. */
  take(kind, who, now) {
    const [n, window] = this.rates[kind], k = `${kind} ${who}`, c = this.counts.get(k);
    if (!c || now - c.since >= window) {
      this.counts.delete(k);
      this.counts.set(k, { n: 1, since: now });
      if (this.counts.size > this.most) for (const old of [...this.counts.keys()].slice(0, this.most / 10)) this.counts.delete(old); // the oldest go first
      return true;
    }
    c.n++;
    return c.n <= n;
  }
}
