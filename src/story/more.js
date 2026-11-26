// SPDX-License-Identifier: AGPL-3.0-or-later
// One door for four small systems the turn calls: the state of countries and their causes (state.js), crises
// (crisis.js), ambitions (ambitions.js), and the turn's beat and the press (beats.js). The turn, the rules and the
// page each call one function here, so those files carry one line apiece.
import { keepState, settleState, stateLines } from "./state.js";
import { crisisLines, keepCrisis, settleCrisis } from "./crisis.js";
import { ambitionLines, keepAmbition, settleAmbition } from "./ambitions.js";
import { BEATS, beatLines, noteBeat } from "./beats.js";

// Which of these systems a saved game has met. 1: gauges, causes, crises, ambitions, beats and the press.
export const MORE = 1;

/** Lines for the turn prompt's FACTS. near: the countries beside the player's, by land or narrow sea. */
export const moreFacts = (g, geo, near = []) => [...stateLines(g, geo, near), ...ambitionLines(g, geo), ...crisisLines(g, geo), ...beatLines(g, geo)];

/**
 * The end of a turn, after the rules have judged its moves: a crisis is answered or opened, gauges move, the
 * ambition is counted, the beat is remembered. receipt is the turn's receipt so far. Returns the lines to add.
 */
export function settleMore(g, receipt, to, geo, actions = []) {
  const crisis = settleCrisis(g, to, geo, actions), all = [...receipt, ...crisis];
  const lines = [...crisis, ...settleState(g, all, to, geo), ...settleAmbition(g, all, to, geo)];
  noteBeat(g);
  g.more = MORE;
  return lines;
}

/** The words for a game saved before these systems, or "" when it needs none. A game not yet begun needs none. */
export const NOTE = "This game was saved before countries had a state of their own. It has been brought up to date, and nothing in its past changes. From now on the rules keep each country's stability, treasury and mandate, a war wants a cause, a crisis may open over disputed land, and you may choose an ambition under your country's name.";
export const moreNote = (s) => (s && typeof s === "object" && s.turn > 1 && s.more !== MORE ? NOTE : "");

/** A checked game with these systems' parts checked too: what does not fit the map is dropped, what is missing starts empty. */
export function keepMore(s, isProvince, known) {
  if (!s) return s;
  const beats = (Array.isArray(s.beats) ? s.beats : []).filter((b) => Array.isArray(b) && BEATS.some(([id]) => id === b[0]) && Number.isInteger(b[1])).slice(-BEATS.length);
  return { ...s, ...keepState(s, known), ...keepCrisis(s, known, isProvince), ...keepAmbition(s, isProvince), beats, ...(moreNote(s) ? { told: 1 } : {}), more: MORE };
}
