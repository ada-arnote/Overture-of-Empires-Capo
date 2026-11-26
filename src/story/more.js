// SPDX-License-Identifier: AGPL-3.0-or-later
// One door for the small systems the turn calls. Round one: the state of countries and their causes (state.js),
// crises (crisis.js), ambitions (ambitions.js), the turn's beat and the press (beats.js). Round two: home politics
// (home.js), fog and rumours (fog.js), scenes (scenes.js), the scale of play and the player's own means
// (scale.js), clauses and spheres (pacts.js). The turn, the rules and the page each call one function here, so
// those files carry one line apiece.
import { keepState, settleState, stateLines } from "./state.js";
import { crisisLines, keepCrisis, settleCrisis } from "./crisis.js";
import { ambitionLines, keepAmbition, settleAmbition } from "./ambitions.js";
import { BEATS, beatLines, keepScript, noteBeat } from "./beats.js";
import { homeLines, keepHome, settleHome, settleUnrest } from "./home.js";
import { keepFog, settleFog } from "./fog.js";
import { keepScene, sceneLines, settleScene } from "./scenes.js";
import { keepSelf, selfLines, settleSelf } from "./scale.js";
import { keepPacts, pactLines, settlePacts } from "./pacts.js";

// Which of these systems a saved game has met. 1: gauges, causes, crises, ambitions, beats and the press.
// 2: home politics, fog, scenes, the scale of play and means, clauses and spheres, scripted beats.
export const MORE = 2;

/** The lie of the land near the player on an invented world: flavour for the story, read by no rule. */
function terrainLines(g, geo) {
  const mine = (geo.all || []).filter((id) => geo.owner(id) === g.player && geo.place(id)?.terrain).slice(0, 24);
  return mine.length ? [`- The lie of the player's land (flavour only; no rule reads it): ${mine.map((id) => `${geo.place(id).name} ${geo.place(id).terrain}`).join(", ")}`] : [];
}

/** Lines for the turn prompt's FACTS. near: the countries beside the player's, by land or narrow sea. */
export const moreFacts = (g, geo, near = []) => [...stateLines(g, geo, near), ...homeLines(g, geo), ...pactLines(g, geo, near), ...selfLines(g), ...ambitionLines(g, geo), ...crisisLines(g, geo), ...sceneLines(g), ...terrainLines(g, geo), ...beatLines(g, geo)];

/**
 * An order by card for one of these systems, tied to the action that carries it: {kind, text, ...}. One of a kind
 * and target stands at a time. It is carried out at the end of the turn only if its action is still there.
 */
export function plan(g, p) { g.plans = [...(g.plans || []).filter((x) => !(x.kind === p.kind && x.sub === p.sub && x.target === p.target)), p]; }

/**
 * The end of a turn, after the rules have judged its moves: a crisis is answered or opened, clauses and unrest are
 * settled, gauges move, a scene is written down, the ambition is counted, the beat is remembered. receipt is the
 * turn's receipt so far. Returns the lines to add.
 */
export function settleMore(g, receipt, to, geo, actions = []) {
  const plans = (g.plans || []).filter((p) => actions.includes(p.text)), crisis = settleCrisis(g, to, geo, actions);
  const pacts = settlePacts(g, [...receipt, ...crisis], to, geo, plans), unrest = settleUnrest(g, to, geo, plans), scene = settleScene(g, geo);
  const all = [...receipt, ...crisis, ...pacts, ...unrest, ...scene.lines];
  const lines = [...crisis, ...pacts, ...unrest, ...scene.lines, ...settleState(g, all, to, geo), ...settleHome(g, to, geo), ...settleSelf(g, to, scene.means)];
  lines.push(...settleAmbition(g, [...receipt, ...lines], to, geo));
  settleFog(g, to);
  noteBeat(g);
  g.plans = [];
  g.more = MORE;
  return lines;
}

/** A game taken back past a turn in which one of these rules rolled moves to a new line, so the roll is drawn fresh. */
export function backMore(back, g) {
  const rolled = g.log.some((t) => !back.log.some((b) => b.turn === t.turn) && (t.receipt || []).some((x) => x.roll));
  return rolled && back.branch === (g.branch || 0) ? { ...back, branch: back.branch + 1 } : back;
}

/** The words for a game saved before these systems, or "" when it needs none. A game not yet begun needs none. */
export const NOTE = "This game was saved before countries had a state of their own. It has been brought up to date, and nothing in its past changes. From now on the rules keep each country's stability, treasury and mandate, a war wants a cause, a crisis may open over disputed land, and you may choose an ambition under your country's name.";
export const NOTE2 = "This game was saved before home politics, fog and scenes. It has been brought up to date, and nothing in its past changes. From now on your council's favour follows what each member cares for, unrest has a face and can be answered, you see other countries only as well as you know them, and you can live a scene or bind a neighbour by a pact from the sheet under your country's name.";
export const moreNote = (s) => (s && typeof s === "object" && s.turn > 1 && s.more !== MORE ? (s.more === 1 ? NOTE2 : NOTE) : "");

/** A checked game with these systems' parts checked too: what does not fit the map is dropped, what is missing starts empty. */
export function keepMore(s, isProvince, known) {
  if (!s) return s;
  const beats = (Array.isArray(s.beats) ? s.beats : []).filter((b) => Array.isArray(b) && (BEATS.some(([id]) => id === b[0]) || /^s\d{1,2}$/.test(b[0])) && Number.isInteger(b[1])).slice(-BEATS.length - 12);
  const plans = (Array.isArray(s.plans) ? s.plans : []).filter((p) => p && typeof p.text === "string" && ["quell", "terms", "pact"].includes(p.kind) && (p.kind !== "pact" || (known(p.target) && ["peace", "tribute", "stop"].includes(p.sub)))).slice(0, 12).map((p) => ({ kind: p.kind, text: p.text.slice(0, 300), ...(p.kind === "pact" ? { sub: p.sub, target: p.target } : {}) }));
  const script = keepScript(s.script), note = moreNote(s);
  return { ...s, ...keepState(s, known), ...keepCrisis(s, known, isProvince), ...keepAmbition(s, isProvince), ...keepHome(s, known, isProvince), ...keepFog(s, known), ...keepScene(s), ...keepSelf(s), ...keepPacts(s, known), beats, plans, ...(script.length ? { script } : { script: undefined }), ...(note ? { told: note === NOTE ? 1 : 2 } : {}), more: MORE };
}
