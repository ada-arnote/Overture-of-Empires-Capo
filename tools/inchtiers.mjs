// SPDX-License-Identifier: AGPL-3.0-or-later
// How hard Inch's rivals are, measured with scripted players on Traditional's default game (the world, 20 nations), and how fair
// the inks are with bots on every seat. Played on the rules alone, seeded, so the same command always gives the same numbers.
//   node tools/inchtiers.mjs players [--games 100] [--tiers gentle,even,hard] [--who newcomer,regular] [--map world] [--workers 16]
//   node tools/inchtiers.mjs inks [--games 300] [--maps world,continents,islands] [--rivals even] [--workers 16]
// Players:
//   newcomer  follows the five tips and little else: acts every 3 to 4 seconds, sends only when its strength is above half its limit,
//             40% (the slider as it starts) into empty land, else 50% at the neighbour showing the least strength, one time in four
//             at any neighbour instead; boats when no land is in reach; takes the first mark and card offered, at once.
//   steady    a newcomer after a lost game: every 2 to 3 seconds; answers the largest attack on it when it can match it; else, above
//             two fifths of its limit, 50% into empty land, or 50% at the neighbour with the least strength for its land when it holds
//             twice that neighbour's strength (or is nearly full); boats when walled in.
//   regular   the cold review's "dumb but sound" policy: every 2 seconds, 70% into empty land, else 60% at the neighbour with the
//             least strength for its land, boats when walled in, Broad stroke.
// Inks: seat 0 is a bot too (it starts on its dealt place and the rules are told it is nobody's), every nation has a drawn ink.
// A row passes when every ink's share of the wins is between half and one and a half times its share of the nations.
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { pathToFileURL } from "node:url";
import { chance, seedState } from "../src/core/index.js";
import { inch, liveBoardFor } from "../src/games/inch/rules.js";
import { INKS, NONE, PCTS, RIVALS, bordersOf, landings, landingPrice, maxOf, liveMoves } from "../src/games/inch/live.js";

const roll = (text) => chance(seedState(text));
const apply = (p, m, dice) => inch.apply(p, m, dice).position;

/** A scripted player's next order, or null to let the clock run. `d` is its own dice. */
const PLAYERS = {
  newcomer: { every: (d) => 6 + d.below(3), act(p, b, d) {
    const h = p.human, near = bordersOf(p, b)[h], rivals = [...near].filter((o) => o !== NONE);
    if (p.troops[h] * 2 < maxOf(p, h)) return null;
    if (near.has(NONE)) return { do: "attack", to: NONE, pct: 40 };
    if (rivals.length) {
      const to = d.below(4) ? rivals.reduce((x, y) => (p.troops[y] < p.troops[x] ? y : x)) : d.pick(rivals);
      return { do: "attack", to, pct: 50 };
    }
    return boat(p, b, 50);
  } },
  regular: { every: () => 4, act(p, b) {
    const h = p.human, near = bordersOf(p, b)[h], rivals = [...near].filter((o) => o !== NONE);
    if (near.has(NONE)) return { do: "attack", to: NONE, pct: 70 };
    if (rivals.length) return { do: "attack", to: rivals.reduce((x, y) => (p.troops[y] * Math.max(1, p.land[x]) < p.troops[x] * Math.max(1, p.land[y]) ? y : x)), pct: 60 };
    return boat(p, b, 70);
  } },
  steady: { every: (d) => 4 + d.below(2), act(p, b) {
    const h = p.human, near = bordersOf(p, b)[h], rivals = [...near].filter((o) => o !== NONE), have = p.troops[h], top = maxOf(p, h);
    const hit = p.attacks.filter((a) => a.to === h && rivals.includes(a.by)).sort((x, y) => y.left - x.left)[0];
    if (hit && have * 2 > hit.left) return { do: "attack", to: hit.by, pct: PCTS.find((x) => (have * x) / 100 >= hit.left) || 100 };
    if (have * 10 < top * 4) return null;
    if (near.has(NONE)) return { do: "attack", to: NONE, pct: 50 };
    if (rivals.length) {
      const weak = rivals.reduce((x, y) => (p.troops[y] * Math.max(1, p.land[x]) < p.troops[x] * Math.max(1, p.land[y]) ? y : x));
      if (have > 2 * p.troops[weak] || have * 10 >= top * 9) return { do: "attack", to: weak, pct: 50 };
      return null;
    }
    return boat(p, b, 50);
  } },
};
/** The cheapest coast a share can land on, or null. */
function boat(p, b, pct) {
  if (!p.boats) return null;
  const have = Math.floor((p.troops[p.human] * pct) / 100);
  let best = null;
  for (const at of landings(p, b)) { const need = landingPrice(p, b, at) + 1; if (need <= have && (!best || need < best.need)) best = { at, need }; }
  return best ? { do: "boat", at: best.at, pct } : null;
}

/** One game for a scripted player. Returns whether it won, when it ended or went out, and how it stood at 30 and 60 seconds. */
export function playOne({ who, rivals, map = "world", i }) {
  const seed = `tiers ${who} ${rivals} ${map} ${i}`, rules = roll(`rules/${seed}`), mine = roll(`player/${seed}`), P = PLAYERS[who];
  let p = inch.setup({ ...defaults(), style: "classic", rivals, map }, roll(`setup/${seed}`));
  const b = liveBoardFor(p), list = liveMoves(p, b), at = list.find((m) => m.at === p.starts[0]) ? p.starts[0] : list[0].at;
  p = apply(p, { do: "spawn", at, ink: INKS[p.ink[0]].id }, rules);
  const h = p.human, out = { won: false, end: 0, outAt: -1, land30: 0, open30: false, land60: 0, alive60: false, lost: 0, best: 0, attacked: -1 };
  let wait = P.every(mine);
  while (!p.over) {
    if (p.alive[h] && --wait <= 0) {
      wait = P.every(mine);
      const due = liveMoves(p, b).find((m) => m.do === "mark" || m.do === "card"), m = due || P.act(p, b, mine);
      if (m && inch.allows(p, m)) p = apply(p, m, rules);
    }
    const was = p.land[h];
    p = apply(p, { do: "tick", n: 1 }, rules);
    if (p.land[h] < was) out.lost += was - p.land[h];
    if (out.attacked < 0 && p.attacks.some((a) => a.to === h)) out.attacked = p.tick;
    out.best = Math.max(out.best, p.land[h]);
    if (p.tick === 60) { out.land30 = p.land[h]; out.open30 = bordersOf(p, b)[h].has(NONE); }
    if (p.tick === 120) { out.land60 = p.land[h]; out.alive60 = !!p.alive[h]; }
    if (out.outAt < 0 && !p.alive[h]) out.outAt = p.tick;
  }
  out.won = p.over.winners[0] === h;
  out.end = p.tick;
  return out;
}
const defaults = () => Object.fromEntries(Object.entries(inch.options).map(([k, o]) => [k, o.normal]));

/** One bots-only game: which ink won. */
export function inkGame({ map, rivals, i, nations = 20 }) {
  const seed = `inks ${map} ${rivals} ${i}`, rules = roll(`rules/${seed}`);
  let p = inch.setup({ ...defaults(), style: "custom", live: true, inks: "drawn", nations, rivals, map }, roll(`setup/${seed}`));
  const b = liveBoardFor(p), list = liveMoves(p, b), at = list.find((m) => m.at === p.starts[0]) ? p.starts[0] : list[0].at;
  p = { ...apply(p, { do: "spawn", at }, rules), human: -1 }; // the rules then play seat 0 as one more bot
  while (!p.over) p = apply(p, { do: "tick", n: 4 }, rules);
  return { ink: p.ink[p.over.winners[0]], inks: p.ink, end: p.tick, why: p.over.why };
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const clock = (t) => `${Math.floor(t / 120)}:${String(Math.floor((t / 2) % 60)).padStart(2, "0")}`;
const pc = (n, d) => `${Math.round((100 * n) / Math.max(1, d))}%`;

async function pool(jobs, workers) {
  const out = Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, () => new Promise((done, fail) => {
    const w = new Worker(new URL(import.meta.url));
    const give = () => { if (next < jobs.length) { const k = next++; w.once("message", (r) => { out[k] = r; give(); }); w.postMessage(jobs[k]); } else { w.terminate(); done(); } };
    w.on("error", fail);
    give();
  })));
  return out;
}

// --tune '{"gentle":{"grow":9}}' tries other numbers for a tier without changing the rules file
const tune = (t) => { for (const [k, v] of Object.entries(t || {})) Object.assign(RIVALS[k], v); };
if (!isMainThread) parentPort.on("message", (job) => { tune(job.tune); parentPort.postMessage(job.kind === "inks" ? inkGame(job) : playOne(job)); });
else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2), arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d), mode = argv[0] || "players";
  const games = Number(arg("--games", mode === "inks" ? 300 : 100)), workers = Number(arg("--workers", Math.max(1, Math.floor(availableParallelism() / 2)))), t0 = Date.now(), tuned = JSON.parse(arg("--tune", "{}"));
  if (mode === "players") {
    const tiers = arg("--tiers", "gentle,even,hard").split(","), whos = arg("--who", "newcomer,regular").split(","), map = arg("--map", "world");
    console.log(`| Player | Rivals | Games | Won | Median end (won) | Out | Median out | Alive at 1:00 | Land at 0:30 | Empty land beside at 0:30 | First attacked (median) | Lost any land |`);
    console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const who of whos) for (const rivals of tiers) {
      const rs = await pool(Array.from({ length: games }, (_, i) => ({ who, rivals, map, i, tune: tuned })), workers), won = rs.filter((r) => r.won), outs = rs.filter((r) => r.outAt >= 0), hit = rs.filter((r) => r.attacked >= 0);
      console.log(`| ${who} | ${rivals} | ${games} | ${pc(won.length, games)} | ${won.length ? clock(median(won.map((r) => r.end))) : "-"} | ${pc(outs.length, games)} | ${outs.length ? clock(median(outs.map((r) => r.outAt))) : "-"} | ${pc(rs.filter((r) => r.alive60).length, games)} | ${median(rs.map((r) => r.land30))} | ${pc(rs.filter((r) => r.open30).length, games)} | ${hit.length ? clock(median(hit.map((r) => r.attacked))) : "-"} | ${pc(rs.filter((r) => r.lost > 0).length, games)} |`);
    }
  } else {
    const maps = arg("--maps", "world,continents,islands").split(","), rivals = arg("--rivals", "even");
    for (const map of maps) {
      const rs = await pool(Array.from({ length: games }, (_, i) => ({ kind: "inks", map, rivals, i, tune: tuned })), workers), held = INKS.map(() => 0), wins = INKS.map(() => 0), seats = rs.reduce((n, r) => n + r.inks.length, 0);
      for (const r of rs) { r.inks.forEach((k) => { held[k]++; }); wins[r.ink]++; }
      const ratio = INKS.map((_, k) => (wins[k] / games) / (held[k] / seats)), bad = ratio.filter((x) => x < 0.5 || x > 1.5).length;
      console.log(`${map}, ${rivals}, ${games} games, median ${clock(median(rs.map((r) => r.end)))}: ${INKS.map((k, j) => `${k.id} ${ratio[j].toFixed(2)}`).join(", ")}; range ${Math.min(...ratio).toFixed(2)} to ${Math.max(...ratio).toFixed(2)}${bad ? `, ${bad} OUTSIDE 0.5 to 1.5` : ", all inside 0.5 to 1.5"}`);
    }
  }
  console.error(`${Math.round((Date.now() - t0) / 1000)} s`);
}
