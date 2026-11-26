// SPDX-License-Identifier: AGPL-3.0-or-later
// The preset registry: every ready-made start beyond "A clean slate", from every lane, in one list.
// An entry is shaped like a scenario (id, kind, title, blurb, opening, start, and any of owners, wars, treaties,
// facts, might, custom). An entry on an invented world also carries `world`: {setting, seed, where}; an alternate
// history on the real map leaves it out and carries an overlay instead. To add a lane: import its list here and
// spread it into PRESETS. Nothing else needs to change.
import { FANTASY } from "./settings.js";
import { ALTHIST } from "./althist.js";
import { AUTHORED } from "./authored.js";

/** The headings presets are listed under, by kind. */
export const KINDS = { authored: "Authored starts", fantasy: "Fictional worlds", althist: "Alternate histories" };
export const PRESETS = [...AUTHORED, ...ALTHIST, ...FANTASY];
/** The start the first screen opens on, listed first of all (ruling 151). */
export const FIRST = "late-2026";
/** Every built-in start in the first screen's order: "Late 2026", then the clean slate (`blank`), then the rest by kind. */
export const startOrder = (blank, presets = PRESETS) => [...presets.filter((p) => p.id === FIRST), ...blank, ...presets.filter((p) => p.id !== FIRST)];
export { checkSetting, madeWorld, settingScenario, staged, worldKey } from "./settings.js";
