// SPDX-License-Identifier: AGPL-3.0-or-later
// Keeping a game small enough to keep (Phase 4, storage that cannot silently fill). Rules only: no page, no clock.
// A browser gives one site about five million characters, shared by every game and scenario kept there. So:
//   always: a take-back record leaves out chats and counsel (what was said stays said), which is most of its weight;
//   at half the room: the player is warned, and offered a file;
//   at three quarters: the game is made smaller (step 1): turns older than the newest 20 are kept in short (what
//     the rules decided, the one-sentence summary, the actions), take-backs fall from 20 to 5, each chat keeps its
//     newest 30 messages;
//   if the browser still refuses: step 2 (6 whole turns, 1 take-back, 10 messages a chat), and if it refuses again
//     the page says so and stays saying so until a save works. Nothing is lost quietly.
// The chronicle, people, threads and every mission and attack record are never shortened.

export const ROOM = { allow: 5000000, warn: 50, tight: 75 };
export const STEPS = [{ past: 20, whole: 60, chat: 60 }, { past: 5, whole: 20, chat: 30 }, { past: 1, whole: 6, chat: 10 }];

/** A take-back record without what a turn cannot change back. */
export const slim = (rec) => { const { chats, counsel, ...rest } = rec; void chats; void counsel; return rest; };
/** A slim record made whole again, with the words as they now stand. */
export const fatten = (rec, g) => ({ ...rec, chats: rec.chats ?? g.chats, counsel: rec.counsel ?? g.counsel });

const clip = (s, n) => { const t = String(s || ""); return t.length > n ? `${t.slice(0, n - 3)}...` : t; };
/** One turn in short: what the rules decided and how it was summed up. `short` counts the events and papers let go. */
export const shortTurn = (t) => (t.short ? t : {
  turn: t.turn, from: t.from, to: t.to, actions: (t.actions || []).map((a) => clip(a, 120)), events: [], news: [], dropped: [], summary: t.summary || "",
  receipt: (t.receipt || []).filter((x) => x.fact || x.check || x.mission), ...(t.told ? { told: t.told } : {}), ...(t.branch ? { branch: t.branch } : {}), short: [(t.events || []).length, (t.news || []).length],
});

/** How full the browser's room is with a save of `size` characters and `other` characters kept besides: {pc, warn, step}. */
export function pressure(size, other = 0, allow = ROOM.allow) {
  const pc = Math.floor((size + other) * 100 / allow);
  return { pc, warn: pc >= ROOM.warn, step: pc >= ROOM.tight ? 1 : 0 };
}

/** Make a game smaller, to step 1 or 2. Changes g; returns the take-backs kept and what was let go, in whole numbers. */
export function compact(g, past, step) {
  const s = STEPS[step], cut = g.log.length - s.whole;
  let turns = 0, said = 0;
  g.log = g.log.map((t, i) => (i < cut && !t.short ? (turns++, shortTurn(t)) : t));
  for (const c of g.chats || []) { said += Math.max(0, c.messages.length - s.chat); c.messages = c.messages.slice(-s.chat); }
  return { past: past.slice(-s.past), turns, said, undone: Math.max(0, past.length - s.past) };
}
/** What a step let go, in one sentence, or "" when it let nothing go. */
export function compactNote(c) {
  const parts = [c.turns && `${c.turns} older turn${c.turns > 1 ? "s are" : " is"} now kept in short`, c.undone && `${c.undone} take-back${c.undone > 1 ? "s" : ""} let go`, c.said && `${c.said} old chat message${c.said > 1 ? "s" : ""} let go`].filter(Boolean);
  return parts.length ? `To make room in this browser: ${parts.join(", ")}. The chronicle and every record of the rules are whole.` : "";
}

/** A size in plain words: "182 kB", "2.4 MB". */
export const sizeWords = (n) => (n >= 1000000 ? `${Math.floor(n / 100000) / 10} MB` : `${Math.max(1, Math.round(n / 1000))} kB`);
