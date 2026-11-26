// SPDX-License-Identifier: AGPL-3.0-or-later
// The preset registry: every ready-made start beyond "The world today", from every lane, in one list.
// An entry is shaped like a scenario (id, kind, title, blurb, opening, start, and any of owners, wars, treaties,
// facts, might, custom). An entry on an invented world also carries `world`: {setting, seed, where}; one on the real
// map leaves it out. To add a lane: import its list here and spread it into PRESETS. Nothing else needs to change.
import { FANTASY } from "./settings.js";

/** The headings presets are listed under, by kind. */
export const KINDS = { fantasy: "Fictional worlds", althist: "Alternate histories" };
export const PRESETS = [...FANTASY];
export { checkSetting, madeWorld, settingScenario, staged, worldKey } from "./settings.js";
