// SPDX-License-Identifier: AGPL-3.0-or-later
// Plays many games between bots and prints the pass lines. node tools/play.mjs inch [games] [seats] [--only name] [--from n]
import { createMatch, chance, seedState, openSave } from "../src/core/index.js";
import { inch, cellsOf } from "../src/games/inch/rules.js";
import { choose } from "../src/games/inch/bot.js";

const GAMES = { inch: { game: inch, choose, score: cellsOf } };

export function playOne(g, { seed, seats, tiers, check = false }) {
  const m = createMatch(g.game, { seed, options: { seats } }), dice = chance(seedState("bots/" + seed)), lead = [];
  let turns = 0, idle = 0, round = 0, cut = 0, homes = 0;
  while (m.turn !== null) {
    const p = m.position;
    if (p.round !== round) {
      round = p.round;
      const n = Array.from({ length: seats }, (_, s) => g.score(p, s)), top = Math.max(...n);
      lead[round] = n.filter((x) => x === top).length === 1 ? n.indexOf(top) : -1;
    }
    const events = m.play(g.choose(p, dice, tiers[p.seat]));
    turns++;
    for (const e of events) { if (e.kind === "wait") idle++; if (e.kind === "cut") cut += e.cells.length; if (e.kind === "home") homes++; }
  }
  if (check && openSave(m.save(), [g.game]).match.fingerprint() !== m.fingerprint()) throw new Error("replay differed: " + seed);
  return { ...m.result, rounds: round, half: lead[Math.ceil((round + 1) / 2)] ?? -1, turns, idle, cut, homes };
}

/** Many games. The tiers are given by seat; seat numbers are already shuffled over the board's corners. */
export function series(g, { games, seats, tiers, check, from = 1 }) {
  const wins = Array(seats).fill(0), rounds = [], why = {};
  let ties = 0, mid = 0, midWon = 0, turns = 0, idle = 0, cut = 0, homes = 0;
  for (let i = from; i < from + games; i++) {
    const r = playOne(g, { seed: "series " + i, seats, tiers, check });
    if (r.winners.length > 1) ties++; else wins[r.winners[0]]++;
    if (r.half >= 0 && r.winners.length === 1) { mid++; if (r.half === r.winners[0]) midWon++; }
    why[r.why] = (why[r.why] || 0) + 1;
    rounds.push(r.rounds); turns += r.turns; idle += r.idle; cut += r.cut; homes += r.homes;
  }
  rounds.sort((a, b) => a - b);
  const pc = (x, n = games) => Math.round((1000 * x) / Math.max(1, n)) / 10;
  return { wins: wins.map((w) => pc(w)), ties: pc(ties), why: Object.fromEntries(Object.entries(why).map(([k, v]) => [k, pc(v)])), rounds: [0.1, 0.5, 0.9].map((q) => rounds[Math.floor(q * (games - 1))]), midpoint: pc(midWon, mid), idle: pc(idle, turns), cut: cut / games, homes: homes / games };
}

if (process.argv[1]?.endsWith("play.mjs")) {
  const [, , name, games = "200", seats = "2"] = process.argv, g = GAMES[name], n = Number(seats), N = Number(games), only = process.argv.indexOf("--only") > 0 ? process.argv[process.argv.indexOf("--only") + 1] : "";
  const from = process.argv.indexOf("--from") > 0 ? Number(process.argv[process.argv.indexOf("--from") + 1]) : 1;
  const fill = (a, b) => [a, ...Array(n - 1).fill(b)], last = (a, b) => [...Array(n - 1).fill(b), a];
  const plans = { bots: fill("normal", "normal"), "normal first v random": fill("normal", "random"), "normal last v random": last("normal", "random"), "normal first v easy": fill("normal", "easy"), "normal last v easy": last("normal", "easy") };
  for (const [k, tiers] of Object.entries(plans)) {
    if (only && k !== only) continue;
    const t = process.hrtime.bigint(), r = series(g, { games: N, seats: n, tiers, check: k === "bots", from });
    console.log(`${k} | wins ${r.wins.join(" / ")} | ties ${r.ties} | rounds ${r.rounds.join(", ")} | midpoint ${r.midpoint} | idle ${r.idle} | cut ${r.cut.toFixed(2)} | homes ${r.homes.toFixed(2)} | ${JSON.stringify(r.why)} | ${Number((process.hrtime.bigint() - t) / 1000000000n)} s`);
  }
}
