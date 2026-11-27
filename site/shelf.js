// SPDX-License-Identifier: AGPL-3.0-or-later
// The model shelf as the pages reach it: a sculpted piece is fetched from site/models/ only when a board in 3D first shows it,
// and the credits players can read from every game's About (CC BY asks for a credit line they can reach).
import { SHELF } from "../src/map/shelf.js";

// the built pages point this at the site's own shelf when served, and at nothing when a page is opened by double-click (no fetching there)
const SHELF_URL = "models/";
const kept = new Map(); // each file once a page, shared by every board on it (the title's board and the game's)
/** The fetcher a board takes, or none: then only the pieces made in code stand. */
export const shelf = SHELF_URL ? (file) => { if (!kept.has(file)) kept.set(file, fetch(SHELF_URL + file).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)); return kept.get(file); } : null;

/** Makers whose models need no credit, thanked all the same: shown once one of their models is on the shelf. */
const COURTESY = [["cottage townhouse", "Houses built from the Medieval Village MegaKit by Quaternius (quaternius.com), CC0."], ["block", "City blocks from the Downtown City MegaKit by Quaternius (quaternius.com), CC0."],["adobe", "Desert houses from Low Poly Desert Buildings by Anker's Assets (ankersassets.itch.io), CC0."]];

/** The credits for the sculpted pieces, for an About panel: one line a model, as its licence asks. Plain text only. */
export function shelfCredits() {
  const box = document.createElement("div"), h = document.createElement("h3"), note = document.createElement("p"), list = document.createElement("ul");
  h.textContent = "Sculpted pieces";
  note.textContent = "In 3D, some pieces are open models by other makers, cut down, repainted in the board's colours and re-encoded for this game. Each is used under its licence:";
  for (const m of Object.values(SHELF)) if (m.credit) { const li = document.createElement("li"); li.textContent = m.credit; list.append(li); }
  for (const [names, line] of COURTESY) if (names.split(" ").some((n) => SHELF[n])) { const li = document.createElement("li"); li.textContent = line; list.append(li); }
  if (!list.children.length) return box;
  box.append(h, note, list);
  return box;
}
