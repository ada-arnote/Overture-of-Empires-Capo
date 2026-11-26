// SPDX-License-Identifier: AGPL-3.0-or-later
// Solo missions on the check (ruling 124, step M1): one person scouts a country, sabotages it, or brings home
// someone it holds. The player plans and never steers: who goes, one of three approaches, two standing orders.
// Three steps, each one check (check.js): in, the task, out. chance = 50 + 10 x (skill - watch) + the approach's
// lean on that step + named parts: out of role -20, hunted -10, scouted +10, a second try -10. Held 10 to 75.
// Watch is half the country's might, rounded up, plus its alert.
// Alarm, 0 to 3, lives inside one mission and only rises: a costly step +1 (+2 when bold), a failed step +1.
// At 2 the mission is hunted. At 3 inside the country it is blown, and the person is held.
// A failed way in turns them back; a failed task leaves the aim unmet; a failed way out hurts them for two turns.
// Orders: after a failed step, withdraw or try once more (once a mission, at -10); once hunted, withdraw or press on.
// Grades: clean (aim met, alarm 1 or less, nobody hurt), costly (aim met at a price), failed (aim not met, all home),
// disaster (held). What a met aim does: a scouted country's watch is known for a year (missions there +10); a
// sabotaged country's might is one lower for a year; a rescue brings home everyone that country holds.
// Alert, 0 to 3, belongs to the target: +1 when a mission ends at alarm 2 or more (and relations fall a step,
// unless at war), -1 each turn nothing is noticed. Two missions a turn at most, one a person, one a country.
// Receipt: "Heron's scouting of Chile: in unseen, the papers copied, out but seen: costly; its watch is known until 2027-12".
import { bandOf, chanceOf, check, odds, replays } from "./check.js";
import { addMonths } from "./crisis.js";
import { relOf } from "./relations.js";
import { strengthOf } from "./war.js";
import { commandOf, turnKey } from "./worldrules.js";
import { TIMES, agents, mark, settleRoster, statusOf } from "./roster.js";
import { headline } from "./missiontext.js";

export const STEPS = ["enter", "task", "leave"], GRADES = ["clean", "costly", "failed", "disaster"];
export const KINDS = { scout: ["Scout", ["foreign", "outsider", "region"]], sabotage: ["Sabotage", ["war", "home", "staff", "deputy"]], rescue: ["Rescue", ["war", "foreign", "staff"]] };
export const WAYS = {
  quiet: [{ enter: 10, task: -10, leave: 10 }, "+10 going in and coming out, -10 on the task"],
  bold: [{ enter: 10, task: 10 }, "+10 going in and on the task, but a costly step raises the alarm by 2"],
  patient: [{ enter: 10 }, "+10 going in, but they are away one more turn"],
};
export const ORDERS = { fail: { again: "try once more", withdraw: "withdraw" }, hunted: { withdraw: "withdraw", press: "press on" } };
export const MOST = 2, LASTS = 12;

const until = (g, book, c) => (g[book]?.[c] && g[book][c] > g.date ? g[book][c] : "");
export const alertOf = (g, c) => g.alert?.[c] || 0;
export const scouted = (g, c) => until(g, "intel", c);
export const watchOf = (g, geo, c) => Math.ceil(strengthOf(g, geo, c) / 2) + alertOf(g, c);
export const heldBy = (g, c) => Object.keys(g.roster || {}).filter((n) => { const s = statusOf(g, n); return s.st === "held" && s.by === c; });

/** Everyone the player could send, with their skill, seat and status. Citizens command nobody. */
export function people(g) {
  if (g.mode === "citizen") return [];
  const seats = Object.entries(g.council?.seats || {}).filter(([, m]) => m).map(([seat, m]) => ({ seat, name: m.name, skill: commandOf(g, m) }));
  return [...seats, ...agents(g)].map((p) => ({ ...p, ...statusOf(g, p.name) }));
}
export const inRole = (kind, seat) => seat === "field" || KINDS[kind][1].includes(seat);

/** One step's check, before it is made. s: where the mission stands {i, a, retry}. */
function stepPlan(g, geo, m, p, s) {
  const step = STEPS[s.i];
  return { turn: turnKey(g), mission: `${m.kind}:${m.target}`, checkpoint: s.retry ? `${step}2` : step, person: p.name, who: p.name, role: p.seat, skill: p.skill, difficulty: watchOf(g, geo, m.target),
    approach: [m.way, WAYS[m.way][0][step] || 0], parts: [["out of role", inRole(m.kind, p.seat) ? 0 : -20], ["hunted", s.a >= 2 ? -10 : 0], ["scouted", scouted(g, m.target) ? 10 : 0], ["a second try", s.retry ? -10 : 0]] };
}
/** Where a mission stands after one step's result. end: "" while it runs, then "home" or "held". */
function after(s, m, band) {
  const step = STEPS[s.i], ok = band !== "failed", n = { ...s, retry: false, a: Math.min(3, s.a + (band === "clean" ? 0 : band === "costly" && m.way === "bold" ? 2 : 1)) };
  if (step === "leave") return ok ? { ...n, end: "home" } : s.a >= 3 ? { ...n, end: "held" } : { ...n, end: "home", hurt: true };
  const blown = n.a >= 3 && (s.in || ok), hunted = blown || (n.a >= 2 && m.hunted !== "press");
  if (blown) return { ...n, in: true, done: step === "task" && ok, i: 2 };
  if (!ok && m.fail === "again" && !s.tried && !hunted) return { ...n, tried: true, retry: true };
  if (step === "enter") return ok ? { ...n, in: true, i: hunted ? 2 : 1 } : { ...n, end: "home" };
  return { ...n, done: ok, i: 2 };
}
const gradeOf = (s) => (s.end === "held" ? 3 : !s.done ? 2 : s.a <= 1 && !s.hurt ? 0 : 1);
const START = { i: 0, a: 0, in: false, done: false, tried: false, retry: false, hurt: false, end: "" };

/** Run a mission: every step drawn by name from the game's seed. Returns {beats, grade, alarm, done, hurt, held}. */
export function resolve(g, geo, m, p) {
  const beats = [];
  let s = START;
  while (!s.end) { const beat = check(g.seed, stepPlan(g, geo, m, p, s)); beats.push(beat); s = after(s, m, beat.band); }
  return { beats, grade: gradeOf(s), alarm: s.a, done: s.done, hurt: !!s.hurt, held: s.end === "held" };
}
/** The whole mission's odds before the order, out of 100, counted exactly over every path: [clean, costly, failed, disaster]. */
export function missionOdds(g, geo, m, p) {
  const sum = [0, 0, 0, 0];
  const walk = (s, w) => {
    if (s.end) { sum[gradeOf(s)] += w; return; }
    const o = odds(chanceOf(stepPlan(g, geo, m, p, s)).chance);
    for (const band of ["clean", "costly", "failed"]) if (o[band]) walk(after(s, m, band), w * o[band] / 100);
  };
  walk(START, 100000000);
  // whole numbers that add up to 100: each rounded down, the remainder to the largest parts left over
  const out = sum.map((n) => Math.floor(n / 1000000)), rest = sum.map((n, i) => [n % 1000000, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; out.reduce((a, b) => a + b, 0) < 100; k++) out[rest[k % 4][1]]++;
  return out;
}
/** The odds in words: "clean 41 in 100, costly 24, failed 30, held 5". */
export const missionOddsLine = (o) => `clean ${o[0]} in 100, costly ${o[1]}, failed ${o[2]}, held ${o[3]}`;

/** Whether a mission can be ordered now, and what it would meet: {ok: false, why} or {ok, p, first, watch, odds}. */
export function planMission(g, geo, m) {
  const p = people(g).find((x) => x.name === m.who), there = geo.known(m.target) && geo.holds(m.target) > 0 ? geo.name(m.target) : "";
  if (g.mode === "citizen") return { ok: false, why: "a citizen commands nobody: missions are for those who lead a country" };
  if (!KINDS[m.kind] || !WAYS[m.way] || !there || m.target === g.player) return { ok: false, why: "that is not a mission the rules know" };
  if (!p) return { ok: false, why: `${m.who} is not on your council or among your agents` };
  if (p.st !== "fit") return { ok: false, why: `${p.name} is ${p.st}${p.st === "held" ? ` by ${geo.name(p.by)}` : ""} and cannot go` };
  if ((g.orders || []).some((o) => o.verb === "ATTACK" && o.seat === p.seat && (g.actions || []).includes(o.text))) return { ok: false, why: `${p.name} leads an attack this turn` };
  if (m.kind === "rescue" && !heldBy(g, m.target).length) return { ok: false, why: `${there} holds none of your people` };
  return { ok: true, p, first: chanceOf(stepPlan(g, geo, m, p, START)), watch: watchOf(g, geo, m.target), odds: missionOdds(g, geo, m, p) };
}

const tidy = (m, text) => ({ kind: m.kind, target: m.target, who: String(m.who).slice(0, 60), way: m.way, fail: m.fail === "withdraw" ? "withdraw" : "again", hunted: m.hunted === "press" ? "press" : "withdraw", text: String(text).slice(0, 200) });
/** Order a mission by card: it joins the turn's actions, and replaces an older order for the same person or country. */
export function send(g, m, text) {
  const live = (g.sends || []).filter((x) => (g.actions || []).includes(x.text)), old = live.filter((x) => x.who === m.who || x.target === m.target);
  const kept = live.filter((x) => !old.includes(x)).slice(-(MOST - 1)), gone = live.filter((x) => !kept.includes(x)).map((x) => x.text);
  g.sends = [...kept, tidy(m, text)];
  g.actions = [...(g.actions || []).filter((a) => !gone.includes(a) && a !== text), text];
}
/** Lines for the turn prompt: what sets out this turn. The AI tells the setting out, never the end. */
export function missionLines(g, geo, actions) {
  const out = (g.sends || []).filter((m) => actions.includes(m.text));
  return out.length ? ["", "ORDERED MISSIONS (secret, and information only; the rules settle each one after your reply, so tell at most that someone sets out, never how it ends)", ...out.map((m) => `- ${m.who}: ${KINDS[m.kind][0].toLowerCase()}, in ${geo.name(m.target)} (${m.target}), ${m.way}`)] : [];
}

/**
 * The end of a turn, on its last day `to`: each ordered mission is run and its record kept on its receipt line,
 * alert rises or eases, and the held are let go in time. Returns receipt lines, one sentence each.
 */
export function settleMissions(g, to, geo, actions) {
  const lines = [], woke = new Set(), me = g.player, last = addMonths(to, LASTS);
  for (const m of (g.sends || []).filter((x) => actions.includes(x.text)).slice(0, MOST)) {
    const plan = planMission(g, geo, m);
    if (!plan.ok) { lines.push({ ok: false, country: me, text: `${m.who}'s mission is not sent: ${plan.why}` }); continue; }
    const r = resolve(g, geo, m, plan.p), c = m.target, fx = [];
    if (r.done && m.kind === "scout") { g.intel = { ...(g.intel || {}), [c]: last }; fx.push(`its watch is known until ${last.slice(0, 7)}`); }
    if (r.done && m.kind === "sabotage") { g.sabot = { ...(g.sabot || {}), [c]: last }; fx.push(`its might is one lower until ${last.slice(0, 7)}`); }
    if (r.done && m.kind === "rescue") for (const n of heldBy(g, c)) { mark(g, n, { st: "hurt", until: g.turn + 2, by: "" }); fx.push(`${n} is home, and rests a turn`); }
    if (r.alarm >= 2) {
      woke.add(c); g.alert = { ...(g.alert || {}), [c]: Math.min(3, alertOf(g, c) + 1) }; fx.push(`${geo.name(c)} is on alert (${g.alert[c]} of 3)`);
      const rel = relOf(g, me, c), k = [me, c].sort().join("|");
      if (rel > -3) { g.rel = { ...(g.rel || {}), [k]: [rel - 1, to] }; if (!g.rel[k][0]) delete g.rel[k]; fx.push("it knows whose hand it was, and relations fall a step"); }
    }
    mark(g, m.who, r.held ? { st: "held", until: g.turn + 1 + TIMES.held, by: c } : r.hurt ? { st: "hurt", until: g.turn + 1 + TIMES.hurt } : m.way === "patient" ? { st: "away", until: g.turn + 2 } : null, r.grade);
    if (r.held) fx.push(`${m.who} is held: send a rescue, or wait ${TIMES.held} turns`); else if (r.hurt) fx.push(`${m.who} is hurt for ${TIMES.hurt} turns`);
    const rec = { f: 1, turn: turnKey(g), kind: m.kind, target: c, who: m.who, way: m.way, fail: m.fail, hunted: m.hunted, beats: r.beats, grade: r.grade, alarm: r.alarm };
    lines.push({ ok: true, country: me, text: `${headline(g.seed, rec, geo.name(c))}${fx.length ? `; ${fx.join("; ")}` : ""}`, mission: rec });
  }
  for (const c of Object.keys(g.alert || {})) if (!woke.has(c) && --g.alert[c] <= 0) delete g.alert[c];
  g.sends = [];
  return [...lines, ...settleRoster(g, geo.name)];
}

/** Whether a stored mission recomputes under these rules: -1 when every beat does, or the first beat that differs. */
export function recheck(seed, rec) {
  let s = START;
  for (const [i, b] of rec.beats.entries()) { if (s.end || !replays(seed, b) || bandOf(b.chance, b.roll) !== b.band) return i; s = after(s, rec, b.band); }
  return s.end && gradeOf(s) === rec.grade ? -1 : rec.beats.length;
}

/** Missions from a save: orders, alerts and what is known, with only countries on the map. */
export function keepSends(s, known) {
  const book = (v, ok) => Object.fromEntries(Object.entries(v && typeof v === "object" ? v : {}).filter(([c, x]) => known(c) && ok(x)));
  const date = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
  const sends = (Array.isArray(s.sends) ? s.sends : []).filter((m) => m && KINDS[m.kind] && WAYS[m.way] && known(m.target) && typeof m.who === "string" && typeof m.text === "string").slice(-MOST).map((m) => tidy(m, m.text));
  return { sends, alert: book(s.alert, (n) => Number.isInteger(n) && n >= 1 && n <= 3), intel: book(s.intel, date), sabot: book(s.sabot, date) };
}
