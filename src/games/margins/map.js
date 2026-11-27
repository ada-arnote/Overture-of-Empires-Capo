// SPDX-License-Identifier: AGPL-3.0-or-later
// The land of Margins of Trust: rings of provinces round an inner sea, one equal share (a march) for each seat.
// Every march has the same shape, turned about the sea, so each seat has two neighbours and nobody sits in a corner.
// A province is a ring and a span of the circle, counted in whole steps: U steps make the circle, 6 a march.
//   ring 0, the shore: three ports a march.   ring 1, the midlands: three.   ring 2, the uplands: two.
// One fixed map for each number of seats. No chance, no clock: the same seats always give the same land.

export const RINGS = 3;
const PLAN = [[0, 0, 2], [0, 2, 4], [0, 4, 6], [1, 1, 3], [1, 3, 5], [1, 5, 7], [2, 2, 5], [2, 5, 8]]; // [ring, from, to] within a march
export const HOME = 4, START = [[4, 3], [1, 1], [6, 1]]; // [place in the march, strength]: the home in the midlands, a port and an upland beside it
const NAMES = ["Ambergate", "Ashcombe", "Brackwater", "Bramblehithe", "Caddon", "Carrowmere", "Cindersand", "Copperleigh", "Dunholt", "Elmsford", "Fennick", "Gallowmere", "Glimmerstead", "Hallowfen", "Hartsend", "Hollin", "Inkwell", "Juniper Cross", "Kettleby", "Lammas Reach", "Lowmarket", "Marrowby", "Merriwick", "Nettlecombe", "Oakhithe", "Pennyrigg", "Quillmoor", "Rookhollow", "Rushmere", "Saltcote", "Sealbrook", "Sorrelby", "Tallyford", "Thistlewade", "Tollmouth", "Vellum Heath", "Waxholme", "Whistlecombe", "Wrenfold", "Yarnmouth"];
const LANDS = ["the Ink Coast", "the Wax Downs", "the Quill Marches", "the Vellum Fells", "the Ribbon Shore"];
export const SEA = "the Still Water";
const made = new Map();

/** Do two spans of the circle share some length? Spans may run past U; the circle wraps. */
function overlap(a0, a1, b0, b1, U) {
  for (const k of [-U, 0, U]) if (Math.min(a1, b1 + k) - Math.max(a0, b0 + k) > 0) return true;
  return false;
}

/** The map for a number of seats: { n, U, ring, from, to, near, port, land, names, lands, homes, starts, ports }. */
export function mapOf(seats) {
  if (made.has(seats)) return made.get(seats);
  const U = 6 * seats, ring = [], from = [], to = [], land = [];
  for (let s = 0; s < seats; s++) for (const [r, a, b] of PLAN) { ring.push(r); from.push(6 * s + a); to.push(6 * s + b); land.push(s); }
  const n = ring.length, near = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    const touch = ring[i] === ring[j] ? (to[i] - from[j]) % U === 0 || (to[j] - from[i]) % U === 0 : Math.abs(ring[i] - ring[j]) === 1 && overlap(from[i], to[i], from[j], to[j], U);
    if (touch) near[i].push(j);
  }
  const port = ring.map((r) => r === 0), names = Array.from({ length: n }, (_, i) => NAMES[(i * 17) % NAMES.length]);
  const homes = Array.from({ length: seats }, (_, s) => 8 * s + HOME), starts = Array.from({ length: seats }, (_, s) => START.map(([k, str]) => [8 * s + k, str]));
  const map = Object.freeze({ n, U, ring, from, to, near, port, land, names, lands: LANDS.slice(0, seats), homes, starts, ports: port.filter(Boolean).length });
  made.set(seats, map);
  return map;
}

/** Ports that are not side by side by land: a move between them goes by sea and needs a transport. */
export const bySea = (map, a, b) => a !== b && map.port[a] && map.port[b] && !map.near[a].includes(b);
