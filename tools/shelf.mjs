// SPDX-License-Identifier: AGPL-3.0-or-later
// The community shelf's gate (ruling 155): every file in shelf/ passes the shelf's own rules (src/story/shelf.js: its
// shape, size, licence, the hard line, no web or email addresses) and then the same readers the game uses: a scenario's
// check on the map it is set on, a saved Capo game's check, and a table game's replay from its seed and moves, which
// must reach the result the entry claims. tools/check.mjs runs it; contributors can too.
// node tools/shelf.mjs           check, and write shelf/index.json from the files that pass
// node tools/shelf.mjs --check   check only
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LIMIT, cardOf, checkEntry, indexOf } from "../src/story/shelf.js";
import { checkScenario, scenarioText } from "../src/story/scenarios.js";
import { checkSave } from "../src/story/saves.js";
import { madeWorld } from "../src/story/settings.js";
import { crossesLine } from "../src/story/line.js";
import { canon, openSave } from "../src/core/index.js";
import { inch } from "../src/games/inch/rules.js";
import { fable } from "../src/games/fable/rules.js";
import { banners } from "../src/games/banners/rules.js";
import { glass } from "../src/games/glass/rules.js";

export const TABLE = { inch, fable, banners, glass };
const exact = (v) => { try { return canon(v); } catch { return "?"; } }; // the index is read as it stands: a broken card simply does not match
const maps = new Map();
/** The map a Capo file is set on: the real one, or a world of its own made from its seed. Null when it cannot be made. */
function mapFor(root, ref) {
  const key = ref ? JSON.stringify(ref) : `earth:${root}`; // a made world is the same everywhere; the real one is read from the folder checked
  if (!maps.has(key)) {
    const data = ref ? madeWorld(ref)?.data : JSON.parse(readFileSync(path.join(root, "maps/world.json"), "utf8"));
    maps.set(key, data ? { isCountry: ((s) => (c) => s.has(c))(new Set(data.provinces.map((p) => p.country))), isProvince: ((s) => (id) => s.has(id))(new Set(data.provinces.map((p) => p.id))) } : null);
  }
  return maps.get(key);
}

/** Why an entry's data does not open in its game, or "" when it opens exactly as the entry says. note() takes what is worth saying but stops nothing. */
export function readerSays(root, e, note = () => {}) {
  const d = e.data;
  if (e.type === "scenario") {
    const m = mapFor(root, d.world);
    if (!m) return "it is set on a world that cannot be made";
    const r = checkScenario(d, m.isCountry, m.isProvince);
    if (!r.ok) return r.why;
    if (crossesLine(scenarioText(r.scenario)).length) return "it crosses the hard line";
    const s = r.scenario, lost = [["owners", Object.keys(s.owners).length, Object.keys(d.owners || {}).length], ["wars", s.wars.length, (d.wars || []).length], ["treaties", s.treaties.length, (d.treaties || []).length], ["facts", s.facts.length, (d.facts || []).length]].find(([, a, b]) => a !== b);
    return lost ? `the game's reader keeps ${lost[1]} of its ${lost[2]} ${lost[0]}: every part must fit the map` : "";
  }
  if (e.type === "story") {
    const m = mapFor(root, d.world);
    if (!m) return "it is set on a world that cannot be made";
    return checkSave(d, m.isProvince, m.isCountry) ? "" : "it is not a Capo game this version can open";
  }
  const game = TABLE[e.game];
  if (d.version !== game.version) { note(`it was made under version ${String(d.version).slice(0, 10)} of ${e.game}'s rules, and this copy has ${game.version}: shown on the shelf, not opened`); return ""; }
  try {
    const { match, warning } = openSave(JSON.stringify(d), [game]);
    if (warning) return `its replay breaks: ${warning}`;
    const winners = match.result ? match.result.winners : null;
    if (exact(winners) !== exact(e.result.winners)) return `it claims ${exact(e.result.winners)} won, and the replay gives ${exact(winners)}`;
  } catch (x) { return `its replay is refused: ${x.message}`; }
  return "";
}

/** Check the whole shelf. Returns {bad, note, cards}: cards for every file that passes, as the index keeps them. */
export function checkShelf(root) {
  const bad = [], note = [], cards = [], dir = path.join(root, "shelf");
  if (!existsSync(dir)) return { bad, note, cards };
  const files = readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    const name = `shelf/${f.name}`;
    if (f.isDirectory() || !f.name.endsWith(".json")) { bad.push(`${name}: only shelf entries (.json) and the index go in shelf/`); continue; }
    if (f.name === "index.json") continue;
    const full = path.join(dir, f.name), size = statSync(full).size, text = readFileSync(full, "utf8");
    if (size > Math.max(...Object.values(LIMIT.file))) { bad.push(`${name}: ${Math.round(size / 1000)} kB, larger than any shelf entry may be`); continue; }
    let raw;
    try { raw = JSON.parse(text); } catch { bad.push(`${name}: is not JSON`); continue; }
    const r = checkEntry(raw);
    if (!r.ok) { bad.push(`${name}: ${r.why}`); continue; }
    const e = r.entry;
    if (`${e.id}.json` !== f.name) { bad.push(`${name}: its file name must be its id, ${e.id}.json`); continue; }
    if (text.length > LIMIT.file[e.type]) { bad.push(`${name}: ${text.length} characters, above the ${LIMIT.file[e.type]} a ${e.type} may have`); continue; }
    if (text.includes(String.fromCharCode(8212))) { bad.push(`${name}: has an em dash`); continue; }
    const why = readerSays(root, e, (n) => note.push(`${name}: ${n}`));
    if (why) { bad.push(`${name}: ${why}`); continue; }
    cards.push(cardOf(e, text.length));
  }
  const ids = new Set(cards.map((c) => c.id));
  for (const c of cards) if (c.from && !ids.has(c.from)) note.push(`shelf/${c.id}.json: made from ${c.from}, which is not on the shelf`);
  // the index: what the pages read. Every card in it matches its file; a file not listed yet is noted (node tools/shelf.mjs lists it)
  const at = path.join(dir, "index.json");
  if (!existsSync(at)) { if (cards.length) bad.push("shelf/index.json is missing: node tools/shelf.mjs writes it"); return { bad, note, cards }; }
  let index;
  try { index = JSON.parse(readFileSync(at, "utf8")); } catch { bad.push("shelf/index.json: is not JSON"); return { bad, note, cards }; }
  if (readFileSync(at, "utf8").length > LIMIT.index) bad.push("shelf/index.json: larger than the index may be");
  const want = new Map(cards.map((c) => [c.id, exact(c)])), listed = Array.isArray(index?.entries) ? index.entries : [];
  if (index?.kind !== "capo-shelf-index" || index.v !== 1 || !Array.isArray(index.entries)) bad.push("shelf/index.json: is not the shelf's index");
  for (const c of listed) if (want.get(c?.id) !== exact(c)) bad.push(`shelf/index.json: ${String(c?.id).slice(0, 64)} does not match its file: node tools/shelf.mjs writes it again`);
  for (const c of cards) if (!listed.some((x) => x?.id === c.id)) note.push(`shelf/${c.id}.json: passes, and is not in the index yet: node tools/shelf.mjs lists it`);
  return { bad, note, cards };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))), r = checkShelf(root);
  if (!process.argv.includes("--check") && existsSync(path.join(root, "shelf"))) {
    writeFileSync(path.join(root, "shelf/index.json"), JSON.stringify(indexOf(r.cards), null, 1) + "\n");
    console.log(`shelf/index.json: ${r.cards.length} entries.`);
    r.bad = r.bad.filter((b) => !b.startsWith("shelf/index.json")); r.note = r.note.filter((n) => !/not in the index yet/.test(n));
  }
  for (const n of r.note) console.log("note  " + n);
  for (const b of r.bad) console.log("STOP  " + b);
  console.log(r.bad.length ? `${r.bad.length} to fix.` : "The shelf is clear.");
  process.exitCode = r.bad.length ? 1 : 0;
}
