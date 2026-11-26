// SPDX-License-Identifier: AGPL-3.0-or-later
// The presets every Capo page offers beside "The world today": one list, one import and one spread for each lane.
// Each entry is shaped like a scenario ({id, kind, title, blurb, opening, start, ...}); `kind` is a key of KINDS.
import { ALTHIST } from "./althist.js";

export const KINDS = { fantasy: "Fictional worlds", althist: "Alternate histories" };
export const PRESETS = [...ALTHIST];
