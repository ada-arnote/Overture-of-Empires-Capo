// SPDX-License-Identifier: AGPL-3.0-or-later
// Motion and sound for the table games: what each game's events look like as they happen, played over the board.
// The rules have already moved when this is called, and the board already shows where things stand: nothing here waits for an
// animation, holds up a move or changes a position. With motion reduced (the setting, or the system's wish) nothing moves;
// with the sound off nothing sounds. The camera follows a rival's move only while the player has not moved the map lately.
import { build, capture, createMotion, dice, pennants, pulse, sweep, travel } from "../src/map/motion.js";
import { settings } from "./shell.js";
import { voice } from "./sound.js";

let layer = null, touched = -1e9, fight = null, glide = null, RGB = [], ICONS = []; // the seats' colours and emblems, as the table dressed them
const PALE = [206, 196, 170], GOODS = [[226, 196, 96], [176, 208, 216], [196, 120, 82], [228, 226, 214]];
const still = () => document.documentElement.classList.contains("still");
const rgbOf = (s) => (s >= 0 && RGB[s]) || PALE;

/** Will motion play for a move? Not with motion reduced, not behind the title, not when bots are hurried or set to instant. */
export function moving(T, person = T.human?.()) {
  if (still() || T.demo || T.hurry || T.catching) return false;
  if (!person && settings.speed === "instant") return false;
  return !!T.board?.moving;
}
const pace = (person) => (!person && settings.speed === "fast" ? 0.6 : 1);
function ready() {
  if (layer) return layer;
  layer = createMotion();
  // the player's own hand on the map (a drag, a wheel, a zoom button, a map key) stops the camera following for a while
  const mine = () => { touched = performance.now(); glide = null; };
  addEventListener("wheel", mine, { capture: true, passive: true });
  addEventListener("pointerdown", (e) => { if (e.target?.closest?.("#stage, .zoom")) mine(); }, true);
  addEventListener("keydown", (e) => { if (/^(Arrow\w+|\+|-|=|0)$/.test(e.key) && !e.target?.closest?.("input, textarea, select")) mine(); }, true);
  return layer;
}
/** Frame gaps while motion played (ms): for checking smoothness on a slow phone. */
export const frames = () => layer?.frames() || null;

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

/** Dice thrown on the table: from one place, landing at points beside another. sets: [{ faces, rgb, lose }]; land(set, i) -> point. Returns the time they take to settle. */
export function throwDice(T, from, sets, land, { person = T.human?.(), hold = -1 } = {}) {
  if (!moving(T, person)) return 0;
  const b = T.board.moving, size = (p) => Math.max(12, Math.min(26, p.r * 0.4)), f = pace(person), roll = Math.round(640 * f);
  const solid = b.solid, linger = solid && hold >= 0 ? 220 : Math.round(1100 * f);
  const s = size(land(0, 0));
  ready().add(dice(sets.map((x, j) => ({ ...x, from: () => from(), land: x.faces.map((_, i) => () => land(j, i)) })), { roll, linger, size: s }));
  // the dice that lie on the table as models wait until the thrown ones come down on their places
  if (solid && hold >= 0) queueMicrotask(() => b.hold([hold], roll, ["model"]));
  return roll;
}

/** Banners: a fight's dice from the attacker to the dice's place beside the defender (where the board lays them as models). */
export function bannersDice(T, e, tieBoth) {
  const b = T.board?.moving;
  RGB = T.RGB || RGB;
  if (!b) return false;
  const [A, D] = e.rolls[e.rolls.length - 1], lose = (mine, theirs, tie) => mine.map((n, i) => i < theirs.length && (n < theirs[i] || (n === theirs[i] && tie)));
  const sets = [{ faces: A, rgb: rgbOf(e.seat), lose: lose(A, D, true) }, { faces: D, rgb: rgbOf(e.was), lose: lose(D, A, tieBoth) }];
  return throwDice(T, () => b.place(e.from), sets, (k, i) => b.place(e.to, (i - 1) * 0.5 + k * 0.2, 0.95 + k * 0.5), { hold: e.to }) > 0;
}

const PLANS = {
  banners(T, events, move, b, where, f, person) {
    const p = T.match.position;
    let focus = -1;
    for (const e of events) {
      if (e.kind === "fight") {
        fight = e; focus = e.to;
        if (!e.won) continue;
        const go = Math.round(360 * f), ms = Math.round(440 * f);
        layer.add(travel(where, e.from, e.to, { rgb: rgbOf(e.seat), label: p.str[e.to], ms }), go);
        queueMicrotask(() => b.hold([e.to], go + ms, ["army"]));
        layer.add(capture(where, e.to, { rgb: rgbOf(e.seat), icon: ICONS[e.seat] ?? -1 }), go + ms - 40);
      } else if (e.kind === "move" || (e.kind === "occupy" && fight?.to === e.to)) {
        const from = e.kind === "move" ? e.from : fight.from, ms = Math.round(420 * f);
        layer.add(travel(where, from, e.to, { rgb: rgbOf(e.seat), label: e.kind === "occupy" && move?.n !== undefined ? move.n : e.n, ms })); // what moves in, not the total
        queueMicrotask(() => b.hold([e.to], ms, ["army"]));
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
    } else if (move?.do === "raise") {
      layer.add(took?.was >= 0 ? capture(where, to, { rgb: rgbOf(took.seat), icon: ICONS[took.seat] ?? -1, ms: 560 }) : build(where, to, { rgb: rgbOf(p.owner[to]), small: true, ms: 520 }));
    } else if (move?.do === "fort" || move?.do === "farm") layer.add(build(where, to, {}));
    for (const e of events) if (e.kind === "starve") for (const c of e.cells) layer.add(pulse(where, c, { rgb: [70, 62, 56], out: true, ms: 520 }));
    if (!person) follow(b, to);
  },
  glass(T, events, move, b, where, f, person) {
    let wait = 0, focus = -1;
    for (const e of events) {
      if (e.kind === "roll") {
        // two dice come in from the near edge of the board and settle in its middle, then the yielding hexes answer
        const v = () => b.middle, rgb = rgbOf(e.seat);
        wait = throwDice(T, () => ({ x: v().x - v().w * 0.18, y: v().y + v().h * 0.36, r: 40 }), [{ faces: e.dice, rgb }], (_, i) => ({ x: v().x + (i ? 22 : -22), y: v().y + (i ? 6 : -4), r: 50 }), { person });
      } else if (e.kind === "harvest") e.hexes.forEach((at, i) => layer.add(build(where, at, { rgb: GOODS[T.match.position.good[at]] || [230, 210, 150], small: true, ms: 640 }), wait + 80 + i * 60));
      else if (["depot", "town", "harbour"].includes(e.kind)) { layer.add(build(where, e.at, { rgb: rgbOf(e.seat) })); focus = e.at; }
      else if (e.kind === "route") { layer.add(pulse(where, e.at, { rgb: rgbOf(e.seat), out: true, ms: 420 })); focus = e.at; }
    }
    if (!person) follow(b, focus);
  },
  inch(T, events) {
    if (events.some((e) => e.kind === "age")) layer.add(sweep());
  },
};

/** After a move is shown: its sound, then its motion. G.key names the game; move is what was played; person: the seat to move was a person's. */
export function stir(T, key, events, move, person, speed, icons = ICONS) {
  RGB = T.RGB || RGB; ICONS = icons;
  const go = moving(T, person);
  if (!T.demo && !T.hurry && speed === "normal") voice(key, events, move, T.match.position, go);
  if (!go || !PLANS[key]) return;
  ready();
  const b = T.board.moving;
  try { PLANS[key](T, events, move, b, (i, dx, dy) => b.place(i, dx, dy), pace(person), person); } catch (e) { console.warn("A moment of motion was skipped:", e); }
}

/** The end: pennants fall across the winner's card, in the winners' colours. Nothing with motion reduced, or for a loss. */
export function hail(box, colours) {
  if (still() || !colours.length || !box) return;
  box.style.position = "relative"; box.style.overflow = "hidden";
  const own = createMotion(box);
  own.add({ ...pennants(colours, () => ({ x: 0, y: 0, w: box.clientWidth, h: box.clientHeight })), end: () => setTimeout(() => own.destroy(), 50) });
  box.querySelector(".arms")?.animate?.([{ transform: "scale(.6) rotate(-8deg)", opacity: 0 }, { transform: "scale(1.08)", opacity: 1, offset: 0.6 }, { transform: "none", opacity: 1 }], { duration: 620, easing: "ease-out" });
}
