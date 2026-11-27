// SPDX-License-Identifier: AGPL-3.0-or-later
// Motion and sound for the table games: what each game's events look like as they happen, played over the board.
// The rules have already moved when this is called, and the panel already shows where things stand: nothing here holds up a
// person's move or changes a position. The board may wait to recolour a cell until the dice that took it have landed (the
// person can act meanwhile), and a bot waits for the moment to be told (stageLeft) before its next move. With motion reduced
// (the setting, or the system's wish) nothing moves; with the sound off nothing sounds. The camera follows a rival's move only
// while the player has not moved the map lately.
import { build, capture, chip, createMotion, dice, fly, pennants, pulse, raid, sweep, tally, travel } from "../src/map/motion.js";
import { settings } from "./shell.js";
import { voice } from "./sound.js";

let layer = null, touched = -1e9, fight = null, glide = null, RGB = [], ICONS = []; // the seats' colours and emblems, as the table dressed them
let ends = 0, run = null, walkIn = 0, gate = { m: null, at: -1 }; // p12: when the moment being told is over; the fight being thrown, and when its army walks in; where the toll gate stood
const PALE = [206, 196, 170], GOODS = [[226, 196, 96], [176, 208, 216], [196, 120, 82], [228, 226, 214]], GOLD = [226, 184, 92];
const still = () => document.documentElement.classList.contains("still");
const rgbOf = (s) => (s >= 0 && RGB[s]) || PALE;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k;
const mark = (ms) => { ends = Math.max(ends, performance.now() + ms); };
/** Dice as big as the free part of the board allows: a share of its shorter side, within bounds. */
const big = (b, k, lo, hi) => clamp(Math.min(b.middle.w, b.middle.h) * k, lo, hi);

/** Will motion play for a move? Not with motion reduced, not behind the title, not when bots are hurried or set to instant. */
export function moving(T, person = T.human?.()) {
  if (still() || T.demo || T.hurry || T.catching) return false;
  if (!person && settings.speed === "instant") return false;
  return !!T.board?.moving;
}
const pace = (person) => (!person && settings.speed === "fast" ? 0.6 : 1);
function ready() {
  if (layer) return layer;
  layer = createMotion(document.body, { z: 2 });
  // the player's own hand on the map (a drag, a wheel, a zoom button, a map key) stops the camera following for a while
  const mine = () => { touched = performance.now(); glide = null; };
  addEventListener("wheel", mine, { capture: true, passive: true });
  addEventListener("pointerdown", (e) => { if (e.target?.closest?.("#stage, .zoom")) mine(); }, true);
  addEventListener("keydown", (e) => { if (/^(Arrow\w+|\+|-|=|0)$/.test(e.key) && !e.target?.closest?.("input, textarea, select")) mine(); }, true);
  return layer;
}
/** Frame gaps while motion played (ms): for checking smoothness on a slow phone. */
export const frames = () => layer?.frames() || null;
/** How long the moment on the board still needs to be told, in ms: a bot at normal speed waits this long before its next move. */
export const stageLeft = () => Math.max(0, ends - performance.now());

/**
 * The camera drifts to a rival's move, gently, if that place is out of the comfortable middle of the view; never while the
 * player is touching the map or has moved it in the last few seconds, and never at the whole-board zoom.
 */
function follow(b, at) {
  if (at < 0 || performance.now() - touched < 6000 || !b.zoomed) return;
  const v = b.middle, p = b.place(at);
  if (Math.abs(p.x - v.x) < v.w * 0.3 && Math.abs(p.y - v.y) < v.h * 0.3) return;
  const mine = glide = { at, t: performance.now() };
  layer.add({ ms: 1100, draw(c, k, now) {
    if (glide !== mine) return;
    const q = b.place(at), dx = v.x - q.x, dy = v.y - q.y, dt = Math.min(50, now - mine.t);
    mine.t = now;
    if (Math.hypot(dx, dy) < 2) { glide = null; return; }
    const f = 1 - Math.exp(-dt / 160);
    b.nudge(dx * f, dy * f);
  } });
}

/**
 * Dice thrown on the table: from one place, landing at points beside another. sets: [{ faces, rgb, lose }]; land(set, i) -> point.
 * size: a die's side in pixels; total: the number held under them. Returns the time they take to settle.
 */
export function throwDice(T, from, sets, land, { person = T.human?.(), hold = -1, size = 22, total = null, roll = 640, linger = 1100 } = {}) {
  if (!moving(T, person)) return 0;
  const b = T.board.moving, f = pace(person), r = Math.round(roll * f);
  ready().add(dice(sets.map((x, j) => ({ ...x, from: () => from(), land: x.faces.map((_, i) => () => land(j, i)) })), { roll: r, linger: Math.round(linger * f), size, total }));
  // the dice that lie on the table as models wait until the thrown ones are gone
  if (b.solid && hold >= 0) queueMicrotask(() => b.hold([hold], r + linger * f, ["model"]));
  return r;
}

/** Each throw's losses, [attacker, defender], made to add up to what the fight cost each side (a leader, fort or capital can shift a die). */
function losses(e, tieBoth) {
  const per = e.rolls.map(([A, D]) => { let a = 0, d = 0; for (let i = 0; i < Math.min(A.length, D.length); i++) { if (A[i] > D[i]) d++; else { a++; if (A[i] === D[i] && tieBoth) d++; } } return [a, d]; });
  for (const [k, sum] of [[0, e.lost.attacker], [1, e.lost.defender]]) {
    let left = sum;
    per.forEach((x, j) => { x[k] = j === per.length - 1 ? Math.max(0, left) : Math.min(x[k], Math.max(0, left)); left -= x[k]; });
  }
  return per;
}

/**
 * Banners: a fight thrown on the table, every throw of it (the last eight of a long one), as a quick run: big dice between the
 * two provinces, the losers dimmed, each side's strength counting down as its losses fall, the last throw held for a beat.
 * The capture follows (PLANS.banners). Returns whether it plays; the panel's own dice show it either way.
 */
export function bannersDice(T, e, tieBoth) {
  const b = T.board?.moving, person = T.human?.();
  RGB = T.RGB || RGB;
  run = null;
  if (!b || !moving(T, person)) return false;
  ready().drop("fight");
  b.release?.();
  const f = pace(person), p = T.match.position, per = losses(e, tieBoth), n = e.rolls.length, first = Math.max(0, n - 8), m = n - first;
  const aRgb = rgbOf(e.seat), dRgb = rgbOf(e.was), S = big(b, 0.075, 30, 58);
  let a = p.str[e.from] + e.lost.attacker + (e.won ? 1 : 0), d = e.won ? e.lost.defender : p.str[e.to] + e.lost.defender;
  for (let j = 0; j < first; j++) { a -= per[j][0]; d -= per[j][1]; }
  const a0 = a, d0 = d, roll0 = 620 * f, step = m > 1 ? clamp(2600 / m, 330, 560) * f : 0, rollK = Math.min(step * 0.7, 340 * f);
  const start = (j) => (j ? roll0 + 160 * f + (j - 1) * step : 0), landAt = (j) => start(j) + (j ? rollK : roll0), E = landAt(m - 1);
  const mid = () => { const x = b.place(e.from), y = b.place(e.to), v = b.middle; return { x: clamp(lerp(x.x, y.x, 0.62), v.x - v.w / 2 + S * 2.2, v.x + v.w / 2 - S * 2.2), y: clamp(lerp(x.y, y.y, 0.62) - S * 1.1, v.y - v.h / 2 + S * 1.6, v.y + v.h / 2 - S * 1.6) }; };
  const lay = (k, cnt) => (_, i) => () => { const c = mid(); return { x: c.x + (i - (cnt - 1) / 2) * S * 1.18, y: c.y + (k ? 0.62 : -0.62) * S }; };
  const lose = (mine, theirs, tie) => mine.map((v, i) => i < theirs.length && (v < theirs[i] || (v === theirs[i] && tie)));
  const above = (cell) => () => { const q = b.place(cell); return { x: q.x, y: q.y - clamp(q.r * 0.36, 11, 22) * 1.9 }; };
  const go = E + 250 * f, tail = e.won ? go : E + 600 * f, aSteps = [], dSteps = [], times = [];
  for (let j = 0; j < m; j++) {
    const [A, D] = e.rolls[first + j], [la, ld] = per[first + j], last = j === m - 1, t0 = start(j), t1 = landAt(j);
    const fx = dice([{ from: () => b.place(e.from), land: A.map(lay(0, A.length)), faces: A, rgb: aRgb, lose: lose(A, D, true) }, { from: () => b.place(e.to), land: D.map(lay(1, D.length)), faces: D, rgb: dRgb, lose: lose(D, A, tieBoth) }],
      { roll: t1 - t0, linger: last ? 1000 * f : Math.max(60, start(j + 1) - t1), size: S, fadeMs: last ? 260 : 60, total: last && e.won ? { text: "Taken" } : null });
    fx.tag = "fight";
    layer.add(fx, t0);
    times.push(t0 / 1000);
    a -= la; d -= ld;
    if (la) { aSteps.push([t1, a]); layer.add(Object.assign(chip(above(e.from), { text: `−${la}`, red: true, ms: 900 }), { tag: "fight" }), t1); }
    if (ld) { dSteps.push([t1, d]); layer.add(Object.assign(chip(above(e.to), { text: `−${ld}`, red: true, ms: 900 }), { tag: "fight" }), t1); }
  }
  // the strength on each side, counting down, stands in for the board's own counters until the run is over
  layer.add(Object.assign(tally((i) => b.place(i), e.from, { rgb: aRgb, start: a0, steps: aSteps, ms: tail }), { tag: "fight" }));
  layer.add(Object.assign(tally((i) => b.place(i), e.to, { rgb: dRgb, start: d0, steps: dSteps, ms: tail }), { tag: "fight" }));
  queueMicrotask(() => { b.hold([e.from], tail, ["army"]); b.hold([e.to], e.won ? go + 440 * f : tail, ["army"]); if (b.solid) b.hold([e.to], E + 1000 * f, ["model"]); });
  run = { to: e.to, go, times, f };
  mark(e.won ? go + 440 * f + 500 : tail + 300); // a capture holds the game half a second more before a bot moves on
  return true;
}

/** A seat's card on the screen (the score cards), or the top of the board when it is folded away. side: a point beside it, for a chip. */
function card(b, s, side = false) {
  return () => {
    const li = document.querySelectorAll("#seats > li")[s], r = li?.getBoundingClientRect();
    if (!r || !r.width) { const v = b.middle; return { x: v.x, y: v.y - v.h * 0.42 }; }
    if (!side) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    return r.right < innerWidth * 0.4 && r.height > 40 ? { x: r.right + 46, y: r.top + r.height / 2 } : { x: r.left + r.width / 2, y: r.bottom + 22 };
  };
}
/** The card answers when goods reach it: a short glow. */
function glow(s) {
  document.querySelectorAll("#seats > li")[s]?.animate?.([{ boxShadow: "0 0 0 0 rgba(255,226,150,0)" }, { boxShadow: "0 0 0 5px rgba(255,226,150,.9)", offset: 0.3 }, { boxShadow: "0 0 0 0 rgba(255,226,150,0)" }], { duration: 650, easing: "ease-out" });
}

const PLANS = {
  banners(T, events, move, b, where, f, person, told) {
    const p = T.match.position;
    let focus = -1;
    for (const e of events) {
      if (e.kind === "fight") {
        fight = e; focus = e.to;
        const staged = run?.to === e.to ? run : null;
        if (staged) told.at.throws = staged.times;
        if (!e.won) continue;
        const go = staged ? staged.go : Math.round(360 * f), ms = Math.round(440 * f);
        layer.add(Object.assign(travel(where, e.from, e.to, { rgb: rgbOf(e.seat), label: p.str[e.to], ms }), { tag: "fight" }), go);
        if (!staged) queueMicrotask(() => b.hold([e.to], go + ms, ["army"]));
        layer.add(Object.assign(capture(where, e.to, { rgb: rgbOf(e.seat), icon: ICONS[e.seat] ?? -1, ms: 900 }), { tag: "fight" }), go + ms - 40);
        told.at.capture = (go + ms) / 1000;
        walkIn = performance.now() + go + ms;
        if (staged) told.after = go + ms - 40; // the province takes its new colour as the army walks in, not before the dice land
      } else if (e.kind === "move" || (e.kind === "occupy" && fight?.to === e.to)) {
        const from = e.kind === "move" ? e.from : fight.from, ms = Math.round(420 * f), wait = e.kind === "occupy" ? Math.round(Math.max(0, walkIn - performance.now())) : 0;
        layer.add(travel(where, from, e.to, { rgb: rgbOf(e.seat), label: e.kind === "occupy" && move?.n !== undefined ? move.n : e.n, ms }), wait); // what moves in, not the total
        queueMicrotask(() => b.hold([e.to], wait + ms, ["army"]));
        focus = e.to;
      } else if (e.kind === "place" || e.kind === "claim") { layer.add(pulse(where, e.at, { rgb: rgbOf(e.seat) })); } // placing is followed by the camera only when it comes to a fight
      else if (e.kind === "fort") { layer.add(build(where, e.at, {})); focus = e.at; }
    }
    if (!person) follow(b, focus);
  },
  fable(T, events, move, b, where, f, person) {
    const p = T.match.position, to = move?.to ?? -1;
    const took = events.find((e) => e.kind === "take" && e.at === to);
    if (move?.do === "move" && move.from >= 0) {
      const ms = Math.round((move.sea ? 520 : 320) * f);
      layer.add(travel(where, move.from, to, { rgb: rgbOf(p.owner[to]), label: p.unit[to], kind: "unit", ms }));
      queueMicrotask(() => b.hold([to], ms, ["unit"]));
      if (took) layer.add(took.was >= 0 ? capture(where, to, { rgb: rgbOf(took.seat), icon: ICONS[took.seat] ?? -1, ms: 560 }) : pulse(where, to, { rgb: rgbOf(took.seat), out: true }), ms - 30);
      mark(ms + (took ? 300 : 0));
    } else if (move?.do === "raise") {
      layer.add(took?.was >= 0 ? capture(where, to, { rgb: rgbOf(took.seat), icon: ICONS[took.seat] ?? -1, ms: 560 }) : build(where, to, { rgb: rgbOf(p.owner[to]), small: true, ms: 520 }));
    } else if (move?.do === "fort" || move?.do === "farm") layer.add(build(where, to, {}));
    for (const e of events) if (e.kind === "starve") for (const c of e.cells) layer.add(pulse(where, c, { rgb: [70, 62, 56], out: true, ms: 520 }));
    if (!person) follow(b, to);
  },
  glass(T, events, move, b, where, f, person, told) {
    const p = T.match.position, hint = T.motionHints || {}, tile = hint.tile || GOODS, names = hint.goods || [];
    const sum = (g, sign) => g.flatMap((v, k) => (v ? [`${sign}${v}${names[k] ? ` ${names[k]}` : ""}`] : [])).join(" ");
    let wait = 0, focus = -1;
    for (const e of events) {
      if (e.kind === "roll") {
        // two big dice come in from the near edge of the board, settle in its middle and hold the number thrown; a raid darkens the edges
        const v = () => b.middle, S = big(b, 0.11, 52, 84);
        wait = throwDice(T, () => ({ x: v().x - v().w * 0.2, y: v().y + v().h * 0.42, r: 40 }), [{ faces: e.dice, rgb: rgbOf(e.seat) }], (_, i) => ({ x: v().x + (i ? 0.62 : -0.62) * S, y: v().y + (i ? 0.08 : -0.06) * S, r: 50 }),
          { person, size: S, roll: 700, linger: 1100, total: { text: String(e.n), sub: e.raid ? "raid" : "", red: e.raid } });
        if (e.raid) { layer.add(raid({ ms: Math.round(1300 * f) }), wait); told.at.raid = wait / 1000; }
        mark(wait + 900 * f);
      } else if (e.kind === "harvest") {
        e.hexes.forEach((at, i) => layer.add(build(where, at, { rgb: tile[p.good[at]] || [230, 210, 150], small: true, ms: 640 }), wait + 80 + i * 60));
        // goods fly from each yielding hex to the cards of the players who gather them (one crate a hex and player, with its count)
        const near = hint.near, flights = [];
        if (near) for (const at of e.hexes) {
          const by = new Map();
          for (const c of [at, ...near(at)]) if (p.depot[c] >= 0) by.set(p.depot[c], (by.get(p.depot[c]) || 0) + (p.town[c] ? 2 : 1));
          for (const [s, k] of by) flights.push({ at, s, k });
        }
        const ms = Math.round(760 * f), last = new Map();
        flights.slice(0, 16).forEach((x, i) => {
          const t = wait + 320 * f + i * 80 * f;
          layer.add(fly(() => where(x.at), card(b, x.s), { rgb: tile[p.good[x.at]] || GOLD, label: x.k > 1 ? x.k : "", size: clamp(big(b, 0.022, 11, 17), 11, 17), ms, end: () => glow(x.s) }), t);
          last.set(x.s, t + ms);
        });
        for (const [s, t] of last) if (e.got[s]?.some((n) => n)) layer.add(chip(card(b, s, true), { text: sum(e.got[s], "+"), rgb: GOLD, ms: 1500 }), t - 60);
        if (flights.length) { told.at.gather = (wait + 320 * f + ms) / 1000; mark(wait + 320 * f + ms + Math.min(15, flights.length) * 80 * f); }
      } else if (e.kind === "toll") {
        // the gate is carried to its new hex, then the good it takes passes from one player's card to the other's
        const was = gate.m === T.match && gate.at >= 0 && gate.at !== e.at ? gate.at : -1, ms = Math.round(700 * f), r = () => clamp(where(e.at).r * 0.32, 10, 20);
        const from = was >= 0 ? () => where(was) : () => { const q = where(e.at); return { x: q.x, y: q.y - 140 }; };
        layer.add(fly(from, () => where(e.at), { rgb: PALE, kind: "gate", size: r(), ms }));
        queueMicrotask(() => b.hold([e.at], ms, ["gate"]));
        layer.add(pulse(where, e.at, { rgb: [192, 57, 43], out: true, ms: 520 }), ms - 40);
        focus = e.at;
        if (e.from >= 0 && e.good >= 0) {
          const t = ms + 140 * f, long = Math.round(950 * f), name = names[e.good] ? ` ${names[e.good]}` : "";
          layer.add(chip(card(b, e.from, true), { text: `−1${name}`, red: true, ms: 1500 }), t);
          layer.add(fly(card(b, e.from), card(b, e.seat), { rgb: tile[e.good] || GOLD, size: 16, ms: long, end: () => glow(e.seat) }), t);
          layer.add(chip(card(b, e.seat, true), { text: `+1${name}`, rgb: GOLD, ms: 1500 }), t + long - 60);
          told.at.steal = t / 1000;
          mark(t + long + 400);
        } else mark(ms + 300);
      } else if (e.kind === "spoil") {
        const name = names[e.good] ? ` ${names[e.good]}` : "";
        layer.add(chip(card(b, e.seat, true), { text: `−1${name}`, red: true, ms: 1100 }));
      } else if (["depot", "town", "harbour"].includes(e.kind)) { layer.add(build(where, e.at, { rgb: rgbOf(e.seat) })); focus = e.at; }
      else if (e.kind === "route") { layer.add(pulse(where, e.at, { rgb: rgbOf(e.seat), out: true, ms: 420 })); focus = e.at; }
    }
    if (!person) follow(b, focus);
  },
  inch(T, events) {
    if (events.some((e) => e.kind === "age")) layer.add(sweep());
  },
};

/**
 * After a move is shown: its motion, then its sound (timed to the motion). G.key names the game; move is what was played;
 * person: the seat to move was a person's. Returns how long the board may wait before recolouring what the move took (ms).
 */
export function stir(T, key, events, move, person, speed, icons = ICONS) {
  RGB = T.RGB || RGB; ICONS = icons;
  const go = moving(T, person), told = { after: 0, at: {} };
  if (go && PLANS[key]) {
    ready();
    const b = T.board.moving;
    try { PLANS[key](T, events, move, b, (i, dx, dy) => b.place(i, dx, dy), pace(person), person, told); } catch (e) { console.warn("A moment of motion was skipped:", e); }
  }
  if (!T.demo && !T.hurry && speed === "normal") voice(key, events, move, T.match.position, go, told.at);
  if (key === "glass") gate = { m: T.match, at: T.match.position.gate ?? -1 };
  run = null;
  return told.after;
}

/** The end: pennants fall across the winner's card, in the winners' colours. Nothing with motion reduced, or for a loss. */
export function hail(box, colours) {
  if (still() || !colours.length || !box) return;
  box.style.position = "relative"; box.style.overflow = "hidden";
  const own = createMotion(box);
  own.add({ ...pennants(colours, () => ({ x: 0, y: 0, w: box.clientWidth, h: box.clientHeight })), end: () => setTimeout(() => own.destroy(), 50) });
  box.querySelector(".arms")?.animate?.([{ transform: "scale(.6) rotate(-8deg)", opacity: 0 }, { transform: "scale(1.08)", opacity: 1, offset: 0.6 }, { transform: "none", opacity: 1 }], { duration: 620, easing: "ease-out" });
}
