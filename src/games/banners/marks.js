// SPDX-License-Identifier: AGPL-3.0-or-later
// A campaign's marks as Brass and Banners' setup reads them (the campaign itself: ./legacy.js and src/core/campaign.js).
// Marks are one open option, `marks`, given only to a campaign's games, so they travel in saves and links like any option
// and are part of the game's own fingerprint. They change the start only: names, forts and a seat's extra strength.

const whole = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const list = (v, most, each) => Array.isArray(v) && v.length <= most && v.every(each);
const KEYS = "bonus,campaign,forts,game,names";

/** Is this a campaign's marks, in the one shape the setup reads? null is an ordinary game. */
export function checkMarks(m) {
  if (m === null) return true;
  if (!m || typeof m !== "object" || Array.isArray(m) || Object.keys(m).sort().join() !== KEYS) return false;
  return typeof m.campaign === "string" && m.campaign.length >= 1 && m.campaign.length <= 24 && whole(m.game, 1, 99)
    && list(m.names, 64, (x) => Array.isArray(x) && x.length === 2 && whole(x[0], 0, 9999) && typeof x[1] === "string" && x[1].length >= 1 && x[1].length <= 40)
    && list(m.forts, 64, (x) => whole(x, 0, 9999))
    && list(m.bonus, 6, (x) => whole(x, 0, 20));
}

/**
 * Put a campaign's marks on a first position. Changes p. `at`: each seat's starting province, when the start gives one;
 * otherwise a seat's extra strength goes into what it sets out at the start.
 * Names are words only: the rules never read them (nameOf shows them).
 */
export function applyMarks(p, m, at = null) {
  if (!m) return;
  const n = p.owner.length;
  p.called = Object.fromEntries(m.names.filter(([i]) => i < n));
  if (p.forts) for (const i of m.forts) if (i < n) p.forts[i] = 1;
  m.bonus.forEach((k, s) => {
    if (!k || s >= p.seats) return;
    if (at) p.str[at[s]] += k; else p.reserve[s] += k;
  });
}
