// SPDX-License-Identifier: AGPL-3.0-or-later
// What stands on Capo's lit map: sober blocks with map symbols, not toy soldiers. Looks only: every piece is read off
// the state the rules already keep (who holds what, might, wars, the people seated in command, missions); nothing here changes a game.
// A piece: { m: model, at: province id or [x, y], owner: country code, dx, dy (in piece sizes), band: the zoom band it appears at
// (0 the world, 1 a region, 2 a country), until: the last band it is shown at, sea: it floats, size, turn, pips: strength, rgb,
// fit: the screen points its province must span before it shows }.
import { KINDS } from "../src/story/missions.js";
import { statusOf } from "../src/story/roster.js";

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
 * capomap: cities and towns, worked out once a world from its shapes alone (no table of people is shipped). A province far
 * smaller than its country's usual one is a city in its own right (Berlin, Moscow, Delhi, Buenos Aires are provinces of
 * their own on the real map): the two smallest a country has show from the region band. Its other small provinces and its
 * most crowded ones (several merged into one) are cities from the country band, and every other province has a town where
 * its name stands, from the country band too.
 */
const placed = new WeakMap();
export function townsOf(world) {
  if (placed.has(world)) return placed.get(world);
  const by = new Map(), area = (p) => Math.max(1, (p.box[2] - p.box[0]) * (p.box[3] - p.box[1]));
  for (const p of world.provinces.values()) { if (!by.has(p.country)) by.set(p.country, []); by.get(p.country).push(p); }
  const great = new Set(), cities = new Set();
  for (const list of by.values()) {
    if (list.length < 4) continue;
    const sizes = list.map(area).sort((a, b) => a - b), usual = sizes[sizes.length >> 1], small = list.filter((p) => area(p) * 7 < usual).sort((a, b) => area(a) - area(b) || (a.id < b.id ? -1 : 1));
    small.slice(0, 2).forEach((p) => great.add(p.id));
    small.slice(2).forEach((p) => cities.add(p.id));
    list.slice().sort((a, b) => (b.members?.length || 1) / area(b) - (a.members?.length || 1) / area(a) || (a.id < b.id ? -1 : 1)).slice(0, Math.min(3, Math.floor(list.length / 9))).forEach((p) => { if (!great.has(p.id)) cities.add(p.id); });
  }
  const out = { great, cities, towns: [...world.provinces.keys()].filter((id) => !great.has(id) && !cities.has(id)) };
  placed.set(world, out);
  return out;
}

// capomap: mission pins, by what the mission is; a held person's pin is dark red
const PIN = { scout: [86, 150, 214], sabotage: [222, 118, 44], rescue: [232, 196, 72], held: [150, 28, 30], known: [150, 196, 232], spoiled: [176, 96, 48] };

/**
 * world: the unpacked map. homes: country -> { id, a } (its home province and how large). owner(id), might(code) 1 to 6 or so,
 * wars: [[a, b], ...], player: the player's country, staff: how many named people the player has seated in command (seven at most).
 * strength(code): might now, 1 to 10, for the pips (might when not given). g: the game, for its missions (read only).
 * The list carries `threads`: [[from, to, rgb], ...] in map units, a mission's line from home to where it goes.
 */
export function mapPieces({ world, homes, owner, might, wars = [], player = "", staff = 0, strength = null, g = null }) {
  const out = [], rank = [...homes].sort((a, b) => b[1].a - a[1].a), land = new Map(), known = new Map(), pips = (c) => { if (!known.has(c)) known.set(c, Math.max(1, Math.min(10, Math.round((strength || might)(c) || 1)))); return known.get(c); }; // once a country: strength reads the whole map
  for (const p of world.provinces.values()) { const c = owner(p.id); if (!land.has(c)) land.set(c, []); land.get(c).push(p); }
  const seat = new Set();
  rank.forEach(([c, h], i) => {
    if (owner(h.id) !== c) return; // its home has fallen: no capital stands there
    seat.add(h.id);
    const m = might(c) || 0, far = i < 36 ? 0 : 1; // the whole world shows the larger countries' capitals large, the rest small
    out.push({ m: "keep", at: h.id, owner: c, band: far, size: 0.72 });
    if (far) out.push({ m: "keep", at: h.id, owner: c, band: 0, until: 0, size: 0.4 }); // capomap: every capital, always
    if (m >= 3) out.push({ m: m >= 5 ? "armour" : "army", at: h.id, owner: c, dx: 0.95, dy: 0.3, band: m >= 4 ? 0 : 1, size: 0.78, pips: pips(c) }); // one block a country when seen from afar
    if (m >= 5) out.push({ m: "wing", at: h.id, owner: c, dx: -0.95, dy: -0.35, band: 1, size: 0.7 });
    if (m >= 4) { // a fleet, off the coast nearest its home
      const coast = (land.get(c) || []).filter((p) => world.coast.has(p.id)).sort((a, b) => Math.hypot(a.label[0] - world.provinces.get(h.id).label[0], a.label[1] - world.provinces.get(h.id).label[1]) - Math.hypot(b.label[0] - world.provinces.get(h.id).label[0], b.label[1] - world.provinces.get(h.id).label[1]))[0];
      const sea = coast && offshore(world, coast.id);
      if (sea) out.push({ m: "fleet", at: sea.at, turn: sea.turn, owner: c, sea: true, band: m >= 5 ? 0 : 1, size: 0.8, pips: pips(c) });
    }
  });
  // capomap: great cities from the region band, the rest and towns from the country band, where no capital stands
  const { great, cities, towns } = townsOf(world);
  for (const id of great) if (!seat.has(id)) out.push({ m: "city", at: id, band: 1, size: 0.55 });
  for (const id of cities) if (!seat.has(id)) out.push({ m: "city", at: id, band: 2, size: 0.55, fit: 36 });
  for (const id of towns) if (!seat.has(id)) out.push({ m: "hamlet", at: id, band: 2, size: 0.6, fit: 70 }); // fit: shown once its province is that many screen points across
  // a war: blocks face each other across the front, with guns behind them once you look closer
  let seats = Math.min(7, staff);
  for (const [a, b] of wars) {
    const pairs = [];
    for (const p of land.get(a) || []) for (const n of world.neighbours.get(p.id)) if (owner(n) === b) pairs.push([p, world.provinces.get(n)]);
    pairs.sort((x, y) => (x[0].id < y[0].id ? -1 : x[0].id > y[0].id ? 1 : 0));
    const picks = pairs.length > 6 ? [pairs[Math.floor(pairs.length / 4)], pairs[Math.floor((pairs.length * 3) / 4)]] : pairs.slice(0, 1);
    for (const [pa, pb] of picks) for (const [p, c, q] of [[pa, a, pb], [pb, b, pa]]) {
      const turn = Math.atan2(q.label[1] - p.label[1], q.label[0] - p.label[0]) + Math.PI / 2;
      out.push({ m: (might(c) || 0) >= 5 ? "armour" : "army", at: p.id, owner: c, turn, band: 0, size: 0.8, pips: pips(c) });
      out.push({ m: "guns", at: p.id, owner: c, turn, dx: -Math.sin(turn) * -0.9, dy: Math.cos(turn) * -0.9, band: 2, size: 0.7, pips: pips(c) });
      if (c === player && seats > 0) { seats--; out.push({ m: "leader", at: p.id, owner: c, dx: 0.8, dy: 0.5, band: 1, size: 0.8 }); } // a commander stands with the army they lead
    }
  }
  // commanders with no front to stand at wait at the capital
  const home = player && homes.get(player);
  if (home && owner(home.id) === player) for (let k = 0; k < seats; k++) out.push({ m: "leader", at: home.id, owner: player, dx: -0.9 + k * 0.42, dy: 0.95, band: 2, size: 0.7 });
  out.threads = g ? missionPins(out, g, world, homes, owner, land, player) : [];
  return out;
}

/** capomap: who is out in the field, and where. Pins at the country's capital (or its first province if that has fallen). */
function missionPins(out, g, world, homes, owner, land, player) {
  const threads = [], where = (c) => { const h = homes.get(c); return h && owner(h.id) === c ? h.id : (land.get(c) || [])[0]?.id; }, from = where(player);
  const pin = (c, rgb, k, agent, line) => {
    const at = where(c);
    if (!at) return;
    out.push({ m: "pin", at, rgb, dx: -0.6 + k * 0.32, dy: -0.8, band: 0, size: 1.4 });
    if (agent) out.push({ m: "agent", at, owner: player, dx: -0.2 + k * 0.3, dy: -0.55, band: 1, size: 0.85 });
    if (line && from && from !== at) threads.push([world.provinces.get(from).label, world.provinces.get(at).label, rgb]);
  };
  const count = new Map(), next = (c) => { const k = count.get(c) || 0; count.set(c, k + 1); return k; };
  for (const m of (g.sends || []).filter((x) => (g.actions || []).includes(x.text) && KINDS[x.kind])) pin(m.target, PIN[m.kind], next(m.target), true, true); // ordered this turn
  for (const name of Object.keys(g.roster || {})) { const s = statusOf(g, name); if (s.st === "held" && s.by) pin(s.by, PIN.held, next(s.by), true, true); }
  for (const [c, until] of Object.entries(g.intel || {})) if (until > g.date) pin(c, PIN.known, next(c), false, false); // scouted: its watch is known
  for (const [c, until] of Object.entries(g.sabot || {})) if (until > g.date) pin(c, PIN.spoiled, next(c), false, false); // sabotaged: its might one lower
  return threads;
}
