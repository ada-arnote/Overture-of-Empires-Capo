// SPDX-License-Identifier: AGPL-3.0-or-later
// The community shelf (ruling 155, option D): scenarios, Capo stories and table-game replays players share as files,
// kept in the repository's shelf/ folder and read by the pages from their own site. This is the shelf's format and
// the checks every entry passes, the same in the pages and in the gate (tools/shelf.mjs), before any game reader sees
// its data. Data only: nothing in an entry is ever run, and nothing in it may name a web address or an email address.
import { crosses } from "./line.js";

export const KIND = "capo-shelf", INDEX = "capo-shelf-index";
/** What an entry is. A scenario and a story are Capo's; a replay is a table game's, from its seed and moves. */
export const TYPES = { scenario: "Scenario", story: "Story", replay: "Replay" };
export const GAMES = { capo: "Capo", inch: "An Inch of Ink", fable: "The Island Fable", banners: "Brass and Banners", glass: "Grain and Glass" };
/** The two licences an entry may carry, chosen by the person who made it. */
export const LICENCES = { "CC-BY-4.0": "CC BY 4.0: anyone may use, change and share it, naming you", "CC0-1.0": "CC0: anyone may use, change and share it, no name needed" };
/** Characters, as written in the file. A file over its size is refused before it is read. */
export const LIMIT = { file: { scenario: 120000, story: 300000, replay: 200000 }, index: 400000, title: 60, about: 300, by: 40, entries: 400 };
const FIELDS = ["about", "by", "data", "from", "game", "id", "kind", "licence", "made", "result", "title", "type", "v"];
const ID = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
// a web address or an email address anywhere in an entry's text: the shelf links to nothing and carries no contact details
const ADDRESS = /\b[a-z][a-z0-9+.-]*:\/\/|\b(?:mailto|javascript):|\bwww\d?\.|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|gg|xyz|info|app|dev|tv|uk|ru|cn|link|site|online|club|shop|live|onion|ly)\b/i;
const MAIL = /[\w.+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i;
const line = (v, n) => (typeof v === "string" ? v.replace(/[\x00-\x1f\x7f]+/g, " ").replace(/\s+/g, " ").trim() : "").slice(0, n);
const fail = (why) => ({ ok: false, why });

/** Every piece of text in a value, keys included, however deep. */
export function textsOf(v, out = [], depth = 0) {
  if (depth > 40) throw new Error("too deep");
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) textsOf(x, out, depth + 1);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.push(k); textsOf(x, out, depth + 1); }
  return out;
}
/** Why a text may not go on the shelf, or "". */
export function refused(text) {
  if (crosses(text)) return "it crosses the hard line: nothing sexual involving minors";
  if (MAIL.test(text)) return "it holds an email address";
  if (ADDRESS.test(text)) return "it names a web address";
  return "";
}
/** A shelf id from a title: lower case, joined by hyphens, with a short tail so two offers of the same name do not meet. */
export const idFor = (title, tail) => `${line(title, 60).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "entry"}-${String(tail).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "x"}`.replace(/-+/g, "-");

/** The result a replay claims: how many moves, and who won (null while the game is unfinished). */
const resultOk = (r) => r && typeof r === "object" && Number.isInteger(r.moves) && r.moves >= 0 && (r.winners === null || (Array.isArray(r.winners) && r.winners.every((s) => Number.isInteger(s) && s >= 0 && s < 64)));
/** The parts of a table game's save (src/core/match.js), as a replay carries them. */
const SAVE = ["end", "format", "game", "moves", "options", "seed", "version"];

/**
 * Check one shelf entry, read from a file. Returns {ok: true, entry} or {ok: false, why}. This is the shelf's own
 * check: its shape, its fields, its licence and every text in it. The game's own readers (a scenario's check, a saved
 * game's check, a replay from its seed and moves) then decide whether its data opens.
 */
export function checkEntry(e) {
  if (!e || typeof e !== "object" || Array.isArray(e) || e.kind !== KIND || e.v !== 1) return fail("That is not a shelf entry.");
  const extra = Object.keys(e).find((k) => !FIELDS.includes(k));
  if (extra) return fail(`The entry has a field the shelf does not know: ${line(extra, 30)}.`);
  if (!ID.test(e.id || "")) return fail("The entry's id must be 3 to 64 lower-case letters, digits and hyphens.");
  if (!Object.hasOwn(TYPES, e.type) || !Object.hasOwn(GAMES, e.game)) return fail("The entry's type or game is not one the shelf knows.");
  if ((e.type === "replay") === (e.game === "capo")) return fail("Scenarios and stories are Capo's; replays are the table games'.");
  const title = line(e.title, LIMIT.title), about = line(e.about, LIMIT.about), by = line(e.by, LIMIT.by);
  if (!title || title !== e.title) return fail(`The title must be plain text of 1 to ${LIMIT.title} characters.`);
  if (about !== (e.about ?? "") || by !== (e.by ?? "")) return fail(`The line about it (to ${LIMIT.about} characters) and the name (to ${LIMIT.by}) must be plain text.`);
  if (!Object.hasOwn(LICENCES, e.licence)) return fail("The entry must carry CC-BY-4.0 or CC0-1.0, chosen by whoever made it.");
  if (e.licence === "CC-BY-4.0" && !by) return fail("CC BY means naming who made it: give a name (any name you choose), or choose CC0.");
  if (!DATE.test(e.made || "") || Number.isNaN(Date.parse(`${e.made}T00:00:00Z`))) return fail("The entry's date is not a date.");
  if (e.from !== undefined && (!ID.test(e.from) || e.from === e.id)) return fail("The entry it was made from must be another shelf id.");
  const d = e.data;
  if (!d || typeof d !== "object" || Array.isArray(d)) return fail("The entry has no data.");
  if (e.type === "scenario" && (d.kind !== "capo-scenario" || d.v !== 1)) return fail("A scenario entry must hold a Capo scenario.");
  if (e.type === "story" && (d.v !== 1 || typeof d.player !== "string" || !Array.isArray(d.log))) return fail("A story entry must hold a Capo game.");
  if (e.type === "replay") {
    if (Object.keys(d).sort().join() !== SAVE.join() || d.game !== e.game || !Array.isArray(d.moves)) return fail("A replay entry must hold a saved table game of its own game.");
    if (!resultOk(e.result) || e.result.moves !== d.moves.length) return fail("A replay must say how many moves it has and who won.");
  } else if (e.result !== undefined) return fail("Only a replay carries a result.");
  let texts;
  try { texts = textsOf(e); } catch { return fail("The entry is nested too deep."); }
  for (const t of texts) { const why = refused(t); if (why) return fail(`Refused: ${why}.`); }
  return { ok: true, entry: e };
}

/** The line the index keeps for an entry: what the shelf shows before anything is opened. */
export function cardOf(e, size) {
  const d = e.data;
  return { id: e.id, type: e.type, game: e.game, title: e.title, about: e.about || "", by: e.by || "", licence: e.licence, made: e.made, ...(e.from ? { from: e.from } : {}),
    ...(e.type === "replay" ? { version: d.version, result: { moves: e.result.moves, winners: e.result.winners } } : {}),
    ...(e.type === "scenario" ? { start: line(d.start, 10) } : {}), ...(e.type === "story" ? { start: line(d.date, 10), turn: Number.isInteger(d.turn) ? d.turn : 1 } : {}), size };
}

/** The shelf's index, read from the site: the cards that pass, newest first. A bad card is left out, not trusted. */
export function readIndex(x) {
  if (!x || x.kind !== INDEX || x.v !== 1 || !Array.isArray(x.entries)) return [];
  const ok = (c) => c && ID.test(c.id || "") && Object.hasOwn(TYPES, c.type) && Object.hasOwn(GAMES, c.game) && line(c.title, LIMIT.title) === c.title && c.title && Object.hasOwn(LICENCES, c.licence) && DATE.test(c.made || "") && Number.isInteger(c.size) && c.size > 0 && c.size <= LIMIT.file[c.type]
    && textsOf(c).every((t) => !refused(t));
  return x.entries.slice(0, LIMIT.entries).filter(ok).map((c) => ({ ...c, about: line(c.about, LIMIT.about), by: line(c.by, LIMIT.by) }));
}
/** The index itself, from every entry's card: newest first, then by title. */
export const indexOf = (cards) => ({ kind: INDEX, v: 1, entries: [...cards].sort((a, b) => (a.made < b.made ? 1 : a.made > b.made ? -1 : a.title < b.title ? -1 : a.title > b.title ? 1 : 0)) });

/** Em dashes (written by their number, as this file may not hold one) become commas: the house style, and the gate's. */
export const DASH = new RegExp(`\\s*${String.fromCharCode(8212)}\\s*`, "g");
const plain = (v) => (typeof v === "string" ? v.replace(DASH, ", ") : Array.isArray(v) ? v.map(plain) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v);
/** A Capo game as a story to share: what it is, without the player's chats with the AI, the counsel asked, the orders and actions in hand, or this browser's notes. */
export function storyOf(g) {
  const { chats, counsel, edits, actions, orders, shelf, seen, told, ...rest } = g;
  void chats, void counsel, void edits, void actions, void orders, void shelf, void seen, void told;
  return { ...rest, chats: [], counsel: [] };
}
/**
 * A new entry, ready to save as a file. meta: {type, game, title, about, by, licence, made, from, tail}.
 * Data is copied, and em dashes in it become commas. The result still goes through checkEntry before it is offered.
 */
export function makeEntry(meta, data, result) {
  const title = line(meta.title, LIMIT.title);
  return { kind: KIND, v: 1, id: idFor(title, meta.tail), type: meta.type, game: meta.game, title: plain(title), about: plain(line(meta.about, LIMIT.about)), by: line(meta.by, LIMIT.by), licence: meta.licence, made: meta.made,
    ...(meta.from ? { from: meta.from } : {}), ...(result ? { result: { moves: result.moves, winners: result.winners ? [...result.winners] : null } } : {}), data: plain(structuredClone(data)) };
}
