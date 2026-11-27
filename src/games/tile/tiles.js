// SPDX-License-Identifier: AGPL-3.0-or-later
// The tiles of Hedge and Highway (working name): our own kinds and our own mix, as plain data.
// A tile's edges go clockwise from the top: 0 north, 1 east, 2 south, 3 west. Each edge has three ports, clockwise:
// 3e, 3e + 1 (the middle) and 3e + 2. A town takes all three ports of an edge; a lane takes the middle, with meadow
// either side. Meadow halves, clockwise from the top left: 0 north-west, 1 north-east, 2 east-north, 3 east-south,
// 4 south-east, 5 south-west, 6 west-south, 7 west-north.
// Towns come first on a tile, then lanes, then meadows, then a well: a feature is known by its place in that list.

export const MEADOW = 0, LANE = 1, TOWN = 2;

/** [name, how many in the full mix of 76, what is on it]. A lane listed with one edge ends in the middle of the tile:
 *  at a well, at a town's gate (gate: the town it runs into), or where lanes meet. market: the town holds a market. */
const RAW = [
  ["Well in a meadow", 5, { well: 1, meadow: [[0, 1, 2, 3, 4, 5, 6, 7]] }],
  ["Lane to a well", 2, { well: 1, lane: [[2]], meadow: [[0, 1, 2, 3, 4, 5, 6, 7]] }],
  ["Straight lane", 9, { lane: [[0, 2]], meadow: [[1, 2, 3, 4], [5, 6, 7, 0]] }],
  ["Bending lane", 10, { lane: [[2, 3]], meadow: [[5, 6], [7, 0, 1, 2, 3, 4]] }],
  ["Three lanes meet", 5, { lane: [[1], [2], [3]], meadow: [[7, 0, 1, 2], [3, 4], [5, 6]] }],
  ["Four lanes meet", 1, { lane: [[0], [1], [2], [3]], meadow: [[1, 2], [3, 4], [5, 6], [7, 0]] }],
  ["Town edge", 6, { town: [[0]], meadow: [[2, 3, 4, 5, 6, 7]] }],
  ["Town edge and lane", 4, { town: [[0]], lane: [[1, 3]], meadow: [[2, 7], [3, 4, 5, 6]] }],
  ["Town edge, lane bending east", 3, { town: [[0]], lane: [[1, 2]], meadow: [[3, 4], [2, 5, 6, 7]] }],
  ["Town edge, lane bending west", 3, { town: [[0]], lane: [[2, 3]], meadow: [[5, 6], [2, 3, 4, 7]] }],
  ["Town gate", 2, { town: [[0]], lane: [[2]], gate: [0], meadow: [[2, 3, 4], [5, 6, 7]] }],
  ["Two town edges, facing", 3, { town: [[0], [2]], meadow: [[2, 3, 6, 7]] }],
  ["Two town edges, at a corner", 2, { town: [[0], [1]], meadow: [[4, 5, 6, 7]] }],
  ["Town corner", 3, { town: [[0, 3]], meadow: [[2, 3, 4, 5]] }],
  ["Town corner with a market", 2, { town: [[0, 3]], market: 1, meadow: [[2, 3, 4, 5]] }],
  ["Town corner and lane", 3, { town: [[0, 3]], lane: [[1, 2]], meadow: [[3, 4], [2, 5]] }],
  ["Town corner and lane, with a market", 2, { town: [[0, 3]], market: 1, lane: [[1, 2]], meadow: [[3, 4], [2, 5]] }],
  ["Town across", 1, { town: [[1, 3]], meadow: [[0, 1], [4, 5]] }],
  ["Town across, with a market", 2, { town: [[1, 3]], market: 1, meadow: [[0, 1], [4, 5]] }],
  ["Town on three sides", 3, { town: [[0, 1, 3]], meadow: [[4, 5]] }],
  ["Town on three sides, with a market", 1, { town: [[0, 1, 3]], market: 1, meadow: [[4, 5]] }],
  ["Town on three sides, with a gate", 1, { town: [[0, 1, 3]], lane: [[2]], gate: [0], meadow: [[4], [5]] }],
  ["Town on three sides, with a gate and a market", 2, { town: [[0, 1, 3]], market: 1, lane: [[2]], gate: [0], meadow: [[4], [5]] }],
  ["Walled town with a market", 1, { town: [[0, 1, 2, 3]], market: 1 }],
];

/** A half of a meadow edge, as a port. */
const portOf = (h) => (h >> 1) * 3 + (h & 1 ? 2 : 0);

function compile([name, count, d]) {
  const feats = [], port = Array(12).fill(-1), edge = [MEADOW, MEADOW, MEADOW, MEADOW];
  for (const edges of d.town || []) {
    const f = feats.length;
    feats.push({ kind: "town", edges, market: d.market && f === 0 ? 1 : 0 });
    for (const e of edges) { edge[e] = TOWN; for (let q = 0; q < 3; q++) port[e * 3 + q] = f; }
  }
  (d.lane || []).forEach((edges, i) => {
    const f = feats.length;
    feats.push({ kind: "lane", edges, gate: d.gate?.[i] ?? -1 });
    for (const e of edges) { edge[e] = LANE; port[e * 3 + 1] = f; }
  });
  for (const halves of d.meadow || []) {
    const f = feats.length;
    feats.push({ kind: "meadow", halves, towns: [], well: 0 });
    for (const h of halves) port[portOf(h)] = f;
  }
  for (let e = 0; e < 4; e++) if (edge[e] === MEADOW) port[e * 3 + 1] = port[e * 3]; // the middle of a meadow edge: the meadow either side of it
  if (d.well) { feats.push({ kind: "well" }); feats.find((F) => F.kind === "meadow").well = 1; } // the well stands in the tile's meadow
  // which towns each meadow touches: a town port next to one of its ports, going round the edge of the tile
  feats.forEach((F, f) => {
    if (F.kind !== "meadow") return;
    for (let i = 0; i < 12; i++) if (port[i] === f) for (const j of [(i + 1) % 12, (i + 11) % 12]) { const g = port[j]; if (g >= 0 && feats[g].kind === "town" && !F.towns.includes(g)) F.towns.push(g); }
    F.towns.sort((a, b) => a - b);
  });
  const ports = feats.map((_, f) => port.flatMap((g, i) => (g === f ? [i] : [])));
  return { name, count, edge, port, feats, ports };
}

export const KINDS = RAW.map(compile);
/** The tile that starts every countryside, laid before the first turn: a town edge with a lane along it. */
export const START = KINDS.findIndex((K) => K.name === "Town edge and lane");
/** Each kind's turns that differ: a straight lane turned twice is the same tile, so it is offered once. */
export const ROTS = KINDS.map((K) => {
  const seen = [], out = [];
  for (let r = 0; r < 4; r++) {
    const names = new Map(), sig = Array.from({ length: 12 }, (_, i) => { const f = K.port[(i - 3 * r + 12) % 12]; if (!names.has(f)) names.set(f, names.size); return `${names.get(f)}${K.feats[f].kind[0]}`; }).join();
    if (!seen.includes(sig)) { seen.push(sig); out.push(r); }
  }
  return out;
});

/** What a kind turned r times has on edge e. */
export const edgeOf = (k, r, e) => KINDS[k].edge[(e - r + 4) % 4];
/** The feature on port i of a kind turned r times. */
export const featAt = (k, r, i) => KINDS[k].port[(i - 3 * r + 12) % 12];

/** The full mix in an order that keeps every share even along it, so a shorter bag has nearly the same mix. */
export const MIX = KINDS.reduce((n, K) => n + K.count, 0);
export const ORDER = (() => {
  const out = [], used = KINDS.map(() => 0);
  for (let n = 1; n <= MIX; n++) {
    let best = -1;
    KINDS.forEach((K, k) => { if (used[k] < K.count && (best < 0 || K.count * n - used[k] * MIX > KINDS[best].count * n - used[best] * MIX)) best = k; });
    used[best]++;
    out.push(best);
  }
  return out;
})();
/** How many tiles a bag holds, by length and by the number of seats (2 to 5). */
export const LENGTHS = { short: [36, 45, 54, 54], normal: [48, 60, 76, 76], long: [64, 76, 90, 90] };
