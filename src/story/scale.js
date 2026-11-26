// SPDX-License-Identifier: AGPL-3.0-or-later
// The scale of play, changed in a running game, and a gauge for the person played. Rules only.
// Scale. A game may step between nation, leader and citizen, once a turn. The country, its land and its past stay
// as they are. Standing goes to the new scale's own (a nation or a leader rules, 5; a citizen is an ordinary
// person, 2), and the circle follows as it does when standing moves: each member takes the matching seat, those
// already cool toward the player part, and nobody is invented. A citizen commands nothing, so orders by card are
// dropped. The next receipt and the next prompt say that the scale changed.
// Means. A leader or a citizen has a fourth gauge of their own, in words like the country's three: destitute,
// poor, getting by, comfortable, wealthy. It starts at getting by and moves one step at most a turn: once a year
// toward where the person's standing and the country's treasury put it (standing less one; a step more when the
// treasury is full, a step less when it is strained), and by a scene lived in person. Nothing is bought with it:
// it feeds scenes, the circle's moods and the story.
import { monthsApart } from "./relations.js";
import { SEATS, STANDING } from "./talk.js";
import { gaugeOf } from "./state.js";

export const MEANS = ["destitute", "poor", "getting by", "comfortable", "wealthy"];
export const SCALES = ["nation", "leader", "citizen"];
export const meansOf = (g) => g.self?.p?.[0] ?? 2;
export const meansWord = (g) => MEANS[meansOf(g)];
/** Where the person's means are heading: standing less one, moved a step by a full or a strained treasury. */
export const meansTarget = (g) => { const t = gaugeOf(g, g.player, "t"); return Math.max(0, Math.min(4, (g.standing || 5) - 1 + (t >= 3 ? 1 : t <= 1 ? -1 : 0))); };

/** Why the scale cannot change to this one now, or "". */
export const scaleProblem = (g, mode) => (!SCALES.includes(mode) ? "That is not a way to play." : mode === g.mode ? "You already play that way." : g.scaled === g.turn ? "The scale of play changes once a turn at most." : "");

/**
 * Change the scale of play. character: the person played, when the game had none. Returns {ok, why} and, when it
 * changed, the lines the next receipt will carry.
 */
export function switchScale(g, mode, character = null) {
  const why = scaleProblem(g, mode);
  if (why) return { ok: false, why };
  const was = g.mode, from = g.standing || STANDING[was], to = STANDING[mode], lines = [`The scale of play changes from ${was} to ${mode}`];
  if (mode !== "nation" && !g.character) g.character = character || { name: "", pronouns: "", role: "", personality: "", goals: "", weaknesses: "", wealth: "" };
  if (g.council && from !== to) {
    const before = SEATS[from], after = SEATS[to], seats = {};
    let trusted = null;
    after.forEach(([k, label], i) => {
      const [old] = before[i] || [], m = old && g.council.seats[old];
      seats[k] = null;
      if (!m) return;
      if (m.favour < 0) { g.council.former.push({ ...m, seat: old, left: g.date, why: "parted as the scale of play changed" }); lines.push(`${m.name}: parts from your circle as the scale of play changes`); return; }
      seats[k] = m;
      if (g.council.trusted === old) trusted = k;
      if (k !== old) lines.push(`${m.name}: stays with you, now as ${label.toLowerCase()}`);
    });
    g.council.seats = seats; g.council.trusted = trusted;
  }
  if (mode === "citizen") { const cards = new Set((g.orders || []).map((o) => o.text)); g.orders = []; g.actions = (g.actions || []).filter((a) => !cards.has(a)); g.plans = []; if (g.crisis?.by === "you" && g.crisis.since === g.date) g.crisis = null; }
  if (mode !== "nation") g.self ||= { p: [2, g.date, ""] };
  Object.assign(g, { mode, standing: to, scaled: g.turn, shift: lines });
  return { ok: true, why: "", lines };
}

/**
 * The end of a turn: the change of scale is written into the receipt, and the person's means move one step at
 * most. pushes: [[delta, why]] from what the turn held (a scene). Returns receipt lines.
 */
export function settleSelf(g, to, pushes = []) {
  const lines = (g.shift || []).map((text) => ({ ok: true, text }));
  delete g.shift;
  if (g.mode === "nation") return lines;
  const e = ((g.self ||= {}).p ||= [2, to, ""]), all = [...pushes], target = meansTarget(g);
  if (monthsApart(e[1], to) >= 12 && e[0] !== target) all.push([Math.sign(target - e[0]), target > e[0] ? "a good year for someone of your standing" : "a hard year for someone of your standing"]);
  const net = Math.sign(all.reduce((n, [d]) => n + d, 0)), next = Math.max(0, Math.min(4, e[0] + net));
  if (!net || next === e[0]) return lines;
  const why = all.find(([d]) => d === net)[1];
  lines.push({ ok: true, text: `Your own means ${net > 0 ? "rise" : "fall"} to ${MEANS[next]} (${why})` });
  g.self.p = [next, to, why];
  return lines;
}

/** Lines for the prompt: the person's means, and a change of scale made this turn. */
export const selfLines = (g) => [
  ...(g.mode !== "nation" ? [`- The player's own means, kept by the rules: ${meansWord(g)} (${meansOf(g) + 1} of 5). Write their private life to fit; only the rules move it.`] : []),
  ...(g.scaled === g.turn ? [`- The scale of play changed this turn: the player now plays as ${g.mode}. The world and its past are the same; write from the new point of view.`] : []),
];

/** The person's gauge and the scale's mark from a save. */
export function keepSelf(s) {
  const p = s.self?.p, ok = Array.isArray(p) && Number.isInteger(p[0]) && p[0] >= 0 && p[0] <= 4 && /^\d{4}-\d{2}-\d{2}$/.test(p[1] || "");
  return { self: ok ? { p: [p[0], p[1], String(p[2] || "").slice(0, 80)] } : undefined, scaled: Number.isInteger(s.scaled) ? s.scaled : undefined, shift: Array.isArray(s.shift) ? s.shift.filter((t) => typeof t === "string").slice(0, 8).map((t) => t.slice(0, 160)) : undefined };
}
