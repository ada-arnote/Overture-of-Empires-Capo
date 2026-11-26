// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo's saves: what a game holds, how a save from the browser or a file is checked before use, and the small
// take-back records that stand in for whole copies.
import { MODES } from "./turn.js";
import { STANDING } from "./talk.js";
import { APPROACHES } from "./worldrules.js";
import { RULES } from "./check.js";
import { chronicleFrom } from "./chronicle.js";
import { keepMemory } from "./people.js";

// Older games are converted, never refused: nothing they hold needs the old rule, their turns keep the receipts
// they had, and every attack from the next turn on is made under these rules.
/** The plain words for a game converted from older rules, or "" when it needs none. */
export const convertNote = (s) => (s && typeof s === "object" && s.rules !== RULES ? "This game was saved under older rules. It has been brought up to date: its past turns keep the results they had. From now on countries keep relations and answer treaties and peace by rule, wars end by rule when both sides are worn out, a country's might changes with its land and its wars, and the story keeps a chronicle, people and open threads." : "");

/** A game saved before some part existed gets that part empty. */
export const mendGame = (s) => ({ wars: [], treaties: [], offers: [], chats: [], counsel: [], council: null, standing: STANDING[s.mode] || 5, facts: [], might: {}, edits: [], sandbox: false, orders: [], rel: {}, word: {}, truce: {}, people: [], threads: [], branch: 0, ...s, start: s.start || startOf(s), chron: s.chron || chronicleFrom(s.log || [], s.turn || 1), rules: RULES });
// A game saved before land was counted from its start: a country of the player's own began with the land it holds.
const startOf = (s) => Object.fromEntries(Object.entries(s.owners || {}).filter(([, c]) => s.custom && c === s.custom.code));
/**
 * The player's orders by card, each tied to the action that asked for it: an attack {text, verb, target, seat,
 * approach}, or a treaty or peace with a country {text, verb, target, detail}.
 */
const ORDERS = ["ATTACK", "TREATY", "PEACE"], KINDS = ["trade", "defence", "alliance"];
const keepOrders = (v, isProvince, known) => (Array.isArray(v) ? v : []).map((o) => ({ ...o, verb: ORDERS.includes(o?.verb) ? o.verb : "ATTACK" }))
  .filter((o) => typeof o.text === "string" && typeof o.target === "string" && (o.verb === "ATTACK" ? isProvince(o.target) : known(o.target)))
  .map((o) => (o.verb === "ATTACK" ? { text: o.text, verb: o.verb, target: o.target, seat: typeof o.seat === "string" ? o.seat : "", approach: APPROACHES[o.approach] ? o.approach : "steady" } : { text: o.text, verb: o.verb, target: o.target, detail: KINDS.includes(o.detail) ? o.detail : "" }));
const pairOk = (p, known) => typeof p === "string" && p.split("|").length === 2 && p.split("|").every(known);
/** Relations from a save: only pairs of countries on the map, whole numbers from -3 to 3, each with its date. */
const keepRel = (v, known) => Object.fromEntries(Object.entries(v && typeof v === "object" ? v : {}).filter(([p, r]) => pairOk(p, known) && Array.isArray(r) && Number.isInteger(r[0]) && r[0] >= -3 && r[0] <= 3 && r[0] !== 0 && DATE.test(r[1] || "")).map(([p, r]) => [p, [r[0], r[1]]]));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const keepChron = (c) => (c && typeof c === "object" && Array.isArray(c.eras) && Array.isArray(c.turns) && [...c.eras, ...c.turns].every((x) => x && typeof x === "object" && Array.isArray(x.f)) ? { eras: c.eras.slice(-12), turns: c.turns.slice(-12) } : null);

/**
 * A save checked before anything uses it: the game it describes, or null when it is not one.
 * isProvince(id) and isCountry(code) answer for the map. Parts that do not fit the map are dropped, not trusted.
 */
export function checkSave(s, isProvince, isCountry) {
  if (!s || typeof s !== "object" || s.v !== 1 || typeof s.player !== "string") return null;
  if (!(isCountry(s.player) || s.custom?.code === s.player) || !MODES[s.mode]) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date || "") || !Number.isInteger(s.turn) || s.turn < 1 || typeof s.seed !== "string") return null;
  const known = (c) => isCountry(c) || c === s.custom?.code, list = (v) => (Array.isArray(v) ? v : []);
  const owners = Object.fromEntries(Object.entries(s.owners && typeof s.owners === "object" ? s.owners : {}).filter(([id, c]) => isProvince(id) && known(c)));
  const council = s.council && typeof s.council === "object" && s.council.seats && typeof s.council.seats === "object" ? { trusted: null, ...s.council, former: list(s.council.former) } : null;
  const log = list(s.log).filter((t) => t && typeof t === "object"), word = Object.fromEntries(Object.entries(s.word && typeof s.word === "object" ? s.word : {}).filter(([c, d]) => known(c) && DATE.test(d || "")));
  const dated = (v) => Object.fromEntries(Object.entries(v && typeof v === "object" ? v : {}).filter(([p, d]) => pairOk(p, known) && DATE.test(d || "")));
  const land = (v) => (v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([id, c]) => isProvince(id) && known(c))) : null);
  const offers = list(s.offers).filter((o, i, all) => o && known(o.from) && typeof o.kind === "string" && DATE.test(o.date || "") && all.findIndex((x) => x && x.from === o.from && x.kind === o.kind) === i);
  return mendGame({ ...s, owners, log, wars: list(s.wars), treaties: list(s.treaties), offers, chats: list(s.chats), counsel: list(s.counsel), facts: list(s.facts), edits: list(s.edits), council, actions: list(s.actions).filter((a) => typeof a === "string"), orders: keepOrders(s.orders, isProvince, known),
    rel: keepRel(s.rel, known), word, truce: dated(s.truce), ...keepMemory(s, known), start: land(s.start) || startOf({ ...s, owners }), branch: Number.isInteger(s.branch) && s.branch > 0 ? s.branch : 0, chron: keepChron(s.chron) || chronicleFrom(log, s.turn) });
}

// A take-back record is the game without its log (the log only grows; the record keeps its length), so twenty of
// them cost about what one whole copy used to. Each says what it takes back.
export const snapGame = (g, why) => { const { log, ...rest } = g; return { ...structuredClone(rest), logLength: log.length, why }; };
/** The game a record stands for, given the log as it is now. */
// The log keeps at most sixty turns, so its length alone cannot say where a record ends: turns carry their number.
export const restoreGame = (rec, log) => { const { logLength, why, ...rest } = rec; void why; return mendGame({ ...rest, log: log.every((t) => t.turn) ? log.filter((t) => t.turn < rest.turn) : log.slice(0, logLength) }); };
/**
 * Take a game back to a record. When a turn being taken back had a check settled in it (an attack), the game moves
 * to a new numbered line: every later check draws fresh numbers, so a roll that was seen cannot be planned around,
 * and the chronicle says the turn was played again. The line number never goes down.
 */
export function takeBack(g, rec) {
  const back = restoreGame(rec, g.log), settled = g.log.some((t) => !back.log.includes(t) && (t.receipt || []).some((x) => x.check));
  return { ...back, branch: (g.branch || 0) + (settled ? 1 : 0), retold: g.retold || 0 };
}
/** Take-back records from a save, the malformed ones left out. */
export const keptRecords = (k) => (Array.isArray(k?.past) ? k.past.filter((r) => r && typeof r === "object" && Number.isInteger(r.logLength)).slice(-20) : []);
