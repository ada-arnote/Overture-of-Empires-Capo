// SPDX-License-Identifier: AGPL-3.0-or-later
// The seat table: bots against bots, many games for every game, rule set (Traditional, Capo) and seat count the rules
// offer, and how often each seat wins. A seat count passes when its best and worst seats are within 10 points.
// Real-time Inch has one player and many nations, so there the table is by spawn slot (the order nations are placed in);
// slot 0 is the player, played by the bot that only lets the clock run, and is left out of the spread.
// node tools/fair.mjs                       every game, 1,000 games a seat count, on every core but one
// node tools/fair.mjs fable glass --games 200 --style ours --seats 2,3 --workers 8 --out table.md
// node tools/fair.mjs fable --style classic --seats 6 --part 2/3 --json b.json   one third of a row, to add up later with
// node tools/fair.mjs --merge a.json b.json c.json --out table.md
// Exit code 1 when any spread is over 10 points. Games are played on the rules alone (as test/fixtures/bots.js `direct`
// does), seeded "fair <game> <rules> <seats> <n>", so the same command always gives the same table.
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createMatch, chance, seedState } from "../src/core/index.js";
import { banners } from "../src/games/banners/rules.js";
import { choose as bannersBot } from "../src/games/banners/bot.js";
import { fable } from "../src/games/fable/rules.js";
import { choose as fableBot } from "../src/games/fable/bot.js";
import { glass } from "../src/games/glass/rules.js";
import { choose as glassBot } from "../src/games/glass/bot.js";
import { inch } from "../src/games/inch/rules.js";
import { choose as inchBot } from "../src/games/inch/bot.js";
import { margins } from "../src/games/margins/rules.js"; // margins hook: early and unlisted, but measured like the others
import { choose as marginsBot } from "../src/games/margins/bot.js";

export const GAMES = { banners: [banners, bannersBot], fable: [fable, fableBot], glass: [glass, glassBot], inch: [inch, inchBot], margins: [margins, marginsBot] };
export const STYLES = { classic: "Traditional", ours: "Capo" };
export const LINE = 10; // points between the best and worst seat
const CAP = 20000, CHUNK = 20;

/** One game, bots on every seat. Returns the winners, its length (rounds, or ticks in real time) and why it ended. */
export function playOne(name, style, seats, i) {
  const [game, choose] = GAMES[name], seed = `fair ${name} ${style} ${seats} ${i}`;
  let p = createMatch(game, { seed, options: { style, seats } }).position;
  const rules = chance(seedState("fair rules/" + seed)), bots = chance(seedState("bots/" + seed));
  for (let n = 0; game.turn(p) !== null; n++) {
    if (n > CAP) throw new Error(`no end after ${CAP} moves: ${seed}`);
    p = game.apply(p, structuredClone(choose(p, bots, "normal")), rules).position;
  }
  const r = game.result(p);
  return { winners: r.winners, length: p.live ? p.tick : p.round, why: r.why };
}

/** A run of games: wins by seat, ties, lengths, reasons, and the time it took. */
export function run({ name, style, seats, from, count, slots }) {
  const t = process.hrtime.bigint(), wins = Array(slots).fill(0), lengths = [], why = {};
  let ties = 0;
  for (let i = from; i < from + count; i++) {
    const r = playOne(name, style, seats, i);
    if (r.winners.length > 1) ties++; else wins[r.winners[0]]++;
    lengths.push(r.length);
    why[r.why] = (why[r.why] || 0) + 1;
  }
  return { wins, ties, lengths, why, ms: Number((process.hrtime.bigint() - t) / 1000000n) };
}

/** The rows to play: each rule set and seat count the rules offer, or one row of slots for a real-time game. */
export function plan(names, { styles = Object.keys(STYLES), seats = null } = {}) {
  const rows = [];
  for (const name of names) {
    const [game] = GAMES[name], offered = game.options.seats.values;
    for (const style of styles.filter((s) => game.options.style.values.includes(s))) {
      const probe = createMatch(game, { seed: "probe", options: { style, seats: offered[0] } }).position;
      if (probe.live) rows.push({ name, style, seats: offered[0], slots: probe.troops.length, live: true });
      else for (const n of offered.filter((x) => !seats || seats.includes(x))) rows.push({ name, style, seats: n, slots: n, live: false });
    }
  }
  return rows;
}

/** Plays every row over a pool of workers and adds up the parts. */
export async function table(rows, { games = 1000, workers = Math.max(1, availableParallelism() - 1), part = [1, 1], each = () => {} } = {}) {
  // part [k, n]: only every nth run of games, from the kth, so that one long row can be shared out over several machines
  const jobs = rows.flatMap((row, k) => Array.from({ length: Math.ceil(games / CHUNK) }, (_, c) => ({ k, ...row, from: 1 + c * CHUNK, count: Math.min(CHUNK, games - c * CHUNK) })).filter((_, c) => c % part[1] === part[0] - 1));
  const sums = rows.map((row, k) => { const mine = jobs.filter((j) => j.k === k); return { ...row, games: mine.reduce((s, j) => s + j.count, 0), wins: Array(row.slots).fill(0), ties: 0, lengths: [], why: {}, ms: 0, left: mine.length }; });
  if (jobs.length) await new Promise((done, fail) => {
    let next = 0, open = 0;
    const give = (w) => { if (next < jobs.length) { open++; w.postMessage(jobs[next++]); } else w.terminate(); };
    for (let n = 0; n < Math.min(workers, jobs.length); n++) {
      const w = new Worker(new URL(import.meta.url));
      w.on("message", ({ k, r }) => {
        const s = sums[k];
        r.wins.forEach((x, i) => { s.wins[i] += x; });
        Object.assign(s, { ties: s.ties + r.ties, ms: s.ms + r.ms, left: s.left - 1 });
        s.lengths.push(...r.lengths);
        for (const [y, c] of Object.entries(r.why)) s.why[y] = (s.why[y] || 0) + c;
        if (!s.left) each(sums[k]);
        if (!--open && next >= jobs.length) done();
        give(w);
      });
      w.on("error", fail);
      give(w);
    }
  });
  return sums.filter((s) => s.games).map(judge);
}

/** Parts played apart (--json from each --part), added up into one table. */
export function merge(parts) {
  const by = new Map();
  for (const r of parts) {
    const k = `${r.name}|${r.style}|${r.seats}`, s = by.get(k) || by.set(k, { ...r, games: 0, wins: r.wins.map(() => 0), ties: 0, lengths: [], why: {}, ms: 0 }).get(k);
    r.wins.forEach((x, i) => { s.wins[i] += x; });
    Object.assign(s, { games: s.games + r.games, ties: s.ties + r.ties, ms: s.ms + r.ms });
    s.lengths.push(...r.lengths);
    for (const [y, c] of Object.entries(r.why)) s.why[y] = (s.why[y] || 0) + c;
  }
  return [...by.values()].map(judge);
}

/** Shares, the spread between best and worst seat, and its 95% margin for sampling error. */
export function judge(s) {
  const pc = (x) => (100 * x) / s.games, share = s.wins.map(pc), counted = s.live ? share.slice(1) : share;
  const hi = Math.max(...counted), lo = Math.min(...counted), a = hi / 100, b = lo / 100;
  const margin = 196 * Math.sqrt(Math.max(0, a + b - (a - b) ** 2) / s.games), spread = hi - lo, sorted = [...s.lengths].sort((x, y) => x - y);
  const verdict = spread <= LINE ? (spread + margin > LINE ? "pass, near the line" : "pass") : spread - margin > LINE ? "FAIL" : "FAIL, within sampling error";
  return { ...s, share, spread, margin, median: sorted[Math.floor(sorted.length / 2)], verdict, pass: spread <= LINE };
}

const one = (x) => x.toFixed(1);
export function markdown(rows) {
  const out = ["| Game | Rules | Seats | Games | Wins by seat, % | Ties, % | Spread, points | 95% margin | Median length | CPU s | Verdict |", "|---|---|---|---|---|---|---|---|---|---|---|"];
  for (const r of rows) {
    const wins = r.live ? `player ${one(r.share[0])}; slots 1 to ${r.slots - 1}: ${r.share.slice(1).map(one).join(" / ")}` : r.share.map(one).join(" / ");
    out.push(`| ${r.name} | ${STYLES[r.style]} | ${r.live ? `${r.slots} nations` : r.seats} | ${r.games} | ${wins} | ${one((100 * r.ties) / r.games)} | ${one(r.spread)} | ±${one(r.margin)} | ${r.median} ${r.live ? "ticks" : "rounds"} | ${Math.round(r.ms / 1000)} | ${r.verdict} |`);
  }
  return out.join("\n");
}

if (!isMainThread) parentPort.on("message", (job) => parentPort.postMessage({ k: job.k, r: run(job) }));
else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2), arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null), t = Date.now();
  const names = argv.filter((a, i) => GAMES[a] && !String(argv[i - 1]).startsWith("--")), games = Number(arg("--games") || 1000);
  const rows = plan(names.length ? names : Object.keys(GAMES), { styles: arg("--style") ? [arg("--style")] : undefined, seats: arg("--seats") ? arg("--seats").split(",").map(Number) : null });
  const part = (arg("--part") || "1/1").split("/").map(Number), each = (r) => console.error(`${r.name} ${r.style} ${r.live ? "slots" : r.seats}: ${Math.round(r.ms / 1000)} CPU s`);
  const done = argv.includes("--merge") ? merge(argv.filter((a) => a.endsWith(".json") && a !== arg("--json")).flatMap((f) => JSON.parse(readFileSync(f, "utf8")))) : await table(rows, { games, part, workers: Number(arg("--workers") || 0) || undefined, each });
  const text = `${markdown(done)}\n\n${done.filter((r) => !r.pass).length} of ${done.length} over the ${LINE}-point line. Wall time ${Math.round((Date.now() - t) / 1000)} s.`;
  console.log(text);
  if (arg("--out")) writeFileSync(arg("--out"), text + "\n");
  if (arg("--json")) writeFileSync(arg("--json"), JSON.stringify(done.map(({ share, spread, margin, median, verdict, pass, left, ...r }) => r)));
  process.exitCode = done.every((r) => r.pass) ? 0 : 1;
}
