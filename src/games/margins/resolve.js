// SPDX-License-Identifier: AGPL-3.0-or-later
// The season's reveal: every sheet at once, in one pass, with one plain reason for every order.
// Movers always leave 1 behind and support adds 1, so what stays to defend never hangs on another move:
// no cycles, no paradoxes, and the same result whatever order the sheets are read in.
//   1. Each province held has one order: the one written, else hold.
//   2. A land attack is a move by land into a province another seat holds (or nobody does). It cuts a support there,
//      unless it comes from the province the support is aimed at, and it cuts a transport there.
//   3. A move by sea needs a transport, still standing, that names its two ports.
//   4. Two seats moving into each other's provinces by land: the weaker bounces, both when equal.
//   5. At each province, what stays, plus its own seat's arrivals and supports, defends. The strictly strongest
//      arrival (moved strength plus supports) takes it if it beats the defence; the defenders are lost, and the taker
//      loses half of what stood there. Everyone else bounces.
//   6. A bounced move goes home one weaker; if home was taken meanwhile, it is lost.
// Reason codes, for a hold: held, stood, lost. For a move: took, joined, fell, held-off, tie, outdone, swap,
// no-transport. For a support: given, cut, void. For a transport: carried, cut, void.

const key = (a, b) => (a < b ? `${a}>${b}` : `${b}>${a}`);

/**
 * map: { n, near }. owner[i]: a seat or -1. str[i]: strength. sheets[seat]: that seat's orders this season, each
 * { at, kind: "hold" | "move" | "support" | "transport", to, n, seat, a, b }, already legal.
 * Returns { owner, str, results, takes }: results has one entry per province held at the start, in province order.
 */
export function resolve(map, owner, str, sheets) {
  const n = map.n, near = (a, b) => map.near[a].includes(b);
  const results = [];
  for (let at = 0; at < n; at++) {
    if (owner[at] < 0) continue;
    const s = owner[at], o = (sheets[s] || []).find((x) => x.at === at);
    results.push(o ? { ...o, of: s } : { at, kind: "hold", of: s, implicit: true });
  }
  const moves = results.filter((r) => r.kind === "move");
  for (const m of moves) { m.sea = !near(m.at, m.to); m.ok = true; }
  const attacked = Array.from({ length: n }, () => []); // land attacks, by the province they come from
  for (const m of moves) if (!m.sea && owner[m.to] !== m.of) attacked[m.to].push(m.at);

  // transports: the first one standing for a pair of ports, in province order, carries
  const lanes = new Map();
  for (const t of results) if (t.kind === "transport") {
    if (attacked[t.at].length) { t.code = "cut"; t.by = attacked[t.at][0]; continue; }
    if (!lanes.has(key(t.a, t.b))) lanes.set(key(t.a, t.b), t);
  }
  for (const m of moves) {
    if (!m.sea) continue;
    const lane = lanes.get(key(m.at, m.to));
    if (!lane) { m.ok = false; m.code = "no-transport"; const cut = results.find((t) => t.kind === "transport" && t.code === "cut" && key(t.a, t.b) === key(m.at, m.to)); if (cut) m.by = cut.at; continue; }
    lane.used = true;
    (lane.carry ||= []).push(m.at);
  }
  for (const t of results) if (t.kind === "transport" && !t.code) t.code = t.used ? "carried" : "void";

  // supports: cut, given (something stood to be supported) or void
  const sup = new Map();
  for (const s of results) {
    if (s.kind !== "support") continue;
    const by = attacked[s.at].filter((f) => f !== s.to);
    if (by.length) { s.code = "cut"; s.by = by[0]; continue; }
    const holds = owner[s.to] === s.seat, moving = moves.some((m) => m.ok && m.of === s.seat && m.to === s.to);
    if (!holds && !moving) { s.code = "void"; continue; }
    s.code = "given";
    s.hold = holds && !moving;
    sup.set(`${s.to}|${s.seat}`, (sup.get(`${s.to}|${s.seat}`) || 0) + 1);
  }
  const power = (m) => m.n + (sup.get(`${m.to}|${m.of}`) || 0);

  // head to head, by land
  const pair = new Map();
  for (const m of moves) if (m.ok && !m.sea) pair.set(`${m.at}>${m.to}`, m);
  const swap = [];
  for (const m of moves) {
    if (!m.ok || m.sea) continue;
    const r = pair.get(`${m.to}>${m.at}`);
    if (r && r.of !== m.of && power(m) <= power(r)) swap.push([m, r]);
  }
  for (const [m, r] of swap) { m.ok = false; m.code = "swap"; m.with = r.of; m.power = power(m); m.against = power(r); }

  // each province: who stands, who arrives, who takes it
  const out = Array(n).fill(0);
  for (const m of moves) out[m.at] += m.n; // movers have left, whether or not they arrive
  const newOwner = owner.slice(), newStr = str.map((v, i) => v - out[i]), takes = [], stand = Array(n).fill(null);
  for (let t = 0; t < n; t++) {
    const into = moves.filter((m) => m.ok && m.to === t);
    if (!into.length) continue;
    const def = owner[t], stay = str[t] - out[t], tot = new Map(), raw = new Map();
    for (const m of into) { raw.set(m.of, (raw.get(m.of) || 0) + m.n); tot.set(m.of, (tot.get(m.of) || 0) + m.n); }
    for (const s of tot.keys()) tot.set(s, tot.get(s) + (sup.get(`${t}|${s}`) || 0));
    const friendly = def >= 0 ? raw.get(def) || 0 : 0;
    tot.delete(def);
    const defence = stay + friendly + (def >= 0 ? sup.get(`${t}|${def}`) || 0 : 0);
    let best = -1, top = -1, tie = false;
    for (const [s, v] of [...tot].sort((x, y) => x[0] - y[0])) { if (v > top) { top = v; best = s; tie = false; } else if (v === top) tie = true; }
    const won = best >= 0 && !tie && top > defence;
    stand[t] = { defence, top, best: won ? best : -1, attacked: tot.size > 0 };
    if (won) {
      const lost = stay + friendly;
      newOwner[t] = best;
      newStr[t] = Math.max(1, raw.get(best) - Math.floor(lost / 2));
      takes.push({ at: t, seat: best, was: def, n: newStr[t], power: top, against: defence });
    } else newStr[t] = stay + friendly;
    for (const m of into) {
      if (m.of === def) { m.code = won ? "fell" : "joined"; if (won) m.with = best; continue; }
      m.power = tot.get(m.of);
      if (won && m.of === best) { m.code = "took"; m.against = defence; m.was = def; continue; }
      m.ok = false;
      const over = [...tot].find(([s, v]) => s !== m.of && v > m.power);
      if (over) { m.code = "outdone"; m.with = over[0]; m.against = over[1]; } else if (tie && m.power === top) { m.code = "tie"; m.with = [...tot].find(([s, v]) => s !== m.of && v === top)[0]; m.against = top; } else { m.code = "held-off"; m.against = defence; }
    }
  }
  // bounced moves go home one weaker, unless home was taken
  for (const m of moves) {
    if (m.ok) continue;
    if (newOwner[m.at] === m.of) { m.back = m.n - 1; newStr[m.at] += m.n - 1; } else { m.back = 0; m.gone = true; }
  }
  // holds: untouched, stood against an attack, or lost
  for (const r of results) {
    const taken = newOwner[r.at] !== owner[r.at];
    if (taken) r.lostTo = newOwner[r.at];
    if (r.kind !== "hold") continue;
    const st = stand[r.at];
    if (taken) { r.code = "lost"; r.with = newOwner[r.at]; r.power = st.top; r.against = st.defence; } else if (st?.attacked) { r.code = "stood"; r.power = st.top; r.against = st.defence; } else r.code = "held";
  }
  for (const r of results) { delete r.ok; delete r.used; if (r.sea === false) delete r.sea; for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k]; }
  for (let i = 0; i < n; i++) if (newOwner[i] < 0) newStr[i] = 0;
  return { owner: newOwner, str: newStr, results, takes };
}
