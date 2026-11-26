// SPDX-License-Identifier: AGPL-3.0-or-later
// What stands on Capo's lit map: sober blocks with map symbols, not toy soldiers. Looks only: every piece is read off
// the state the rules already keep (who holds what, might, wars, the people seated in command); nothing here changes a game.
// A piece: { m: model, at: province id or [x, y], owner: country code, dx, dy (in piece sizes), band: the zoom band it appears at
// (0 the world, 1 a region, 2 a country), until: the last band it is shown at, sea: it floats, size, turn }.

/** Where a fleet lies off a coastal province: out from the middle of its longest stretch of coast. */
function offshore(world, id) {
  const p = world.provinces.get(id);
  let best = null;
  world.sides.forEach((ids, k) => { if (ids.length === 1 && ids[0] === id && (!best || world.arcs[k].length > best.length)) best = world.arcs[k]; });
  if (!best) return null;
  const m = best[best.length >> 1], dx = m[0] - p.label[0], dy = m[1] - p.label[1], d = Math.hypot(dx, dy) || 1;
  return { at: [m[0] + (dx / d) * 9, m[1] + (dy / d) * 9], turn: Math.atan2(dy, dx) + Math.PI / 2 };
}

/**
 * world: the unpacked map. homes: country -> { id, a } (its home province and how large). owner(id), might(code) 1 to 6 or so,
 * wars: [[a, b], ...], player: the player's country, staff: how many named people the player has seated in command (seven at most).
 */
export function mapPieces({ world, homes, owner, might, wars = [], player = "", staff = 0 }) {
  const out = [], rank = [...homes].sort((a, b) => b[1].a - a[1].a), land = new Map();
  for (const p of world.provinces.values()) { const c = owner(p.id); if (!land.has(c)) land.set(c, []); land.get(c).push(p); }
  rank.forEach(([c, h], i) => {
    if (owner(h.id) !== c) return; // its home has fallen: no capital stands there
    const m = might(c) || 0, far = i < 36 ? 0 : 1; // the whole world shows the larger countries' capitals only
    out.push({ m: "keep", at: h.id, owner: c, band: far, size: 0.72 });
    if (m >= 3) out.push({ m: m >= 5 ? "armour" : "army", at: h.id, owner: c, dx: 0.95, dy: 0.3, band: m >= 4 ? 0 : 1, size: 0.78 }); // one block a country when seen from afar
    if (m >= 5) out.push({ m: "wing", at: h.id, owner: c, dx: -0.95, dy: -0.35, band: 1, size: 0.7 });
    if (m >= 4) { // a fleet, off the coast nearest its home
      const coast = (land.get(c) || []).filter((p) => world.coast.has(p.id)).sort((a, b) => Math.hypot(a.label[0] - world.provinces.get(h.id).label[0], a.label[1] - world.provinces.get(h.id).label[1]) - Math.hypot(b.label[0] - world.provinces.get(h.id).label[0], b.label[1] - world.provinces.get(h.id).label[1]))[0];
      const sea = coast && offshore(world, coast.id);
      if (sea) out.push({ m: "fleet", at: sea.at, turn: sea.turn, owner: c, sea: true, band: m >= 5 ? 0 : 1, size: 0.8 });
    }
  });
  // a war: blocks face each other across the front, with guns behind them once you look closer
  let seats = Math.min(7, staff);
  for (const [a, b] of wars) {
    const pairs = [];
    for (const p of land.get(a) || []) for (const n of world.neighbours.get(p.id)) if (owner(n) === b) pairs.push([p, world.provinces.get(n)]);
    pairs.sort((x, y) => (x[0].id < y[0].id ? -1 : x[0].id > y[0].id ? 1 : 0));
    const picks = pairs.length > 6 ? [pairs[Math.floor(pairs.length / 4)], pairs[Math.floor((pairs.length * 3) / 4)]] : pairs.slice(0, 1);
    for (const [pa, pb] of picks) for (const [p, c, q] of [[pa, a, pb], [pb, b, pa]]) {
      const turn = Math.atan2(q.label[1] - p.label[1], q.label[0] - p.label[0]) + Math.PI / 2;
      out.push({ m: (might(c) || 0) >= 5 ? "armour" : "army", at: p.id, owner: c, turn, band: 0, size: 0.8 });
      out.push({ m: "guns", at: p.id, owner: c, turn, dx: -Math.sin(turn) * -0.9, dy: Math.cos(turn) * -0.9, band: 2, size: 0.7 });
      if (c === player && seats > 0) { seats--; out.push({ m: "leader", at: p.id, owner: c, dx: 0.8, dy: 0.5, band: 1, size: 0.8 }); } // a commander stands with the army they lead
    }
  }
  // commanders with no front to stand at wait at the capital
  const home = player && homes.get(player);
  if (home && owner(home.id) === player) for (let k = 0; k < seats; k++) out.push({ m: "leader", at: home.id, owner: player, dx: -0.9 + k * 0.42, dy: 0.95, band: 2, size: 0.7 });
  return out;
}
