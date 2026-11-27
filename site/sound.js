// SPDX-License-Identifier: AGPL-3.0-or-later
// The table games' cues, made here with the Web Audio API as they are needed: no sound files. Short and quiet, under the
// player's sound switch and volume (site/shell.js), and silent until a press has woken them.
import { audio, settings } from "./shell.js";

const last = new Map();
/** One voice: a tone that swells and dies away, gliding to `to` hertz if given. */
function tone(a, bus, hz, at, len, peak, wave = "sine", to = 0) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = wave; o.frequency.setValueAtTime(hz, at); if (to) o.frequency.exponentialRampToValueAtTime(to, at + len);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(bus); o.start(at); o.stop(at + len + 0.05);
}
/** A short burst of noise through a filter: a die on wood, a drum skin, a knock. */
function noise(a, bus, at, len, hz, q, peak, type = "bandpass") {
  const n = Math.max(1, Math.floor(a.sampleRate * len)), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0), src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
  f.type = type; f.frequency.value = hz; f.Q.value = q; g.gain.value = peak;
  src.buffer = buf; src.connect(f).connect(g).connect(bus); src.start(at);
}
// Each cue: (context, bus, start). Kept well under a second, and under the volume of the turn chime.
export const CUES = {
  dice: (a, b, t) => { [0, 0.07, 0.15, 0.24, 0.36, 0.5].forEach((at, i) => noise(a, b, t + at + Math.random() * 0.02, 0.04, 1400 + Math.random() * 1800, 3.5, 0.9 - i * 0.12)); noise(a, b, t, 0.06, 300, 1, 0.5, "lowpass"); },
  march: (a, b, t) => [0, 0.14, 0.28].forEach((at, i) => { tone(a, b, 120, t + at, 0.16, 0.32 - i * 0.06, "triangle", 70); noise(a, b, t + at, 0.05, 500, 0.8, 0.35, "lowpass"); }),
  capture: (a, b, t) => { tone(a, b, 110, t, 0.3, 0.55, "triangle", 62); tone(a, b, 196, t + 0.05, 0.38, 0.16, "triangle"); tone(a, b, 294, t + 0.09, 0.42, 0.12, "triangle"); },
  build: (a, b, t) => { noise(a, b, t, 0.03, 760, 6, 1.2); noise(a, b, t + 0.1, 0.03, 680, 6, 1); tone(a, b, 1047, t + 0.19, 0.55, 0.1); tone(a, b, 1568, t + 0.19, 0.4, 0.04); },
  attacked: (a, b, t) => { tone(a, b, 330, t, 0.22, 0.2, "triangle"); tone(a, b, 247, t + 0.15, 0.34, 0.2, "triangle"); },
  finished: (a, b, t) => { for (const [hz, p] of [[196, 0.22], [392, 0.1], [588, 0.05]]) tone(a, b, hz, t, 1, p); },
  truce: (a, b, t) => { tone(a, b, 523, t, 0.4, 0.14); tone(a, b, 784, t + 0.13, 0.55, 0.12); },
  truceEnd: (a, b, t) => { tone(a, b, 784, t, 0.4, 0.12); tone(a, b, 523, t + 0.13, 0.55, 0.12); },
  age: (a, b, t) => { [392, 494, 587, 784].forEach((hz, i) => tone(a, b, hz, t + i * 0.05, 1.5, i === 3 ? 0.04 : 0.09)); },
  out: (a, b, t) => { tone(a, b, 220, t, 0.7, 0.24, "triangle", 140); tone(a, b, 110, t + 0.05, 0.8, 0.14); },
  // p12: a second throw in a run is a shorter rattle; a raid is a drum and a falling horn; a theft a swish and a clink; goods arriving a soft knock
  rethrow: (a, b, t) => { [0, 0.06, 0.14].forEach((at, i) => noise(a, b, t + at + Math.random() * 0.015, 0.035, 1500 + Math.random() * 1500, 3.5, 0.7 - i * 0.15)); },
  raid: (a, b, t) => { [0, 0.11, 0.2].forEach((at, i) => { noise(a, b, t + at, 0.12, 140, 0.9, 0.9 - i * 0.2, "lowpass"); tone(a, b, 82, t + at, 0.2, 0.3 - i * 0.07, "triangle", 55); }); tone(a, b, 330, t + 0.3, 0.6, 0.12, "sawtooth", 220); },
  steal: (a, b, t) => { noise(a, b, t, 0.22, 2400, 0.7, 0.35, "highpass"); tone(a, b, 1568, t + 0.24, 0.25, 0.09); tone(a, b, 2093, t + 0.29, 0.3, 0.05); },
  gather: (a, b, t) => { noise(a, b, t, 0.03, 900, 5, 0.8); tone(a, b, 880, t + 0.02, 0.25, 0.06); tone(a, b, 1320, t + 0.08, 0.3, 0.04); },
};
/** How long a cue waits before it may sound again, so a busy moment is not a din. */
const GAP = { dice: 0.25, march: 0.35, capture: 0.3, build: 0.3, attacked: 1.5, finished: 0.5, truce: 0.5, truceEnd: 0.5, age: 2, out: 2, rethrow: 0.2, raid: 1, steal: 0.5, gather: 0.3 };

/** Play a cue `later` seconds from now. */
export function play(name, later = 0) {
  const a = audio();
  if (!a || !CUES[name]) return;
  const t = a.currentTime + 0.01 + later;
  if (t - (last.get(name) ?? -9) < GAP[name]) return;
  last.set(name, t);
  try {
    const bus = a.createGain();
    bus.gain.value = 0.5 * (settings.volume / 100) ** 2;
    bus.connect(a.destination);
    CUES[name](a, bus, t);
  } catch { /* a sound is never needed to play */ }
}

/**
 * The cues a move makes, by game and by what happened in it. moving: motion is shown, so a capture waits for the piece to arrive.
 * at: when the motion puts each moment, in seconds (throws: a run of throws; capture, gather, steal, raid), so the sound lands with it.
 * Returns the names played, for tests and checks.
 */
export function cuesOf(key, events, move, p, at = {}) {
  const out = [], add = (n, when = 0) => out.push([n, when]), has = (k) => events.some((e) => e.kind === k);
  const me = p?.human;
  if (key === "banners") {
    if (has("fight")) { add("dice"); for (const t of at.throws?.slice(1) || []) add("rethrow", t); }
    if (has("take")) add("capture", at.capture ?? 0.75);
    if (has("move") || has("occupy")) add("march");
    if (has("fort")) add("build");
  } else if (key === "fable") {
    if (move?.do === "move") add("march");
    if (events.some((e) => e.kind === "take" && e.was >= 0)) add("capture", move?.do === "move" ? 0.3 : 0);
    if (has("fort") || has("farm")) add("build");
  } else if (key === "glass") {
    if (has("roll")) add("dice");
    if (events.some((e) => e.kind === "roll" && e.raid)) add("raid", at.raid ?? 0.6);
    if (events.some((e) => e.kind === "harvest" && e.got?.some((g) => g.some((v) => v)))) add("gather", at.gather ?? 0.9);
    if (events.some((e) => e.kind === "toll" && e.from >= 0)) add("steal", at.steal ?? 0.1);
    if (events.some((e) => ["depot", "town", "harbour", "route"].includes(e.kind))) add("build");
  } else if (key === "inch") {
    if (p?.live) {
      if (events.some((e) => e.kind === "attack" && e.seat === me)) add("march");
      if (events.some((e) => e.kind === "city" && e.seat === me)) add("build");
      if (events.some((e) => e.to === me && e.kind === "attacked")) add("attacked");
      if (events.some((e) => e.kind === "out" && e.by === me && e.seat !== me)) add("finished");
      if (has("pact")) add("truce");
      if (has("pactend")) add("truceEnd");
      if (has("age")) add("age");
      if (events.some((e) => e.kind === "out" && e.seat === me) && !has("end")) add("out");
    } else {
      if (has("pour")) add("march");
      if (events.some((e) => e.kind === "pour" && e.taken?.length)) add("capture", 0.2);
    }
  }
  return out;
}
export function voice(key, events, move, p, moving, at = {}) {
  for (const [n, when] of cuesOf(key, events, move, p, moving ? at : {})) play(n, moving ? when : Math.min(when, 0.15));
}
