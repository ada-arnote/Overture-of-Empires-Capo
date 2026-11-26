// SPDX-License-Identifier: AGPL-3.0-or-later
// Who can be sent on a mission, and how they are (ruling 124, step M1). Rules only: whole numbers, no AI.
// The roster is the player's council and two field agents: seven named people at most, for nation and leader play.
// The agents are dealt from the game's seed, with a code name and a skill of 3 or 4; the AI names nobody here.
// A person is fit, away (on a patient mission, one more turn), hurt (two turns) or held (by a country, until they
// are rescued or, after six turns, let go). Anyone not fit, or already ordered out this turn, leads no attack,
// gives no counsel and goes on no mission: that is the price of sending them.
// Receipt: "Heron: let go by Chile after 6 turns held".
import { draw100, hash32 } from "./line.js";

export const AGENTS = ["Heron", "Lantern", "Juniper", "Sparrow", "Marten", "Cinder", "Osprey", "Thistle", "Ember", "Quill", "Rook", "Tamarind", "Wren", "Flint", "Sorrel", "Kestrel", "Linden", "Moth", "Pike", "Saffron", "Tern", "Vesper", "Yarrow", "Garnet"];
export const TIMES = { hurt: 2, held: 6 };

/** The two field agents of a game: the same two for the same seed. */
export function agents(g) {
  const n = AGENTS.length, i = hash32(g.seed, "agent:1") % n, j = (i + 1 + hash32(g.seed, "agent:2") % (n - 1)) % n;
  return [i, j].map((k) => ({ seat: "field", name: AGENTS[k], skill: 3 + draw100(g.seed, `agent:${AGENTS[k]}`) % 2 }));
}

/** How someone is now: {st: "fit"}, or {st: "away" | "hurt" | "held", until: the turn they are fit again, by}. */
export function statusOf(g, name) {
  const r = g.roster?.[name];
  return r && r.st && g.turn < r.until ? { st: r.st, until: r.until, ...(r.by ? { by: r.by } : {}) } : { st: "fit" };
}
/** Whether someone cannot act this turn: not fit, or already ordered out on a mission. */
export const unfit = (g, name) => statusOf(g, name).st !== "fit" || (g.sends || []).some((m) => m.who === name && (g.actions || []).includes(m.text));
/** Someone's record: missions [clean, costly, failed, disaster]. */
export const recordOf = (g, name) => g.roster?.[name]?.n || [0, 0, 0, 0];

/** Change someone's status, or count a mission's grade (0 clean to 3 disaster) on their record. */
export function mark(g, name, change, grade = -1) {
  const old = g.roster?.[name] || {}, n = (old.n || [0, 0, 0, 0]).slice();
  if (grade >= 0) n[grade]++;
  g.roster = { ...(g.roster || {}), [name]: { ...old, ...(change || {}), n } };
}

/** The end of a turn: those held six turns are let go. Returns receipt lines. */
export function settleRoster(g, name) {
  const lines = [];
  for (const [who, r] of Object.entries(g.roster || {})) {
    if (r.st !== "held" || g.turn + 1 < r.until) continue;
    mark(g, who, { st: "", until: 0, by: "" });
    lines.push({ ok: true, country: g.player, text: `${who}: let go by ${name(r.by)} after ${TIMES.held} turns held` });
  }
  return lines;
}

/** The roster from a save: names and whole numbers only, holders on the map. */
export function keepRoster(s, known) {
  const out = {};
  for (const [who, r] of Object.entries(s.roster && typeof s.roster === "object" ? s.roster : {}).slice(0, 40)) {
    if (!r || typeof r !== "object" || who.length > 60) continue;
    const st = ["away", "hurt", "held"].includes(r.st) && Number.isInteger(r.until) && (r.st !== "held" || known(r.by)) ? r.st : "";
    const n = Array.isArray(r.n) && r.n.length === 4 && r.n.every((x) => Number.isInteger(x) && x >= 0) ? r.n : [0, 0, 0, 0];
    out[who] = { ...(st ? { st, until: r.until, ...(st === "held" ? { by: r.by } : {}) } : {}), n };
  }
  return out;
}
