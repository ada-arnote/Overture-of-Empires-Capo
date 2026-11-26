// SPDX-License-Identifier: AGPL-3.0-or-later
// The turn's beat, and the press. Rules choose; the AI writes.
// A beat is one authored moment from a fixed list, each with a condition on what the rules already keep (war,
// the three gauges, treaties, the way the player plays). On four turns in ten, drawn from the game's seed, the
// rules pick one whose condition holds and that has not come in the last ten turns, and the AI is told to write it
// as one event. A beat changes no fact: no land, no gauge, no treaty.
// A scenario file may script beats of its own (its `beats` list): each has words, a list of conditions from the
// fixed vocabulary in WHEN, and may wait for a turn. A scripted beat whose conditions all hold comes before any
// drawn one, with no draw, once in a game: one a turn, in the order the file gives them.
// The press is four papers fixed for the game, each with a stance it keeps.
import { crosses, draw100, hash32 } from "./line.js";
import { gaugeOf } from "./state.js";
import { turnKey } from "./worldrules.js";

export const BEAT = { chance: 40, rest: 10 };
// [id, when it may come, what the AI is asked to write]
export const BEATS = [
  ["scandal", (x) => x.m <= 2, "a scandal breaks around someone close to the government"],
  ["harvest", (x) => !x.war && x.t >= 2, "a bumper harvest fills the markets and lowers prices"],
  ["strike", (x) => x.t <= 1, "unpaid wages bring a strike in the ports"],
  ["debt", (x) => x.t <= 1, "an old lender calls in a debt at the worst moment"],
  ["wounded", (x) => x.war, "the wounded come home, and families ask what the war is for"],
  ["defector", (x) => x.war, "an officer from the other side crosses the lines with something to tell"],
  ["march", (x) => x.s <= 1, "a march in the capital ends in broken windows and arrests"],
  ["festival", (x) => x.s >= 3, "a national festival fills the streets, and for a day nobody argues"],
  ["cheers", (x) => x.m >= 3, "crowds cheer the government's name after its successes"],
  ["envoy", (x) => !x.war && x.pacts > 0, "an envoy from a treaty partner arrives with a private request"],
  ["storm", () => true, "a great storm closes roads and ports for days"],
  ["census", (x) => !x.war, "a new count of the people shows the country changing faster than its laws"],
  ["rival", (x) => x.mode === "leader", "a rival inside the government lets it be known they are ready to serve"],
  ["letter", (x) => x.mode === "citizen", "a letter arrives from someone the player has not heard from in years"],
];

// the words a scenario file may use for when a beat of its own comes
export const WHEN = { war: (x) => x.war, peace: (x) => !x.war, shaken: (x) => x.s <= 1, calm: (x) => x.s >= 3, poor: (x) => x.t <= 1, rich: (x) => x.t >= 3, doubted: (x) => x.m <= 1, trusted: (x) => x.m >= 3, treaty: (x) => x.pacts > 0, alone: (x) => !x.pacts, unrest: (x) => x.unrest, nation: (x) => x.mode === "nation", leader: (x) => x.mode === "leader", citizen: (x) => x.mode === "citizen" };
const facts = (g) => { const me = g.player, has = (list) => list.some((x) => x.pair.split("|").includes(me)); return { war: has(g.wars), pacts: g.treaties.filter((t) => t.pair.split("|").includes(me)).length, s: gaugeOf(g, me, "s"), t: gaugeOf(g, me, "t"), m: gaugeOf(g, me, "m"), mode: g.mode, unrest: !!g.unrest?.[me] }; };
/** A scenario's own beats, checked: at most twelve, each {id, text, when: [words from WHEN], from: the first turn it may come}. */
export function keepScript(v) {
  return (Array.isArray(v) ? v : []).filter((b) => b && typeof b.text === "string" && b.text.trim().length > 8 && !crosses(b.text)).slice(0, 12)
    .map((b, i) => ({ id: `s${i + 1}`, text: b.text.replace(/\s+/g, " ").trim().slice(0, 240), when: (Array.isArray(b.when) ? b.when : []).filter((w) => typeof w === "string" && Object.hasOwn(WHEN, w)).slice(0, 4), from: Number.isInteger(b.from) && b.from > 1 ? Math.min(b.from, 999) : 1 }));
}
/** The scripted beat due this turn, or null: the first in the file whose conditions hold and that has not come. */
function scripted(g, x) {
  const b = (g.script || []).find((s) => g.turn >= s.from && s.when.every((w) => WHEN[w](x)) && !(g.beats || []).some(([old]) => old === s.id));
  return b ? [b.id, null, b.text] : null;
}

/** The beat for the turn in hand, or null. The same game and turn always give the same one. */
export function beatFor(g) {
  const x = facts(g), due = scripted(g, x);
  if (due) return due;
  if (draw100(g.seed, `${turnKey(g)}:beat`) > BEAT.chance) return null;
  const open = BEATS.filter(([id, when]) => when(x) && !(g.beats || []).some(([old, turn]) => old === id && g.turn - turn <= BEAT.rest));
  return open.length ? open[hash32(g.seed, `${turnKey(g)}:beat:pick`) % open.length] : null;
}
/** Remember the beat a finished turn carried, so it rests for a while. */
export function noteBeat(g) {
  const b = beatFor(g);
  if (b) g.beats = [...(g.beats || []), [b[0], g.turn]].slice(-BEATS.length - 12);
  return b;
}

const SHEETS = [["National Gazette", "State Herald", "Official Journal"], ["Free Press", "Daily Tribune", "Evening Courier"], ["Exchange", "Commercial Ledger", "Merchant"], ["Overseas Dispatch", "Foreign Wire", "World Observer"]];
/** The game's four papers: [name, stance]. */
export function papers(g, geo) {
  const pick = (i) => `the ${SHEETS[i][hash32(g.seed, `paper:${i}`) % 3]}`;
  return [[pick(0), "close to the government"], [pick(1), "against the government"], [pick(2), "for trade and a full treasury"], [pick(3), `foreign, and wary of ${geo.name(g.player)}`]];
}

/** Lines for the prompt: the turn's beat, when there is one, and the press. */
export function beatLines(g, geo) {
  const b = beatFor(g);
  return [
    ...(b ? [`- This turn's beat, ${b[1] ? "chosen by the rules" : "written into this scenario by its author"}: ${b[2].replace(/[.!?]+$/, "")}. Write it as one of your EVENT lines for ${g.player}, in your own words. It changes no fact.`] : []),
    `- The press, fixed for this game. NEWS lines come from these papers, each keeping its stance, and none may give a result the rules did not decide: ${papers(g, geo).map(([n, s]) => `${n} (${s})`).join("; ")}.`,
  ];
}
