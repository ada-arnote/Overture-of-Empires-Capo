// SPDX-License-Identifier: AGPL-3.0-or-later
// A whole invented world from a seed, in the same shape as maps/world.json, so Capo's story map draws it and the
// rules read it unchanged: arcs (border lines, each drawn once), provinces made of arcs, neighbours, narrow seas
// and countries. Whole-number maths only: one seed and one recipe give the same world on every machine.
// The steps: land from a few soft shapes and some noise; province seeds spread over the land and grown until they
// meet; the lines between them traced and smoothed; sea crossings found so that no land is cut off; countries
// grown from spread-out homes, each by its share; names made from the recipe's own sounds.

const CELL = 10, W = 192, H = 120, N = W * H;
/** The generator's version. A change that would make a seed give another world raises it, so an old game is never read onto the wrong map. */
export const GEN = 1;
// codes the story's reader spells another way, and the one a country in the making goes by
const TAKEN = ["YOU", "SSD", "XKX", "ESH", "PSE"];

/** Repeatable whole numbers from a text seed: roll(n) is 0 to n - 1. */
export function dice(seed) {
  let a = 2166136261;
  for (const ch of String(seed)) a = Math.imul(a ^ ch.codePointAt(0), 16777619);
  return (n) => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) % n; };
}
const mix = (x, y, k) => { let h = Math.imul(x + 7, 374761393) ^ Math.imul(y + 3, 668265263) ^ Math.imul(k + 1, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return (h ^ (h >>> 16)) >>> 0; };
// smooth noise from 0 to 255: numbers on a grid of step s, blended between its corners
function soft(x, y, s, k) {
  const ix = Math.floor(x / s), iy = Math.floor(y / s), fx = x - ix * s, fy = y - iy * s, g = (a, b) => mix(a, b, k) & 255;
  return Math.floor(((g(ix, iy) * (s - fx) + g(ix + 1, iy) * fx) * (s - fy) + (g(ix, iy + 1) * (s - fx) + g(ix + 1, iy + 1) * fx) * fy) / (s * s));
}
const around = (i) => { const x = i % W, out = []; if (x > 0) out.push(i - 1); if (x < W - 1) out.push(i + 1); if (i >= W) out.push(i - W); if (i < N - W) out.push(i + W); return out; };
/** Groups of joined cells for which is(i) holds: [group of each cell or -1, sizes]. */
function groups(is) {
  const of = new Int32Array(N).fill(-1), sizes = [];
  for (let i = 0; i < N; i++) {
    if (of[i] >= 0 || !is(i)) continue;
    const list = [i]; of[i] = sizes.length;
    for (let j = 0; j < list.length; j++) for (const m of around(list[j])) if (of[m] < 0 && is(m)) { of[m] = sizes.length; list.push(m); }
    sizes.push(list.length);
  }
  return [of, sizes];
}

// ---- land: the highest cells of soft shapes plus noise, up to the share of land the recipe asks for ----
function landOf(r, roll, salt) {
  const pc = (p, n) => Math.floor((p * n) / 100);
  const blobs = (r.blobs || []).map(([x, y, rx, ry]) => [pc(x + roll(9) - 4, W), pc(y + roll(9) - 4, H), Math.max(3, pc(rx, W)), Math.max(3, pc(ry, H))]);
  for (let i = 0; i < (r.isles || 0); i++) blobs.push([pc(8 + roll(85), W), pc(10 + roll(81), H), pc(2 + roll(5), W), pc(3 + roll(6), H)]);
  const value = new Int32Array(N), rough = r.rough ?? 50;
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i - x) / W, edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    let best = 0;
    for (const [cx, cy, rx, ry] of blobs) { const d = Math.floor(((x - cx) * (x - cx) * 1000) / (rx * rx)) + Math.floor(((y - cy) * (y - cy) * 1000) / (ry * ry)); if (d < 1000 && 1000 - d > best) best = 1000 - d; }
    const noise = Math.floor((3 * soft(x, y, 28, salt) + 2 * soft(x, y, 13, salt + 1) + 2 * soft(x, y, 6, salt + 2)) / 7);
    value[i] = edge < 3 ? -1 : Math.floor((best * 300) / 1000) + Math.floor((noise * rough) / 50) - (edge < 10 ? (10 - edge) * 25 : 0);
  }
  const order = [...value.keys()].filter((i) => value[i] >= 0).sort((a, b) => value[b] - value[a] || a - b), land = new Uint8Array(N);
  for (const i of order.slice(0, pc(Math.max(10, Math.min(60, r.land ?? 35)), N))) land[i] = 1;
  // specks of land go under, puddles are filled: every sea left is the ocean or a real inland sea
  const [lg, ls] = groups((i) => land[i] === 1);
  for (let i = 0; i < N; i++) if (land[i] && ls[lg[i]] < 8) land[i] = 0;
  const [sg, ss] = groups((i) => land[i] === 0);
  for (let i = 0; i < N; i++) if (!land[i] && sg[i] !== sg[0] && ss[sg[i]] < 40) land[i] = 1;
  return land;
}

// ---- provinces: seeds kept apart, grown over uneven ground until they meet ----
function provincesOf(land, want, roll, salt) {
  const cells = []; for (let i = 0; i < N; i++) if (land[i]) cells.push(i);
  for (let i = cells.length - 1; i > 0; i--) { const j = roll(i + 1); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  const gap = Math.floor((cells.length * 3) / (5 * want)), seeds = [];
  for (const c of cells) {
    if (seeds.length >= want) break;
    const x = c % W, y = (c - x) / W;
    if (seeds.every((s) => { const dx = (s % W) - x, dy = Math.floor(s / W) - y; return dx * dx + dy * dy >= gap; })) seeds.push(c);
  }
  // an island no seed fell on gets one of its own
  const [lg] = groups((i) => land[i] === 1), has = new Set(seeds.map((s) => lg[s]));
  for (let i = 0; i < N; i++) if (land[i] && !has.has(lg[i])) { has.add(lg[i]); seeds.push(i); }
  const of = new Int16Array(N).fill(-1), dist = new Int32Array(N).fill(1 << 30), rows = [[]];
  seeds.forEach((c, k) => { dist[c] = 0; of[c] = k; rows[0].push(c); });
  for (let d = 0; d < rows.length; d++) {
    for (const c of rows[d] || []) {
      if (dist[c] !== d) continue;
      for (const m of around(c)) {
        if (!land[m]) continue;
        const nd = d + 2 + (soft(m % W, Math.floor(m / W), 5, salt + 9) >> 5);
        if (nd < dist[m]) { dist[m] = nd; of[m] = of[c]; (rows[nd] ||= []).push(m); }
      }
    }
  }
  return [of, seeds];
}

// ---- lines: every edge between two provinces, or a province and the sea, joined into arcs that end where three meet ----
function linesOf(of, count, salt) {
  const VW = W + 1, NV = VW * (H + 1), at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : of[y * W + x]);
  const east = new Uint8Array(NV), south = new Uint8Array(NV), deg = new Uint8Array(NV);
  for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
    const v = y * VW + x;
    if (x < W && at(x, y - 1) !== at(x, y)) { east[v] = 1; deg[v]++; deg[v + 1]++; }
    if (y < H && at(x - 1, y) !== at(x, y)) { south[v] = 1; deg[v]++; deg[v + VW]++; }
  }
  // the ways out of a corner still to be walked: [the corner reached, the edge's list, its place there]
  const ways = (v) => [[v + 1, east, v], [v - 1, east, v - 1], [v + VW, south, v], [v - VW, south, v - VW]].filter(([, list, e]) => e >= 0 && list[e] === 1);
  const arcs = [], sides = [];
  const walk = (v, [to, list, e]) => {
    list[e] = 2;
    const ex = e % VW, ey = (e - ex) / VW, fwd = to > v;
    // which province lies to the left and right of the way walked
    sides.push(list === east ? (fwd ? [at(ex, ey - 1), at(ex, ey)] : [at(ex, ey), at(ex, ey - 1)]) : fwd ? [at(ex, ey), at(ex - 1, ey)] : [at(ex - 1, ey), at(ex, ey)]);
    const pts = [v]; let cur = to;
    while (deg[cur] === 2 && cur !== v) { const next = ways(cur)[0]; if (!next) break; next[1][next[2]] = 2; pts.push(cur); cur = next[0]; }
    pts.push(cur); arcs.push(pts);
  };
  for (let v = 0; v < NV; v++) if (deg[v] && deg[v] !== 2) for (const w of ways(v)) if (w[1][w[2]] === 1) walk(v, w);
  for (let v = 0; v < NV; v++) for (const w of ways(v)) if (w[1][w[2]] === 1) walk(v, w); // rings with no corner where three meet
  // each province's outline: its arcs, turned so the province is on the left, chained end to start
  const halves = Array.from({ length: count }, () => []);
  arcs.forEach((pts, k) => { const [l, r] = sides[k], a = pts[0], b = pts[pts.length - 1]; if (l >= 0) halves[l].push([k, a, b]); if (r >= 0) halves[r].push([~k, b, a]); });
  const rings = halves.map((list) => {
    const out = [], used = new Set();
    for (const first of list) {
      if (used.has(first)) continue;
      const ring = []; let h = first;
      while (h && !used.has(h)) { used.add(h); ring.push(h[0]); const end = h[2]; h = end === first[1] ? null : list.find((n) => !used.has(n) && n[1] === end); }
      out.push(ring);
    }
    return out;
  });
  // corners nudged, then each arc eased twice between its fixed ends, so borders look drawn and neighbours still meet exactly
  const shape = arcs.map((pts) => {
    let p = pts.map((v) => { const x = v % VW, y = (v - x) / VW; return [x * CELL + (mix(x, y, salt) % 5) - 2, y * CELL + (mix(y, x, salt + 5) % 5) - 2]; });
    for (let pass = 0; pass < 2; pass++) p = p.map((q, i) => (i === 0 || i === p.length - 1 ? q : [Math.floor((p[i - 1][0] + 2 * q[0] + p[i + 1][0]) / 4), Math.floor((p[i - 1][1] + 2 * q[1] + p[i + 1][1]) / 4)]));
    return p.flatMap((q, i) => (i ? [q[0] - p[i - 1][0], q[1] - p[i - 1][1]] : q));
  });
  const pairs = new Set();
  for (const [l, r] of sides) if (l >= 0 && r >= 0) pairs.add(Math.min(l, r) * count + Math.max(l, r));
  return { arcs: shape, rings, pairs, coast: new Set(sides.flatMap(([l, r]) => (l < 0 ? [r] : r < 0 ? [l] : []))) };
}

// ---- narrow seas: coasts that face each other over a little water, and enough longer crossings that no land is cut off ----
function seasOf(of, count, pairs, reach) {
  const from = new Int16Array(N).fill(-1), far = new Int16Array(N), queue = [];
  for (let i = 0; i < N; i++) if (of[i] >= 0) for (const m of around(i)) if (of[m] < 0 && from[m] < 0) { from[m] = of[i]; far[m] = 1; queue.push(m); }
  for (let j = 0; j < queue.length; j++) for (const m of around(queue[j])) if (of[m] < 0 && from[m] < 0) { from[m] = from[queue[j]]; far[m] = far[queue[j]] + 1; queue.push(m); }
  const best = new Map(), see = (a, b, d) => { if (a === b) return; const k = Math.min(a, b) * count + Math.max(a, b); if (!pairs.has(k) && !(best.get(k) <= d)) best.set(k, d); };
  for (const s of queue) for (const m of around(s)) { if (of[m] >= 0) see(from[s], of[m], far[s]); else if (from[m] >= 0) see(from[s], from[m], far[s] + far[m]); }
  const top = Array.from({ length: count }, (_, i) => i), find = (a) => { while (top[a] !== a) a = top[a] = top[top[a]]; return a; };
  const near = Array.from({ length: count }, () => new Set()), links = Array(count).fill(0), sea = [];
  for (const k of pairs) { const a = Math.floor(k / count), b = k % count; top[find(a)] = find(b); near[a].add(b); near[b].add(a); }
  for (const [k, d] of [...best].sort((x, y) => x[1] - y[1] || x[0] - y[0])) {
    const a = Math.floor(k / count), b = k % count, apart = find(a) !== find(b);
    // close coasts with no shared neighbour by land, four crossings a province at most; or any crossing that joins two lands
    if (!apart && (d > reach || links[a] >= 4 || links[b] >= 4 || [...near[a]].some((n) => near[b].has(n)))) continue;
    top[find(a)] = find(b); links[a]++; links[b]++; sea.push([a, b, d]);
  }
  return sea;
}

// ---- names: each culture has its own sounds; nothing is taken from a real place or from anyone's fiction ----
const pick = (list, roll) => list[roll(list.length)];
function namer(roll) {
  const used = new Set();
  return (c) => {
    for (let n = 0; ; n++) {
      let w = "";
      for (let i = 0, parts = 1 + roll(2) + Math.floor(n / 30); i < parts; i++) w += pick(c.a, roll) + pick(c.b, roll) + (i < parts - 1 && !roll(3) ? pick(c.c, roll) : "");
      w += pick(c.z, roll); // always one of the culture's own endings, which keeps made names clear of real ones
      if (w.length < 4 || w.length > 11 + 4 * Math.floor(n / 30) || /(.)\1\1/.test(w) || used.has(w)) continue;
      used.add(w);
      return w[0].toUpperCase() + w.slice(1);
    }
  };
}
function coder() {
  const used = new Set(TAKEN);
  return (name) => {
    const s = name.toUpperCase().replace(/[^A-Z]/g, ""), hard = s[0] + s.slice(1).replace(/[AEIOU]/g, ""), tries = [hard.slice(0, 3), s.slice(0, 3)];
    for (let i = 1; i < s.length; i++) for (let j = i + 1; j < s.length; j++) tries.push(s[0] + s[i] + s[j]);
    for (let i = 0; i < 676; i++) tries.push(s[0] + String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26)));
    const code = tries.find((t) => t.length === 3 && !used.has(t));
    used.add(code);
    return code;
  };
}

// ---- countries: homes spread far apart, then land taken one province at a time, each country by its share ----
function realmsOf(r, P, adj, over, coast, label, size, seed) {
  const want = Math.max(2, Math.min(r.realms || 12, 24, P >> 1)), factions = (r.factions || []).slice(0, want);
  const hops = (start) => { const d = new Int16Array(P).fill(-1), q = [start]; d[start] = 0; for (let j = 0; j < q.length; j++) for (const m of [...adj[q[j]], ...over[q[j]]]) if (d[m] < 0) { d[m] = d[q[j]] + 1; q.push(m); } return d; };
  // how much land a province is joined to without crossing water: a home wants room for its country's share
  const mass = new Int16Array(P), all = Array.from({ length: want }, (_, k) => Math.max(1, Math.min(6, factions[k]?.size || 1))).reduce((x, y) => x + y, 0);
  for (let i = 0; i < P; i++) { if (mass[i]) continue; const q = [i], seen = new Set(q); for (const p of q) for (const m of adj[p]) if (!seen.has(m)) { seen.add(m); q.push(m); } for (const p of q) mass[p] = q.length; }
  let kept = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const roll = dice(`${seed}/realms/${attempt}`), homes = [], apart = new Int16Array(P).fill(32000);
    for (let k = 0; k < want; k++) {
      // a faction may ask for a home on the coast (1) or inland (2); a home is never the smallest sort of province
      const where = factions[k]?.at || 0, fits = (i) => !homes.includes(i) && (where === 1 ? coast.has(i) : where === 2 ? !coast.has(i) : true);
      const room = Math.floor((P * Math.max(1, Math.min(6, factions[k]?.size || 1))) / all);
      let best = -1, score = -1;
      for (let i = 0; i < P; i++) { if (!fits(i)) continue; const s = (k ? Math.min(apart[i], 9) * 40 : 0) + Math.min(mass[i], room) * 16 + Math.min(size[i], 40) + roll(24); if (s > score) { score = s; best = i; } }
      if (best < 0) for (let i = 0; i < P && best < 0; i++) if (!homes.includes(i)) best = i;
      homes.push(best);
      const d = hops(best); for (let i = 0; i < P; i++) if (d[i] >= 0 && d[i] < apart[i]) apart[i] = d[i];
    }
    const of = new Int16Array(P).fill(-1), lands = homes.map((h, k) => { of[h] = k; return [h]; }), share = homes.map((_, k) => Math.max(1, Math.min(6, factions[k]?.size || 1)));
    // the country furthest behind its share takes next: the nearest free province to its home, by land if it can, else over a narrow sea
    for (const done = new Set(); done.size < want; ) {
      let k = -1;
      for (let j = 0; j < want; j++) if (!done.has(j) && (k < 0 || lands[j].length * share[k] < lands[k].length * share[j])) k = j;
      const far = (i) => { const dx = label[i][0] - label[homes[k]][0], dy = label[i][1] - label[homes[k]][1]; return dx * dx + dy * dy; };
      let best = -1;
      for (const net of [adj, over]) { for (const p of lands[k]) for (const m of net[p]) if (of[m] < 0 && (best < 0 || far(m) < far(best) || (far(m) === far(best) && m < best))) best = m; if (best >= 0) break; }
      if (best < 0) done.add(k); else { of[best] = k; lands[k].push(best); }
    }
    // fair homes: the worst-off country's land against its share; the first try that gives everyone half a share is kept
    const worst = Math.min(...lands.map((l, k) => Math.floor((l.length * all * 100) / (share[k] * P))));
    if (!kept || worst > kept.worst) kept = { worst, of, homes, lands };
    if (worst >= 50) break;
  }
  return kept;
}

/**
 * Make a world. `recipe`: {land (percent), rough, blobs: [[x, y, rx, ry] in percent], isles, provinces, realms, reach,
 * cultures: [{name, a, b, c, z}] (starts, vowels, closes and endings of names), factions: [{name: "Kingdom of *",
 * culture, size 1 to 6, might, at}], minors: ["* March", ...]}. Returns the map in the shape of maps/world.json,
 * with `realms` beside it: [{code, name, home, culture, faction (its place in the recipe, or -1), size}].
 */
export function makeWorld(recipe, seed) {
  const roll = dice(`${seed}/land`), salt = roll(1 << 20);
  const land = landOf(recipe, roll, salt), [of, seeds] = provincesOf(land, Math.max(40, Math.min(recipe.provinces || 240, 400)), roll, salt), P = seeds.length;
  const { arcs, rings, pairs, coast } = linesOf(of, P, salt), sea = seasOf(of, P, pairs, recipe.reach || 7);
  const adj = Array.from({ length: P }, () => []), over = Array.from({ length: P }, () => []);
  for (const k of pairs) { const a = Math.floor(k / P), b = k % P; adj[a].push(b); adj[b].push(a); }
  for (const [a, b] of sea) { over[a].push(b); over[b].push(a); }
  // a province's label sits on its middle cell, or on its seed when the middle falls outside it
  const sum = Array.from({ length: P }, () => [0, 0, 0]);
  for (let i = 0; i < N; i++) if (of[i] >= 0) { const s = sum[of[i]]; s[0] += i % W; s[1] += Math.floor(i / W); s[2]++; }
  const label = sum.map(([x, y, n], p) => { const cx = Math.floor(x / n), cy = Math.floor(y / n), c = of[cy * W + cx] === p ? cy * W + cx : seeds[p]; return [(c % W) * CELL + 5, Math.floor(c / W) * CELL + 5]; });
  const size = sum.map((s) => s[2]), { of: owner, homes, lands } = realmsOf(recipe, P, adj, over, coast, label, size, seed);

  const names = dice(`${seed}/names`), name = namer(names), code = coder(), cultures = recipe.cultures, factions = recipe.factions || [], minors = recipe.minors?.length ? recipe.minors : ["*"];
  const realms = homes.map((h, k) => {
    // a lesser country shares the culture of the nearest faction's home
    let culture = Math.min(factions[k]?.culture || 0, cultures.length - 1);
    if (!factions[k] && factions.length) { let best = 1 << 30; factions.forEach((f, j) => { if (j >= homes.length) return; const dx = label[h][0] - label[homes[j]][0], dy = label[h][1] - label[homes[j]][1], d = dx * dx + dy * dy; if (d < best) { best = d; culture = Math.min(f.culture || 0, cultures.length - 1); } }); }
    else if (!factions[k]) culture = names(cultures.length);
    const core = name(cultures[culture]), form = factions[k]?.name || pick(minors, names);
    return { code: code(core), name: form.replace("*", core), home: "", culture, faction: factions[k] ? k : -1, size: lands[k].length };
  });
  const ids = Array(P);
  lands.forEach((list, k) => list.slice().sort((a, b) => a - b).forEach((p, n) => { ids[p] = `${realms[k].code}-${n + 1}`; }));
  realms.forEach((r, k) => { r.home = ids[homes[k]]; });
  const provinces = ids.map((id, p) => ({ id, name: name(cultures[realms[owner[p]].culture]), country: realms[owner[p]].code, members: [id], label: label[p], rings: rings[p] }));
  const byId = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1);
  return {
    source: "An invented world, made by Capo's own generator from a seed. Own work.", width: W * CELL, height: H * CELL, view: [50, 50, 100],
    countries: Object.fromEntries(realms.map((r) => [r.code, r.name])), provinces,
    neighbours: [...pairs].map((k) => [ids[Math.floor(k / P)], ids[k % P]].sort()).sort(byId),
    sea: sea.map(([a, b, d]) => [...[ids[a], ids[b]].sort(), d * 30]).sort(byId), arcs, realms,
  };
}
