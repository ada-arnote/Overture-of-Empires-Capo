// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo's saves: what a game holds, how a save from the browser or a file is checked before use, and the small
// take-back records that stand in for whole copies.
import { MODES } from "./turn.js";
import { STANDING } from "./talk.js";
import { APPROACHES } from "./worldrules.js";
import { RULES } from "./check.js";

// Older games are converted, never refused: nothing they hold needs the old rule, their turns keep the receipts
// they had, and every attack from the next turn on is made under these rules.
/** The plain words for a game converted from older rules, or "" when it needs none. */
export const convertNote = (s) => (s && typeof s === "object" && s.rules !== RULES ? "This game was saved under older rules. It has been brought up to date: its past turns keep the results they had, and attacks from now on show their odds and use a commander." : "");

/** A game saved before some part existed gets that part empty. */
export const mendGame = (s) => ({ wars: [], treaties: [], offers: [], chats: [], counsel: [], council: null, standing: STANDING[s.mode] || 5, facts: [], might: {}, edits: [], sandbox: false, orders: [], ...s, rules: RULES });
/** The player's attack orders, each tied to the action that asked for it: {text, target, seat, approach}. */
const keepOrders = (v, isProvince) => (Array.isArray(v) ? v : []).filter((o) => o && typeof o.text === "string" && typeof o.target === "string" && isProvince(o.target))
  .map((o) => ({ text: o.text, target: o.target, seat: typeof o.seat === "string" ? o.seat : "", approach: APPROACHES[o.approach] ? o.approach : "steady" }));

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
  return mendGame({ ...s, owners, log: list(s.log), wars: list(s.wars), treaties: list(s.treaties), offers: list(s.offers), chats: list(s.chats), counsel: list(s.counsel), facts: list(s.facts), edits: list(s.edits), council, actions: list(s.actions).filter((a) => typeof a === "string"), orders: keepOrders(s.orders, isProvince) });
}

// A take-back record is the game without its log (the log only grows; the record keeps its length), so twenty of
// them cost about what one whole copy used to. Each says what it takes back.
export const snapGame = (g, why) => { const { log, ...rest } = g; return { ...structuredClone(rest), logLength: log.length, why }; };
/** The game a record stands for, given the log as it is now. */
export const restoreGame = (rec, log) => { const { logLength, why, ...rest } = rec; void why; return mendGame({ ...rest, log: log.slice(0, logLength) }); };
/** Take-back records from a save, the malformed ones left out. */
export const keptRecords = (k) => (Array.isArray(k?.past) ? k.past.filter((r) => r && typeof r === "object" && Number.isInteger(r.logLength)).slice(-20) : []);
