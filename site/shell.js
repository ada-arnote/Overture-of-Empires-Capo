// SPDX-License-Identifier: AGPL-3.0-or-later
// What the table games' screen keeps for the player: settings, sounds made in code, and the order of places at the end.
// No page is touched when this is loaded, so its plain parts are tested in Node (test/shell.test.mjs).

export const SETTINGS_KEY = "capo-settings";
export const CHOICES = {
  sound: [["on", "On"], ["off", "Off"]],
  speed: [["normal", "Normal"], ["fast", "Fast"], ["instant", "Instant"]],
  motion: [["system", "Follow the system"], ["reduced", "Reduced"], ["full", "Full"]],
  patterns: [["off", "Off"], ["on", "On"]],
  text: [["normal", "Normal"], ["large", "Large"], ["larger", "Larger"]],
  keys: [["on", "On"], ["off", "Off"]],
};
// seat patterns are on unless a player turns them off (accessibility): settings kept before they were (no `v`) do not carry the old "off"
export const DEFAULTS = { sound: "on", volume: 60, speed: "normal", motion: "system", patterns: "on", text: "normal", keys: "on" }, SETTINGS_V = 2;
/** How long bots wait, as a share of their usual pace; and how much bigger the words are. Normal is unhurried, so each bot action can be followed (p12). */
export const PACE = { normal: 1.6, fast: 0.3, instant: 0 }, SCALE = { normal: 1, large: 1.15, larger: 1.3 };

/** Settings from what was kept: anything missing or strange falls back to its default. */
export function parseSettings(text) {
  let o;
  try { o = JSON.parse(text || "{}"); } catch { o = null; }
  const s = { ...DEFAULTS }, v = Number(o?.volume);
  for (const [k, list] of Object.entries(CHOICES)) if (list.some(([x]) => x === o?.[k]) && (k !== "patterns" || o.v >= SETTINGS_V)) s[k] = o[k];
  if (o?.volume !== undefined && Number.isFinite(v)) s.volume = Math.max(0, Math.min(100, Math.round(v)));
  return s;
}
export const settings = parseSettings((() => { try { return localStorage.getItem(SETTINGS_KEY); } catch { return null; } })());
export function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, v: SETTINGS_V })); } catch { /* kept for this visit only */ } }

/**
 * Can the last move be taken back? Only a move of the seat now to move, played since its turn began, that drew on no chance:
 * a roll, a draw or a steal once seen stays seen, and another seat's move (a bot's turn, a friend's) is theirs.
 * The rules stay whole: taking back is the match's own undo, so a seed and the moves still replay the game.
 * Returns "yes", "none" (nothing of this seat's since its turn began) or "chance" (the last move showed what chance held).
 */
export function takeBack(m, kinds, floor = 0) {
  const n = m.list.length, seat = m.turn;
  if (seat === null || kinds[seat] !== "you" || n <= floor) return "none";
  if (m.game.turn(m.at(n - 1)) !== seat) return "none";
  return m.rolled ? "chance" : "yes";
}

/** The turn a banner was shown for: once a round when one person plays, once a seat when several share the screen. */
export const turnKey = (seed, round, seat, solo) => (solo ? `${seed}/${round}` : `${seed}/${round}/${seat}`);

/** Places at the end: winners first, then those still standing by score, then the fallen, the last to fall first. Rows: { seat, won, score, fell }. */
export function ranked(rows) {
  const up = (r) => (r.fell === undefined || r.fell === null ? 1 : 0), key = (r) => (r.won ? "w" : `${up(r)}/${r.score}/${r.fell ?? ""}`);
  const all = [...rows].sort((a, b) => (b.won ? 1 : 0) - (a.won ? 1 : 0) || up(b) - up(a) || b.score - a.score || (b.fell ?? 0) - (a.fell ?? 0) || a.seat - b.seat);
  let place = 0;
  return all.map((r, i) => ({ ...r, place: i && key(all[i - 1]) === key(r) ? place : (place = i + 1) }));
}
/** The result as one line of plain text, to paste anywhere. */
export const resultText = (title, rows) => `${title}: ${rows.map((r) => `${r.place}. ${r.name}${r.figures.length ? ` (${r.figures.map(([k, v]) => `${k} ${v}`).join(", ")})` : ""}`).join("; ")}.`;

// Sounds, made here with the Web Audio API: no files. Silent until a press has woken them (browsers ask for that).
let ctx = null;
export function wake() {
  try { ctx ||= new AudioContext(); if (ctx.state === "suspended") ctx.resume(); } catch { ctx = null; }
}
/** motion hook (site/sound.js): the sounds' context once a press has woken it, for the game cues made there. */
export const audio = () => (ctx && ctx.state === "running" && settings.sound === "on" && settings.volume ? ctx : null);
// [hertz, start, length, loudness, wave]
const TUNES = {
  tick: [[1900, 0, 0.03, 0.12, "square"]],
  turn: [[784, 0, 0.45, 0.5], [1175, 0.11, 0.6, 0.4]],
  capture: [[147, 0, 0.22, 0.9, "triangle"], [294, 0.05, 0.3, 0.45, "triangle"]],
  win: [[523, 0, 0.3, 0.5], [659, 0.13, 0.3, 0.5], [784, 0.26, 0.3, 0.5], [1047, 0.39, 0.9, 0.55]],
  lose: [[392, 0, 0.4, 0.5], [311, 0.2, 0.4, 0.5], [262, 0.4, 1, 0.5]],
};
export function sfx(name, later = 0) {
  if (!ctx || ctx.state !== "running" || settings.sound !== "on" || !settings.volume) return;
  try {
    const t0 = ctx.currentTime + 0.01 + later, out = ctx.createGain();
    out.gain.value = 0.6 * (settings.volume / 100) ** 2;
    out.connect(ctx.destination);
    if (name === "roll") for (let i = 0; i < 4; i++) rattle(out, t0 + i * 0.06 + Math.random() * 0.025);
    for (const [hz, at, len, peak, wave = "sine"] of TUNES[name] || []) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = wave; o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      o.connect(g).connect(out); o.start(t0 + at); o.stop(t0 + at + len + 0.05);
    }
  } catch { /* a sound is never needed to play */ }
}
/** A die on wood: a short burst of noise through a narrow filter. */
function rattle(out, at) {
  const n = Math.floor(ctx.sampleRate * 0.045), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0), src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
  f.type = "bandpass"; f.frequency.value = 1200 + Math.random() * 1800; f.Q.value = 3;
  src.buffer = buf; src.connect(f).connect(out); src.start(at);
}
/** The sound a move makes, by what happened in it. */
export function cue(events) {
  if (events.some((e) => ["fight", "roll", "pour", "attack"].includes(e.kind))) sfx("roll");
  if (events.some((e) => e.kind === "take" || (e.kind === "pour" && e.taken?.length))) sfx("capture", 0.2);
}
