// SPDX-License-Identifier: AGPL-3.0-or-later
// A hexagon of hexes. Cells are numbered row by row; neighbours are worked out once for each size.
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
const made = new Map();

export function hexBoard(radius) {
  if (made.has(radius)) return made.get(radius);
  const cells = [], at = new Map(), R = radius;
  for (let q = -R; q <= R; q++) {
    for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
      at.set(`${q},${r}`, cells.length);
      cells.push([q, r]);
    }
  }
  const id = (q, r) => at.get(`${q},${r}`);
  const near = cells.map(([q, r]) => STEPS.map(([a, b]) => id(q + a, r + b)).filter((x) => x !== undefined));
  const corners = [[R, 0], [0, R], [-R, R], [-R, 0], [0, -R], [R, -R]].map(([q, r]) => id(q, r)); // in order round the edge
  const board = Object.freeze({ radius, size: cells.length, cells, near, corners });
  made.set(radius, board);
  return board;
}

/** Every cell joined to `start` through cells that pass the test. */
export function joined(near, start, ok) {
  if (!ok(start)) return [];
  const seen = new Set([start]), list = [start];
  for (let i = 0; i < list.length; i++) for (const m of near[list[i]]) if (!seen.has(m) && ok(m)) { seen.add(m); list.push(m); }
  return list;
}
