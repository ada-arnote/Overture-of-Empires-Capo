// SPDX-License-Identifier: AGPL-3.0-or-later
// Are plans worth buying in Grain and Glass? Bots that aim for a plan whenever their next build is two goods or more
// away play bots that do not, on Traditional. Each seed is played both ways round (the seekers on the even seats, then
// on the odd ones), so every seat is tried both ways. Plans are worth their price when the seekers win about their share.
// node tools/plans.mjs                 2 to 6 seats, 300 seeds each, so 600 games a seat count
// node tools/plans.mjs --seats 4 --games 1000 --workers 8
// Seeded "plans glass <seats> <n>", so the same command always gives the same table.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { createMatch, chance, seedState } from "../src/core/index.js";
import { glass } from "../src/games/glass/rules.js";
import { choose, trial } from "../src/games/glass/bot.js";

/** One seed at one seat count, both ways round. */
function both(seats, i) {
  const out = { games: 0, seek: 0, plain: 0, ties: 0, seekPlans: 0, plainPlans: 0, warden: 0 };
  for (const way of [0, 1]) {
    const seed = `plans glass ${seats} ${i}`, seekers = Array.from({ length: seats }, (_, s) => s).filter((s) => s % 2 === way);
    let p = createMatch(glass, { seed, options: { style: "classic", seats } }).position;
    const rules = chance(seedState("plans rules/" + seed)), bots = chance(seedState("plans bots/" + seed));
    for (let n = 0; p.over === null; n++) {
      if (n > 20000) throw new Error(`no end: ${seed}`);
      trial.seek = seekers;
      const m = structuredClone(choose(p, bots, "normal"));
      trial.seek = [];
      if (m.do === "plan") out[seekers.includes(p.seat) ? "seekPlans" : "plainPlans"]++;
      p = glass.apply(p, m, rules).position;
    }
    const w = p.over.winners;
    out.games++;
    if (p.warden !== -1) out.warden++;
    if (w.length > 1) out.ties++; else out[seekers.includes(w[0]) ? "seek" : "plain"]++;
  }
  return out;
}

if (!isMainThread) {
  const { seats, from, step, games } = workerData, sum = {};
  for (let i = from; i <= games; i += step) for (const [k, v] of Object.entries(both(seats, i))) sum[k] = (sum[k] || 0) + v;
  parentPort.postMessage(sum);
} else {
  const argv = process.argv.slice(2), arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
  const seatList = (arg("--seats") || "2,3,4,5,6").split(",").map(Number), games = Number(arg("--games") || 300), workers = Number(arg("--workers") || Math.max(1, availableParallelism() - 1));
  console.log("| Seats | Games | Plan seekers won | Others won | Ties | Seekers' share, % | Plans drawn a game, seekers / others | Toll Warden won, % of games |\n|---|---|---|---|---|---|---|---|");
  for (const seats of seatList) {
    const parts = await Promise.all(Array.from({ length: Math.min(workers, games) }, (_, k) => new Promise((ok, fail) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { seats, from: 1 + k, step: Math.min(workers, games), games } });
      w.on("message", ok);
      w.on("error", fail);
    })));
    const s = {};
    for (const part of parts) for (const [k, v] of Object.entries(part)) s[k] = (s[k] || 0) + v;
    console.log(`| ${seats} | ${s.games} | ${s.seek} | ${s.plain} | ${s.ties} | ${((100 * s.seek) / Math.max(1, s.seek + s.plain)).toFixed(1)} | ${(s.seekPlans / s.games).toFixed(1)} / ${(s.plainPlans / s.games).toFixed(1)} | ${((100 * s.warden) / s.games).toFixed(1)} |`);
  }
}
