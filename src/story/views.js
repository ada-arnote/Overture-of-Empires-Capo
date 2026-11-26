// SPDX-License-Identifier: AGPL-3.0-or-later
// What the map views show, read from what the rules keep: no drawing here, so any map (flat or 3D) can paint it.
// Each gives, for a province or a country, a short word the page turns into a colour and a legend line.
//   fronts: the provinces on both sides of every front (land or narrow sea between two countries at war).
//   changed: land held by another country than the one that held it when the game began.
//   claims: land in dispute, by who claims it.
//   spheres: each country by the patron it stands under (pacts.js).
//   known: each country by how well the player's side knows it (fog.js).
import { knowledge } from "./fog.js";
import { sphereOf } from "./pacts.js";

const foes = (g, c) => g.wars.filter((w) => w.pair.split("|").includes(c)).map((w) => w.pair.split("|").find((x) => x !== c));

/** Provinces on a front: Map(id -> "yours" | "foe" | "other"). */
export function fronts(g, geo) {
  const out = new Map(), me = g.player, at = new Set(g.wars.flatMap((w) => w.pair.split("|")));
  if (!at.size) return out;
  for (const id of geo.all || []) {
    const o = geo.owner(id);
    if (!at.has(o)) continue;
    const enemies = foes(g, o);
    if ([...geo.neighbours(id), ...(geo.across?.(id) || [])].some((n) => enemies.includes(geo.owner(n)))) out.set(id, o === me ? "yours" : enemies.includes(me) ? "foe" : "other");
  }
  return out;
}

/** Land that has changed hands since the game began: Map(id -> "won" | "lost" | "other"). */
export function changed(g, geo) {
  const out = new Map(), me = g.player;
  for (const [id, now] of Object.entries(g.owners || {})) {
    const was = g.start?.[id] || geo.place(id)?.country;
    if (was && was !== now) out.set(id, now === me ? "won" : was === me ? "lost" : "other");
  }
  // a province taken and then won back by the country the map gives it to is no longer in g.owners, so nothing shows
  for (const [id, was] of Object.entries(g.start || {})) if (!g.owners?.[id] && geo.place(id) && geo.owner(id) !== was) out.set(id, geo.owner(id) === me ? "won" : was === me ? "lost" : "other");
  return out;
}

/** Land in dispute: Map(id -> "yours" (you claim it) | "onyou" (claimed from you) | "other"). */
export function claims(g, geo) {
  const out = new Map(), me = g.player;
  for (const [id, who] of geo.claimed?.() || []) { const k = who === me ? "yours" : geo.owner(id) === me ? "onyou" : "other"; if (out.get(id) !== "yours" && out.get(id) !== "onyou") out.set(id, k); else if (k === "yours") out.set(id, k); }
  return out;
}

/** A country on the spheres view: {patron, role: "patron" | "member" | ""}. patrons: the set of countries that have a sphere. */
export const sphereView = (g, geo, c, patrons) => { const p = sphereOf(g, geo, c); return p ? { patron: p, role: "member" } : patrons.has(c) ? { patron: c, role: "patron" } : { patron: "", role: "" }; };

/** A country on the knowledge view: its tier, 0 to 3. */
export const knownView = (g, c, near) => knowledge(g, c, near).tier;
