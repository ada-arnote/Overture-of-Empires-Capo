// SPDX-License-Identifier: AGPL-3.0-or-later
// The rules the worker checks moves with: the very modules the pages play, bundled in at deploy time.
// A rules version the pages have and the worker does not is refused by name, so deploy again after each rules change.
import { banners } from "../../src/games/banners/rules.js";
import { fable } from "../../src/games/fable/rules.js";
import { glass } from "../../src/games/glass/rules.js";
import { inch } from "../../src/games/inch/rules.js";

export const GAMES = [banners, fable, glass, inch];
